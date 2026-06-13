import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/db';

export const registerNode = async (req: Request, res: Response) => {
  const { name, ipAddress, port } = req.body;

  if (!name || !ipAddress) {
    return res.status(400).json({ error: 'Name and IP address are required.' });
  }

  try {
    const token = crypto.randomBytes(32).toString('hex');

    const node = await prisma.node.create({
      data: {
        name,
        ipAddress,
        port: port ? parseInt(port, 10) : 3001,
        token
      }
    });

    return res.status(201).json({
      message: 'Node registered successfully.',
      node: {
        id: node.id,
        name: node.name,
        ipAddress: node.ipAddress,
        port: node.port,
        token // Return the token ONCE during registration so they can configure their daemon
      }
    });
  } catch (error) {
    console.error('Node registration error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

export const getNodes = async (req: Request, res: Response) => {
  try {
    const nodes = await prisma.node.findMany({
      include: {
        _count: {
          select: { servers: true }
        }
      }
    });
    return res.json(nodes);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

export const deleteNode = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await prisma.node.delete({
      where: { id }
    });
    return res.json({ message: 'Node deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete node.' });
  }
};

export const heartbeat = async (req: any, res: Response) => {
  const nodeId = req.node?.id;

  if (!nodeId) {
    return res.status(400).json({ error: 'Node ID missing from token details.' });
  }

  try {
    await prisma.node.update({
      where: { id: nodeId },
      data: {
        lastHeartbeat: new Date(),
        isHealthy: true
      }
    });

    return res.json({ success: true, message: 'Heartbeat received.' });
  } catch (error) {
    return res.status(500).json({ error: 'Heartbeat update failed.' });
  }
};
