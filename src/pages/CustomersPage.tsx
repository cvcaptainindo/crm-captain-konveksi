import React, { useState, useEffect } from 'react';
import { Customer, CustomerStatus, User } from '../types/index.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { apiRequest, downloadBlob } from '../api/client.js';
import {
  Search,
  Plus,
  FileSpreadsheet,
  FileText,
  PhoneCall,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  AlertCircle,
  Clock,
  Building,
  RefreshCw,
  X,
} from 'lucide-react';

interface CustomersPageProps {
  statuses: CustomerStatus[];
  salesList: User[];
  onOpenAddModal: () => void;
  onOpenEditModal: (customer: Customer) => void;
  onOpenDetailModal: (customer: Customer) => void;
  onOpenFollowUpModal: (customer: Customer) => void;
  onDeleteCustomer: (customer: Customer) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  statuses,
  salesList,
  onOpenAddModal,
  onOpenEditModal,
  onOpenDetailModal,
  onOpenFollowUpModal,
  onDeleteCustomer,
}) => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedFuStatus, setSelectedFuStatus] = useState('all');
  const [selectedSales, setSelectedSales] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  const activeFiltersCount =
    (selectedStatus !== 'all' ? 1 : 0) +
    (selectedFuStatus !== 'all' ? 1 : 0) +
    (selectedSales !== 'all' ? 1 : 0);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: '15',
        search,
        status_id: selectedStatus,
        fu_status: selectedFuStatus,
        sales_id: selectedSales,
      });

      const res = await apiRequest(`/customers?${params.toString()}`);
      if (res.success) {
        setCustomers(res.data);
        setCurrentPage(res.meta.page);
        setTotalPages(res.meta.total_pages);
        setTotalCount(res.meta.total);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat daftar customer.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [currentPage, selectedStatus, selectedFuStatus, selectedSales]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      setCurrentPage(1);
      loadCustomers();
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        format,
        search,
        status_id: selectedStatus,
        fu_status: selectedFuStatus,
        sales_id: selectedSales,
      });

      const blob = await apiRequest<Blob>(`/export/customers?${params.toString()}`);
      const extension = format === 'csv' ? 'csv' : 'xlsx';
      const filename = `CRM_CaptainKonveksi_${new Date().toISOString().slice(0, 10)}.${extension}`;
      downloadBlob(blob, filename);
      showToast(`Data customer berhasil diekspor (${format.toUpperCase()}).`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengekspor data.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const resetFilters = () => {
    setSelectedStatus('all');
    setSelectedFuStatus('all');
    setSelectedSales('all');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-3.5 sm:space-y-4 max-w-full overflow-x-hidden">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
            Data Customer
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Daftar seluruh calon pemesan dan pelanggan tetap Captain Konveksi.
          </p>
        </div>

        {/* Action Buttons: Add Customer & Export */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAddModal}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 bg-[#c5a059] hover:bg-[#b58f48] active:bg-[#a57f38] text-neutral-950 rounded-xl text-xs font-bold shadow-2xs flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4 text-neutral-950" />
            <span>Tambah Customer</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            disabled={isExporting}
            className="min-h-[44px] px-3 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
            title="Export Excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-neutral-600" />
            <span className="hidden xs:inline">Excel</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={isExporting}
            className="min-h-[44px] px-3 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
            title="Export CSV"
          >
            <FileText className="w-4 h-4 text-neutral-600" />
            <span className="hidden xs:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar: One-Hand Ergonomics */}
      <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200 bg-white shadow-xs space-y-2.5">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama, perusahaan, PIC, kota, WA..."
            className="w-full min-h-[44px] pl-10 pr-9 py-2.5 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-neutral-50/50"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 p-1 text-neutral-400 hover:text-neutral-700 rounded-md"
              aria-label="Bersihkan pencarian"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Mobile Filter Toggle & Quick Counter */}
        <div className="flex items-center justify-between pt-0.5">
          <button
            type="button"
            onClick={() => setShowFiltersMobile(!showFiltersMobile)}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeFiltersCount > 0
                ? 'bg-neutral-900 text-[#c5a059] border border-neutral-800 font-bold'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-neutral-600" />
            <span>
              {showFiltersMobile ? 'Tutup Filter' : 'Filter Kategori'}
              {activeFiltersCount > 0 && ` (${activeFiltersCount})`}
            </span>
          </button>

          <div className="text-[11px] text-neutral-500 font-mono">
            Total: <strong className="text-neutral-900 font-sans">{totalCount}</strong> customer
          </div>
        </div>

        {/* Filter Dropdowns - Responsive: Collapsible on mobile, permanent grid on sm+ */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 ${
            showFiltersMobile ? 'block' : 'hidden sm:grid'
          }`}
        >
          {/* Status Customer */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Status Customer
            </label>
            <select
              value={selectedStatus}
              onChange={e => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 text-base sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white"
            >
              <option value="all">Semua Status Customer</option>
              {statuses.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Follow-Up Status */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Status Follow-Up
            </label>
            <select
              value={selectedFuStatus}
              onChange={e => {
                setSelectedFuStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 text-base sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white font-medium"
            >
              <option value="all">Semua Status Follow-Up</option>
              <option value="OVERDUE">🔴 Overdue (Terlambat)</option>
              <option value="DUE_TODAY">🟡 Jatuh Tempo Hari Ini</option>
              <option value="UPCOMING">🟢 Akan Datang</option>
              <option value="COMPLETED">⚪ Selesai / Deal</option>
            </select>
          </div>

          {/* Sales PIC Filter */}
          {isAdmin ? (
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                Sales PIC
              </label>
              <select
                value={selectedSales}
                onChange={e => {
                  setSelectedSales(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white"
              >
                <option value="all">Semua Sales PIC</option>
                {salesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col justify-end">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                Sales PIC
              </span>
              <div className="min-h-[44px] flex items-center text-xs text-neutral-700 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl">
                <span>{user?.name} (Penugasan Saya)</span>
              </div>
            </div>
          )}

          {activeFiltersCount > 0 && (
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-neutral-900 hover:text-[#c5a059] font-semibold underline py-1 transition-colors"
              >
                Reset Semua Filter
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Customer Listing Section */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-neutral-500 flex flex-col items-center justify-center gap-2 min-h-[220px]">
            <RefreshCw className="w-5 h-5 animate-spin text-[#c5a059]" />
            <span>Memuat data customer...</span>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            Tidak ada customer yang sesuai dengan filter pencarian.
          </div>
        ) : (
          <>
            {/* MOBILE VIEW (< md): Ergonomic Mobile Customer Cards */}
            <div className="md:hidden divide-y divide-neutral-100">
              {customers.map(c => {
                const isOverdue = c.fu_status === 'OVERDUE';
                const isDueToday = c.fu_status === 'DUE_TODAY';

                return (
                  <div key={c.id} className="p-3.5 sm:p-4 space-y-2.5 bg-white rounded-2xl border border-neutral-200/90 shadow-2xs hover:border-neutral-300 transition-colors">
                    {/* Customer Header: Name & Company */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenDetailModal(c)}
                          className="text-sm font-bold text-neutral-900 text-left hover:text-[#c5a059] line-clamp-1"
                        >
                          {c.name}
                        </button>
                        <div className="text-xs text-neutral-500 truncate flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3 text-neutral-400 shrink-0" />
                          <span>{c.company_name || 'Personal / Individu'}</span>
                          {c.city && <span>· {c.city}</span>}
                        </div>
                      </div>

                      {/* Small subtle status badge */}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 border border-neutral-200 bg-neutral-100 text-neutral-700 flex items-center gap-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              c.status?.code === 'CLOSING'
                                ? '#10b981'
                                : c.status?.code === 'CANCEL'
                                ? '#f43f5e'
                                : c.status?.code === 'PROSPEK'
                                ? '#c5a059'
                                : '#94a3b8',
                          }}
                        />
                        {c.status?.label || 'Prospek'}
                      </span>
                    </div>

                    {/* Metadata Box: Status, Last Contact, Next Follow-Up, PIC */}
                    <div className="p-2.5 bg-neutral-50/80 rounded-xl border border-neutral-100 text-xs space-y-1 font-mono">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-neutral-500 font-sans">Last Contact:</span>
                        <span className="text-neutral-700">
                          {c.last_contact_date || 'Belum ada'} ({c.days_since_contact} hari lalu)
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-neutral-500 font-sans">Next Follow-Up:</span>
                        <div className="flex items-center gap-1 font-bold">
                          {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                          {isDueToday && <span className="w-1.5 h-1.5 rounded-full bg-[#c5a059]" />}
                          <span
                            className={
                              isOverdue
                                ? 'text-rose-600'
                                : isDueToday
                                ? 'text-[#c5a059]'
                                : 'text-neutral-800'
                            }
                          >
                            {isDueToday ? 'Hari Ini' : c.next_follow_up_date || '-'}
                            {isOverdue && ' (Terlambat)'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-0.5 text-neutral-500 font-sans border-t border-neutral-200/50">
                        <span>PIC: <strong className="text-neutral-800">{c.sales?.name || '-'}</strong></span>
                        <span className="font-mono text-neutral-400">{c.whatsapp_number}</span>
                      </div>
                    </div>

                    {/* Mobile Action Buttons: [ Detail ] [ Follow-Up WA ] */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onOpenDetailModal(c)}
                        className="min-h-[44px] px-3 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Detail</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenFollowUpModal(c)}
                        className="min-h-[44px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <PhoneCall className="w-4 h-4" />
                        <span>Follow-Up WA</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP VIEW (>= md): Full Data Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-neutral-500 uppercase bg-neutral-50/80 border-b border-neutral-200">
                  <tr>
                    <th className="py-3 px-4">Customer & Perusahaan</th>
                    <th className="py-3 px-4">Kontak WhatsApp</th>
                    <th className="py-3 px-4">Kota & PIC</th>
                    <th className="py-3 px-4">Sales PIC</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Jadwal Follow-Up</th>
                    <th className="py-3 px-4 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {customers.map(c => (
                    <tr key={c.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-neutral-900">
                          <button
                            type="button"
                            onClick={() => onOpenDetailModal(c)}
                            className="hover:underline text-left text-neutral-900 hover:text-[#c5a059]"
                          >
                            {c.name}
                          </button>
                        </div>
                        <div className="text-[11px] text-neutral-500">{c.company_name || '-'}</div>
                        <div className="text-[10px] font-mono text-neutral-400 mt-0.5">{c.customer_code}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-mono text-neutral-800">{c.whatsapp_number}</div>
                        {c.phone_number && <div className="text-[10px] text-neutral-400 font-mono">{c.phone_number}</div>}
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-neutral-800">{c.city || '-'}</div>
                        <div className="text-[10px] text-neutral-500">{c.pic_name || '-'}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-medium text-neutral-700">{c.sales?.name || '-'}</span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${c.status?.color_code}15`,
                            color: c.status?.color_code,
                          }}
                        >
                          {c.status?.label || 'Unknown'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          {c.fu_status === 'OVERDUE' && (
                            <span className="text-rose-700 font-bold flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              {c.next_follow_up_date}
                            </span>
                          )}
                          {c.fu_status === 'DUE_TODAY' && (
                            <span className="text-neutral-900 font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#c5a059]" />
                              Hari Ini
                            </span>
                          )}
                          {c.fu_status === 'UPCOMING' && (
                            <span className="text-neutral-700 font-medium">{c.next_follow_up_date}</span>
                          )}
                          {c.fu_status === 'COMPLETED' && <span className="text-neutral-400">Selesai</span>}
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-0.5">
                          Kontak: {c.last_contact_date || '-'} ({c.days_since_contact} hari lalu)
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenDetailModal(c)}
                          title="Lihat Detail Profil"
                          className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenFollowUpModal(c)}
                          title="Follow-Up WhatsApp"
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>Follow-Up</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenEditModal(c)}
                          title="Edit Customer"
                          className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onDeleteCustomer(c)}
                            title="Hapus ke Trash"
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination Bar - Responsive touch friendly */}
        <div className="p-3 sm:p-4 border-t border-neutral-200 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600">
          <div>
            Menampilkan <strong className="text-neutral-900">{customers.length}</strong> dari{' '}
            <strong className="text-neutral-900">{totalCount}</strong> customer
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="min-h-[42px] px-3.5 py-1.5 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="sm:hidden">Sebelumnya</span>
            </button>
            <span className="font-mono text-neutral-800 px-2">
              {currentPage} / {Math.max(1, totalPages)}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="min-h-[42px] px-3.5 py-1.5 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <span className="sm:hidden">Berikutnya</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
