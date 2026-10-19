// Sales WebRTC Screen Sharing Client
class SalesStreamer {
  constructor(options) {
    this.salesId = options.salesId;
    this.salesName = options.salesName;
    this.signalingUrl = options.signalingUrl || window.POC_CONFIG.getSignalingUrl();
    this.rtcConfig = options.rtcConfig || window.POC_CONFIG.rtcConfig;
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onTelemetry = options.onTelemetry || (() => {});

    this.ws = null;
    this.localStream = null;
    this.peerConnections = new Map(); // adminId -> RTCPeerConnection
    this.isStreaming = false;
    this.selectedPreset = options.preset || 'balanced';
    this.canvasInterval = null;
  }

  // 1. Connect to WebSocket Signaling Server
  connectSignaling() {
    return new Promise((resolve, reject) => {
      this.onStatusChange('connecting', 'Menghubungkan ke signaling server...');
      this.ws = new WebSocket(this.signalingUrl);

      this.ws.onopen = () => {
        // Register as Sales
        this.ws.send(JSON.stringify({
          type: 'register',
          role: 'sales',
          id: this.salesId,
          name: this.salesName,
        }));
        this.onStatusChange('online', 'Terhubung ke server signaling. Siap berbagi layar.');
        resolve();
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          await this.handleSignalingMessage(data);
        } catch (err) {
          console.error('[Sales WS Error]:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[Sales WS Connection Error]:', err);
        this.onStatusChange('error', 'Gagal terhubung ke signaling server.');
        reject(err);
      };

      this.ws.onclose = () => {
        this.onStatusChange('offline', 'Terputus dari server signaling.');
        this.stopAllPeerConnections();
      };
    });
  }

  // 2. Handle Signaling Messages
  async handleSignalingMessage(data) {
    switch (data.type) {
      case 'registered':
        console.log(`[Sales] Registered successfully as ${data.id}`);
        break;

      case 'stream_requested_by_admin': {
        const { adminId } = data;
        if (this.isStreaming && this.localStream) {
          console.log(`[Sales] Admin ${adminId} requested stream. Initiating WebRTC offer...`);
          await this.createPeerConnectionForAdmin(adminId);
        }
        break;
      }

      case 'answer': {
        const { senderId, sdp } = data;
        const pc = this.peerConnections.get(senderId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          console.log(`[Sales] Remote SDP Answer set from Admin ${senderId}`);
        }
        break;
      }

      case 'ice_candidate': {
        const { senderId, candidate } = data;
        const pc = this.peerConnections.get(senderId);
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        break;
      }

      default:
        break;
    }
  }

