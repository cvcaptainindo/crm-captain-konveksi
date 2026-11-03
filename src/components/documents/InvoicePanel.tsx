import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Customer, SalesDocument, SalesDocumentRefund } from '../../types/index.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { apiRequest } from '../../api/client.js';
import { DocumentFormModal } from './DocumentFormModal.js';
import { DocumentViewModal } from './DocumentViewModal.js';
import { PaymentFormModal } from './PaymentFormModal.js';
import {
  FileText, Plus, Eye, Pencil, Wallet, CheckCircle2, Ban, RefreshCw,
  RotateCcw, Clock3, AlertCircle,
} from 'lucide-react';

interface InvoicePanelProps {
  customer: Customer;
}

const formatRupiah = (value: number | string | null | undefined) =>
  `Rp ${(Number(value) || 0).toLocaleString('id-ID')}`;

const dateLabel = (value?: string | null) => {
  if (!value) return '-';
  const dateOnly = String(value).slice(0, 10);
  const parts = dateOnly.split('-');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateOnly;
};

const statusLabel: Record<string, string> = {
  DRAFT: 'Draft', SENT: 'Terkirim', UNPAID: 'Belum Dibayar', PARTIAL: 'Dibayar Sebagian',
  PAID: 'Lunas', OVERDUE: 'Jatuh Tempo', CLOSING: 'Closing', CANCELLED: 'Dibatalkan', CANCEL: 'Dibatalkan',
};

