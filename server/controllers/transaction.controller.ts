import { Response } from 'express';
import { db, Transaction } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { logAudit } from '../services/auditLogger.js';

export function getTransactions(req: AuthenticatedRequest, res: Response) {
  const {
    customer_id,
    sales_id,
    status,
    period = 'all',
    start_date,
    end_date,
    search,
  } = req.query;

  const state = db.getState();
  let list = [...(state.transactions || [])];

  // 1. Data Isolation: If user is SALES, restrict strictly to their assigned sales_id
  if (req.user?.role === 'SALES') {
    list = list.filter(t => t.sales_id === req.user!.id);
  } else if (sales_id && sales_id !== 'all') {
    list = list.filter(t => t.sales_id === parseInt(sales_id as string, 10));
  }

  // 2. Filter by Customer ID
  if (customer_id) {
    list = list.filter(t => t.customer_id === parseInt(customer_id as string, 10));
  }

  // 3. Filter by Status (CLOSING / CANCEL / all)
  if (status && status !== 'all') {
    list = list.filter(t => t.status === status);
  }

  // 4. Filter by Date / Period
  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();

  if (period === 'today') {
    list = list.filter(t => t.transaction_date === todayStr);
  } else if (period === 'this_week') {
    const dayOfWeek = now.getDay() || 7; // Monday = 1, Sunday = 7
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1);
    const mondayStr = monday.toISOString().split('T')[0];
    list = list.filter(t => t.transaction_date >= mondayStr && t.transaction_date <= todayStr);
  } else if (period === 'this_month') {
    const currentMonthPrefix = todayStr.substring(0, 7); // YYYY-MM
    list = list.filter(t => t.transaction_date.startsWith(currentMonthPrefix));
  } else if (period === 'custom' || (start_date && end_date)) {
    if (start_date) list = list.filter(t => t.transaction_date >= (start_date as string));
    if (end_date) list = list.filter(t => t.transaction_date <= (end_date as string));
  }

  // 5. Search
  if (search && typeof search === 'string' && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    list = list.filter(t => {
      const cust = state.customers.find(c => c.id === t.customer_id);
      return (
        t.product.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (cust && cust.name.toLowerCase().includes(q)) ||
        (cust && cust.company_name && cust.company_name.toLowerCase().includes(q))
      );
    });
  }

  // Sort: newest transaction date first
  list.sort((a, b) => (b.transaction_date > a.transaction_date ? 1 : -1));

  // Enrich with customer and sales details
  const enriched = list.map(t => {
    const cust = state.customers.find(c => c.id === t.customer_id);
    const salesUser = state.users.find(u => u.id === t.sales_id);
    return {
      ...t,
      customer_name: cust?.name || 'Customer Terhapus',
      company_name: cust?.company_name || '-',
      whatsapp_number: cust?.whatsapp_number || '-',
      sales_name: salesUser?.name || 'Sales Staff',
    };
  });

  // Calculate Accurate Backend Omzet Totals:
  // RULE: Only status === 'CLOSING' counts into omzet! CANCEL is excluded.
  const closingTransactions = list.filter(t => t.status === 'CLOSING');
  const cancelTransactions = list.filter(t => t.status === 'CANCEL');

  const totalOmzet = closingTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalCancelAmount = cancelTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  res.json({
    success: true,
    data: enriched,
    summary: {
      total_omzet: totalOmzet,
      total_closing_count: closingTransactions.length,
      total_cancel_count: cancelTransactions.length,
      total_cancel_amount: totalCancelAmount,
    },
  });
}

export function createTransaction(req: AuthenticatedRequest, res: Response) {
  const {
    customer_id,
    product,
    description,
    amount,
    status = 'CLOSING',
    transaction_date,
    notes,
    update_customer_status = true,
  } = req.body;

  if (!customer_id || !product || amount === undefined) {
    res.status(400).json({ success: false, message: 'Customer, nama produk, dan nominal transaksi wajib diisi.' });
    return;
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount < 0) {
    res.status(400).json({ success: false, message: 'Nominal transaksi harus berupa angka positif.' });
    return;
  }

  const state = db.getState();
  const customer = state.customers.find(c => c.id === parseInt(customer_id, 10));

  if (!customer) {
    res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
    return;
  }

  // Security Check: Sales can ONLY record transaction for their own customer
  if (req.user?.role === 'SALES' && customer.assigned_sales_id !== req.user.id) {
    res.status(403).json({ success: false, message: 'Akses ditolak: Customer bukan milik Anda.' });
    return;
  }

  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];
  const finalDate = transaction_date || today;
  const id = db.nextId('transactions');

  const newTrx: Transaction = {
    id,
    customer_id: customer.id,
    sales_id: customer.assigned_sales_id,
    transaction_date: finalDate,
    product: product.trim(),
    description: description ? description.trim() : '',
    amount: numericAmount,
    status: status === 'CANCEL' ? 'CANCEL' : 'CLOSING',
    notes: notes ? notes.trim() : '',
    created_at: now,
    updated_at: now,
  };

  if (!state.transactions) state.transactions = [];
  state.transactions.push(newTrx);

  // If status is CLOSING and update_customer_status requested, update customer status to CLOSING
  if (update_customer_status) {
    const targetStatus = state.customer_statuses.find(s => s.code === newTrx.status);
    if (targetStatus) {
      customer.status_id = targetStatus.id;
      customer.updated_at = now;
    }
  }

  db.save();

  logAudit({
    userId: req.user?.id,
    userName: req.user?.name,
    action: `CREATE_TRANSACTION_${newTrx.status}`,
    entity: 'TRANSACTION',
    entityId: newTrx.id,
    newData: {
      id: newTrx.id,
      customer_id: newTrx.customer_id,
      amount: newTrx.amount,
      status: newTrx.status,
      product: newTrx.product,
    },
  });

  res.status(201).json({
    success: true,
    message: newTrx.status === 'CLOSING'
      ? `Transaksi closing senilai Rp ${newTrx.amount.toLocaleString('id-ID')} berhasil dicatat!`
      : 'Transaksi pembatalan/cancel berhasil dicatat.',
    data: newTrx,
  });
}

