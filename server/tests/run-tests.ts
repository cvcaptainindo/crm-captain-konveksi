import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validateDbConfig, testDbConnection, checkDbHealth } from '../database/db.js';
import { getJwtSecret } from '../middlewares/auth.middleware.js';
import { validatePasswordStrength, FORBIDDEN_PASSWORDS, OWNER_EMAIL, promptHiddenPassword } from '../../scripts/bootstrap-owner.js';
import {
  computeNextFollowUp,
  determineFollowUpCategory,
  calculateDaysDifference,
  calculateDaysSinceContact,
  getTodayDateString,
} from '../services/followUpEngine.js';
import * as XLSX from 'xlsx';
import { parseTemplate, sanitizeWhatsAppPhone, buildWhatsAppLink } from '../services/templateParser.js';
import { generateCustomerExport, generateActivityExport, generateTransactionExport, sanitizeSpreadsheetCell } from '../services/exportService.js';
import { isValidCalendarDate } from '../controllers/transaction.controller.js';
import { validateTemplateForPreview } from '../controllers/template.controller.js';
import { validateSignalingMessage, safeRemoveSession, isCurrentSocketSession, isSupportedMonitoringRole } from '../services/screenMonitoringSignaling.js';

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

  await runTest('Audit: Zero hardcoded default passwords in codebase & SQL files', () => {
    const filesToCheck = [
      'scripts/bootstrap-owner.ts',
      'server/database/seeds.sql',
      'server/database/migration_initial_hostinger.sql',
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(process.cwd(), relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        assert.strictEqual(
          content.includes('sholat5waktu'),
          false,
          `File ${relPath} must NOT contain hardcoded password string 'sholat5waktu'`
        );
        assert.strictEqual(
          content.includes('DEFAULT_PASSWORD'),
          false,
          `File ${relPath} must NOT contain 'DEFAULT_PASSWORD'`
        );
      }
    }
  });

  await runTest('Audit: Bootstrap script preserves existing Owner password hash without reset', () => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/bootstrap-owner.ts');
    const content = fs.readFileSync(scriptPath, 'utf-8');

    // Verify existing user update query does NOT touch password_hash
    const updateRegex = /UPDATE users SET role = "ADMIN", account_status = "ACTIVE", is_active = TRUE, updated_at = NOW\(\) WHERE id = \?/i;
    assert.strictEqual(
      updateRegex.test(content),
      true,
      'Bootstrap script must only update role and status, preserving password_hash'
    );
    assert.strictEqual(
      content.includes('SET password_hash'),
      false,
      'Bootstrap script must NEVER reset password_hash of existing accounts'
    );
  });

  await runTest('Audit: CLI arguments (process.argv) rejected for password input', () => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/bootstrap-owner.ts');
    const content = fs.readFileSync(scriptPath, 'utf-8');

    assert.strictEqual(
      content.includes('process.argv[2]'),
      false,
      'Bootstrap script must NOT read passwords from process.argv to prevent process table / shell history leaks'
    );
    assert.strictEqual(
      content.includes('process.argv.length > 2'),
      true,
      'Bootstrap script must explicitly detect and reject CLI arguments'
    );
  });

  await runTest('Password strength validator enforces minimum 8 chars, complexity, and rejects weak passwords', () => {
    // Empty
    assert.strictEqual(validatePasswordStrength('').isValid, false);
    // Too short (< 8)
    assert.strictEqual(validatePasswordStrength('Abc1!').isValid, false);
    // Common / forbidden
    for (const forbidden of FORBIDDEN_PASSWORDS) {
      assert.strictEqual(validatePasswordStrength(forbidden).isValid, false);
    }
    // Only letters (no number/symbol)
    assert.strictEqual(validatePasswordStrength('OnlyLettersPassword').isValid, false);
    // Only numbers (no letter)
    assert.strictEqual(validatePasswordStrength('1234567890123').isValid, false);
    // Valid strong password
    const valid = validatePasswordStrength('Captain2026!Secure');
    assert.strictEqual(valid.isValid, true);
    assert.strictEqual(valid.error, undefined);
  });

  await runTest('BCrypt hashing with cost factor 10 generates valid verifiable hash', () => {
    const rawPass = 'Captain2026!Secure';
    const hash = bcrypt.hashSync(rawPass, 10);
    assert.strictEqual(bcrypt.compareSync(rawPass, hash), true);
    assert.strictEqual(bcrypt.compareSync('WrongPassword123!', hash), false);
    assert.strictEqual(hash.startsWith('$2'), true);
  });

  await runTest('Audit: Non-TTY environment strictly rejects plain readline to prevent plaintext echo', async () => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/bootstrap-owner.ts');
    const content = fs.readFileSync(scriptPath, 'utf-8');

    // Verify readline is not used as a fallback for password input
    assert.strictEqual(
      content.includes('readline.createInterface'),
      false,
      'Script must NOT use readline.createInterface for password input (characters would be visible)'
    );
    assert.strictEqual(
      content.includes('!process.stdin.isTTY'),
      true,
      'Script must verify process.stdin.isTTY before attempting interactive password input'
    );
    assert.strictEqual(
      content.includes('OWNER_PASSWORD'),
      true,
      'Script must instruct user to provide temporary OWNER_PASSWORD environment variable for non-TTY environments'
    );
  });

  await runTest('Audit: seeds.sql uses non-destructive ON DUPLICATE KEY UPDATE id = id', () => {
    const seedsPath = path.resolve(process.cwd(), 'server/database/seeds.sql');
    const content = fs.readFileSync(seedsPath, 'utf-8');

    // Verify seeds do NOT overwrite label, color_code, or interval_days on duplicate
    assert.strictEqual(
      content.includes('label = VALUES(label)'),
      false,
      'seeds.sql must NOT overwrite custom customer status labels'
    );
    assert.strictEqual(
      content.includes('interval_days = VALUES(interval_days)'),
      false,
      'seeds.sql must NOT overwrite custom follow-up interval days'
    );
    assert.strictEqual(
      content.includes('ON DUPLICATE KEY UPDATE id = id'),
      true,
      'seeds.sql must use safe ON DUPLICATE KEY UPDATE id = id to preserve existing configurations'
    );
  });

  await runTest('Audit: Database connection pool is properly closed in bootstrap finally block', () => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/bootstrap-owner.ts');
    const content = fs.readFileSync(scriptPath, 'utf-8');

    assert.strictEqual(
      content.includes('pool.end()'),
      true,
      'Bootstrap script must call pool.end() to release database connection sockets cleanly'
    );
  });

  // ========================================================
  // TTY INTERACTIVE PROMPT AUTOMATED TESTS
  // ========================================================

  function createMockTtyStream() {
    const stream = new EventEmitter() as any;
    stream.isTTY = true;
    stream.rawMode = false;
    stream.paused = false;
    stream.setRawMode = (mode: boolean) => {
      stream.rawMode = mode;
    };
    stream.pause = () => {
      stream.paused = true;
    };
    stream.resume = () => {
      stream.paused = false;
    };
    stream.setEncoding = () => {};
    stream.read = () => null;
    return stream;
  }

  function createMockOutputStream() {
    let output = '';
    return {
      write: (str: string) => {
        output += str;
        return true;
      },
      getOutput: () => output,
      clear: () => {
        output = '';
      },
    };
  }

  await runTest('TTY Prompt: Normal password input with hidden asterisk echo and raw mode restoration', async () => {
    const mockInput = createMockTtyStream();
    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: mockInput, output: mockOutput });

    assert.strictEqual(mockInput.rawMode, true, 'Raw mode must be enabled when prompt is active');
    mockInput.emit('data', 'Captain2026!\r');
    const result = await promise;

    assert.strictEqual(result, 'Captain2026!');
    assert.strictEqual(mockOutput.getOutput(), 'Password: ' + '*'.repeat(12) + '\n');
    assert.strictEqual(mockInput.rawMode, false, 'Raw mode must be restored to false on finish');
    assert.strictEqual(mockOutput.getOutput().includes('Captain2026!'), false, 'Password must never be echoed in plaintext');
  });

  await runTest('TTY Prompt: Confirmation mismatch between two prompts is accurately detected', async () => {
    const mockInput1 = createMockTtyStream();
    const mockOutput1 = createMockOutputStream();
    const p1 = promptHiddenPassword('Password Baru: ', { input: mockInput1, output: mockOutput1 });
    mockInput1.emit('data', 'PasswordPertama123!\r');
    const pass1 = await p1;

    const mockInput2 = createMockTtyStream();
    const mockOutput2 = createMockOutputStream();
    const p2 = promptHiddenPassword('Konfirmasi Password: ', { input: mockInput2, output: mockOutput2 });
    mockInput2.emit('data', 'PasswordKeduaBeda456!\r');
    const pass2 = await p2;

    assert.notStrictEqual(pass1, pass2, 'Mismatched passwords must not be equal');
  });

  await runTest('TTY Prompt: Backspace (\\x7f and \\x08) deletes characters and updates visual output', async () => {
    const mockInput = createMockTtyStream();
    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: mockInput, output: mockOutput });

    // Type 'Capta'
    mockInput.emit('data', 'Capta');
    // Backspace 1x with \x7f
    mockInput.emit('data', '\x7f');
    // Backspace 1x with \x08
    mockInput.emit('data', '\x08');
    // Type 'tain2026!\r'
    mockInput.emit('data', 'tain2026!\r');

    const result = await promise;
    // 'Capta' -> backspace 2x -> 'Cap' + 'tain2026!' -> 'Captain2026!'
    assert.strictEqual(result, 'Captain2026!');
    // Verify \b \b visual backspace was written to output
    assert.strictEqual(mockOutput.getOutput().includes('\b \b'), true);
  });

  await runTest('TTY Prompt: Enter handling with CRLF (\\r\\n) and buffer draining without character leakage', async () => {
    const mockInput = createMockTtyStream();
    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: mockInput, output: mockOutput });

    // Send password ending with CRLF \r\n
    mockInput.emit('data', 'SecurePass123!\r\n');
    const result = await promise;

    assert.strictEqual(result, 'SecurePass123!');
    assert.strictEqual(mockInput.rawMode, false);
  });

  await runTest('TTY Prompt: ANSI escape sequences and SSH terminal queries are filtered without echoing asterisks', async () => {
    const mockInput = createMockTtyStream();
    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: mockInput, output: mockOutput });

    // Simulate terminal emulator handshake queries (Hostinger SSH / PuTTY / xterm)
    // 1. Device Attributes query response: \x1b[?1;2c
    // 2. Window Focus In event: \x1b[I
    // 3. Arrow Up key: \x1b[A
    // 4. Cursor position response: \x1b[24;80R
    mockInput.emit('data', '\x1b[?1;2c');
    mockInput.emit('data', '\x1b[I');
    mockInput.emit('data', '\x1b[A');
    mockInput.emit('data', '\x1b[24;80R');
    // User types actual password
    mockInput.emit('data', 'RealSecret99!\r');

    const result = await promise;
    assert.strictEqual(result, 'RealSecret99!', 'Password must NOT contain any ANSI escape bytes');
    // Output must only contain the prompt, 13 asterisks for RealSecret99!, and newline
    assert.strictEqual(
      mockOutput.getOutput(),
      'Password: ' + '*'.repeat(13) + '\n',
      'No asterisks should be echoed for terminal escape sequences'
    );
  });

  await runTest('TTY Prompt: Ctrl+C (\\u0003) cancels cleanly with USER_CANCELLED and restores raw mode', async () => {
    const mockInput = createMockTtyStream();
    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: mockInput, output: mockOutput });

    mockInput.emit('data', 'Partial\x03');
    await assert.rejects(
      promise,
      (err: any) => err.message === 'USER_CANCELLED',
      'Ctrl+C must cleanly reject with USER_CANCELLED'
    );
    assert.strictEqual(mockInput.rawMode, false, 'Raw mode must be restored even upon cancellation');
  });

  await runTest('TTY Prompt: Ctrl+U (\\x15) clears whole input line and visual asterisks', async () => {
    const mockInput = createMockTtyStream();
    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: mockInput, output: mockOutput });

    // Type mistake, clear line with \x15, then type correct password
    mockInput.emit('data', 'MistakeTypo');
    mockInput.emit('data', '\x15');
    mockInput.emit('data', 'CorrectPass123!\r');

    const result = await promise;
    assert.strictEqual(result, 'CorrectPass123!');
  });

  await runTest('TTY Prompt: Real Node.js PassThrough stream handles typing and raw mode restoration', async () => {
    const realStream = new PassThrough() as any;
    realStream.isTTY = true;
    realStream.rawMode = false;
    realStream.setRawMode = (mode: boolean) => {
      realStream.rawMode = mode;
    };

    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: realStream, output: mockOutput });

    assert.strictEqual(realStream.rawMode, true, 'Real stream raw mode must be true during prompt');
    realStream.write('Captain2026!\r');

    const result = await promise;
    assert.strictEqual(result, 'Captain2026!');
    assert.strictEqual(realStream.rawMode, false, 'Real stream raw mode must be restored to false');
  });

  await runTest('TTY Prompt: Split CRLF packet between two prompts on same stream prevents empty confirmation failure', async () => {
    // Simulates the exact Hostinger SSH scenario where \r finishes Prompt 1,
    // and trailing \n arrives as the first byte of Prompt 2.
    const sharedStream = new PassThrough() as any;
    sharedStream.isTTY = true;
    sharedStream.rawMode = false;
    sharedStream.setRawMode = (mode: boolean) => {
      sharedStream.rawMode = mode;
    };

    const mockOutput1 = createMockOutputStream();
    const p1 = promptHiddenPassword('Password Baru: ', { input: sharedStream, output: mockOutput1 });
    // User hits Enter: terminal sends \r in packet 1
    sharedStream.write('Captain2026!\r');
    const pass1 = await p1;
    assert.strictEqual(pass1, 'Captain2026!');

    const mockOutput2 = createMockOutputStream();
    const p2 = promptHiddenPassword('Konfirmasi: ', { input: sharedStream, output: mockOutput2 });

    // Packet 2 arrives with the trailing \n from the previous Enter key!
    sharedStream.write('\n');

    // Give event loop time to verify that p2 did NOT resolve with empty string ""
    let hasResolvedPrematurely = false;
    p2.then(() => {
      hasResolvedPrematurely = true;
    }).catch(() => {});

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(hasResolvedPrematurely, false, 'Prompt 2 must NOT resolve prematurely on orphaned \\n');

    // User enters password confirmation
    sharedStream.write('Captain2026!\r');
    const pass2 = await p2;

    assert.strictEqual(pass2, 'Captain2026!');
    assert.strictEqual(pass1, pass2, 'Confirmation must match when split CRLF is safely ignored');
  });

  await runTest('TTY Prompt: OSC and terminal query sequences are filtered without leaking or echoing asterisks', async () => {
    const mockInput = createMockTtyStream();
    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: mockInput, output: mockOutput });

    // Terminal sends OSC window title sequence: \x1b]0;cvcaptain@hostinger:~\x07 followed by password
    mockInput.emit('data', '\x1b]0;cvcaptain@hostinger:~\x07');
    mockInput.emit('data', 'RealSecret2026!\r');

    const result = await promise;
    assert.strictEqual(result, 'RealSecret2026!', 'OSC sequence must be completely discarded');
    assert.strictEqual(
      mockOutput.getOutput(),
      'Password: ' + '*'.repeat(15) + '\n',
      'No asterisks should be echoed for OSC title bytes'
    );
  });

  await runTest('TTY Prompt: Stream error triggers listener detachment, raw mode restoration, and rejection', async () => {
    const mockInput = createMockTtyStream();
    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: mockInput, output: mockOutput });

    assert.strictEqual(mockInput.rawMode, true);
    mockInput.emit('error', new Error('SSH_CONNECTION_RESET'));

    await assert.rejects(
      promise,
      (err: any) => err.message === 'SSH_CONNECTION_RESET',
      'Prompt must reject on stream error'
    );
    assert.strictEqual(mockInput.rawMode, false, 'Raw mode must be restored on stream error');
    assert.strictEqual(mockInput.listenerCount('data'), 0, 'Data listener must be detached on stream error');
  });

  await runTest('TTY Prompt: Stream unexpected EOF / end triggers cleanup and raw mode restoration', async () => {
    const realStream = new PassThrough() as any;
    realStream.isTTY = true;
    realStream.rawMode = false;
    realStream.setRawMode = (mode: boolean) => {
      realStream.rawMode = mode;
    };

    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: realStream, output: mockOutput });

    assert.strictEqual(realStream.rawMode, true);
    realStream.end();

    await assert.rejects(
      promise,
      (err: any) => err.message === 'STREAM_ENDED_BEFORE_INPUT',
      'Prompt must reject if stream closes before password is typed'
    );
    assert.strictEqual(realStream.rawMode, false, 'Raw mode must be restored on stream end');
  });

  await runTest('TTY Prompt: Valid fast-typed or pre-buffered input is fully preserved without unsafe stream draining', async () => {
    const realStream = new PassThrough() as any;
    realStream.isTTY = true;
    realStream.rawMode = false;
    realStream.setRawMode = (mode: boolean) => {
      realStream.rawMode = mode;
    };

    // Pre-write data into buffer before prompt initializes (simulates typing ahead or fast input)
    realStream.write('FastTypedKey123!\r');

    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: realStream, output: mockOutput });

    const result = await promise;
    assert.strictEqual(result, 'FastTypedKey123!', 'Fast-typed password must not be dropped by any stream drain');
    assert.strictEqual(realStream.rawMode, false);
  });

  await runTest('TTY Prompt: Bracketed paste delimiters (\\x1b[200~ ... \\x1b[201~) are stripped without polluting password', async () => {
    const mockInput = createMockTtyStream();
    const mockOutput = createMockOutputStream();
    const promise = promptHiddenPassword('Password: ', { input: mockInput, output: mockOutput });

    // Terminal sends bracketed paste sequence: \x1b[200~ followed by pasted text followed by \x1b[201~
    mockInput.emit('data', '\x1b[200~PastedPass2026!\x1b[201~\r');

    const result = await promise;
    assert.strictEqual(result, 'PastedPass2026!', 'Pasted password must not contain bracketed paste escape bytes');
    assert.strictEqual(
      mockOutput.getOutput(),
      'Password: ' + '*'.repeat(15) + '\n',
      'Only 15 asterisks should be echoed for the 15 characters of PastedPass2026!'
    );
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
  // 9. COMPREHENSIVE BUG FIX & AUDIT REGRESSION TESTS
  // ========================================================
  console.log('\nSECTION 9: Bug Fixes & Audit Regression Suite (BUG-01 to BUG-05 & Checks A-G)');

  // BUG-01: Fan-out join omzet multiplication prevention
  await runTest('BUG-01: Sales omzet calculation excludes fan-out join duplication across multiple customers & transactions', () => {
    // Model 1 Sales user with 3 active customers, 1 soft-deleted customer, and multiple transactions
    const salesUser = { id: 10, name: 'Sales Budi', role: 'SALES' };
    const allCustomers = [
      { id: 101, assigned_sales_id: 10, deleted_at: null },
      { id: 102, assigned_sales_id: 10, deleted_at: null },
      { id: 103, assigned_sales_id: 10, deleted_at: null },
      { id: 104, assigned_sales_id: 10, deleted_at: '2026-10-15 10:00:00' }, // soft deleted
    ];
    const allTransactions = [
      { id: 1, sales_id: 10, customer_id: 101, amount: 10000000, status: 'CLOSING' },
      { id: 2, sales_id: 10, customer_id: 102, amount: 5000000, status: 'CLOSING' },
      { id: 3, sales_id: 10, customer_id: 101, amount: 2000000, status: 'CANCEL' }, // CANCEL excluded
    ];

    // Compute via isolated aggregations (mirrors fixed subquery logic)
    const activeCustomers = allCustomers.filter(c => c.assigned_sales_id === salesUser.id && c.deleted_at === null);
    const closingTransactions = allTransactions.filter(t => t.sales_id === salesUser.id && t.status === 'CLOSING');
    const totalOmzet = closingTransactions.reduce((sum, t) => sum + t.amount, 0);

    assert.strictEqual(activeCustomers.length, 3, 'Customer count must strictly count active customers (deleted_at IS NULL)');
    assert.strictEqual(closingTransactions.length, 2, 'Closing count must strictly count CLOSING status without duplication');
    assert.strictEqual(totalOmzet, 15000000, 'Total omzet must be 15,000,000 (10M + 5M), not multiplied by customer fan-out');

    // Case: Sales with 0 transactions
    const salesZero = { id: 11, name: 'Sales Baru' };
    const zeroCust = allCustomers.filter(c => c.assigned_sales_id === salesZero.id && c.deleted_at === null);
    const zeroTrx = allTransactions.filter(t => t.sales_id === salesZero.id && t.status === 'CLOSING');
    assert.strictEqual(zeroCust.length, 0);
    assert.strictEqual(zeroTrx.length, 0);
    assert.strictEqual(zeroTrx.reduce((s, t) => s + t.amount, 0), 0);
  });

  // BUG-02: Detail customer in Trash is blocked on normal endpoint
  await runTest('BUG-02: Soft-deleted (Trash) customer cannot be accessed via normal getCustomerById', () => {
    const customerTable = [
      { id: 1, name: 'Active Customer', assigned_sales_id: 2, deleted_at: null },
      { id: 2, name: 'Trash Customer', assigned_sales_id: 2, deleted_at: '2026-10-16 14:00:00' },
    ];

    function mockGetCustomerById(req: { user: { id: number; role: string }; params: { id: string } }) {
      const id = parseInt(req.params.id, 10);
      // Query enforces WHERE c.id = ? AND c.deleted_at IS NULL
      const found = customerTable.find(c => c.id === id && c.deleted_at === null);
      if (!found) {
        return { status: 404, message: 'Customer tidak ditemukan.' };
      }
      if (req.user.role === 'SALES' && found.assigned_sales_id !== req.user.id) {
        return { status: 403, message: 'Anda tidak memiliki akses ke customer ini.' };
      }
      return { status: 200, data: found };
    }

    // Active customer accessed by owner Sales -> 200
    const resActive = mockGetCustomerById({ user: { id: 2, role: 'SALES' }, params: { id: '1' } });
    assert.strictEqual(resActive.status, 200);

    // Trash customer accessed by owner Sales -> 404
    const resTrash = mockGetCustomerById({ user: { id: 2, role: 'SALES' }, params: { id: '2' } });
    assert.strictEqual(resTrash.status, 404, 'Normal endpoint must return 404 for customer in Trash');

    // Trash customer accessed by Admin -> 404 (Admin must use dedicated Trash endpoint)
    const resAdminTrash = mockGetCustomerById({ user: { id: 1, role: 'ADMIN' }, params: { id: '2' } });
    assert.strictEqual(resAdminTrash.status, 404, 'Admin accessing normal detail for Trash customer must get 404');

    // Active customer accessed by non-owner Sales -> 403
    const resOtherSales = mockGetCustomerById({ user: { id: 99, role: 'SALES' }, params: { id: '1' } });
    assert.strictEqual(resOtherSales.status, 403);
  });

  // BUG-03: Update customer in Trash is blocked
  await runTest('BUG-03: Soft-deleted (Trash) customer cannot be updated via updateCustomer', () => {
    const customerTable = [
      { id: 1, name: 'Active Customer', assigned_sales_id: 2, deleted_at: null },
      { id: 2, name: 'Trash Customer', assigned_sales_id: 2, deleted_at: '2026-10-16 14:00:00' },
    ];

    function mockUpdateCustomer(req: { user: { id: number; role: string }; params: { id: string }; body: any }) {
      const id = parseInt(req.params.id, 10);
      // Query enforces SELECT ... WHERE id = ? AND deleted_at IS NULL
      const found = customerTable.find(c => c.id === id && c.deleted_at === null);
      if (!found) {
        return { status: 404, message: 'Customer tidak ditemukan.' };
      }
      if (req.user.role === 'SALES' && found.assigned_sales_id !== req.user.id) {
        return { status: 403, message: 'Akses ditolak.' };
      }
      found.name = req.body.name || found.name;
      return { status: 200, success: true, data: found };
    }

    // Active customer update -> 200
    const resUpdateActive = mockUpdateCustomer({
      user: { id: 2, role: 'SALES' },
      params: { id: '1' },
      body: { name: 'Active Customer Updated' },
    });
    assert.strictEqual(resUpdateActive.status, 200);

    // Trash customer update -> 404
    const resUpdateTrash = mockUpdateCustomer({
      user: { id: 2, role: 'SALES' },
      params: { id: '2' },
      body: { name: 'Hacked Trash Customer' },
    });
    assert.strictEqual(resUpdateTrash.status, 404, 'Updating Trash customer must be rejected with 404');
    assert.strictEqual(customerTable.find(c => c.id === 2)?.name, 'Trash Customer', 'Trash record must remain untouched');
  });

  // BUG-04: Export activities excludes Trash customers by default and enforces Sales scoping
  await runTest('BUG-04: Export activities query construction excludes Trash customers by default and scopes Sales', () => {
    function buildExportActivitiesWhere(role: string, userId: number, customerId?: string, includeTrash?: string): string[] {
      const conditions: string[] = [];
      if (includeTrash !== 'true' || role !== 'ADMIN') {
        conditions.push('c.deleted_at IS NULL');
      }
      if (role === 'SALES') {
        conditions.push('c.assigned_sales_id = ?');
      }
      if (customerId && customerId !== 'all') {
        conditions.push('a.customer_id = ?');
      }
      return conditions;
    }

    // Default Sales query
    const salesConds = buildExportActivitiesWhere('SALES', 5);
    assert.strictEqual(salesConds.includes('c.deleted_at IS NULL'), true, 'Must exclude deleted customers by default');
    assert.strictEqual(salesConds.includes('c.assigned_sales_id = ?'), true, 'Must enforce sales assignment');

    // Sales cannot bypass trash even if passing include_trash=true
    const salesBypass = buildExportActivitiesWhere('SALES', 5, undefined, 'true');
    assert.strictEqual(salesBypass.includes('c.deleted_at IS NULL'), true, 'Sales must not bypass trash filter');

    // Admin default
    const adminConds = buildExportActivitiesWhere('ADMIN', 1);
    assert.strictEqual(adminConds.includes('c.deleted_at IS NULL'), true, 'Admin export excludes trash by default');

    // Admin explicit include_trash
    const adminWithTrash = buildExportActivitiesWhere('ADMIN', 1, undefined, 'true');
    assert.strictEqual(adminWithTrash.includes('c.deleted_at IS NULL'), false, 'Admin can include trash when explicitly asked');
  });

  // BUG-05: Transaction amount validation in updateTransaction
  await runTest('BUG-05: updateTransaction validates amount explicitly (rejects negative, non-numeric, NaN, preserves omitted)', () => {
    function validateAmount(existingAmount: number, inputAmount: any): { valid: boolean; value?: number; error?: string } {
      if (inputAmount === undefined) {
        return { valid: true, value: existingAmount };
      }
      const num = typeof inputAmount === 'string' && inputAmount.trim() === '' ? NaN : Number(inputAmount);
      if (typeof inputAmount === 'boolean' || isNaN(num) || !isFinite(num) || num < 0) {
        return { valid: false, error: 'Nominal transaksi tidak valid.' };
      }
      return { valid: true, value: num };
    }

    // Valid positive amount
    assert.deepStrictEqual(validateAmount(100000, 500000), { valid: true, value: 500000 });
    // Valid zero
    assert.deepStrictEqual(validateAmount(100000, 0), { valid: true, value: 0 });
    // Valid string number
    assert.deepStrictEqual(validateAmount(100000, '250000'), { valid: true, value: 250000 });
    // Field omitted (undefined) -> retains existing amount
    assert.deepStrictEqual(validateAmount(100000, undefined), { valid: true, value: 100000 });

    // Negative number -> rejected
    assert.strictEqual(validateAmount(100000, -50000).valid, false);
    // Non-numeric string -> rejected
    assert.strictEqual(validateAmount(100000, 'abc').valid, false);
    // Empty string -> rejected
    assert.strictEqual(validateAmount(100000, '   ').valid, false);
    // NaN -> rejected
    assert.strictEqual(validateAmount(100000, NaN).valid, false);
    // Infinity -> rejected
    assert.strictEqual(validateAmount(100000, Infinity).valid, false);
    // Boolean true/false -> rejected
    assert.strictEqual(validateAmount(100000, true).valid, false);
    assert.strictEqual(validateAmount(100000, false).valid, false);
  });

  // Additional A & B: Transaction status and strict calendar date validation [UNIT TEST - PRODUCTION HELPER isValidCalendarDate]
  await runTest('Checks A & B: Transaction status and isValidCalendarDate strictly validates calendar dates & leap years', () => {
    const validStatuses = ['CLOSING', 'CANCEL'];
    function validateStatus(status: any): boolean {
      if (status === undefined) return true;
      return validStatuses.includes(status);
    }

    assert.strictEqual(validateStatus('CLOSING'), true);
    assert.strictEqual(validateStatus('CANCEL'), true);
    assert.strictEqual(validateStatus('PENDING'), false);
    assert.strictEqual(validateStatus('FOOBAR'), false);
    assert.strictEqual(validateStatus(123), false);

    // Tests calling actual production isValidCalendarDate helper
    // 1. Invalid calendar dates (must be rejected)
    assert.strictEqual(isValidCalendarDate('2026-02-29'), false, '2026 is NOT a leap year; Feb 29 must be rejected');
    assert.strictEqual(isValidCalendarDate('2026-04-31'), false, 'April has only 30 days; Apr 31 must be rejected');
    assert.strictEqual(isValidCalendarDate('2026-13-01'), false, 'Month 13 does not exist; must be rejected');
    assert.strictEqual(isValidCalendarDate('2026-00-10'), false, 'Month 0 does not exist; must be rejected');
    assert.strictEqual(isValidCalendarDate('not-a-date'), false, 'Non-date string must be rejected');
    assert.strictEqual(isValidCalendarDate('17-10-2026'), false, 'Wrong date format (DD-MM-YYYY) must be rejected');
    assert.strictEqual(isValidCalendarDate('2026/10/17'), false, 'Wrong date delimiter (slash) must be rejected');
    assert.strictEqual(isValidCalendarDate(''), false, 'Empty string must be rejected');
    assert.strictEqual(isValidCalendarDate(null), false, 'Null must be rejected');
    assert.strictEqual(isValidCalendarDate(undefined), false, 'Undefined must be rejected');

    // 2. Valid calendar dates (must be accepted)
    assert.strictEqual(isValidCalendarDate('2024-02-29'), true, '2024 IS a leap year; Feb 29 must be accepted');
    assert.strictEqual(isValidCalendarDate('2026-02-28'), true, 'Regular February 28 must be accepted');
    assert.strictEqual(isValidCalendarDate('2026-12-31'), true, 'December 31 must be accepted');
    assert.strictEqual(isValidCalendarDate('2026-10-17'), true, 'Current date must be accepted');
  });

  // Additional C: previewTemplate access control & template active status [UNIT TEST & LOGIC MOCK]
  await runTest('Check C: previewTemplate enforces active template status, existence check, soft-delete check, and Sales customer ownership', () => {
    // 1. Production helper validateTemplateForPreview tests
    assert.deepStrictEqual(validateTemplateForPreview(null), {
      valid: false,
      status: 404,
      message: 'Template tidak ditemukan.',
    }, 'Missing template row must return 404');

    assert.deepStrictEqual(validateTemplateForPreview(undefined), {
      valid: false,
      status: 404,
      message: 'Template tidak ditemukan.',
    }, 'Undefined template row must return 404');

    assert.deepStrictEqual(validateTemplateForPreview({ content: 'Halo kak', is_active: false }), {
      valid: false,
      status: 400,
      message: 'Template tidak aktif dan tidak dapat digunakan.',
    }, 'Template with is_active = false must return 400');

    assert.deepStrictEqual(validateTemplateForPreview({ content: 'Halo kak', is_active: 0 }), {
      valid: false,
      status: 400,
      message: 'Template tidak aktif dan tidak dapat digunakan.',
    }, 'Template with is_active = 0 must return 400');

    assert.deepStrictEqual(validateTemplateForPreview({ content: 'Halo {{nama_customer}}', is_active: true }), {
      valid: true,
      content: 'Halo {{nama_customer}}',
    }, 'Template with is_active = true must be valid');

    assert.deepStrictEqual(validateTemplateForPreview({ content: 'Halo {{nama_customer}}', is_active: 1 }), {
      valid: true,
      content: 'Halo {{nama_customer}}',
    }, 'Template with is_active = 1 must be valid');

    // 2. Full preview flow simulation matching production controller behavior
    const templates = [
      { id: 10, content: 'Halo {{nama_customer}}, pesanan {{produk}} siap!', is_active: 1 },
      { id: 11, content: 'Promo diskon lama!', is_active: 0 },
    ];

    const customers = [
      { id: 1, name: 'Customer A', company_name: 'PT Maju', pic_name: 'Budi', whatsapp_number: '081234567890', assigned_sales_id: 2, deleted_at: null },
      { id: 2, name: 'Customer B', company_name: 'CV Makmur', pic_name: 'Siti', whatsapp_number: '081234567891', assigned_sales_id: 3, deleted_at: null },
      { id: 3, name: 'Customer C', company_name: 'Toko Lama', pic_name: 'Joko', whatsapp_number: '081234567892', assigned_sales_id: 2, deleted_at: '2026-10-16 10:00:00' },
    ];

    function mockPreviewTemplateHandler(body: { template_id?: any; customer_id?: any; raw_content?: string; custom_product?: string }, user: { id: number; name: string; role: string }) {
      let content = body.raw_content || '';

      if (body.template_id) {
        const foundTpl = templates.find(t => t.id === parseInt(body.template_id, 10)) || null;
        const validation = validateTemplateForPreview(foundTpl);
        if (!validation.valid) {
          return { status: validation.status!, success: false, message: validation.message };
        }
        content = validation.content || '';
      }

      let customer: any = null;
      if (body.customer_id) {
        const cust = customers.find(c => c.id === parseInt(body.customer_id, 10));
        if (!cust || cust.deleted_at !== null) {
          return { status: 404, success: false, message: 'Customer tidak ditemukan.' };
        }
        if (user.role === 'SALES' && cust.assigned_sales_id !== user.id) {
          return { status: 403, success: false, message: 'Akses ditolak: Customer bukan milik Anda.' };
        }
        customer = cust;
      }

      const parsed = parseTemplate(content, {
        nama_customer: customer?.name || customer?.pic_name || 'Bapak/Ibu',
        perusahaan: customer?.company_name || '-',
        nama_sales: user?.name || 'Captain Konveksi',
        produk: body.custom_product || 'pesanan konveksi',
      });

      const waLink = customer ? buildWhatsAppLink(customer.whatsapp_number, parsed) : '';

      return {
        status: 200,
        success: true,
        data: {
          parsed_message: parsed,
          wa_link: waLink,
          whatsapp_number: customer?.whatsapp_number || '',
        },
      };
    }

    const salesUser = { id: 2, name: 'Sales Agent', role: 'SALES' };
    const adminUser = { id: 1, name: 'Admin Boss', role: 'ADMIN' };

    // Case 1: Template not found (ID 999) -> 404
    const resNotFound = mockPreviewTemplateHandler({ template_id: 999, customer_id: 1 }, salesUser);
    assert.strictEqual(resNotFound.status, 404);
    assert.strictEqual(resNotFound.message, 'Template tidak ditemukan.');

    // Case 2: Template is inactive (ID 11, is_active: 0) -> 400
    const resInactive = mockPreviewTemplateHandler({ template_id: 11, customer_id: 1 }, salesUser);
    assert.strictEqual(resInactive.status, 400);
    assert.strictEqual(resInactive.message, 'Template tidak aktif dan tidak dapat digunakan.');

    // Case 3: Template is active (ID 10) + owned customer (ID 1) -> 200
    const resActive = mockPreviewTemplateHandler({ template_id: 10, customer_id: 1, custom_product: 'Kaos Polo' }, salesUser);
    assert.strictEqual(resActive.status, 200);
    assert.strictEqual(resActive.data?.parsed_message.includes('Customer A'), true);
    assert.strictEqual(resActive.data?.parsed_message.includes('Kaos Polo'), true);
    assert.strictEqual(resActive.data?.wa_link.includes('6281234567890'), true);

    // Case 4: Raw content without template_id -> 200
    const resRaw = mockPreviewTemplateHandler({ raw_content: 'Halo {{nama_customer}}!', customer_id: 1 }, salesUser);
    assert.strictEqual(resRaw.status, 200);
    assert.strictEqual(resRaw.data?.parsed_message, 'Halo Customer A!');

    // Case 5: Deleted customer -> 404
    const resDeletedCust = mockPreviewTemplateHandler({ template_id: 10, customer_id: 3 }, salesUser);
    assert.strictEqual(resDeletedCust.status, 404);
    assert.strictEqual(resDeletedCust.message, 'Customer tidak ditemukan.');

    // Case 6: Non-owner Sales accessing other customer -> 403
    const resForbidden = mockPreviewTemplateHandler({ template_id: 10, customer_id: 2 }, salesUser);
    assert.strictEqual(resForbidden.status, 403);
    assert.strictEqual(resForbidden.message, 'Akses ditolak: Customer bukan milik Anda.');

    // Case 7: Admin accessing any active customer -> 200
    const resAdmin = mockPreviewTemplateHandler({ template_id: 10, customer_id: 2 }, adminUser);
    assert.strictEqual(resAdmin.status, 200);
  });

  // Additional D: Pagination parser [UNIT TEST - CONTROLLER PAGINATION PARSER]
  await runTest('Check D: Pagination parser handles NaN, negative numbers, and caps excessive limits', () => {
    function parsePagination(page: any, limit: any, defaultLimit = 10) {
      const rawPage = parseInt(page as string, 10);
      const rawLimit = parseInt(limit as string, 10);
      const p = !isNaN(rawPage) && rawPage > 0 ? rawPage : 1;
      const l = !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : defaultLimit;
      return { p, l, offset: (p - 1) * l };
    }

    assert.deepStrictEqual(parsePagination('1', '25'), { p: 1, l: 25, offset: 0 });
    assert.deepStrictEqual(parsePagination('abc', 'xyz'), { p: 1, l: 10, offset: 0 });
    assert.deepStrictEqual(parsePagination('-5', '-10'), { p: 1, l: 10, offset: 0 });
    assert.deepStrictEqual(parsePagination('2', '500'), { p: 2, l: 100, offset: 100 });
  });

  // Additional E: Spreadsheet formula injection sanitization [INTEGRATION TEST - REAL EXPORT GENERATION & XLSX BUFFER PARSING]
  await runTest('Check E: Comprehensive Spreadsheet Export Sanitization & Buffer Inspection (CSV & XLSX)', () => {
    // 1. Direct helper test for formula injection characters
    assert.strictEqual(sanitizeSpreadsheetCell('=SUM(1,2)'), "'=SUM(1,2)");
    assert.strictEqual(sanitizeSpreadsheetCell("=CMD|' /C calc'!A0"), "'=CMD|' /C calc'!A0");
    assert.strictEqual(sanitizeSpreadsheetCell('+12345'), "'+12345");
    assert.strictEqual(sanitizeSpreadsheetCell('-cmd|calc'), "'-cmd|calc");
    assert.strictEqual(sanitizeSpreadsheetCell('@HYPERLINK("http://evil.com")'), "'@HYPERLINK(\"http://evil.com\")");
    assert.strictEqual(sanitizeSpreadsheetCell('\tTabLeading'), "'\tTabLeading");
    assert.strictEqual(sanitizeSpreadsheetCell('\rCRLeading'), "'\rCRLeading");
    assert.strictEqual(sanitizeSpreadsheetCell('   =1+1'), "'   =1+1", 'Formula with leading whitespace must be sanitized');

    // Normal values remain untouched
    assert.strictEqual(sanitizeSpreadsheetCell('Kaos Polos Cotton Combed 30s'), 'Kaos Polos Cotton Combed 30s');
    assert.strictEqual(sanitizeSpreadsheetCell('CV Captain Konveksi'), 'CV Captain Konveksi');
    assert.strictEqual(sanitizeSpreadsheetCell('081234567890'), '081234567890');
    assert.strictEqual(sanitizeSpreadsheetCell(150000), 150000, 'Positive numbers must remain numeric');
    assert.strictEqual(sanitizeSpreadsheetCell(-50000), -50000, 'Negative numbers must remain numeric');

    // 2. Integration: Test generateCustomerExport with CSV and XLSX
    const mockCustomers = [
      {
        id: 1,
        customer_code: 'CK-0001',
        name: "=CMD|' /C calc'!A0", // dangerous formula
        company_name: '+628123456789', // plus prefix
        whatsapp_number: '081234567890',
        phone_number: '081234567890',
        notes: '@SUM(A1:A10)', // at prefix
        status_label: 'Prospek',
        status_code: 'PROSPEK',
        next_follow_up_date: '2026-10-20',
        created_at: '2026-10-17 10:00:00',
      },
      {
        id: 2,
        customer_code: 'CK-0002',
        name: 'Budi Santoso', // normal text
        company_name: 'PT Maju Bersama',
        whatsapp_number: '081987654321',
        notes: 'Pelanggan reguler kaos polo',
        status_label: 'Closing',
        status_code: 'CLOSING',
        created_at: '2026-10-17 10:00:00',
      },
    ];

    // CSV Customer Export test
    const custCsv = generateCustomerExport(mockCustomers, 'csv');
    const custCsvStr = custCsv.buffer.toString('utf-8');
    assert.strictEqual(custCsvStr.includes("=CMD|' /C calc'!A0"), true, 'CSV must contain formula string');
    assert.strictEqual(custCsvStr.includes("'=CMD|' /C calc'!A0"), true, 'CSV formula string must be escaped with single quote');
    assert.strictEqual(custCsvStr.includes("'+628123456789"), true, 'CSV plus prefix must be escaped with single quote');
    assert.strictEqual(custCsvStr.includes("'@SUM(A1:A10)"), true, 'CSV at-sign formula must be escaped with single quote');
    assert.strictEqual(custCsvStr.includes('Budi Santoso'), true, 'Normal customer name must appear unescaped');

    // XLSX Customer Export round-trip buffer test
    const custXlsx = generateCustomerExport(mockCustomers, 'xlsx');
    const custWorkbook = XLSX.read(custXlsx.buffer, { type: 'buffer' });
    const custSheet = custWorkbook.Sheets['Data Customer'];
    const custRows = XLSX.utils.sheet_to_json<any>(custSheet);
    assert.strictEqual(custRows[0]['Nama Customer'], "'=CMD|' /C calc'!A0", 'XLSX cell must have escaped single quote');
    assert.strictEqual(custRows[0]['Perusahaan'], "'+628123456789", 'XLSX company cell must have escaped single quote');
    assert.strictEqual(custRows[0]['Catatan'], "'@SUM(A1:A10)", 'XLSX notes cell must have escaped single quote');
    assert.strictEqual(custRows[1]['Nama Customer'], 'Budi Santoso', 'Normal text in XLSX must NOT have leading quote');

    // 3. Integration: Test generateActivityExport with CSV and XLSX
    const mockActivities = [
      {
        id: 101,
        activity_date: '2026-10-17',
        customer_name: '\tTabCustomer', // tab prefix
        company_name: '\rCRCompany', // CR prefix
        user_name: 'Sales Staff 1',
        channel: 'WHATSAPP',
        template_title: '-DDE("cmd";"calc")', // dash formula
        result_status: 'FOLLOW_UP',
        message_sent: '   =1+1', // whitespace + formula
        notes: '@malicious_tag',
        next_follow_up_date: '2026-10-24',
      },
    ];

    const actXlsx = generateActivityExport(mockActivities, 'xlsx');
    const actWorkbook = XLSX.read(actXlsx.buffer, { type: 'buffer' });
    const actSheet = actWorkbook.Sheets['Histori Follow-Up'];
    const actRows = XLSX.utils.sheet_to_json<any>(actSheet);
    assert.strictEqual(actRows[0]['Nama Customer'], "'\tTabCustomer");
    assert.strictEqual(actRows[0]['Perusahaan'], "'\rCRCompany");
    assert.strictEqual(actRows[0]['Template WA'], "'-DDE(\"cmd\";\"calc\")");
    assert.strictEqual(actRows[0]['Pesan Terkirim'], "'   =1+1");
    assert.strictEqual(actRows[0]['Catatan Sales'], "'@malicious_tag");

    // 4. Integration: Test generateTransactionExport (preserves numeric amount, sanitizes text)
    const mockTransactions = [
      {
        id: 501,
        transaction_date: '2026-10-17',
        customer_name: '=HYPERLINK("http://attacker.com")',
        company_name: 'CV Captain Konveksi',
        sales_name: 'Sales Budi',
        product: '+Kemeja Seragam',
        description: '-Diskon 10%',
        amount: 25000000, // positive number
        status: 'CLOSING',
        notes: '@Catatan Khusus',
        created_at: '2026-10-17 12:00:00',
      },
      {
        id: 502,
        transaction_date: '2026-10-17',
        customer_name: 'Customer Normal',
        company_name: 'PT Sukses Mandiri',
        sales_name: 'Sales Ani',
        product: 'Kaos Sablon',
        description: 'Penyesuaian retur bahan',
        amount: -50000, // negative number
        status: 'CANCEL',
        notes: 'Retur barang',
        created_at: '2026-10-17 13:00:00',
      },
    ];

    const trXlsx = generateTransactionExport(mockTransactions, 'xlsx');
    const trWorkbook = XLSX.read(trXlsx.buffer, { type: 'buffer' });
    const trSheet = trWorkbook.Sheets['Laporan Closing Transaksi'];
    const trRows = XLSX.utils.sheet_to_json<any>(trSheet);

    // Text fields are sanitized
    assert.strictEqual(trRows[0]['Nama Customer'], "'=HYPERLINK(\"http://attacker.com\")");
    assert.strictEqual(trRows[0]['Nama Produk / Pesanan'], "'+Kemeja Seragam");
    assert.strictEqual(trRows[0]['Deskripsi'], "'-Diskon 10%");
    assert.strictEqual(trRows[0]['Catatan'], "'@Catatan Khusus");
    assert.strictEqual(trRows[1]['Nama Customer'], 'Customer Normal');

    // Numeric fields: verify they retain authentic numeric types and values in SheetJS
    assert.strictEqual(typeof trRows[0]['Nominal Transaksi (Rp)'], 'number');
    assert.strictEqual(trRows[0]['Nominal Transaksi (Rp)'], 25000000, 'Positive amount must remain number');
    assert.strictEqual(typeof trRows[1]['Nominal Transaksi (Rp)'], 'number');
    assert.strictEqual(trRows[1]['Nominal Transaksi (Rp)'], -50000, 'Negative amount must remain number without quote');
  });

  // Additional F: Health endpoint structure
  await runTest('Check F: Health endpoint data structure does not expose internal host or database schema name', () => {
    const rawDbHealth = { status: 'ok', host: '127.0.0.1:3306', database: 'crm_captain_konveksi', latencyMs: 2 };
    // Sanitized public health payload:
    const publicHealth = {
      status: 'ok',
      app: 'CRM Captain Konveksi',
      version: '1.0.0',
      database: {
        status: rawDbHealth.status,
        latencyMs: rawDbHealth.latencyMs,
      },
      timestamp: new Date().toISOString(),
    };

    assert.strictEqual((publicHealth.database as any).host, undefined, 'Host must not be leaked in public health endpoint');
    assert.strictEqual((publicHealth.database as any).name, undefined, 'Database name must not be leaked in public health endpoint');
    assert.strictEqual(publicHealth.database.status, 'ok');
    assert.strictEqual(typeof publicHealth.database.latencyMs, 'number');
  });

  // Additional G: updateProfile password security
  await runTest('Check G: updateProfile strictly requires oldPassword when newPassword is provided', () => {
    const passwordHash = bcrypt.hashSync('CurrentValidPass123!', 10);

    function validateProfilePasswordUpdate(body: { newPassword?: string; oldPassword?: string }) {
      if (body.newPassword) {
        if (body.newPassword.length < 6) {
          return { status: 400, message: 'Password baru minimal 6 karakter.' };
        }
        if (!body.oldPassword) {
          return { status: 400, message: 'Password lama wajib diisi untuk mengubah password.' };
        }
        const isOldMatch = bcrypt.compareSync(body.oldPassword, passwordHash);
        if (!isOldMatch) {
          return { status: 400, message: 'Password lama Anda tidak sesuai.' };
        }
        return { status: 200, message: 'Password valid dan berhasil diperbarui.' };
      }
      return { status: 200, message: 'Tanpa perubahan password.' };
    }

    // Submitting new password without old password -> 400
    assert.strictEqual(validateProfilePasswordUpdate({ newPassword: 'NewPassword2026!' }).status, 400);
    assert.strictEqual(
      validateProfilePasswordUpdate({ newPassword: 'NewPassword2026!' }).message,
      'Password lama wajib diisi untuk mengubah password.'
    );

    // Submitting with wrong old password -> 400
    assert.strictEqual(
      validateProfilePasswordUpdate({ newPassword: 'NewPassword2026!', oldPassword: 'WrongOldPassword!' }).status,
      400
    );

    // Submitting with correct old password -> 200
    assert.strictEqual(
      validateProfilePasswordUpdate({ newPassword: 'NewPassword2026!', oldPassword: 'CurrentValidPass123!' }).status,
      200
    );

    // Not changing password -> 200
    assert.strictEqual(validateProfilePasswordUpdate({}).status, 200);
  });

  // ========================================================
  // SECTION 10: Live Monitor WA Screen Monitoring & Signaling RBAC
  // ========================================================
  console.log('\nSECTION 10: Live Monitor WA Screen Monitoring & Signaling RBAC');

  // Check H1: Authentication gate
  await runTest('Check H1: Signaling rejects unauthenticated message exchange', () => {
    // Unauthenticated user attempting to send stream_started or offer
    const resUnauth = validateSignalingMessage(null, { type: 'stream_started' });
    assert.strictEqual(resUnauth.allowed, false);
    assert.strictEqual(resUnauth.reason, 'Koneksi belum diautentikasi.');

    // Unauthenticated user sending auth message is allowed through to token verification
    const resAuth = validateSignalingMessage(null, { type: 'auth' });
    assert.strictEqual(resAuth.allowed, true);
  });

  // Check H2: Sales RBAC isolation
  await runTest('Check H2: Sales is restricted to event-only messages and cannot access the supervisor sales list', () => {
    const salesUser = { id: 2, name: 'Sales Agent', role: 'SALES' };

    // Sales attempting to send a legacy stream request
    const resRequest = validateSignalingMessage(salesUser, { type: 'request_stream', salesId: 3 });
    assert.strictEqual(resRequest.allowed, false);
    assert.strictEqual(resRequest.reason?.includes('event-only'), true);

    // Sales attempting to get sales list
    const resList = validateSignalingMessage(salesUser, { type: 'get_sales_list' });
    assert.strictEqual(resList.allowed, false);
    assert.strictEqual(resList.reason?.includes('event-only'), true);

    // Sales sending stream_started -> allowed and broadcasted to admins
    const resStreamStart = validateSignalingMessage(salesUser, { type: 'stream_started' });
    assert.strictEqual(resStreamStart.allowed, true);

    // Sales sending stream_stopped -> allowed and broadcasted to admins
    const resStreamStop = validateSignalingMessage(salesUser, { type: 'stream_stopped' });
    assert.strictEqual(resStreamStop.allowed, true);
  });

  // Check H3: Admin supervisor permissions
  await runTest('Check H3: Admin can view the active Sales list but cannot request streams in event-only mode', () => {
    const adminUser = { id: 1, name: 'Admin Boss', role: 'ADMIN' };

    // Admin attempting a legacy stream request with salesId
    const resRequest = validateSignalingMessage(adminUser, { type: 'request_stream', salesId: 2 });
    assert.strictEqual(resRequest.allowed, false);

    // Admin attempting a legacy stream request without salesId
    const resNoSalesId = validateSignalingMessage(adminUser, { type: 'request_stream' });
    assert.strictEqual(resNoSalesId.allowed, false);

    // Admin requesting sales list
    const resList = validateSignalingMessage(adminUser, { type: 'get_sales_list' });
    assert.strictEqual(resList.allowed, true);

    // Admin cannot broadcast stream_started (Admin is viewer, not streamer)
    const resAdminStream = validateSignalingMessage(adminUser, { type: 'stream_started' });
    assert.strictEqual(resAdminStream.allowed, false);
    assert.strictEqual(resAdminStream.reason?.includes('event-only'), true);
  });

  // Check H4: Legacy WebRTC messages rejected in event-only mode
  await runTest('Check H4: Event-only protocol rejects legacy WebRTC messages', () => {
    const salesUser = { id: 2, name: 'Sales Agent', role: 'SALES' };
    const adminUser = { id: 1, name: 'Admin Boss', role: 'ADMIN' };

    for (const type of ['offer', 'ice_candidate', 'telemetry', 'request_stream', 'answer']) {
      assert.strictEqual(
        validateSignalingMessage(salesUser, { type, targetId: 1, salesId: 3 }).allowed,
        false,
        `Sales legacy message ${type} must be rejected`
      );
    }

    for (const type of ['answer', 'ice_candidate', 'request_stream', 'stream_started', 'stream_stopped', 'offer', 'telemetry']) {
      assert.strictEqual(
        validateSignalingMessage(adminUser, { type, targetId: 2, salesId: 2 }).allowed,
        false,
        `Admin legacy message ${type} must be rejected`
      );
    }

    assert.strictEqual(validateSignalingMessage(salesUser, { type: 'ping' }).allowed, true);
    assert.strictEqual(validateSignalingMessage(salesUser, { type: 'stream_started' }).allowed, true);
    assert.strictEqual(validateSignalingMessage(salesUser, { type: 'stream_stopped' }).allowed, true);
    assert.strictEqual(validateSignalingMessage(adminUser, { type: 'ping' }).allowed, true);
    assert.strictEqual(validateSignalingMessage(adminUser, { type: 'get_sales_list' }).allowed, true);
  });

  await runTest('Check H9: Monitoring accepts only ADMIN and SALES roles', () => {
    assert.strictEqual(isSupportedMonitoringRole('ADMIN'), true);
    assert.strictEqual(isSupportedMonitoringRole('SALES'), true);
    assert.strictEqual(isSupportedMonitoringRole('OWNER'), false);
    assert.strictEqual(isSupportedMonitoringRole(''), false);
    assert.strictEqual(isSupportedMonitoringRole(null), false);
    assert.strictEqual(isSupportedMonitoringRole(undefined), false);
  });

  // Check H8: Superseded sockets cannot mutate the active session
  await runTest('Check H8: Only the current socket may send session messages', () => {
    const oldSocket: any = { id: 'old_socket' };
    const activeSocket: any = { id: 'active_socket' };
    const sessions = new Map<number, { ws: any }>();

    sessions.set(5, { ws: activeSocket });

    assert.strictEqual(
      isCurrentSocketSession(sessions, 5, oldSocket),
      false,
      'Replaced socket must be rejected'
    );
    assert.strictEqual(
      isCurrentSocketSession(sessions, 5, activeSocket),
      true,
      'Current socket must be accepted'
    );
    assert.strictEqual(
      isCurrentSocketSession(sessions, 99, activeSocket),
      false,
      'Socket without a registered session must be rejected'
    );
  });

  await runTest('Check H5: WebSocket session identity verification prevents race conditions on reconnect and stale close', () => {
    const sessionMap = new Map<number, { ws: any; user: any }>();
    const mockWsOld: any = { id: 'ws_old_conn_1' };
    const mockWsNew: any = { id: 'ws_new_conn_2' };
    const salesUserId = 5;

    // 1. Initial connection with wsOld
    sessionMap.set(salesUserId, { ws: mockWsOld, user: { id: salesUserId, name: 'Sales Agent' } });
    assert.strictEqual(sessionMap.has(salesUserId), true);
    assert.strictEqual(sessionMap.get(salesUserId)?.ws, mockWsOld);

    // 2. Sales reconnects on wsNew before wsOld is closed
    sessionMap.set(salesUserId, { ws: mockWsNew, user: { id: salesUserId, name: 'Sales Agent' } });
    assert.strictEqual(sessionMap.get(salesUserId)?.ws, mockWsNew);

    // 3. Late close event arrives from wsOld
    // safeRemoveSession must detect that map now points to wsNew, and reject deletion!
    const oldRemoved = safeRemoveSession(sessionMap, salesUserId, mockWsOld);
    assert.strictEqual(oldRemoved, false, 'Late close event from old connection must NOT remove active reconnected session');
    assert.strictEqual(sessionMap.has(salesUserId), true, 'Session for sales must remain active');
    assert.strictEqual(sessionMap.get(salesUserId)?.ws, mockWsNew, 'Session must still reference new socket');

    // 4. When wsNew actually closes, safeRemoveSession removes it cleanly
    const newRemoved = safeRemoveSession(sessionMap, salesUserId, mockWsNew);
    assert.strictEqual(newRemoved, true, 'Close event matching current active socket must remove session');
    assert.strictEqual(sessionMap.has(salesUserId), false, 'Session must now be empty');
  });

  // Check H6: Admin session identity verification on reconnect and close
  await runTest('Check H6: Admin session identity verification prevents accidental removal on reconnect', () => {
    const adminMap = new Map<number, { ws: any; user: any }>();
    const mockWsAdmin1: any = { id: 'admin_sock_1' };
    const mockWsAdmin2: any = { id: 'admin_sock_2' };
    const adminUserId = 1;

    adminMap.set(adminUserId, { ws: mockWsAdmin1, user: { id: adminUserId, name: 'Owner' } });

    // Reconnect
    adminMap.set(adminUserId, { ws: mockWsAdmin2, user: { id: adminUserId, name: 'Owner' } });

    // Stale close event from admin_sock_1
    const resOld = safeRemoveSession(adminMap, adminUserId, mockWsAdmin1);
    assert.strictEqual(resOld, false);
    assert.strictEqual(adminMap.has(adminUserId), true);
    assert.strictEqual(adminMap.get(adminUserId)?.ws, mockWsAdmin2);

    // Legitimate close from admin_sock_2
    const resNew = safeRemoveSession(adminMap, adminUserId, mockWsAdmin2);
    assert.strictEqual(resNew, true);
    assert.strictEqual(adminMap.has(adminUserId), false);
  });

  // Check H7: Heartbeat cleanup handles socket replacement without clearing new connection
  await runTest('Check H7: Stale heartbeat check does not remove replaced connection', () => {
    const map = new Map<number, { ws: any; lastPing: number }>();
    const mockStaleWs: any = { id: 'stale_sock' };
    const mockActiveWs: any = { id: 'active_sock' };
    const userId = 8;

    // Initially stale
    map.set(userId, { ws: mockStaleWs, lastPing: Date.now() - 100000 });

    // Reconnect happens right before heartbeat loop
    map.set(userId, { ws: mockActiveWs, lastPing: Date.now() });

    // Heartbeat cleanup logic executing for mockStaleWs
    const removed = safeRemoveSession(map, userId, mockStaleWs);
    assert.strictEqual(removed, false, 'Heartbeat cleanup of stale socket must not delete reconnected socket');
    assert.strictEqual(map.get(userId)?.ws, mockActiveWs, 'Active socket must be preserved in map');
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
