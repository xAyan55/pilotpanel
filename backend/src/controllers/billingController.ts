import { Response } from 'express';
import prisma from '../config/db';
import { AuthenticatedRequest } from '../middleware/auth';

export const getPlans = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const plans = await prisma.billingPlan.findMany();
    return res.json(plans);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch plans.' });
  }
};

export const createPlan = async (req: AuthenticatedRequest, res: Response) => {
  const { name, ram, cpu, disk, price, billingCycle } = req.body;

  if (!name || !ram || !cpu || !disk || !price || !billingCycle) {
    return res.status(400).json({ error: 'Missing plan configuration.' });
  }

  try {
    const plan = await prisma.billingPlan.create({
      data: {
        name,
        ram: parseInt(ram, 10),
        cpu: parseFloat(cpu),
        disk: parseInt(disk, 10),
        price: parseFloat(price),
        billingCycle
      }
    });

    return res.status(201).json(plan);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create plan.' });
  }
};

export const getInvoices = async (req: AuthenticatedRequest, res: Response) => {
  try {
    let invoices;
    if (req.user?.role === 'Client') {
      invoices = await prisma.invoice.findMany({
        where: { userId: req.user.id }
      });
    } else {
      invoices = await prisma.invoice.findMany({
        include: { user: { select: { email: true } } }
      });
    }
    return res.json(invoices);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch invoices.' });
  }
};

export const createInvoice = async (req: AuthenticatedRequest, res: Response) => {
  const { amount, gateway } = req.body;

  if (!amount || !gateway) {
    return res.status(400).json({ error: 'Amount and gateway are required.' });
  }

  try {
    const invoice = await prisma.invoice.create({
      data: {
        userId: req.user!.id,
        amount: parseFloat(amount),
        status: 'unpaid',
        gateway
      }
    });

    return res.status(201).json(invoice);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create invoice.' });
  }
};

export const processPaymentMock = async (req: AuthenticatedRequest, res: Response) => {
  const { invoiceId } = req.params;
  const { paymentId } = req.body;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    if (req.user?.role === 'Client' && invoice.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'paid',
        paymentId: paymentId || `pay_${Math.random().toString(36).substring(2, 12)}`
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: 'INVOICE_PAY',
        details: `Invoice ${invoiceId} marked paid via mock gateway`,
        ipAddress: req.ip || '127.0.0.1'
      }
    });

    return res.json({ success: true, invoice: updatedInvoice });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to process payment.' });
  }
};
