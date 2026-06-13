import { Request, Response } from 'express';
import prisma from '../config/db';
import { AuthenticatedRequest } from '../middleware/auth';

// Support Tickets
export const createTicket = async (req: AuthenticatedRequest, res: Response) => {
  const { title, category, priority, message } = req.body;

  if (!title || !category || !priority || !message) {
    return res.status(400).json({ error: 'Title, category, priority, and initial message are required.' });
  }

  try {
    const ticket = await prisma.ticket.create({
      data: {
        userId: req.user!.id,
        title,
        category,
        priority,
        status: 'Open',
        messages: {
          create: {
            userId: req.user!.id,
            message,
            isStaffReply: req.user!.role !== 'Client'
          }
        }
      },
      include: {
        messages: true
      }
    });

    return res.status(201).json(ticket);
  } catch (error) {
    console.error('Failed to create ticket:', error);
    return res.status(500).json({ error: 'Failed to create support ticket.' });
  }
};

export const getTickets = async (req: AuthenticatedRequest, res: Response) => {
  try {
    let tickets;
    if (req.user?.role === 'Client') {
      tickets = await prisma.ticket.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      tickets = await prisma.ticket.findMany({
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' }
      });
    }
    return res.json(tickets);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch tickets.' });
  }
};

export const getTicketDetails = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: {
          include: {
            user: { select: { email: true, role: true } }
          },
          orderBy: { createdAt: 'asc' }
        },
        user: { select: { email: true } }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    if (req.user?.role === 'Client' && ticket.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    return res.json(ticket);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch ticket details.' });
  }
};

export const addTicketMessage = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id } });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    if (req.user?.role === 'Client' && ticket.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    const isStaff = req.user!.role !== 'Client';

    const newMessage = await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        userId: req.user!.id,
        message,
        isStaffReply: isStaff
      }
    });

    // Update ticket status
    await prisma.ticket.update({
      where: { id },
      data: {
        status: isStaff ? 'StaffReply' : 'CustomerReply'
      }
    });

    return res.status(201).json(newMessage);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to add message.' });
  }
};

// Knowledge Base Articles
export const getArticles = async (req: Request, res: Response) => {
  try {
    const articles = await prisma.knowledgeBaseArticle.findMany();
    return res.json(articles);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch articles.' });
  }
};

export const createArticle = async (req: AuthenticatedRequest, res: Response) => {
  const { title, content, category } = req.body;

  if (!title || !content || !category) {
    return res.status(400).json({ error: 'Title, content, and category are required.' });
  }

  try {
    const article = await prisma.knowledgeBaseArticle.create({
      data: { title, content, category }
    });
    return res.status(201).json(article);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create article.' });
  }
};
