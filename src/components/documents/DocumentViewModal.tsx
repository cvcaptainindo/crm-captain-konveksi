import React, { useEffect, useState } from 'react';
import { InvoiceSettings, SalesDocument } from '../../types/index.js';
import { useToast } from '../../contexts/ToastContext.js';
import { apiRequest } from '../../api/client.js';
import { X, Printer, Copy } from 'lucide-react';

interface DocumentViewModalProps {
  isOpen: boolean;
  document: SalesDocument | null;
  onClose: () => void;
}

export const DocumentViewModal: React.FC<DocumentViewModalProps> = ({
  isOpen,
  document,
  onClose,
}) => {
  const { showToast } = useToast();
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null);

  useEffect(() => {
    if (!isOpen || !document) {
      setInvoiceSettings(null);
      return;
    }
    let active = true;
    apiRequest('/invoice-settings')
      .then(res => {
        if (active) setInvoiceSettings(res?.success && res.data ? res.data as InvoiceSettings : null);
      })
      .catch(() => {
        if (active) setInvoiceSettings(null);
      });
    return () => { active = false; };
  }, [isOpen, document?.id]);

  if (!isOpen || !document) return null;

  const isQuotation = document.doc_type === 'QUOTATION';
  const companyName = invoiceSettings?.company_name?.trim() || 'CAPTAIN KONVEKSI';
  const companyLegalName = invoiceSettings?.company_legal_name || invoiceSettings?.legal_name || '';
  const printTerms = document.terms?.trim() || '';

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    const itemsText = (document.items || [])
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.product_name} - ${Number(it.quantity)} ${it.unit} @ Rp ${Number(
            it.unit_price
          ).toLocaleString('id-ID')} = Rp ${Number(it.subtotal).toLocaleString('id-ID')}`
      )
      .join('\n');

    const message = `*${isQuotation ? 'PENAWARAN HARGA' : 'INVOICE TAGIHAN'} - ${companyName}*
No. Dokumen: *${document.doc_number}*
Tanggal: ${document.doc_date}
Kepada: ${document.customer_name}${document.company_name ? ` (${document.company_name})` : ''}

*Rincian Pesanan:*
${itemsText}

${document.discount > 0 ? `Diskon: Rp ${Number(document.discount).toLocaleString('id-ID')}\n` : ''}${
      document.tax > 0 ? `Pajak: Rp ${Number(document.tax).toLocaleString('id-ID')}\n` : ''
    }*TOTAL KESELURUHAN: Rp ${Number(document.total_amount).toLocaleString('id-ID')}*

