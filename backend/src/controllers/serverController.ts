import { Response } from 'express';
import axios from 'axios';
import prisma from '../config/db';
import { AuthenticatedRequest } from '../middleware/auth';

// Helper to make request to PilotDaemon
const daemonRequest = async (node: any, method: string, path: string, data?: any) => {
  const url = `http://${node.ipAddress}:${node.port}${path}`;
  try {
    const response = await axios({
      method,
      url,
      data,
      headers: {
        'x-node-token': node.token,
        'Content-Type': 'application/json'
      },
      timeout: 600000 // 10 minutes timeout
    });
    return response.data;
  } catch (error: any) {
    console.error(`Daemon request failed to ${url}:`, error.message);
    throw new Error(error.response?.data?.error || 'Daemon connection failed.');
  }
};

export const createServer = async (req: AuthenticatedRequest, res: Response) => {
  const { name, nodeId, cpuLimit, memoryLimit, diskLimit, port, software, version, userId } = req.body;

  if (!name || !nodeId || !port || !software || !version || !userId) {
    return res.status(400).json({ error: 'Missing required server configuration parameters.' });
  }

  // Check role: Client cannot create servers directly unless they purchased a plan (handled via billing/admin)
  if (req.user?.role === 'Client' && req.user.id !== userId) {
    return res.status(403).json({ error: 'You are not authorized to create servers for other users.' });
  }

  try {
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) {
      return res.status(404).json({ error: 'Target node not found.' });
    }

    // Verify port uniqueness
    const portExists = await prisma.server.findUnique({ where: { port: parseInt(port, 10) } });
    if (portExists) {
      return res.status(400).json({ error: 'Server port is already in use.' });
    }

    const server = await prisma.server.create({
      data: {
        name,
        nodeId,
        cpuLimit: parseFloat(cpuLimit || '1.0'),
        memoryLimit: parseInt(memoryLimit || '1024', 10),
        diskLimit: parseInt(diskLimit || '10000', 10),
        port: parseInt(port, 10),
        software,
        version,
        userId,
        status: 'offline'
      }
    });

    // Notify daemon to pull image and setup container
    try {
      const daemonResult = await daemonRequest(node, 'POST', '/api/servers', {
        uuid: server.uuid,
        name: server.name,
        memoryLimit: server.memoryLimit,
        cpuLimit: server.cpuLimit,
        diskLimit: server.diskLimit,
        port: server.port,
        software: server.software,
        version: server.version
      });

      await prisma.server.update({
        where: { id: server.id },
        data: { dockerContainerId: daemonResult.containerId }
      });
    } catch (daemonErr: any) {
      // Rollback database record if daemon fails to create container
      await prisma.server.delete({ where: { id: server.id } });
      return res.status(502).json({ error: `Daemon failed to set up server: ${daemonErr.message}` });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: 'SERVER_CREATE',
        details: `Created server ${server.name} on node ${node.name}`,
        ipAddress: req.ip || '127.0.0.1'
      }
    });

    return res.status(201).json(server);
  } catch (error) {
    console.error('Server creation error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

export const getServers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    let servers;
    if (req.user?.role === 'Client') {
      servers = await prisma.server.findMany({
        where: { userId: req.user.id },
        include: { node: { select: { name: true, ipAddress: true } } }
      });
    } else {
      servers = await prisma.server.findMany({
        include: {
          node: { select: { name: true, ipAddress: true } },
          user: { select: { email: true } }
        }
      });
    }
    return res.json(servers);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

export const getServerDetail = async (req: AuthenticatedRequest, res: Response) => {
  const { uuid } = req.params;

  try {
    const server = await prisma.server.findUnique({
      where: { uuid },
      include: { node: true }
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    if (req.user?.role === 'Client' && server.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    return res.json(server);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

export const handlePowerAction = async (req: AuthenticatedRequest, res: Response) => {
  const { uuid } = req.params;
  const { action } = req.body; // "start", "stop", "restart", "kill"

  if (!['start', 'stop', 'restart', 'kill'].includes(action)) {
    return res.status(400).json({ error: 'Invalid power action.' });
  }

  try {
    const server = await prisma.server.findUnique({
      where: { uuid },
      include: { node: true }
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    if (req.user?.role === 'Client' && server.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    // Call Daemon
    const result = await daemonRequest(server.node, 'POST', `/api/servers/${uuid}/power`, { action });
    
    // Update local status
    let nextStatus = 'offline';
    if (action === 'start') nextStatus = 'starting';
    if (action === 'stop') nextStatus = 'stopping';
    if (action === 'kill') nextStatus = 'offline';

    await prisma.server.update({
      where: { uuid },
      data: { status: nextStatus }
    });

    return res.json({ success: true, message: `Action ${action} sent to daemon.`, result });
  } catch (error: any) {
    return res.status(502).json({ error: error.message });
  }
};

export const deleteServer = async (req: AuthenticatedRequest, res: Response) => {
  const { uuid } = req.params;

  try {
    const server = await prisma.server.findUnique({
      where: { uuid },
      include: { node: true }
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    if (req.user?.role === 'Client') {
      return res.status(403).json({ error: 'Clients cannot delete servers.' });
    }

    // Call Daemon to delete container and server files
    try {
      await daemonRequest(server.node, 'DELETE', `/api/servers/${uuid}`);
    } catch (daemonErr) {
      console.warn('Daemon failed to delete container, deleting DB record anyway.', daemonErr);
    }

    await prisma.server.delete({ where: { uuid } });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: 'SERVER_DELETE',
        details: `Deleted server ${server.name} (${uuid})`,
        ipAddress: req.ip || '127.0.0.1'
      }
    });

    return res.json({ success: true, message: 'Server deleted.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete server.' });
  }
};

// Relay file manager requests to node
export const fileManagerRelay = async (req: AuthenticatedRequest, res: Response) => {
  const { uuid } = req.params;
  const pathSuffix = req.path.split(`/servers/${uuid}/files`)[1] || '';
  const method = req.method;

  try {
    const server = await prisma.server.findUnique({
      where: { uuid },
      include: { node: true }
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    if (req.user?.role === 'Client' && server.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    const data = await daemonRequest(server.node, method, `/api/servers/${uuid}/files${pathSuffix}`, req.body);
    return res.json(data);
  } catch (error: any) {
    return res.status(502).json({ error: error.message });
  }
};
