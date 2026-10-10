import React, { useState, useEffect } from 'react';
import { FollowUpRule } from '../types/index.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { apiRequest } from '../api/client.js';
import { ConfirmModal } from '../components/common/ConfirmModal.js';
import {
  Sliders,
  Plus,
  Edit,
  Trash2,
  Clock,
  ArrowRight,
  Info,
  X,
  Check,
  RefreshCw,
} from 'lucide-react';

export const FollowUpRulesPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [rules, setRules] = useState<FollowUpRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FollowUpRule | null>(null);
  const [stepNumber, setStepNumber] = useState<number>(1);
  const [name, setName] = useState('');
  const [intervalDays, setIntervalDays] = useState<number>(7);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Delete Confirm
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadRules = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest('/rules');
      if (res.success && res.data) {
        setRules(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat aturan follow-up.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleOpenAdd = () => {
    setEditingRule(null);
    setStepNumber(rules.length + 1);
    setName(`Follow-up ${rules.length + 1}`);
    setIntervalDays(7);
    setDescription('');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (r: FollowUpRule) => {
    setEditingRule(r);
    setStepNumber(r.step_number);
    setName(r.name);
    setIntervalDays(r.interval_days);
    setDescription(r.description || '');
    setIsActive(r.is_active);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || intervalDays <= 0) {
      showToast('Nama aturan dan interval hari positif wajib diisi.', 'error');
      return;
    }

    try {
      const payload = {
        step_number: stepNumber,
        name: name.trim(),
        interval_days: intervalDays,
        description: description.trim(),
        is_active: isActive,
      };

      if (editingRule) {
        await apiRequest(`/rules/${editingRule.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Aturan follow-up berhasil diperbarui.', 'success');
      } else {
        await apiRequest('/rules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Aturan follow-up baru berhasil ditambahkan.', 'success');
      }
      setIsModalOpen(false);
      loadRules();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan aturan.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await apiRequest(`/rules/${deletingId}`, { method: 'DELETE' });
      showToast('Aturan follow-up berhasil dihapus.', 'success');
      setDeletingId(null);
      loadRules();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus aturan.', 'error');
    }
  };

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
            Aturan Follow-Up Perusahaan
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Konfigurasi tahapan dan interval hari follow-up standar yang dapat diubah Admin secara dinamis.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="self-stretch sm:self-auto min-h-[44px] px-4 py-2 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-[#c5a059] border border-[#c5a059]/40 rounded-xl text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4 text-[#c5a059]" />
            <span>Tambah Step Aturan</span>
          </button>
        )}
      </div>

      {/* Engine Architecture Note */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-neutral-200 bg-neutral-900 text-neutral-200 text-xs space-y-1.5 shadow-2xs">
        <div className="font-bold text-white flex items-center gap-2">
          <Info className="w-4 h-4 text-[#c5a059] shrink-0" />
          <span>Cara Kerja Follow-Up Engine Captain Konveksi:</span>
        </div>
        <p className="text-neutral-300 leading-relaxed text-[11px]">
          1. <strong>Tingkat Perusahaan:</strong> Customer secara default mengikuti rantai urutan berikut (Step 1 = 3 hari, Step 2 = 7 hari, Step 3 = 14 hari, Step 4 = 30 hari).
          <br />
          2. <strong>Kalkulasi Otomatis:</strong> Saat sales mencatat aktivitas, sistem otomatis menghitung <code className="text-[#c5a059] font-mono">next_follow_up_date = CURRENT_DATE + interval_days</code>.
        </p>
      </div>

      {/* Rules Sequence Visualizer */}
      <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 bg-white shadow-xs space-y-4">
        <h2 className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
          Alur Urutan Follow-Up Aktif
        </h2>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-neutral-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#c5a059]" />
            <span>Memuat aturan follow-up...</span>
          </div>
        ) : rules.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500">Belum ada aturan follow-up yang diatur.</div>
        ) : (
          <div className="space-y-4">
            {/* Visual Pills Flow */}
            <div className="flex flex-wrap items-center gap-2 p-3 bg-neutral-50 rounded-2xl border border-neutral-200">
              {rules.map((r, idx) => (
                <React.Fragment key={r.id}>
                  <div
                    className={`px-3 py-2 rounded-xl border text-xs font-mono shrink-0 ${
                      r.is_active
                        ? 'bg-white border-neutral-300 text-neutral-900 shadow-xs'
                        : 'bg-neutral-100 border-neutral-200 text-neutral-400 line-through'
                    }`}
                  >
                    <div className="text-[10px] text-neutral-500 font-sans font-semibold">Step {r.step_number}</div>
                    <div className="font-bold text-neutral-900">{r.interval_days} Hari</div>
                  </div>
                  {idx < rules.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* MOBILE VIEW (< md): Card list */}
            <div className="md:hidden divide-y divide-neutral-100 border-t border-neutral-100 pt-2">
              {rules.map(r => (
                <div key={r.id} className="py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-800">
                        Step {r.step_number}
                      </span>
                      <div className="text-sm font-bold text-neutral-900 mt-1">{r.name}</div>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-bold font-mono text-neutral-900">{r.interval_days} hari</span>
                      <span
                        className={`block text-[10px] font-semibold mt-0.5 ${
                          r.is_active ? 'text-emerald-700' : 'text-neutral-400'
                        }`}
                      >
                        {r.is_active ? '● Aktif' : '○ Non-Aktif'}
                      </span>
                    </div>
                  </div>

                  {r.description && <p className="text-xs text-neutral-500">{r.description}</p>}

                  {isAdmin && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(r)}
                        className="flex-1 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit Step</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(r.id)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 rounded-xl border border-rose-200 transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* DESKTOP VIEW (>= md): Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-neutral-500 uppercase bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3">Urutan</th>
                    <th className="py-2.5 px-3">Nama Aturan & Penjelasan</th>
                    <th className="py-2.5 px-3">Interval Hari</th>
                    <th className="py-2.5 px-3">Status</th>
                    {isAdmin && <th className="py-2.5 px-3 text-right">Tindakan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rules.map(r => (
                    <tr key={r.id} className="hover:bg-neutral-50/50">
                      <td className="py-3 px-3 font-mono font-bold text-neutral-900">Step {r.step_number}</td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-neutral-900">{r.name}</div>
                        <div className="text-[11px] text-neutral-500">{r.description || '-'}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-sm font-bold text-neutral-900">
                        {r.interval_days} hari
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            r.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
                          }`}
                        >
                          {r.is_active ? 'Aktif' : 'Non-Aktif'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-3 text-right space-x-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(r)}
                            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(r.id)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit/Add Modal - Bottom sheet on mobile */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/70 backdrop-blur-xs">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-4 sm:px-6 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 shrink-0">
              <h2 className="text-sm font-bold text-neutral-900">
                {editingRule ? `Edit Step ${editingRule.step_number}` : 'Tambah Step Follow-Up Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 p-4 sm:p-6 space-y-3.5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Nomor Urutan</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={stepNumber}
                    onChange={e => setStepNumber(parseInt(e.target.value, 10))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-neutral-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Interval (Hari)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={intervalDays}
                    onChange={e => setIntervalDays(parseInt(e.target.value, 10))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-neutral-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Nama Aturan</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Contoh: Follow-up 1 (Cek Penawaran)"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Deskripsi / Sasaran</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Jelaskan tujuan follow-up pada tahap ini..."
                  className="w-full p-3 text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1 min-h-[40px]">
                <input
                  type="checkbox"
                  id="ruleActive"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-neutral-900 focus:ring-[#c5a059]"
                />
                <label htmlFor="ruleActive" className="text-xs text-neutral-700 font-semibold cursor-pointer">
                  Aktifkan step ini dalam kalkulasi otomatis
                </label>
              </div>

              <div className="pt-3 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2 text-xs font-bold text-[#c5a059] bg-neutral-900 hover:bg-neutral-800 active:bg-black border border-[#c5a059]/40 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-2xs"
                >
                  <Check className="w-4 h-4 text-[#c5a059]" />
                  <span>Simpan Aturan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={Boolean(deletingId)}
        title="Hapus Aturan Follow-Up"
        message="Apakah Anda yakin ingin menghapus step aturan follow-up ini? Perubahan akan mempengaruhi kalkulasi customer berikutnya."
        isDanger={true}
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
};
