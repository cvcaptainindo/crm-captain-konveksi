import * as XLSX from 'xlsx';
import { Customer, FollowUpActivity } from '../database/db.js';
import { calculateDaysSinceContact, determineFollowUpCategory } from './followUpEngine.js';

/**
 * Sanitizes spreadsheet cell strings to prevent CSV / Spreadsheet Formula Injection (CWE-1236).
 * Prepends a single quote (') if the string starts with '=', '+', '-', '@', '\t', or '\r'.
 * Non-string values (numbers, dates, booleans) remain untouched.
 */
export function sanitizeSpreadsheetCell(value: any): any {
  if (typeof value !== 'string') return value;
  // A lone dash is a display placeholder, not a spreadsheet formula.
  if (value === '-') return value;
  // Detect formula injection triggers (=, +, -, @, tab, CR) even if preceded by whitespace
  if (/^[\s]*[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function generateCustomerExport(
  customers: any[],
  format: 'xlsx' | 'csv' = 'xlsx',
  statusMap: Map<number, string> = new Map(),
  userMap: Map<number, string> = new Map()
): { buffer: Buffer; mimeType: string; filename: string } {
  const rows = customers.map(c => {
    const daysSince = calculateDaysSinceContact(c.last_contact_date);
    const statusLabel = c.status_label || statusMap.get(c.status_id) || 'Unknown';
    const statusCode = c.status_code || '';
    const fuStatus = c.fu_status || determineFollowUpCategory(c.next_follow_up_date, statusCode);
    const salesName = c.sales_name || userMap.get(c.assigned_sales_id) || 'Unassigned';

    return {
      'Kode Customer': c.customer_code || '-',
      'Nama Customer': sanitizeSpreadsheetCell(c.name),
      'Perusahaan': sanitizeSpreadsheetCell(c.company_name || '-'),
      'WhatsApp': sanitizeSpreadsheetCell(c.whatsapp_number),
      'Telepon': sanitizeSpreadsheetCell(c.phone_number || '-'),
      'Email': sanitizeSpreadsheetCell(c.email || '-'),
      'Kota': sanitizeSpreadsheetCell(c.city || '-'),
      'Alamat': sanitizeSpreadsheetCell(c.address || '-'),
      'PIC Customer': sanitizeSpreadsheetCell(c.pic_name || '-'),
      'Sales PIC': sanitizeSpreadsheetCell(salesName),
      'Status': statusLabel,
      'Status Follow-Up': fuStatus,
      'Kontak Terakhir': c.last_contact_date || '-',
      'Hari Sejak Kontak': `${daysSince} hari`,
      'Jadwal Follow-Up': c.next_follow_up_date || '-',
      'Rule Step': `Step ${c.current_rule_step || 1} ${c.use_custom_rule ? '(Custom)' : '(Default)'}`,
      'Catatan': sanitizeSpreadsheetCell(c.notes || '-'),
      'Dibuat Pada': c.created_at,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Customer');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (format === 'csv') {
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    return {
      buffer: Buffer.from(csvOutput, 'utf-8'),
      mimeType: 'text/csv',
      filename: `CRM_CaptainKonveksi_Customers_${timestamp}.csv`,
    };
  } else {
    const xlsxOutput = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      buffer: xlsxOutput,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `CRM_CaptainKonveksi_Customers_${timestamp}.xlsx`,
    };
  }
}

export function generateActivityExport(
  activities: any[],
  format: 'xlsx' | 'csv' = 'xlsx',
  customerMap: Map<number, string> = new Map(),
  companyMap: Map<number, string> = new Map(),
  userMap: Map<number, string> = new Map(),
  templateMap: Map<number, string> = new Map()
): { buffer: Buffer; mimeType: string; filename: string } {
  const rows = activities.map(a => ({
    'ID Aktivitas': a.id,
    'Tanggal Aktivitas': a.activity_date,
    'Nama Customer': sanitizeSpreadsheetCell(a.customer_name || customerMap.get(a.customer_id) || `Customer #${a.customer_id}`),
    'Perusahaan': sanitizeSpreadsheetCell(a.company_name || companyMap.get(a.customer_id) || '-'),
    'Sales Petugas': sanitizeSpreadsheetCell(a.user_name || userMap.get(a.user_id) || `User #${a.user_id}`),
    'Channel': a.channel,
    'Template WA': sanitizeSpreadsheetCell(a.template_title || (a.template_id ? templateMap.get(a.template_id) || '-' : '-')),
    'Hasil / Status': a.result_status,
    'Pesan Terkirim': sanitizeSpreadsheetCell(a.message_sent || '-'),
    'Catatan Sales': sanitizeSpreadsheetCell(a.notes || '-'),
    'Next Follow-Up': a.next_follow_up_date || '-',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Histori Follow-Up');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (format === 'csv') {
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    return {
      buffer: Buffer.from(csvOutput, 'utf-8'),
      mimeType: 'text/csv',
      filename: `CRM_CaptainKonveksi_FollowUp_${timestamp}.csv`,
    };
  } else {
    const xlsxOutput = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      buffer: xlsxOutput,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `CRM_CaptainKonveksi_FollowUp_${timestamp}.xlsx`,
    };
  }
}

export function generateTransactionExport(
  transactions: any[],
  format: 'xlsx' | 'csv' = 'xlsx',
  customerMap: Map<number, string> = new Map(),
  companyMap: Map<number, string> = new Map(),
  userMap: Map<number, string> = new Map()
): { buffer: Buffer; mimeType: string; filename: string } {
  const rows = transactions.map(t => ({
    'ID Transaksi': t.id,
    'Tanggal Transaksi': t.transaction_date,
    'Nama Customer': sanitizeSpreadsheetCell(t.customer_name || t.customer_name_manual || (t.customer_id ? customerMap.get(t.customer_id) || `Customer #${t.customer_id}` : 'Tanpa Customer')),
    'Perusahaan': sanitizeSpreadsheetCell(t.company_name || companyMap.get(t.customer_id) || '-'),
    'Sales PIC': sanitizeSpreadsheetCell(t.sales_name || (t.sales_id ? userMap.get(t.sales_id) || `Sales #${t.sales_id}` : '-')),
    'Sumber Omzet': t.invoice_id ? 'Invoice' : 'Manual',
    'Nama Produk / Pesanan': sanitizeSpreadsheetCell(t.product),
    'Deskripsi': sanitizeSpreadsheetCell(t.description || '-'),
    'Nominal Transaksi (Rp)': Number(t.amount) || 0,
    'Status': t.status,
    'Catatan': sanitizeSpreadsheetCell(t.notes || '-'),
    'Dicatat Pada': t.created_at,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Closing Transaksi');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (format === 'csv') {
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    return {
      buffer: Buffer.from(csvOutput, 'utf-8'),
      mimeType: 'text/csv',
      filename: `CRM_CaptainKonveksi_OmzetClosing_${timestamp}.csv`,
    };
  } else {
    const xlsxOutput = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      buffer: xlsxOutput,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `CRM_CaptainKonveksi_OmzetClosing_${timestamp}.xlsx`,
    };
  }
}