${document.notes ? `Catatan: ${document.notes}\n` : ''}
Terima kasih telah mempercayakan produksi konveksi kepada ${companyName}.
Sales PIC: ${document.sales_name || 'Tim Sales'}`;

    navigator.clipboard.writeText(message);
    showToast('Ringkasan dokumen berhasil disalin ke clipboard!', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-neutral-950/75 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[96vh] print:max-h-none print:shadow-none print:border-none print:rounded-none animate-in fade-in duration-200">
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="px-5 py-3 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                isQuotation
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {isQuotation ? 'Quotation (Penawaran)' : 'Invoice Penjualan'}
            </span>
            <span className="font-mono text-xs text-neutral-300 font-bold">
              #{document.doc_number}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              className="px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg flex items-center gap-1.5 transition-colors"
              title="Salin ringkasan pesan WhatsApp"
            >
              <Copy className="w-3.5 h-3.5 text-neutral-400" />
              <span className="hidden sm:inline">Salin WA</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs font-bold text-neutral-950 bg-[#c5a059] hover:bg-[#b08b47] rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
              title="Cetak atau Simpan sebagai PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 text-neutral-900 font-sans print:p-0 print:overflow-visible">
          <div className="border border-neutral-200 rounded-xl p-6 sm:p-8 print:border-none print:p-0 shadow-2xs">
            {/* Header / Kop Surat */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b-2 border-neutral-900">
              <div className="flex items-center gap-3.5">
                <img
                  src={invoiceSettings?.company_logo_url || '/logo.jpg'}
                  alt={companyName}
                  className="w-14 h-14 rounded-xl object-contain border border-[#c5a059]/40 shadow-xs shrink-0"
                />
                <div className="space-y-0.5">
                  <h1 className="text-xl sm:text-2xl font-black text-neutral-950 tracking-tight leading-tight">
                    {companyName}
                  </h1>
                  {companyLegalName && (
                    <div className="text-xs font-bold text-[#c5a059] uppercase tracking-wider font-mono">
                      {companyLegalName}
                    </div>
                  )}
                  {invoiceSettings?.company_address && <p className="text-[10px] text-neutral-600 whitespace-pre-line">{invoiceSettings.company_address}</p>}
                  {(invoiceSettings?.company_phone || invoiceSettings?.company_whatsapp) && <p className="text-[10px] text-neutral-600">Telp/WA: {invoiceSettings.company_phone || invoiceSettings.company_whatsapp}</p>}
                  {invoiceSettings?.company_email && <p className="text-[10px] text-neutral-600">Email: {invoiceSettings.company_email}</p>}
                  {invoiceSettings?.company_website && <p className="text-[10px] text-neutral-600">{invoiceSettings.company_website}</p>}
                  {invoiceSettings?.nib && <p className="text-[10px] text-neutral-600">NIB: {invoiceSettings.nib}</p>}
                  {invoiceSettings?.npwp && <p className="text-[10px] text-neutral-600">NPWP: {invoiceSettings.npwp}</p>}
                </div>
              </div>

              <div className="text-left sm:text-right">
                <div className="text-lg sm:text-xl font-black uppercase tracking-tight text-neutral-950">
                  {isQuotation ? 'SURAT PENAWARAN HARGA' : 'INVOICE PEMBAYARAN'}
                </div>
                <div className="font-mono text-xs font-bold text-neutral-700 mt-1">
                  NO: <span className="text-[#c5a059]">{document.doc_number}</span>
                </div>
                {!isQuotation && document.invoice_type && (
                  <div className="text-[10px] font-bold text-[#a07832] uppercase mt-1">{document.invoice_type}</div>
                )}
                {!isQuotation && document.parent_invoice_number && (
                  <div className="text-[10px] text-neutral-500 font-mono mt-1">Referensi: {document.parent_invoice_number}</div>
                )}
                <div className="mt-1">
                  <span
                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      document.status === 'CLOSING'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : document.status === 'APPROVED'
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : document.status === 'SENT'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-neutral-100 text-neutral-700 border-neutral-300'
                    }`}
                  >
                    STATUS: {document.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Document & Customer Meta Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 text-xs">
              {/* Customer Info */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                  Ditujukan Kepada (Customer):
                </span>
                <strong className="text-sm font-bold text-neutral-950 block">
                  {document.customer_name}
                </strong>
                {document.company_name && (
                  <div className="font-semibold text-neutral-800">{document.company_name}</div>
                )}
                {document.address && <p className="text-neutral-600 leading-relaxed">{document.address}</p>}
                {document.city && <div className="text-neutral-600">Kota: {document.city}</div>}
                {document.whatsapp_number && (
                  <div className="font-mono text-neutral-500">WA: {document.whatsapp_number}</div>
                )}
              </div>

              {/* Meta Info */}
              <div className="sm:text-right space-y-1.5 font-mono text-xs">
                <div className="flex sm:justify-end gap-2">
                  <span className="text-neutral-500 font-sans">Tanggal Dokumen:</span>
                  <strong className="text-neutral-900">{document.doc_date}</strong>
                </div>

                {document.due_date && (
                  <div className="flex sm:justify-end gap-2">
                    <span className="text-neutral-500 font-sans">
                      {isQuotation ? 'Berlaku Hingga:' : 'Jatuh Tempo:'}
                    </span>
                    <strong className="text-neutral-900">{document.due_date}</strong>
                  </div>
                )}

                <div className="flex sm:justify-end gap-2">
                  <span className="text-neutral-500 font-sans">Sales PIC:</span>
                  <strong className="text-amber-800">{document.sales_name || 'Tim Sales'}</strong>
                </div>
              </div>
            </div>

            {/* Multi-Item Table */}
            <div className="border border-neutral-200 rounded-lg overflow-hidden my-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-900 text-white text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 w-8 text-center">#</th>
                    <th className="py-2.5 px-3">Deskripsi Produk & Spesifikasi</th>
                    <th className="py-2.5 px-3 w-20 text-center">Qty</th>
                    <th className="py-2.5 px-3 w-20 text-center">Satuan</th>
                    <th className="py-2.5 px-3 w-32 text-right">Harga Satuan (Rp)</th>
                    <th className="py-2.5 px-3 w-36 text-right">Subtotal (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {(document.items || []).map((it, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}>
                      <td className="py-2.5 px-3 text-center text-neutral-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <strong className="text-neutral-900 block font-semibold">{it.product_name}</strong>
                        {it.notes && (
                          <span className="text-[11px] text-neutral-500 block leading-tight mt-0.5">
                            {it.notes}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium text-neutral-800">
                        {Number(it.quantity).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-center text-neutral-600">{it.unit}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-neutral-800">
                        Rp {Number(it.unit_price).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-950">
                        Rp {Number(it.subtotal).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Calculations & Summary Section */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-6 py-4">
              <div className="flex-1 space-y-3 text-xs">
                {document.notes && (
                  <div>
                    <span className="font-bold text-neutral-800 block text-[11px] mb-1">
                      Catatan Tambahan:
                    </span>
                    <p className="text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200/80 leading-relaxed text-[11px] whitespace-pre-wrap">
                      {document.notes}
                    </p>
                  </div>
                )}

                {printTerms && (
                  <div>
                    <span className="font-bold text-neutral-800 block text-[11px] mb-1">
                      Syarat & Ketentuan:
                    </span>
                    <p className="text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200/80 leading-relaxed text-[10px] whitespace-pre-wrap">
                      {printTerms}
                    </p>
                  </div>
                )}

                {!isQuotation && (invoiceSettings?.bank_name || invoiceSettings?.bank_account_number || invoiceSettings?.bank_account_holder) && (
                  <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200 text-[11px] space-y-1">
                    <span className="font-bold text-neutral-900 block font-mono text-[10px] uppercase tracking-wider text-[#c5a059]">
                      Rekening Pembayaran Resmi:
                    </span>
                    {invoiceSettings?.bank_name && <div className="text-neutral-700"><strong>Bank:</strong> {invoiceSettings.bank_name}</div>}
                    {invoiceSettings?.bank_account_number && <div className="text-neutral-700"><strong>No. Rekening:</strong> {invoiceSettings.bank_account_number}</div>}
                    {invoiceSettings?.bank_account_holder && <div className="text-neutral-700"><strong>Atas Nama:</strong> {invoiceSettings.bank_account_holder}</div>}
                  </div>
                )}
              </div>

              {/* Subtotal & Grand Total Box */}
              <div className="w-full sm:w-72 bg-neutral-50 p-4 rounded-xl border border-neutral-200 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between text-neutral-600">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-neutral-900">
                    Rp {Number(document.subtotal).toLocaleString('id-ID')}
                  </span>
                </div>

                {document.discount > 0 && (
                  <div className="flex items-center justify-between text-rose-600">
                    <span>Diskon:</span>
                    <span>- Rp {Number(document.discount).toLocaleString('id-ID')}</span>
                  </div>
                )}

                {document.tax > 0 && (
                  <div className="flex items-center justify-between text-neutral-600">
                    <span>Pajak / PPN:</span>
                    <span>+ Rp {Number(document.tax).toLocaleString('id-ID')}</span>
                  </div>
                )}

                <div className="pt-2 border-t-2 border-neutral-900 flex items-center justify-between text-sm sm:text-base font-black text-neutral-950">
                  <span>TOTAL:</span>
                  <span className="text-[#c5a059]">
                    Rp {Number(document.total_amount).toLocaleString('id-ID')}
                  </span>
                </div>

                {!isQuotation && (
                  <>
                    <div className="flex items-center justify-between text-emerald-700 pt-1 border-t border-neutral-200 text-[11px]">
                      <span>Sudah Dibayar:</span>
                      <span className="font-bold">
                        Rp {Number(document.paid_amount || 0).toLocaleString('id-ID')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-rose-600 text-[11px] font-bold">
                      <span>Sisa Tagihan:</span>
                      <span>
                        Rp {Number(document.remaining_balance !== undefined ? document.remaining_balance : Math.max(0, Number(document.total_amount) - (Number(document.paid_amount) || 0))).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Payment History Table (If Invoice has payments) */}
            {!isQuotation && document.payments && document.payments.length > 0 && (
              <div className="my-4 border border-neutral-200 rounded-lg overflow-hidden text-xs">
                <div className="bg-neutral-100 px-3 py-2 font-bold text-neutral-800 text-[11px] uppercase tracking-wider font-mono">
                  Riwayat Pembayaran Diterima ({document.payments.length})
                </div>
                <table className="w-full text-left">
                  <thead className="bg-neutral-50 text-neutral-500 text-[10px] uppercase border-b border-neutral-200">
                    <tr>
                      <th className="py-2 px-3">Tanggal</th>
                      <th className="py-2 px-3">Metode</th>
                      <th className="py-2 px-3">No. Referensi / Bukti</th>
                      <th className="py-2 px-3">Catatan</th>
                      <th className="py-2 px-3 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 font-mono text-[11px]">
                    {document.payments.map((p, idx) => (
                      <tr key={idx} className="bg-white">
                        <td className="py-2 px-3">{p.payment_date}</td>
                        <td className="py-2 px-3 font-semibold text-neutral-700">{p.payment_method}</td>
                        <td className="py-2 px-3 text-neutral-500">{p.reference_number || '-'}</td>
                        <td className="py-2 px-3 text-neutral-500 font-sans">{p.notes || '-'}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">
                          Rp {Number(p.amount).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}


            {/* Signature Block */}
            <div className="grid grid-cols-2 gap-8 pt-8 mt-6 border-t border-neutral-200 text-center text-xs">
              <div>
                <div className="text-[11px] text-neutral-500 mb-14">Diterima & Disetujui Oleh,</div>
                <div className="border-t border-neutral-300 w-44 mx-auto pt-1 font-bold text-neutral-900">
                  {document.customer_name}
                </div>
                <div className="text-[10px] text-neutral-400">Customer / Pemesan</div>
              </div>

              <div>
                <div className="text-[11px] text-neutral-500 mb-2">Hormat Kami,</div>
                <div className="h-20 flex items-end justify-center gap-2 mb-1">
                  {invoiceSettings?.signatory_signature_url && (
                    <img src={invoiceSettings.signatory_signature_url} alt="Tanda tangan" className="max-h-16 max-w-28 object-contain" />
                  )}
                  {invoiceSettings?.company_stamp_url && (
                    <img src={invoiceSettings.company_stamp_url} alt="Stempel perusahaan" className="max-h-16 max-w-20 object-contain" />
                  )}
                </div>
                <div className="border-t border-neutral-300 w-44 mx-auto pt-1 font-bold text-neutral-900">
                  {invoiceSettings?.signatory_name || document.sales_name || 'Tim Sales'}
                </div>
                <div className="text-[10px] text-[#c5a059] font-bold">
                  {invoiceSettings?.signatory_role || companyName}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer (Hidden in print) */}
        <div className="px-6 py-3 bg-neutral-100 border-t border-neutral-200 flex items-center justify-between print:hidden shrink-0">
          <span className="text-[11px] text-neutral-500 font-mono">
            Gunakan tombol Cetak / PDF untuk mencetak dokumen fisik atau menyimpan file PDF resmi.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
