import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { checkScreenShareSupport } from '../../utils/screenShareSupport.js';
import {
  Radio,
  Play,
  Square,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Info,
  CheckCircle2,
} from 'lucide-react';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 2,
};

// Internal optimal preset for bandwidth-efficient 720p @ 10fps (~250kbps)
const VIDEO_CONSTRAINTS = {
  displaySurface: 'browser' as const,
  width: { max: 1280, ideal: 1280 },
  height: { max: 720, ideal: 720 },
  frameRate: { max: 10, ideal: 10 },
};
const MAX_BITRATE_BPS = 250000;

export const SalesScreenSharePanel: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [compatibilityError, setCompatibilityError] = useState<string | null>(null);
  const [connectedAdminsCount, setConnectedAdminsCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Check browser capability on mount
  useEffect(() => {
    const support = checkScreenShareSupport();
    if (!support.supported) {
      setCompatibilityError(support.reason || 'Browser atau perangkat ini belum mendukung berbagi layar. Silakan gunakan browser dan perangkat yang kompatibel.');
    }
  }, []);

  // 1. Establish WebSocket connection with CRM JWT Token
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
        console.warn('[Sales Signaling Parse Error]:', err);
      }
    };

    ws.onerror = () => {
      setWsStatus('disconnected');
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      stopAllPeerConnections();
    };
  };

  const stopAllPeerConnections = () => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setConnectedAdminsCount(0);
  };

  // 2. Handle incoming signaling messages
  const handleSignalingMessage = async (data: any) => {
    switch (data.type) {
      case 'authenticated':
        setWsStatus('connected');
        break;

      case 'stream_requested_by_admin': {
        const adminId = parseInt(data.adminId, 10);
        if (localStreamRef.current && isStreaming) {
          await createPeerConnectionForAdmin(adminId);
        }
        break;
      }

      case 'answer': {
        const adminId = parseInt(data.senderId, 10);
        const pc = peerConnectionsRef.current.get(adminId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }
        break;
      }

      case 'ice_candidate': {
        const adminId = parseInt(data.senderId, 10);
        const pc = peerConnectionsRef.current.get(adminId);
        if (pc && data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
        break;
      }

      default:
        break;
    }
  };

  // 3. Create RTCPeerConnection to send stream to an Admin
  const createPeerConnectionForAdmin = async (adminId: number) => {
    if (!localStreamRef.current) return;

    // Close previous if exists
    if (peerConnectionsRef.current.has(adminId)) {
      peerConnectionsRef.current.get(adminId)!.close();
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current.set(adminId, pc);
    setConnectedAdminsCount(peerConnectionsRef.current.size);

    // Add video track
    const track = localStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    const sender = pc.addTrack(track, localStreamRef.current);

    // Apply internal bitrate throttling for bandwidth efficiency
    try {
      if (sender.getParameters) {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        params.encodings[0].maxBitrate = MAX_BITRATE_BPS;
        await sender.setParameters(params);
      }
    } catch (e) {
      console.warn('Could not set maxBitrate:', e);
    }

    // ICE Candidate
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'ice_candidate',
            targetId: adminId,
            candidate: event.candidate,
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        peerConnectionsRef.current.delete(adminId);
        setConnectedAdminsCount(peerConnectionsRef.current.size);
      }
    };

    // Create & send Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'offer',
          targetId: adminId,
          sdp: offer,
        })
      );
    }
  };

  // 4. Start Screen Capture (getDisplayMedia)
  const handleStartScreenCapture = async () => {
    // Check compatibility before triggering
    const support = checkScreenShareSupport();
    if (!support.supported) {
      setCompatibilityError(support.reason || 'Browser atau perangkat ini belum mendukung berbagi layar. Silakan gunakan browser dan perangkat yang kompatibel.');
      showToast(support.reason || 'Browser tidak mendukung berbagi layar.', 'error');
      return;
    }

    setIsStarting(true);
    try {
      // Real WhatsApp Web tab capture (zero simulated Canvas)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: VIDEO_CONSTRAINTS,
        audio: false, // Strict privacy: No audio or microphone capture
      });

      localStreamRef.current = stream;
      setIsStreaming(true);

      // Handle user stopping share from browser UI native notification bar
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          handleStopScreenCapture();
          showToast('Berbagi layar dihentikan oleh pengguna.', 'info');
        };
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Notify signaling server
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'stream_started',
          })
        );
      }

      showToast('Layar WhatsApp berhasil dibagikan kepada Admin.', 'success');
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        showToast('Gagal memulai berbagi layar: ' + (err.message || 'Izin ditolak'), 'error');
      }
    } finally {
      setIsStarting(false);
    }
  };

  // 5. Stop Screen Capture
  const handleStopScreenCapture = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    stopAllPeerConnections();
    setIsStreaming(false);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'stream_stopped',
        })
      );
    }
  };

  useEffect(() => {
    connectSignaling();
    return () => {
      handleStopScreenCapture();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-2xs overflow-hidden transition-all">
      {/* Header Banner - Captain Konveksi Navy-Gold */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#c5a059]/20 border border-[#c5a059]/40 flex items-center justify-center text-[#c5a059] shrink-0">
            <Radio className={`w-5 h-5 ${isStreaming ? 'animate-pulse text-emerald-400' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold tracking-tight">Live Monitor WhatsApp</h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isStreaming
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse'
                    : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                }`}
              >
                {isStreaming ? 'Sedang berbagi layar' : 'Belum terhubung'}
              </span>
            </div>
            <p className="text-xs text-neutral-300 mt-0.5">
              {isStreaming
                ? 'Layar WhatsApp sedang dibagikan kepada Admin.'
                : 'Hubungkan WhatsApp Web agar layar yang Anda bagikan dapat dilihat oleh Admin.'}
            </p>
          </div>
        </div>

        {/* Signaling Status Indicator */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-800/90 border border-neutral-700 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-emerald-400'
                  : wsStatus === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span className="text-[11px] font-mono text-neutral-300">
              {wsStatus === 'connected' ? 'Sinyal Terhubung' : wsStatus === 'connecting' ? 'Menghubungkan...' : 'Offline'}
            </span>
          </div>
          {wsStatus === 'disconnected' && (
            <button
              onClick={connectSignaling}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
              title="Hubungkan Ulang"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Body */}
      <div className="p-4 sm:p-6 space-y-4">
        {/* Device Compatibility Warning Banner (If unsupported e.g. Android/Mobile) */}
        {compatibilityError && (
          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/90 flex items-start gap-3 text-xs text-amber-800">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold block text-amber-900 mb-0.5">Pemberitahuan Kompatibilitas Perangkat:</span>
              {compatibilityError}
            </div>
          </div>
        )}

        {/* Step-by-step guidance card for Sales */}
        {!isStreaming && (
          <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200/80">
            <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-[#c5a059]" />
              Panduan Menghubungkan Layar WhatsApp Web:
            </h3>
            <ol className="text-xs text-neutral-600 space-y-2 list-decimal list-inside pl-1 leading-relaxed">
              <li>Pastikan tab <strong className="text-neutral-800">WhatsApp Web</strong> sudah terbuka di browser komputer Anda.</li>
              <li>Klik tombol <strong className="text-emerald-700">"Hubungkan WhatsApp"</strong> di bawah.</li>
              <li>Pada kotak dialog browser yang muncul, pilih tab <strong className="text-neutral-800">"WhatsApp"</strong> lalu klik tombol <em>Bagikan (Share)</em>.</li>
            </ol>
          </div>
        )}

        {/* Single Primary Action Button */}
        <div>
          {!isStreaming ? (
            <button
              type="button"
              onClick={handleStartScreenCapture}
              disabled={wsStatus !== 'connected' || !!compatibilityError || isStarting}
              className="w-full sm:w-auto min-h-[46px] px-6 py-2.5 bg-[#c5a059] hover:bg-[#b38f48] active:bg-[#9d7d3d] disabled:bg-neutral-300 disabled:cursor-not-allowed text-neutral-900 font-bold rounded-xl text-sm shadow-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isStarting ? 'Membuka dialog izin...' : 'Hubungkan WhatsApp'}</span>
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <div>
                  <div className="text-xs font-bold text-emerald-900">Layar WhatsApp sedang dibagikan kepada Admin</div>
                  <div className="text-[11px] text-emerald-700">
                    {connectedAdminsCount > 0 ? `${connectedAdminsCount} Admin sedang memantau feed` : 'Menunggu Admin membuka dashboard monitor'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleStopScreenCapture}
                className="min-h-[42px] px-5 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-xl text-xs shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Hentikan Berbagi</span>
              </button>
            </div>
          )}
        </div>

        {/* Local Preview Area (When sharing is active) */}
        {isStreaming && (
          <div className="p-3 bg-neutral-900 rounded-xl border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-300">
              <span className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Pratinjau Layar yang Anda Bagikan (Live Preview)
              </span>
              <span className="text-[11px] text-neutral-400 font-mono">
                Tab WhatsApp Web Aktif
              </span>
            </div>
            <div className="relative aspect-video max-h-64 w-full bg-black rounded-lg overflow-hidden border border-neutral-800 flex items-center justify-center">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        )}

        {/* Privacy Notice */}
        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-start gap-2.5 text-xs text-neutral-600">
          <ShieldCheck className="w-4 h-4 text-[#c5a059] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-neutral-800">Privasi & Transparansi:</span> Sistem ini hanya mentransmisikan visual tab WhatsApp Web yang Anda pilih. Suara, mikrofon, webcam, serta tab dan file pribadi lainnya <strong>TIDAK diakses atau direkam</strong>. Anda dapat menghentikan sesi berbagi kapan saja melalui tombol di atas.
          </div>
        </div>
      </div>
    </div>
  );
};
