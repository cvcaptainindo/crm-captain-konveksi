import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../middlewares/auth.middleware.js';
import { pool, User } from '../database/db.js';

interface AuthenticatedClient {
  ws: WebSocket;
  user: User;
  isStreaming: boolean;
  streamStartTime?: number;
  lastPing: number;
}

const salesClients = new Map<number, AuthenticatedClient>();
const adminClients = new Map<number, AuthenticatedClient>();

let wssInstance: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Verifies JWT token and retrieves active user record from database.
 * Derives identity and role directly from database to prevent client spoofing.
 */
export async function authenticateToken(token: string): Promise<User | null> {
  if (!token) return null;
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as { id: number; email: string; role: string };

    let user: User | null = null;
    try {
      const [rows] = await pool.query<any[]>(
        'SELECT id, name, email, phone, role, account_status, is_active FROM users WHERE id = ? LIMIT 1',
        [decoded.id]
      );

      if (rows && rows.length > 0) {
        const u = rows[0] as User;
        if (u.is_active && u.account_status === 'ACTIVE') {
          user = u;
        }
      }
    } catch {
      // In development environment if MySQL is unreachable, fallback to verified JWT payload
      if (process.env.NODE_ENV !== 'production' && decoded.id && decoded.role) {
        user = {
          id: decoded.id,
          name: (decoded as any).name || (decoded.role === 'ADMIN' ? 'Admin Supervisor (Dev)' : `Sales #${decoded.id}`),
          email: decoded.email,
          phone: '',
          role: decoded.role as any,
          account_status: 'ACTIVE',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
    }

    return user;
  } catch (err) {
    return null;
  }
}

/**
 * Validates incoming signaling messages and enforces strict RBAC rules.
 * Ensures SALES cannot request streams from other sales or access restricted supervisor actions.
 */
/**
 * Runtime allowlist for WebSocket monitoring roles.
 * Unknown roles must never be treated as Sales.
 */
export function isSupportedMonitoringRole(
  role: unknown
): role is 'ADMIN' | 'SALES' {
  return role === 'ADMIN' || role === 'SALES';
}

export function validateSignalingMessage(
  user: { id: number; role: 'ADMIN' | 'SALES' | string; name: string } | null,
  message: { type: string; targetId?: number | string; salesId?: number | string; sdp?: any; candidate?: any }
): {
  allowed: boolean;
  reason?: string;
  forwardTo?: 'admin' | 'sales' | 'broadcast_admins';
} {
  if (!user) {
    if (message.type === 'auth') return { allowed: true };
    return { allowed: false, reason: 'Koneksi belum diautentikasi.' };
  }

  if (!isSupportedMonitoringRole(user.role)) {
    return { allowed: false, reason: 'Peran pengguna tidak dikenali.' };
  }

  if (user.role === 'SALES') {
    switch (message.type) {
      case 'ping':
        return { allowed: true };
      case 'stream_started':
      case 'stream_stopped':
        return { allowed: true, forwardTo: 'broadcast_admins' };
      default:
        return {
          allowed: false,
          reason: `Tipe pesan tidak diizinkan untuk monitoring event-only: ${message.type}`,
        };
    }
  }

  switch (message.type) {
    case 'ping':
    case 'get_sales_list':
      return { allowed: true };
    default:
      return {
        allowed: false,
        reason: `Tipe pesan tidak diizinkan untuk monitoring event-only: ${message.type}`,
      };
  }
}
/**
 * Returns the list of currently connected Sales and their stream status.
 * Strictly available only for Admin viewers.
 */
export function getActiveSalesForAdmin() {
  return Array.from(salesClients.values()).map((c) => ({
    id: c.user.id,
    name: c.user.name,
    email: c.user.email,
    isStreaming: c.isStreaming,
    streamStartTime: c.streamStartTime,
  }));
}

function broadcastToAdmins(message: any) {
  const payload = JSON.stringify(message);
  for (const admin of adminClients.values()) {
    if (admin.ws.readyState === WebSocket.OPEN) {
      admin.ws.send(payload);
    }
  }
}

export function getMonitoringStatus() {
  return {
    totalSalesConnected: salesClients.size,
    totalAdminsConnected: adminClients.size,
    activeStreamsCount: Array.from(salesClients.values()).filter((s) => s.isStreaming).length,
    sales: getActiveSalesForAdmin(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Safely removes a session only if the map entry currently points
 * to the exact same WebSocket instance.
 * Prevents an old disconnecting connection from terminating a newer reconnected session.
 */
export function isCurrentSocketSession<T extends { ws: any }>(
  sessions: Map<number, T>,
  userId: number,
  ws: any
): boolean {
  return sessions.get(userId)?.ws === ws;
}

export function safeRemoveSession<T extends { ws: WebSocket }>(
  map: Map<number, T>,
  userId: number,
  socket: WebSocket
): boolean {
  const current = map.get(userId);
  if (current && current.ws === socket) {
    map.delete(userId);
    return true;
  }
  return false;
}

/**
 * Safely removes a sales session and notifies admins if and only if
 * the active session was genuinely removed (not superseded by reconnect).
 */
export function removeSalesSession(userId: number, socket: WebSocket): boolean {
  const removed = safeRemoveSession(salesClients, userId, socket);
  if (removed) {
    broadcastToAdmins({
      type: 'sales_offline',
      salesId: userId,
    });
  }
  return removed;
}

/**
 * Safely removes an admin session only if the map points to this exact socket.
 */
export function removeAdminSession(userId: number, socket: WebSocket): boolean {
  return safeRemoveSession(adminClients, userId, socket);
}

/**
 * Initializes WebSocket signaling on the main HTTP server.
 * Handles path /ws/screen-monitoring with strict JWT verification.
 */
export function setupScreenMonitoringSignaling(server: http.Server): WebSocketServer {
  if (wssInstance) {
    return wssInstance;
  }

  const wss = new WebSocketServer({
    server,
    path: '/ws/screen-monitoring',
  });
  wssInstance = wss;

  wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
    let authUser: User | null = null;

    // 1. Check token in query parameters
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');
      if (token) {
        authUser = await authenticateToken(token);
      }
    } catch {
      // Ignore URL parsing errors
    }

    const registerClient = (user: User) => {
      // Fail closed: reject unsupported roles at runtime.
      if (!isSupportedMonitoringRole(user.role)) {
        authUser = null;
        try {
          ws.send(JSON.stringify({
            type: 'auth_error',
            message: 'Peran pengguna tidak diizinkan untuk monitoring.',
          }));
          ws.close(4403, 'Forbidden role');
        } catch {
          ws.terminate();
        }
        return;
      }

      authUser = user;
      const clientRecord: AuthenticatedClient = {
        ws,
        user,
        isStreaming: false,
        lastPing: Date.now(),
      };

      if (user.role === 'ADMIN') {
        const existing = adminClients.get(user.id);
        if (existing && existing.ws !== ws) {
          try {
            existing.ws.close(1000, 'Replaced by newer connection');
          } catch {
            existing.ws.terminate();
          }
        }
        adminClients.set(user.id, clientRecord);

        // Send confirmation and current sales list to the admin
        ws.send(JSON.stringify({
          type: 'authenticated',
          user: { id: user.id, name: user.name, role: user.role },
          salesList: getActiveSalesForAdmin(),
        }));
      } else {
        // Role is SALES
        const existing = salesClients.get(user.id);
        if (existing && existing.ws !== ws) {
          try {
            existing.ws.close(1000, 'Replaced by newer connection');
          } catch {
            existing.ws.terminate();
          }
        }
        salesClients.set(user.id, clientRecord);

        // Acknowledge connection to sales
        ws.send(JSON.stringify({
          type: 'authenticated',
          user: { id: user.id, name: user.name, role: user.role },
        }));

        // Notify admins that this sales came online
        broadcastToAdmins({
          type: 'sales_online',
          sales: {
            id: user.id,
            name: user.name,
            email: user.email,
            isStreaming: false,
          },
        });
      }
    };

    if (authUser) {
      registerClient(authUser);
    }

    ws.on('message', async (raw: WebSocket.RawData) => {
      try {
        const data = JSON.parse(raw.toString());

        // Handle initial auth message if token was not sent via query param
        if (data.type === 'auth') {
          if (authUser) return; // already authenticated
          const user = await authenticateToken(data.token);
          if (!user) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Sesi login tidak valid atau kadaluarsa.' }));
            ws.close(4401, 'Unauthorized');
            return;
          }
          registerClient(user);
          return;
        }

        // Must be authenticated to proceed
        if (!authUser) {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Koneksi belum diautentikasi.' }));
          return;
        }

        // Reject messages from superseded WebSocket sessions.
        // A reconnect may replace this user's socket while the old
        // socket is still closing. Never let that old socket mutate
        // the newly registered session.
        const activeSessions = authUser.role === 'ADMIN'
          ? adminClients
          : authUser.role === 'SALES'
            ? salesClients
            : undefined;

        if (!activeSessions || !isCurrentSocketSession(activeSessions, authUser.id, ws)) {
          try {
            ws.close(4001, 'Session replaced');
          } catch {
            ws.terminate();
          }
          return;
        }

        // Enforce RBAC validation
        const validation = validateSignalingMessage(authUser, data);
        if (!validation.allowed) {
          ws.send(JSON.stringify({ type: 'error', message: validation.reason }));
          return;
        }

        // ==========================================================
        // SALES SPECIFIC ACTIONS (Strictly enforced by server role)
        // ==========================================================
        if (authUser.role === 'SALES') {
          switch (data.type) {
            case 'stream_started': {
              const sales = salesClients.get(authUser.id);
              if (sales) {
                sales.isStreaming = true;
                sales.streamStartTime = Date.now();

                broadcastToAdmins({
                  type: 'sales_stream_started',
                  salesId: authUser.id,
                  salesName: authUser.name,
                  streamStartTime: sales.streamStartTime,
                });
              }
              break;
            }

            case 'stream_stopped': {
              const sales = salesClients.get(authUser.id);
              if (sales) {
                sales.isStreaming = false;
                sales.streamStartTime = undefined;

                broadcastToAdmins({
                  type: 'sales_stream_stopped',
                  salesId: authUser.id,
                });
              }
              break;
            }

            case 'ping': {
              const sales = salesClients.get(authUser.id);
              if (sales) sales.lastPing = Date.now();
              ws.send(JSON.stringify({ type: 'pong' }));
              break;
            }

            default:
              break;
          }
        }

        // ==========================================================
        // ADMIN SPECIFIC ACTIONS (Strictly enforced by server role)
        // ==========================================================
        if (authUser.role === 'ADMIN') {
          switch (data.type) {
            case 'get_sales_list': {
              ws.send(JSON.stringify({
                type: 'sales_list',
                salesList: getActiveSalesForAdmin(),
              }));
              break;
            }

            case 'ping': {
              const admin = adminClients.get(authUser.id);
              if (admin) admin.lastPing = Date.now();
              ws.send(JSON.stringify({ type: 'pong' }));
              break;
            }

            default:
              break;
          }
        }
      } catch (err) {
        // Discard malformed JSON without leaking stack trace
      }
    });

    const cleanupCurrentSession = () => {
      if (authUser) {
        if (authUser.role === 'ADMIN') {
          removeAdminSession(authUser.id, ws);
        } else {
          removeSalesSession(authUser.id, ws);
        }
      }
    };

    ws.on('close', cleanupCurrentSession);
    ws.on('error', cleanupCurrentSession);
  });

  // Keep-alive heartbeat interval to prevent NAT timeout
  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, client] of salesClients.entries()) {
      if (now - client.lastPing > 90000) {
        client.ws.terminate();
        removeSalesSession(id, client.ws);
      }
    }
    for (const [id, client] of adminClients.entries()) {
      if (now - client.lastPing > 90000) {
        client.ws.terminate();
        removeAdminSession(id, client.ws);
      }
    }
  }, 30000);

  return wss;
}

export function closeScreenMonitoringSignaling() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (wssInstance) {
    wssInstance.close();
    wssInstance = null;
  }
  salesClients.clear();
  adminClients.clear();
}