  // 3. Start Screen Capture via Browser API (getDisplayMedia)
  async startScreenCapture(presetKey = 'balanced') {
    this.selectedPreset = presetKey;
    const preset = window.POC_CONFIG.videoPresets[presetKey] || window.POC_CONFIG.videoPresets.balanced;

    try {
      this.onStatusChange('connecting', 'Membuka dialog pemilihan layar...');

      // Request screen or specific browser tab
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          width: preset.width,
          height: preset.height,
          frameRate: preset.frameRate,
        },
        audio: false, // Privacy protection: no microphone / audio capture
      });

      this.localStream = stream;
      this.isStreaming = true;

      // Handle user stopping share via browser native banner
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.onended = () => {
        console.log('[Sales] Screen share ended by user via browser control.');
        this.stopScreenCapture();
      };

      // Notify signaling server
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'stream_started',
          salesId: this.salesId,
        }));
      }

      this.onStatusChange('streaming', 'Berbagi Layar Aktif (Tab WhatsApp Web)');
      return stream;
    } catch (err) {
      this.onStatusChange('online', 'Pemilihan layar dibatalkan atau tidak diizinkan.');
      throw err;
    }
  }

  // 4. Fallback: Simulated WhatsApp Web Stream (Interactive Canvas)
  startSimulatedStream(presetKey = 'balanced') {
    this.selectedPreset = presetKey;
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    let msgOffset = 0;
    this.canvasInterval = setInterval(() => {
      msgOffset = (msgOffset + 1) % 1000;
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID');

      // WhatsApp Web mockup background
      ctx.fillStyle = '#111b21';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Left sidebar (Chats list)
      ctx.fillStyle = '#202c33';
      ctx.fillRect(0, 0, 360, canvas.height);
      ctx.fillStyle = '#00a884';
      ctx.fillRect(0, 0, 360, 60);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`WhatsApp Web — ${this.salesName}`, 20, 36);

      // Chat list mock
      const contacts = ['Pak Hendra (PT Maju)', 'Ibu Dina (Konveksi Solo)', 'Pak Bambang (Jaket)', 'Budi Santoso', 'Siti Rahma'];
      contacts.forEach((name, i) => {
        ctx.fillStyle = i === 0 ? '#2a3942' : '#202c33';
        ctx.fillRect(10, 70 + i * 65, 340, 58);
        ctx.fillStyle = '#e9edef';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(name, 25, 95 + i * 65);
        ctx.fillStyle = '#8696a0';
        ctx.font = '13px sans-serif';
        ctx.fillText(`Pesan: Konfirmasi desain kaos...`, 25, 115 + i * 65);
      });

      // Right Main Chat Area
      ctx.fillStyle = '#0b141a';
      ctx.fillRect(360, 0, canvas.width - 360, canvas.height);

      // Chat header
      ctx.fillStyle = '#202c33';
      ctx.fillRect(360, 0, canvas.width - 360, 60);
      ctx.fillStyle = '#e9edef';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('Pak Hendra (PT Maju Jaya) — Customer Aktif', 380, 36);

      // Chat bubbles
      ctx.fillStyle = '#202c33';
      ctx.fillRect(380, 90, 420, 60);
      ctx.fillStyle = '#e9edef';
      ctx.font = '14px sans-serif';
      ctx.fillText('Selamat siang Mas, untuk sample jaket sudah siap kirim?', 395, 115);
      ctx.fillStyle = '#8696a0';
      ctx.font = '11px sans-serif';
      ctx.fillText('13:42', 750, 140);

      // Outgoing message (Sales)
      ctx.fillStyle = '#005c4b';
      ctx.fillRect(680, 170, 480, 70);
      ctx.fillStyle = '#e9edef';
      ctx.font = '14px sans-serif';
      ctx.fillText(`Siap Pak Hendra! Sedang proses QC bordir logo.`, 695, 195);
      ctx.fillText(`Estimasi resi keluar sore ini via JNE Cargo.`, 695, 215);
      ctx.fillStyle = '#8696a0';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${timeStr} ✓✓`, 1110, 230);

      // Watermark indicator
      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.fillRect(canvas.width - 320, 20, 300, 36);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`🔴 LIVE STREAMING MONITORING`, canvas.width - 305, 43);
    }, 100);

    const stream = canvas.captureStream(10);
    this.localStream = stream;
    this.isStreaming = true;

    // Notify signaling
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'stream_started',
        salesId: this.salesId,
      }));
    }

    this.onStatusChange('streaming', 'Berbagi Layar Aktif (Mode Simulasi Canvas WhatsApp)');
    return stream;
  }

  // 5. Create RTCPeerConnection for incoming Admin Viewer
  async createPeerConnectionForAdmin(adminId) {
    if (!this.localStream) return;

    // Clean existing connection if any
    if (this.peerConnections.has(adminId)) {
      this.peerConnections.get(adminId).close();
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(adminId, pc);

    // Add video track
    const track = this.localStream.getVideoTracks()[0];
    const sender = pc.addTrack(track, this.localStream);

    // Set Max Bitrate parameter
    try {
      const preset = window.POC_CONFIG.videoPresets[this.selectedPreset];
      if (preset && sender.getParameters) {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        params.encodings[0].maxBitrate = preset.maxBitrateBps;
        await sender.setParameters(params);
      }
    } catch (e) {
      console.warn('[Sales WebRTC] setParameters bitrate warning:', e);
    }

    // ICE Candidate event
    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'ice_candidate',
          targetId: adminId,
          candidate: event.candidate,
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Sales Peer ${adminId}] Connection state:`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.peerConnections.delete(adminId);
      }
    };

    // Create SDP Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Send Offer to Admin via signaling
    this.ws.send(JSON.stringify({
      type: 'offer',
      targetId: adminId,
      sdp: offer,
    }));
  }

  // 6. Stop Screen Capture
  stopScreenCapture() {
    if (this.canvasInterval) {
      clearInterval(this.canvasInterval);
      this.canvasInterval = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.stopAllPeerConnections();
    this.isStreaming = false;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'stream_stopped',
        salesId: this.salesId,
      }));
    }

    this.onStatusChange('online', 'Berbagi layar dihentikan. Siap berbagi kembali.');
  }

  stopAllPeerConnections() {
    for (const [adminId, pc] of this.peerConnections.entries()) {
      pc.close();
    }
    this.peerConnections.clear();
  }
}

window.SalesStreamer = SalesStreamer;
