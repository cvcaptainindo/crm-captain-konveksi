import { Response } from 'express';
import { pool, withTransaction } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { logAudit } from '../services/auditLogger.js';

/**
 * Helper to ensure a base row exists in `invoice_settings`
 */
export async function getOrCreateInvoiceSettingsRow(conn?: any): Promise<any> {
  const db = conn || pool;
  const [rows] = (await (db as any).query('SELECT * FROM invoice_settings WHERE id = 1 LIMIT 1')) as [any[], any];
  if (rows && rows.length > 0) {
    return rows[0];
  }

  // Insert default singleton row if not exists (neutral empty defaults without locking or dummy values)
  await (db as any).execute(
    `INSERT INTO invoice_settings (
      id, company_name, company_legal_name, company_logo_url, company_address,
      company_whatsapp, company_phone, company_email, company_website, nib, npwp,
      bank_name, bank_account_number, bank_account_holder,
      signatory_name, signatory_role, created_at, updated_at
    ) VALUES (1, '', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NOW(), NOW())`
  );

  const [created] = (await (db as any).query('SELECT * FROM invoice_settings WHERE id = 1 LIMIT 1')) as [any[], any];
  return created[0];
}

/**
 * GET /api/admin/invoice-settings
 * Admin only: Fetch company invoice settings and active payment terms
 */
export async function getInvoiceSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses Ditolak: Hanya Admin yang dapat mengakses pengaturan invoice.' });
    return;
  }

  try {
    const settings = await getOrCreateInvoiceSettingsRow();
    const [terms] = await pool.query<any[]>(
      'SELECT * FROM invoice_terms ORDER BY sort_order ASC, id ASC'
    );

    res.json({
      success: true,
      data: {
        ...settings,
        // Canonical mappings guaranteed:
        company_name: settings.company_name || '',
        company_legal_name: settings.company_legal_name || settings.legal_name || null,
        company_logo_url: settings.company_logo_url || null,
        company_address: settings.company_address || null,
        company_whatsapp: settings.company_whatsapp || null,
        company_phone: settings.company_phone || settings.company_whatsapp || null,
        company_email: settings.company_email || null,
        company_website: settings.company_website || null,
        nib: settings.nib || null,
        npwp: settings.npwp || null,
        bank_name: settings.bank_name || null,
        bank_account_number: settings.bank_account_number || null,
        bank_account_holder: settings.bank_account_holder || null,
        signatory_role: settings.signatory_role || settings.signatory_title || null,
        signatory_signature_url: settings.signatory_signature_url || settings.signature_image_url || null,
        company_stamp_url: settings.company_stamp_url || settings.stamp_image_url || null,
        // Compatibility aliases:
        legal_name: settings.company_legal_name || settings.legal_name || null,
        signatory_title: settings.signatory_role || settings.signatory_title || null,
        signature_image_url: settings.signatory_signature_url || settings.signature_image_url || null,
        stamp_image_url: settings.company_stamp_url || settings.stamp_image_url || null,
        terms: terms || [],
      },
    });
  } catch (err: any) {
    console.error('[getInvoiceSettings error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat pengaturan invoice.' });
  }
}

/**
 * PUT /api/admin/invoice-settings
 * Admin only: Update company details, bank account, and signatory info
 */
