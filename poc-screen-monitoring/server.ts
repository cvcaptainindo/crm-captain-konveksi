import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket, { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ConnectedClient {
  ws: WebSocket;
  role: 'sales' | 'admin';
  id: string;
  name: string;
  isStreaming: boolean;
  streamStartTime?: number;
  lastPing: number;
}

const clients = new Map<string, ConnectedClient>();

function getPort(): number {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    return parseInt(process.argv[portArgIdx + 1], 10);
  }
  return parseInt(process.env.POC_PORT || '3050', 10);
}

const PORT = getPort();
const PUBLIC_DIR = path.resolve(__dirname, 'public');

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// HTTP Server to serve static POC frontend files
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Status Endpoint
  if (req.url === '/api/poc/status') {
    const salesList = Array.from(clients.values())
      .filter(c => c.role === 'sales')
      .map(c => ({
        id: c.id,
        name: c.name,
        isStreaming: c.isStreaming,
        streamStartTime: c.streamStartTime,
      }));
    const adminsCount = Array.from(clients.values()).filter(c => c.role === 'admin').length;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      totalConnections: clients.size,
      adminsConnected: adminsCount,
      activeSales: salesList,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // Static File Serving
  let reqPath = req.url?.split('?')[0] || '/';
  if (reqPath === '/' || reqPath === '/poc') {
    reqPath = '/index.html';
  } else if (reqPath.startsWith('/poc/')) {
    reqPath = reqPath.replace(/^\/poc/, '');
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found - POC Screen Monitoring');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// WebSocket Signaling Server
const wss = new WebSocketServer({ server });

function getActiveSalesList() {
  return Array.from(clients.values())
    .filter(c => c.role === 'sales')
    .map(c => ({
      id: c.id,
      name: c.name,
      isStreaming: c.isStreaming,
      streamStartTime: c.streamStartTime,
    }));
}

function broadcastToAdmins(message: any) {
  const payload = JSON.stringify(message);
  for (const client of clients.values()) {
    if (client.role === 'admin' && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function sendToClient(targetId: string, message: any): boolean {
  const target = clients.get(targetId);
  if (target && target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

wss.on('connection', (ws: WebSocket) => {
  let clientId: string | null = null;

  ws.on('message', (raw: WebSocket.RawData) => {
    try {
      const data = JSON.parse(raw.toString());

      switch (data.type) {
        // 1. Client Registration (Sales or Admin)
        case 'register': {
          const { role, id, name } = data;
          if (!role || !id) {
            ws.send(JSON.stringify({ type: 'error', message: 'Role and ID are required.' }));
            return;
          }

          clientId = id;
          clients.set(id, {
            ws,
            role,
            id,
            name: name || id,
            isStreaming: false,
            lastPing: Date.now(),
          });

          // Acknowledge registration
          ws.send(JSON.stringify({
            type: 'registered',
            id,
            role,
            salesList: role === 'admin' ? getActiveSalesList() : undefined,
          }));

          // Notify admins if new sales came online
          if (role === 'sales') {
            broadcastToAdmins({
              type: 'sales_online',
              sales: { id, name: name || id, isStreaming: false },
            });
          }
          break;
        }

        // 2. Sales notifies that screen streaming has started
        case 'stream_started': {
          if (!clientId) return;
          const client = clients.get(clientId);
          if (client && client.role === 'sales') {
            client.isStreaming = true;
            client.streamStartTime = Date.now();

            broadcastToAdmins({
              type: 'sales_stream_started',
              salesId: clientId,
              salesName: client.name,
              streamStartTime: client.streamStartTime,
            });
          }
          break;
        }

        // 3. Sales notifies that screen streaming has stopped
        case 'stream_stopped': {
          if (!clientId) return;
          const client = clients.get(clientId);
          if (client && client.role === 'sales') {
            client.isStreaming = false;
            client.streamStartTime = undefined;

            broadcastToAdmins({
              type: 'sales_stream_stopped',
              salesId: clientId,
            });
          }
          break;
        }

        // 4. Admin requests a stream from a specific sales client
        case 'request_stream': {
          const { salesId } = data;
          if (clientId && salesId) {
            sendToClient(salesId, {
              type: 'stream_requested_by_admin',
              adminId: clientId,
            });
          }
          break;
        }

        // 5. WebRTC SDP Offer (Relayed from Sales -> Admin or vice-versa)
        case 'offer': {
          const { targetId, sdp } = data;
          if (clientId && targetId && sdp) {
            sendToClient(targetId, {
              type: 'offer',
              senderId: clientId,
              sdp,
            });
          }
          break;
        }

        // 6. WebRTC SDP Answer (Relayed back to offerer)
        case 'answer': {
          const { targetId, sdp } = data;
          if (clientId && targetId && sdp) {
            sendToClient(targetId, {
              type: 'answer',
              senderId: clientId,
              sdp,
            });
          }
          break;
        }

        // 7. WebRTC ICE Candidate exchange
        case 'ice_candidate': {
          const { targetId, candidate } = data;
          if (clientId && targetId && candidate) {
            sendToClient(targetId, {
              type: 'ice_candidate',
              senderId: clientId,
              candidate,
            });
          }
          break;
        }

        // 8. Stream status / telemetry ping (FPS, bitrate, resolution)
        case 'telemetry': {
          const { targetId, stats } = data;
          if (clientId && targetId && stats) {
            sendToClient(targetId, {
              type: 'telemetry',
              senderId: clientId,
              stats,
            });
          }
          break;
        }

        // 9. Heartbeat Ping
        case 'ping': {
          if (clientId && clients.has(clientId)) {
            clients.get(clientId)!.lastPing = Date.now();
          }
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[Signaling Server Error parsing message]:', err);
    }
  });

  ws.on('close', () => {
    if (clientId && clients.has(clientId)) {
      const client = clients.get(clientId)!;
      clients.delete(clientId);

      if (client.role === 'sales') {
        broadcastToAdmins({
          type: 'sales_offline',
          salesId: clientId,
        });
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[Signaling WS Socket Error]:', err);
  });
});

// Periodic heartbeat cleanup for stale clients (every 30 seconds)
const heartbeatInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, client] of clients.entries()) {
    if (now - client.lastPing > 60000) {
      client.ws.terminate();
      clients.delete(id);
      if (client.role === 'sales') {
        broadcastToAdmins({ type: 'sales_offline', salesId: id });
      }
    }
  }
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================================');
  console.log('CRM CAPTAIN KONVEKSI — PROOF OF CONCEPT (POC)');
  console.log('LIVE WHATSAPP WEB SCREEN MONITORING (WebRTC)');
  console.log('========================================================');
  console.log(`[POC Server] Running at http://0.0.0.0:${PORT}`);
  console.log(`[POC UI] Landing Hub:         http://localhost:${PORT}/`);
  console.log(`[POC UI] Admin Dashboard:     http://localhost:${PORT}/admin.html`);
  console.log(`[POC UI] Sales 1 Portal:      http://localhost:${PORT}/sales.html?id=sales-1&name=Sales%20Ahmad`);
  console.log(`[POC UI] Sales 2 Portal:      http://localhost:${PORT}/sales.html?id=sales-2&name=Sales%20Budi`);
  console.log(`[POC UI] Dual Simulation:     http://localhost:${PORT}/simulation.html`);
  console.log('========================================================');
});

// Clean shutdown handler
process.on('SIGINT', () => {
  clearInterval(heartbeatInterval);
  wss.close();
  server.close(() => {
    process.exit(0);
  });
});
