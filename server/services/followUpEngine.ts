import { pool, Customer, FollowUpRule, CustomerCustomRule } from '../database/db.js';

export function getTodayDateString(): string {
  // Use Asia/Jakarta date string YYYY-MM-DD
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-CA', options); // en-CA outputs YYYY-MM-DD
  return formatter.format(now);
}

export function getStartOfWeekDateString(todayStr: string = getTodayDateString()): string {
  const date = new Date(`${todayStr}T00:00:00.000Z`);
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 1);
  return date.toISOString().slice(0, 10);
}

export function calculateDaysDifference(fromDateStr: string, toDateStr: string): number {
  if (!fromDateStr || !toDateStr) return 0;
  const from = new Date(fromDateStr + 'T00:00:00Z');
  const to = new Date(toDateStr + 'T00:00:00Z');
  const diffTime = to.getTime() - from.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export function calculateDaysSinceContact(lastContactDate: string | null): number {
  if (!lastContactDate) return 0;
  const today = getTodayDateString();
  return calculateDaysDifference(lastContactDate, today);
}

export type FollowUpCategory = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'COMPLETED';

export function determineFollowUpCategory(nextFollowUpDate: string | null, statusCode?: string): FollowUpCategory {
  if (statusCode === 'CLOSING' || statusCode === 'CANCEL' || statusCode === 'INACTIVE' || statusCode === 'CUSTOMER' || statusCode === 'LOST') {
    return 'COMPLETED';
  }
  if (!nextFollowUpDate) {
    return 'DUE_TODAY';
  }
  const today = getTodayDateString();
  if (nextFollowUpDate < today) {
    return 'OVERDUE';
  } else if (nextFollowUpDate === today) {
    return 'DUE_TODAY';
  } else {
    return 'UPCOMING';
  }
}

/**
 * Pure calculation function for next follow-up date given customer, rules, and custom rules
 */
export function computeNextFollowUp(
  customer: { use_custom_rule: boolean; current_rule_step: number; id?: number },
  advanceStep: boolean = true,
  rules: FollowUpRule[] = [],
  customRules: CustomerCustomRule[] = []
): { nextDate: string; stepNumber: number; intervalDays: number; ruleName: string } {
  const currentStep = customer.current_rule_step || 1;
  const targetStep = advanceStep ? currentStep + 1 : currentStep;

  let intervalDays = 7;
  let ruleName = `Follow-Up Step ${targetStep}`;

  if (customer.use_custom_rule && customRules.length > 0) {
    const matched = customRules.find(r => r.step_number === targetStep);
    if (matched) {
      intervalDays = matched.interval_days;
      ruleName = `Custom Rule Step ${targetStep} (${intervalDays} hari)`;
    } else {
      const sorted = [...customRules].sort((a, b) => b.step_number - a.step_number);
      intervalDays = sorted[0] ? sorted[0].interval_days : 30;
      ruleName = `Custom Rule Recurring (${intervalDays} hari)`;
    }
  } else if (rules.length > 0) {
    const activeRules = rules.filter(r => r.is_active).sort((a, b) => a.step_number - b.step_number);
    const matched = activeRules.find(r => r.step_number === targetStep);
    if (matched) {
      intervalDays = matched.interval_days;
      ruleName = matched.name;
    } else {
      const lastRule = activeRules[activeRules.length - 1];
      intervalDays = lastRule ? lastRule.interval_days : 30;
      ruleName = lastRule ? `${lastRule.name} (Recurring)` : 'Follow-Up Recurring (30 hari)';
    }
  }

  // Anchor calendar arithmetic to the WIB date, independent of the server's local timezone.
  const todayWIB = getTodayDateString();
  const targetDateObj = new Date(`${todayWIB}T00:00:00.000Z`);
  targetDateObj.setUTCDate(targetDateObj.getUTCDate() + intervalDays);
  const nextDate = targetDateObj.toISOString().slice(0, 10);

  return {
    nextDate,
    stepNumber: targetStep,
    intervalDays,
    ruleName,
  };
}

/**
 * Database-backed next follow-up calculation
 */
export async function computeCustomerNextFollowUp(
  customer: { use_custom_rule: boolean; current_rule_step: number; id?: number },
  advanceStep: boolean = true
): Promise<{ nextDate: string; stepNumber: number; intervalDays: number; ruleName: string }> {
  let customRules: CustomerCustomRule[] = [];
  if (customer.use_custom_rule && customer.id) {
    const [cRows] = await pool.query<any[]>(
      'SELECT * FROM customer_custom_rules WHERE customer_id = ? ORDER BY step_number ASC',
      [customer.id]
    );
    customRules = cRows as CustomerCustomRule[];
  }

  const [rRows] = await pool.query<any[]>(
    'SELECT * FROM follow_up_rules WHERE is_active = TRUE ORDER BY step_number ASC'
  );
  const rules = rRows as FollowUpRule[];

  return computeNextFollowUp(customer, advanceStep, rules, customRules);
}
