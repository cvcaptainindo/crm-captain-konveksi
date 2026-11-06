import React, { useState, useEffect } from 'react';
import { Customer, Transaction, SalesDocument, DocType } from '../../types/index.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { apiRequest } from '../../api/client.js';
import { formatToWIB } from '../../utils/dateFormatter.js';
import { TransactionFormModal } from '../transactions/TransactionFormModal.js';
import { DocumentFormModal } from '../documents/DocumentFormModal.js';
import { DocumentViewModal } from '../documents/DocumentViewModal.js';
import { PaymentFormModal } from '../documents/PaymentFormModal.js';
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
  FileText,
  FileCheck,
  Receipt,
  Printer,
  ArrowRight,
  Shield,
  Eye,
  Check,
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

type DetailTab = 'overview' | 'quotations' | 'invoices' | 'transactions' | 'activities';

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  isOpen,
  customerId,
  onClose,
  onOpenFollowUp,
  onOpenEdit,
  onDeleteCustomer,
  onReloadParent,
}) => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [documents, setDocuments] = useState<SalesDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  // Transaction Modal state
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Document Modal states
  const [isDocFormOpen, setIsDocFormOpen] = useState(false);
  const [docFormType, setDocFormType] = useState<DocType>('QUOTATION');
  const [editingDoc, setEditingDoc] = useState<SalesDocument | null>(null);
  const [viewingDoc, setViewingDoc] = useState<SalesDocument | null>(null);

  // Action Confirmation states
  const [convertingDoc, setConvertingDoc] = useState<SalesDocument | null>(null);
  const [closingInvoice, setClosingInvoice] = useState<SalesDocument | null>(null);
  const [cancellingInvoice, setCancellingInvoice] = useState<SalesDocument | null>(null);
  const [paymentDoc, setPaymentDoc] = useState<SalesDocument | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Keterangan Quick Edit state
  const [editingKeteranganDoc, setEditingKeteranganDoc] = useState<SalesDocument | null>(null);
  const [keteranganVal, setKeteranganVal] = useState('');
  const [keteranganParentId, setKeteranganParentId] = useState<number | string>('');
  const [isUpdatingKeterangan, setIsUpdatingKeterangan] = useState(false);

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
        if (res.data.documents) {
          setDocuments(res.data.documents);
        }
      }

      // Fetch fresh documents list
      try {
        const docRes = await apiRequest(`/documents/customer/${id}`);
        if (docRes.success && docRes.data) {
          setDocuments(docRes.data);
        }
      } catch {
        // Fallback to customer.documents
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

  const quotations = documents.filter(d => d.doc_type === 'QUOTATION');
  const invoices = documents.filter(d => d.doc_type === 'INVOICE');

  // Can this user manage documents for this customer?
  // Only the assigned sales (non-admin) can create or modify documents
  const isAssignedSales = !isAdmin && customer?.assigned_sales_id === user?.id;

  // Handler: Open Add Document Modal
  const handleOpenAddDoc = (type: DocType) => {
    if (isAdmin) {
      showToast('Admin memiliki akses hanya-baca pada dokumen penawaran dan invoice.', 'info');
      return;
    }
    if (!isAssignedSales) {
      showToast('Anda hanya dapat membuat dokumen untuk customer yang menjadi tanggung jawab Anda.', 'error');
      return;
    }
    setDocFormType(type);
    setEditingDoc(null);
    setIsDocFormOpen(true);
  };

  // Handler: Open Edit Document
  const handleOpenEditDoc = (doc: SalesDocument) => {
    if (isAdmin) {
      showToast('Admin memiliki akses hanya-baca pada dokumen Sales.', 'info');
      return;
    }
    if (!isAssignedSales) {
      showToast('Akses ditolak: Dokumen bukan milik customer Anda.', 'error');
      return;
    }
    if (doc.status === 'CLOSING') {
      showToast('Dokumen yang sudah Closing tidak dapat diubah.', 'info');
      return;
    }
    setDocFormType(doc.doc_type);
    setEditingDoc(doc);
    setIsDocFormOpen(true);
  };

  // Handler: Convert Quotation to Invoice
  const handleConfirmConvert = async () => {
    if (!convertingDoc) return;
    setIsProcessingAction(true);
    try {
      const res = await apiRequest(`/documents/${convertingDoc.id}/convert-to-invoice`, {
        method: 'POST',
      });
      if (res.success) {
        showToast(res.message || 'Quotation berhasil dikonversi menjadi Invoice!', 'success');
        setConvertingDoc(null);
        if (customer) loadDetails(customer.id);
        if (onReloadParent) onReloadParent();
        setActiveTab('invoices');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal mengonversi quotation ke invoice.', 'error');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Handler: Close Invoice (create transaction & enter omzet)
  const handleConfirmCloseInvoice = async () => {
    if (!closingInvoice) return;
    setIsProcessingAction(true);
    try {
      const res = await apiRequest(`/documents/${closingInvoice.id}/close`, {
        method: 'POST',
      });
      if (res.success) {
        showToast(res.message || 'Invoice berhasil dicatat sebagai transaksi Closing!', 'success');
        setClosingInvoice(null);
        if (customer) loadDetails(customer.id);
        if (onReloadParent) onReloadParent();
        setActiveTab('transactions');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menandai invoice sebagai closing.', 'error');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Handler: Cancel Invoice (Updates document and reverses linked omzet)
  const handleConfirmCancelInvoice = async () => {
    if (!cancellingInvoice) return;
    setIsProcessingAction(true);
    try {
      const res = await apiRequest(`/sales-documents/${cancellingInvoice.id}/cancel`, {
        method: 'POST',
      });
      if (res.success) {
        showToast(res.message || 'Invoice berhasil dibatalkan.', 'success');
        setCancellingInvoice(null);
        if (customer) loadDetails(customer.id);
        if (onReloadParent) onReloadParent();
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal membatalkan invoice.', 'error');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Handler: Delete Document
  const handleDeleteDoc = async (doc: SalesDocument) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus ${doc.doc_type === 'QUOTATION' ? 'Penawaran' : 'Invoice'} #${doc.doc_number}?`)) {
      return;
    }
    try {
      const res = await apiRequest(`/documents/${doc.id}`, { method: 'DELETE' });
      if (res.success) {
        showToast(res.message || 'Dokumen berhasil dihapus.', 'success');
        if (customer) loadDetails(customer.id);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus dokumen.', 'error');
    }
  };

  // Handler: Save Keterangan & Relasi DP/Pelunasan
  const handleSaveKeterangan = async () => {
    if (!editingKeteranganDoc) return;
    setIsUpdatingKeterangan(true);
    try {
      const res = await apiRequest(`/documents/${editingKeteranganDoc.id}/keterangan`, {
        method: 'PATCH',
        body: JSON.stringify({
          invoice_type: keteranganVal.trim(),
          parent_invoice_id: keteranganParentId ? Number(keteranganParentId) : null,
        }),
      });
      if (res.success) {
        showToast('Keterangan invoice berhasil diperbarui.', 'success');
        setEditingKeteranganDoc(null);
        if (customer) loadDetails(customer.id);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui keterangan invoice.', 'error');
    } finally {
      setIsUpdatingKeterangan(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/70 backdrop-blur-xs">
        <div className="w-full sm:max-w-4xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[94vh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:fade-in duration-200">
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

                <div className="flex items-center gap-1.5">
                  {isAdmin && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-md">
                      <Shield className="w-3 h-3 text-amber-600" />
                      <span>Mode Monitor (Read-Only)</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-neutral-400 hover:text-neutral-600 active:bg-neutral-200 shrink-0"
                    aria-label="Tutup Detail Customer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Sub-Header Tabs (5 Bagian Utama Sesuai Kebutuhan Sales & Admin) */}
              <div className="px-3 sm:px-6 bg-white border-b border-neutral-200 flex items-center gap-1 overflow-x-auto shrink-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`px-3 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    activeTab === 'overview'
                      ? 'border-[#c5a059] text-neutral-950'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>Ringkasan Customer</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('quotations')}
                  className={`px-3 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    activeTab === 'quotations'
                      ? 'border-[#c5a059] text-neutral-950'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Penawaran / Quotation</span>
                  {quotations.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-mono">
                      {quotations.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('invoices')}
                  className={`px-3 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    activeTab === 'invoices'
                      ? 'border-[#c5a059] text-neutral-950'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Invoice</span>
                  {invoices.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-mono">
                      {invoices.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('transactions')}
                  className={`px-3 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    activeTab === 'transactions'
                      ? 'border-[#c5a059] text-neutral-950'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Riwayat Transaksi</span>
                  {customerClosings.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-800 font-mono">
                      {customerClosings.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('activities')}
                  className={`px-3 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    activeTab === 'activities'
                      ? 'border-[#c5a059] text-neutral-950'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Riwayat Aktivitas</span>
                  {(customer.activities?.length || 0) > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-800 font-mono">
                      {customer.activities?.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {/* ======================================================== */}
                {/* TAB 1: RINGKASAN CUSTOMER */}
                {/* ======================================================== */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    {/* Jadwal & SOP Follow-Up */}
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

                    {/* Profil Kontak & Perusahaan (Wajib Mempertahankan Tanggal Masuk WIB) */}
                    <div className="p-4 rounded-2xl border border-neutral-200/90 bg-white space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                          <UserIcon className="w-3.5 h-3.5 text-neutral-600" />
                          <span>Profil Kontak & Perusahaan</span>
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {/* Tanggal Masuk (WIB) */}
                        <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                          <span className="text-neutral-500">Tanggal Masuk:</span>
                          <strong className="text-neutral-900 font-mono text-[11px]">{formatToWIB(customer.created_at)}</strong>
                        </div>

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

                        {/* PIC Kontak */}
                        <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                          <span className="text-neutral-500">PIC Pemesan:</span>
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
                          <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-200 text-neutral-800 text-[11px] leading-relaxed">
                            {customer.notes || 'Belum ada catatan khusus.'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ======================================================== */}
                {/* TAB 2: PENAWARAN / QUOTATION */}
                {/* ======================================================== */}
                {activeTab === 'quotations' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                          <FileText className="w-3.5 h-3.5 text-amber-600" />
                          <span>Daftar Penawaran Harga ({quotations.length})</span>
                        </h3>
                        <p className="text-[11px] text-neutral-500 mt-0.5">
                          Quotation tidak dihitung sebagai omzet sampai disetujui & menjadi Invoice Closing.
                        </p>
                      </div>

                      {isAssignedSales ? (
                        <button
                          type="button"
                          onClick={() => handleOpenAddDoc('QUOTATION')}
                          className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#c5a059]" />
                          <span>Buat Penawaran</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-neutral-400 font-mono italic">
                          {isAdmin ? 'Mode Read-Only (Admin)' : 'Hanya Sales PIC'}
                        </span>
                      )}
                    </div>

                    {quotations.length === 0 ? (
                      <div className="p-8 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50 space-y-2">
                        <FileText className="w-8 h-8 text-neutral-300 mx-auto" />
                        <p>Belum ada penawaran harga (quotation) untuk customer ini.</p>
                        {isAssignedSales && (
                          <button
                            type="button"
                            onClick={() => handleOpenAddDoc('QUOTATION')}
                            className="px-3 py-1.5 text-xs font-bold text-neutral-900 bg-[#c5a059]/20 hover:bg-[#c5a059]/30 rounded-lg inline-flex items-center gap-1 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#c5a059]" />
                            <span>+ Buat Penawaran Pertama</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {quotations.map(quo => (
                          <div
                            key={quo.id}
                            className="p-4 rounded-xl border border-neutral-200 bg-white shadow-2xs space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-xs text-neutral-900">
                                    {quo.doc_number}
                                  </span>
                                  <span
                                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                      quo.status === 'APPROVED'
                                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                                        : quo.status === 'SENT'
                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                        : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                                    }`}
                                  >
                                    {quo.status}
                                  </span>
                                </div>
                                <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                                  Tanggal: {quo.doc_date} {quo.due_date ? `• Berlaku s/d: ${quo.due_date}` : ''} • Sales: {quo.sales_name || 'Tim Sales'}
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-[10px] text-neutral-400 block">Total Penawaran</span>
                                <div className="font-mono font-bold text-sm text-neutral-900">
                                  Rp {Number(quo.total_amount).toLocaleString('id-ID')}
                                </div>
                              </div>
                            </div>

                            {/* Items List Preview */}
                            <div className="text-xs bg-neutral-50 rounded-lg p-2.5 border border-neutral-200/60 space-y-1">
                              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block">
                                Rincian Produk ({(quo.items || []).length} Item):
                              </span>
                              <div className="space-y-1 max-h-24 overflow-y-auto font-mono text-[11px]">
                                {(quo.items || []).map((it, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-neutral-700">
                                    <span className="truncate">
                                      {idx + 1}. {it.product_name} ({Number(it.quantity)} {it.unit})
                                    </span>
                                    <span className="shrink-0 font-semibold">
                                      Rp {Number(it.subtotal).toLocaleString('id-ID')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-100 text-xs">
                              <button
                                type="button"
                                onClick={() => setViewingDoc(quo)}
                                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5 text-neutral-600" />
                                <span>Lihat / Cetak PDF</span>
                              </button>

                              {isAssignedSales && (
                                <div className="flex items-center gap-1.5">
                                  {/* Convert to Invoice Button */}
                                  <button
                                    type="button"
                                    onClick={() => setConvertingDoc(quo)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1 transition-colors shadow-2xs"
                                    title="Konversi quotation ini menjadi invoice resmi"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5" />
                                    <span>Konversi ke Invoice</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDoc(quo)}
                                    className="p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors"
                                    title="Edit Quotation"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDoc(quo)}
                                    className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Hapus Quotation"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ======================================================== */}
                {/* TAB 3: INVOICE */}
                {/* ======================================================== */}
                {activeTab === 'invoices' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                          <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Daftar Invoice ({invoices.length})</span>
                        </h3>
                        <p className="text-[11px] text-neutral-500 mt-0.5">
                          Tandai invoice sebagai CLOSING untuk mencatatnya otomatis ke laporan omzet.
                        </p>
                      </div>

                      {isAssignedSales ? (
                        <button
                          type="button"
                          onClick={() => handleOpenAddDoc('INVOICE')}
                          className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#c5a059]" />
                          <span>Buat Invoice</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-neutral-400 font-mono italic">
                          {isAdmin ? 'Mode Read-Only (Admin)' : 'Hanya Sales PIC'}
                        </span>
                      )}
                    </div>

                    {invoices.length === 0 ? (
                      <div className="p-8 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50 space-y-2">
                        <Receipt className="w-8 h-8 text-neutral-300 mx-auto" />
                        <p>Belum ada invoice diterbitkan untuk customer ini.</p>
                        {isAssignedSales && (
                          <button
                            type="button"
                            onClick={() => handleOpenAddDoc('INVOICE')}
                            className="px-3 py-1.5 text-xs font-bold text-neutral-900 bg-[#c5a059]/20 hover:bg-[#c5a059]/30 rounded-lg inline-flex items-center gap-1 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#c5a059]" />
                            <span>+ Buat Invoice Baru</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {invoices.map(inv => (
                          <div
                            key={inv.id}
                            className={`p-4 rounded-xl border bg-white shadow-2xs space-y-3 ${
                              inv.status === 'CLOSING' ? 'border-emerald-300 bg-emerald-50/15' : 'border-neutral-200'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-xs text-neutral-900">
                                    {inv.doc_number}
                                  </span>
                                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                    {inv.invoice_type || 'INVOICE STANDARD'}
                                  </span>
                                  {inv.parent_invoice_id && (
                                    <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      Induk DP: #{inv.parent_invoice_id}
                                    </span>
                                  )}
                                  <span
                                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                      inv.status === 'CLOSING' || inv.status === 'PAID'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : inv.status === 'PARTIAL'
                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                        : inv.status === 'UNPAID'
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : inv.status === 'CANCELLED' || inv.status === 'CANCEL'
                                        ? 'bg-neutral-100 text-neutral-500 border-neutral-200 line-through'
                                        : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                                    }`}
                                  >
                                    {inv.status === 'CLOSING'
                                      ? 'LUNAS (CLOSING)'
                                      : inv.status === 'PAID'
                                      ? 'LUNAS'
                                      : inv.status === 'PARTIAL'
                                      ? 'BAYAR SEBAGIAN'
                                      : inv.status === 'UNPAID'
                                      ? 'BELUM DIBAYAR'
                                      : inv.status === 'CANCELLED'
                                      ? 'DIBATALKAN'
                                      : inv.status}
                                  </span>
                                </div>
                                <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                                  Tanggal: {inv.doc_date} {inv.due_date ? `• Jatuh Tempo: ${inv.due_date}` : ''} • Sales: {inv.sales_name || 'Tim Sales'}
                                </div>
                              </div>

                              <div className="flex items-center gap-4 text-right">
                                <div>
                                  <span className="text-[10px] text-neutral-400 block">Total Tagihan</span>
                                  <div className="font-mono font-black text-xs sm:text-sm text-neutral-950">
                                    Rp {Number(inv.total_amount).toLocaleString('id-ID')}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[10px] text-neutral-400 block">Sisa Tagihan</span>
                                  <div className={`font-mono font-bold text-xs sm:text-sm ${
                                    (Number(inv.remaining_balance ?? inv.total_amount) <= 0) ? 'text-emerald-600' : 'text-rose-600'
                                  }`}>
                                    Rp {Number(inv.remaining_balance !== undefined ? inv.remaining_balance : Math.max(0, Number(inv.total_amount) - (Number(inv.paid_amount) || 0))).toLocaleString('id-ID')}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Omzet Integration Status */}
                            <div className="flex items-center justify-between text-xs font-mono">
                              {inv.status === 'CLOSING' ? (
                                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <span>Tercatat Otomatis di Omzet Closing (Trx #{inv.transaction_id || '-'})</span>
                                </div>
                              ) : inv.status === 'CANCELLED' || inv.status === 'CANCEL' ? (
                                <div className="text-neutral-400 text-[11px] flex items-center gap-1 line-through">
                                  <span>Invoice Dibatalkan</span>
                                </div>
                              ) : (
                                <div className="text-neutral-500 text-[11px] flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-neutral-400" />
                                  <span>Belum closing omzet (menunggu pelunasan)</span>
                                </div>
                              )}
                              {Number(inv.paid_amount || 0) > 0 && (
                                <div className="text-[11px] text-emerald-700 font-bold">
                                  Sudah Dibayar: Rp {Number(inv.paid_amount).toLocaleString('id-ID')}
                                </div>
                              )}
                            </div>

                            {/* Items List Preview */}
                            <div className="text-xs bg-neutral-50 rounded-lg p-2.5 border border-neutral-200/60 space-y-1">
                              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block">
                                Rincian Produk ({(inv.items || []).length} Item):
                              </span>
                              <div className="space-y-1 max-h-24 overflow-y-auto font-mono text-[11px]">
                                {(inv.items || []).map((it, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-neutral-700">
                                    <span className="truncate">
                                      {idx + 1}. {it.product_name} ({Number(it.quantity)} {it.unit})
                                    </span>
                                    <span className="shrink-0 font-semibold">
                                      Rp {Number(it.subtotal).toLocaleString('id-ID')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-100 text-xs">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setViewingDoc(inv)}
                                  className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5 text-neutral-600" />
                                  <span>Lihat / Cetak PDF</span>
                                </button>

                                {(isAssignedSales || isAdmin) && inv.status !== 'CANCELLED' && inv.status !== 'CANCEL' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingKeteranganDoc(inv);
                                      setKeteranganVal(inv.invoice_type || 'INVOICE STANDARD');
                                      setKeteranganParentId(inv.parent_invoice_id || '');
                                    }}
                                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-semibold flex items-center gap-1 transition-colors"
                                    title="Edit Keterangan Invoice (DP/Pelunasan/Cicilan)"
                                  >
                                    <Edit className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Keterangan</span>
                                  </button>
                                )}
                              </div>

                              {isAssignedSales && inv.status !== 'CANCELLED' && inv.status !== 'CANCEL' && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {/* Catat Pembayaran Button */}
                                  <button
                                    type="button"
                                    onClick={() => setPaymentDoc(inv)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1 transition-colors shadow-2xs"
                                    title="Catat Pembayaran Masuk"
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                    <span>Catat Pembayaran</span>
                                  </button>

                                  {inv.status !== 'CLOSING' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setClosingInvoice(inv)}
                                        className="px-3 py-1.5 bg-[#c5a059] hover:bg-[#b08b47] text-neutral-950 font-bold rounded-lg flex items-center gap-1 transition-colors shadow-2xs"
                                        title="Tandai Closing & Masukkan ke Laporan Omzet"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Tandai Closing (Omzet)</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditDoc(inv)}
                                        className="p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors"
                                        title="Edit Invoice"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleDeleteDoc(inv)}
                                        className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                        title="Hapus Invoice"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}

                                  {/* Cancel Invoice Button */}
                                  <button
                                    type="button"
                                    onClick={() => setCancellingInvoice(inv)}
                                    className="px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-[11px] font-semibold"
                                    title="Batalkan Invoice"
                                  >
                                    Batalkan
                                  </button>
                                </div>
                              )}
                            </div>

                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ======================================================== */}
                {/* TAB 4: RIWAYAT TRANSAKSI (OMZET DEALS) */}
                {/* ======================================================== */}
                {activeTab === 'transactions' && (
                  <div className="p-4 rounded-2xl border border-neutral-200/90 bg-white space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-[#c5a059]" />
                        <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider font-mono">
                          Transaksi & Omzet ({customerClosings.length} Deals)
                        </h3>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTransaction(null);
                            setIsTransactionModalOpen(true);
                          }}
                          className="min-h-[36px] px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#c5a059]" />
                          <span>Catat Closing Manual</span>
                        </button>
                      )}
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
                              {isAdmin && !trx.invoice_id && (
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
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ======================================================== */}
                {/* TAB 5: RIWAYAT AKTIVITAS FOLLOW-UP */}
                {/* ======================================================== */}
                {activeTab === 'activities' && (
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
                )}
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

                  {isAssignedSales && (
                    <button
                      type="button"
                      onClick={() => handleOpenAddDoc('INVOICE')}
                      className="min-h-[44px] px-3.5 py-2 text-xs font-bold text-neutral-950 bg-[#c5a059]/15 hover:bg-[#c5a059]/25 active:bg-[#c5a059]/35 border border-[#c5a059]/40 rounded-xl flex items-center justify-center gap-1 transition-colors"
                      title="Buat Dokumen Invoice untuk Customer Ini"
                    >
                      <Receipt className="w-4 h-4 text-[#c5a059]" />
                      <span>+ Invoice</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Transaction Form Modal */}
      {customer && (
        <TransactionFormModal
          isOpen={isTransactionModalOpen}
          preselectedCustomer={customer}
          initialTransaction={editingTransaction}
          onClose={() => {
            setIsTransactionModalOpen(false);
            setEditingTransaction(null);
          }}
          onSuccess={() => {
            loadDetails(customer.id);
            if (onReloadParent) onReloadParent();
          }}
        />
      )}

      {/* Document Form Modal (Quotation & Invoice Creation) */}
      {customer && (
        <DocumentFormModal
          isOpen={isDocFormOpen}
          docType={docFormType}
          customer={customer}
          editingDoc={editingDoc}
          onClose={() => {
            setIsDocFormOpen(false);
            setEditingDoc(null);
          }}
          onSuccess={() => {
            loadDetails(customer.id);
            if (onReloadParent) onReloadParent();
          }}
        />
      )}

      {/* Document View & Print Modal */}
      <DocumentViewModal
        isOpen={Boolean(viewingDoc)}
        document={viewingDoc}
        onClose={() => setViewingDoc(null)}
      />

      {/* Confirmation Modal: Convert Quotation to Invoice */}
      {convertingDoc && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-neutral-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <ArrowRight className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Konversi Penawaran ke Invoice</h3>
                <p className="text-xs text-neutral-500 font-mono">No. {convertingDoc.doc_number}</p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Customer telah menyetujui penawaran ini? Sistem akan menerbitkan Invoice resmi baru dengan seluruh daftar produk, kuantitas, dan total senilai{' '}
              <strong className="text-neutral-900 font-mono">
                Rp {Number(convertingDoc.total_amount).toLocaleString('id-ID')}
              </strong>.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setConvertingDoc(null)}
                disabled={isProcessingAction}
                className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmConvert}
                disabled={isProcessingAction}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isProcessingAction ? 'Mengonversi...' : 'Ya, Terbitkan Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Close Invoice (Mark as Closing & Enter Omzet) */}
      {closingInvoice && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-neutral-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#c5a059]/15 text-[#c5a059] flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Tandai Invoice Lunas & Closing</h3>
                <p className="text-xs text-neutral-500 font-mono">Invoice #{closingInvoice.doc_number}</p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Tandai invoice ini sebagai <strong className="text-emerald-700 font-bold">CLOSING</strong>? Sistem akan otomatis mencatat tepat 1 transaksi closing senilai{' '}
              <strong className="text-neutral-900 font-mono">
                Rp {Number(closingInvoice.total_amount).toLocaleString('id-ID')}
              </strong>{' '}
              ke dalam laporan omzet Captain Konveksi.
            </p>

            <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800">
              Perhatian: Dokumen yang sudah Closing tidak dapat diedit kembali demi integritas audit keuangan.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setClosingInvoice(null)}
                disabled={isProcessingAction}
                className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmCloseInvoice}
                disabled={isProcessingAction}
                className="px-4 py-2 text-xs font-bold text-neutral-950 bg-[#c5a059] hover:bg-[#b08b47] rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isProcessingAction ? 'Menyimpan...' : 'Ya, Catat Closing Omzet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Cancel Invoice */}
      {cancellingInvoice && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-neutral-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Batalkan Invoice</h3>
                <p className="text-xs text-neutral-500 font-mono">Invoice #{cancellingInvoice.doc_number}</p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Apakah Anda yakin ingin membatalkan invoice ini? Jika invoice ini sebelumnya telah dicatat sebagai transaksi Closing, maka status transaksi omzet terkait akan otomatis disesuaikan menjadi <strong className="text-rose-600">CANCEL</strong>.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setCancellingInvoice(null)}
                disabled={isProcessingAction}
                className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelInvoice}
                disabled={isProcessingAction}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isProcessingAction ? 'Membatalkan...' : 'Ya, Batalkan Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Form Modal */}
      <PaymentFormModal
        isOpen={!!paymentDoc}
        document={paymentDoc}
        onClose={() => setPaymentDoc(null)}
        onSuccess={() => {
          if (customer) loadDetails(customer.id);
          if (onReloadParent) onReloadParent();
        }}
      />

      {/* Modal: Edit Keterangan Invoice (PR-02 & PR-03) */}
      {editingKeteranganDoc && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-neutral-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Edit Keterangan Invoice</h3>
                <p className="text-xs text-neutral-500 font-mono">Invoice #{editingKeteranganDoc.doc_number}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingKeteranganDoc(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                  Pilih Keterangan Cepat:
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['INVOICE STANDARD', 'INVOICE DP', 'INVOICE TERMIN / CICILAN', 'INVOICE PELUNASAN'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setKeteranganVal(opt)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                        keteranganVal === opt
                          ? 'bg-blue-600 text-white'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={keteranganVal}
                  onChange={e => setKeteranganVal(e.target.value)}
                  placeholder="Ketik keterangan invoice kustom..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900"
                />
              </div>

              {/* Relasi Induk / DP Terkait */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                  Relasi Invoice Induk / DP Terkait:
                </label>
                <select
                  value={keteranganParentId}
                  onChange={e => setKeteranganParentId(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-medium text-neutral-900 bg-white"
                >
                  <option value="">-- Tidak Terhubung ke Invoice Lain --</option>
                  {invoices
                    .filter(i => i.id !== editingKeteranganDoc.id)
                    .map(i => (
                      <option key={i.id} value={i.id}>
                        {i.doc_number} ({i.invoice_type || 'INVOICE'}) — Total: Rp {Number(i.total_amount).toLocaleString('id-ID')} [{i.status}]
                      </option>
                    ))}
                </select>
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800">
                Catatan: Mengubah keterangan tidak mengubah nominal tagihan, riwayat pembayaran, maupun laporan omzet closing.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setEditingKeteranganDoc(null)}
                disabled={isUpdatingKeterangan}
                className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveKeterangan}
                disabled={isUpdatingKeterangan || !keteranganVal.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isUpdatingKeterangan ? 'Menyimpan...' : 'Simpan Keterangan'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
};
