import { Response } from 'express';
import { db, WhatsAppTemplate } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { parseTemplate, buildWhatsAppLink } from '../services/templateParser.js';
import { logAudit } from '../services/auditLogger.js';

export function getTemplates(req: AuthenticatedRequest, res: Response) {
  const templates = db.getState().whatsapp_templates.sort((a, b) => (a.title > b.title ? 1 : -1));
  res.json({
    success: true,
    data: templates,
  });
}

export function createTemplate(req: AuthenticatedRequest, res: Response) {
  const { title, code, category, content, is_active } = req.body;

  if (!title || !content) {
    res.status(400).json({ success: false, message: 'Judul dan konten template wajib diisi.' });
    return;
  }

  const state = db.getState();
  const id = db.nextId('whatsapp_templates');
  const now = new Date().toISOString();
  const generatedCode = code || `TPL_${String(id).padStart(3, '0')}`;

  const newTemplate: WhatsAppTemplate = {
    id,
    title: title.trim(),
    code: generatedCode.toUpperCase(),
    category: category || 'GENERAL',
    content: content.trim(),
    is_active: is_active !== undefined ? Boolean(is_active) : true,
    created_by: req.user!.id,
    created_at: now,
    updated_at: now,
  };

  state.whatsapp_templates.push(newTemplate);
  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'CREATE_WA_TEMPLATE',
    entity: 'TEMPLATE',
    entityId: newTemplate.id,
    newData: newTemplate,
  });

  res.status(201).json({
    success: true,
    message: 'Template WhatsApp berhasil dibuat.',
    data: newTemplate,
  });
}

export function updateTemplate(req: AuthenticatedRequest, res: Response) {
  const templateId = parseInt(req.params.id, 10);
  const { title, code, category, content, is_active } = req.body;

  const state = db.getState();
  const template = state.whatsapp_templates.find(t => t.id === templateId);

  if (!template) {
    res.status(404).json({ success: false, message: 'Template tidak ditemukan.' });
    return;
  }

  const oldData = { ...template };
  if (title) template.title = title.trim();
  if (code) template.code = code.toUpperCase();
  if (category) template.category = category;
  if (content) template.content = content.trim();
  if (is_active !== undefined) template.is_active = Boolean(is_active);
  template.updated_at = new Date().toISOString();

  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'UPDATE_WA_TEMPLATE',
    entity: 'TEMPLATE',
    entityId: template.id,
    oldData,
    newData: template,
  });

  res.json({
    success: true,
    message: 'Template WhatsApp berhasil diperbarui.',
    data: template,
  });
}

export function deleteTemplate(req: AuthenticatedRequest, res: Response) {
  const templateId = parseInt(req.params.id, 10);
  const state = db.getState();
  const idx = state.whatsapp_templates.findIndex(t => t.id === templateId);

  if (idx === -1) {
    res.status(404).json({ success: false, message: 'Template tidak ditemukan.' });
    return;
  }

  const deleted = state.whatsapp_templates[idx];
  state.whatsapp_templates.splice(idx, 1);
  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'DELETE_WA_TEMPLATE',
    entity: 'TEMPLATE',
    entityId: templateId,
    oldData: deleted,
  });

  res.json({
    success: true,
    message: 'Template WhatsApp berhasil dihapus.',
  });
}

export function previewTemplate(req: AuthenticatedRequest, res: Response) {
  const { template_id, customer_id, raw_content, custom_product } = req.body;

  const state = db.getState();
  let content = raw_content || '';

  if (template_id) {
    const template = state.whatsapp_templates.find(t => t.id === parseInt(template_id, 10));
    if (template) {
      content = template.content;
    }
  }

  let customer = null;
  if (customer_id) {
    customer = state.customers.find(c => c.id === parseInt(customer_id, 10));
  }

  const parsed = parseTemplate(content, {
    nama_customer: customer?.name || customer?.pic_name || 'Bapak/Ibu',
    perusahaan: customer?.company_name || '-',
    nama_sales: req.user?.name || 'Captain Konveksi',
    produk: custom_product || 'pesanan konveksi',
  });

  const waLink = customer ? buildWhatsAppLink(customer.whatsapp_number, parsed) : '';

  res.json({
    success: true,
    data: {
      parsed_message: parsed,
      wa_link: waLink,
      whatsapp_number: customer?.whatsapp_number || '',
    },
  });
}
