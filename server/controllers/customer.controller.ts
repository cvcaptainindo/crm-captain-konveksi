import { Response } from 'express';
import { db, Customer, CustomerCustomRule } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import {
  calculateDaysSinceContact,
  determineFollowUpCategory,
  computeNextFollowUp,
  getTodayDateString,
} from '../services/followUpEngine.js';
import { sanitizeWhatsAppPhone } from '../services/templateParser.js';
import { logAudit } from '../services/auditLogger.js';

export function getCustomers(req: AuthenticatedRequest, res: Response) {
  const {
    search,
    status_id,
    sales_id,
    fu_status,
    page = '1',
    limit = '15',
    sort_by = 'next_follow_up_date',
    sort_dir = 'asc',
  } = req.query;

  const state = db.getState();
  let list = state.customers.filter(c => c.deleted_at === null);

  // SALES role data scoping: if user is SALES, they only see their assigned customers
  // (Unless explicit sales_id filter or Admin override)
  if (req.user?.role === 'SALES') {
    list = list.filter(c => c.assigned_sales_id === req.user!.id);
  } else if (sales_id && sales_id !== 'all') {
    list = list.filter(c => c.assigned_sales_id === parseInt(sales_id as string, 10));
  }

  // Filter by customer status
  if (status_id && status_id !== 'all') {
    list = list.filter(c => c.status_id === parseInt(status_id as string, 10));
  }

  // Search filter (name, company, pic, city, wa)
  if (search && typeof search === 'string' && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    list = list.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (c.company_name && c.company_name.toLowerCase().includes(q)) ||
        (c.pic_name && c.pic_name.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        c.whatsapp_number.includes(q) ||
        (c.customer_code && c.customer_code.toLowerCase().includes(q))
    );
  }

  // Filter by follow-up status (OVERDUE, DUE_TODAY, UPCOMING, COMPLETED)
  const enrichedList = list.map(c => {
    const statusObj = state.customer_statuses.find(s => s.id === c.status_id);
    const fuStatus = determineFollowUpCategory(c.next_follow_up_date, statusObj?.code);
    const daysSinceContact = calculateDaysSinceContact(c.last_contact_date);
    const salesUser = state.users.find(u => u.id === c.assigned_sales_id);

    return {
      ...c,
      status: statusObj,
      sales: salesUser ? { id: salesUser.id, name: salesUser.name } : null,
      fu_status: fuStatus,
      days_since_contact: daysSinceContact,
    };
  });

  let filtered = enrichedList;
  if (fu_status && fu_status !== 'all') {
    filtered = enrichedList.filter(c => c.fu_status === fu_status);
  }

  // Sorting
  filtered.sort((a, b) => {
    let valA = (a as any)[sort_by as string];
    let valB = (b as any)[sort_by as string];

    if (!valA) valA = '';
    if (!valB) valB = '';

    if (valA < valB) return sort_dir === 'desc' ? 1 : -1;
    if (valA > valB) return sort_dir === 'desc' ? -1 : 1;
    return 0;
  });

  // Pagination
  const p = Math.max(1, parseInt(page as string, 10));
  const l = Math.max(1, parseInt(limit as string, 10));
  const total = filtered.length;
  const totalPages = Math.ceil(total / l);
  const paginated = filtered.slice((p - 1) * l, p * l);

  res.json({
    success: true,
    data: paginated,
    meta: {
      page: p,
      limit: l,
      total,
      total_pages: totalPages,
    },
  });
}

export function getCustomerById(req: AuthenticatedRequest, res: Response) {
  const customerId = parseInt(req.params.id, 10);
  const state = db.getState();
  const customer = state.customers.find(c => c.id === customerId);

  if (!customer) {
    res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
    return;
  }

  // Permission check for SALES
  if (req.user?.role === 'SALES' && customer.assigned_sales_id !== req.user.id) {
    res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke customer ini.' });
    return;
  }

  const statusObj = state.customer_statuses.find(s => s.id === customer.status_id);
  const salesUser = state.users.find(u => u.id === customer.assigned_sales_id);
  const fuStatus = determineFollowUpCategory(customer.next_follow_up_date, statusObj?.code);
  const daysSinceContact = calculateDaysSinceContact(customer.last_contact_date);

  const customRules = state.customer_custom_rules
    .filter(r => r.customer_id === customer.id)
    .sort((a, b) => a.step_number - b.step_number);

  const activities = state.follow_up_activities
    .filter(a => a.customer_id === customer.id)
    .map(a => {
      const u = state.users.find(usr => usr.id === a.user_id);
      const t = state.whatsapp_templates.find(tpl => tpl.id === a.template_id);
      return {
        ...a,
        user_name: u?.name || 'Sales Staff',
        template_name: t?.title || null,
      };
    })
  const transactions = (state.transactions || [])
    .filter(t => t.customer_id === customer.id)
    .sort((a, b) => (b.transaction_date > a.transaction_date ? 1 : -1));
  const totalOmzet = transactions
    .filter(t => t.status === 'CLOSING')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  res.json({
    success: true,
    data: {
      ...customer,
      status: statusObj,
      sales: salesUser ? { id: salesUser.id, name: salesUser.name, email: salesUser.email, phone: salesUser.phone } : null,
      fu_status: fuStatus,
      days_since_contact: daysSinceContact,
      custom_rules: customRules,
      activities,
      transactions,
      total_omzet: totalOmzet,
    },
  });
}

