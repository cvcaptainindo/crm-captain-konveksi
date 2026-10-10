import React, { useState, useEffect } from 'react';
import { Customer } from '../types/index.js';
import { apiRequest } from '../api/client.js';
import { useToast } from '../contexts/ToastContext.js';
import { ConfirmModal } from '../components/common/ConfirmModal.js';
import { Trash2, RotateCcw, AlertTriangle, Building, RefreshCw } from 'lucide-react';

export const TrashPage: React.FC = () => {
  const { showToast } = useToast();
  const [trashCustomers, setTrashCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [restoringCustomer, setRestoringCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  const loadTrash = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest('/customers/trash');
      if (res.success && res.data) {
        setTrashCustomers(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat daftar sampah.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const handleConfirmRestore = async () => {
    if (!restoringCustomer) return;
    try {
      await apiRequest(`/customers/${restoringCustomer.id}/restore`, { method: 'POST' });
      showToast(`Customer ${restoringCustomer.name} berhasil dipulihkan dari Trash.`, 'success');
      setRestoringCustomer(null);
      loadTrash();
    } catch (err: any) {
      showToast(err.message || 'Gagal memulihkan customer.', 'error');
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!deletingCustomer) return;
    try {
      await apiRequest(`/customers/${deletingCustomer.id}/permanent`, { method: 'DELETE' });
      showToast(`Customer ${deletingCustomer.name} dihapus secara permanen.`, 'success');
      setDeletingCustomer(null);
      loadTrash();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus permanen.', 'error');
    }
  };

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
          Trash / Recycle Bin
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Customer yang di-soft delete. Admin dapat memulihkan (Restore) atau menghapus permanen.
        </p>
      </div>

      {/* Warning Box */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-neutral-200 bg-neutral-50 text-xs text-neutral-700 flex items-start gap-2.5 shadow-2xs">
        <AlertTriangle className="w-4 h-4 text-[#c5a059] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <strong className="font-semibold block text-neutral-900">Aturan Keamanan Data Soft-Delete:</strong>
          <p className="mt-0.5 text-[11px] text-neutral-600 leading-relaxed">
            Data di Trash tidak muncul di dashboard maupun pencarian aktif tim sales. Tindakan <em>Permanent Delete</em> akan menghapus data dan relasi histori secara permanen.
          </p>
        </div>
      </div>

      {/* Trash Content Container */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-neutral-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#c5a059]" />
            <span>Memuat data sampah...</span>
          </div>
        ) : trashCustomers.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            Trash kosong. Tidak ada data customer yang dihapus.
          </div>
        ) : (
          <>
            {/* MOBILE VIEW (< md): Responsive Cards */}
            <div className="md:hidden divide-y divide-neutral-100">
              {trashCustomers.map(c => (
                <div key={c.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-neutral-900 truncate">{c.name}</div>
                      <div className="text-xs text-neutral-600 truncate flex items-center gap-1 mt-0.5">
                        <Building className="w-3 h-3 text-neutral-400 shrink-0" />
                        <span>{c.company_name || 'Personal'}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-200 text-neutral-700 shrink-0">
                      {c.customer_code}
                    </span>
                  </div>

                  <div className="text-[11px] text-neutral-500 font-mono flex items-center justify-between">
                    <span>WA: {c.whatsapp_number}</span>
                    <span>Sales: {c.sales?.name || '-'}</span>
                  </div>

                  <div className="text-[10px] text-neutral-400 font-mono">
                    Dihapus: {c.deleted_at ? new Date(c.deleted_at).toLocaleString('id-ID') : '-'}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setRestoringCustomer(c)}
                      className="min-h-[44px] px-3 py-2 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-950 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Restore</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingCustomer(c)}
                      className="min-h-[44px] px-3 py-2 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Hapus Permanen</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* DESKTOP VIEW (>= md): Full Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-neutral-500 uppercase bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="py-3 px-4">Customer & Perusahaan</th>
                    <th className="py-3 px-4">Kontak WhatsApp</th>
                    <th className="py-3 px-4">Waktu Dihapus</th>
                    <th className="py-3 px-4">Sales PIC</th>
                    <th className="py-3 px-4 text-right">Tindakan Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {trashCustomers.map(c => (
                    <tr key={c.id} className="hover:bg-neutral-50/50">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-neutral-900">{c.name}</div>
                        <div className="text-[11px] text-neutral-500">{c.company_name || '-'}</div>
                        <div className="text-[10px] font-mono text-neutral-400">{c.customer_code}</div>
                      </td>

                      <td className="py-3 px-4 font-mono text-neutral-700">{c.whatsapp_number}</td>

                      <td className="py-3 px-4 font-mono text-neutral-500 text-[11px]">
                        {c.deleted_at
                          ? new Date(c.deleted_at).toLocaleString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </td>

                      <td className="py-3 px-4 text-neutral-700 font-medium">{c.sales?.name || '-'}</td>

                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setRestoringCustomer(c)}
                          className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Restore</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingCustomer(c)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Hapus Permanen</span>
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

      {/* Restore Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(restoringCustomer)}
        title="Pulihkan Customer dari Trash"
        message={`Apakah Anda yakin ingin memulihkan "${restoringCustomer?.name}" kembali ke daftar customer aktif?`}
        confirmLabel="Ya, Pulihkan"
        onConfirm={handleConfirmRestore}
        onCancel={() => setRestoringCustomer(null)}
      />

      {/* Permanent Delete Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingCustomer)}
        title="⚠️ PERINGATAN: Hapus Permanen"
        message={`Tindakan ini tidak dapat dibatalkan. Customer "${deletingCustomer?.name}" beserta seluruh histori aktivitas follow-up akan dihapus permanen dari basis data.`}
        confirmLabel="Hapus Permanen Sekarang"
        isDanger={true}
        onConfirm={handleConfirmPermanentDelete}
        onCancel={() => setDeletingCustomer(null)}
      />
    </div>
  );
};
