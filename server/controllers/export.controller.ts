import { Response } from 'express';
import { db } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { determineFollowUpCategory } from '../services/followUpEngine.js';
import { generateCustomerExport, generateActivityExport, generateTransactionExport } from '../services/exportService.js';
import { logAudit } from '../services/auditLogger.js';

export function exportCustomers(req: AuthenticatedRequest, res: Response) {
  const {
    format = 'xlsx',
    search,
    status_id,
    sales_id,
    fu_status,
  } = req.query;

  const state = db.getState();
  let list = state.customers.filter(c => c.deleted_at === null);

  // Scoping for SALES role
  if (req.user?.role === 'SALES') {
    list = list.filter(c => c.assigned_sales_id === req.user!.id);
  } else if (sales_id && sales_id !== 'all') {
    list = list.filter(c => c.assigned_sales_id === parseInt(sales_id as string, 10));
  }

  if (status_id && status_id !== 'all') {
    list = list.filter(c => c.status_id === parseInt(status_id as string, 10));
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    list = list.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (c.company_name && c.company_name.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        c.whatsapp_number.includes(q)
    );
  }

  if (fu_status && fu_status !== 'all') {
    list = list.filter(c => {
      const statusObj = state.customer_statuses.find(s => s.id === c.status_id);
      return determineFollowUpCategory(c.next_follow_up_date, statusObj?.code) === fu_status;
    });
  }

  const exportType = format === 'csv' ? 'csv' : 'xlsx';
  const { buffer, mimeType, filename } = generateCustomerExport(list, exportType);

  logAudit({
    userId: req.user?.id,
    action: 'EXPORT_CUSTOMERS',
    entity: 'CUSTOMER',
    newData: { count: list.length, format: exportType },
  });

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export function exportActivities(req: AuthenticatedRequest, res: Response) {
  const { format = 'xlsx', customer_id } = req.query;
  const state = db.getState();
  let list = [...state.follow_up_activities];

  if (req.user?.role === 'SALES') {
    const myCustomerIds = new Set(
      state.customers.filter(c => c.assigned_sales_id === req.user!.id).map(c => c.id)
    );
    list = list.filter(a => myCustomerIds.has(a.customer_id));
  }

  if (customer_id && customer_id !== 'all') {
    list = list.filter(a => a.customer_id === parseInt(customer_id as string, 10));
  }

  const exportType = format === 'csv' ? 'csv' : 'xlsx';
  const { buffer, mimeType, filename } = generateActivityExport(list, exportType);

  logAudit({
    userId: req.user?.id,
    action: 'EXPORT_ACTIVITIES',
    entity: 'FOLLOW_UP',
    newData: { count: list.length, format: exportType },
  });

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export function exportTransactions(req: AuthenticatedRequest, res: Response) {
  const { format = 'xlsx', sales_id, status, period, start_date, end_date } = req.query;
  const state = db.getState();
  let list = [...(state.transactions || [])];

  if (req.user?.role === 'SALES') {
    list = list.filter(t => t.sales_id === req.user!.id);
  } else if (sales_id && sales_id !== 'all') {
    list = list.filter(t => t.sales_id === parseInt(sales_id as string, 10));
  }

  if (status && status !== 'all') {
    list = list.filter(t => t.status === status);
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();

  if (period === 'today') {
    list = list.filter(t => t.transaction_date === todayStr);
  } else if (period === 'this_week') {
    const dayOfWeek = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1);
    const mondayStr = monday.toISOString().split('T')[0];
    list = list.filter(t => t.transaction_date >= mondayStr && t.transaction_date <= todayStr);
  } else if (period === 'this_month') {
    const currentMonthPrefix = todayStr.substring(0, 7);
    list = list.filter(t => t.transaction_date.startsWith(currentMonthPrefix));
  } else if (period === 'custom' || (start_date && end_date)) {
    if (start_date) list = list.filter(t => t.transaction_date >= (start_date as string));
    if (end_date) list = list.filter(t => t.transaction_date <= (end_date as string));
  }

  const exportType = format === 'csv' ? 'csv' : 'xlsx';
  const { buffer, mimeType, filename } = generateTransactionExport(list, exportType);

  logAudit({
    userId: req.user?.id,
    action: 'EXPORT_TRANSACTIONS',
    entity: 'TRANSACTION',
    newData: { count: list.length, format: exportType },
  });

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