export async function updateInvoiceSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses Ditolak: Hanya Admin yang dapat mengubah pengaturan invoice.' });
    return;
  }

  const {
    company_name,
    company_legal_name,
    company_logo_url,
    company_address,
    company_whatsapp,
    company_phone,
    company_email,
    company_website,
    nib,
    npwp,
    bank_name,
    bank_account_number,
    bank_account_holder,
    signatory_name,
    signatory_role,
    signatory_signature_url,
    company_stamp_url,
  } = req.body;

  const rawCompanyName = company_name !== undefined ? company_name : '';
  const resolvedLegalName = company_legal_name !== undefined ? company_legal_name : req.body.legal_name;
  const resolvedLogoUrl = company_logo_url !== undefined ? company_logo_url : null;
  const resolvedAddress = company_address !== undefined ? company_address : req.body.company_address;
  const resolvedWhatsapp = company_whatsapp !== undefined ? company_whatsapp : null;
  const resolvedPhone = company_phone !== undefined ? company_phone : req.body.company_phone;
  const resolvedEmail = company_email !== undefined ? company_email : null;
  const resolvedWebsite = company_website !== undefined ? company_website : null;
  const resolvedNib = nib !== undefined ? nib : null;
  const resolvedNpwp = npwp !== undefined ? npwp : null;
  const resolvedBankName = bank_name !== undefined ? bank_name : req.body.bank_name;
  const resolvedBankAccNum = bank_account_number !== undefined ? bank_account_number : req.body.bank_account_number;
  const resolvedBankAccHolder = bank_account_holder !== undefined ? bank_account_holder : req.body.bank_account_holder;
  const resolvedSignatoryName = signatory_name !== undefined ? signatory_name : req.body.signatory_name;
  const resolvedSignatoryRole = signatory_role !== undefined ? signatory_role : req.body.signatory_title;
  const resolvedSignatureUrl = signatory_signature_url !== undefined ? signatory_signature_url : req.body.signature_image_url;
  const resolvedStampUrl = company_stamp_url !== undefined ? company_stamp_url : req.body.stamp_image_url;

  try {
    const oldSettings = await getOrCreateInvoiceSettingsRow();

    await pool.execute(
      `UPDATE invoice_settings SET
        company_name = ?,
        company_legal_name = ?,
        company_logo_url = ?,
        company_address = ?,
        company_whatsapp = ?,
        company_phone = ?,
        company_email = ?,
        company_website = ?,
        nib = ?,
        npwp = ?,
        bank_name = ?,
        bank_account_number = ?,
        bank_account_holder = ?,
        signatory_name = ?,
        signatory_role = ?,
        signatory_signature_url = ?,
        company_stamp_url = ?,
        updated_at = NOW()
      WHERE id = 1`,
      [
        rawCompanyName ? String(rawCompanyName).trim() : '',
        resolvedLegalName ? String(resolvedLegalName).trim() : null,
        resolvedLogoUrl || null,
        resolvedAddress ? String(resolvedAddress).trim() : null,
        resolvedWhatsapp ? String(resolvedWhatsapp).trim() : null,
        resolvedPhone ? String(resolvedPhone).trim() : null,
        resolvedEmail ? String(resolvedEmail).trim() : null,
        resolvedWebsite ? String(resolvedWebsite).trim() : null,
        resolvedNib ? String(resolvedNib).trim() : null,
        resolvedNpwp ? String(resolvedNpwp).trim() : null,
        resolvedBankName ? String(resolvedBankName).trim() : null,
        resolvedBankAccNum ? String(resolvedBankAccNum).trim() : null,
        resolvedBankAccHolder ? String(resolvedBankAccHolder).trim() : null,
        resolvedSignatoryName ? String(resolvedSignatoryName).trim() : null,
        resolvedSignatoryRole ? String(resolvedSignatoryRole).trim() : null,
        resolvedSignatureUrl || null,
        resolvedStampUrl || null,
      ]
    );

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: 'UPDATE_INVOICE_SETTINGS',
      entity: 'INVOICE_SETTINGS',
      entityId: 1,
      oldData: oldSettings,
      newData: {
        company_name: rawCompanyName,
        bank_name: resolvedBankName,
        bank_account_number: resolvedBankAccNum,
        bank_account_holder: resolvedBankAccHolder,
        signatory_name: resolvedSignatoryName,
      },
    });

    const updated = await getOrCreateInvoiceSettingsRow();
    const [terms] = await pool.query<any[]>('SELECT * FROM invoice_terms ORDER BY sort_order ASC, id ASC');

    res.json({
      success: true,
      message: 'Pengaturan invoice perusahaan berhasil diperbarui.',
      data: {
        ...updated,
        terms: terms || [],
      },
    });
  } catch (err: any) {
    console.error('[updateInvoiceSettings error]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui pengaturan invoice.' });
  }
}

/**
 * POST /api/admin/invoice-settings/terms
 * Admin only: Add a new payment term & condition
 */
export async function addInvoiceTerm(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses Ditolak: Hanya Admin yang dapat menambah syarat & ketentuan.' });
    return;
  }

  const { term_text } = req.body;
  if (!term_text || String(term_text).trim() === '') {
    res.status(400).json({ success: false, message: 'Teks syarat & ketentuan wajib diisi.' });
    return;
  }

  try {
    const [maxRows] = await pool.query<any[]>('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM invoice_terms');
    const nextOrder = (Number(maxRows[0]?.max_order) || 0) + 1;

    const [insertRes] = await pool.execute<any>(
      'INSERT INTO invoice_terms (sort_order, term_text, is_active, created_at, updated_at) VALUES (?, ?, TRUE, NOW(), NOW())',
      [nextOrder, String(term_text).trim()]
    );

    const termId = insertRes.insertId;

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: 'ADD_INVOICE_TERM',
      entity: 'INVOICE_TERM',
      entityId: termId,
      newData: { id: termId, term_text: String(term_text).trim(), sort_order: nextOrder },
    });

    const [created] = await pool.query<any[]>('SELECT * FROM invoice_terms WHERE id = ?', [termId]);

    res.status(201).json({
      success: true,
      message: 'Syarat & ketentuan berhasil ditambahkan.',
      data: created[0],
    });
  } catch (err: any) {
    console.error('[addInvoiceTerm error]', err);
    res.status(500).json({ success: false, message: 'Gagal menambahkan syarat & ketentuan.' });
  }
}

