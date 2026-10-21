import React, { useState, useEffect, useCallback } from 'react';
import { FollowUpMonitoringItem, User } from '../types/index.js';
import { apiRequest } from '../api/client.js';
import { useToast } from '../contexts/ToastContext.js';
import {
  MessageSquare,
  Search,
  Filter,
  Calendar,
  Users,
  ShieldCheck,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  PhoneCall,
  FileText,
} from 'lucide-react';

export const WhatsAppMonitoringPage: React.FC = () => {
  const { showToast } = useToast();

  const [activities, setActivities] = useState<FollowUpMonitoringItem[]>([]);
  const [salesList, setSalesList] = useState<User[]>([]);
  const [selectedSalesId, setSelectedSalesId] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedActivity, setSelectedActivity] = useState<FollowUpMonitoringItem | null>(null);

  // Load Sales list for filter dropdown
  useEffect(() => {
    const fetchSales = async () => {
      try {
        const res = await apiRequest('/users');
        if (res.success && Array.isArray(res.data)) {
          setSalesList(res.data.filter((u: User) => u.role === 'SALES'));
        }
      } catch (err) {
        console.warn('Could not load sales list for filter', err);
      }
    };
    fetchSales();
  }, []);

  // Load follow-up communication monitoring data
  const loadMonitoringData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '25');

      if (selectedSalesId !== 'all') {
        params.set('sales_id', selectedSalesId);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }
      if (dateFrom) {
        params.set('date_from', dateFrom);
      }
      if (dateTo) {
        params.set('date_to', dateTo);
      }

      const res = await apiRequest(`/follow-ups/monitoring?${params.toString()}`);
      if (res.success && res.data) {
        setActivities(res.data.activities || []);
        if (res.data.pagination) {
          setTotalCount(res.data.pagination.total || 0);
          setTotalPages(res.data.pagination.totalPages || 1);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat log monitoring follow-up.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [page, selectedSalesId, search, dateFrom, dateTo]);

  useEffect(() => {
    loadMonitoringData();
  }, [loadMonitoringData]);

  const handleResetFilter = () => {
    setSelectedSalesId('all');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const formatDateString = (dtStr?: string) => {
    if (!dtStr) return '-';
    try {
      const d = new Date(dtStr);
      return d.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dtStr;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto overflow-x-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
              Monitoring Follow-Up WhatsApp
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30">
              ADMIN AUDIT & KOMUNIKASI
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Audit riwayat komunikasi nyata, waktu interaksi, isi pesan, dan catatan tindak lanjut Sales ke customer.
          </p>
        </div>

        <button
          type="button"
          onClick={loadMonitoringData}
          className="self-start sm:self-auto min-h-[36px] px-3.5 py-1.5 bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#c5a059]' : ''}`} />
          <span>Segarkan Log</span>
        </button>
      </div>

      {/* Architecture & WhatsApp Web Synchronization Audit Banner */}
      <div className="bg-neutral-900 rounded-2xl p-4 sm:p-5 text-white border border-neutral-800 shadow-sm space-y-3">
        <div className="flex items-center gap-2.5 text-[#c5a059]">
          <ShieldCheck className="w-5 h-5" />
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider">
            Audit Teknis Arsitektur Sinkronisasi WhatsApp Web
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs leading-relaxed text-neutral-300">
          <div className="p-3 bg-neutral-800/80 rounded-xl border border-neutral-700/60">
            <div className="font-bold text-white mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              1. Integritas Data Riil
            </div>
            Data riwayat di bawah adalah catatan komunikasi aktual yang disimpan di database MySQL melalui sistem CRM. Tidak ada simulasi, fake bot, atau status centang palsu.
          </div>

          <div className="p-3 bg-neutral-800/80 rounded-xl border border-neutral-700/60">
            <div className="font-bold text-white mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#c5a059]" />
              2. Batasan Browser (SOP & CSP)
            </div>
            Kebijakan keamanan browser (Same-Origin Policy) melarang situs pihak ketiga membaca isi chat internal tab <code>web.whatsapp.com</code> secara sepihak tanpa izin resmi.
          </div>

          <div className="p-3 bg-neutral-800/80 rounded-xl border border-neutral-700/60">
            <div className="font-bold text-white mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              3. Kepatuhan Bebas Banned
            </div>
            Aplikasi menolak metode scraping bayangan (shadow scraping) atau injeksi sesi ilegal yang melanggar ToS WhatsApp dan berisiko memblokir nomor telepon bisnis perusahaan.
          </div>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Total Aktivitas Tercatat
          </span>
          <div className="my-1 text-2xl sm:text-3xl font-extrabold font-mono text-neutral-900 tabular-nums">
            {totalCount}
          </div>
          <span className="text-[10px] text-neutral-500">Log komunikasi customer</span>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Tim Sales Aktif
          </span>
          <div className="my-1 text-2xl sm:text-3xl font-extrabold font-mono text-neutral-900 tabular-nums">
            {salesList.length}
          </div>
          <span className="text-[10px] text-neutral-500">Sales terdaftar di CRM</span>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Kanal Komunikasi
          </span>
          <div className="my-1 text-sm sm:text-base font-bold font-mono text-emerald-700">
            WhatsApp & CRM
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold">Terdokumentasi resmi</span>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Status Read Receipt
          </span>
          <div className="my-1 text-sm sm:text-base font-bold font-mono text-neutral-900">
            Tercatat di CRM
          </div>
          <span className="text-[10px] text-neutral-500">Tanpa centang palsu</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-neutral-200/90 p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Sales Filter */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Filter Sales Penanggung Jawab
            </label>
            <select
              value={selectedSalesId}
              onChange={(e) => {
                setSelectedSalesId(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#c5a059]/40 min-h-[38px]"
            >
              <option value="all">-- Semua Akun Sales --</option>
              {salesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Dari Tanggal
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#c5a059]/40 min-h-[38px]"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Sampai Tanggal
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#c5a059]/40 min-h-[38px]"
            />
          </div>

          {/* Search */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Pencarian Teks / Customer
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Nama / PT / No WA / Catatan..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full text-xs pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#c5a059]/40 min-h-[38px]"
              />
            </div>
          </div>
        </div>

        {(selectedSalesId !== 'all' || search || dateFrom || dateTo) && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleResetFilter}
              className="text-xs text-[#c5a059] hover:underline font-semibold cursor-pointer"
            >
              Reset Semua Filter
            </button>
          </div>
        )}
      </div>

      {/* Main Activities Table */}
      <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#c5a059]" />
            Daftar Rekaman Komunikasi WhatsApp & Follow-Up
          </h2>
          <span className="text-xs text-neutral-500 font-mono">
            Halaman {page} dari {totalPages}
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#c5a059] mb-2" />
            Memuat data rekaman komunikasi...
          </div>
        ) : activities.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 space-y-2">
            <Info className="w-8 h-8 mx-auto text-neutral-400" />
            <p className="text-xs font-semibold text-neutral-700">Belum ada rekaman follow-up yang sesuai filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-900 text-white border-b border-neutral-800">
                  <th className="py-3 px-4 font-semibold">Waktu Komunikasi</th>
                  <th className="py-3 px-4 font-semibold">Customer & PIC</th>
                  <th className="py-3 px-4 font-semibold">Sales PIC</th>
                  <th className="py-3 px-4 font-semibold">Hasil & Catatan Follow-Up</th>
                  <th className="py-3 px-4 font-semibold">Isi Pesan Terkirim</th>
                  <th className="py-3 px-4 font-semibold">Jadwal Berikutnya</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {activities.map((a) => (
                  <tr key={a.id} className="hover:bg-neutral-50/80 transition-colors">
                    {/* Waktu Komunikasi */}
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <div className="font-semibold text-neutral-900">{formatDateString(a.activity_date)}</div>
                      <span className="text-[10px] text-neutral-500 font-mono">ID #{a.id}</span>
                    </td>

                    {/* Customer */}
                    <td className="py-3 px-4 align-top">
                      <div className="font-bold text-neutral-900">{a.customer_name}</div>
                      {a.company_name && (
                        <div className="text-[11px] text-neutral-500">{a.company_name}</div>
                      )}
                      <div className="text-[11px] font-mono text-emerald-700 mt-0.5">
                        {a.whatsapp_number || '-'}
                      </div>
                    </td>

                    {/* Sales */}
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <div className="font-semibold text-neutral-900">{a.sales_name || `Sales #${a.user_id}`}</div>
                      <div className="text-[10px] text-neutral-500">{a.sales_email}</div>
                    </td>

                    {/* Hasil & Catatan */}
                    <td className="py-3 px-4 align-top max-w-xs">
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#c5a059]/15 text-[#9d7d3d] border border-[#c5a059]/30 mb-1">
                        {a.result_status}
                      </span>
                      {a.notes ? (
                        <p className="text-[11px] text-neutral-700 leading-snug line-clamp-3">
                          {a.notes}
                        </p>
                      ) : (
                        <span className="text-[10px] text-neutral-400 italic">Tanpa catatan tambahan</span>
                      )}
                    </td>

                    {/* Pesan */}
                    <td className="py-3 px-4 align-top max-w-xs">
                      {a.template_name && (
                        <div className="text-[10px] font-bold text-neutral-800 flex items-center gap-1 mb-0.5">
                          <MessageSquare className="w-3 h-3 text-emerald-600" />
                          <span>{a.template_name}</span>
                        </div>
                      )}
                      {a.message_sent ? (
                        <p className="text-[11px] text-neutral-600 line-clamp-2 italic font-mono bg-neutral-50 p-1.5 rounded-lg border border-neutral-200/60">
                          "{a.message_sent}"
                        </p>
                      ) : (
                        <span className="text-[10px] text-neutral-400 italic">Tidak ada salinan teks</span>
                      )}
                    </td>

                    {/* Jadwal Berikutnya */}
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      {a.next_follow_up_date ? (
                        <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-800">
                          <Calendar className="w-3.5 h-3.5 text-[#c5a059]" />
                          <span>{a.next_follow_up_date}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-neutral-400">Selesai / Sesuai Rencana</span>
                      )}
                      <div className="text-[10px] text-neutral-500 mt-0.5">
                        Step: #{a.rule_step_executed}
                      </div>
                    </td>

                    {/* Status Integritas */}
                    <td className="py-3 px-4 align-top text-center whitespace-nowrap">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200"
                        title="Tercatat dan diverifikasi di database CRM"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Tercatat CRM</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3.5 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              Menampilkan {activities.length} dari {totalCount} rekaman
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-neutral-300 disabled:opacity-40 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-neutral-600" />
              </button>

              <span className="text-xs font-mono text-neutral-700 px-2">
                {page} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-neutral-300 disabled:opacity-40 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 text-neutral-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
