import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root (jira-kpi-dashboard/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import mongoose from 'mongoose';

import { logger } from './utils/logger';
import { jiraRoutes } from './routes/jiraRoutes';
import { worklogRoutes } from './routes/worklogRoutes';
import { healthRoutes } from './routes/healthRoutes';
import { authRoutes } from './routes/authRoutes';
import { brevoRoutes } from './routes/brevoRoutes';
import { mondayRoutes } from './routes/mondayRoutes';
import { setupSocketHandlers } from './websocket/socketHandler';
import { swaggerSpec } from './config/swagger';
import { schedulerService } from './services/schedulerService';
import { Role } from './domain/user/entities/Role';

// MongoDB connection
const connectMongoDB = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/jira-kpi';
  
  try {
    await mongoose.connect(mongoUri);
    logger.info('MongoDB connected successfully');
    // Seed default roles (create or update)
    const defaultRoles = [
      {
        name: 'Utilisateur',
        pageVisibilities: {
          dashboard: true,
          users: false,
          support: false,
          epics: false,
          marketing: false,
          produit: false,
          gestionUtilisateurs: false
        }
      },
      {
        name: 'Dev',
        pageVisibilities: {
          dashboard: true,
          users: false,
          support: true,
          epics: false,
          marketing: false,
          produit: false,
          gestionUtilisateurs: false
        }
      },
      {
        name: 'PO',
        pageVisibilities: {
          dashboard: true,
          users: true,
          support: false,
          epics: true,
          marketing: false,
          produit: false,
          gestionUtilisateurs: false
        }
      },
      {
        name: 'Product',
        pageVisibilities: {
          dashboard: true,
          users: false,
          support: false,
          epics: false,
          marketing: false,
          produit: true,
          gestionUtilisateurs: false
        }
      },
      {
        name: 'Marketing',
        pageVisibilities: {
          dashboard: true,
          users: false,
          support: false,
          epics: false,
          marketing: true,
          produit: false,
          gestionUtilisateurs: false
        }
      }
    ];
    for (const r of defaultRoles) {
      await Role.findOneAndUpdate(
        { name: r.name },
        { $set: { name: r.name, pageVisibilities: r.pageVisibilities } },
        { upsert: true }
      );
    }
    logger.info('Default roles seeded: Utilisateur, Dev, PO, Product, Marketing');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    // Continue without MongoDB - auth features will be unavailable
    logger.warn('Authentication features will be unavailable');
  }
};

connectMongoDB();

const app = express();
const httpServer = createServer(app);

// Socket.io configuration
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : ['http://localhost:3000', 'http://localhost:3001'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Jira KPI Dashboard API'
}));

app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/jira', jiraRoutes);
app.use('/api/worklog', worklogRoutes);
app.use('/api/brevo', brevoRoutes);
app.use('/api/monday', mondayRoutes);

// Setup WebSocket handlers
setupSocketHandlers(io);
app.set('io', io);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || '127.0.0.1';

httpServer.listen(PORT, HOST, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`WebSocket server ready`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`API docs available at http://${HOST}:${PORT}/api-docs`);
  logger.info(`Jira URL configured: ${process.env.JIRA_URL ? '✓' : '✗ MISSING'}`);
  logger.info(`Jira Projects: ${process.env.JIRA_PROJECT_KEY || 'Not configured'}`);
  
  // Initialize scheduler for automatic sync with WebSocket notifications
  schedulerService.initialize(io);
});

export { io };
