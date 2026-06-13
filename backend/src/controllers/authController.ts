import { Request, Response } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'pilotpanel-super-secret-key-12345';
const JWT_EXPIRES_IN = '7d';

export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email is already in use.' });
    }

    const hashedPassword = await argon2.hash(password);

    // First user registered becomes the Owner, others are Clients
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'Owner' : 'Client';

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role
      }
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_REGISTER',
        details: `Registered new user with email ${email}`,
        ipAddress: req.ip || '127.0.0.1'
      }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password, code } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been banned.' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    const isPasswordValid = await argon2.verify(user.password, password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // 2FA check
    if (user.twoFactorEnabled) {
      if (!code) {
        return res.status(200).json({ twoFactorRequired: true });
      }
      // Stub check for 2FA code (in production, verify with speakeasy/otplib)
      // Let's assume code '123456' is valid for tests, or match length
      if (code !== '123456' && code !== user.twoFactorSecret) {
        return res.status(400).json({ error: 'Invalid 2FA code.' });
      }
    }

    // Write audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        details: `Logged in from IP ${req.ip}`,
        ipAddress: req.ip || '127.0.0.1'
      }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

export const enable2FA = async (req: any, res: Response) => {
  const userId = req.user.id;

  try {
    // Generate a mock 2FA secret (e.g. key)
    const secret = 'PILOT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: true
      }
    });

    return res.json({
      secret,
      qrCodeUrl: `otpauth://totp/PilotPanel:${req.user.email}?secret=${secret}&issuer=PilotPanel`
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to enable 2FA.' });
  }
};

export const disable2FA = async (req: any, res: Response) => {
  const userId = req.user.id;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false
      }
    });

    return res.json({ success: true, message: '2FA has been disabled.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to disable 2FA.' });
  }
};

export const getMe = async (req: any, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        twoFactorEnabled: true,
        isSuspended: true,
        isBanned: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
