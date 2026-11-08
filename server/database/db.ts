import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  password_hash?: string;
  role: 'ADMIN' | 'SALES';
  account_status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REJECTED';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerStatus {
  id: number;
  code: string;
  label: string;
  color_code: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FollowUpRule {
  id: number;
  step_number: number;
  name: string;
  interval_days: number;
  is_active: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerCustomRule {
  id: number;
  customer_id: number;
  step_number: number;
  interval_days: number;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  customer_code: string;
  name: string;
  company_name: string;
  whatsapp_number: string;
  phone_number: string;
  email: string;
  address: string;
  city: string;
  pic_name: string;
  assigned_sales_id: number;
  status_id: number;
  notes: string;
  use_custom_rule: boolean;
  current_rule_step: number;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppTemplate {
  id: number;
  title: string;
  code: string;
  category: string;
  content: string;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface FollowUpActivity {
  id: number;
  customer_id: number;
  user_id: number;
  activity_date: string;
  channel: 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'MEETING' | 'OTHER';
  template_id: number | null;
  message_sent: string;
  result_status: string;
  notes: string;
  rule_step_executed: number;
  previous_follow_up_date: string | null;
  next_follow_up_date: string | null;
  created_at: string;
}

export interface Transaction {
  id: number;
  customer_id: number | null;
  customer_name_manual?: string | null;
  sales_id: number | null;
  invoice_id?: number | null;
  transaction_date: string;
  product: string;
  description: string;
  amount: number;
  status: 'CLOSING' | 'CANCEL';
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  user_name?: string;
  action: string;
  entity: string;
  entity_id: number | null;
  ip_address: string;
  user_agent: string;
  old_data: any;
  new_data: any;
  created_at: string;
}

// ========================================================
// MySQL Connection Pool Configuration
// ========================================================
export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'crm_captain_konveksi',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
  queueLimit: 0,
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10),
  decimalNumbers: true,
  dateStrings: true,
  timezone: '+07:00',
};

// Singleton pool instance
export const pool: Pool = mysql.createPool(dbConfig);

// Ensure every newly-created pooled connection uses the application WIB timezone.
// mysql2's `timezone` option controls JS date conversion; it does not set
// MySQL's @@session.time_zone, which controls NOW() and TIMESTAMP behavior.
pool.on('connection', (connection) => {
  void connection
    .promise()
    .query("SET time_zone = '+07:00'")
    .catch((error: any) => {
      console.error(
        `[DB] Failed to set MySQL session timezone (+07:00): ${error?.code || 'UNKNOWN'}`
      );
    });
});

// Configuration validation
export function validateDbConfig(): { isValid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!process.env.DB_HOST) {
    warnings.push('DB_HOST tidak diset dalam environment. Menggunakan fallback "localhost".');
  }
  if (!process.env.DB_USER) {
    warnings.push('DB_USER tidak diset dalam environment. Menggunakan fallback "root".');
  }
  if (!process.env.DB_NAME) {
    warnings.push('DB_NAME tidak diset dalam environment. Menggunakan fallback "crm_captain_konveksi".');
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.DB_PASSWORD) {
      errors.push('DB_PASSWORD kosong pada mode production. Ini adalah celah keamanan.');
    }
    if (!process.env.JWT_SECRET) {
      errors.push('JWT_SECRET wajib dikonfigurasi dalam environment di lingkungan production.');
    }
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

// Test MySQL connection
export async function testDbConnection(): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const startTime = Date.now();
  try {
    const conn = await pool.getConnection();
    try {
      await conn.ping();
      const latencyMs = Date.now() - startTime;
      return { ok: true, message: 'MySQL connection established successfully.', latencyMs };
    } finally {
      conn.release();
    }
  } catch (err: any) {
    return { ok: false, message: err.message || 'MySQL connection failed.' };
  }
}

// Database Health check
export async function checkDbHealth(): Promise<{
  status: 'ok' | 'error';
  database: string;
  host: string;
  latencyMs?: number;
  error?: string;
}> {
  const result = await testDbConnection();
  if (result.ok) {
    return {
      status: 'ok',
      database: dbConfig.database,
      host: dbConfig.host,
      latencyMs: result.latencyMs,
    };
  }
  return {
    status: 'error',
    database: dbConfig.database,
    host: dbConfig.host,
    error: result.message,
  };
}

// Parameterized Query helper
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

// Parameterized Execute helper
export async function execute(sql: string, params: any[] = []): Promise<ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as ResultSetHeader;
}

// Managed SQL Transaction helper
export async function withTransaction<T>(callback: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
