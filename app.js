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

// Patch Express Router to prevent path-to-regexp errors
const originalRouter = express.Router;
express.Router = function patchedRouter() {
  logger.info('Express router patched to prevent path-to-regexp crashes');
  const router = originalRouter.apply(this, arguments);
  
  // Save original route methods
  const originalMethods = {
    get: router.get,
    post: router.post,
    put: router.put,
    delete: router.delete,
    patch: router.patch,
    all: router.all
  };
  
  // Create safer versions of each method
  Object.keys(originalMethods).forEach(method => {
    router[method] = function safePath() {
      try {
        // Check for common path errors before passing to the original method
        const path = arguments[0];
        
        // Check for URLs with protocol in the path
        if (typeof path === 'string') {
          if (path.includes('http://') || path.includes('https://')) {
            const cleanPath = path.replace(/^https?:\/\/[^\/]+/, '');
            logger.error(`Invalid route path contains URL protocol: ${path} -> fixed to ${cleanPath}`);
            arguments[0] = cleanPath || '/';
          }
          
          // Check for missing parameter names
          if (path.includes('/:') && path.match(/\/:[^/]+/g)) {
            const hasEmptyParam = path.match(/\/:[^/]+/g).some(param => param === '/:' || param.includes('/:https') || param.includes('/:http'));
            if (hasEmptyParam) {
              logger.error(`Missing parameter name in route: ${path}`);
              arguments[0] = '/error-invalid-route';
            }
          }
        }
        
        return originalMethods[method].apply(this, arguments);
      } catch (error) {
        logger.error(`Caught path-to-regexp error: ${error.message}`);
        // Return a dummy route handler that returns a 500 error
        return router.use(function(req, res, next) {
          res.status(500).json({
            error: 'Server configuration error',
            message: 'A route was incorrectly configured'
          });
        });
      }
    };
  });
  
  return router;
};

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
import githubRoutes from './routes/github.js';
import analyticsRoutes from './routes/analytics.js';
import * as scheduledTasks from './utils/scheduledTasks.js';

// Initialize express app
const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all origins for Socket.io
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for Swagger UI
  crossOriginEmbedderPolicy: false // Allow embedding
})); 

// CORS configuration - allow all origins
app.use(cors({
  origin: '*', // Allow all origins as requested
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
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
        url: `/api/v1`,  // Relative URL works better in production
        description: 'API server',
      },
      {
        url: `http://localhost:${config.port}/api/v1`,
        description: 'Development server',
      }
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

// Try/catch for Swagger initialization
let swaggerDocs;
try {
  swaggerDocs = swaggerJsDoc(swaggerOptions);
} catch (error) {
  logger.error(`Error initializing Swagger: ${error.message}`);
  // Create a minimal swagger doc
  swaggerDocs = {
    openapi: '3.0.0',
    info: {
      title: 'OpenElevate API',
      version: '1.0.0',
      description: 'Error loading full API docs'
    },
    paths: {}
  };
}

// API routes - wrapped in try/catch blocks
try {
  app.use('/api/v1/auth', authRoutes);
} catch (error) {
  logger.error(`Error registering auth routes: ${error.message}`);
}

try {
  app.use('/api/v1/users', usersRoutes);
} catch (error) {
  logger.error(`Error registering users routes: ${error.message}`);
}

try {
  app.use('/api/v1/projects', projectsRoutes);
} catch (error) {
  logger.error(`Error registering projects routes: ${error.message}`);
}

try {
  app.use('/api/v1/contributions', contributionsRoutes);
} catch (error) {
  logger.error(`Error registering contributions routes: ${error.message}`);
}

try {
  app.use('/api/v1/badges', badgesRoutes);
} catch (error) {
  logger.error(`Error registering badges routes: ${error.message}`);
}

try {
  app.use('/api/v1/mentorship', mentorshipRoutes);
} catch (error) {
  logger.error(`Error registering mentorship routes: ${error.message}`);
}

try {
  app.use('/api/v1/ai', aiRoutes);
} catch (error) {
  logger.error(`Error registering ai routes: ${error.message}`);
}

try {
  app.use('/api/v1/emails', emailsRoutes);
} catch (error) {
  logger.error(`Error registering emails routes: ${error.message}`);
}

try {
  app.use('/api/v1/settings', settingsRoutes);
} catch (error) {
  logger.error(`Error registering settings routes: ${error.message}`);
}

try {
  app.use('/api/v1/github', githubRoutes);
  logger.info('GitHub routes registered');
} catch (error) {
  logger.error(`Error registering GitHub routes: ${error.message}`);
}

try {
  app.use('/api/v1/analytics', analyticsRoutes);
  logger.info('Analytics routes registered');
} catch (error) {
  logger.error(`Error registering analytics routes: ${error.message}`);
}

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

// Start scheduled tasks
try {
  scheduledTasks.startScheduledTasks();
  logger.info('Scheduled tasks started');
} catch (error) {
  logger.error(`Error starting scheduled tasks: ${error.message}`);
}

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