import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Application In-Memory State
let activeSessionToken = crypto.randomBytes(16).toString('hex');
let currentText = '';
let activeSenderId: string | null = null;
let lastUpdateTimestamp = Date.now();

// Track connected clients
interface ClientInfo {
  id: string;
  role: 'sender' | 'companion';
  ws: WebSocket;
  authenticated: boolean;
  connectedAt: number;
  userAgent?: string;
}

const clients = new Map<WebSocket, ClientInfo>();

app.use(express.json({ limit: '10mb' }));

// REST API Endpoints
app.get('/api/session-token', (req, res) => {
  res.json({
    token: activeSessionToken,
    activeSender: activeSenderId !== null,
    totalCompanions: Array.from(clients.values()).filter((c) => c.role === 'companion').length,
  });
});

app.post('/api/session-token/regenerate', (req, res) => {
  activeSessionToken = crypto.randomBytes(16).toString('hex');
  // Broadcast token revocation / refresh to all clients
  broadcast({
    type: 'TOKEN_REFRESHED',
    message: 'Session token has been rotated. Please re-authenticate.',
  });
  res.json({ token: activeSessionToken, success: true });
});

app.get('/api/status', (req, res) => {
  const senders = Array.from(clients.values()).filter((c) => c.role === 'sender');
  const companions = Array.from(clients.values()).filter((c) => c.role === 'companion');

  res.json({
    status: 'online',
    activeSenderId,
    sendersCount: senders.length,
    companionsCount: companions.length,
    charCount: currentText.length,
    lastUpdate: lastUpdateTimestamp,
    port: PORT,
  });
});

// WebSocket Server (Max payload 5MB per spec)
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 5 * 1024 * 1024, // 5MB limit
});

function broadcast(message: any, roleFilter?: 'sender' | 'companion', exclude?: WebSocket) {
  const payload = JSON.stringify(message);
  for (const [ws, info] of clients.entries()) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      if (!roleFilter || info.role === roleFilter) {
        ws.send(payload);
      }
    }
  }
}

function notifyCompanionOfSenderStatus() {
  const isSenderOnline = activeSenderId !== null;
  broadcast(
    {
      type: 'SENDER_STATUS',
      connected: isSenderOnline,
      senderId: activeSenderId,
      timestamp: Date.now(),
    },
    'companion'
  );
}

wss.on('connection', (ws: WebSocket, req) => {
  const clientId = crypto.randomUUID();
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const roleParam = (url.searchParams.get('role') as 'sender' | 'companion') || 'sender';
  const tokenParam = url.searchParams.get('token');

  const clientInfo: ClientInfo = {
    id: clientId,
    role: roleParam,
    ws,
    authenticated: false,
    connectedAt: Date.now(),
    userAgent: req.headers['user-agent'],
  };

  clients.set(ws, clientInfo);

  // Auto-authenticate if valid token passed in query
  if (tokenParam && tokenParam === activeSessionToken) {
    clientInfo.authenticated = true;
  }

  // Handle Sender role assignment
  if (clientInfo.role === 'sender') {
    if (activeSenderId === null) {
      activeSenderId = clientId;
      ws.send(
        JSON.stringify({
          type: 'SENDER_ASSIGNED',
          isActive: true,
          token: activeSessionToken,
          message: 'Connected as active sender.',
        })
      );
      notifyCompanionOfSenderStatus();
    } else {
      // Multiple tabs detected (Specification #11)
      ws.send(
        JSON.stringify({
          type: 'WARNING_MULTIPLE_SENDERS',
          isActive: false,
          message: 'Another browser session is currently connected as the active sender.',
        })
      );
    }
  } else if (clientInfo.role === 'companion') {
    // Send initial text state & connection status to companion
    ws.send(
      JSON.stringify({
        type: 'TEXT_UPDATE',
        text: currentText,
        senderConnected: activeSenderId !== null,
        initialSync: true,
      })
    );
  }

  ws.on('message', (data: Buffer | string) => {
    try {
      const raw = data.toString();
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            code: 'INVALID_JSON',
            message: 'Invalid message received. Expected JSON.',
          })
        );
        return;
      }

      // Security check: Verify payload type
      if (!parsed || typeof parsed !== 'object' || !parsed.type) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            code: 'MALFORMED_MESSAGE',
            message: 'Missing or invalid message type.',
          })
        );
        return;
      }

      // PING -> PONG
      if (parsed.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        return;
      }

      // AUTHENTICATE Handshake
      if (parsed.type === 'AUTH') {
        if (parsed.token === activeSessionToken) {
          clientInfo.authenticated = true;
          ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', token: activeSessionToken }));
        } else {
          ws.send(
            JSON.stringify({
              type: 'AUTH_FAILED',
              message: 'Invalid session token provided.',
            })
          );
        }
        return;
      }

      // TAKE_CONTROL for secondary sender tab wanting to become active
      if (parsed.type === 'CLAIM_ACTIVE_SENDER') {
        activeSenderId = clientId;
        clientInfo.role = 'sender';
        ws.send(
          JSON.stringify({
            type: 'SENDER_ASSIGNED',
            isActive: true,
            message: 'Promoted to active sender.',
          })
        );
        // Notify others
        for (const [otherWs, otherInfo] of clients.entries()) {
          if (otherWs !== ws && otherInfo.role === 'sender') {
            otherWs.send(
              JSON.stringify({
                type: 'WARNING_MULTIPLE_SENDERS',
                isActive: false,
                message: 'Another browser session took over active sender role.',
              })
            );
          }
        }
        notifyCompanionOfSenderStatus();
        return;
      }

      // TEXT_UPDATE
      if (parsed.type === 'TEXT_UPDATE') {
        // Enforce active sender constraint if sender
        if (clientInfo.role === 'sender' && activeSenderId !== clientId) {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              code: 'NOT_ACTIVE_SENDER',
              message: 'Only the active sender tab can broadcast text updates.',
            })
          );
          return;
        }

        const newText = typeof parsed.text === 'string' ? parsed.text : '';
        currentText = newText;
        lastUpdateTimestamp = Date.now();

        // Broadcast to companion window(s) and other listeners
        broadcast(
          {
            type: 'TEXT_UPDATE',
            text: currentText,
            timestamp: lastUpdateTimestamp,
            charCount: currentText.length,
          },
          'companion'
        );

        // Also acknowledge back to sender
        ws.send(
          JSON.stringify({
            type: 'ACK',
            timestamp: lastUpdateTimestamp,
            charCount: currentText.length,
          })
        );
      }
    } catch (err: any) {
      console.error('WebSocket message handler error:', err);
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'SERVER_EXCEPTION',
          message: 'An internal error occurred processing message.',
        })
      );
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    if (activeSenderId === clientId) {
      // Find another sender if available
      const remainingSenders = Array.from(clients.values()).filter((c) => c.role === 'sender');
      if (remainingSenders.length > 0) {
        const nextSender = remainingSenders[0];
        activeSenderId = nextSender.id;
        nextSender.ws.send(
          JSON.stringify({
            type: 'SENDER_ASSIGNED',
            isActive: true,
            message: 'Promoted to active sender after previous sender disconnected.',
          })
        );
      } else {
        activeSenderId = null;
      }
      notifyCompanionOfSenderStatus();
    }
  });

  ws.on('error', (err) => {
    console.error(`WebSocket client ${clientId} error:`, err);
  });
});

// Vite middleware in development vs static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running at http://localhost:${PORT}`);
    console.log(`[Server] WebSocket path: /ws (Active Token: ${activeSessionToken})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
