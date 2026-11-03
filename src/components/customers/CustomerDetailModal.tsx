import React, { useState, useEffect } from 'react';
import { Customer, Transaction } from '../../types/index.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { apiRequest } from '../../api/client.js';
import { TransactionFormModal } from '../transactions/TransactionFormModal.js';
import { InvoicePanel } from '../documents/InvoicePanel.js';
import {
  X,
  PhoneCall,
  Edit,
  Trash2,
  Calendar,
  Building,
  User as UserIcon,
  MapPin,
  Clock,
  History,
  AlertCircle,
  CheckCircle2,
  Phone,
  Mail,
  RefreshCw,
  ExternalLink,
  MessageCircle,
  DollarSign,
  Plus,
  ShoppingBag,
} from 'lucide-react';

interface CustomerDetailModalProps {
  isOpen: boolean;
  customerId: number | null;
  onClose: () => void;
  onOpenFollowUp: (customer: Customer) => void;
  onOpenEdit: (customer: Customer) => void;
  onDeleteCustomer: (customer: Customer) => void;
  onReloadParent?: () => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  isOpen,
  customerId,
  onClose,
  onOpenFollowUp,
  onOpenEdit,
  onDeleteCustomer,
  onReloadParent,
}) => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (customerId && isOpen) {
      loadDetails(customerId);
    }
  }, [customerId, isOpen]);

  const loadDetails = async (id: number) => {
    setIsLoading(true);
    try {
      const res = await apiRequest(`/customers/${id}`);
      if (res.success && res.data) {
        setCustomer(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat detail customer.', 'error');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const cleanPhone = (phone: string) => {
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
    if (cleaned.startsWith('8')) cleaned = '62' + cleaned;
    return cleaned;
  };

  const directWaLink = customer
    ? `https://wa.me/${cleanPhone(customer.whatsapp_number)}`
    : '#';

  const customerClosings = (customer?.transactions || []).filter(t => t.status === 'CLOSING');
  const customerTotalOmzet = customerClosings.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/70 backdrop-blur-xs">
      <div className="w-full sm:max-w-3xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] animate-in slide-in-from-bottom-4 sm:fade-in duration-200">
        {isLoading || !customer ? (
          <div className="p-12 text-center text-sm text-neutral-500 flex flex-col items-center justify-center gap-2 min-h-[300px]">
            <RefreshCw className="w-5 h-5 animate-spin text-[#c5a059]" />
            <span className="text-xs">Memuat detail profil customer...</span>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 sm:px-6 py-3 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-neutral-900 text-[#c5a059] font-bold text-xs flex items-center justify-center shrink-0 border border-[#c5a059]/30">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-sm sm:text-base font-bold text-neutral-900 truncate">{customer.name}</h2>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 border border-neutral-200 bg-neutral-100 text-neutral-700 flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            customer.status?.code === 'CLOSING'
                              ? '#10b981'
                              : customer.status?.code === 'CANCEL'
                              ? '#f43f5e'
                              : customer.status?.code === 'PROSPEK'
                              ? '#c5a059'
                              : '#94a3b8',
                        }}
                      />
                      {customer.status?.label || 'Prospek'}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 font-mono truncate">
                    {customer.customer_code} • {customer.company_name || 'Personal'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-neutral-400 hover:text-neutral-600 active:bg-neutral-200 shrink-0"
                aria-label="Tutup Detail Customer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* GROUP 1: INFORMASI FOLLOW-UP (PRIORITAS MOBILE) */}
              <div className="p-4 rounded-2xl border border-neutral-200/90 bg-neutral-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                    <Clock className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Jadwal & Status Follow-Up</span>
                  </h3>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                      customer.fu_status === 'OVERDUE'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : customer.fu_status === 'DUE_TODAY'
                        ? 'bg-[#c5a059]/10 text-[#c5a059] border-[#c5a059]/30'
                        : customer.fu_status === 'UPCOMING'
                        ? 'bg-neutral-100 text-neutral-700 border-neutral-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        customer.fu_status === 'OVERDUE'
                          ? 'bg-rose-500'
                          : customer.fu_status === 'DUE_TODAY'
                          ? 'bg-[#c5a059]'
                          : customer.fu_status === 'UPCOMING'
                          ? 'bg-neutral-400'
                          : 'bg-emerald-500'
                      }`}
                    />
                    {customer.fu_status === 'OVERDUE'
                      ? 'Terlewat (Overdue)'
                      : customer.fu_status === 'DUE_TODAY'
                      ? 'Hari Ini'
                      : customer.fu_status === 'UPCOMING'
                      ? 'Mendatang'
                      : 'Selesai'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 bg-white rounded-xl border border-neutral-200/80 shadow-2xs">
                    <span className="text-[10px] text-neutral-400 block font-semibold uppercase">Kontak Terakhir</span>
                    <span className="font-mono font-bold text-neutral-900 mt-0.5 block">
                      {customer.last_contact_date || 'Belum Ada Kontak'}
                    </span>
                    <span className="text-[10px] text-neutral-500 mt-0.5 block">
                      {customer.days_since_contact !== undefined
                        ? `${customer.days_since_contact} hari yang lalu`
                        : '-'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white rounded-xl border border-neutral-200/80 shadow-2xs">
                    <span className="text-[10px] text-neutral-400 block font-semibold uppercase">Next Follow-Up</span>
                    <span className="font-mono font-bold text-neutral-900 mt-0.5 block">
                      {customer.next_follow_up_date || 'Selesai / Terjadwal'}
                    </span>
                    <span className="text-[10px] text-neutral-500 mt-0.5 block">
                      Tahap Step #{customer.current_rule_step || 1}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-600 pt-1">
                  <span>Aturan Follow-Up:</span>
                  <span className="font-semibold text-neutral-800 font-mono">
                    {customer.use_custom_rule ? 'Custom Sequence (Khusus)' : 'Default SOP Captain Konveksi'}
                  </span>
                </div>
              </div>

              {/* GROUP 2: TRANSAKSI & CLOSING (OMZET DEALS) */}
              <div className="p-4 rounded-2xl border border-neutral-200/90 bg-white space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-[#c5a059]" />
                    <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider font-mono">
                      Transaksi & Omzet ({customerClosings.length} Deals)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTransaction(null);
                      setIsTransactionModalOpen(true);
                    }}
                    className="min-h-[36px] px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#c5a059]" />
                    <span>Catat Closing</span>
                  </button>
                </div>

                {/* Total Lifetime Omzet Summary */}
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-neutral-400 font-semibold uppercase">Total Nilai Closing</span>
                    <div className="text-base sm:text-xl font-black text-neutral-900 font-mono mt-0.5">
                      Rp {customerTotalOmzet.toLocaleString('id-ID')}
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white text-neutral-800 border border-neutral-200 shadow-2xs">
                    {customerClosings.length}x Closing
                  </span>
                </div>

                {/* Closings list */}
                {(!customer.transactions || customer.transactions.length === 0) ? (
                  <p className="text-xs text-neutral-500 italic text-center py-2">
                    Belum ada transaksi closing tercatat untuk customer ini.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {customer.transactions.map(trx => (
                      <div
                        key={trx.id}
                        className={`p-2.5 rounded-xl border bg-white flex items-center justify-between gap-2 shadow-2xs text-xs ${
                          trx.status === 'CLOSING' ? 'border-neutral-200' : 'border-rose-200 bg-rose-50/20'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-neutral-900 truncate">{trx.product}</span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                trx.status === 'CLOSING'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {trx.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                            {trx.transaction_date} {trx.description ? `• ${trx.description}` : ''}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className={`font-mono font-bold text-xs sm:text-sm ${
                              trx.status === 'CLOSING' ? 'text-emerald-700' : 'text-neutral-400 line-through'
                            }`}
                          >
                            Rp {Number(trx.amount).toLocaleString('id-ID')}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTransaction(trx);
                              setIsTransactionModalOpen(true);
                            }}
                            className="text-[10px] text-neutral-500 hover:text-neutral-800 underline mt-0.5"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <InvoicePanel customer={customer} />

              {/* GROUP 3: INFORMASI DATA CUSTOMER LENGKAP */}
              <div className="p-4 rounded-2xl border border-neutral-200/80 bg-neutral-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-neutral-800 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                    <UserIcon className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Profil Kontak & Perusahaan</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Nama Customer */}
                  <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                    <span className="text-neutral-500">Nama Customer:</span>
                    <strong className="text-neutral-900">{customer.name}</strong>
                  </div>

                  {/* Perusahaan */}
                  <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                    <span className="text-neutral-500">Perusahaan:</span>
                    <strong className="text-neutral-900">{customer.company_name || 'Personal / Individu'}</strong>
                  </div>

                  {/* WhatsApp */}
                  <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                    <span className="text-neutral-500">WhatsApp:</span>
                    <a
                      href={directWaLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-bold text-emerald-700 hover:underline flex items-center gap-1"
                    >
                      <span>{customer.whatsapp_number}</span>
                      <ExternalLink className="w-3 h-3 text-emerald-600" />
                    </a>
                  </div>

                  {/* Telepon */}
                  <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                    <span className="text-neutral-500">Telepon:</span>
                    {customer.phone_number ? (
                      <a href={`tel:${customer.phone_number}`} className="font-mono text-neutral-800 hover:underline">
                        {customer.phone_number}
                      </a>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </div>

                  {/* Email */}
                  <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                    <span className="text-neutral-500">Email:</span>
                    {customer.email ? (
                      <a href={`mailto:${customer.email}`} className="text-neutral-800 hover:underline truncate max-w-[180px]">
                        {customer.email}
                      </a>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </div>

                  {/* PIC Customer */}
                  <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                    <span className="text-neutral-500">PIC Customer:</span>
                    <strong className="text-neutral-900">{customer.pic_name || '-'}</strong>
                  </div>

                  {/* Sales PIC Internal */}
                  <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                    <span className="text-neutral-500">Sales PIC:</span>
                    <strong className="text-amber-800">{customer.sales?.name || 'Belum Ditugaskan'}</strong>
                  </div>

                  {/* Kota */}
                  <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                    <span className="text-neutral-500">Kota / Lokasi:</span>
                    <span className="text-neutral-800 font-medium">{customer.city || '-'}</span>
                  </div>

                  {/* Alamat */}
                  <div className="sm:col-span-2 py-1 border-b border-neutral-200/60">
                    <span className="text-neutral-500 block mb-0.5">Alamat Lengkap:</span>
                    <p className="text-neutral-800 leading-relaxed">{customer.address || '-'}</p>
                  </div>

                  {/* Catatan Kebutuhan */}
                  <div className="sm:col-span-2 py-1">
                    <span className="text-neutral-500 block mb-0.5">Catatan Pesanan / Kebutuhan:</span>
                    <div className="p-2.5 bg-white rounded-xl border border-neutral-200 text-neutral-800 text-[11px] leading-relaxed">
                      {customer.notes || 'Belum ada catatan khusus.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* GROUP 4: HISTORI AKTIVITAS FOLLOW-UP */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-neutral-800 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                    <History className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Histori Aktivitas ({customer.activities?.length || 0})</span>
                  </h3>
                  <span className="text-[10px] text-neutral-400">Terbaru di atas</span>
                </div>

                {!customer.activities || customer.activities.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50">
                    Belum ada riwayat aktivitas follow-up untuk customer ini.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {customer.activities.map(act => (
                      <div
                        key={act.id}
                        className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 space-y-1.5 text-xs shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-neutral-900">{act.result_status}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 font-mono text-neutral-700">
                              {act.channel}
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                            {new Date(act.activity_date).toLocaleString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {act.template_name && (
                          <div className="text-[10px] text-neutral-500">
                            Template: <strong className="text-neutral-700">{act.template_name}</strong>
                          </div>
                        )}

                        {act.message_sent && (
                          <div className="p-2 bg-white rounded-lg border border-neutral-200 text-[11px] font-mono text-neutral-700 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                            {act.message_sent}
                          </div>
                        )}

                        {act.notes && (
                          <p className="text-[11px] text-neutral-700">
                            <strong className="text-neutral-800">Catatan:</strong> {act.notes}
                          </p>
                        )}

                        <div className="pt-1 border-t border-neutral-200/60 text-[10px] text-neutral-400 flex items-center justify-between font-mono">
                          <span>Sales: {act.user_name}</span>
                          {act.next_follow_up_date && (
                            <span>
                              Berikutnya: <strong className="text-neutral-700">{act.next_follow_up_date}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ACTION UTAMA: STICKY THUMB-ZONE AT BOTTOM */}
            <div className="px-4 sm:px-6 py-3 bg-white border-t border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0 shadow-lg safe-area-bottom">
              {/* Primary Follow-Up Action */}
              <button
                type="button"
                onClick={() => onOpenFollowUp(customer)}
                className="min-h-[46px] flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs flex items-center justify-center gap-2 transition-colors"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Follow-Up WA</span>
              </button>

              <div className="flex items-center gap-2">
                {/* Direct WhatsApp Call */}
                <a
                  href={directWaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] flex-1 sm:flex-initial px-3.5 py-2 text-xs font-semibold text-neutral-800 bg-white hover:bg-neutral-50 active:bg-neutral-100 border border-neutral-300 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  title="Buka WhatsApp langsung tanpa template"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>Chat WA</span>
                </a>

                {/* Catat Closing Quick Button */}
                <button
                  type="button"
                  onClick={() => {
                    setEditingTransaction(null);
                    setIsTransactionModalOpen(true);
                  }}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-bold text-neutral-950 bg-[#c5a059]/15 hover:bg-[#c5a059]/25 active:bg-[#c5a059]/35 border border-[#c5a059]/40 rounded-xl flex items-center justify-center gap-1 transition-colors"
                  title="Catat Closing / Transaksi Customer Ini"
                >
                  <DollarSign className="w-4 h-4 text-[#c5a059]" />
                  <span>+ Closing</span>
                </button>

                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => onOpenEdit(customer)}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit</span>
                </button>

                {/* Delete Button (Admin only) */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onDeleteCustomer(customer)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 rounded-xl border border-rose-200 transition-colors"
                    title="Pindahkan ke Trash"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Transaction Form Modal */}
            <TransactionFormModal
              isOpen={isTransactionModalOpen}
              onClose={() => {
                setIsTransactionModalOpen(false);
                setEditingTransaction(null);
              }}
              onSuccess={() => {
                if (customer) loadDetails(customer.id);
                if (onReloadParent) onReloadParent();
              }}
              preselectedCustomer={customer}
              initialTransaction={editingTransaction}
            />
          </>
        )}
      </div>
    </div>
  );
};
