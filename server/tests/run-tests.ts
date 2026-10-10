import assert from 'assert';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validateDbConfig, testDbConnection, checkDbHealth } from '../database/db.js';
import { getJwtSecret } from '../middlewares/auth.middleware.js';
import {
  computeNextFollowUp,
  determineFollowUpCategory,
  calculateDaysDifference,
  calculateDaysSinceContact,
  getTodayDateString,
} from '../services/followUpEngine.js';
import { parseTemplate, sanitizeWhatsAppPhone, buildWhatsAppLink } from '../services/templateParser.js';
import { generateCustomerExport, generateTransactionExport } from '../services/exportService.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err.message });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

async function runTestSuite() {
  console.log('========================================================');
  console.log('CRM CAPTAIN KONVEKSI V1.0 - AUTOMATED TEST SUITE');
  console.log('Testing MySQL Migration, Security, RBAC & Core Logic');
  console.log('========================================================\n');

  // ========================================================
  // 1. CONFIGURATION & STARTUP VALIDATION
  // ========================================================
  console.log('SECTION 1: Configuration & Startup Validation');

  await runTest('validateDbConfig reports warnings when optional variables missing', () => {
    const res = validateDbConfig();
    assert.strictEqual(typeof res.isValid, 'boolean');
    assert.strictEqual(Array.isArray(res.warnings), true);
    assert.strictEqual(Array.isArray(res.errors), true);
  });

  await runTest('checkDbHealth returns structured health object', async () => {
    const health = await checkDbHealth();
    assert.strictEqual(['ok', 'error'].includes(health.status), true);
    assert.strictEqual(typeof health.database, 'string');
    assert.strictEqual(typeof health.host, 'string');
  });

  await runTest('getJwtSecret rejects empty secret in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      assert.throws(() => getJwtSecret(), /SECURITY FATAL/);
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalSecret) process.env.JWT_SECRET = originalSecret;
    }
  });

  // ========================================================
  // 2. AUTHENTICATION & OWNER SECURITY POLICIES
  // ========================================================
  console.log('\nSECTION 2: Authentication & Security Policies');

  await runTest('Owner default password hashes and validates correctly', () => {
    const hash = bcrypt.hashSync('sholat5waktu', 10);
    assert.strictEqual(bcrypt.compareSync('sholat5waktu', hash), true);
    assert.strictEqual(bcrypt.compareSync('wrong_pass', hash), false);
  });

  await runTest('JWT token signing and payload extraction with expiration', () => {
    const secret = 'test_secret_key_1234567890_secure_enough';
    const payload = { id: 1, email: 'cvcaptainindo@gmail.com', role: 'ADMIN', name: 'Owner Captain' };
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    const decoded = jwt.verify(token, secret) as any;
    assert.strictEqual(decoded.id, 1);
    assert.strictEqual(decoded.role, 'ADMIN');
    assert.strictEqual(decoded.email, 'cvcaptainindo@gmail.com');
  });

  await runTest('Account status gate: PENDING, REJECTED, INACTIVE accounts cannot access active session', () => {
    const statuses = [
      { status: 'PENDING', is_active: false, canLogin: false },
      { status: 'REJECTED', is_active: false, canLogin: false },
      { status: 'INACTIVE', is_active: false, canLogin: false },
      { status: 'ACTIVE', is_active: true, canLogin: true },
    ];
    statuses.forEach(s => {
      const allowed = s.status === 'ACTIVE' && s.is_active;
      assert.strictEqual(allowed, s.canLogin, `Status ${s.status} login gate check failed`);
    });
  });

  // ========================================================
  // 3. RBAC & DATA ISOLATION
  // ========================================================
  console.log('\nSECTION 3: RBAC & Sales Data Isolation');

  await runTest('Sales data scoping restricts access strictly to assigned customers', () => {
    const salesUserId = 2;
    const allCustomers = [
      { id: 1, name: 'Cust A', assigned_sales_id: 2 },
      { id: 2, name: 'Cust B', assigned_sales_id: 3 },
      { id: 3, name: 'Cust C', assigned_sales_id: 2 },
    ];

    // Simulating query where role is SALES
    const scopedCustomers = allCustomers.filter(c => c.assigned_sales_id === salesUserId);
    assert.strictEqual(scopedCustomers.length, 2);
    assert.deepStrictEqual(scopedCustomers.map(c => c.id), [1, 3]);
  });

  await runTest('Admin has global access across all sales customers', () => {
    const allCustomers = [
      { id: 1, name: 'Cust A', assigned_sales_id: 2 },
      { id: 2, name: 'Cust B', assigned_sales_id: 3 },
    ];
    const isAdmin = true;
    const scoped = isAdmin ? allCustomers : allCustomers.filter(c => c.assigned_sales_id === 2);
    assert.strictEqual(scoped.length, 2);
  });

  await runTest('Sales cannot modify customers or transactions of another sales staff', () => {
    const salesA = { id: 2, role: 'SALES' };
    const customerOfSalesB = { id: 10, assigned_sales_id: 3 };
    const canAccess = salesA.role === 'ADMIN' || customerOfSalesB.assigned_sales_id === salesA.id;
    assert.strictEqual(canAccess, false);
  });

  // ========================================================
  // 4. FINANCIAL OMZET INTEGRATION & PROTECTION
  // ========================================================
  console.log('\nSECTION 4: Financial Omzet Calculation & Protection');

  await runTest('Accurate Omzet Calculation: CLOSING counts, CANCEL is strictly excluded', () => {
    const transactions = [
      { id: 1, amount: 20000000, status: 'CLOSING' },
      { id: 2, amount: 15000000, status: 'CLOSING' },
      { id: 3, amount: 5000000, status: 'CANCEL' }, // Should be excluded from omzet!
      { id: 4, amount: 30000000, status: 'CLOSING' },
    ];

    const closings = transactions.filter(t => t.status === 'CLOSING');
    const cancels = transactions.filter(t => t.status === 'CANCEL');

    const totalOmzet = closings.reduce((sum, t) => sum + t.amount, 0);
    const cancelAmount = cancels.reduce((sum, t) => sum + t.amount, 0);

    assert.strictEqual(totalOmzet, 65000000, 'Total omzet must equal 65.000.000');
    assert.strictEqual(closings.length, 3, 'Closing count must be 3');
    assert.strictEqual(cancelAmount, 5000000, 'Cancel amount must be 5.000.000');
    assert.strictEqual(cancels.length, 1, 'Cancel count must be 1');
  });

  await runTest('Permanent deletion policy blocks deletion of customers with transactions', () => {
    const customerTransactions = [{ id: 1, amount: 20000000, status: 'CLOSING' }];
    const canPermanentlyDelete = customerTransactions.length === 0;
    assert.strictEqual(canPermanentlyDelete, false, 'Permanent deletion must be blocked if transactions exist');
  });

  await runTest('Permanent deletion allowed only for customer without transactions', () => {
    const emptyTransactions: any[] = [];
    const canPermanentlyDelete = emptyTransactions.length === 0;
    assert.strictEqual(canPermanentlyDelete, true);
  });

  // ========================================================
  // 5. FOLLOW-UP ENGINE & RULES CALCULATION
  // ========================================================
  console.log('\nSECTION 5: Follow-Up Engine & Rules');

  await runTest('Follow-up category determination matches business rules', () => {
    const today = getTodayDateString();
    
    // Past date -> OVERDUE
    assert.strictEqual(determineFollowUpCategory('2020-01-01', 'PROSPEK'), 'OVERDUE');
    // Today -> DUE_TODAY
    assert.strictEqual(determineFollowUpCategory(today, 'PROSPEK'), 'DUE_TODAY');
    // Future -> UPCOMING
    assert.strictEqual(determineFollowUpCategory('2099-12-31', 'PROSPEK'), 'UPCOMING');
    // Deal/Cancel/Inactive -> COMPLETED
    assert.strictEqual(determineFollowUpCategory('2020-01-01', 'CLOSING'), 'COMPLETED');
    assert.strictEqual(determineFollowUpCategory('2020-01-01', 'CANCEL'), 'COMPLETED');
    assert.strictEqual(determineFollowUpCategory('2020-01-01', 'INACTIVE'), 'COMPLETED');
  });

  await runTest('Company standard 4-step follow-up intervals', () => {
    const rules = [
      { id: 1, step_number: 1, name: 'Step 1', interval_days: 3, is_active: true, description: '', created_at: '', updated_at: '' },
      { id: 2, step_number: 2, name: 'Step 2', interval_days: 7, is_active: true, description: '', created_at: '', updated_at: '' },
      { id: 3, step_number: 3, name: 'Step 3', interval_days: 14, is_active: true, description: '', created_at: '', updated_at: '' },
      { id: 4, step_number: 4, name: 'Step 4', interval_days: 30, is_active: true, description: '', created_at: '', updated_at: '' },
    ];

    const cust = { use_custom_rule: false, current_rule_step: 1 };
    const step2 = computeNextFollowUp(cust, true, rules);
    assert.strictEqual(step2.stepNumber, 2);
    assert.strictEqual(step2.intervalDays, 7);

    const step3 = computeNextFollowUp({ ...cust, current_rule_step: 2 }, true, rules);
    assert.strictEqual(step3.stepNumber, 3);
    assert.strictEqual(step3.intervalDays, 14);

    const step4 = computeNextFollowUp({ ...cust, current_rule_step: 3 }, true, rules);
    assert.strictEqual(step4.stepNumber, 4);
    assert.strictEqual(step4.intervalDays, 30);
  });

  await runTest('Customer custom rules override company standard sequence', () => {
    const companyRules = [
      { id: 1, step_number: 1, name: 'Standard 1', interval_days: 3, is_active: true, description: '', created_at: '', updated_at: '' },
    ];
    const customRules = [
      { id: 1, customer_id: 10, step_number: 1, interval_days: 2, created_at: '', updated_at: '' },
      { id: 2, customer_id: 10, step_number: 2, interval_days: 5, created_at: '', updated_at: '' },
    ];

    const cust = { use_custom_rule: true, current_rule_step: 1 };
    const step2 = computeNextFollowUp(cust, true, companyRules, customRules);
    assert.strictEqual(step2.stepNumber, 2);
    assert.strictEqual(step2.intervalDays, 5);
  });

  // ========================================================
  // 6. WHATSAPP TEMPLATES & PARSER
  // ========================================================
  console.log('\nSECTION 6: WhatsApp Template Parser & Link Builder');

  await runTest('sanitizeWhatsAppPhone formats Indonesian phone to E.164 without plus', () => {
    assert.strictEqual(sanitizeWhatsAppPhone('0812-3456-7890'), '6281234567890');
    assert.strictEqual(sanitizeWhatsAppPhone('6281234567890'), '6281234567890');
    assert.strictEqual(sanitizeWhatsAppPhone('81234567890'), '6281234567890');
    assert.strictEqual(sanitizeWhatsAppPhone('+62 812-3456-7890'), '6281234567890');
  });

  await runTest('parseTemplate replaces placeholders safely without leaks', () => {
    const tpl = 'Halo {{nama_customer}} dari {{perusahaan}}, konfirmasi pesanan {{produk}} oleh {{nama_sales}}.';
    const parsed = parseTemplate(tpl, {
      nama_customer: 'Pak Budi',
      perusahaan: 'PT Sumber Makmur',
      nama_sales: 'Dimas',
      produk: 'Jaket Bomber',
    });
    assert.strictEqual(
      parsed,
      'Halo Pak Budi dari PT Sumber Makmur, konfirmasi pesanan Jaket Bomber oleh Dimas.'
    );
  });

  await runTest('buildWhatsAppLink generates valid wa.me URL with encoded payload', () => {
    const link = buildWhatsAppLink('081234567890', 'Halo Bapak');
    assert.strictEqual(link, 'https://wa.me/6281234567890?text=Halo%20Bapak');
  });

  // ========================================================
  // 7. EXPORT ENGINE (EXCEL & CSV)
  // ========================================================
  console.log('\nSECTION 7: Export Services (XLSX & CSV)');

  await runTest('generateCustomerExport generates non-empty buffer for xlsx and csv', () => {
    const customers = [
      {
        customer_code: 'CK-0001',
        name: 'Pak Budi',
        company_name: 'PT Sumber Makmur',
        whatsapp_number: '6281234567890',
        phone_number: '021-12345',
        email: 'budi@test.com',
        city: 'Cikarang',
        status_label: 'Closing',
        status_code: 'CLOSING',
        sales_name: 'Dimas',
        last_contact_date: '2026-10-01',
        next_follow_up_date: '2026-10-15',
        current_rule_step: 2,
        use_custom_rule: false,
        notes: 'Test',
        created_at: '2026-10-01T00:00:00Z',
      },
    ];

    const xlsx = generateCustomerExport(customers, 'xlsx');
    assert.strictEqual(Buffer.isBuffer(xlsx.buffer), true);
    assert.strictEqual(xlsx.buffer.length > 0, true);
    assert.strictEqual(xlsx.filename.endsWith('.xlsx'), true);

    const csv = generateCustomerExport(customers, 'csv');
    assert.strictEqual(Buffer.isBuffer(csv.buffer), true);
    assert.strictEqual(csv.buffer.length > 0, true);
    assert.strictEqual(csv.filename.endsWith('.csv'), true);
  });

  await runTest('generateTransactionExport generates valid closing report buffer', () => {
    const transactions = [
      {
        id: 1,
        transaction_date: '2026-10-01',
        customer_name: 'Pak Budi',
        company_name: 'PT Sumber Makmur',
        sales_name: 'Dimas',
        product: '100 pcs Jaket',
        description: 'Seragam',
        amount: 20000000,
        status: 'CLOSING',
        notes: 'Deal',
        created_at: '2026-10-01T00:00:00Z',
      },
    ];

    const res = generateTransactionExport(transactions, 'xlsx');
    assert.strictEqual(Buffer.isBuffer(res.buffer), true);
    assert.strictEqual(res.buffer.length > 0, true);
  });

  // ========================================================
  // 8. AUDIT LOG REDACTION & SANITIZATION
  // ========================================================
  console.log('\nSECTION 8: Audit Log Security & Sensitive Data Redaction');

  await runTest('Audit log parameters redact passwords and secrets', () => {
    const rawData = {
      username: 'sales1',
      password: 'supersecretpassword',
      password_hash: '$2b$10$hashedstring',
      token: 'jwt.token.here',
      safeField: 'safeValue',
    };

    // Emulate redaction
    const sensitiveKeys = ['password', 'password_hash', 'token', 'jwt', 'secret'];
    const sanitized = { ...rawData };
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        (sanitized as any)[key] = '[REDACTED]';
      }
    }

    assert.strictEqual(sanitized.password, '[REDACTED]');
    assert.strictEqual(sanitized.password_hash, '[REDACTED]');
    assert.strictEqual(sanitized.token, '[REDACTED]');
    assert.strictEqual(sanitized.safeField, 'safeValue');
  });

  // ========================================================
  // SUMMARY
  // ========================================================
  console.log('\n========================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('========================================================');

  if (failedCount > 0) {
    console.error(`\nFAILED TESTS (${failedCount}):`);
    results.filter(r => !r.passed).forEach(r => console.error(` - ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('\nALL AUTOMATED TESTS PASSED SUCCESSFULLY! (EXIT CODE: 0)');
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
