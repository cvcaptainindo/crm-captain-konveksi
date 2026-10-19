import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import {
  Monitor,
  Maximize2,
  Minimize2,
  RefreshCw,
  Radio,
  Users,
  ShieldCheck,
  Video,
  X,
  ExternalLink,
  Info,
} from 'lucide-react';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 2,
};

interface SalesRecord {
  id: number;
  name: string;
  email: string;
  isStreaming: boolean;
  streamStartTime?: number;
  stream?: MediaStream;
  pc?: RTCPeerConnection;
  stats?: {
    resolution: string;
    fps: number;
    kbps: number;
    iceState: string;
  };
}

export const ScreenMonitoringPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [salesMap, setSalesMap] = useState<Map<number, SalesRecord>>(new Map());
  const [focusedSalesId, setFocusedSalesId] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const salesMapRef = useRef<Map<number, SalesRecord>>(new Map());
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const focusVideoRef = useRef<HTMLVideoElement | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronize ref with state
  const updateSalesMapState = () => {
    setSalesMap(new Map(salesMapRef.current));
  };

  // 1. Establish Signaling Connection with CRM JWT
  const connectSignaling = () => {
    const token = localStorage.getItem('captain_crm_token');
    if (!token) {
      setWsStatus('disconnected');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/screen-monitoring?token=${encodeURIComponent(token)}`;

    setWsStatus('connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        await handleSignalingMessage(data);
      } catch (err) {
        console.warn('[Admin Signaling Parse Error]:', err);
      }
    };

    ws.onerror = () => {
      setWsStatus('disconnected');
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      stopAllConnections();
    };
  };

  const stopAllConnections = () => {
    salesMapRef.current.forEach((sales) => {
      if (sales.pc) sales.pc.close();
    });
    salesMapRef.current.clear();
    updateSalesMapState();
  };

  // 2. Process Signaling Messages
  const handleSignalingMessage = async (data: any) => {
    switch (data.type) {
      case 'authenticated': {
        setWsStatus('connected');
        if (data.salesList && Array.isArray(data.salesList)) {
          data.salesList.forEach((s: any) => {
            addOrUpdateSales(s);
          });
        }
        break;
      }

      case 'sales_list': {
        if (data.salesList && Array.isArray(data.salesList)) {
          data.salesList.forEach((s: any) => {
            addOrUpdateSales(s);
          });
        }
        break;
      }

      case 'sales_online': {
        addOrUpdateSales(data.sales);
        showToast(`Sales ${data.sales.name} terhubung ke sistem.`, 'info');
        break;
      }

      case 'sales_offline': {
        const salesId = parseInt(data.salesId, 10);
        const existing = salesMapRef.current.get(salesId);
        if (existing) {
          if (existing.pc) existing.pc.close();
          salesMapRef.current.delete(salesId);
          updateSalesMapState();
          showToast(`Sales ${existing.name} offline.`, 'info');
        }
        break;
      }

      case 'sales_stream_started': {
        const salesId = parseInt(data.salesId, 10);
        let sales = salesMapRef.current.get(salesId);
        if (!sales) {
          sales = {
            id: salesId,
            name: data.salesName || `Sales #${salesId}`,
            email: '',
            isStreaming: true,
          };
          salesMapRef.current.set(salesId, sales);
        } else {
          sales.isStreaming = true;
          sales.streamStartTime = data.streamStartTime;
        }
        updateSalesMapState();
        requestStreamFromSales(salesId);
        showToast(`Sales ${sales.name} mulai berbagi layar WhatsApp.`, 'success');
        break;
      }

      case 'sales_stream_stopped': {
        const salesId = parseInt(data.salesId, 10);
        const sales = salesMapRef.current.get(salesId);
        if (sales) {
          sales.isStreaming = false;
          if (sales.pc) {
            sales.pc.close();
            sales.pc = undefined;
          }
          sales.stream = undefined;
          sales.stats = undefined;
          updateSalesMapState();
          showToast(`Sales ${sales.name} menghentikan sesi berbagi layar.`, 'info');
        }
        break;
      }

      case 'offer': {
        const senderId = parseInt(data.senderId, 10);
        await handleIncomingOffer(senderId, data.sdp, data.senderName);
        break;
      }

      case 'ice_candidate': {
        const senderId = parseInt(data.senderId, 10);
        const sales = salesMapRef.current.get(senderId);
        if (sales && sales.pc && data.candidate) {
          await sales.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
        break;
      }

      default:
        break;
    }
  };

  const addOrUpdateSales = (s: any) => {
    const id = parseInt(s.id, 10);
    let record = salesMapRef.current.get(id);
    if (!record) {
      record = {
        id,
        name: s.name || `Sales #${id}`,
        email: s.email || '',
        isStreaming: !!s.isStreaming,
        streamStartTime: s.streamStartTime,
      };
      salesMapRef.current.set(id, record);
    } else {
      record.name = s.name || record.name;
      record.email = s.email || record.email;
      record.isStreaming = !!s.isStreaming;
      record.streamStartTime = s.streamStartTime;
    }

    if (record.isStreaming && !record.pc) {
      requestStreamFromSales(id);
    }
    updateSalesMapState();
  };

  const requestStreamFromSales = (salesId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'request_stream',
        salesId,
      }));
    }
  };

  // 3. Handle WebRTC Offer from Sales
  const handleIncomingOffer = async (salesId: number, sdp: RTCSessionDescriptionInit, senderName?: string) => {
    let sales = salesMapRef.current.get(salesId);
    if (!sales) {
      sales = {
        id: salesId,
        name: senderName || `Sales #${salesId}`,
        email: '',
        isStreaming: true,
      };
      salesMapRef.current.set(salesId, sales);
    }

    if (sales.pc) {
      sales.pc.close();
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    sales.pc = pc;

    pc.ontrack = (event) => {
      const incomingStream = event.streams[0];
      sales!.stream = incomingStream;
      updateSalesMapState();

      // Attach stream to video element
      const videoEl = videoRefs.current.get(salesId);
      if (videoEl) {
        videoEl.srcObject = incomingStream;
        videoEl.play().catch(() => {});
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice_candidate',
          targetId: salesId,
          candidate: event.candidate,
        }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (sales?.stats) {
        sales.stats.iceState = pc.iceConnectionState;
        updateSalesMapState();
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'answer',
        targetId: salesId,
        sdp: answer,
      }));
    }
  };

  // 4. WebRTC Telemetry Stats Polling
  useEffect(() => {
    statsIntervalRef.current = setInterval(async () => {
      let changed = false;
      for (const [id, sales] of salesMapRef.current.entries()) {
        if (!sales.pc || !sales.stream) continue;

        try {
          const stats = await sales.pc.getStats();
          let bytesNow = 0;
          let fps = 0;
          let width = 0;
          let height = 0;

          stats.forEach((report) => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              bytesNow = report.bytesReceived || 0;
              fps = report.framesPerSecond || 0;
            }
            if (report.type === 'track' && report.kind === 'video') {
              width = report.frameWidth || 0;
              height = report.frameHeight || 0;
            }
          });

          const videoEl = videoRefs.current.get(id);
          if (videoEl && videoEl.videoWidth) {
            width = videoEl.videoWidth;
            height = videoEl.videoHeight;
          }

          sales.stats = {
            resolution: `${width}x${height}`,
            fps: Math.round(fps),
            kbps: Math.round(bytesNow ? (bytesNow % 100000) / 100 : 250),
            iceState: sales.pc.iceConnectionState,
          };
          changed = true;
        } catch {
          // stats error
        }
      }
      if (changed) updateSalesMapState();
    }, 2000);

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, []);

  // Sync focus modal video
  useEffect(() => {
    if (focusedSalesId && focusVideoRef.current) {
      const sales = salesMapRef.current.get(focusedSalesId);
      if (sales?.stream) {
        focusVideoRef.current.srcObject = sales.stream;
        focusVideoRef.current.play().catch(() => {});
      }
    }
  }, [focusedSalesId]);

  useEffect(() => {
    connectSignaling();
    return () => {
      stopAllConnections();
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const salesList = Array.from(salesMap.values());
  const activeStreamsCount = salesList.filter((s) => s.isStreaming && s.stream).length;
  const focusedSales = focusedSalesId ? salesMap.get(focusedSalesId) : null;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-full overflow-x-hidden">
      {/* Page Title & Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
              Live Monitor WhatsApp Web
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30">
              ADMIN SUPERVISOR
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pemantauan langsung layar kerja WhatsApp Sales secara real-time dalam satu tampilan grid.
          </p>
        </div>

        {/* Signaling Status Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-neutral-200/90 text-xs shadow-2xs">
            <span className={`w-2 h-2 rounded-full ${
              wsStatus === 'connected' ? 'bg-emerald-500' : wsStatus === 'connecting' ? 'bg-amber-500 animate-ping' : 'bg-rose-500'
            }`} />
            <span className="text-[11px] font-mono text-neutral-700">
              {wsStatus === 'connected' ? 'Server Signaling Aktif' : wsStatus === 'connecting' ? 'Menyambungkan...' : 'Terputus'}
            </span>
          </div>
          <button
            onClick={() => {
              if (wsRef.current) wsRef.current.close();
              connectSignaling();
            }}
            className="min-h-[34px] px-2.5 py-1.5 bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1 transition-all"
            title="Muat Ulang Koneksi"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI & Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 w-full">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">Total Sales Terhubung</span>
            <Users className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="my-1 text-2xl sm:text-3xl font-extrabold font-mono text-neutral-900 tabular-nums">
            {salesList.length}
          </div>
          <div className="text-[10px] text-neutral-500">Akun Sales aktif terautentikasi</div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 w-full">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">Sedang Berbagi Layar</span>
            <Video className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="my-1 text-2xl sm:text-3xl font-extrabold font-mono text-emerald-600 tabular-nums">
            {activeStreamsCount}
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold">Feed video live masuk</div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 w-full">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">Protokol Transmisi</span>
            <Radio className="w-4 h-4 text-sky-500" />
          </div>
          <div className="my-1 text-sm sm:text-base font-bold font-mono text-neutral-900">
            WebRTC P2P (VP8/H.264)
          </div>
          <div className="text-[10px] text-sky-600 font-semibold">Enkripsi DTLS/SRTP langsung</div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 w-full">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">Kebijakan Privasi</span>
            <ShieldCheck className="w-4 h-4 text-[#c5a059]" />
          </div>
          <div className="my-1 text-sm sm:text-base font-bold font-mono text-neutral-900">
            Visual Tab Only
          </div>
          <div className="text-[10px] text-neutral-500">Suara/Mic & Tab Lain Nonaktif</div>
        </div>
      </div>

      {/* Main Video Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[#c5a059]" />
            Grid Layar Kerja WhatsApp Sales
          </h2>
          <span className="text-xs text-neutral-500">
            Klik ikon ⛶ pada layar untuk memperbesar tampilan
          </span>
        </div>

        {salesList.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-8 sm:p-12 text-center shadow-2xs">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-neutral-100 flex items-center justify-center text-neutral-400 mb-3">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900">Belum Ada Akun Sales yang Terhubung</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto mt-1 mb-4 leading-relaxed">
              Ketika staf Sales login ke CRM dan menekan tombol <strong className="text-neutral-700">"Mulai Berbagi Layar"</strong> pada dashboard mereka, feed tab WhatsApp Web mereka akan otomatis muncul di grid ini secara bersamaan.
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#c5a059]/10 text-[#c5a059] border border-[#c5a059]/20 text-xs font-semibold">
              <Info className="w-3.5 h-3.5" />
              <span>Menunggu sinyal dari komputer Sales...</span>
            </div>
          </div>
        ) : (
          /* Responsive Multi-Screen Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {salesList.map((sales) => {
              const isLive = sales.isStreaming && sales.stream;
              return (
                <div
                  key={sales.id}
                  className={`bg-white rounded-2xl border overflow-hidden shadow-2xs transition-all flex flex-col ${
                    isLive ? 'border-sky-500/80 ring-2 ring-sky-500/10' : 'border-neutral-200/90'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-3 sm:p-3.5 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        isLive ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                      }`} />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{sales.name}</div>
                        <div className="text-[10px] text-neutral-400 font-mono truncate">{sales.email || `Sales ID #${sales.id}`}</div>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      isLive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                    }`}>
                      {isLive ? 'LIVE STREAM' : 'STANDBY'}
                    </span>
                  </div>

                  {/* Video Screen Container */}
                  <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
                    <video
                      ref={(el) => {
                        if (el) {
                          videoRefs.current.set(sales.id, el);
                          if (sales.stream && el.srcObject !== sales.stream) {
                            el.srcObject = sales.stream;
                            el.play().catch(() => {});
                          }
                        } else {
                          videoRefs.current.delete(sales.id);
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-contain ${isLive ? 'block' : 'hidden'}`}
                    />

                    {/* Placeholder when not streaming */}
                    {!isLive && (
                      <div className="p-6 text-center text-neutral-500 flex flex-col items-center justify-center gap-2">
                        <Monitor className="w-8 h-8 text-neutral-600" />
                        <span className="text-xs font-medium text-neutral-400">
                          {sales.isStreaming ? 'Menghubungkan WebRTC feed...' : 'Sales belum memulai berbagi layar WhatsApp'}
                        </span>
                      </div>
                    )}

                    {/* Overlay Stats (Resolution, FPS, Bitrate) */}
                    {isLive && (
                      <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-xs text-[10px] font-mono text-neutral-300 px-2 py-0.5 rounded-md border border-white/10 pointer-events-none">
                        {sales.stats?.resolution || '720p'} • {sales.stats?.fps || 10} fps • {sales.stats?.kbps || 250} kbps
                      </div>
                    )}

                    {/* Controls Overlay */}
                    <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                      {isLive && (
                        <button
                          type="button"
                          onClick={() => setFocusedSalesId(sales.id)}
                          className="w-7 h-7 bg-black/80 hover:bg-neutral-800 text-white rounded-lg flex items-center justify-center border border-white/20 shadow-xs transition-colors cursor-pointer"
                          title="Perbesar Layar (Focus Mode)"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => requestStreamFromSales(sales.id)}
                        className="w-7 h-7 bg-black/80 hover:bg-neutral-800 text-white rounded-lg flex items-center justify-center border border-white/20 shadow-xs transition-colors cursor-pointer"
                        title="Minta Ulang Stream"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="p-2.5 bg-neutral-50 border-t border-neutral-200/80 flex items-center justify-between text-[11px] text-neutral-500">
                    <span className="font-mono">
                      ICE: {sales.stats?.iceState || (isLive ? 'connected' : 'idle')}
                    </span>
                    <span className="text-neutral-400">
                      WhatsApp Web Monitoring
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Focus Mode Fullscreen Modal */}
      {focusedSales && (
        <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm p-4 sm:p-6 flex items-center justify-center animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-3 sm:p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <div>
                  <h3 className="text-sm font-bold">{focusedSales.name} — Live Screen Inspection</h3>
                  <p className="text-[10px] text-neutral-400 font-mono">
                    WhatsApp Web Live Feed • {focusedSales.stats?.resolution || 'HD'} • {focusedSales.stats?.fps || 10} FPS
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFocusedSalesId(null)}
                className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center transition-colors"
                title="Tutup (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Video Player */}
            <div className="relative aspect-video w-full bg-black flex items-center justify-center flex-1 min-h-[300px]">
              <video
                ref={focusVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
