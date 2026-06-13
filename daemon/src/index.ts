import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import url from 'url';
import dotenv from 'dotenv';
import axios from 'axios';
import Docker from 'dockerode';
import {
  createServerContainer,
  containerPowerAction,
  deleteContainer,
  getVolumePath
} from './docker/containerManager';
import {
  listFiles,
  readFileContent,
  writeFileContent,
  deleteFileOrFolder,
  renameOrMoveFile,
  zipFiles,
  unzipFile
} from './server-manager/fileManager';
import { getServerStats } from './monitoring/resourceMonitor';

dotenv.config();

const docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });

const app = express();
const port = process.env.PORT || 3001;
const nodeToken = process.env.NODE_TOKEN || 'daemon-default-secret-key-99999';
const panelUrl = process.env.PANEL_URL || 'http://localhost:3000';

app.use(cors({ origin: '*' }));
app.use(express.json());

// Token Authentication Middleware
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['x-node-token'] || req.headers['authorization']?.toString().split(' ')[1];
  
  if (!token || token !== nodeToken) {
    return res.status(403).json({ error: 'Unauthorized: Invalid daemon secret token.' });
  }
  next();
};

app.use(authenticateToken);

// Create server container
app.post('/api/servers', async (req: Request, res: Response) => {
  try {
    const result = await createServerContainer(req.body);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Power action controls
app.post('/api/servers/:uuid/power', async (req: Request, res: Response) => {
  const { uuid } = req.params;
  const { action } = req.body;
  try {
    const result = await containerPowerAction(uuid, action);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Delete server
app.delete('/api/servers/:uuid', async (req: Request, res: Response) => {
  const { uuid } = req.params;
  try {
    await deleteContainer(uuid);
    return res.json({ success: true, message: 'Server destroyed successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// File Manager routes
app.get('/api/servers/:uuid/files', (req: Request, res: Response) => {
  try {
    const relativePath = req.query.path?.toString() || '';
    const files = listFiles(req.params.uuid, relativePath);
    return res.json(files);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/servers/:uuid/files/read', (req: Request, res: Response) => {
  try {
    const { path } = req.body;
    const content = readFileContent(req.params.uuid, path);
    return res.json({ content });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/servers/:uuid/files/write', (req: Request, res: Response) => {
  try {
    const { path, content } = req.body;
    const result = writeFileContent(req.params.uuid, path, content);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/servers/:uuid/files', (req: Request, res: Response) => {
  try {
    const { path } = req.body;
    const result = deleteFileOrFolder(req.params.uuid, path);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/servers/:uuid/files/rename', (req: Request, res: Response) => {
  try {
    const { oldPath, newPath } = req.body;
    const result = renameOrMoveFile(req.params.uuid, oldPath, newPath);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/servers/:uuid/files/zip', async (req: Request, res: Response) => {
  try {
    const { path: folderPath, archiveName } = req.body;
    await zipFiles(req.params.uuid, folderPath, archiveName);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/servers/:uuid/files/unzip', async (req: Request, res: Response) => {
  try {
    const { archivePath, extractFolder } = req.body;
    await unzipFile(req.params.uuid, archivePath, extractFolder);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Setup HTTP & WS Relay
const httpServer = createHttpServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle WS upgrade securely
httpServer.on('upgrade', (request, socket, head) => {
  const parsedUrl = url.parse(request.url || '', true);
  const pathname = parsedUrl.pathname || '';
  const token = parsedUrl.query.token as string;

  if (pathname.includes('/console') && token === nodeToken) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (ws: WebSocket, request) => {
  const pathname = url.parse(request.url || '').pathname || '';
  // Extract server uuid: e.g. /api/servers/SERVER_UUID/console -> matches SERVER_UUID
  const parts = pathname.split('/');
  const serverUuid = parts[3];

  if (!serverUuid) {
    ws.send(JSON.stringify({ event: 'error', data: 'Server UUID missing.' }));
    ws.close();
    return;
  }

  const containerName = `pilotpanel-${serverUuid}`;
  const container = docker.getContainer(containerName);

  let stream: any = null;

  const attachToContainer = async () => {
    try {
      const info = await container.inspect();
      if (!info.State.Running) {
        ws.send(JSON.stringify({ event: 'status', data: 'offline' }));
        return;
      }

      ws.send(JSON.stringify({ event: 'status', data: 'online' }));

      // Attach container I/O streams
      stream = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true
      });

      // Stream stdout/stderr to WebSocket
      stream.on('data', (chunk: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'console', data: chunk.toString() }));
        }
      });

      stream.on('end', () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'status', data: 'offline' }));
        }
      });

    } catch (err: any) {
      console.warn(`Failed to attach container stream (is it offline?): ${err.message}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: 'status', data: 'offline' }));
      }
    }
  };

  await attachToContainer();

  // Monitor metrics periodically
  const statsTimer = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      const containerInfo = await container.inspect();
      const containerId = containerInfo.State.Running ? container.id : undefined;
      const stats = await getServerStats(serverUuid, containerId);

      ws.send(JSON.stringify({
        event: 'stats',
        data: stats
      }));
    } catch {
      // Container might not be created or running
    }
  }, 2500);

  ws.on('message', async (message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (payload.event === 'command') {
        const cmd = payload.data;
        // If console stream isn't connected, try starting it
        if (!stream) {
          await attachToContainer();
        }
        if (stream) {
          stream.write(cmd + '\n');
        }
      }
    } catch {
      // Handle raw buffer as command
      if (stream) {
        stream.write(message.toString() + '\n');
      }
    }
  });

  ws.on('close', () => {
    clearInterval(statsTimer);
    if (stream) {
      stream.end();
    }
  });
});

// Periodic heartbeats to panel
const sendHeartbeat = async () => {
  try {
    await axios.post(`${panelUrl}/api/nodes/heartbeat`, {}, {
      headers: {
        'x-node-token': nodeToken
      }
    });
    console.log('Successfully sent heartbeat status to PilotPanel.');
  } catch (error: any) {
    console.warn('Failed to submit node heartbeat status to PilotPanel:', error.message);
  }
};

setInterval(sendHeartbeat, 30000); // Heartbeat every 30 seconds
setTimeout(sendHeartbeat, 5000); // Initial heartbeat after 5 seconds

httpServer.listen(port, () => {
  console.log(`PilotDaemon agent listening on port ${port}`);
});
