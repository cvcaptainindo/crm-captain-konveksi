import { Response } from 'express';
import { pool, withTransaction, FollowUpActivity, Transaction } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import {
  calculateDaysSinceContact,
  determineFollowUpCategory,
  computeCustomerNextFollowUp,
  getTodayDateString,
} from '../services/followUpEngine.js';
import { logAudit } from '../services/auditLogger.js';

export async function getDashboardStats(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const isSales = req.user?.role === 'SALES';
    const salesFilterSql = isSales ? 'AND c.assigned_sales_id = ?' : '';
    const salesParams = isSales ? [req.user!.id] : [];

    const today = getTodayDateString();
    const currentMonth = today.substring(0, 7);

    // 1. Fetch active customers with statuses and assigned sales
    const custSql = `
      SELECT 
        c.*,
        s.code AS status_code, s.label AS status_label, s.color_code AS status_color_code,
        u.name AS sales_name
      FROM customers c
      JOIN customer_statuses s ON c.status_id = s.id
      LEFT JOIN users u ON c.assigned_sales_id = u.id
      WHERE c.deleted_at IS NULL ${salesFilterSql}
    `;

    const [customers] = await pool.query<any[]>(custSql, salesParams);

    let dueTodayCount = 0;
    let overdueCount = 0;
    let upcomingCount = 0;
    let completedCount = 0;
    let newCustomersCount = 0;

    const customerSummary = {
      total: customers.length,
      prospek: 0,
      follow_up: 0,
      negosiasi: 0,
      closing: 0,
      cancel: 0,
      inactive: 0,
    };

    const overdueList: any[] = [];
    const dueTodayList: any[] = [];
    const upcomingList: any[] = [];

    customers.forEach(c => {
      const fuStatus = determineFollowUpCategory(c.next_follow_up_date, c.status_code);
      const daysSince = calculateDaysSinceContact(c.last_contact_date);

      const enriched = {
        ...c,
        status: { id: c.status_id, code: c.status_code, label: c.status_label, color_code: c.status_color_code },
        sales: c.assigned_sales_id ? { id: c.assigned_sales_id, name: c.sales_name } : null,
        fu_status: fuStatus,
        days_since_contact: daysSince,
      };

      const code = c.status_code || 'PROSPEK';
      if (code === 'PROSPEK' || code === 'NEW') {
        newCustomersCount++;
        customerSummary.prospek++;
      } else if (code === 'FOLLOW_UP') {
        customerSummary.follow_up++;
      } else if (code === 'NEGOSIASI' || code === 'WAITING') {
        customerSummary.negosiasi++;
      } else if (code === 'CLOSING' || code === 'CUSTOMER') {
        customerSummary.closing++;
      } else if (code === 'CANCEL' || code === 'LOST') {
        customerSummary.cancel++;
      } else if (code === 'INACTIVE') {
        customerSummary.inactive++;
      }

      if (fuStatus === 'OVERDUE') {
        overdueCount++;
        overdueList.push(enriched);
      } else if (fuStatus === 'DUE_TODAY') {
        dueTodayCount++;
        dueTodayList.push(enriched);
      } else if (fuStatus === 'UPCOMING') {
        upcomingCount++;
        upcomingList.push(enriched);
      } else if (fuStatus === 'COMPLETED') {
        completedCount++;
      }
    });

    // Sort priorities
    overdueList.sort((a, b) => ((a.next_follow_up_date || '') > (b.next_follow_up_date || '') ? 1 : -1));
    dueTodayList.sort((a, b) => b.days_since_contact - a.days_since_contact);
    upcomingList.sort((a, b) => ((a.next_follow_up_date || '') > (b.next_follow_up_date || '') ? 1 : -1));

    // 2. Fetch Transactions & Omzet
    const trxFilterSql = isSales ? 'WHERE sales_id = ?' : '';
    const trxParams = isSales ? [req.user!.id] : [];

    const [transactions] = await pool.query<any[]>(
      `SELECT * FROM transactions ${trxFilterSql}`,
      trxParams
    );

    const closings = transactions.filter((t: any) => t.status === 'CLOSING');
    const totalOmzet = closings.reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
    const omzetToday = closings
      .filter((t: any) => t.transaction_date === today)
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
    const omzetThisMonth = closings
      .filter((t: any) => String(t.transaction_date).startsWith(currentMonth))
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);

    const cancelTrx = transactions.filter((t: any) => t.status === 'CANCEL');
    const cancelCount = cancelTrx.length;
    const cancelAmount = cancelTrx.reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);

    // 3. Omzet by sales breakdown
    let omzetBySales: any[] = [];
    if (!isSales) {
      const [salesUsers] = await pool.query<any[]>(
        `SELECT 
          u.id AS sales_id, u.name AS sales_name,
          COALESCE(SUM(CASE WHEN t.status = 'CLOSING' THEN t.amount ELSE 0 END), 0) AS omzet,
          COUNT(CASE WHEN t.status = 'CLOSING' THEN 1 END) AS closing_count
         FROM users u
         LEFT JOIN transactions t ON t.sales_id = u.id
         WHERE u.role = 'SALES'
         GROUP BY u.id
         ORDER BY omzet DESC`
      );
      omzetBySales = salesUsers.map(s => ({
        sales_id: s.sales_id,
        sales_name: s.sales_name,
        omzet: Number(s.omzet) || 0,
        closing_count: Number(s.closing_count) || 0,
      }));
    } else {
      omzetBySales = [
        {
          sales_id: req.user!.id,
          sales_name: req.user!.name,
          omzet: totalOmzet,
          closing_count: closings.length,
        },
      ];
    }

    res.json({
      success: true,
      data: {
        stats: {
          total_customers: customers.length,
          due_today: dueTodayCount,
          overdue: overdueCount,
          upcoming: upcomingCount,
          completed: completedCount,
          new_customers: newCustomersCount,
        },
        customer_summary: customerSummary,
        omzet_summary: {
          total_omzet: totalOmzet,
          omzet_this_month: omzetThisMonth,
          omzet_today: omzetToday,
          closing_count: closings.length,
          cancel_count: cancelCount,
          cancel_amount: cancelAmount,
          by_sales: omzetBySales,
        },
        priority_action_list: {
          overdue: overdueList.slice(0, 10),
          due_today: dueTodayList.slice(0, 10),
          upcoming: upcomingList.slice(0, 5),
        },
      },
    });
  } catch (err: any) {
    console.error('[FollowUp getDashboardStats error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat statistik dashboard.' });
  }
}