export function createCustomer(req: AuthenticatedRequest, res: Response) {
  const {
    name,
    company_name,
    whatsapp_number,
    phone_number,
    email,
    address,
    city,
    pic_name,
    assigned_sales_id,
    status_id,
    notes,
    use_custom_rule,
    custom_rules,
  } = req.body;

  if (!name || !whatsapp_number) {
    res.status(400).json({ success: false, message: 'Nama dan nomor WhatsApp wajib diisi.' });
    return;
  }

  const state = db.getState();
  const id = db.nextId('customers');
  const now = new Date().toISOString();
  const today = getTodayDateString();

  const customerCode = `CK-${String(id).padStart(4, '0')}`;
  const sanitizedWA = sanitizeWhatsAppPhone(whatsapp_number);
  const assignedSales = (req.user?.role === 'ADMIN' && assigned_sales_id)
    ? parseInt(assigned_sales_id, 10)
    : req.user!.id;
  const statusId = status_id ? parseInt(status_id, 10) : 1; // Default PROSPEK

  // Initial customer object
  const newCustomer: Customer = {
    id,
    customer_code: customerCode,
    name: name.trim(),
    company_name: company_name ? company_name.trim() : '',
    whatsapp_number: sanitizedWA,
    phone_number: phone_number ? phone_number.trim() : '',
    email: email ? email.trim() : '',
    address: address ? address.trim() : '',
    city: city ? city.trim() : '',
    pic_name: pic_name ? pic_name.trim() : '',
    assigned_sales_id: assignedSales,
    status_id: statusId,
    notes: notes || '',
    use_custom_rule: Boolean(use_custom_rule),
    current_rule_step: 1,
    last_contact_date: today,
    next_follow_up_date: '',
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };

  // If custom rules provided
  if (newCustomer.use_custom_rule && Array.isArray(custom_rules)) {
    custom_rules.forEach((cr: any, idx: number) => {
      const crId = db.nextId('customer_custom_rules');
      state.customer_custom_rules.push({
        id: crId,
        customer_id: id,
        step_number: idx + 1,
        interval_days: parseInt(cr.interval_days, 10) || 7,
        created_at: now,
        updated_at: now,
      });
    });
  }

  // Calculate first follow-up date
  const { nextDate } = computeNextFollowUp(newCustomer, false);
  newCustomer.next_follow_up_date = nextDate;

  state.customers.push(newCustomer);
  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'CREATE_CUSTOMER',
    entity: 'CUSTOMER',
    entityId: newCustomer.id,
    newData: {
      id: newCustomer.id,
      code: newCustomer.customer_code,
      name: newCustomer.name,
      company: newCustomer.company_name,
      assigned_sales_id: newCustomer.assigned_sales_id,
      next_follow_up_date: newCustomer.next_follow_up_date,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Customer baru berhasil ditambahkan.',
    data: newCustomer,
  });
}