export function updateTransaction(req: AuthenticatedRequest, res: Response) {
  const trxId = parseInt(req.params.id, 10);
  const state = db.getState();
  const trx = (state.transactions || []).find(t => t.id === trxId);

  if (!trx) {
    res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    return;
  }

  // Security: Sales can only edit transactions they own
  if (req.user?.role === 'SALES' && trx.sales_id !== req.user.id) {
    res.status(403).json({ success: false, message: 'Akses ditolak.' });
    return;
  }

  const { product, description, amount, status, transaction_date, notes } = req.body;
  const oldData = { ...trx };

  if (product) trx.product = product.trim();
  if (description !== undefined) trx.description = description ? description.trim() : '';
  if (amount !== undefined) {
    const num = Number(amount);
    if (!isNaN(num) && num >= 0) trx.amount = num;
  }
  if (status && (status === 'CLOSING' || status === 'CANCEL')) trx.status = status;
  if (transaction_date) trx.transaction_date = transaction_date;
  if (notes !== undefined) trx.notes = notes;
  trx.updated_at = new Date().toISOString();

  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'UPDATE_TRANSACTION',
    entity: 'TRANSACTION',
    entityId: trx.id,
    oldData,
    newData: trx,
  });

  res.json({
    success: true,
    message: 'Transaksi berhasil diperbarui.',
    data: trx,
  });
}

export function deleteTransaction(req: AuthenticatedRequest, res: Response) {
  const trxId = parseInt(req.params.id, 10);
  const state = db.getState();
  const index = (state.transactions || []).findIndex(t => t.id === trxId);

  if (index === -1) {
    res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    return;
  }

  const removed = state.transactions.splice(index, 1)[0];
  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'DELETE_TRANSACTION',
    entity: 'TRANSACTION',
    entityId: trxId,
    oldData: removed,
  });

  res.json({
    success: true,
    message: 'Transaksi berhasil dihapus.',
  });
}

/**
 * Overview statistics endpoint for Dashboard & Print Report
 */
export function getOmzetOverview(req: AuthenticatedRequest, res: Response) {
  const state = db.getState();
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonth = todayStr.substring(0, 7);

  let customers = state.customers.filter(c => c.deleted_at === null);
  let transactions = [...(state.transactions || [])];

  if (req.user?.role === 'SALES') {
    customers = customers.filter(c => c.assigned_sales_id === req.user!.id);
    transactions = transactions.filter(t => t.sales_id === req.user!.id);
  }

  // 1. Customer summary by standard status codes
  const customerSummary = {
    total: customers.length,
    prospek: 0,
    follow_up: 0,
    negosiasi: 0,
    closing: 0,
    cancel: 0,
    inactive: 0,
  };

  customers.forEach(c => {
    const s = state.customer_statuses.find(st => st.id === c.status_id);
    const code = s?.code || 'PROSPEK';
    if (code === 'PROSPEK' || code === 'NEW') customerSummary.prospek++;
    else if (code === 'FOLLOW_UP') customerSummary.follow_up++;
    else if (code === 'NEGOSIASI' || code === 'WAITING') customerSummary.negosiasi++;
    else if (code === 'CLOSING' || code === 'CUSTOMER') customerSummary.closing++;
    else if (code === 'CANCEL' || code === 'LOST') customerSummary.cancel++;
    else if (code === 'INACTIVE') customerSummary.inactive++;
  });

  // 2. Omzet calculations (CLOSING only)
  const closings = transactions.filter(t => t.status === 'CLOSING');
  const totalOmzet = closings.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const omzetToday = closings
    .filter(t => t.transaction_date === todayStr)
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const omzetThisMonth = closings
    .filter(t => t.transaction_date.startsWith(currentMonth))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // 3. Omzet by Sales breakdown
  const salesUsers = state.users.filter(u => u.role === 'SALES');
  const omzetBySales = salesUsers.map(u => {
    const userClosings = (state.transactions || []).filter(t => t.sales_id === u.id && t.status === 'CLOSING');
    const sumAmount = userClosings.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    return {
      sales_id: u.id,
      sales_name: u.name,
      omzet: sumAmount,
      closing_count: userClosings.length,
    };
  });

  res.json({
    success: true,
    data: {
      customer_summary: customerSummary,
      omzet_summary: {
        total_omzet: totalOmzet,
        closing_count: closings.length,
        cancel_count: transactions.filter(t => t.status === 'CANCEL').length,
        cancel_amount: transactions.filter(t => t.status === 'CANCEL').reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
        omzet_this_month: omzetThisMonth,
        omzet_today: omzetToday,
        by_sales: omzetBySales,
      },
    },
  });
}
