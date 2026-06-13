import Docker from 'dockerode';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { getVolumePath } from '../docker/containerManager';

const docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });

export interface LogLine {
  type: 'stdout' | 'stderr' | 'system';
  text: string;
  time: number;
}

export interface MetricStats {
  cpuUsage: number;
  memoryUsage: number;
  memoryLimit: number;
  diskUsage: number;
  networkRx: number;
  networkTx: number;
}

// Non-blocking async directory size calculator
const getDirSizeAsync = async (dirPath: string): Promise<number> => {
  let size = 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    // Process in parallel tasks
    const tasks = files.map(async (file) => {
      const filePath = path.join(dirPath, file.name);
      try {
        const stats = await fs.promises.stat(filePath);
        if (file.isDirectory()) {
          const subSize = await getDirSizeAsync(filePath);
          size += subSize;
        } else {
          size += stats.size;
        }
      } catch {}
    });
    
    await Promise.all(tasks);
  } catch {}
  return size;
};

export class ServerSession {
  public serverUuid: string;
  public logs: LogLine[] = [];
  public clients: Set<WebSocket> = new Set();
  
  private container: Docker.Container;
  private attachStream: any = null;
  private statsStream: any = null;
  private isAttaching = false;
  private isStatsStreaming = false;
  
  private diskUsageMb = 0;
  private lastDiskCheck = 0;
  private lastStats: MetricStats | null = null;

  constructor(serverUuid: string) {
    this.serverUuid = serverUuid;
    this.container = docker.getContainer(`pilotpanel-${serverUuid}`);
    
    // Pre-calculate disk space immediately
    this.updateDiskUsage();
    
    // Start continuous log capture in background
    this.startLoggingStream();
  }

  public addClient(ws: WebSocket) {
    this.clients.add(ws);
    
    // Send 1000 logs history first
    ws.send(JSON.stringify({ event: 'history', data: this.logs }));
    
    // Push last known stats if available
    if (this.lastStats) {
      ws.send(JSON.stringify({ event: 'stats', data: this.lastStats }));
    }
    
    // Start streaming stats if not already active
    this.startStatsStream();
  }

  public removeClient(ws: WebSocket) {
    this.clients.delete(ws);
    
    // Stop stats streaming if no clients are listening
    if (this.clients.size === 0) {
      this.stopStatsStream();
    }
  }

  public sendCommand(cmd: string) {
    if (this.attachStream && typeof this.attachStream.write === 'function') {
      try {
        this.attachStream.write(cmd + '\n');
        this.appendLog('system', `> ${cmd}`);
      } catch (err: any) {
        this.appendLog('system', `[System] Failed to write command: ${err.message}`);
      }
    } else {
      this.appendLog('system', '[System] Cannot send command: Server console is offline.');
    }
  }

  private appendLog(type: 'stdout' | 'stderr' | 'system', text: string) {
    // Keep clean log line, stripping any double line terminators
    const cleanText = text.replace(/[\r\n]+$/, '');
    const logItem: LogLine = {
      type,
      text: cleanText,
      time: Date.now()
    };
    
    this.logs.push(logItem);
    if (this.logs.length > 1000) {
      this.logs.shift(); // Keep size capped at 1000
    }

    console.log(`[WS] Sending console line: ${cleanText}`);
    // Broadcast to ws clients
    this.broadcast('console', cleanText);
  }

