import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import url from 'url';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'pilotpanel-super-secret-key-12345';

export const initWebSocketServer = (server: HttpServer) => {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url || '').pathname;

    if (pathname === '/api/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: WebSocket, request) => {
    const parameters = url.parse(request.url || '', true).query;
    const token = parameters.token as string;
    const serverUuid = parameters.server as string;

    if (!token || !serverUuid) {
      ws.send(JSON.stringify({ event: 'error', data: 'Authentication token and Server UUID required.' }));
      ws.close(4001);
      return;
    }

    try {
      // Authenticate User JWT
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string; email: string };

      // Authenticate Server Ownership
      const dbServer = await prisma.server.findUnique({
        where: { uuid: serverUuid },
        include: { node: true }
      });

      if (!dbServer) {
        ws.send(JSON.stringify({ event: 'error', data: 'Server not found.' }));
        ws.close(4004);
        return;
      }

      if (decoded.role === 'Client' && dbServer.userId !== decoded.id) {
        ws.send(JSON.stringify({ event: 'error', data: 'Unauthorized access to server console.' }));
        ws.close(4003);
        return;
      }

      // Establish secure WebSocket link with the daemon running on that Node
      const daemonWsUrl = `ws://${dbServer.node.ipAddress}:${dbServer.node.port}/api/servers/${serverUuid}/console?token=${dbServer.node.token}`;
      
      console.log(`Piping WebSocket console from backend to daemon: ${daemonWsUrl}`);
      const daemonWs = new WebSocket(daemonWsUrl);

      // Relays
      daemonWs.on('open', () => {
        console.log(`WebSocket link established with daemon for server ${serverUuid}`);
      });

      daemonWs.on('message', (message) => {
        try {
          const payload = JSON.parse(message.toString());
          if (payload.event === 'console') {
            console.log(`[WS] Relayed console line: ${payload.data}`);
          }
        } catch {}
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message.toString());
        }
      });

      daemonWs.on('close', (code, reason) => {
        console.log(`Daemon closed console WebSocket: ${code} - ${reason}`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(code, reason.toString());
        }
      });

      daemonWs.on('error', (err) => {
        console.error('Daemon WebSocket Error:', err.message);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'error', data: 'Failed to stream from daemon node.' }));
        }
      });

      ws.on('message', (message) => {
        // Forward client commands/messages to daemon
        try {
          const parsed = JSON.parse(message.toString());
          if (daemonWs.readyState === WebSocket.OPEN) {
            daemonWs.send(JSON.stringify(parsed));
          }
        } catch (e) {
          // Send raw if not JSON
          if (daemonWs.readyState === WebSocket.OPEN) {
            daemonWs.send(JSON.stringify({ event: 'command', data: message.toString() }));
          }
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected console stream for ${serverUuid}`);
        if (daemonWs.readyState === WebSocket.OPEN || daemonWs.readyState === WebSocket.CONNECTING) {
          daemonWs.close();
        }
      });

    } catch (err: any) {
      console.error('WebSocket connection error:', err.message);
      ws.send(JSON.stringify({ event: 'error', data: 'Invalid or expired token.' }));
      ws.close(4003);
    }
  });
};
