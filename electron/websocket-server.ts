import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import http from 'http';

export interface WebSocketServerOptions {
  port?: number;
  host?: string;
  maxPayload?: number; // 5MB default
  onTextReceived?: (text: string, metadata: { timestamp: number; senderId: string }) => void;
  onSenderStatusChange?: (connected: boolean, senderInfo?: { id: string }) => void;
  onError?: (err: Error) => void;
}

export class LocalCompanionWebSocketServer {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private sessionToken: string;
  private activeSenderWs: WebSocket | null = null;
  private activeSenderId: string | null = null;
  private port: number;
  private host: string;
  private options: WebSocketServerOptions;

  constructor(options: WebSocketServerOptions = {}) {
    this.port = options.port || 8765;
    this.host = options.host || '127.0.0.1'; // Strictly localhost per spec #12
    this.options = {
      maxPayload: 5 * 1024 * 1024, // 5MB limit per spec #22
      ...options,
    };
    this.sessionToken = crypto.randomBytes(16).toString('hex');
  }

  public getSessionToken(): string {
    return this.sessionToken;
  }

  public regenerateSessionToken(): string {
    this.sessionToken = crypto.randomBytes(16).toString('hex');
    this.broadcast({
      type: 'TOKEN_REFRESHED',
      message: 'Session token has been rotated. Please re-authenticate.',
    });
    return this.sessionToken;
  }

  public isSenderConnected(): boolean {
    return this.activeSenderWs !== null && this.activeSenderWs.readyState === WebSocket.OPEN;
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = http.createServer((req, res) => {
          // Provide health check / token validation endpoint for local apps
          if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                status: 'running',
                senderConnected: this.isSenderConnected(),
                port: this.port,
              })
            );
            return;
          }
          res.writeHead(404);
          res.end();
        });

        this.wss = new WebSocketServer({
          server: this.httpServer,
          maxPayload: this.options.maxPayload,
        });

        this.wss.on('connection', (ws: WebSocket, req) => {
          this.handleClientConnection(ws, req);
        });

        this.wss.on('error', (err: any) => {
          if (this.options.onError) {
            this.options.onError(err);
          }
          reject(err);
        });

        this.httpServer.listen(this.port, this.host, () => {
          console.log(`[Local WebSocket Server] Listening strictly on ${this.host}:${this.port}`);
          console.log(`[Local WebSocket Server] Session Token: ${this.sessionToken}`);
          resolve(this.port);
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  private handleClientConnection(ws: WebSocket, req: http.IncomingMessage) {
    const clientId = crypto.randomUUID();
    let isAuthenticated = false;

    // Optional query parameter authentication
    const url = new URL(req.url || '', `http://${this.host}:${this.port}`);
    const tokenQuery = url.searchParams.get('token');
    if (tokenQuery && tokenQuery === this.sessionToken) {
      isAuthenticated = true;
    }

    // Spec #11: Only one sender active by default
    if (this.activeSenderWs === null) {
      this.activeSenderWs = ws;
      this.activeSenderId = clientId;
      ws.send(
        JSON.stringify({
          type: 'SENDER_ASSIGNED',
          isActive: true,
          message: 'Connected to Desktop Companion service.',
        })
      );
      if (this.options.onSenderStatusChange) {
        this.options.onSenderStatusChange(true, { id: clientId });
      }
    } else {
      ws.send(
        JSON.stringify({
          type: 'WARNING_MULTIPLE_SENDERS',
          isActive: false,
          message: 'Another browser session is connected.',
        })
      );
    }

    ws.on('message', (data: Buffer | string) => {
      try {
        const raw = data.toString();
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              code: 'INVALID_JSON',
              message: 'Invalid message received.',
            })
          );
          return;
        }

        if (!parsed || typeof parsed !== 'object' || !parsed.type) {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              code: 'MALFORMED',
              message: 'Invalid message format.',
            })
          );
          return;
        }

        // Keep-alive PING / PONG per spec #4
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
          return;
        }

        // Authentication handshake
        if (parsed.type === 'AUTH') {
          if (parsed.token === this.sessionToken) {
            isAuthenticated = true;
            ws.send(JSON.stringify({ type: 'AUTH_SUCCESS' }));
          } else {
            ws.send(
              JSON.stringify({
                type: 'AUTH_FAILED',
                message: 'Invalid session token.',
              })
            );
          }
          return;
        }

        // Text Update per spec #4 & #7
        if (parsed.type === 'TEXT_UPDATE') {
          if (this.activeSenderWs !== ws) {
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                message: 'Only the active sender may synchronize text.',
              })
            );
            return;
          }

          // Untrusted plain text processing - ensure string type
          const incomingText = typeof parsed.text === 'string' ? parsed.text : '';

          if (this.options.onTextReceived) {
            this.options.onTextReceived(incomingText, {
              timestamp: Date.now(),
              senderId: clientId,
            });
          }

          ws.send(
            JSON.stringify({
              type: 'ACK',
              timestamp: Date.now(),
              charCount: incomingText.length,
            })
          );
        }
      } catch (err: any) {
        console.error('WebSocket message handling error:', err);
      }
    });

    ws.on('close', () => {
      if (this.activeSenderWs === ws) {
        this.activeSenderWs = null;
        this.activeSenderId = null;
        if (this.options.onSenderStatusChange) {
          this.options.onSenderStatusChange(false);
        }
      }
    });

    ws.on('error', (err) => {
      console.error('Client WebSocket socket error:', err);
    });
  }

  private broadcast(payload: any) {
    if (!this.wss) return;
    const msg = JSON.stringify(payload);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          if (this.httpServer) {
            this.httpServer.close(() => resolve());
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
