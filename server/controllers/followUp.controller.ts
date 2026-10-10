import { Response } from 'express';
import { db, FollowUpActivity, Transaction } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import {
  calculateDaysSinceContact,
  determineFollowUpCategory,
  computeNextFollowUp,
  getTodayDateString,
} from '../services/followUpEngine.js';
import { logAudit } from '../services/auditLogger.js';

export function getDashboardStats(req: AuthenticatedRequest, res: Response) {
  const state = db.getState();
  let customers = state.customers.filter(c => c.deleted_at === null);
  let transactions = [...(state.transactions || [])];

  // SALES role data scoping: strictly filter to self
  if (req.user?.role === 'SALES') {
    customers = customers.filter(c => c.assigned_sales_id === req.user!.id);
    transactions = transactions.filter(t => t.sales_id === req.user!.id);
  }

  const today = getTodayDateString();
  const currentMonth = today.substring(0, 7);

  let totalCustomers = customers.length;
  let dueTodayCount = 0;
  let overdueCount = 0;
  let upcomingCount = 0;
  let completedCount = 0;
  let newCustomersCount = 0;

  // Customer status summary by standard codes
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
    const statusObj = state.customer_statuses.find(s => s.id === c.status_id);
    const fuStatus = determineFollowUpCategory(c.next_follow_up_date, statusObj?.code);
    const daysSince = calculateDaysSinceContact(c.last_contact_date);
    const salesUser = state.users.find(u => u.id === c.assigned_sales_id);

    const enriched = {
      ...c,
      status: statusObj,
      sales: salesUser ? { id: salesUser.id, name: salesUser.name } : null,
      fu_status: fuStatus,
      days_since_contact: daysSince,
    };

    const code = statusObj?.code || 'PROSPEK';
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

  // Sort priorities: Overdue first, then Due Today
  overdueList.sort((a, b) => (a.next_follow_up_date > b.next_follow_up_date ? 1 : -1));
  dueTodayList.sort((a, b) => b.days_since_contact - a.days_since_contact);
  upcomingList.sort((a, b) => (a.next_follow_up_date > b.next_follow_up_date ? 1 : -1));

  // Omzet summary calculations (CLOSING only, Cancel excluded!)
  const closings = transactions.filter(t => t.status === 'CLOSING');
  const totalOmzet = closings.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const omzetToday = closings
    .filter(t => t.transaction_date === today)
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const omzetThisMonth = closings
    .filter(t => t.transaction_date.startsWith(currentMonth))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // Omzet by sales (for Admin, or self for Sales)
  const salesUsers = state.users.filter(u => u.role === 'SALES');
  const omzetBySales = salesUsers.map(u => {
    const userClosings = (state.transactions || []).filter(t => t.sales_id === u.id && t.status === 'CLOSING');
    return {
      sales_id: u.id,
      sales_name: u.name,
      omzet: userClosings.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
      closing_count: userClosings.length,
    };
  });

  res.json({
    success: true,
    data: {
      stats: {
        total_customers: totalCustomers,
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
        cancel_count: transactions.filter(t => t.status === 'CANCEL').length,
        cancel_amount: transactions.filter(t => t.status === 'CANCEL').reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
        by_sales: omzetBySales,
      },
      priority_action_list: {
        overdue: overdueList.slice(0, 10),
        due_today: dueTodayList.slice(0, 10),
        upcoming: upcomingList.slice(0, 5),
      },
    },
  });
}

