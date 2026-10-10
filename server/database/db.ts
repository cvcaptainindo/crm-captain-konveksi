import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
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
  last_contact_date: string; // YYYY-MM-DD
  next_follow_up_date: string; // YYYY-MM-DD
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
  customer_id: number;
  sales_id: number;
  transaction_date: string; // YYYY-MM-DD
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

export interface DatabaseState {
  users: User[];
  customer_statuses: CustomerStatus[];
  follow_up_rules: FollowUpRule[];
  customers: Customer[];
  customer_custom_rules: CustomerCustomRule[];
  whatsapp_templates: WhatsAppTemplate[];
  follow_up_activities: FollowUpActivity[];
  transactions: Transaction[];
  audit_logs: AuditLog[];
  seq: {
    users: number;
    customer_statuses: number;
    follow_up_rules: number;
    customers: number;
    customer_custom_rules: number;
    whatsapp_templates: number;
    follow_up_activities: number;
    transactions: number;
    audit_logs: number;
  };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'crm_database.json');

class DatabaseEngine {
  private state: DatabaseState;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDataDir();
    this.state = this.loadOrSeed();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadOrSeed(): DatabaseState {
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const loaded = JSON.parse(raw);
        return this.migrateState(loaded);
      } catch (err) {
        console.warn('Could not parse database file, re-seeding...', err);
      }
    }
    const seeded = this.getInitialSeedState();
    this.persistSync(seeded);
    return seeded;
  }

  /**
   * Safe migration to add new columns, tables, and statuses without data loss
   */
  private migrateState(loaded: any): DatabaseState {
    let modified = false;

    // 1. Ensure permanent Admin account & purge demo accounts
    const permanentAdminEmail = 'cvcaptainindo@gmail.com';
    const permanentAdminHash = bcrypt.hashSync('sholat5waktu', 10);
    const demoEmails = [
      'admin@captainkonveksi.com',
      'sales1@captainkonveksi.com',
      'sales2@captainkonveksi.com',
    ];

    if (Array.isArray(loaded.users)) {
      // Remove demo accounts
      const initialUserCount = loaded.users.length;
      loaded.users = loaded.users.filter(
        (u: any) => !demoEmails.includes(u.email?.toLowerCase())
      );
      if (loaded.users.length !== initialUserCount) {
        modified = true;
      }

      // Check if permanent admin exists
      const existingAdmin = loaded.users.find(
        (u: any) => u.email?.toLowerCase() === permanentAdminEmail
      );

      if (existingAdmin) {
        existingAdmin.role = 'ADMIN';
        existingAdmin.account_status = 'ACTIVE';
        existingAdmin.is_active = true;
        existingAdmin.password_hash = permanentAdminHash;
        existingAdmin.updated_at = new Date().toISOString();
        modified = true;
      } else {
        const now = new Date().toISOString();
        loaded.users.unshift({
          id: 1,
          name: 'Owner Captain Konveksi',
          email: permanentAdminEmail,
          phone: '6281122334455',
          password_hash: permanentAdminHash,
          role: 'ADMIN',
          account_status: 'ACTIVE',
          is_active: true,
          created_at: now,
          updated_at: now,
        });
        modified = true;
      }

      // Ensure all remaining users have account_status
      loaded.users.forEach((u: any) => {
        if (!u.account_status) {
          u.account_status = u.is_active ? 'ACTIVE' : 'INACTIVE';
          modified = true;
        }
      });
    }

    // Reassign any customers/transactions that were assigned to removed demo accounts to admin id 1
    const validUserIds = new Set(loaded.users.map((u: any) => u.id));
    if (Array.isArray(loaded.customers)) {
      loaded.customers.forEach((c: any) => {
        if (!validUserIds.has(c.assigned_sales_id)) {
          c.assigned_sales_id = 1;
          modified = true;
        }
      });
    }
    if (Array.isArray(loaded.transactions)) {
      loaded.transactions.forEach((t: any) => {
        if (!validUserIds.has(t.sales_id)) {
          t.sales_id = 1;
          modified = true;
        }
      });
    }

    // 2. Ensure standard customer statuses exist (PROSPEK, FOLLOW_UP, NEGOSIASI, CLOSING, CANCEL, INACTIVE)
    const standardStatuses: CustomerStatus[] = [
      { id: 1, code: 'PROSPEK', label: 'Prospek', color_code: '#3B82F6', sort_order: 1, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 2, code: 'FOLLOW_UP', label: 'Follow-Up', color_code: '#F59E0B', sort_order: 2, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 3, code: 'NEGOSIASI', label: 'Negosiasi', color_code: '#8B5CF6', sort_order: 3, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 4, code: 'CLOSING', label: 'Closing (Deal)', color_code: '#059669', sort_order: 4, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 5, code: 'CANCEL', label: 'Batal / Cancel', color_code: '#EF4444', sort_order: 5, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 6, code: 'INACTIVE', label: 'Tidak Aktif', color_code: '#6B7280', sort_order: 6, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ];

    if (!Array.isArray(loaded.customer_statuses) || loaded.customer_statuses.length === 0) {
      loaded.customer_statuses = standardStatuses;
      modified = true;
    } else {
      // Check if standard codes are present, if not update/replace gracefully
      const hasProspek = loaded.customer_statuses.some((s: any) => s.code === 'PROSPEK');
      if (!hasProspek) {
        loaded.customer_statuses = standardStatuses;
        modified = true;
      }
    }

    // 3. Ensure transactions table exists
    if (!Array.isArray(loaded.transactions)) {
      const now = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0];
      
      const d10DaysAgo = new Date();
      d10DaysAgo.setDate(d10DaysAgo.getDate() - 10);
      const d5DaysAgo = new Date();
      d5DaysAgo.setDate(d5DaysAgo.getDate() - 5);

      // Seed PT Sumber Makmur 3 closings (65jt total) as specified in prompt
      loaded.transactions = [
        {
          id: 1,
          customer_id: 1,
          sales_id: 2,
          transaction_date: d10DaysAgo.toISOString().split('T')[0],
          product: '100 pcs Jaket Bomber Konveksi',
          description: 'Closing batch 1 seragam lapangan',
          amount: 20000000,
          status: 'CLOSING',
          notes: 'Bahan Taslan ZN, bordir logo komputer',
          created_at: now,
          updated_at: now,
        },
        {
          id: 2,
          customer_id: 1,
          sales_id: 2,
          transaction_date: d5DaysAgo.toISOString().split('T')[0],
          product: '150 pcs Polo Shirt Lacoste CVC',
          description: 'Closing batch 2 seragam kantor',
          amount: 15000000,
          status: 'CLOSING',
          notes: 'Kain Lacoste CVC 24s Navy',
          created_at: now,
          updated_at: now,
        },
        {
          id: 3,
          customer_id: 1,
          sales_id: 2,
          transaction_date: today,
          product: '250 pcs Kemeja Drill Seragam',
          description: 'Closing batch 3 seragam harian divisi operasional',
          amount: 30000000,
          status: 'CLOSING',
          notes: 'Kain American Drill Grade A',
          created_at: now,
          updated_at: now,
        },
      ];
      modified = true;
    }

    // 4. Ensure sequences
    if (!loaded.seq) loaded.seq = {};
    if (!loaded.seq.transactions) {
      loaded.seq.transactions = loaded.transactions.length || 3;
      modified = true;
    }

    if (modified) {
      this.persistSync(loaded);
    }

    return loaded;
  }

  private persistSync(state: DatabaseState) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
  }

  public save() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.persistSync(this.state);
      this.saveTimeout = null;
    }, 100);
  }

  public getInitialSeedState(): DatabaseState {
    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];

    // Calculate dates for sample follow-ups
    const dOverdue = new Date();
    dOverdue.setDate(dOverdue.getDate() - 3);
    const dateOverdue = dOverdue.toISOString().split('T')[0];

    const dLastOverdue = new Date();
    dLastOverdue.setDate(dLastOverdue.getDate() - 6);
    const dateLastOverdue = dLastOverdue.toISOString().split('T')[0];

    const dLastToday = new Date();
    dLastToday.setDate(dLastToday.getDate() - 3);
    const dateLastToday = dLastToday.toISOString().split('T')[0];

    const dUpcoming = new Date();
    dUpcoming.setDate(dUpcoming.getDate() + 4);
    const dateUpcoming = dUpcoming.toISOString().split('T')[0];

    const dLastUpcoming = new Date();
    dLastUpcoming.setDate(dLastUpcoming.getDate() - 3);
    const dateLastUpcoming = dLastUpcoming.toISOString().split('T')[0];

    const adminHash = bcrypt.hashSync('sholat5waktu', 10);

    return {
      users: [
        {
          id: 1,
          name: 'Owner Captain Konveksi',
          email: 'cvcaptainindo@gmail.com',
          phone: '6281122334455',
          password_hash: adminHash,
          role: 'ADMIN',
          account_status: 'ACTIVE',
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ],
      customer_statuses: [
        { id: 1, code: 'PROSPEK', label: 'Prospek', color_code: '#3B82F6', sort_order: 1, is_active: true, created_at: now, updated_at: now },
        { id: 2, code: 'FOLLOW_UP', label: 'Follow-Up', color_code: '#F59E0B', sort_order: 2, is_active: true, created_at: now, updated_at: now },
        { id: 3, code: 'NEGOSIASI', label: 'Negosiasi', color_code: '#8B5CF6', sort_order: 3, is_active: true, created_at: now, updated_at: now },
        { id: 4, code: 'CLOSING', label: 'Closing (Deal)', color_code: '#059669', sort_order: 4, is_active: true, created_at: now, updated_at: now },
        { id: 5, code: 'CANCEL', label: 'Batal / Cancel', color_code: '#EF4444', sort_order: 5, is_active: true, created_at: now, updated_at: now },
        { id: 6, code: 'INACTIVE', label: 'Tidak Aktif', color_code: '#6B7280', sort_order: 6, is_active: true, created_at: now, updated_at: now },
      ],
      follow_up_rules: [
        { id: 1, step_number: 1, name: 'Follow-up 1 (Cek Kebutuhan & Katalog)', interval_days: 3, is_active: true, description: 'Follow-up 3 hari setelah kontak pertama', created_at: now, updated_at: now },
        { id: 2, step_number: 2, name: 'Follow-up 2 (Penawaran Harga & Desain)', interval_days: 7, is_active: true, description: 'Follow-up 7 hari untuk detail penawaran', created_at: now, updated_at: now },
        { id: 3, step_number: 3, name: 'Follow-up 3 (Sampel Kain & Negosiasi)', interval_days: 14, is_active: true, description: 'Follow-up 14 hari untuk keputusan sampel/mockup', created_at: now, updated_at: now },
        { id: 4, step_number: 4, name: 'Follow-up 4 (Re-engagement / Promo)', interval_days: 30, is_active: true, description: 'Follow-up 30 hari untuk re-engagement jangka panjang', created_at: now, updated_at: now },
      ],
      customer_custom_rules: [],
      whatsapp_templates: [
        {
          id: 1,
          title: 'Follow-up Penawaran Konveksi',
          code: 'FU_PENAWARAN',
          category: 'FOLLOW_UP',
          content: 'Halo Bapak/Ibu {{nama_customer}} dari {{perusahaan}},\n\nSalam dari Captain Konveksi. Izin konfirmasi apakah penawaran seragam {{produk}} yang kami kirimkan sebelumnya sudah sempat dipelajari?\n\nJika ada penyesuaian bahan kain atau target deadline, kami siap diskusikan.\n\nTerima kasih,\n{{nama_sales}}\nCaptain Konveksi',
          is_active: true,
          created_by: 1,
          created_at: now,
          updated_at: now,
        },
        {
          id: 2,
          title: 'Follow-up Sampel Kain & Mockup',
          code: 'FU_SAMPEL',
          category: 'FOLLOW_UP',
          content: 'Selamat siang {{nama_customer}},\n\nSemoga sehat selalu. Mengenai rencana pesanan {{produk}} untuk {{perusahaan}}, apakah berkenan kami kirimkan sampel bahan kain atau mockup desain preview?\n\nKami siap kirimkan langsung ke alamat Bapak/Ibu.\n\nSalam hangat,\n{{nama_sales}}\nCaptain Konveksi',
          is_active: true,
          created_by: 1,
          created_at: now,
          updated_at: now,
        },
        {
          id: 3,
          title: 'Re-engagement Promo Khusus',
          code: 'FU_REENGAGE',
          category: 'PROMO',
          content: 'Halo {{nama_customer}},\n\nApa kabar {{perusahaan}}? Kami dari Captain Konveksi ingin mengabarkan bahwa saat ini ada promo potongan khusus untuk pemesanan rompi, kemeja, dan jaket konveksi {{produk}}.\n\nApakah dalam waktu dekat ada agenda pengadaan seragam tim?\n\nTerima kasih,\n{{nama_sales}}',
          is_active: true,
          created_by: 1,
          created_at: now,
          updated_at: now,
        },
      ],
      customers: [
        {
          id: 1,
          customer_code: 'CK-CUST-001',
          name: 'Pak Budi Hartono',
          company_name: 'PT Sumber Makmur Sejahtera',
          whatsapp_number: '6281298765432',
          phone_number: '021-5551234',
          email: 'budi.h@sumbermakmur.co.id',
          address: 'Jl. Industri Raya No. 45, Kawasan MM2100',
          city: 'Cikarang',
          pic_name: 'Pak Budi (Procurement Manager)',
          assigned_sales_id: 2,
          status_id: 4, // CLOSING (DEAL)
          notes: 'Kebutuhan 250 pcs polo shirt seragam pabrik bahan Lacoste CVC 24s. Sudah closing beberapa batch.',
          use_custom_rule: false,
          current_rule_step: 3,
          last_contact_date: dateLastOverdue,
          next_follow_up_date: dateOverdue,
          deleted_at: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: 2,
          customer_code: 'CK-CUST-002',
          name: 'Ibu Ratna Dewi',
          company_name: 'CV Maju Jaya Abadi',
          whatsapp_number: '6281311223344',
          phone_number: '022-7778899',
          email: 'ratna.dewi@majujaya.com',
          address: 'Jl. Riau No. 12',
          city: 'Bandung',
          pic_name: 'Ibu Ratna (HR & GA)',
          assigned_sales_id: 2,
          status_id: 2, // FOLLOW_UP
          notes: 'Pesanan 100 pcs jaket bomber taslan untuk gathering tahunan. Minta sampel bordir logo.',
          use_custom_rule: false,
          current_rule_step: 1,
          last_contact_date: dateLastToday,
          next_follow_up_date: today, // DUE TODAY
          deleted_at: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: 3,
          customer_code: 'CK-CUST-003',
          name: 'Pak Hendra Kurniawan',
          company_name: 'PT ABC Logistik Nusantara',
          whatsapp_number: '6285244556677',
          phone_number: '021-8899001',
          email: 'hendra.k@abclogistics.id',
          address: 'Jl. Gatot Subroto Kav. 18',
          city: 'Jakarta Selatan',
          pic_name: 'Pak Hendra (Operational Head)',
          assigned_sales_id: 1,
          status_id: 1, // PROSPEK
          notes: 'Customer baru dari referensi pameran. Tanya katalog rompi safety scotlight.',
          use_custom_rule: false,
          current_rule_step: 1,
          last_contact_date: dateLastUpcoming,
          next_follow_up_date: dateUpcoming, // UPCOMING
          deleted_at: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: 4,
          customer_code: 'CK-CUST-004',
          name: 'Pak Doni Prasetyo',
          company_name: 'Klinik Medika Sehat',
          whatsapp_number: '6287788991122',
          phone_number: '0274-567890',
          email: 'admin@medikasehat.com',
          address: 'Jl. Kaliurang Km 5',
          city: 'Yogyakarta',
          pic_name: 'Pak Doni (Owner)',
          assigned_sales_id: 1,
          status_id: 4, // CLOSING (DEAL)
          notes: 'Sudah deal 50 set scrub medis dan jas lab bordir. Pembayaran DP 50% diterima.',
          use_custom_rule: false,
          current_rule_step: 2,
          last_contact_date: today,
          next_follow_up_date: dateUpcoming,
          deleted_at: null,
          created_at: now,
          updated_at: now,
        },
      ],
      follow_up_activities: [
        {
          id: 1,
          customer_id: 1,
          user_id: 1,
          activity_date: dLastOverdue.toISOString(),
          channel: 'WHATSAPP',
          template_id: 1,
          message_sent: 'Halo Pak Budi dari PT Sumber Makmur, izin konfirmasi penawaran kaos polo...',
          result_status: 'Deal / Closing (Customer)',
          notes: 'Pak Budi setuju penawaran batch 1.',
          rule_step_executed: 1,
          previous_follow_up_date: null,
          next_follow_up_date: dateOverdue,
          created_at: dLastOverdue.toISOString(),
        },
        {
          id: 2,
          customer_id: 2,
          user_id: 1,
          activity_date: dLastToday.toISOString(),
          channel: 'WHATSAPP',
          template_id: 2,
          message_sent: 'Selamat siang Ibu Ratna, mengenai rencana jaket bomber...',
          result_status: 'Minta Sampel',
          notes: 'Minta dikirimkan sampel bahan Taslan ZN warna Navy.',
          rule_step_executed: 1,
          previous_follow_up_date: null,
          next_follow_up_date: today,
          created_at: dLastToday.toISOString(),
        },
      ],
      transactions: [
        {
          id: 1,
          customer_id: 1,
          sales_id: 1,
          transaction_date: '2026-09-20',
          product: '100 pcs Jaket Bomber Konveksi',
          description: 'Closing batch 1 seragam lapangan',
          amount: 20000000,
          status: 'CLOSING',
          notes: 'Taslan ZN bordir komputer',
          created_at: now,
          updated_at: now,
        },
        {
          id: 2,
          customer_id: 1,
          sales_id: 1,
          transaction_date: '2026-09-26',
          product: '150 pcs Polo Shirt Lacoste CVC',
          description: 'Closing batch 2 seragam kantor',
          amount: 15000000,
          status: 'CLOSING',
          notes: 'Warna Navy variasi putih',
          created_at: now,
          updated_at: now,
        },
        {
          id: 3,
          customer_id: 1,
          sales_id: 1,
          transaction_date: today,
          product: '250 pcs Kemeja Drill Seragam',
          description: 'Closing batch 3 seragam harian divisi operasional',
          amount: 30000000,
          status: 'CLOSING',
          notes: 'American Drill Grade A',
          created_at: now,
          updated_at: now,
        },
      ],
      audit_logs: [
        {
          id: 1,
          user_id: 1,
          user_name: 'Owner Captain Konveksi',
          action: 'INIT_SYSTEM',
          entity: 'SYSTEM',
          entity_id: null,
          ip_address: '127.0.0.1',
          user_agent: 'System Initializer',
          old_data: null,
          new_data: { version: '1.0.0', initialized: true },
          created_at: now,
        },
      ],
      seq: {
        users: 1,
        customer_statuses: 6,
        follow_up_rules: 4,
        customers: 4,
        customer_custom_rules: 0,
        whatsapp_templates: 3,
        follow_up_activities: 2,
        transactions: 3,
        audit_logs: 1,
      },
    };
  }

  // Getters & mutators
  public getState(): DatabaseState {
    return this.state;
  }

  public nextId(table: keyof DatabaseState['seq']): number {
    this.state.seq[table] += 1;
    this.save();
    return this.state.seq[table];
  }
}

export const db = new DatabaseEngine();