export const InvoicePanel: React.FC<InvoicePanelProps> = ({ customer }) => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<SalesDocument[]>([]);
  const [refundsByInvoice, setRefundsByInvoice] = useState<Record<number, SalesDocumentRefund[]>>({});
  const [loading, setLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SalesDocument | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<SalesDocument | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<SalesDocument | null>(null);
  const [refundInvoice, setRefundInvoice] = useState<SalesDocument | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundDate, setRefundDate] = useState('');
  const [refundMethod, setRefundMethod] = useState('TRANSFER');
  const [refundReference, setRefundReference] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [refundStatus, setRefundStatus] = useState<'PENDING' | 'COMPLETED'>('PENDING');
  const [busy, setBusy] = useState(false);

  const canManage = !isAdmin && user?.role === 'SALES' && Number(customer.assigned_sales_id) === Number(user.id);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/documents/customer/${customer.id}`);
      const invoiceRows = Array.isArray(res?.data)
        ? (res.data as SalesDocument[]).filter(item => item.doc_type === 'INVOICE')
        : [];
      setInvoices(invoiceRows);

      const refundResults = await Promise.all(invoiceRows.map(async invoice => {
        try {
          const refundRes = await apiRequest(`/documents/${invoice.id}/refunds`);
          return [invoice.id, Array.isArray(refundRes?.data) ? refundRes.data as SalesDocumentRefund[] : []] as const;
        } catch {
          return [invoice.id, []] as const;
        }
      }));
      setRefundsByInvoice(Object.fromEntries(refundResults) as Record<number, SalesDocumentRefund[]>);
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat invoice customer.', 'error');
    } finally {
      setLoading(false);
    }
  }, [customer.id, showToast]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const summary = useMemo(() => invoices.reduce((acc, invoice) => {
    acc.total += Number(invoice.total_amount) || 0;
    acc.paid += Number(invoice.paid_amount) || 0;
    acc.count += 1;
    return acc;
  }, { total: 0, paid: 0, count: 0 }), [invoices]);

  const fetchFullInvoice = async (invoice: SalesDocument): Promise<SalesDocument | null> => {
    try {
      const res = await apiRequest(`/documents/${invoice.id}`);
      if (res?.success && res.data) return res.data as SalesDocument;
      throw new Error(res?.message || 'Detail invoice tidak tersedia.');
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat detail invoice.', 'error');
      return null;
    }
  };

  const openView = async (invoice: SalesDocument) => {
    const full = await fetchFullInvoice(invoice);
    if (full) setViewingInvoice(full);
  };

  const openEdit = async (invoice: SalesDocument) => {
    if (!canManage) return;
    if (invoice.status === 'CLOSING' || invoice.status === 'CANCELLED' || invoice.status === 'CANCEL' || Number(invoice.paid_amount) > 0) {
      showToast('Invoice yang sudah dibayar, closing, atau dibatalkan tidak dapat diedit.', 'info');
      return;
    }
    const full = await fetchFullInvoice(invoice);
    if (full) {
      setEditingInvoice(full);
      setIsFormOpen(true);
    }
  };

  const openPayment = async (invoice: SalesDocument) => {
    if (!canManage || ['CANCELLED', 'CANCEL'].includes(invoice.status)) return;
    const full = await fetchFullInvoice(invoice);
    if (full) setPaymentInvoice(full);
  };

  const runInvoiceAction = async (invoice: SalesDocument, action: 'close' | 'cancel') => {
    const prompt = action === 'close'
      ? `Tandai invoice ${invoice.doc_number} sebagai CLOSING dan catat satu transaksi omzet?`
      : `Batalkan invoice ${invoice.doc_number}? Riwayat pembayaran dan transaksi tidak akan dihapus.`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    try {
      const res = await apiRequest(`/documents/${invoice.id}/${action}`, { method: 'POST' });
      if (!res?.success) throw new Error(res?.message || 'Aksi gagal diproses.');
      showToast(res.message || (action === 'close' ? 'Invoice berhasil di-closing.' : 'Invoice berhasil dibatalkan.'), 'success');
      await loadInvoices();
    } catch (err: any) {
      showToast(err.message || 'Aksi invoice gagal.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openRefund = (invoice: SalesDocument) => {
    setRefundInvoice(invoice);
    setRefundAmount('');
    setRefundDate(new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setRefundMethod('TRANSFER');
    setRefundReference('');
    setRefundNotes('');
    setRefundStatus('PENDING');
  };

  const submitRefund = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!refundInvoice) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Nominal refund harus lebih dari 0.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest(`/documents/${refundInvoice.id}/refunds`, {
        method: 'POST',
        body: JSON.stringify({
          amount,
          status: refundStatus,
          refund_date: refundStatus === 'COMPLETED' ? refundDate : null,
          refund_method: refundStatus === 'COMPLETED' ? refundMethod : null,
          reference_number: refundReference.trim() || null,
          notes: refundNotes.trim() || null,
        }),
      });
      if (!res?.success) throw new Error(res?.message || 'Refund gagal disimpan.');
      showToast(res.message || 'Catatan refund berhasil disimpan.', 'success');
      setRefundInvoice(null);
      await loadInvoices();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan refund.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const completeRefund = async (invoice: SalesDocument, refund: SalesDocumentRefund) => {
    const date = window.prompt('Tanggal refund (YYYY-MM-DD):', new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10));
    if (!date) return;
    const method = window.prompt('Metode refund (TRANSFER/CASH/QRIS/OTHER):', 'TRANSFER');
    if (!method) return;
    setBusy(true);
    try {
      const res = await apiRequest(`/documents/${invoice.id}/refunds/${refund.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED', refund_date: date, refund_method: method }),
      });
      if (!res?.success) throw new Error(res?.message || 'Status refund gagal diperbarui.');
      showToast(res.message || 'Refund ditandai selesai.', 'success');
      await loadInvoices();
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui refund.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="p-4 rounded-2xl border border-neutral-200/90 bg-white space-y-3 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#c5a059]" />
          <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider font-mono">Invoice ({invoices.length})</h3>
        </div>
        {canManage && (
          <button type="button" onClick={() => { setEditingInvoice(null); setIsFormOpen(true); }} className="min-h-[36px] px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5 text-[#c5a059]" /> Buat Invoice
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-50"><span className="block text-[10px] text-neutral-500">Jumlah</span><strong>{summary.count}</strong></div>
        <div className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-50"><span className="block text-[10px] text-neutral-500">Nilai Invoice</span><strong className="text-[11px]">{formatRupiah(summary.total)}</strong></div>
        <div className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-50"><span className="block text-[10px] text-neutral-500">Terbayar</span><strong className="text-[11px] text-emerald-700">{formatRupiah(summary.paid)}</strong></div>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center gap-2 text-xs text-neutral-500"><RefreshCw className="w-4 h-4 animate-spin" /> Memuat invoice...</div>
      ) : invoices.length === 0 ? (
        <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 rounded-xl">Belum ada invoice untuk customer ini.</div>
      ) : (
        <div className="space-y-2">
          {invoices.map(invoice => {
            const paid = Number(invoice.paid_amount) || 0;
            const balance = Math.max(0, Number(invoice.total_amount) - paid);
            const cancelled = ['CANCELLED', 'CANCEL'].includes(invoice.status);
            const refunds = refundsByInvoice[invoice.id] || [];
            const pendingRefunds = refunds.filter(refund => refund.status === 'PENDING');
            return (
              <article key={invoice.id} className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-neutral-900">{invoice.doc_number}</div>
                    <div className="text-[10px] text-neutral-500">Tanggal {dateLabel(invoice.doc_date)}{invoice.due_date ? ` • Jatuh tempo ${dateLabel(invoice.due_date)}` : ''}</div>
                  </div>
                  <span className={`h-fit px-2 py-1 rounded-full text-[10px] font-bold ${cancelled ? 'bg-rose-100 text-rose-700' : invoice.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : invoice.status === 'CLOSING' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'}`}>
                    {statusLabel[invoice.status] || invoice.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div><span className="text-neutral-500 block">Total</span><strong className="text-neutral-900">{formatRupiah(invoice.total_amount)}</strong></div>
                  <div><span className="text-neutral-500 block">Dibayar</span><strong className="text-emerald-700">{formatRupiah(paid)}</strong></div>
                  <div><span className="text-neutral-500 block">Sisa</span><strong className="text-rose-700">{formatRupiah(balance)}</strong></div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button type="button" onClick={() => openView(invoice)} className="px-2.5 py-1.5 rounded-lg bg-white border border-neutral-200 text-[10px] font-semibold inline-flex items-center gap-1"><Eye className="w-3 h-3" /> Lihat</button>
                  {canManage && !cancelled && invoice.status !== 'CLOSING' && paid <= 0 && (
                    <button type="button" onClick={() => openEdit(invoice)} className="px-2.5 py-1.5 rounded-lg bg-white border border-neutral-200 text-[10px] font-semibold inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> Edit</button>
                  )}
                  {canManage && !cancelled && balance > 0 && (
                    <button type="button" onClick={() => openPayment(invoice)} className="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold inline-flex items-center gap-1"><Wallet className="w-3 h-3" /> Pembayaran</button>
                  )}
                  {canManage && !cancelled && invoice.status !== 'CLOSING' && (
                    <button type="button" disabled={busy} onClick={() => runInvoiceAction(invoice, 'close')} className="px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-semibold inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Closing</button>
                  )}
                  {canManage && !cancelled && (
                    <button type="button" disabled={busy} onClick={() => runInvoiceAction(invoice, 'cancel')} className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold inline-flex items-center gap-1"><Ban className="w-3 h-3" /> Batalkan</button>
                  )}
                  {canManage && cancelled && paid > 0 && (
                    <button type="button" onClick={() => openRefund(invoice)} className="px-2.5 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 text-[10px] font-semibold inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Catat Refund</button>
                  )}
                </div>
                {cancelled && paid > 0 && (
                  <div className="pt-2 border-t border-neutral-200 space-y-1">
                    <div className="text-[10px] font-bold text-neutral-600">Refund terpisah dari riwayat pembayaran</div>
                    {refunds.length === 0 && <div className="text-[10px] text-amber-700 inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Belum ada catatan refund.</div>}
                    {refunds.map(refund => (
                      <div key={refund.id} className="flex flex-wrap justify-between items-center gap-2 text-[10px]">
                        <span>{formatRupiah(refund.amount)} • {refund.status === 'COMPLETED' ? `Selesai ${dateLabel(refund.refund_date)}` : 'Menunggu refund'}</span>
                        {canManage && refund.status === 'PENDING' && <button type="button" disabled={busy} onClick={() => completeRefund(invoice, refund)} className="text-violet-700 font-bold underline">Tandai selesai</button>}
                      </div>
                    ))}
                    {pendingRefunds.length > 0 && <div className="text-[10px] text-amber-700 inline-flex items-center gap-1"><Clock3 className="w-3 h-3" /> {pendingRefunds.length} refund menunggu penyelesaian.</div>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <DocumentFormModal
        isOpen={isFormOpen}
        docType="INVOICE"
        customer={customer}
        editingDoc={editingInvoice}
        onClose={() => { setIsFormOpen(false); setEditingInvoice(null); }}
        onSuccess={() => { setIsFormOpen(false); setEditingInvoice(null); loadInvoices(); }}
      />
      <DocumentViewModal isOpen={!!viewingInvoice} document={viewingInvoice} onClose={() => setViewingInvoice(null)} />
      <PaymentFormModal
        isOpen={!!paymentInvoice}
        document={paymentInvoice}
        onClose={() => setPaymentInvoice(null)}
        onSuccess={() => { setPaymentInvoice(null); loadInvoices(); }}
      />

      {refundInvoice && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-neutral-950/70">
          <form onSubmit={submitRefund} className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 space-y-3">
            <div><h3 className="font-bold text-sm">Catat Refund Invoice</h3><p className="text-[11px] text-neutral-500">{refundInvoice.doc_number} • Riwayat pembayaran tidak dihapus.</p></div>
            <label className="block text-xs font-semibold">Nominal refund (Rp)<input required type="number" min="1" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} className="mt-1 w-full border rounded-lg p-2" /></label>
            <label className="block text-xs font-semibold">Status refund<select value={refundStatus} onChange={e => setRefundStatus(e.target.value as 'PENDING' | 'COMPLETED')} className="mt-1 w-full border rounded-lg p-2"><option value="PENDING">Menunggu</option><option value="COMPLETED">Sudah dikembalikan</option></select></label>
            {refundStatus === 'COMPLETED' && <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold">Tanggal<input required type="date" value={refundDate} onChange={e => setRefundDate(e.target.value)} className="mt-1 w-full border rounded-lg p-2" /></label><label className="text-xs font-semibold">Metode<select value={refundMethod} onChange={e => setRefundMethod(e.target.value)} className="mt-1 w-full border rounded-lg p-2"><option value="TRANSFER">Transfer</option><option value="CASH">Tunai</option><option value="QRIS">QRIS</option><option value="OTHER">Lainnya</option></select></label></div>}
            <label className="block text-xs font-semibold">Nomor referensi<input value={refundReference} onChange={e => setRefundReference(e.target.value)} className="mt-1 w-full border rounded-lg p-2" /></label>
            <label className="block text-xs font-semibold">Catatan<textarea value={refundNotes} onChange={e => setRefundNotes(e.target.value)} rows={2} className="mt-1 w-full border rounded-lg p-2" /></label>
            <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setRefundInvoice(null)} className="px-3 py-2 rounded-lg border text-xs">Batal</button><button type="submit" disabled={busy} className="px-3 py-2 rounded-lg bg-neutral-900 text-white text-xs font-bold">Simpan Refund</button></div>
          </form>
        </div>
      )}
    </section>
  );
};
