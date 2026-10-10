import React, { useState, useEffect } from 'react';
import { Customer } from '../types/index.js';
import { apiRequest } from '../api/client.js';
import { useToast } from '../contexts/ToastContext.js';
import {
  CalendarClock,
  Clock,
  AlertTriangle,
  Calendar,
  PhoneCall,
  Eye,
  RefreshCw,
  Building,
} from 'lucide-react';

interface FollowUpSchedulePageProps {
  onOpenCustomerDetail: (customer: Customer) => void;
  onOpenFollowUpModal: (customer: Customer) => void;
}

export const FollowUpSchedulePage: React.FC<FollowUpSchedulePageProps> = ({
  onOpenCustomerDetail,
  onOpenFollowUpModal,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'all' | 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING'>('all');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSchedule = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest('/customers?limit=100&sort_by=next_follow_up_date&sort_dir=asc');
      if (res.success && res.data) {
        setCustomers(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat agenda follow-up.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, []);

  const overdueList = customers.filter(c => c.fu_status === 'OVERDUE');
  const dueTodayList = customers.filter(c => c.fu_status === 'DUE_TODAY');
  const upcomingList = customers.filter(c => c.fu_status === 'UPCOMING');

  const filteredList =
    activeTab === 'OVERDUE'
      ? overdueList
      : activeTab === 'DUE_TODAY'
      ? dueTodayList
      : activeTab === 'UPCOMING'
      ? upcomingList
      : customers.filter(c => c.fu_status !== 'COMPLETED');

  return (
    <div className="space-y-3.5 sm:space-y-4 max-w-full overflow-x-hidden">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
          Agenda Follow-Up Pelanggan
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Jadwal interaksi terstruktur agar Owner dan tim Sales tidak melewatkan komitmen follow-up.
        </p>
      </div>

      {/* Tabs Bar - Consistent Base Color (Dark active + Subtle indicators) */}
      <div className="flex items-center gap-1.5 p-1 bg-neutral-200/70 rounded-2xl overflow-x-auto max-w-full select-none">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`min-h-[42px] px-3.5 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors shrink-0 ${
            activeTab === 'all'
              ? 'bg-neutral-900 text-white shadow-xs font-bold'
              : 'text-neutral-700 hover:text-neutral-900 active:bg-neutral-300/60'
          }`}
        >
          Semua ({customers.filter(c => c.fu_status !== 'COMPLETED').length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('OVERDUE')}
          className={`min-h-[42px] px-3.5 py-2 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors shrink-0 ${
            activeTab === 'OVERDUE'
              ? 'bg-neutral-900 text-white shadow-xs font-bold'
              : 'text-neutral-700 hover:text-neutral-900 active:bg-neutral-300/60'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
          <span>Overdue ({overdueList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DUE_TODAY')}
          className={`min-h-[42px] px-3.5 py-2 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors shrink-0 ${
            activeTab === 'DUE_TODAY'
              ? 'bg-neutral-900 text-white shadow-xs font-bold'
              : 'text-neutral-700 hover:text-neutral-900 active:bg-neutral-300/60'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-[#c5a059] shrink-0" />
          <span>Hari Ini ({dueTodayList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('UPCOMING')}
          className={`min-h-[42px] px-3.5 py-2 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors shrink-0 ${
            activeTab === 'UPCOMING'
              ? 'bg-neutral-900 text-white shadow-xs font-bold'
              : 'text-neutral-700 hover:text-neutral-900 active:bg-neutral-300/60'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-neutral-400 shrink-0" />
          <span>Mendatang ({upcomingList.length})</span>
        </button>
      </div>

      {/* Agenda Card List - Consistent White Surface */}
      <div className="rounded-2xl border border-neutral-200/90 bg-white shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-neutral-500 flex flex-col items-center justify-center gap-2 min-h-[220px]">
            <RefreshCw className="w-5 h-5 animate-spin text-[#c5a059]" />
            <span>Memuat jadwal agenda...</span>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            Tidak ada customer pada kategori ini.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {filteredList.map(c => {
              const isOverdue = c.fu_status === 'OVERDUE';
              const isDueToday = c.fu_status === 'DUE_TODAY';

              return (
                <div
                  key={c.id}
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50/60 transition-colors"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenCustomerDetail(c)}
                        className="font-bold text-neutral-900 text-sm hover:text-[#c5a059] text-left line-clamp-1"
                      >
                        {c.name}
                      </button>

                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 font-semibold shrink-0">
                        Step {c.current_rule_step || 1} {c.use_custom_rule ? '(Custom)' : ''}
                      </span>

                      {isOverdue && (
                        <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200/60 shrink-0 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          OVERDUE
                        </span>
                      )}

                      {isDueToday && (
                        <span className="text-[10px] font-semibold text-[#c5a059] bg-[#c5a059]/10 px-2 py-0.5 rounded-full border border-[#c5a059]/30 shrink-0 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#c5a059]" />
                          HARI INI
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <Building className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span className="truncate">{c.company_name || 'Personal / Individu'}</span>
                      {c.city && <span>· {c.city}</span>}
                    </div>

                    <div className="p-2 bg-neutral-50/80 rounded-xl border border-neutral-100 text-[11px] grid grid-cols-2 gap-2 font-mono">
                      <div>
                        <span className="text-neutral-400 block text-[10px] font-sans">Jadwal Follow-Up:</span>
                        <strong
                          className={
                            isOverdue
                              ? 'text-rose-600 font-bold'
                              : isDueToday
                              ? 'text-[#c5a059] font-bold'
                              : 'text-neutral-900'
                          }
                        >
                          {isDueToday ? 'Hari Ini' : c.next_follow_up_date || '-'}
                        </strong>
                      </div>

                      <div>
                        <span className="text-neutral-400 block text-[10px] font-sans">Kontak Terakhir:</span>
                        <span className="text-neutral-700 font-medium">
                          {c.days_since_contact} hari lalu
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 text-[11px] text-neutral-500 font-mono">
                      <span>WA: <strong className="text-neutral-800">{c.whatsapp_number}</strong></span>
                      <span>PIC: <strong className="text-neutral-800 font-sans">{c.sales?.name || '-'}</strong></span>
                    </div>
                  </div>

                  {/* Actions for Mobile: [ Detail ] [ Follow-Up WA ] */}
                  <div className="grid grid-cols-2 sm:flex items-center gap-2 pt-1 sm:pt-0 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenCustomerDetail(c)}
                      className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Detail</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenFollowUpModal(c)}
                      className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>Follow-Up WA</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