/**
 * PUT /api/admin/invoice-settings/terms/:id
 * Admin only: Edit text or toggle status of a payment term
 */
export async function updateInvoiceTerm(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses Ditolak: Hanya Admin yang dapat mengubah syarat & ketentuan.' });
    return;
  }

  const termId = parseInt(req.params.id, 10);
  if (isNaN(termId)) {
    res.status(400).json({ success: false, message: 'ID Syarat & Ketentuan tidak valid.' });
    return;
  }

  const { term_text, is_active } = req.body;
  if (term_text !== undefined && String(term_text).trim() === '') {
    res.status(400).json({ success: false, message: 'Teks syarat & ketentuan tidak boleh kosong.' });
    return;
  }

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM invoice_terms WHERE id = ? LIMIT 1', [termId]);
    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'Syarat & ketentuan tidak ditemukan.' });
      return;
    }

    const current = rows[0];
    const newText = term_text !== undefined ? String(term_text).trim() : current.term_text;
    const newActive = is_active !== undefined ? Boolean(is_active) : current.is_active;

    await pool.execute(
      'UPDATE invoice_terms SET term_text = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
      [newText, newActive, termId]
    );

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: 'UPDATE_INVOICE_TERM',
      entity: 'INVOICE_TERM',
      entityId: termId,
      oldData: current,
      newData: { id: termId, term_text: newText, is_active: newActive },
    });

    const [updated] = await pool.query<any[]>('SELECT * FROM invoice_terms WHERE id = ?', [termId]);

    res.json({
      success: true,
      message: 'Syarat & ketentuan berhasil diperbarui.',
      data: updated[0],
    });
  } catch (err: any) {
    console.error('[updateInvoiceTerm error]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui syarat & ketentuan.' });
  }
}

/**
 * DELETE /api/admin/invoice-settings/terms/:id
 * Admin only: Delete a term
 */
export async function deleteInvoiceTerm(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses Ditolak: Hanya Admin yang dapat menghapus syarat & ketentuan.' });
    return;
  }

  const termId = parseInt(req.params.id, 10);
  if (isNaN(termId)) {
    res.status(400).json({ success: false, message: 'ID Syarat & Ketentuan tidak valid.' });
    return;
  }

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM invoice_terms WHERE id = ? LIMIT 1', [termId]);
    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'Syarat & ketentuan tidak ditemukan.' });
      return;
    }

    await pool.execute('DELETE FROM invoice_terms WHERE id = ?', [termId]);

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name,
      action: 'DELETE_INVOICE_TERM',
      entity: 'INVOICE_TERM',
      entityId: termId,
      oldData: rows[0],
    });

    res.json({ success: true, message: 'Syarat & ketentuan berhasil dihapus.' });
  } catch (err: any) {
    console.error('[deleteInvoiceTerm error]', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus syarat & ketentuan.' });
  }
}

/**
 * POST /api/admin/invoice-settings/terms/reorder
 * Admin only: Reorder terms by given array of IDs
 */
export async function reorderInvoiceTerms(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses Ditolak: Hanya Admin yang dapat mengatur urutan syarat & ketentuan.' });
    return;
  }

  const { term_ids } = req.body;
  if (!Array.isArray(term_ids) || term_ids.length === 0) {
    res.status(400).json({ success: false, message: 'Daftar ID urutan syarat & ketentuan tidak valid.' });
    return;
  }

  try {
    await withTransaction(async (conn) => {
      for (let i = 0; i < term_ids.length; i++) {
        const id = parseInt(term_ids[i], 10);
        if (!isNaN(id)) {
          await conn.execute(
            'UPDATE invoice_terms SET sort_order = ?, updated_at = NOW() WHERE id = ?',
            [i + 1, id]
          );
        }
      }
    });

    const [updated] = await pool.query<any[]>('SELECT * FROM invoice_terms ORDER BY sort_order ASC, id ASC');

    res.json({
      success: true,
      message: 'Urutan syarat & ketentuan berhasil diperbarui.',
      data: updated,
    });
  } catch (err: any) {
    console.error('[reorderInvoiceTerms error]', err);
    res.status(500).json({ success: false, message: 'Gagal mengatur urutan syarat & ketentuan.' });
  }
}
