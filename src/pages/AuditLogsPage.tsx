import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types/index.js';
import { apiRequest } from '../api/client.js';
import { useToast } from '../contexts/ToastContext.js';
import { History, Search, Shield, ChevronLeft, ChevronRight, Eye, X, RefreshCw } from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedEntity, setSelectedEntity] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [viewingLog, setViewingLog] = useState<AuditLog | null>(null);

  const loadAuditLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: '20',
        action: selectedAction,
        entity: selectedEntity,
      });

      const res = await apiRequest(`/audit-logs?${params.toString()}`);
      if (res.success) {
        setLogs(res.data);
        setCurrentPage(res.meta.page);
        setTotalPages(res.meta.total_pages);
        setTotalCount(res.meta.total);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat audit log.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [currentPage, selectedAction, selectedEntity]);

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
          Audit Log & Rekam Forensik
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Catatan abadi seluruh aktivitas sistem (pembuatan customer, follow-up, modifikasi aturan, hapus, restore).
        </p>
      </div>

      {/* Filter Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-neutral-200 bg-white shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Filter Tindakan (Action)
            </label>
            <select
              value={selectedAction}
              onChange={e => {
                setSelectedAction(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 text-xs border border-neutral-300 rounded-xl bg-white"
            >
              <option value="all">Semua Tindakan</option>
              <option value="LOGIN">LOGIN</option>
              <option value="CREATE_CUSTOMER">CREATE_CUSTOMER</option>
              <option value="UPDATE_CUSTOMER">UPDATE_CUSTOMER</option>
              <option value="SOFT_DELETE_CUSTOMER">SOFT_DELETE_CUSTOMER</option>
              <option value="RESTORE_CUSTOMER">RESTORE_CUSTOMER</option>
              <option value="PERMANENT_DELETE_CUSTOMER">PERMANENT_DELETE_CUSTOMER</option>
              <option value="LOG_FOLLOW_UP">LOG_FOLLOW_UP</option>
              <option value="CREATE_FOLLOW_UP_RULE">CREATE_FOLLOW_UP_RULE</option>
              <option value="UPDATE_FOLLOW_UP_RULE">UPDATE_FOLLOW_UP_RULE</option>
              <option value="CREATE_WA_TEMPLATE">CREATE_WA_TEMPLATE</option>
              <option value="UPDATE_WA_TEMPLATE">UPDATE_WA_TEMPLATE</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Filter Entitas (Entity)
            </label>
            <select
              value={selectedEntity}
              onChange={e => {
                setSelectedEntity(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 text-xs border border-neutral-300 rounded-xl bg-white"
            >
              <option value="all">Semua Entitas</option>
              <option value="CUSTOMER">CUSTOMER</option>
              <option value="FOLLOW_UP">FOLLOW_UP</option>
              <option value="RULE">RULE</option>
              <option value="TEMPLATE">TEMPLATE</option>
              <option value="USER">USER</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table / Cards */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-neutral-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#c5a059]" />
            <span>Memuat log audit...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">Belum ada catatan aktivitas tercatat.</div>
        ) : (
          <>
            {/* MOBILE VIEW (< md): Card list */}
            <div className="md:hidden divide-y divide-neutral-100 font-mono">
              {logs.map(log => (
                <div key={log.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-900 font-bold text-[10px]">
                      {log.action}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="text-xs font-sans font-semibold text-neutral-900 flex items-center justify-between">
                    <span>{log.user_name || 'System'}</span>
                    <span className="text-neutral-500 text-[11px] font-mono">
                      {log.entity} #{log.entity_id || '-'}
                    </span>
                  </div>

                  <div className="text-[10px] text-neutral-400 font-mono flex items-center justify-between">
                    <span>IP: {log.ip_address}</span>
                    <span>{new Date(log.created_at).toLocaleDateString('id-ID')}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewingLog(log)}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-neutral-800 rounded-xl text-xs font-sans font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Periksa Data Forensik</span>
                  </button>
                </div>
              ))}
            </div>

            {/* DESKTOP VIEW (>= md): Full Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-neutral-500 uppercase bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-4">Waktu (WIB)</th>
                    <th className="py-2.5 px-4">User Pelaksana</th>
                    <th className="py-2.5 px-4">Tindakan (Action)</th>
                    <th className="py-2.5 px-4">Entitas</th>
                    <th className="py-2.5 px-4">IP Address</th>
                    <th className="py-2.5 px-4 text-right">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-mono">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-neutral-50/50">
                      <td className="py-2.5 px-4 text-neutral-500 text-[11px]">
                        {new Date(log.created_at).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 px-4 font-sans font-semibold text-neutral-900">
                        {log.user_name || 'System'}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 font-bold text-[10px]">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-neutral-600 font-sans">
                        {log.entity} {log.entity_id ? `#${log.entity_id}` : ''}
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-neutral-400">{log.ip_address}</td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setViewingLog(log)}
                          className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-[11px] font-sans font-medium"
                        >
                          Lihat Data
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination Bar */}
        <div className="p-3.5 sm:p-4 border-t border-neutral-200 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600">
          <div>
            Total <strong className="text-neutral-900">{totalCount}</strong> catatan aktivitas
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="min-h-[40px] px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono">
              Halaman {currentPage} / {Math.max(1, totalPages)}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="min-h-[40px] px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* JSON Payload Inspection Modal */}
      {viewingLog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/70 backdrop-blur-xs">
          <div className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-4 sm:px-6 py-3.5 border-b border-neutral-800 bg-neutral-900 text-white flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold font-mono truncate">
                  LOG #{viewingLog.id} · {viewingLog.action}
                </h3>
                <p className="text-[11px] text-neutral-400 font-sans truncate">
                  Oleh {viewingLog.user_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingLog(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-4 sm:p-6 space-y-4 overflow-y-auto text-xs font-mono">
              {viewingLog.old_data && (
                <div>
                  <div className="font-semibold text-rose-700 font-sans mb-1">Data Sebelum (old_data):</div>
                  <pre className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl overflow-x-auto text-[11px] whitespace-pre-wrap break-all max-h-52">
                    {JSON.stringify(viewingLog.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {viewingLog.new_data && (
                <div>
                  <div className="font-semibold text-emerald-700 font-sans mb-1">Data Sesudah (new_data):</div>
                  <pre className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl overflow-x-auto text-[11px] whitespace-pre-wrap break-all max-h-52">
                    {JSON.stringify(viewingLog.new_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-3.5 border-t border-neutral-200 bg-neutral-50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setViewingLog(null)}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
