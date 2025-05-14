import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import passport from 'passport';

import config from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import passportConfig from './config/passport.js';

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

// CRITICAL: Directly patch Express to prevent path-to-regexp crashes
// This is a radical solution to prevent the path-to-regexp errors
try {
  // Find the Express router module
  const Router = express.Router;
  const Layer = Object.getPrototypeOf(Router()).constructor.prototype.constructor;
  
  // Store the original path matching function
  const originalMatch = Layer.prototype.match;
  
  // Override with a safe version that catches all errors
  Layer.prototype.match = function(path) {
    try {
      // Quickly check if the path is problematic before even trying to match
      if (typeof path === 'string' && (
          path.includes('http') || 
          path.includes('://') || 
          path.includes('git.new') || 
          path.includes('www.'))) {
        logger.error(`BLOCKED BAD PATH: ${path}`);
        return false;
      }
      
      // Call the original match function
      return originalMatch.apply(this, arguments);
    } catch (error) {
      // If any error occurs in path matching, log it and fail safely
      logger.error(`Path matching error: ${error.message}`, { path, error });
      return false;
    }
  };
  
  logger.info('Express router patched to prevent path-to-regexp crashes');
} catch (err) {
  logger.error('Failed to patch Express router', err);
}

// Add a process-level exception handler to prevent crashes
process.on('uncaughtException', (err) => {
  // Catch path-to-regexp errors specifically
  if (err.message && err.message.includes('Missing parameter name')) {
    logger.error('Caught path-to-regexp error:', err);
    // Don't crash the entire app - just log and continue
  } else {
    // For other uncaught errors, log them but still allow normal error handling
    logger.error('Uncaught exception:', err);
    // Optionally: process.exit(1) if you want to crash on non-path-to-regexp errors
  }
});

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: [config.frontendUrl, config.productionFrontendUrl],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Add a very early URL sanitization middleware as the FIRST middleware to run
// This will catch malformed URLs before any other middleware or route handling
app.use((req, res, next) => {
  try {
    // Catch problematic URLs that would trigger path-to-regexp errors
    const url = req.url.toString();
    
    // CRITICAL: Specific check for the exact problematic URL pattern
    if (url.includes('git.new/pathToRegexpError') || url === 'https://git.new/pathToRegexpError') {
      logger.error(`BLOCKED KNOWN BAD URL: ${url}`);
      return res.status(400).send('Bad Request - URL not allowed');
    }
    
    // Extensive safety check for URLs that could break path-to-regexp
    if (url.includes('http') || 
        url.includes('://') || 
        url.includes('git.new') || 
        url.includes('www.') || 
        (url.includes(':') && !url.match(/\/:[a-zA-Z0-9_-]+/)) || 
        url.includes('//')) {
      logger.error(`BLOCKED INVALID URL: ${url}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid URL format',
        details: 'The request contains characters or patterns that are not allowed'
      });
    }
  } catch (error) {
    logger.error('Error in URL sanitization middleware:', error);
    return res.status(400).send('Bad Request');
  }
  
  next();
});

// Middleware
// Configure helmet with adjusted settings to work with CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Enhanced CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [config.frontendUrl, config.productionFrontendUrl, 'https://open-elevate-frontend.vercel.app'];
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(null, true); // Temporarily allow all origins while debugging
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  credentials: true,
  maxAge: 86400, // 24 hours
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(compression()); // Compress responses
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Initialize Passport
app.use(passport.initialize());

// Middleware to normalize API paths and handle duplicate prefixes
app.use((req, res, next) => {
  // Log the original request URL for debugging
  logger.debug(`Original request URL: ${req.url}`);
  
  // Store the original URL for comparison
  const originalUrl = req.url;
  
  // First, safely decode the URL to handle encoded characters
  try {
    req.url = decodeURIComponent(req.url);
  } catch (e) {
    logger.warn(`Invalid URL encoding: ${req.url}`);
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid URL encoding'
    });
  }
  
  // SECURITY: Block problematic URLs that would cause path-to-regexp errors
  // Extensive pattern matching to catch all problematic URLs
  if (req.url.match(/^https?:\/\//) || 
      req.url.includes('://') || 
      req.url.includes(':') && !req.url.match(/\/:[a-zA-Z0-9_]+/) || // Block colons not in valid parameter format
      req.url.includes('git.new') || 
      req.url.includes('http') || 
      req.url.includes('www.') ||
      req.url.includes('//')) {
    logger.warn(`Blocked potential URL injection: ${req.url}`);
    logger.warn(`Request headers: ${JSON.stringify(req.headers)}`);
    logger.warn(`Request method: ${req.method}`);
    logger.warn(`Request IP: ${req.ip}`);
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid request path',
      details: 'URLs containing protocols or invalid domains are not allowed'
    });
  }
  
  // Only normalize paths that start with /api/
  if (req.url.startsWith('/api/')) {
    // Use a simpler string-based approach to normalize duplicated prefixes
    // Check for common duplicate patterns without using complex regex
    if (req.url.includes('/api/v1/api/v1')) {
      // Handle duplicated prefixes by simple string replacement
      req.url = '/api/v1' + req.url.substring(req.url.lastIndexOf('/api/v1') + 7);
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
  }
  
  // URL decoding is now done at the beginning of the middleware
  
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
    documentation: '/api-docs',
    allowedOrigins: [config.frontendUrl, config.productionFrontendUrl]
  });
});

// CORS preflight debugging endpoint
app.options('*', cors(), (req, res) => {
  logger.info(`CORS preflight request received: ${req.method} ${req.url}`);
  logger.info(`Origin: ${req.headers.origin}`);
  res.status(200).end();
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