import React, { useState, useEffect } from 'react';
import { WhatsAppTemplate } from '../types/index.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { apiRequest } from '../api/client.js';
import { ConfirmModal } from '../components/common/ConfirmModal.js';
import {
  MessageSquareText,
  Plus,
  Edit,
  Trash2,
  Code,
  Eye,
  X,
  RefreshCw,
  Check,
} from 'lucide-react';

export const WhatsAppTemplatesPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State for Create/Edit
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('FOLLOW_UP');
  const [content, setContent] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Preview Modal
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null);
  const [testCustomer, setTestCustomer] = useState('Pak Budi Hartono');
  const [testCompany, setTestCompany] = useState('PT Sumber Makmur');
  const [testProduct, setTestProduct] = useState('150 pcs Polo Shirt Lacoste CVC');

  // Delete Confirm
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest('/templates');
      if (res.success && res.data) {
        setTemplates(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat template.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleOpenAdd = () => {
    setEditingTemplate(null);
    setTitle('');
    setCode('');
    setCategory('FOLLOW_UP');
    setContent('Halo Bapak/Ibu {{nama_customer}} dari {{perusahaan}},\n\nSalam dari Captain Konveksi. Izin follow-up pesanan {{produk}}...\n\nTerima kasih,\n{{nama_sales}}');
    setIsActive(true);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (t: WhatsAppTemplate) => {
    setEditingTemplate(t);
    setTitle(t.title);
    setCode(t.code);
    setCategory(t.category);
    setContent(t.content);
    setIsActive(t.is_active);
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      showToast('Judul dan isi template pesan wajib diisi.', 'error');
      return;
    }

    try {
      const payload = { title, code, category, content, is_active: isActive };
      if (editingTemplate) {
        await apiRequest(`/templates/${editingTemplate.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Template berhasil diperbarui.', 'success');
      } else {
        await apiRequest('/templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Template baru berhasil dibuat.', 'success');
      }
      setIsFormOpen(false);
      loadTemplates();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan template.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await apiRequest(`/templates/${deletingId}`, { method: 'DELETE' });
      showToast('Template berhasil dihapus.', 'success');
      setDeletingId(null);
      loadTemplates();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus template.', 'error');
    }
  };

  const renderSimulatedMessage = (tplContent: string) => {
    const todayFormatted = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });

    return tplContent
      .split('{{nama_customer}}').join(testCustomer || 'Bapak/Ibu')
      .split('{{perusahaan}}').join(testCompany || '-')
      .split('{{nama_sales}}').join('Andi Sales')
      .split('{{produk}}').join(testProduct || 'pesanan konveksi')
      .split('{{tanggal}}').join(todayFormatted);
  };

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
            Template Pesan WhatsApp
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Format pesan WhatsApp standar dengan placeholder variabel dinamis untuk follow-up cepat.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="self-stretch sm:self-auto min-h-[44px] px-4 py-2 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-[#c5a059] border border-[#c5a059]/40 rounded-xl text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4 text-[#c5a059]" />
            <span>Tambah Template</span>
          </button>
        )}
      </div>

      {/* Variables Cheatsheet */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-neutral-200 bg-neutral-900 text-neutral-200 text-xs">
        <div className="font-semibold text-white flex items-center gap-2 mb-2">
          <Code className="w-4 h-4 text-[#c5a059] shrink-0" />
          <span>Variabel Template Yang Didukung:</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono">
          <div className="bg-neutral-800/80 p-2 rounded-xl border border-neutral-700">
            <span className="text-[#c5a059] font-bold">&#123;&#123;nama_customer&#125;&#125;</span>
            <div className="text-[10px] text-neutral-400 mt-0.5">Nama kontak</div>
          </div>
          <div className="bg-neutral-800/80 p-2 rounded-xl border border-neutral-700">
            <span className="text-[#c5a059] font-bold">&#123;&#123;perusahaan&#125;&#125;</span>
            <div className="text-[10px] text-neutral-400 mt-0.5">Nama PT/CV</div>
          </div>
          <div className="bg-neutral-800/80 p-2 rounded-xl border border-neutral-700">
            <span className="text-[#c5a059] font-bold">&#123;&#123;nama_sales&#125;&#125;</span>
            <div className="text-[10px] text-neutral-400 mt-0.5">Sales pengirim</div>
          </div>
          <div className="bg-neutral-800/80 p-2 rounded-xl border border-neutral-700">
            <span className="text-[#c5a059] font-bold">&#123;&#123;produk&#125;&#125;</span>
            <div className="text-[10px] text-neutral-400 mt-0.5">Produk seragam</div>
          </div>
          <div className="bg-neutral-800/80 p-2 rounded-xl border border-neutral-700">
            <span className="text-[#c5a059] font-bold">&#123;&#123;tanggal&#125;&#125;</span>
            <div className="text-[10px] text-neutral-400 mt-0.5">Tanggal hari ini</div>
          </div>
        </div>
      </div>

      {/* Template Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-neutral-500 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-[#c5a059]" />
          <span>Memuat template pesan...</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="p-12 text-center text-xs text-neutral-500 bg-white rounded-2xl border border-neutral-200">
          Belum ada template pesan WhatsApp.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {templates.map(t => (
            <div
              key={t.id}
              className="p-4 sm:p-5 rounded-2xl border border-neutral-200 bg-white shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="text-sm font-bold text-neutral-900 leading-tight">{t.title}</h3>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      t.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {t.is_active ? 'Aktif' : 'Non-Aktif'}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-neutral-400 mb-2.5">{t.code}</div>

                <div className="p-3 bg-neutral-50 border border-neutral-100 rounded-xl text-xs font-mono text-neutral-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                  {t.content}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(t)}
                  className="min-h-[40px] text-xs font-semibold text-neutral-600 hover:text-neutral-900 flex items-center gap-1.5 active:bg-neutral-100 px-2 py-1 rounded-lg"
                >
                  <Eye className="w-4 h-4 text-neutral-500" />
                  <span>Uji Preview</span>
                </button>

                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(t)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center text-neutral-500 hover:text-neutral-900 active:bg-neutral-100 rounded-xl"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(t.id)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center text-rose-500 hover:text-rose-700 active:bg-rose-50 rounded-xl"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal - Mobile Bottom Sheet */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/70 backdrop-blur-xs">
          <div className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-4 sm:px-6 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 shrink-0">
              <h2 className="text-sm font-bold text-neutral-900">
                {editingTemplate ? 'Edit Template WhatsApp' : 'Tambah Template Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-neutral-400 hover:text-neutral-700 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 p-4 sm:p-6 space-y-3.5 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Judul Template</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Contoh: Follow-up Penawaran Seragam Kerja"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Kode Unik (Opsional)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="FU_PENAWARAN"
                    className="w-full min-h-[44px] px-3 py-2 text-base sm:text-xs border border-neutral-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Kategori</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-base sm:text-xs border border-neutral-300 rounded-xl bg-white"
                  >
                    <option value="FOLLOW_UP">Follow Up Rutin</option>
                    <option value="SAMPLE">Sampel & Desain</option>
                    <option value="PROMO">Promo & Diskon</option>
                    <option value="GENERAL">Umum</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Konten Pesan (Gunakan variabel &#123;&#123;...&#125;&#125;)
                </label>
                <textarea
                  rows={6}
                  required
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  className="w-full p-3 text-xs font-mono border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 pt-1 min-h-[40px]">
                <input
                  type="checkbox"
                  id="tplActive"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-neutral-900 focus:ring-[#c5a059]"
                />
                <label htmlFor="tplActive" className="text-xs text-neutral-700 font-medium cursor-pointer">
                  Aktifkan template ini dalam pilihan follow-up tim sales
                </label>
              </div>

              <div className="pt-3 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2 text-xs font-bold text-[#c5a059] bg-neutral-900 hover:bg-neutral-800 active:bg-black border border-[#c5a059]/40 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-2xs"
                >
                  <Check className="w-4 h-4 text-[#c5a059]" />
                  <span>Simpan Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Simulator Modal - Mobile Bottom Sheet */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/70 backdrop-blur-xs">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-4 sm:px-6 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 shrink-0">
              <h2 className="text-sm font-bold text-neutral-900">Uji Render: {previewTemplate.title}</h2>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-4 sm:p-6 space-y-3.5 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-neutral-500 mb-1">Simulasi Nama Customer:</label>
                  <input
                    type="text"
                    value={testCustomer}
                    onChange={e => setTestCustomer(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 border border-neutral-300 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-neutral-500 mb-1">Simulasi Perusahaan:</label>
                  <input
                    type="text"
                    value={testCompany}
                    onChange={e => setTestCompany(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 border border-neutral-300 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-neutral-500 mb-1">Simulasi Produk:</label>
                <input
                  type="text"
                  value={testProduct}
                  onChange={e => setTestProduct(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 border border-neutral-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Hasil Render Pesan WhatsApp:
                </label>
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-300 rounded-xl text-xs font-mono text-neutral-800 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {renderSimulatedMessage(previewTemplate.content)}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(null)}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={Boolean(deletingId)}
        title="Hapus Template WhatsApp"
        message="Apakah Anda yakin ingin menghapus template ini? Template yang dihapus tidak dapat dipulihkan."
        isDanger={true}
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
};
