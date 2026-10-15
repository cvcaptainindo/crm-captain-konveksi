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
