import React, { useState, useEffect } from 'react';
import { Transaction, User } from '../types/index.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { apiRequest, downloadBlob } from '../api/client.js';
import { TransactionFormModal } from '../components/transactions/TransactionFormModal.js';
import { ConfirmModal } from '../components/common/ConfirmModal.js';
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Filter,
  Plus,
  Search,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
  Building2,
  User as UserIcon,
  Trash2,
  Edit2,
  ChevronDown,
  X,
  FileSpreadsheet,
} from 'lucide-react';

export const TransactionsPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [salesList, setSalesList] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [period, setPeriod] = useState<string>('all');
  const [selectedSalesId, setSelectedSalesId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Backend Summary stats
  const [summary, setSummary] = useState({
    total_omzet: 0,
    total_closing_count: 0,
    total_cancel_count: 0,
    total_cancel_amount: 0,
  });

  // Overview stats from backend
  const [overviewStats, setOverviewStats] = useState<any>(null);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [periodSummary, setPeriodSummary] = useState<any>(null);
  const [annualRecap, setAnnualRecap] = useState<Array<{ month: number; omzet: number; closing_count: number }>>([]);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Load Sales list for filter
  useEffect(() => {
    if (isAdmin) {
      apiRequest<{ success: boolean; data: User[] }>('/users').then(res => {
        if (res.success) {
          setSalesList(res.data.filter(u => u.role === 'SALES'));
        }
      });
    }
  }, [isAdmin]);

  const loadTransactions = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (period !== 'all') params.append('period', period);
      if (selectedSalesId !== 'all') params.append('sales_id', selectedSalesId);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (search.trim()) params.append('search', search.trim());
      if (period === 'custom') {
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
      }

      const res = await apiRequest<{
        success: boolean;
        data: Transaction[];
        summary: {
          total_omzet: number;
          total_closing_count: number;
          total_cancel_count: number;
          total_cancel_amount: number;
        };
      }>(`/transactions?${params.toString()}`);

      if (res.success) {
        setTransactions(res.data);
        if (res.summary) {
          setSummary(res.summary);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat transaksi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOverview = async () => {
    try {
      const params = new URLSearchParams({ month: selectedMonth, year: selectedYear });
      if (selectedSalesId !== 'all') params.append('sales_id', selectedSalesId);
      const res = await apiRequest<{ success: boolean; data: any }>(`/transactions/overview?${params.toString()}`);
      if (res.success) {
        setOverviewStats(res.data.omzet_summary);
        setPeriodSummary(res.data.period_summary || null);
        setAnnualRecap(res.data.annual_recap || []);
      }
    } catch (err) {
      console.error('Error fetching omzet overview', err);
      showToast('Gagal memuat ringkasan omzet dan pembayaran.', 'error');
    }
  };

  useEffect(() => {
    loadTransactions();
    loadOverview();
  }, [period, selectedSalesId, statusFilter, startDate, endDate, selectedMonth, selectedYear]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadTransactions();
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(`/transactions/${id}`, {
        method: 'DELETE',
      });
      if (res.success) {
        showToast('Transaksi berhasil dihapus.', 'success');
        loadTransactions();
        loadOverview();
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus transaksi.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = async (format: 'xlsx' | 'csv') => {
    const params = new URLSearchParams();
    params.append('format', format);
    if (period !== 'all') params.append('period', period);
    if (selectedSalesId !== 'all') params.append('sales_id', selectedSalesId);
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (search.trim()) params.append('search', search.trim());

    if (period === 'custom') {
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
    }

    try {
      const blob = await apiRequest<Blob>(
        `/export/transactions?${params.toString()}`
      );

      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('File laporan kosong atau format respons tidak valid.');
      }

      const dateParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      downloadBlob(blob, `Laporan_Transaksi_${dateParts}.${format}`);
      showToast(`Export ${format.toUpperCase()} berhasil diunduh.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengunduh file laporan.', 'error');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight">
            Laporan & Transaksi Closing (Omzet)
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pencatatan omzet deals konveksi real-time, multi-closing customer, dan analitik performa.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Export Dropdown */}
          <div className="relative group">
            <button
              type="button"
              className="min-h-[44px] px-3.5 py-2 border border-neutral-200 bg-white hover:bg-neutral-50 active:bg-neutral-100 rounded-xl text-xs font-semibold text-neutral-700 flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export</span>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-white border border-neutral-200 rounded-xl shadow-lg p-1 min-w-[140px] z-30">
              <button
                type="button"
                onClick={() => handleExport('xlsx')}
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 rounded-lg"
              >
                Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 rounded-lg"
              >
                CSV (.csv)
              </button>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setEditingTransaction(null);
                setIsFormOpen(true);
              }}
              className="min-h-[44px] px-4 py-2 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-[#c5a059] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs border border-[#c5a059]/30"
            >
              <Plus className="w-4 h-4 text-[#c5a059]" />
              <span>+ Catat Closing</span>
            </button>
          )}
        </div>
      </div>

      {/* Period selector and financial KPI */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-neutral-200/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Ringkasan Keuangan</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">Omzet dan pembayaran berdasarkan periode yang dipilih.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <label className="text-[11px] text-neutral-500 font-semibold">
              Bulan
              <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                className="block mt-1 w-full sm:w-36 min-h-[42px] px-3 border border-neutral-300 rounded-xl bg-white text-xs text-neutral-800">
                {[
                  'Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'
                ].map((month, index) => (
                  <option key={index} value={String(index + 1).padStart(2, '0')}>{month}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-neutral-500 font-semibold">
              Tahun
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                className="block mt-1 w-full sm:w-28 min-h-[42px] px-3 border border-neutral-300 rounded-xl bg-white text-xs text-neutral-800">
                {Array.from({ length: Math.max(7, now.getFullYear() - 2019 + 2) }, (_, index) => now.getFullYear() + 1 - index).map(year => (
                  <option key={year} value={String(year)}>{year}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mt-4">
          {[
            { label: 'Total Penjualan', value: periodSummary?.total_sales, note: `${periodSummary?.closing_count || 0} closing pada periode ini`, icon: DollarSign },
            { label: 'Pembayaran Diterima', value: periodSummary?.payments_received, note: 'Pembayaran dikurangi refund selesai', icon: TrendingUp },
            { label: 'Sisa Piutang', value: periodSummary?.outstanding_receivables, note: 'Saldo invoice aktif saat ini', icon: Calendar },
            { label: 'Invoice Belum Lunas', value: periodSummary?.unpaid_invoice_count, note: 'Jumlah invoice aktif bersaldo', icon: AlertTriangle, count: true },
          ].map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="bg-neutral-50 p-3.5 sm:p-4 rounded-xl border border-neutral-200 min-h-[112px] flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2 text-neutral-500">
                  <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide">{item.label}</span>
                  <Icon className="w-4 h-4 text-[#c5a059] shrink-0" />
                </div>
                <div className="my-2 text-base sm:text-xl font-extrabold text-neutral-900 font-mono tabular-nums truncate">
                  {periodSummary ? (item.count ? Number(item.value || 0).toLocaleString('id-ID') : `Rp ${Number(item.value || 0).toLocaleString('id-ID')}`) : '—'}
                </div>
                <div className="text-[10px] text-neutral-500">{item.note}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Annual omzet recap */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-neutral-200/80 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Rekap Omzet Tahunan {selectedYear}</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">Akumulasi closing berdasarkan tanggal transaksi.</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-neutral-500">Total setahun</div>
            <div className="text-sm sm:text-base font-extrabold text-neutral-900 font-mono">
              Rp {annualRecap.reduce((sum, row) => sum + Number(row.omzet || 0), 0).toLocaleString('id-ID')}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {[
            'Januari','Februari','Maret','April','Mei','Juni',
            'Juli','Agustus','September','Oktober','November','Desember'
          ].map((month, index) => {
            const row = annualRecap.find(item => item.month === index + 1);
            return (
              <div key={month} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                <div>
                  <div className="text-xs font-semibold text-neutral-800">{month}</div>
                  <div className="text-[10px] text-neutral-400">{row?.closing_count || 0} closing</div>
                </div>
                <div className="text-xs font-bold font-mono text-neutral-900 text-right">Rp {Number(row?.omzet || 0).toLocaleString('id-ID')}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Breakdown per Sales for Admin */}
      {isAdmin && overviewStats?.by_sales && overviewStats.by_sales.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-2xs">
          <div className="text-xs font-bold text-neutral-700 mb-2.5 flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-neutral-500" />
            <span>Pencapaian Omzet per Sales Staff</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {overviewStats.by_sales.map((s: any) => (
              <div
                key={s.sales_id}
                className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-100 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-neutral-900">{s.sales_name}</div>
                  <div className="text-[10px] text-neutral-400">{s.closing_count} deals closing</div>
                </div>
                <div className="text-xs font-bold text-neutral-900 font-mono">
                  Rp {s.omzet.toLocaleString('id-ID')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter & Search Bar (Mobile First) */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-neutral-200/80 shadow-2xs space-y-3">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari produk pesanan, customer, perusahaan..."
              className="w-full min-h-[44px] pl-10 pr-3 py-2 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
            />
          </div>
          <button
            type="submit"
            className="min-h-[44px] px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-semibold hover:bg-neutral-800 transition-colors"
          >
            Cari
          </button>
        </form>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Periode Selector */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] font-semibold text-neutral-500 shrink-0 mr-1">Periode:</span>
            {[
              { id: 'all', label: 'Semua' },
              { id: 'today', label: 'Hari Ini' },
              { id: 'this_week', label: 'Minggu Ini' },
              { id: 'this_month', label: 'Bulan Ini' },
              { id: 'custom', label: 'Custom' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  period === p.id
                    ? 'bg-neutral-900 text-[#c5a059] border border-[#c5a059]/40 font-bold shadow-2xs'
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[11px] font-semibold text-neutral-500 shrink-0">Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="min-h-[38px] px-2.5 py-1 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:border-[#c5a059] bg-white font-medium"
            >
              <option value="all">Semua Status</option>
              <option value="CLOSING">✓ Closing (Deal)</option>
              <option value="CANCEL">✕ Batal / Cancel</option>
            </select>
          </div>

          {/* Sales Filter (For Admin only) */}
          {isAdmin && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-neutral-500 shrink-0">Sales:</span>
              <select
                value={selectedSalesId}
                onChange={e => setSelectedSalesId(e.target.value)}
                className="min-h-[38px] px-2.5 py-1 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:border-[#c5a059] bg-white font-medium"
              >
                <option value="all">Semua Sales</option>
                {salesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Custom Date Range if 'custom' selected */}
        {period === 'custom' && (
          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-neutral-500 mb-1">Dari Tanggal:</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 border border-neutral-300 rounded-lg bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-neutral-500 mb-1">Sampai Tanggal:</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 border border-neutral-300 rounded-lg bg-white font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Transactions List (Mobile First Cards + Responsive) */}
      {isLoading ? (
        <div className="bg-white rounded-2xl p-8 border border-neutral-200 text-center text-xs text-neutral-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#c5a059] mb-2" />
          Memuat data transaksi omzet...
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-neutral-200 text-center text-xs text-neutral-500 space-y-2">
          <p>Belum ada data transaksi yang sesuai dengan filter.</p>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setEditingTransaction(null);
                setIsFormOpen(true);
              }}
              className="px-3.5 py-2 bg-neutral-900 text-[#c5a059] hover:bg-neutral-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border border-[#c5a059]/30 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Catat Closing Baru</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map(t => {
            const isClosing = t.status === 'CLOSING';

            return (
              <div
                key={t.id}
                className="bg-white rounded-2xl border border-neutral-200/90 hover:border-neutral-300 p-4 sm:p-5 transition-all shadow-2xs space-y-3"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400 font-mono flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-neutral-400" />
                        {t.transaction_date}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 flex items-center gap-1">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isClosing ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        {isClosing ? 'Closing Deal' : 'Cancel'}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-neutral-200 bg-white text-neutral-500">
                        {t.invoice_id ? 'Invoice' : 'Manual'}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-neutral-900 mt-1">{t.product}</h3>
                    {t.description && (
                      <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{t.description}</p>
                    )}
                  </div>

                  {/* Nominal Badge */}
                  <div className="text-right shrink-0">
                    <div
                      className={`text-base sm:text-lg font-black font-mono tabular-nums ${
                        isClosing ? 'text-neutral-900' : 'text-neutral-400 line-through'
                      }`}
                    >
                      Rp {Number(t.amount).toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>

                {/* Customer & Sales Information */}
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] text-neutral-400 uppercase font-semibold">Customer</div>
                    <div className="font-bold text-neutral-800">{t.customer_name || t.customer_name_manual || 'Tanpa Customer'}</div>
                    <div className="text-[11px] text-neutral-500">{t.company_name || '-'}</div>
                  </div>

                  <div>
                    <div className="text-[10px] text-neutral-400 uppercase font-semibold">Sales PIC</div>
                    <div className="font-semibold text-neutral-800">{t.sales_name || '-'}</div>
                    {t.notes && (
                      <div className="text-[11px] text-neutral-500 italic mt-0.5">"{t.notes}"</div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-100">
                  {isAdmin && !t.invoice_id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTransaction(t);
                        setIsFormOpen(true);
                      }}
                      className="min-h-[38px] px-3 py-1.5 border border-neutral-200 bg-white hover:bg-neutral-50 active:bg-neutral-100 rounded-xl text-xs font-semibold text-neutral-700 flex items-center gap-1.5 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Edit</span>
                    </button>
                  )}

                  {isAdmin && !t.invoice_id && (
                    <button
                      type="button"
                      onClick={() => setDeletingId(t.id)}
                      className="min-h-[38px] px-3 py-1.5 border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transaction Modal (Add / Edit) */}
      <TransactionFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingTransaction(null);
        }}
        onSuccess={() => {
          loadTransactions();
          loadOverview();
        }}
        initialTransaction={editingTransaction}
      />

      {/* Delete Confirmation Modal */}
      {deletingId !== null && (
        <ConfirmModal
          isOpen={true}
          title="Hapus Transaksi Omzet?"
          message="Transaksi ini akan dihapus dari histori omzet secara permanen. Tindakan ini akan dicatat dalam audit log forensik."
          confirmLabel="Hapus Transaksi"
          isDanger={true}
          onConfirm={() => handleDelete(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
};
