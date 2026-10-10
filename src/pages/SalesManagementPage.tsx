import React, { useState, useEffect } from 'react';
import { SalesUserAccount } from '../types/index.js';
import { apiRequest } from '../api/client.js';
import { useToast } from '../contexts/ToastContext.js';
import { ConfirmModal } from '../components/common/ConfirmModal.js';
import {
  UserCheck,
  Users,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  KeyRound,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Briefcase,
  Phone,
  Mail,
  UserX,
} from 'lucide-react';

export const SalesManagementPage: React.FC = () => {
  const { showToast } = useToast();

  const [salesList, setSalesList] = useState<SalesUserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Password reset modal
  const [resetModalUser, setResetModalUser] = useState<SalesUserAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Status confirmation modal
  const [confirmStatusModal, setConfirmStatusModal] = useState<{
    user: SalesUserAccount;
    nextStatus: 'ACTIVE' | 'REJECTED' | 'INACTIVE';
    title: string;
    message: string;
  } | null>(null);

  const loadSales = async () => {
    setIsLoading(true);
    try {
      const query = filterStatus !== 'all' ? `?status=${filterStatus}` : '';
      const res = await apiRequest<{ success: boolean; data: SalesUserAccount[] }>(
        `/users/sales-management${query}`
      );
      if (res.success) {
        setSalesList(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat daftar sales.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, [filterStatus]);

  const handleUpdateStatus = async (userId: number, nextStatus: 'ACTIVE' | 'REJECTED' | 'INACTIVE') => {
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(`/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ account_status: nextStatus }),
      });
      if (res.success) {
        showToast(res.message, 'success');
        loadSales();
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui status akun.', 'error');
    } finally {
      setConfirmStatusModal(null);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;
    if (newPassword.length < 6) {
      showToast('Password baru minimal 6 karakter.', 'error');
      return;
    }

    setIsResetting(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/users/${resetModalUser.id}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify({ newPassword }),
        }
      );
      if (res.success) {
        showToast(res.message, 'success');
        setResetModalUser(null);
        setNewPassword('');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal mereset password.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // Filtered list by search
  const filteredSales = salesList.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.phone && s.phone.includes(q))
    );
  });

  const pendingCount = salesList.filter(s => s.account_status === 'PENDING').length;
  const activeCount = salesList.filter(s => s.account_status === 'ACTIVE').length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight">
              Kelola Akun Sales
            </h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 bg-neutral-900 text-[#c5a059] border border-[#c5a059]/40 text-[10px] font-bold rounded-full">
                {pendingCount} PENDING
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Otorisasi pendaftaran, penugasan customer, dan pemantauan kinerja omzet per Sales.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSales}
          className="self-start sm:self-auto min-h-[44px] px-3.5 py-2 border border-neutral-200 bg-white hover:bg-neutral-50 active:bg-neutral-100 rounded-xl text-xs font-semibold text-neutral-700 flex items-center gap-2 transition-colors shadow-2xs"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#c5a059]' : 'text-neutral-500'}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Summary KPI Cards - Consistent Base Color */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-neutral-200/90 shadow-2xs flex flex-col justify-between min-h-[105px]">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Akun</span>
            <Users className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <div className="my-1 text-lg sm:text-2xl font-extrabold text-neutral-900 font-mono tabular-nums">
            {salesList.length}
          </div>
          <div className="text-[10px] text-neutral-400">Sales terdaftar</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-neutral-200/90 shadow-2xs flex flex-col justify-between min-h-[105px]">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 rounded-full bg-[#c5a059] inline-block mr-1.5" />
              Menunggu Review
            </span>
            <Clock className="w-3.5 h-3.5 text-[#c5a059]" />
          </div>
          <div className="my-1 text-lg sm:text-2xl font-extrabold text-neutral-900 font-mono tabular-nums">
            {pendingCount}
          </div>
          <div className="text-[10px] text-[#c5a059] font-medium">Perlu approval Admin</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-neutral-200/90 shadow-2xs flex flex-col justify-between min-h-[105px]">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1.5" />
              Sales Aktif
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="my-1 text-lg sm:text-2xl font-extrabold text-neutral-900 font-mono tabular-nums">
            {activeCount}
          </div>
          <div className="text-[10px] text-neutral-400">Dapat login & follow-up</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-neutral-200/90 shadow-2xs flex flex-col justify-between min-h-[105px]">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Omzet Closing</span>
            <DollarSign className="w-3.5 h-3.5 text-[#c5a059]" />
          </div>
          <div className="my-1 text-sm sm:text-lg font-extrabold text-neutral-900 font-mono truncate tabular-nums">
            Rp {salesList.reduce((sum, s) => sum + (s.total_omzet || 0), 0).toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-neutral-400">Kontribusi seluruh Sales</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-neutral-200/80 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama, email, atau no WA sales..."
              className="w-full min-h-[44px] pl-10 pr-3 py-2 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            <span className="text-xs font-semibold text-neutral-500 shrink-0">Status:</span>
            {['all', 'PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'].map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  filterStatus === st
                    ? 'bg-neutral-900 text-[#c5a059] border border-[#c5a059]/40 font-bold shadow-xs'
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600'
                }`}
              >
                {st === 'all'
                  ? 'Semua'
                  : st === 'PENDING'
                  ? 'Pending'
                  : st === 'ACTIVE'
                  ? 'Aktif'
                  : st === 'INACTIVE'
                  ? 'Nonaktif'
                  : 'Ditolak'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sales List Cards (Mobile-First) */}
      {isLoading ? (
        <div className="bg-white rounded-2xl p-8 border border-neutral-200 text-center text-xs text-neutral-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#c5a059] mb-2" />
          Memuat data akun sales...
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-neutral-200 text-center text-xs text-neutral-500">
          Tidak ada akun sales yang sesuai dengan filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredSales.map(sales => {
            const isPending = sales.account_status === 'PENDING';
            const isActive = sales.account_status === 'ACTIVE';
            const isInactive = sales.account_status === 'INACTIVE';
            const isRejected = sales.account_status === 'REJECTED';

            return (
              <div
                key={sales.id}
                className={`bg-white rounded-2xl border transition-all shadow-2xs flex flex-col justify-between overflow-hidden ${
                  isPending
                    ? 'border-[#c5a059]/60 hover:border-[#c5a059]'
                    : 'border-neutral-200/80 hover:border-neutral-300'
                }`}
              >
                {/* Card Top */}
                <div className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-neutral-900">{sales.name}</span>
                        {isPending && (
                          <span className="px-1.5 py-0.5 bg-neutral-900 text-[#c5a059] border border-[#c5a059]/30 text-[9px] font-bold rounded">
                            Baru
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500 font-mono mt-0.5">{sales.email}</div>
                    </div>

                    {/* Small Status Badge with indicator dot */}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 border border-neutral-200 bg-neutral-100 text-neutral-700 flex items-center gap-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isPending
                            ? 'bg-[#c5a059]'
                            : isActive
                            ? 'bg-emerald-500'
                            : isInactive
                            ? 'bg-neutral-400'
                            : 'bg-rose-500'
                        }`}
                      />
                      {sales.account_status || (sales.is_active ? 'ACTIVE' : 'INACTIVE')}
                    </span>
                  </div>

                  {/* Phone & Info */}
                  <div className="space-y-1 text-xs text-neutral-600">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span className="font-mono">{sales.phone || '-'}</span>
                    </div>
                  </div>

                  {/* Metrics Box */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-neutral-50 rounded-xl border border-neutral-100">
                    <div>
                      <div className="text-[10px] text-neutral-400 font-semibold uppercase">Customer</div>
                      <div className="text-xs font-bold text-neutral-800 font-mono mt-0.5">
                        {sales.customer_count || 0} orang
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-400 font-semibold uppercase">Omzet Closing</div>
                      <div className="text-xs font-bold text-neutral-900 font-mono mt-0.5 truncate">
                        Rp {(sales.total_omzet || 0).toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons (Thumb Friendly) */}
                <div className="p-3 bg-neutral-50/80 border-t border-neutral-100 flex flex-wrap gap-2">
                  {isPending ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmStatusModal({
                            user: sales,
                            nextStatus: 'ACTIVE',
                            title: 'Setujui Pendaftaran Sales?',
                            message: `Setujui akun "${sales.name}". Setelah disetujui, Sales dapat segera login dan mengakses CRM Captain Konveksi.`,
                          })
                        }
                        className="flex-1 min-h-[42px] px-3 py-2 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-[#c5a059] border border-[#c5a059]/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#c5a059]" />
                        <span>Approve</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setConfirmStatusModal({
                            user: sales,
                            nextStatus: 'REJECTED',
                            title: 'Tolak Pendaftaran Sales?',
                            message: `Tolak pendaftaran akun "${sales.name}". Sales tidak akan dapat mengakses CRM.`,
                          })
                        }
                        className="min-h-[42px] px-3 py-2 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {isActive ? (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmStatusModal({
                              user: sales,
                              nextStatus: 'INACTIVE',
                              title: 'Nonaktifkan Akun Sales?',
                              message: `Nonaktifkan akun "${sales.name}". Sales yang dinonaktifkan tidak akan dapat login ke CRM hingga diaktifkan kembali.`,
                            })
                          }
                          className="flex-1 min-h-[42px] px-3 py-2 bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <UserX className="w-4 h-4 text-neutral-500" />
                          <span>Nonaktifkan</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmStatusModal({
                              user: sales,
                              nextStatus: 'ACTIVE',
                              title: 'Aktifkan Kembali Akun Sales?',
                              message: `Aktifkan kembali akun "${sales.name}". Sales akan dapat login kembali.`,
                            })
                          }
                          className="flex-1 min-h-[42px] px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-[#c5a059] border border-[#c5a059]/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <CheckCircle2 className="w-4 h-4 text-[#c5a059]" />
                          <span>Aktifkan</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setResetModalUser(sales);
                          setNewPassword('');
                        }}
                        title="Reset Password Sales"
                        className="min-h-[42px] px-3 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <KeyRound className="w-4 h-4 text-neutral-500" />
                        <span>Reset Pass</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmStatusModal && (
        <ConfirmModal
          isOpen={true}
          title={confirmStatusModal.title}
          message={confirmStatusModal.message}
          confirmLabel={confirmStatusModal.nextStatus === 'ACTIVE' ? 'Ya, Setujui Akun' : 'Ya, Lanjutkan'}
          isDanger={confirmStatusModal.nextStatus === 'REJECTED' || confirmStatusModal.nextStatus === 'INACTIVE'}
          onConfirm={() =>
            handleUpdateStatus(confirmStatusModal.user.id, confirmStatusModal.nextStatus)
          }
          onCancel={() => setConfirmStatusModal(null)}
        />
      )}

      {/* Reset Password Modal */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#c5a059]" />
                <h3 className="text-sm font-bold text-neutral-900">Reset Password Sales</h3>
              </div>
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                className="text-neutral-400 hover:text-neutral-600 min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-600">
              Buat password baru untuk <strong>{resetModalUser.name}</strong> ({resetModalUser.email}).
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Password Baru
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full min-h-[46px] px-3.5 py-2.5 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="flex-1 min-h-[46px] px-4 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="flex-1 min-h-[46px] px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-[#c5a059] border border-[#c5a059]/40 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                >
                  {isResetting ? 'Menyimpan...' : 'Simpan Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