  private broadcast(event: string, data: any) {
    const message = JSON.stringify({ event, data });
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  public async startLoggingStream() {
    if (this.isAttaching) return;
    this.isAttaching = true;

    const tryConnect = async () => {
      try {
        const info = await this.container.inspect();
        if (!info.State.Running) {
          this.broadcast('status', 'offline');
          this.isAttaching = false;
          return;
        }

        const hasTty = info.Config.Tty;
        console.log(`[CONSOLE] Container pilotpanel-${this.serverUuid} is running. Tty = ${hasTty}`);
        this.broadcast('status', 'online');
        
        // Attach Docker socket with demuxing or raw stream enabled
        this.attachStream = await this.container.attach({
          stream: true,
          stdin: true,
          stdout: true,
          stderr: true,
          logs: true,
          tail: 1000
        } as any);

        if (hasTty) {
          let stdoutBuffer = '';
          this.attachStream.on('data', (chunk: Buffer) => {
            const rawText = chunk.toString('utf8');
            stdoutBuffer += rawText;
            let idx;
            while ((idx = stdoutBuffer.indexOf('\n')) !== -1) {
              const line = stdoutBuffer.substring(0, idx);
              stdoutBuffer = stdoutBuffer.substring(idx + 1);
              console.log(`[CONSOLE] Received log line: ${line}`);
              this.appendLog('stdout', line);
            }
          });
        } else {
          // Demux Docker Multiplexed Frame header
          let streamBuffer = Buffer.alloc(0);
          let stdoutBuffer = '';
          let stderrBuffer = '';

          this.attachStream.on('data', (chunk: Buffer) => {
            streamBuffer = Buffer.concat([streamBuffer, chunk]);

            while (streamBuffer.length >= 8) {
              const type = streamBuffer.readUInt8(0);
              const size = streamBuffer.readUInt32BE(4);

              if (streamBuffer.length < 8 + size) {
                break; // Wait for the whole payload
              }

              const payload = streamBuffer.subarray(8, 8 + size).toString('utf8');
              streamBuffer = streamBuffer.subarray(8 + size);

              if (type === 1) { // stdout
                stdoutBuffer += payload;
                let idx;
                while ((idx = stdoutBuffer.indexOf('\n')) !== -1) {
                  const line = stdoutBuffer.substring(0, idx);
                  stdoutBuffer = stdoutBuffer.substring(idx + 1);
                  console.log(`[CONSOLE] Received log line (stdout): ${line}`);
                  this.appendLog('stdout', line);
                }
              } else if (type === 2) { // stderr
                stderrBuffer += payload;
                let idx;
                while ((idx = stderrBuffer.indexOf('\n')) !== -1) {
                  const line = stderrBuffer.substring(0, idx);
                  stdoutBuffer = stderrBuffer.substring(idx + 1);
                  console.log(`[CONSOLE] Received log line (stderr): ${line}`);
                  this.appendLog('stderr', line);
                }
              }
            }
          });
        }

        this.attachStream.on('end', () => {
          this.attachStream = null;
          this.broadcast('status', 'offline');
          // Retry attach after a delay (e.g. server restarted)
          setTimeout(() => {
            this.isAttaching = false;
            this.startLoggingStream();
          }, 3000);
        });

        this.attachStream.on('error', (err: any) => {
          console.warn(`Attach stream error: ${err.message}`);
          this.attachStream = null;
          this.broadcast('status', 'offline');
          setTimeout(() => {
            this.isAttaching = false;
            this.startLoggingStream();
          }, 5000);
        });

      } catch (err: any) {
        // Container might be stopped or not yet initialized
        this.broadcast('status', 'offline');
        this.attachStream = null;
        setTimeout(() => {
          this.isAttaching = false;
          this.startLoggingStream();
        }, 5000);
      }
    };

    await tryConnect();
  }

  private async updateDiskUsage() {
    const now = Date.now();
    // Throttle disk checks to once every 10 seconds to save IOPS
    if (now - this.lastDiskCheck < 10000) return;
    this.lastDiskCheck = now;
    
    try {
      const bytes = await getDirSizeAsync(getVolumePath(this.serverUuid));
      this.diskUsageMb = Math.round(bytes / (1024 * 1024));
    } catch {}
  }

  public async startStatsStream() {
    if (this.isStatsStreaming) return;
    this.isStatsStreaming = true;

    const runStats = async () => {
      try {
        const info = await this.container.inspect();
        if (!info.State.Running) {
          this.isStatsStreaming = false;
          return;
        }

        this.statsStream = await this.container.stats({ stream: true });
        
        let buffer = '';
        this.statsStream.on('data', async (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          let idx;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, idx).trim();
            buffer = buffer.substring(idx + 1);
            if (!line) continue;

            try {
              const stats = JSON.parse(line);
              
              // CPU Calculation
              let cpuPercent = 0;
              if (stats.cpu_stats && stats.precpu_stats) {
                const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
                const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
                const numCores = stats.cpu_stats.online_cpus || 1;
                if (systemDelta > 0 && cpuDelta > 0) {
                  cpuPercent = (cpuDelta / systemDelta) * numCores * 100;
                }
              }

              // Memory Calculation
              let memoryUsageMb = 0;
              let memoryLimitMb = 1024;
              if (stats.memory_stats) {
                const usage = stats.memory_stats.usage || 0;
                const limit = stats.memory_stats.limit || 1024 * 1024 * 1024;
                memoryUsageMb = Math.round(usage / (1024 * 1024));
                memoryLimitMb = Math.round(limit / (1024 * 1024));
              }

              // Network Calculation
              let networkRx = 0;
              let networkTx = 0;
              if (stats.networks) {
                Object.keys(stats.networks).forEach((net) => {
                  networkRx += stats.networks[net].rx_bytes || 0;
                  networkTx += stats.networks[net].tx_bytes || 0;
                });
              }

              // Asynchronously trigger disk size calculation
              this.updateDiskUsage();

              this.lastStats = {
                cpuUsage: parseFloat(cpuPercent.toFixed(1)),
                memoryUsage: memoryUsageMb,
                memoryLimit: memoryLimitMb,
                diskUsage: this.diskUsageMb,
                networkRx,
                networkTx
              };

              this.broadcast('stats', this.lastStats);
            } catch {}
          }
        });

        this.statsStream.on('end', () => {
          this.statsStream = null;
          this.isStatsStreaming = false;
        });

        this.statsStream.on('error', () => {
          this.statsStream = null;
          this.isStatsStreaming = false;
        });

      } catch {
        this.isStatsStreaming = false;
      }
    };

    runStats();
  }

  public stopStatsStream() {
    if (this.statsStream) {
      try {
        this.statsStream.destroy();
      } catch {}
      this.statsStream = null;
    }
    this.isStatsStreaming = false;
  }
}

// Global sessions map
const sessions = new Map<string, ServerSession>();

export const getOrCreateSession = (serverUuid: string): ServerSession => {
  let session = sessions.get(serverUuid);
  if (!session) {
    session = new ServerSession(serverUuid);
    sessions.set(serverUuid, session);
  }
  return session;
};

export const terminateSession = (serverUuid: string) => {
  const session = sessions.get(serverUuid);
  if (session) {
    session.stopStatsStream();
    sessions.delete(serverUuid);
  }
};
