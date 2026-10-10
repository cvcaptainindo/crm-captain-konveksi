import { Response } from 'express';
import { pool, FollowUpRule } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { logAudit } from '../services/auditLogger.js';

export async function getRules(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [rules] = await pool.query<any[]>(
      'SELECT * FROM follow_up_rules ORDER BY step_number ASC'
    );

    res.json({
      success: true,
      data: rules,
    });
  } catch (err: any) {
    console.error('[Rule getRules error]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat aturan follow-up.' });
  }
}

export async function createRule(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { step_number, name, interval_days, description, is_active } = req.body;

  if (!name || interval_days === undefined) {
    res.status(400).json({ success: false, message: 'Nama rule dan jumlah hari interval wajib diisi.' });
    return;
  }

  try {
    let step = step_number ? parseInt(step_number, 10) : 1;
    if (!step_number) {
      const [maxStep] = await pool.query<any[]>('SELECT MAX(step_number) AS max_step FROM follow_up_rules');
      step = (maxStep[0]?.max_step || 0) + 1;
    }

    const [result] = await pool.execute<any>(
      `INSERT INTO follow_up_rules (step_number, name, interval_days, is_active, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        step,
        name.trim(),
        parseInt(interval_days, 10),
        is_active !== undefined ? Boolean(is_active) : true,
        description || '',
      ]
    );

    const newRuleId = result.insertId;

    await logAudit({
      userId: req.user?.id,
      action: 'CREATE_FOLLOW_UP_RULE',
      entity: 'RULE',
      entityId: newRuleId,
      newData: { id: newRuleId, step_number: step, name: name.trim(), interval_days },
    });

    const [createdRows] = await pool.query<any[]>('SELECT * FROM follow_up_rules WHERE id = ?', [newRuleId]);

    res.status(201).json({
      success: true,
      message: 'Aturan follow-up berhasil ditambahkan.',
      data: createdRows[0],
    });
  } catch (err: any) {
    console.error('[Rule createRule error]', err);
    res.status(500).json({ success: false, message: 'Gagal menambahkan aturan follow-up.' });
  }
}

export async function updateRule(req: AuthenticatedRequest, res: Response): Promise<void> {
  const ruleId = parseInt(req.params.id, 10);
  const { step_number, name, interval_days, description, is_active } = req.body;

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM follow_up_rules WHERE id = ? LIMIT 1', [ruleId]);

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'Rule tidak ditemukan.' });
      return;
    }

    const rule = rows[0];
    const oldData = { ...rule };

    let updatedStep = step_number !== undefined ? parseInt(step_number, 10) : rule.step_number;
    let updatedName = name ? name.trim() : rule.name;
    let updatedInterval = interval_days !== undefined ? parseInt(interval_days, 10) : rule.interval_days;
    let updatedDesc = description !== undefined ? description : rule.description;
    let updatedIsActive = is_active !== undefined ? Boolean(is_active) : rule.is_active;

    await pool.execute(
      `UPDATE follow_up_rules SET
        step_number = ?, name = ?, interval_days = ?, description = ?,
        is_active = ?, updated_at = NOW()
       WHERE id = ?`,
      [updatedStep, updatedName, updatedInterval, updatedDesc, updatedIsActive, ruleId]
    );

    await logAudit({
      userId: req.user?.id,
      action: 'UPDATE_FOLLOW_UP_RULE',
      entity: 'RULE',
      entityId: ruleId,
      oldData,
      newData: { id: ruleId, step_number: updatedStep, name: updatedName, interval_days: updatedInterval },
    });

    const [updatedRows] = await pool.query<any[]>('SELECT * FROM follow_up_rules WHERE id = ?', [ruleId]);

    res.json({
      success: true,
      message: 'Aturan follow-up berhasil diperbarui.',
      data: updatedRows[0],
    });
  } catch (err: any) {
    console.error('[Rule updateRule error]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui aturan follow-up.' });
  }
}

export async function deleteRule(req: AuthenticatedRequest, res: Response): Promise<void> {
  const ruleId = parseInt(req.params.id, 10);

  try {
    const [rows] = await pool.query<any[]>('SELECT * FROM follow_up_rules WHERE id = ? LIMIT 1', [ruleId]);

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, message: 'Rule tidak ditemukan.' });
      return;
    }

    const deleted = rows[0];

    await pool.execute('DELETE FROM follow_up_rules WHERE id = ?', [ruleId]);

    await logAudit({
      userId: req.user?.id,
      action: 'DELETE_FOLLOW_UP_RULE',
      entity: 'RULE',
      entityId: ruleId,
      oldData: deleted,
    });

    res.json({
      success: true,
      message: 'Aturan follow-up berhasil dihapus.',
    });
  } catch (err: any) {
    console.error('[Rule deleteRule error]', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus aturan follow-up.' });
  }
}
