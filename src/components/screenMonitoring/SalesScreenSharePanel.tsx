import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import {
  Monitor,
  Play,
  Square,
  ShieldCheck,
  RefreshCw,
  Radio,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Eye,
} from 'lucide-react';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 2,
};

const PRESETS = {
  balanced: {
    label: 'Rekomendasi (720p @ 10 FPS — ~250 Kbps)',
    width: { max: 1280, ideal: 1280 },
    height: { max: 720, ideal: 720 },
    frameRate: { max: 10, ideal: 10 },
    maxBitrateBps: 250000,
  },
  lowBandwidth: {
    label: 'Hemat Kuota (540p @ 5 FPS — ~120 Kbps)',
    width: { max: 960, ideal: 960 },
    height: { max: 540, ideal: 540 },
    frameRate: { max: 5, ideal: 5 },
    maxBitrateBps: 120000,
  },
  highQuality: {
    label: 'Ketajaman Tinggi (1080p @ 15 FPS — ~600 Kbps)',
    width: { max: 1920, ideal: 1920 },
    height: { max: 1080, ideal: 1080 },
    frameRate: { max: 15, ideal: 15 },
    maxBitrateBps: 600000,
  },
};

type PresetKey = keyof typeof PRESETS;

export const SalesScreenSharePanel: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamSource, setStreamSource] = useState<'screen' | 'simulation'>('screen');
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>('balanced');
  const [connectedAdminsCount, setConnectedAdminsCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Establish WebSocket Connection with CRM JWT Token
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
    const sender = pc.addTrack(track, localStreamRef.current);

    // Apply bitrate throttle
    try {
      const preset = PRESETS[selectedPreset];
      if (preset && sender.getParameters) {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        params.encodings[0].maxBitrate = preset.maxBitrateBps;
        await sender.setParameters(params);
      }
    } catch (e) {
      console.warn('Could not set maxBitrate:', e);
    }

    // ICE Candidate
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice_candidate',
          targetId: adminId,
          candidate: event.candidate,
        }));
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
      wsRef.current.send(JSON.stringify({
        type: 'offer',
        targetId: adminId,
        sdp: offer,
      }));
    }
  };

  // 4. Start Screen Capture (getDisplayMedia)
  const handleStartScreenCapture = async () => {
    const preset = PRESETS[selectedPreset];

    try {
      let stream: MediaStream;

      if (streamSource === 'simulation') {
        // Fallback: Canvas WhatsApp Simulation
        stream = createSimulatedCanvasStream();
      } else {
        // Native Browser Screen / Tab Share
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
            width: preset.width,
            height: preset.height,
            frameRate: preset.frameRate,
          },
          audio: false, // Strict privacy: No microphone or audio capture
        });
      }

      localStreamRef.current = stream;
      setIsStreaming(true);

      // Handle user stopping share from browser UI
      const track = stream.getVideoTracks()[0];
      track.onended = () => {
        handleStopScreenCapture();
        showToast('Berbagi layar dihentikan oleh pengguna.', 'info');
      };

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Notify server signaling
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'stream_started',
        }));
      }

      showToast('Berbagi layar WhatsApp aktif! Admin dapat melihat tab ini secara live.', 'success');
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        showToast('Gagal memulai berbagi layar: ' + (err.message || 'Error'), 'error');
      }
    }
  };

  // 5. Simulated WhatsApp Web Canvas Stream
  const createSimulatedCanvasStream = (): MediaStream => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;

    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID');

      // WhatsApp Web Background
      ctx.fillStyle = '#111b21';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Left sidebar
      ctx.fillStyle = '#202c33';
      ctx.fillRect(0, 0, 360, canvas.height);
      ctx.fillStyle = '#00a884';
      ctx.fillRect(0, 0, 360, 60);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`WhatsApp Web — ${user?.name || 'Sales'}`, 20, 36);

      // Chat contacts mock
      const contacts = ['Pak Hendra (PT Maju)', 'Ibu Dina (Konveksi Solo)', 'Pak Bambang (Jaket Polos)'];
      contacts.forEach((name, i) => {
        ctx.fillStyle = i === 0 ? '#2a3942' : '#202c33';
        ctx.fillRect(10, 70 + i * 65, 340, 58);
        ctx.fillStyle = '#e9edef';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(name, 25, 95 + i * 65);
        ctx.fillStyle = '#8696a0';
        ctx.font = '12px sans-serif';
        ctx.fillText('Follow-up sampel pesanan...', 25, 115 + i * 65);
      });

      // Right Main Chat Area
      ctx.fillStyle = '#0b141a';
      ctx.fillRect(360, 0, canvas.width - 360, canvas.height);

      ctx.fillStyle = '#202c33';
      ctx.fillRect(360, 0, canvas.width - 360, 60);
      ctx.fillStyle = '#e9edef';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('Pak Hendra (PT Maju) — Chat Aktif', 380, 36);

      // Inbound Bubble
      ctx.fillStyle = '#202c33';
      ctx.fillRect(380, 90, 420, 60);
      ctx.fillStyle = '#e9edef';
      ctx.font = '14px sans-serif';
      ctx.fillText('Halo Mas, konfirmasi DP untuk 100 pcs polo shirt ya.', 395, 115);

      // Outbound Bubble (Sales)
      ctx.fillStyle = '#005c4b';
      ctx.fillRect(680, 170, 480, 70);
      ctx.fillStyle = '#e9edef';
      ctx.font = '14px sans-serif';
      ctx.fillText(`Baik Pak Hendra, faktur DP sudah tercatat di CRM.`, 695, 195);
      ctx.fillText(`Proses potong kain dimulai hari ini.`, 695, 215);
      ctx.fillStyle = '#8696a0';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${timeStr} ✓✓`, 1110, 230);

      // Watermark indicator
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.fillRect(canvas.width - 330, 15, 315, 32);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`🔴 LIVE SUPERVISOR MONITORING`, canvas.width - 315, 36);
    }, 100);

    simIntervalRef.current = interval;
    return canvas.captureStream(10);
  };

  // 6. Stop Screen Capture
  const handleStopScreenCapture = () => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }

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
      wsRef.current.send(JSON.stringify({
        type: 'stream_stopped',
      }));
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
      {/* Header Banner */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#c5a059]/20 border border-[#c5a059]/40 flex items-center justify-center text-[#c5a059] shrink-0">
            <Radio className={`w-5 h-5 ${isStreaming ? 'animate-pulse text-emerald-400' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold tracking-tight">Live Monitor WhatsApp (Supervisor)</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isStreaming
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse'
                  : 'bg-neutral-700 text-neutral-300'
              }`}>
                {isStreaming ? '🔴 STREAMING AKTIF' : 'STANDBY'}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Transmisi layar tab WhatsApp Web Anda secara langsung ke Admin Supervisor untuk kepatuhan SOP & responsivitas.
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-800 border border-neutral-700 text-xs">
            <span className={`w-2 h-2 rounded-full ${
              wsStatus === 'connected' ? 'bg-emerald-400' : wsStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'
            }`} />
            <span className="text-[11px] font-mono text-neutral-300">
              {wsStatus === 'connected' ? 'Signaling Siap' : wsStatus === 'connecting' ? 'Menghubungkan...' : 'Terputus'}
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
      <div className="p-4 sm:p-5 space-y-4">
        {/* Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Preset Selector */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              Kualitas & Efisiensi Bandwidth
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value as PresetKey)}
              disabled={isStreaming}
              className="w-full text-xs font-medium px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#c5a059]/40 disabled:opacity-60"
            >
              <option value="balanced">{PRESETS.balanced.label}</option>
              <option value="lowBandwidth">{PRESETS.lowBandwidth.label}</option>
              <option value="highQuality">{PRESETS.highQuality.label}</option>
            </select>
          </div>

          {/* Source Selector */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              Sumber Tampilan Layar
            </label>
            <select
              value={streamSource}
              onChange={(e) => setStreamSource(e.target.value as 'screen' | 'simulation')}
              disabled={isStreaming}
              className="w-full text-xs font-medium px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#c5a059]/40 disabled:opacity-60"
            >
              <option value="screen">Layar Nyata (Pilih Tab WhatsApp Web via Browser)</option>
              <option value="simulation">Simulasi Otomatis (Demo Canvas Chat WhatsApp)</option>
            </select>
          </div>

          {/* Action Button */}
          <div className="flex items-end">
            {!isStreaming ? (
              <button
                type="button"
                onClick={handleStartScreenCapture}
                disabled={wsStatus !== 'connected'}
                className="w-full min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Mulai Berbagi Layar WhatsApp</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopScreenCapture}
                className="w-full min-h-[40px] px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Hentikan Berbagi Layar</span>
              </button>
            )}
          </div>
        </div>

        {/* Local Preview Area (Only rendered when sharing or in preview) */}
        {isStreaming && (
          <div className="mt-3 p-3 bg-neutral-900 rounded-xl border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-300">
              <span className="font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Pratinjau Layar yang Anda Bagikan (Live Preview)
              </span>
              <span className="font-mono text-[11px] text-neutral-400">
                Supervisor Terhubung: {connectedAdminsCount} Viewer
              </span>
            </div>
            <div className="relative aspect-video max-h-56 w-full bg-black rounded-lg overflow-hidden border border-neutral-800 flex items-center justify-center">
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

        {/* Transparency & Privacy Notice */}
        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-start gap-2.5 text-xs text-neutral-600">
          <ShieldCheck className="w-4 h-4 text-[#c5a059] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-neutral-800">Kebijakan Privasi & Transparansi:</span> Sistem ini hanya mentransmisikan visual tab WhatsApp Web yang Anda pilih. Suara, mikrofon, webcam, serta tab dan file pribadi komputer Anda <strong>TIDAK diakses atau direkam</strong>. Anda dapat menghentikan sesi berbagi kapan saja melalui tombol di atas.
          </div>
        </div>
      </div>
    </div>
  );
};
