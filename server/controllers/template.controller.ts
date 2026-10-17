import { Response } from 'express';
import { pool, WhatsAppTemplate } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { parseTemplate, buildWhatsAppLink } from '../services/templateParser.js';
import { logAudit } from '../services/auditLogger.js';

export async function getTemplates(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [templates] = await pool.query<any[]>(
      'SELECT * FROM whatsapp_templates ORDER BY title ASC'
    );

    res.json({
      success: true,
      data: templates,
    });
  } catch (err: any) {
    console.error('[Template getTemplates error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat template WhatsApp.' });
  }
}

export async function createTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { title, code, category, content, is_active } = req.body;

  if (!title || !content) {
    res.status(400).json({ success: false, message: 'Judul dan konten template wajib diisi.' });
    return;
  }

  try {
    const generatedCode = code ? code.toUpperCase().trim() : `TPL_${Date.now().toString().slice(-4)}`;

    const [result] = await pool.execute<any>(
      `INSERT INTO whatsapp_templates (
        title, code, category, content, is_active, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        title.trim(),
        generatedCode,
        category || 'GENERAL',
        content.trim(),
        is_active !== undefined ? Boolean(is_active) : true,
        req.user!.id,
      ]
    );

    const newTemplateId = result.insertId;

    await logAudit({
      userId: req.user?.id,
      action: 'CREATE_WA_TEMPLATE',
      entity: 'TEMPLATE',
      entityId: newTemplateId,
      newData: { id: newTemplateId, title: title.trim(), code: generatedCode },
    });

    const [createdRows] = await pool.query<any[]>('SELECT * FROM whatsapp_templates WHERE id = ?', [newTemplateId]);

    res.status(201).json({
      success: true,
      message: 'Template WhatsApp berhasil dibuat.',
      data: createdRows[0],
    });
  } catch (err: any) {
    console.error('[Template createTemplate error]', err);
    res.status(500).json({ success: false, message: 'Gagal membuat template WhatsApp.' });
  }
}

export async function updateTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
  const templateId = parseInt(req.params.id, 10);
  const { title, code, category, content, is_active } = req.body;

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM whatsapp_templates WHERE id = ? LIMIT 1', [templateId]);

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'Template tidak ditemukan.' });
      return;
    }

    const template = rows[0];
    const oldData = { ...template };

    let updatedTitle = title ? title.trim() : template.title;
    let updatedCode = code ? code.toUpperCase().trim() : template.code;
    let updatedCategory = category || template.category;
    let updatedContent = content ? content.trim() : template.content;
    let updatedIsActive = is_active !== undefined ? Boolean(is_active) : template.is_active;

    await pool.execute(
      `UPDATE whatsapp_templates SET
        title = ?, code = ?, category = ?, content = ?,
        is_active = ?, updated_at = NOW()
       WHERE id = ?`,
      [updatedTitle, updatedCode, updatedCategory, updatedContent, updatedIsActive, templateId]
    );

    await logAudit({
      userId: req.user?.id,
      action: 'UPDATE_WA_TEMPLATE',
      entity: 'TEMPLATE',
      entityId: templateId,
      oldData,
      newData: { id: templateId, title: updatedTitle, code: updatedCode },
    });

    const [updatedRows] = await pool.query<any[]>('SELECT * FROM whatsapp_templates WHERE id = ?', [templateId]);

    res.json({
      success: true,
      message: 'Template WhatsApp berhasil diperbarui.',
      data: updatedRows[0],
    });
  } catch (err: any) {
    console.error('[Template updateTemplate error]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui template WhatsApp.' });
  }
}

export async function deleteTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
  const templateId = parseInt(req.params.id, 10);

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM whatsapp_templates WHERE id = ? LIMIT 1', [templateId]);

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'Template tidak ditemukan.' });
      return;
    }

    const deleted = rows[0];

    await pool.execute('DELETE FROM whatsapp_templates WHERE id = ?', [templateId]);

    await logAudit({
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
  } catch (err: any) {
    console.error('[Template deleteTemplate error]', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus template WhatsApp.' });
  }
}

export async function previewTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { template_id, customer_id, raw_content, custom_product } = req.body;

  try {
    let content = raw_content || '';

    if (template_id) {
      const [tRows] = await pool.query<any[]>(
        'SELECT content FROM whatsapp_templates WHERE id = ? LIMIT 1',
        [parseInt(template_id, 10)]
      );
      if (tRows && tRows.length > 0) {
        content = tRows[0].content;
      }
    }

    let customer: any = null;
    if (customer_id) {
      const [cRows] = await pool.query<any[]>(
        'SELECT id, name, company_name, pic_name, whatsapp_number, assigned_sales_id, deleted_at FROM customers WHERE id = ? LIMIT 1',
        [parseInt(customer_id, 10)]
      );
      if (!cRows || cRows.length === 0 || cRows[0].deleted_at !== null) {
        res.status(404).json({ success: false, message: 'Customer tidak ditemukan.' });
        return;
      }
      if (req.user?.role === 'SALES' && cRows[0].assigned_sales_id !== req.user.id) {
        res.status(403).json({ success: false, message: 'Akses ditolak: Customer bukan milik Anda.' });
        return;
      }
      customer = cRows[0];
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
  } catch (err: any) {
    console.error('[Template previewTemplate error]', err);
    res.status(500).json({ success: false, message: 'Gagal membuat preview template WhatsApp.' });
  }
}
