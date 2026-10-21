import React, { useState, useEffect } from 'react';
import { Customer, DashboardStats } from '../types/index.js';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { SalesScreenSharePanel } from '../components/screenMonitoring/SalesScreenSharePanel.js';
import {
  Users,
  Clock,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Sparkles,
  PhoneCall,
  ChevronRight,
  Eye,
  RefreshCw,
  DollarSign,
  MessageSquare,
} from 'lucide-react';

interface DashboardPageProps {
  onOpenCustomerDetail: (customer: Customer) => void;
  onOpenFollowUpModal: (customer: Customer) => void;
  onNavigateToCustomers: () => void;
  onNavigateToTransactions?: () => void;
  onNavigateToWhatsAppWeb?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenCustomerDetail,
  onOpenFollowUpModal,
  onNavigateToCustomers,
  onNavigateToTransactions,
  onNavigateToWhatsAppWeb,
}) => {
  const { showToast } = useToast();
  const { isAdmin } = useAuth();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest('/follow-ups/dashboard');
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat data dashboard.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-sm text-neutral-500 flex flex-col items-center justify-center gap-2 min-h-[300px]">
        <RefreshCw className="w-5 h-5 animate-spin text-[#c5a059]" />
        <span className="text-xs">Memuat ringkasan follow-up Owner...</span>
      </div>
    );
  }

  const { stats, priority_action_list } = data;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-full overflow-x-hidden">
      {/* Page Title & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
            Dashboard Follow-Up
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Prioritas utama follow-up hari ini agar pesanan & calon pelanggan tidak terlepas.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {!isAdmin && onNavigateToWhatsAppWeb && (
            <button
              type="button"
              onClick={onNavigateToWhatsAppWeb}
              className="min-h-[44px] px-4 py-2.5 bg-[#c5a059] hover:bg-[#b38f48] active:bg-[#9d7d3d] text-neutral-900 rounded-xl text-xs font-bold shadow-2xs flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>WhatsApp Web</span>
            </button>
          )}

          <button
            type="button"
            onClick={onNavigateToCustomers}
            className="min-h-[44px] px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-white rounded-xl text-xs font-semibold shadow-2xs flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
          >
            <span>Semua Data Customer</span>
            <ChevronRight className="w-4 h-4 text-neutral-400" />
          </button>
        </div>
      </div>

      {/* For Sales: Dedicated Live Monitor WA Screen Sharing Panel */}
      {!isAdmin && <SalesScreenSharePanel />}

      {/* KPI Cards Grid - Consistent Base Color (White Surface + Subtle Border + Gold Accent) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {/* Priority 1: Overdue */}
        <button
          type="button"
          onClick={() => scrollToSection('section-overdue')}
          className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white hover:border-neutral-300 active:scale-98 transition-all text-left flex flex-col justify-between shadow-2xs cursor-pointer min-h-[105px]"
        >
          <div className="flex items-center justify-between text-neutral-500 w-full">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block mr-1.5" />
              Overdue
            </span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          </div>
          <div className="my-1 text-2xl sm:text-3xl font-extrabold font-mono text-neutral-900 tabular-nums">
            {stats.overdue}
          </div>
          <div className="text-[10px] text-rose-600 font-semibold truncate">Terlambat dihubungi</div>
        </button>

        {/* Priority 2: Due Today */}
        <button
          type="button"
          onClick={() => scrollToSection('section-due-today')}
          className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white hover:border-neutral-300 active:scale-98 transition-all text-left flex flex-col justify-between shadow-2xs cursor-pointer min-h-[105px]"
        >
          <div className="flex items-center justify-between text-neutral-500 w-full">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 rounded-full bg-[#c5a059] inline-block mr-1.5" />
              Hari Ini
            </span>
            <Clock className="w-3.5 h-3.5 text-[#c5a059] shrink-0" />
          </div>
          <div className="my-1 text-2xl sm:text-3xl font-extrabold font-mono text-neutral-900 tabular-nums">
            {stats.due_today}
          </div>
          <div className="text-[10px] text-[#c5a059] font-semibold truncate">Jatuh tempo sekarang</div>
        </button>

        {/* Priority 3: Upcoming */}
        <button
          type="button"
          onClick={() => scrollToSection('section-upcoming')}
          className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white hover:border-neutral-300 active:scale-98 transition-all text-left flex flex-col justify-between shadow-2xs cursor-pointer min-h-[105px]"
        >
          <div className="flex items-center justify-between text-neutral-500 w-full">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">Mendatang</span>
            <Calendar className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          </div>
          <div className="my-1 text-2xl sm:text-3xl font-extrabold font-mono text-neutral-900 tabular-nums">
            {stats.upcoming}
          </div>
          <div className="text-[10px] text-neutral-500 truncate">Jadwal berikutnya</div>
        </button>

        {/* Total Customers */}
        <button
          type="button"
          onClick={onNavigateToCustomers}
          className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white hover:border-neutral-300 active:scale-98 transition-all text-left flex flex-col justify-between shadow-2xs cursor-pointer min-h-[105px]"
        >
          <div className="flex items-center justify-between text-neutral-500 w-full">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">Total Customer</span>
            <Users className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          </div>
          <div className="my-1 text-2xl sm:text-3xl font-extrabold font-mono text-neutral-900 tabular-nums">
            {stats.total_customers}
          </div>
          <div className="text-[10px] text-neutral-500 truncate">Lihat data aktif</div>
        </button>

        {/* Completed / Deal */}
        <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs flex flex-col justify-between min-h-[105px]">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1.5" />
              Deal Selesai
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          </div>
          <div className="my-1 text-2xl sm:text-3xl font-extrabold font-mono text-neutral-900 tabular-nums">
            {stats.completed}
          </div>
          <div className="text-[10px] text-neutral-500 truncate">Pelanggan konveksi</div>
        </div>

        {/* New Prospects */}
        <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs flex flex-col justify-between min-h-[105px]">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">Customer Baru</span>
            <Sparkles className="w-3.5 h-3.5 text-[#c5a059] shrink-0" />
          </div>
          <div className="my-1 text-2xl sm:text-3xl font-extrabold font-mono text-neutral-900 tabular-nums">
            {stats.new_customers}
          </div>
          <div className="text-[10px] text-neutral-500 truncate">Prospek segar</div>
        </div>
      </div>

      {/* Executive Omzet Summary Bar (Premium Dark Charcoal + Gold Accent) */}
      {data.omzet_summary && (
        <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900 text-white border border-neutral-800 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700/80 text-[#c5a059] flex items-center justify-center font-bold shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Omzet Deals Closing (Captain Konveksi)
              </div>
              <div className="text-xl sm:text-2xl font-black text-[#c5a059] font-mono leading-tight mt-0.5">
                Rp {data.omzet_summary.total_omzet.toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-neutral-400 flex flex-wrap items-center gap-2 mt-1">
                <span>{data.omzet_summary.closing_count} deals closing</span>
                <span>•</span>
                <span>Bulan Ini: <strong className="text-neutral-200 font-mono">Rp {data.omzet_summary.omzet_this_month.toLocaleString('id-ID')}</strong></span>
                <span>•</span>
                <span>Hari Ini: <strong className="text-neutral-200 font-mono">Rp {data.omzet_summary.omzet_today.toLocaleString('id-ID')}</strong></span>
              </div>
            </div>
          </div>

          {onNavigateToTransactions && (
            <button
              type="button"
              onClick={onNavigateToTransactions}
              className="min-h-[44px] px-4 py-2 bg-[#c5a059] hover:bg-[#b58f48] active:bg-[#a57f38] text-neutral-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0 self-stretch sm:self-auto shadow-2xs"
            >
              <span>Laporan & Transaksi Closing</span>
              <ChevronRight className="w-4 h-4 text-neutral-950" />
            </button>
          )}
        </div>
      )}

      {/* Priority Action Section 1: OVERDUE */}
      <div id="section-overdue" className="p-3.5 sm:p-5 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold text-neutral-900 uppercase tracking-wider truncate">
              Follow-Up Overdue ({priority_action_list.overdue.length})
            </h2>
          </div>
          <span className="text-[10px] sm:text-xs text-rose-600 font-semibold px-2 py-0.5 bg-rose-50 rounded-full border border-rose-200/60 shrink-0">
            Perlu Tindakan
          </span>
        </div>

        {priority_action_list.overdue.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-500">
            Tidak ada follow-up overdue. Seluruh customer terlayani sesuai jadwal.
          </div>
        ) : (
          <>
            {/* MOBILE VIEW (< md): Clean Customer Card */}
            <div className="md:hidden space-y-3">
              {priority_action_list.overdue.map(c => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-xl border border-neutral-200/90 bg-white space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenCustomerDetail(c)}
                        className="text-sm font-bold text-neutral-900 text-left hover:text-[#c5a059] line-clamp-1"
                      >
                        {c.name}
                      </button>
                      <div className="text-xs text-neutral-500 truncate mt-0.5">
                        {c.company_name || 'Personal / Individu'} {c.city ? `· ${c.city}` : ''}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full shrink-0 border border-rose-200/60 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Terlambat
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-neutral-100 font-mono">
                    <div>
                      <span className="text-neutral-400 block text-[10px] font-sans">Jadwal Seharusnya</span>
                      <strong className="text-rose-600">{c.next_follow_up_date}</strong>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px] font-sans">Kontak Terakhir</span>
                      <strong className="text-neutral-700">{c.days_since_contact} hari lalu</strong>
                    </div>
                  </div>

                  <div className="text-[11px] text-neutral-600 flex items-center justify-between">
                    <span>PIC: <strong className="text-neutral-800">{c.sales?.name || '-'}</strong></span>
                    <span className="font-mono text-[11px] text-neutral-500">{c.whatsapp_number}</span>
                  </div>

                  {/* Actions for Mobile: [ Detail ] [ Follow-Up WA ] */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenCustomerDetail(c)}
                      className="min-h-[44px] px-2 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Detail</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenFollowUpModal(c)}
                      className="col-span-2 min-h-[44px] px-3 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs flex items-center justify-center gap-1.5 active:bg-emerald-800 transition-colors"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>Follow-Up WA</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* DESKTOP VIEW (>= md): Clean Minimalist Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-neutral-500 uppercase bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Perusahaan</th>
                    <th className="py-2.5 px-3">Jadwal Seharusnya</th>
                    <th className="py-2.5 px-3">Kontak Terakhir</th>
                    <th className="py-2.5 px-3">Sales PIC</th>
                    <th className="py-2.5 px-3 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {priority_action_list.overdue.map(c => (
                    <tr key={c.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-neutral-900">
                        <div>{c.name}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">{c.whatsapp_number}</div>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600">{c.company_name || '-'}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-rose-600 font-semibold">{c.next_follow_up_date}</span>
                        <span className="text-[10px] text-rose-600 ml-1.5 font-medium">(Terlambat)</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-600">
                        {c.last_contact_date || '-'} ({c.days_since_contact} hari lalu)
                      </td>
                      <td className="py-2.5 px-3 text-neutral-700 font-medium">{c.sales?.name || '-'}</td>
                      <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenCustomerDetail(c)}
                          className="px-2.5 py-1.5 text-xs text-neutral-700 hover:text-neutral-900 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg font-medium transition-colors"
                        >
                          Detail
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenFollowUpModal(c)}
                          className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold inline-flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>Follow-Up WA</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Priority Action Section 2: DUE TODAY */}
      <div id="section-due-today" className="p-3.5 sm:p-5 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#c5a059] shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold text-neutral-900 uppercase tracking-wider truncate">
              Jatuh Tempo Hari Ini ({priority_action_list.due_today.length})
            </h2>
          </div>
          <span className="text-[10px] sm:text-xs text-[#c5a059] font-semibold px-2 py-0.5 bg-[#c5a059]/10 rounded-full border border-[#c5a059]/20 shrink-0">
            Agenda Hari Ini
          </span>
        </div>

        {priority_action_list.due_today.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-500">
            Tidak ada follow-up yang jatuh tempo tepat hari ini.
          </div>
        ) : (
          <>
            {/* MOBILE VIEW (< md): Touch Cards */}
            <div className="md:hidden space-y-3">
              {priority_action_list.due_today.map(c => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-xl border border-neutral-200/90 bg-white space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenCustomerDetail(c)}
                        className="text-sm font-bold text-neutral-900 text-left hover:text-[#c5a059] line-clamp-1"
                      >
                        {c.name}
                      </button>
                      <div className="text-xs text-neutral-500 truncate mt-0.5">
                        {c.company_name || 'Personal / Individu'} {c.city ? `· ${c.city}` : ''}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-[#c5a059] bg-[#c5a059]/10 px-2 py-0.5 rounded-full shrink-0 border border-[#c5a059]/20">
                      Hari Ini
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-neutral-100 font-mono">
                    <div>
                      <span className="text-neutral-400 block text-[10px] font-sans">Jadwal</span>
                      <strong className="text-neutral-800">{c.next_follow_up_date}</strong>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px] font-sans">Step Aturan</span>
                      <strong className="text-neutral-800">Tahap #{c.current_rule_step || 1}</strong>
                    </div>
                  </div>

                  <div className="text-[11px] text-neutral-600 flex items-center justify-between">
                    <span>PIC: <strong className="text-neutral-800">{c.sales?.name || '-'}</strong></span>
                    <span className="font-mono text-[11px] text-neutral-500">{c.whatsapp_number}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenCustomerDetail(c)}
                      className="min-h-[44px] px-2 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Detail</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenFollowUpModal(c)}
                      className="col-span-2 min-h-[44px] px-3 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs flex items-center justify-center gap-1.5 active:bg-emerald-800 transition-colors"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>Follow-Up WA</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* DESKTOP VIEW (>= md): Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-neutral-500 uppercase bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Perusahaan</th>
                    <th className="py-2.5 px-3">Tahap Step</th>
                    <th className="py-2.5 px-3">Kontak Terakhir</th>
                    <th className="py-2.5 px-3">Sales PIC</th>
                    <th className="py-2.5 px-3 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {priority_action_list.due_today.map(c => (
                    <tr key={c.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-neutral-900">
                        <div>{c.name}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">{c.whatsapp_number}</div>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600">{c.company_name || '-'}</td>
                      <td className="py-2.5 px-3 font-semibold text-neutral-800">
                        Step #{c.current_rule_step || 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-600">
                        {c.last_contact_date || '-'} ({c.days_since_contact} hari lalu)
                      </td>
                      <td className="py-2.5 px-3 text-neutral-700 font-medium">{c.sales?.name || '-'}</td>
                      <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenCustomerDetail(c)}
                          className="px-2.5 py-1.5 text-xs text-neutral-700 hover:text-neutral-900 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg font-medium transition-colors"
                        >
                          Detail
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenFollowUpModal(c)}
                          className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold inline-flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>Follow-Up WA</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Priority Action Section 3: UPCOMING */}
      <div id="section-upcoming" className="p-3.5 sm:p-5 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-400 shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold text-neutral-900 uppercase tracking-wider truncate">
              Jadwal Mendatang ({priority_action_list.upcoming.length})
            </h2>
          </div>
          <span className="text-[10px] sm:text-xs text-neutral-500 font-semibold px-2 py-0.5 bg-neutral-100 rounded-full shrink-0">
            Akan Datang
          </span>
        </div>

        {priority_action_list.upcoming.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-500">
            Tidak ada follow-up jadwal mendatang dalam antrian dekat.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {priority_action_list.upcoming.map(c => (
              <div
                key={c.id}
                className="p-3.5 rounded-xl border border-neutral-200/90 bg-white space-y-2.5 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenCustomerDetail(c)}
                      className="text-sm font-bold text-neutral-900 text-left hover:text-[#c5a059] line-clamp-1"
                    >
                      {c.name}
                    </button>
                    <span className="text-[10px] font-mono text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full shrink-0">
                      {c.next_follow_up_date}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 truncate mt-0.5">
                    {c.company_name || 'Personal / Individu'}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                  <span className="text-[11px] text-neutral-500">
                    Step #{c.current_rule_step || 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenCustomerDetail(c)}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 active:bg-neutral-100"
                  >
                    Detail
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
