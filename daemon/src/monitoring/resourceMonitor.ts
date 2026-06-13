import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';
import { getVolumePath } from '../docker/containerManager';

const docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });

export interface ServerStats {
  cpuUsage: number; // percentage
  memoryUsage: number; // MB
  memoryLimit: number; // MB
  diskUsage: number; // MB
  networkRx: number; // bytes
  networkTx: number; // bytes
}

// Calculate directory size
const getDirSize = (dirPath: string): number => {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const files = fs.readdirSync(dirPath);

  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(dirPath, files[i]);
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += stats.size;
      }
    } catch {}
  }
  return size;
};

export const getServerStats = async (serverUuid: string, containerId?: string): Promise<ServerStats> => {
  const diskBytes = getDirSize(getVolumePath(serverUuid));
  const diskUsageMb = Math.round(diskBytes / (1024 * 1024));

  if (!containerId) {
    return {
      cpuUsage: 0,
      memoryUsage: 0,
      memoryLimit: 1024,
      diskUsage: diskUsageMb,
      networkRx: 0,
      networkTx: 0
    };
  }

  const container = docker.getContainer(containerId);

  try {
    const statsStream = await container.stats({ stream: false });
    const stats = statsStream as any;

    // CPU Calculation (Unix & Windows standard container stats)
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

    return {
      cpuUsage: parseFloat(cpuPercent.toFixed(1)),
      memoryUsage: memoryUsageMb,
      memoryLimit: memoryLimitMb,
      diskUsage: diskUsageMb,
      networkRx,
      networkTx
    };
  } catch (error) {
    // If docker stats fails (container offline/starting)
    return {
      cpuUsage: 0,
      memoryUsage: 0,
      memoryLimit: 1024,
      diskUsage: diskUsageMb,
      networkRx: 0,
      networkTx: 0
    };
  }
};
