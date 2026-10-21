import React, { useCallback, useEffect, useRef, useState } from 'react';

type SalesRecord = {
  id: number | string;
  name: string;
  email?: string;
  isStreaming?: boolean;
  streamStartTime?: number;
};

type SocketStatus = 'connecting' | 'connected' | 'disconnected';

const TOKEN_KEY = 'captain_crm_token';

function monitoringSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = localStorage.getItem(TOKEN_KEY) || '';
  return `${protocol}//${window.location.host}/ws/screen-monitoring?token=${encodeURIComponent(token)}`;
}

export function ScreenMonitoringPage() {
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [error, setError] = useState('');

  const upsertSales = useCallback((record: Partial<SalesRecord> & { id: number | string }) => {
    setSales((current) => {
      const index = current.findIndex((item) => String(item.id) === String(record.id));
      if (index < 0) {
        return [...current, {
          id: record.id,
          name: record.name || `Sales ${record.id}`,
          email: record.email,
          isStreaming: Boolean(record.isStreaming),
          streamStartTime: record.streamStartTime,
        }].sort((a, b) => a.name.localeCompare(b.name));
      }
      return current.map((item, i) => i === index ? { ...item, ...record } : item);
    });
  }, []);

  const connect = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    const previous = socketRef.current;
    socketRef.current = null;
    if (previous && previous.readyState < WebSocket.CLOSING) previous.close();

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setStatus('disconnected');
      setError('Token login tidak ditemukan. Silakan login ulang.');
      return;
    }

    setStatus('connecting');
    setError('');

    let socket: WebSocket;
    try {
      socket = new WebSocket(monitoringSocketUrl());
    } catch {
      setStatus('disconnected');
      setError('Tidak dapat membuat koneksi monitoring.');
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      heartbeatRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'authenticated') {
          setStatus('connected');
          const list = Array.isArray(data.salesList) ? data.salesList : [];
          setSales(list.map((item: SalesRecord) => ({
            ...item,
            isStreaming: Boolean(item.isStreaming),
          })));
          socket.send(JSON.stringify({ type: 'get_sales_list' }));
        } else if (data.type === 'sales_list') {
          const list = Array.isArray(data.sales) ? data.sales : Array.isArray(data.salesList) ? data.salesList : [];
          setSales(list.map((item: SalesRecord) => ({
            ...item,
            isStreaming: Boolean(item.isStreaming),
          })));
        } else if (data.type === 'sales_online' && data.sales?.id != null) {
          upsertSales({ ...data.sales, isStreaming: Boolean(data.sales.isStreaming) });
        } else if (data.type === 'sales_offline') {
          const id = data.salesId ?? data.sales?.id;
          setSales((current) => current.filter((item) => String(item.id) !== String(id)));
        } else if (data.type === 'sales_stream_started') {
          const id = data.salesId ?? data.sales?.id ?? data.id;
          if (id != null) upsertSales({
            id,
            name: data.salesName ?? data.sales?.name ?? data.name,
            isStreaming: true,
            streamStartTime: data.streamStartTime ?? Date.now(),
          });
        } else if (data.type === 'sales_stream_stopped') {
          const id = data.salesId ?? data.sales?.id ?? data.id;
          if (id != null) upsertSales({
            id,
            isStreaming: false,
            streamStartTime: undefined,
          });
        } else if (data.type === 'auth_error' || data.type === 'error') {
          setError(data.message || 'Server menolak koneksi monitoring.');
        }
      } catch {
        // Ignore malformed server messages.
      }
    };

    socket.onerror = () => setError('Koneksi monitoring bermasalah.');
    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
        setStatus('disconnected');
      }
    };
  }, [upsertSales]);

  useEffect(() => {
    connect();
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    };
  }, [connect]);

  const activeCount = sales.filter((item) => item.isStreaming).length;

  return (
    <main className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Monitoring Sales</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pantau koneksi CRM dan status monitoring setiap akun sales.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            status === 'connected' ? 'bg-green-100 text-green-700' :
            status === 'connecting' ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          }`}>
            {status === 'connected' ? 'CRM TERHUBUNG' : status === 'connecting' ? 'MENGHUBUNGKAN' : 'TERPUTUS'}
          </span>
          <button
            type="button"
            onClick={connect}
            disabled={status === 'connecting' || status === 'connected'}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Sambungkan Ulang
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Sales terhubung</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{sales.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Monitoring aktif</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Mode</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">Event-only</p>
          <p className="text-xs text-slate-500">Tanpa video / screen sharing</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Daftar akun sales</h2>
        </div>
        {sales.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Belum ada akun sales yang terhubung ke monitoring CRM.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Akun sales</th>
                  <th className="px-4 py-3">ID akun</th>
                  <th className="px-4 py-3">Koneksi CRM</th>
                  <th className="px-4 py-3">Monitoring</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((item) => (
                  <tr key={String(item.id)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      {item.email && <div className="text-xs text-slate-500">{item.email}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.id}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                        Terhubung
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.isStreaming ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.isStreaming ? 'Aktif' : 'Tidak aktif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Status koneksi CRM bukan indikator WhatsApp online atau pesan WhatsApp terkirim.
      </p>
    </main>
  );
}