export function logActivity(req: AuthenticatedRequest, res: Response) {
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

  const state = db.getState();
  const customer = state.customers.find(c => c.id === parseInt(customer_id, 10));

  if (!customer) {
    res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
    return;
  }

  // Permissions check for SALES: cannot log activity for another sales' customer
  if (req.user?.role === 'SALES' && customer.assigned_sales_id !== req.user.id) {
    res.status(403).json({ success: false, message: 'Akses ditolak: Customer bukan milik Anda.' });
    return;
  }

  const today = getTodayDateString();
  const now = new Date().toISOString();
  const previousNextDate = customer.next_follow_up_date;

  // Compute next follow up
  let finalNextDate = custom_next_date;
  let targetStep = customer.current_rule_step || 1;

  if (!finalNextDate) {
    const computed = computeNextFollowUp(customer, Boolean(advance_step));
    finalNextDate = computed.nextDate;
    targetStep = computed.stepNumber;
  } else if (advance_step) {
    targetStep += 1;
  }

  // Create Activity
  const activityId = db.nextId('follow_up_activities');
  const activity: FollowUpActivity = {
    id: activityId,
    customer_id: customer.id,
    user_id: req.user!.id,
    activity_date: now,
    channel,
    template_id: template_id ? parseInt(template_id, 10) : null,
    message_sent: message_sent || '',
    result_status,
    notes: notes || '',
    rule_step_executed: customer.current_rule_step,
    previous_follow_up_date: previousNextDate,
    next_follow_up_date: finalNextDate,
    created_at: now,
  };

  state.follow_up_activities.push(activity);

  // Update Customer dates & step
  customer.last_contact_date = today;
  customer.next_follow_up_date = finalNextDate;
  customer.current_rule_step = targetStep;

  if (new_status_id) {
    customer.status_id = parseInt(new_status_id, 10);
  }

  // If closing amount provided (Follow-up to Closing integration)
  let createdTransaction: Transaction | null = null;
  const numClosingAmount = Number(closing_amount);
  if (!isNaN(numClosingAmount) && numClosingAmount > 0) {
    const trxId = db.nextId('transactions');
    createdTransaction = {
      id: trxId,
      customer_id: customer.id,
      sales_id: customer.assigned_sales_id,
      transaction_date: today,
      product: closing_product ? String(closing_product).trim() : 'Pesanan Konveksi',
      description: `Closing dari follow-up (${result_status})`,
      amount: numClosingAmount,
      status: 'CLOSING',
      notes: closing_notes || notes || '',
      created_at: now,
      updated_at: now,
    };
    if (!state.transactions) state.transactions = [];
    state.transactions.push(createdTransaction);

    // Auto-update customer status to CLOSING if not already
    const closingStatus = state.customer_statuses.find(s => s.code === 'CLOSING');
    if (closingStatus) {
      customer.status_id = closingStatus.id;
    }
  }

  customer.updated_at = now;
  db.save();

  logAudit({
    userId: req.user?.id,
    userName: req.user?.name,
    action: 'LOG_FOLLOW_UP',
    entity: 'FOLLOW_UP',
    entityId: activity.id,
    newData: {
      customer_id: customer.id,
      customer_name: customer.name,
      channel,
      result_status,
      next_follow_up_date: finalNextDate,
      closing_recorded: createdTransaction ? createdTransaction.amount : null,
    },
  });

  res.status(201).json({
    success: true,
    message: createdTransaction
      ? `Follow-up berhasil dicatat & Closing Rp ${createdTransaction.amount.toLocaleString('id-ID')} tersimpan!`
      : 'Aktivitas follow-up berhasil dicatat & jadwal berikutnya diperbarui.',
    data: {
      activity,
      customer,
      transaction: createdTransaction,
    },
  });
}

export function getCustomerActivities(req: AuthenticatedRequest, res: Response) {
  const customerId = parseInt(req.params.customerId, 10);
  const state = db.getState();

  const customer = state.customers.find(c => c.id === customerId);
  if (!customer) {
    res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
    return;
  }

  // Security check for SALES
  if (req.user?.role === 'SALES' && customer.assigned_sales_id !== req.user.id) {
    res.status(403).json({ success: false, message: 'Akses ditolak.' });
    return;
  }

  const activities = state.follow_up_activities
    .filter(a => a.customer_id === customerId)
    .map(a => {
      const u = state.users.find(usr => usr.id === a.user_id);
      const t = state.whatsapp_templates.find(tpl => tpl.id === a.template_id);
      return {
        ...a,
        user_name: u?.name || 'Sales Staff',
        template_name: t?.title || null,
      };
    })
    .sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime());

  res.json({
    success: true,
    data: activities,
  });
}
