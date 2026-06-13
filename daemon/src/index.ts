import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import url from 'url';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
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
  copyFileOrFolder,
  zipFiles,
  unzipFile
} from './server-manager/fileManager';
import {
  getOrCreateSession,
  terminateSession
} from './server-manager/sessionManager';
import {
  detectServerSoftware,
  detectPlugins,
  detectMods
} from './server-manager/minecraftDetector';

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

// Sandbox Safe Path resolver for upload/download endpoints
const safePath = (serverUuid: string, relativePath: string = '') => {
  const root = getVolumePath(serverUuid);
  const target = path.normalize(path.join(root, relativePath));
  if (!target.startsWith(root)) {
    throw new Error('Access denied: directory traversal detected.');
  }
  return target;
};

// Create server container
app.post('/api/servers', async (req: Request, res: Response) => {
  try {
    const result = await createServerContainer(req.body);
    // Initialize session in background
    getOrCreateSession(req.body.uuid);
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
    
    // Sync session state
    const session = getOrCreateSession(uuid);
    if (action === 'start') {
      setTimeout(() => session.startLoggingStream(), 1000);
    } else if (action === 'stop' || action === 'kill') {
      session.stopStatsStream();
    }
    
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Delete server
app.delete('/api/servers/:uuid', async (req: Request, res: Response) => {
  const { uuid } = req.params;
  try {
    terminateSession(uuid);
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

app.post('/api/servers/:uuid/files/copy', (req: Request, res: Response) => {
  try {
    const { oldPath, newPath } = req.body;
    const result = copyFileOrFolder(req.params.uuid, oldPath, newPath);
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

// Direct Binary Upload Endpoint (streams incoming request buffer directly to disk)
app.post('/api/servers/:uuid/files/upload', (req: Request, res: Response) => {
  try {
    const relativePath = req.query.path?.toString() || '';
    if (!relativePath) {
      return res.status(400).json({ error: 'Missing path query parameter.' });
    }
    const target = safePath(req.params.uuid, relativePath);
    
    // Ensure parent dir exists
    const parent = path.dirname(target);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }

    const writeStream = fs.createWriteStream(target);
    req.pipe(writeStream);

    writeStream.on('finish', () => {
      res.json({ success: true, message: 'File uploaded successfully.' });
    });

    writeStream.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Direct Binary Download Endpoint (streams file from disk to response)
app.get('/api/servers/:uuid/files/download', (req: Request, res: Response) => {
  try {
    const relativePath = req.query.path?.toString() || '';
    if (!relativePath) {
      return res.status(400).json({ error: 'Missing path query parameter.' });
    }
    const target = safePath(req.params.uuid, relativePath);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      return res.status(404).json({ error: 'File not found.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(target)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    const readStream = fs.createReadStream(target);
    readStream.pipe(res);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Download plugin/mod/jar from a live URL
app.post('/api/servers/:uuid/files/download-url', async (req: Request, res: Response) => {
  try {
    const { url: fileUrl, path: destPath } = req.body;
    if (!fileUrl || !destPath) {
      return res.status(400).json({ error: 'URL and destination path are required.' });
    }
    
    const target = safePath(req.params.uuid, destPath);
    
    const parent = path.dirname(target);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }

    const writer = fs.createWriteStream(target);
    const response = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream'
    });
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    return res.json({ success: true, message: 'File downloaded successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Minecraft Detection Endpoint
app.get('/api/servers/:uuid/detect', async (req: Request, res: Response) => {
  const { uuid } = req.params;
  try {
    const softwareInfo = detectServerSoftware(uuid);
    const pluginsList = await detectPlugins(uuid);
    const modsList = await detectMods(uuid);

    return res.json({
      ...softwareInfo,
      plugins: pluginsList,
      mods: modsList
    });
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
  const parts = pathname.split('/');
  const serverUuid = parts[3];

  if (!serverUuid) {
    ws.send(JSON.stringify({ event: 'error', data: 'Server UUID missing.' }));
    ws.close();
    return;
  }

  // Bind to session
  const session = getOrCreateSession(serverUuid);
  session.addClient(ws);

  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (payload.event === 'command') {
        session.sendCommand(payload.data);
      }
    } catch {
      session.sendCommand(message.toString());
    }
  });

  ws.on('close', () => {
    session.removeClient(ws);
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

// Scan folders on startup to active session tracking for already running containers
const initRunningSessions = async () => {
  try {
    const containers = await docker.listContainers();
    containers.forEach((c) => {
      const name = c.Names[0] || '';
      if (name.startsWith('/pilotpanel-')) {
        const uuid = name.replace('/pilotpanel-', '');
        console.log(`Pre-initializing session for running container: ${uuid}`);
        getOrCreateSession(uuid);
      }
    });
  } catch (err: any) {
    console.warn('Failed to list Docker containers on startup:', err.message);
  }
};

httpServer.listen(port, () => {
  console.log(`PilotDaemon agent listening on port ${port}`);
  initRunningSessions();
});
