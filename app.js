import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import config from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

// Import routes
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import projectsRoutes from './routes/projects.js';
import contributionsRoutes from './routes/contributions.js';
import badgesRoutes from './routes/badges.js';
import mentorshipRoutes from './routes/mentorship.js';
import aiRoutes from './routes/ai.js';
import emailsRoutes from './routes/emails.js';
import settingsRoutes from './routes/settings.js';

// Initialize express app
const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: config.frontendUrl,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(helmet()); // Set security headers
app.use(cors({
  origin: config.frontendUrl,
  credentials: true
}));
app.use(compression()); // Compress responses
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Middleware to normalize API paths and handle duplicate prefixes
app.use((req, res, next) => {
  // Log the original request URL for debugging
  logger.debug(`Original request URL: ${req.url}`);
  
  // Store the original URL for comparison
  const originalUrl = req.url;
  
  // Normalize the URL by repeatedly replacing duplicated prefixes
  while (req.url.match(/\/api\/v1(\/api\/v1)+/)) {
    req.url = req.url.replace(/\/api\/v1(\/api\/v1)+/, '/api/v1');
  }
  
  // Replace more specific occurrences
  if (req.url.includes('/api.v1/api/v1/')) {
    req.url = req.url.replace('/api.v1/api/v1/', '/api/v1/');
  }
  
  if (req.url.includes('/api/v1/api.v1/')) {
    req.url = req.url.replace('/api/v1/api.v1/', '/api/v1/');
  }
  
  // Log if the URL was changed
  if (req.url !== originalUrl) {
    logger.info(`Fixed API path: ${originalUrl} → ${req.url}`);
    // Log additional information to help debug the source
    logger.debug(`Request origin: ${req.headers.origin || 'Unknown'}`);
    logger.debug(`Referrer: ${req.headers.referer || 'Unknown'}`);
    logger.debug(`User-Agent: ${req.headers['user-agent'] || 'Unknown'}`);
  }
  
  next();
});

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OpenElevate API',
      version: '1.0.0',
      description: 'API for OpenElevate platform - connecting developers with open source projects',
    },
    servers: [
      {
        url: `http://localhost:${config.port}/api/v1`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js'], // Path to the API routes folder
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/projects', projectsRoutes);
app.use('/api/v1/contributions', contributionsRoutes);
app.use('/api/v1/badges', badgesRoutes);
app.use('/api/v1/mentorship', mentorshipRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/emails', emailsRoutes);
app.use('/api/v1/settings', settingsRoutes);

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Welcome to OpenElevate API', 
    documentation: '/api-docs' 
  });
});

// Socket.io connection handler
io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);
  
  // Handle joining personal room for notifications
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    logger.info(`User ${userId} joined personal room`);
  });
  
  // Handle chat messages
  socket.on('send-message', (data) => {
    const { receiverId, message } = data;
    io.to(`user-${receiverId}`).emit('receive-message', message);
  });
  
  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Export for server.js
export { app, httpServer, io };