export async function logActivity(req: AuthenticatedRequest, res: Response): Promise<void> {
  const {
    customer_id,
    channel = 'WHATSAPP',
    template_id,
    message_sent,
    result_status,
    notes,
    new_status_id,
    custom_next_date,
    advance_step = true,
    closing_amount,
    closing_product,
    closing_notes,
  } = req.body;

  if (!customer_id || !result_status) {
    res.status(400).json({ success: false, message: 'Customer ID dan status hasil follow-up wajib diisi.' });
    return;
  }

  try {
    const custId = parseInt(customer_id, 10);
    const [cRows] = await pool.query<any[]>('SELECT * FROM customers WHERE id = ? LIMIT 1', [custId]);

    if (!cRows || cRows.length === 0) {
      res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
      return;
    }

    const customer = cRows[0];

    // Permissions check for SALES: cannot log activity for another sales' customer
    if (req.user?.role === 'SALES' && customer.assigned_sales_id !== req.user.id) {
      res.status(403).json({ success: false, message: 'Akses ditolak: Customer bukan milik Anda.' });
      return;
    }

    const today = getTodayDateString();
    const previousNextDate = customer.next_follow_up_date;

    // Compute next follow up
    let finalNextDate = custom_next_date;
    let targetStep = customer.current_rule_step || 1;

    if (!finalNextDate) {
      const computed = await computeCustomerNextFollowUp(customer, Boolean(advance_step));
      finalNextDate = computed.nextDate;
      targetStep = computed.stepNumber;
    } else if (advance_step) {
      targetStep += 1;
    }

    const numClosingAmount = Number(closing_amount);
    const hasClosing = !isNaN(numClosingAmount) && numClosingAmount > 0;

    const result = await withTransaction(async (conn) => {
      // 1. Insert Activity
      const [actRes] = await conn.execute<any>(
        `INSERT INTO follow_up_activities (
          customer_id, user_id, activity_date, channel, template_id,
          message_sent, result_status, notes, rule_step_executed,
          previous_follow_up_date, next_follow_up_date, created_at
        ) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          customer.id,
          req.user!.id,
          channel,
          template_id ? parseInt(template_id, 10) : null,
          message_sent || '',
          result_status,
          notes || '',
          customer.current_rule_step,
          previousNextDate,
          finalNextDate,
        ]
      );
      const activityId = actRes.insertId;

      // 2. Determine target status
      let targetStatusId = customer.status_id;
      if (new_status_id) {
        targetStatusId = parseInt(new_status_id, 10);
      }

      let createdTransaction: any = null;
      if (hasClosing) {
        // Record closing transaction
        const [trxRes] = await conn.execute<any>(
          `INSERT INTO transactions (
            customer_id, sales_id, transaction_date, product, description,
            amount, status, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'CLOSING', ?, NOW(), NOW())`,
          [
            customer.id,
            customer.assigned_sales_id,
            today,
            closing_product ? String(closing_product).trim() : 'Pesanan Konveksi',
            `Closing dari follow-up (${result_status})`,
            numClosingAmount,
            closing_notes || notes || '',
          ]
        );

        createdTransaction = {
          id: trxRes.insertId,
          customer_id: customer.id,
          sales_id: customer.assigned_sales_id,
          transaction_date: today,
          amount: numClosingAmount,
          status: 'CLOSING',
        };

        // Auto update customer status to CLOSING status id
        const [closingStatus] = await conn.query<any[]>(
          'SELECT id FROM customer_statuses WHERE code = "CLOSING" LIMIT 1'
        );
        if (closingStatus && closingStatus.length > 0) {
          targetStatusId = closingStatus[0].id;
        }
      }

      // 3. Update customer
      await conn.execute(
        `UPDATE customers SET
          last_contact_date = ?, next_follow_up_date = ?, current_rule_step = ?,
          status_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [today, finalNextDate, targetStep, targetStatusId, customer.id]
      );

      return { activityId, createdTransaction, finalNextDate };
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: 'LOG_FOLLOW_UP',
      entity: 'FOLLOW_UP',
      entityId: result.activityId,
      newData: {
        customer_id: customer.id,
        customer_name: customer.name,
        channel,
        result_status,
        next_follow_up_date: result.finalNextDate,
        closing_recorded: result.createdTransaction ? result.createdTransaction.amount : null,
      },
    });

    const [updatedCust] = await pool.query<any[]>('SELECT * FROM customers WHERE id = ?', [customer.id]);
    const [createdAct] = await pool.query<any[]>('SELECT * FROM follow_up_activities WHERE id = ?', [result.activityId]);

    res.status(201).json({
      success: true,
      message: result.createdTransaction
        ? `Follow-up berhasil dicatat & Closing Rp ${result.createdTransaction.amount.toLocaleString('id-ID')} tersimpan!`
        : 'Aktivitas follow-up berhasil dicatat & jadwal berikutnya diperbarui.',
      data: {
        activity: createdAct[0],
        customer: updatedCust[0],
        transaction: result.createdTransaction,
      },
    });
  } catch (err: any) {
    console.error('[FollowUp logActivity error]', err);
    res.status(500).json({ success: false, message: 'Gagal mencatat aktivitas follow-up.' });
  }
}

export async function getCustomerActivities(req: AuthenticatedRequest, res: Response): Promise<void> {
  const customerId = parseInt(req.params.customerId, 10);

  try {
    const [cRows] = await pool.query<any[]>('SELECT id, assigned_sales_id FROM customers WHERE id = ? LIMIT 1', [customerId]);

    if (!cRows || cRows.length === 0) {
      res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
      return;
    }

    if (req.user?.role === 'SALES' && cRows[0].assigned_sales_id !== req.user.id) {
      res.status(403).json({ success: false, message: 'Akses ditolak.' });
      return;
    }

    const sql = `
      SELECT 
        a.*,
        u.name AS user_name,
        t.title AS template_name
      FROM follow_up_activities a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN whatsapp_templates t ON a.template_id = t.id
      WHERE a.customer_id = ?
      ORDER BY a.activity_date DESC
    `;

    const [activities] = await pool.query<any[]>(sql, [customerId]);

    res.json({
      success: true,
      data: activities,
    });
  } catch (err: any) {
    console.error('[FollowUp getCustomerActivities error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat histori follow-up.' });
  }
}
