import { Response } from 'express';
import { db, FollowUpRule } from '../database/db.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { logAudit } from '../services/auditLogger.js';

export function getRules(req: AuthenticatedRequest, res: Response) {
  const rules = db.getState().follow_up_rules.sort((a, b) => a.step_number - b.step_number);
  res.json({
    success: true,
    data: rules,
  });
}

export function createRule(req: AuthenticatedRequest, res: Response) {
  const { step_number, name, interval_days, description, is_active } = req.body;

  if (!name || interval_days === undefined) {
    res.status(400).json({ success: false, message: 'Nama rule dan jumlah hari interval wajib diisi.' });
    return;
  }

  const state = db.getState();
  const step = step_number ? parseInt(step_number, 10) : state.follow_up_rules.length + 1;
  const now = new Date().toISOString();
  const id = db.nextId('follow_up_rules');

  const newRule: FollowUpRule = {
    id,
    step_number: step,
    name: name.trim(),
    interval_days: parseInt(interval_days, 10),
    is_active: is_active !== undefined ? Boolean(is_active) : true,
    description: description || '',
    created_at: now,
    updated_at: now,
  };

  state.follow_up_rules.push(newRule);
  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'CREATE_FOLLOW_UP_RULE',
    entity: 'RULE',
    entityId: newRule.id,
    newData: newRule,
  });

  res.status(201).json({
    success: true,
    message: 'Aturan follow-up berhasil ditambahkan.',
    data: newRule,
  });
}

export function updateRule(req: AuthenticatedRequest, res: Response) {
  const ruleId = parseInt(req.params.id, 10);
  const { step_number, name, interval_days, description, is_active } = req.body;

  const state = db.getState();
  const rule = state.follow_up_rules.find(r => r.id === ruleId);

  if (!rule) {
    res.status(404).json({ success: false, message: 'Rule tidak ditemukan.' });
    return;
  }

  const oldData = { ...rule };
  if (name) rule.name = name.trim();
  if (interval_days !== undefined) rule.interval_days = parseInt(interval_days, 10);
  if (step_number !== undefined) rule.step_number = parseInt(step_number, 10);
  if (description !== undefined) rule.description = description;
  if (is_active !== undefined) rule.is_active = Boolean(is_active);
  rule.updated_at = new Date().toISOString();

  db.save();

  logAudit({
    userId: req.user?.id,
    action: 'UPDATE_FOLLOW_UP_RULE',
    entity: 'RULE',
    entityId: rule.id,
    oldData,
    newData: rule,
  });

  res.json({
    success: true,
    message: 'Aturan follow-up berhasil diperbarui.',
    data: rule,
  });
}

export function deleteRule(req: AuthenticatedRequest, res: Response) {
  const ruleId = parseInt(req.params.id, 10);
  const state = db.getState();
  const idx = state.follow_up_rules.findIndex(r => r.id === ruleId);

  if (idx === -1) {
    res.status(404).json({ success: false, message: 'Rule tidak ditemukan.' });
    return;
  }

  const deleted = state.follow_up_rules[idx];
  state.follow_up_rules.splice(idx, 1);
  db.save();

  logAudit({
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
}
