import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/rbac.middleware.js';
import * as authCtrl from '../controllers/auth.controller.js';
import * as custCtrl from '../controllers/customer.controller.js';
import * as fuCtrl from '../controllers/followUp.controller.js';
import * as ruleCtrl from '../controllers/rule.controller.js';
import * as tplCtrl from '../controllers/template.controller.js';
import * as auditCtrl from '../controllers/audit.controller.js';
import * as expCtrl from '../controllers/export.controller.js';
import * as trxCtrl from '../controllers/transaction.controller.js';
import * as docCtrl from '../controllers/document.controller.js';
import * as invSetCtrl from '../controllers/invoiceSettings.controller.js';

export const apiRouter = Router();

// ========================================================
// 1. AUTH & USER MANAGEMENT ROUTES
// ========================================================
// Public Sales Registration (Creates PENDING account)
apiRouter.post('/auth/register', authCtrl.register);
// Login (Enforces PENDING, REJECTED, INACTIVE checks)
apiRouter.post('/auth/login', authCtrl.login);
// Current User Info
apiRouter.get('/auth/me', authMiddleware, authCtrl.getMe);
// Self Profile Update (No privilege escalation)
apiRouter.put('/auth/profile', authMiddleware, authCtrl.updateProfile);

// Admin Sales Management (Review, Approve, Reject, Deactivate, Reset Password)
apiRouter.get('/users/sales-management', authMiddleware, requireAdmin, authCtrl.getSalesManagementList);
apiRouter.patch('/users/:id/status', authMiddleware, requireAdmin, authCtrl.updateSalesAccountStatus);
apiRouter.post('/users/:id/reset-password', authMiddleware, requireAdmin, authCtrl.resetSalesPassword);

// Standard Users List & CRUD
apiRouter.get('/users', authMiddleware, authCtrl.getUsers);
apiRouter.post('/users', authMiddleware, requireAdmin, authCtrl.createUser);
apiRouter.put('/users/:id', authMiddleware, requireAdmin, authCtrl.updateUser);

// ========================================================
// 2. CUSTOMER STATUSES (Configurable PROSPEK, FOLLOW_UP, etc.)
// ========================================================
apiRouter.get('/customers/statuses', authMiddleware, custCtrl.getStatuses);

// ========================================================
// 3. TRASH & RESTORE (Admin only, mounted before :id)
// ========================================================
apiRouter.get('/customers/trash', authMiddleware, requireAdmin, custCtrl.getTrashCustomers);
apiRouter.post('/customers/:id/restore', authMiddleware, requireAdmin, custCtrl.restoreCustomer);
apiRouter.delete('/customers/:id/permanent', authMiddleware, requireAdmin, custCtrl.permanentDeleteCustomer);

// ========================================================
// 4. CUSTOMER CRUD (With Sales Data Isolation)
// ========================================================
apiRouter.get('/customers', authMiddleware, custCtrl.getCustomers);
apiRouter.post('/customers', authMiddleware, custCtrl.createCustomer);
apiRouter.get('/customers/:id', authMiddleware, custCtrl.getCustomerById);
apiRouter.put('/customers/:id', authMiddleware, custCtrl.updateCustomer);
apiRouter.delete('/customers/:id', authMiddleware, requireAdmin, custCtrl.softDeleteCustomer);

// ========================================================
// 4.1 INVOICE (Quotation menu intentionally not exposed in this phase)
// ========================================================
apiRouter.get('/documents/preview-number', authMiddleware, docCtrl.previewNextNumber);
apiRouter.get('/documents/customer/:customerId', authMiddleware, docCtrl.getDocumentsByCustomer);
apiRouter.get('/sales-documents/customer/:customerId', authMiddleware, docCtrl.getDocumentsByCustomer);
apiRouter.get('/customers/:id/sales-documents', authMiddleware, docCtrl.getDocumentsByCustomer);
apiRouter.get('/documents/:id/payments', authMiddleware, docCtrl.getPayments);
apiRouter.post('/documents/:id/payments', authMiddleware, docCtrl.recordPayment);
apiRouter.get('/documents/:id/refunds', authMiddleware, docCtrl.getDocumentRefunds);
apiRouter.post('/documents/:id/refunds', authMiddleware, docCtrl.createDocumentRefund);
apiRouter.patch('/documents/:id/refunds/:refundId', authMiddleware, docCtrl.completeDocumentRefund);
apiRouter.patch('/documents/:id/keterangan', authMiddleware, docCtrl.updateInvoiceKeterangan);
apiRouter.post('/documents/:id/close', authMiddleware, docCtrl.closeInvoice);
apiRouter.post('/documents/:id/cancel', authMiddleware, docCtrl.cancelInvoice);
apiRouter.get('/documents', authMiddleware, docCtrl.getDocuments);
apiRouter.post('/documents', authMiddleware, docCtrl.createDocument);
apiRouter.get('/documents/:id', authMiddleware, docCtrl.getDocumentById);
apiRouter.put('/documents/:id', authMiddleware, docCtrl.updateDocument);
apiRouter.delete('/documents/:id', authMiddleware, docCtrl.deleteDocument);
// Backward-compatible payment aliases used by the supplied payment form.
apiRouter.get('/sales-documents/:id/payments', authMiddleware, docCtrl.getPayments);
apiRouter.post('/sales-documents/:id/payments', authMiddleware, docCtrl.recordPayment);

