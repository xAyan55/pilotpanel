import express from 'express';
import cors from 'cors';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { authenticateJWT, authenticateNode, requireRole } from './middleware/auth';
import { register, login, enable2FA, disable2FA, getMe } from './controllers/authController';
import { registerNode, getNodes, deleteNode, heartbeat } from './controllers/nodeController';
import { createServer, getServers, getServerDetail, handlePowerAction, deleteServer, fileManagerRelay, detectServerAddons } from './controllers/serverController';
import { getPlans, createPlan, getInvoices, createInvoice, processPaymentMock } from './controllers/billingController';
import { searchPlugins, getPopularRecommendations, installPlugin } from './controllers/pluginController';
import { createTicket, getTickets, getTicketDetails, addTicketMessage, getArticles, createArticle } from './controllers/supportController';
import { initWebSocketServer } from './websocket/wsServer';
import prisma from './config/db';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Public Auth routes
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// Authenticated Auth routes
app.get('/api/auth/me', authenticateJWT, getMe);
app.post('/api/auth/2fa/enable', authenticateJWT, enable2FA);
app.post('/api/auth/2fa/disable', authenticateJWT, disable2FA);

// Node routes
app.post('/api/nodes/register', authenticateJWT, requireRole(['Owner', 'Administrator']), registerNode);
app.get('/api/nodes', authenticateJWT, requireRole(['Owner', 'Administrator', 'Support']), getNodes);
app.delete('/api/nodes/:id', authenticateJWT, requireRole(['Owner', 'Administrator']), deleteNode);
app.post('/api/nodes/heartbeat', authenticateNode, heartbeat);

// Server routes
app.post('/api/servers', authenticateJWT, requireRole(['Owner', 'Administrator']), createServer);
app.get('/api/servers', authenticateJWT, getServers);
app.get('/api/servers/:uuid', authenticateJWT, getServerDetail);
app.get('/api/servers/:uuid/detect', authenticateJWT, detectServerAddons);
app.post('/api/servers/:uuid/power', authenticateJWT, handlePowerAction);
app.delete('/api/servers/:uuid', authenticateJWT, requireRole(['Owner', 'Administrator']), deleteServer);

// Relayed File Manager endpoints (relayed directly to node daemon)
app.all('/api/servers/:uuid/files*', authenticateJWT, fileManagerRelay);

// Billing routes
app.get('/api/billing/plans', authenticateJWT, getPlans);
app.post('/api/billing/plans', authenticateJWT, requireRole(['Owner', 'Administrator']), createPlan);
app.get('/api/billing/invoices', authenticateJWT, getInvoices);
app.post('/api/billing/invoices', authenticateJWT, createInvoice);
app.post('/api/billing/invoices/:invoiceId/pay', authenticateJWT, processPaymentMock);

// Plugin / Mod routes
app.get('/api/plugins/search', authenticateJWT, searchPlugins);
app.get('/api/plugins/popular', authenticateJWT, getPopularRecommendations);
app.post('/api/servers/:uuid/plugins/install', authenticateJWT, installPlugin);

// Support & Knowledge Base routes
app.post('/api/support/tickets', authenticateJWT, createTicket);
app.get('/api/support/tickets', authenticateJWT, getTickets);
app.get('/api/support/tickets/:id', authenticateJWT, getTicketDetails);
app.post('/api/support/tickets/:id/messages', authenticateJWT, addTicketMessage);
app.get('/api/support/kb', authenticateJWT, getArticles);
app.post('/api/support/kb', authenticateJWT, requireRole(['Owner', 'Administrator', 'Support']), createArticle);

// Dashboard statistics
app.get('/api/dashboard/stats', authenticateJWT, async (req: any, res) => {
  try {
    const serversCount = await prisma.server.count();
    const runningServersCount = await prisma.server.count({ where: { status: 'online' } });
    const nodesCount = await prisma.node.count();
    
    // Sum total resources
    const servers = await prisma.server.findMany();
    const totalRam = servers.reduce((acc: number, s: any) => acc + s.memoryLimit, 0);
    const totalCpu = servers.reduce((acc: number, s: any) => acc + s.cpuLimit, 0);

    return res.json({
      totalServers: serversCount,
      runningServers: runningServersCount,
      totalNodes: nodesCount,
      totalRam,
      totalCpu,
      networkUsage: '14.2 GB/s',
      activeNodes: nodesCount
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch dashboard stats.' });
  }
});

// Admin System Logs
app.get('/api/admin/audit-logs', authenticateJWT, requireRole(['Owner', 'Administrator', 'Support']), async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch logs.' });
  }
});

// Serve frontend static assets
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Create HTTP Server
const httpServer = createHttpServer(app);

// Bind WebSocket handler
initWebSocketServer(httpServer);

httpServer.listen(port, () => {
  console.log(`PilotPanel Backend listening at http://localhost:${port}`);
});