export function updateCustomer(req: AuthenticatedRequest, res: Response) {
  const customerId = parseInt(req.params.id, 10);
  const state = db.getState();
  const customer = state.customers.find(c => c.id === customerId);

  if (!customer) {
    res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
    return;
  }

  // Permission check for SALES
  if (req.user?.role === 'SALES' && customer.assigned_sales_id !== req.user.id) {
    res.status(403).json({ success: false, message: 'Akses ditolak.' });
    return;
  }

  const oldData = { ...customer };
  const {
    name,
    company_name,
    whatsapp_number,
    phone_number,
    email,
    address,
    city,
    pic_name,
    assigned_sales_id,
    status_id,
    notes,
    use_custom_rule,
    custom_rules,
    next_follow_up_date,
  } = req.body;

  if (name) customer.name = name.trim();
  if (company_name !== undefined) customer.company_name = company_name ? company_name.trim() : '';
  if (whatsapp_number) customer.whatsapp_number = sanitizeWhatsAppPhone(whatsapp_number);
  if (phone_number !== undefined) customer.phone_number = phone_number ? phone_number.trim() : '';
  if (email !== undefined) customer.email = email ? email.trim() : '';
  if (address !== undefined) customer.address = address ? address.trim() : '';
  if (city !== undefined) customer.city = city ? city.trim() : '';
  if (pic_name !== undefined) customer.pic_name = pic_name ? pic_name.trim() : '';
  if (status_id) customer.status_id = parseInt(status_id, 10);
  if (notes !== undefined) customer.notes = notes;
  if (next_follow_up_date) customer.next_follow_up_date = next_follow_up_date;

  // Only Admin can reassign sales
  if (req.user?.role === 'ADMIN' && assigned_sales_id) {
    customer.assigned_sales_id = parseInt(assigned_sales_id, 10);
  }

  // Custom rules handling
  if (use_custom_rule !== undefined) {
    customer.use_custom_rule = Boolean(use_custom_rule);
    if (customer.use_custom_rule && Array.isArray(custom_rules)) {
      // Remove existing custom rules
      state.customer_custom_rules = state.customer_custom_rules.filter(r => r.customer_id !== customer.id);
      const now = new Date().toISOString();
      custom_rules.forEach((cr: any, idx: number) => {
        const crId = db.nextId('customer_custom_rules');
        state.customer_custom_rules.push({
          id: crId,
          customer_id: customer.id,
          step_number: idx + 1,
          interval_days: parseInt(cr.interval_days, 10) || 7,
          created_at: now,
          updated_at: now,
        });
      });
    }
  }

  customer.updated_at = new Date().toISOString();
  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'UPDATE_CUSTOMER',
    entity: 'CUSTOMER',
    entityId: customer.id,
    oldData,
    newData: customer,
  });

  res.json({
    success: true,
    message: 'Data customer berhasil diperbarui.',
    data: customer,
  });
}

export function softDeleteCustomer(req: AuthenticatedRequest, res: Response) {
  const customerId = parseInt(req.params.id, 10);
  const state = db.getState();
  const customer = state.customers.find(c => c.id === customerId);

  if (!customer) {
    res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
    return;
  }

  customer.deleted_at = new Date().toISOString();
  customer.updated_at = new Date().toISOString();
  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'SOFT_DELETE_CUSTOMER',
    entity: 'CUSTOMER',
    entityId: customer.id,
    newData: { id: customer.id, name: customer.name, deleted_at: customer.deleted_at },
  });

  res.json({
    success: true,
    message: 'Customer dipindahkan ke Trash (Soft Delete).',
  });
}

export function getTrashCustomers(req: AuthenticatedRequest, res: Response) {
  const state = db.getState();
  const trash = state.customers
    .filter(c => c.deleted_at !== null)
    .map(c => {
      const statusObj = state.customer_statuses.find(s => s.id === c.status_id);
      const salesUser = state.users.find(u => u.id === c.assigned_sales_id);
      return {
        ...c,
        status: statusObj,
        sales: salesUser ? { id: salesUser.id, name: salesUser.name } : null,
      };
    });

  res.json({
    success: true,
    data: trash,
  });
}

export function restoreCustomer(req: AuthenticatedRequest, res: Response) {
  const customerId = parseInt(req.params.id, 10);
  const state = db.getState();
  const customer = state.customers.find(c => c.id === customerId);

  if (!customer || customer.deleted_at === null) {
    res.status(404).json({ success: false, message: 'Customer tidak ditemukan di Trash.' });
    return;
  }

  customer.deleted_at = null;
  customer.updated_at = new Date().toISOString();
  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'RESTORE_CUSTOMER',
    entity: 'CUSTOMER',
    entityId: customer.id,
    newData: { id: customer.id, name: customer.name },
  });

  res.json({
    success: true,
    message: 'Customer berhasil dipulihkan dari Trash.',
  });
}

export function permanentDeleteCustomer(req: AuthenticatedRequest, res: Response) {
  const customerId = parseInt(req.params.id, 10);
  const state = db.getState();
  const index = state.customers.findIndex(c => c.id === customerId);

  if (index === -1) {
    res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
    return;
  }

  const deletedCustomer = state.customers[index];

  // Cascading deletes for custom rules and activities
  state.customers.splice(index, 1);
  state.customer_custom_rules = state.customer_custom_rules.filter(r => r.customer_id !== customerId);
  state.follow_up_activities = state.follow_up_activities.filter(a => a.customer_id !== customerId);
  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'PERMANENT_DELETE_CUSTOMER',
    entity: 'CUSTOMER',
    entityId: customerId,
    oldData: { id: deletedCustomer.id, code: deletedCustomer.customer_code, name: deletedCustomer.name },
  });

  res.json({
    success: true,
    message: 'Customer dan seluruh relasi histori berhasil dihapus permanen.',
  });
}

export function getStatuses(req: AuthenticatedRequest, res: Response) {
  const state = db.getState();
  const statuses = state.customer_statuses
    .filter(s => s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  res.json({
    success: true,
    data: statuses,
  });
}
