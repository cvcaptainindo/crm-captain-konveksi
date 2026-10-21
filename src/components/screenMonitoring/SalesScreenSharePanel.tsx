import React, { useCallback, useEffect, useRef, useState } from 'react';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const TOKEN_KEY = 'captain_crm_token';

function monitoringSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = localStorage.getItem(TOKEN_KEY) || '';
  return `${protocol}//${window.location.host}/ws/screen-monitoring?token=${encodeURIComponent(token)}`;
}

export function SalesScreenSharePanel() {
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [monitoring, setMonitoring] = useState(false);
  const [error, setError] = useState('');

  const disconnect = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }, []);

  const connect = useCallback(() => {
    disconnect();
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
          setError('');
        } else if (data.type === 'auth_error' || data.type === 'error') {
          setError(data.message || 'Koneksi ditolak oleh server.');
        }
      } catch {
        // Ignore malformed server messages.
      }
    };

    socket.onerror = () => {
      setError('Koneksi monitoring bermasalah. Coba sambungkan kembali.');
    };

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
        setStatus('disconnected');
        setMonitoring(false);
      }
    };
  }, [disconnect]);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  const toggleMonitoring = () => {
    const socket = socketRef.current;
    if (status !== 'connected' || !socket || socket.readyState !== WebSocket.OPEN) {
      setError('Koneksi CRM belum aktif. Sambungkan kembali terlebih dahulu.');
      return;
    }

    const next = !monitoring;
    socket.send(JSON.stringify({ type: next ? 'stream_started' : 'stream_stopped' }));
    setMonitoring(next);
    setError('');
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Monitoring CRM</h2>
          <p className="mt-1 text-sm text-slate-500">
            Status koneksi akun sales ke CRM, tanpa screen sharing atau video.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
          status === 'connected'
            ? 'bg-green-100 text-green-700'
            : status === 'connecting'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700'
        }`}>
          {status === 'connected' ? 'CRM TERHUBUNG' : status === 'connecting' ? 'MENGHUBUNGKAN' : 'TERPUTUS'}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleMonitoring}
          disabled={status !== 'connected'}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
            monitoring ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {monitoring ? 'Nonaktifkan Monitoring' : 'Aktifkan Monitoring'}
        </button>
        <button
          type="button"
          onClick={connect}
          disabled={status === 'connected' || status === 'connecting'}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          Sambungkan Ulang
        </button>
      </div>

      <p className="mt-3 text-sm text-slate-600">
        Status monitoring: <strong>{monitoring ? 'Aktif' : 'Tidak aktif'}</strong>
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-slate-400">
        Catatan: terhubung ke CRM bukan berarti WhatsApp sedang online.
      </p>
    </section>
  );
}
