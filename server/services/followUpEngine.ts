import { db, Customer, FollowUpRule, CustomerCustomRule } from '../database/db.js';

export function getTodayDateString(): string {
  // Use Asia/Jakarta date string YYYY-MM-DD
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-CA', options); // en-CA outputs YYYY-MM-DD
  return formatter.format(now);
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
  if (statusCode === 'CUSTOMER' || statusCode === 'LOST' || statusCode === 'INACTIVE') {
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
 * Calculates next follow-up date according to Admin Settings (Follow-Up Rules)
 * or Customer-Specific Custom Rules if enabled.
 */
export function computeNextFollowUp(
  customer: Customer,
  advanceStep: boolean = true
): { nextDate: string; stepNumber: number; intervalDays: number; ruleName: string } {
  const state = db.getState();
  const currentStep = customer.current_rule_step || 1;
  const targetStep = advanceStep ? currentStep + 1 : currentStep;

  let intervalDays = 7; // safe default fallback
  let ruleName = `Follow-Up Step ${targetStep}`;

  if (customer.use_custom_rule) {
    // Check custom rules
    const customRules = state.customer_custom_rules.filter(r => r.customer_id === customer.id);
    const matched = customRules.find(r => r.step_number === targetStep);
    if (matched) {
      intervalDays = matched.interval_days;
      ruleName = `Custom Rule Step ${targetStep} (${intervalDays} hari)`;
    } else {
      // fallback to last known interval or 30 days
      const lastCustom = customRules.sort((a, b) => b.step_number - a.step_number)[0];
      intervalDays = lastCustom ? lastCustom.interval_days : 30;
      ruleName = `Custom Rule Recurring (${intervalDays} hari)`;
    }
  } else {
    // Follow company default rules
    const activeRules = state.follow_up_rules
      .filter(r => r.is_active)
      .sort((a, b) => a.step_number - b.step_number);

    const matched = activeRules.find(r => r.step_number === targetStep);
    if (matched) {
      intervalDays = matched.interval_days;
      ruleName = matched.name;
    } else {
      // If we passed the last step, use the last active rule's interval (or 30 days recurring)
      const lastRule = activeRules[activeRules.length - 1];
      intervalDays = lastRule ? lastRule.interval_days : 30;
      ruleName = lastRule ? `${lastRule.name} (Recurring)` : 'Follow-Up Recurring (30 hari)';
    }
  }

  // Calculate target date from today
  const targetDateObj = new Date();
  targetDateObj.setDate(targetDateObj.getDate() + intervalDays);
  
  const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' };
  const nextDate = new Intl.DateTimeFormat('en-CA', options).format(targetDateObj);

  return {
    nextDate,
    stepNumber: targetStep,
    intervalDays,
    ruleName,
  };
}