// ========================================================
// 5. TRANSACTIONS & CLOSING (Omzet Tracking)
// ========================================================
apiRouter.get('/transactions/overview', authMiddleware, trxCtrl.getOmzetOverview);
apiRouter.get('/transactions', authMiddleware, trxCtrl.getTransactions);
apiRouter.post('/transactions', authMiddleware, requireAdmin, trxCtrl.createTransaction);
apiRouter.put('/transactions/:id', authMiddleware, requireAdmin, trxCtrl.updateTransaction);
apiRouter.delete('/transactions/:id', authMiddleware, requireAdmin, trxCtrl.deleteTransaction);

// ========================================================
// 6. FOLLOW-UP ENGINE & ACTIVITIES
// ========================================================
apiRouter.get('/follow-ups/dashboard', authMiddleware, fuCtrl.getDashboardStats);
apiRouter.post('/follow-ups/activities', authMiddleware, fuCtrl.logActivity);
apiRouter.get('/follow-ups/activities/:customerId', authMiddleware, fuCtrl.getCustomerActivities);
apiRouter.get('/follow-ups/monitoring', authMiddleware, requireAdmin, fuCtrl.getFollowUpMonitoringList);

// ========================================================
// 7. FOLLOW-UP RULES (Admin Settings)
// ========================================================
apiRouter.get('/rules', authMiddleware, ruleCtrl.getRules);
apiRouter.post('/rules', authMiddleware, requireAdmin, ruleCtrl.createRule);
apiRouter.put('/rules/:id', authMiddleware, requireAdmin, ruleCtrl.updateRule);
apiRouter.delete('/rules/:id', authMiddleware, requireAdmin, ruleCtrl.deleteRule);

// ========================================================
// 8. WHATSAPP TEMPLATES
// ========================================================
apiRouter.get('/templates', authMiddleware, tplCtrl.getTemplates);
apiRouter.post('/templates', authMiddleware, requireAdmin, tplCtrl.createTemplate);
apiRouter.put('/templates/:id', authMiddleware, requireAdmin, tplCtrl.updateTemplate);
apiRouter.delete('/templates/:id', authMiddleware, requireAdmin, tplCtrl.deleteTemplate);
apiRouter.post('/templates/preview', authMiddleware, tplCtrl.previewTemplate);

// ========================================================
// 9. AUDIT LOGS (Admin only)
// ========================================================
apiRouter.get('/audit-logs', authMiddleware, requireAdmin, auditCtrl.getAuditLogs);

// ========================================================
// ========================================================
// INVOICE SETTINGS & PAYMENT TERMS (Admin Only)
// ========================================================
apiRouter.get('/invoice-settings', authMiddleware, invSetCtrl.getSalesInvoiceSettings);
apiRouter.get('/admin/invoice-settings', authMiddleware, requireAdmin, invSetCtrl.getInvoiceSettings);
apiRouter.put('/admin/invoice-settings', authMiddleware, requireAdmin, invSetCtrl.updateInvoiceSettings);
apiRouter.post('/admin/invoice-settings/terms', authMiddleware, requireAdmin, invSetCtrl.addInvoiceTerm);
apiRouter.put('/admin/invoice-settings/terms/:id', authMiddleware, requireAdmin, invSetCtrl.updateInvoiceTerm);
apiRouter.delete('/admin/invoice-settings/terms/:id', authMiddleware, requireAdmin, invSetCtrl.deleteInvoiceTerm);
apiRouter.post('/admin/invoice-settings/terms/reorder', authMiddleware, requireAdmin, invSetCtrl.reorderInvoiceTerms);

// 10. EXPORT (Excel / CSV)
// ========================================================
apiRouter.get('/export/customers', authMiddleware, expCtrl.exportCustomers);
apiRouter.get('/export/activities', authMiddleware, expCtrl.exportActivities);
apiRouter.get('/export/transactions', authMiddleware, expCtrl.exportTransactions);
