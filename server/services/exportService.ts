import * as XLSX from 'xlsx';
import { Customer, FollowUpActivity, db } from '../database/db.js';
import { calculateDaysSinceContact, determineFollowUpCategory } from './followUpEngine.js';

export function generateCustomerExport(
  customers: Customer[],
  format: 'xlsx' | 'csv' = 'xlsx'
): { buffer: Buffer; mimeType: string; filename: string } {
  const state = db.getState();
  const statusMap = new Map(state.customer_statuses.map(s => [s.id, s.label]));
  const userMap = new Map(state.users.map(u => [u.id, u.name]));

  const rows = customers.map(c => {
    const daysSince = calculateDaysSinceContact(c.last_contact_date);
    const statusCode = state.customer_statuses.find(s => s.id === c.status_id)?.code || '';
    const fuStatus = determineFollowUpCategory(c.next_follow_up_date, statusCode);

    return {
      'Kode Customer': c.customer_code,
      'Nama Customer': c.name,
      'Perusahaan': c.company_name || '-',
      'WhatsApp': c.whatsapp_number,
      'Telepon': c.phone_number || '-',
      'Email': c.email || '-',
      'Kota': c.city || '-',
      'Alamat': c.address || '-',
      'PIC Customer': c.pic_name || '-',
      'Sales PIC': userMap.get(c.assigned_sales_id) || 'Unassigned',
      'Status': statusMap.get(c.status_id) || 'Unknown',
      'Status Follow-Up': fuStatus,
      'Kontak Terakhir': c.last_contact_date || '-',
      'Hari Sejak Kontak': `${daysSince} hari`,
      'Jadwal Follow-Up': c.next_follow_up_date || '-',
      'Rule Step': `Step ${c.current_rule_step || 1} ${c.use_custom_rule ? '(Custom)' : '(Default)'}`,
      'Catatan': c.notes || '-',
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
  activities: FollowUpActivity[],
  format: 'xlsx' | 'csv' = 'xlsx'
): { buffer: Buffer; mimeType: string; filename: string } {
  const state = db.getState();
  const customerMap = new Map(state.customers.map(c => [c.id, c.name]));
  const companyMap = new Map(state.customers.map(c => [c.id, c.company_name]));
  const userMap = new Map(state.users.map(u => [u.id, u.name]));
  const templateMap = new Map(state.whatsapp_templates.map(t => [t.id, t.title]));

  const rows = activities.map(a => ({
    'ID Aktivitas': a.id,
    'Tanggal Aktivitas': a.activity_date,
    'Nama Customer': customerMap.get(a.customer_id) || `Customer #${a.customer_id}`,
    'Perusahaan': companyMap.get(a.customer_id) || '-',
    'Sales Petugas': userMap.get(a.user_id) || `User #${a.user_id}`,
    'Channel': a.channel,
    'Template WA': a.template_id ? templateMap.get(a.template_id) || '-' : '-',
    'Hasil / Status': a.result_status,
    'Pesan Terkirim': a.message_sent || '-',
    'Catatan Sales': a.notes || '-',
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
  format: 'xlsx' | 'csv' = 'xlsx'
): { buffer: Buffer; mimeType: string; filename: string } {
  const state = db.getState();
  const customerMap = new Map(state.customers.map(c => [c.id, c.name]));
  const companyMap = new Map(state.customers.map(c => [c.id, c.company_name]));
  const userMap = new Map(state.users.map(u => [u.id, u.name]));

  const rows = transactions.map(t => ({
    'ID Transaksi': t.id,
    'Tanggal Transaksi': t.transaction_date,
    'Nama Customer': customerMap.get(t.customer_id) || t.customer_name || `Customer #${t.customer_id}`,
    'Perusahaan': companyMap.get(t.customer_id) || t.company_name || '-',
    'Sales PIC': userMap.get(t.sales_id) || t.sales_name || `Sales #${t.sales_id}`,
    'Nama Produk / Pesanan': t.product,
    'Deskripsi': t.description || '-',
    'Nominal Transaksi (Rp)': Number(t.amount) || 0,
    'Status': t.status,
    'Catatan': t.notes || '-',
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

