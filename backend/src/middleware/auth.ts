import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'pilotpanel-super-secret-key-12345';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  node?: {
    id: string;
    name: string;
  };
}

export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  let token = '';
  
  if (req.headers.authorization) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token.toString();
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        email: string;
        role: string;
      };

      // Check if user is banned or suspended
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { isBanned: true, isSuspended: true }
      });

      if (!user || user.isBanned || user.isSuspended) {
        return res.status(403).json({ error: 'User account is suspended, banned, or does not exist.' });
      }

      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
  } else {
    return res.status(401).json({ error: 'Authorization token is missing.' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }

    next();
  };
};

export const authenticateNode = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const nodeToken = req.headers['x-node-token'] || req.headers['authorization']?.toString().split(' ')[1];

  if (!nodeToken) {
    return res.status(401).json({ error: 'Node token is missing.' });
  }

  try {
    const node = await prisma.node.findFirst({
      where: { token: nodeToken as string }
    });

    if (!node) {
      return res.status(403).json({ error: 'Invalid node token.' });
    }

    if (!node.isHealthy) {
      // Still allow requests, but log or handle
    }

    req.node = {
      id: node.id,
      name: node.name
    };
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to authenticate node.' });
  }
};
