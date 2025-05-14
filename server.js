import { httpServer } from './app.js';
import connectDB from './config/db.js';
import config from './config/index.js';
import { logger } from './utils/logger.js';
import { initSettings } from './routes/settings.js';

// Connect to MongoDB and initialize settings
(async () => {
  try {
    await connectDB();
    logger.info('Database connected successfully');
    
    // Initialize settings after successful database connection
    await initSettings();
    logger.info('Default settings initialized successfully');
  } catch (error) {
    logger.error(`Failed to initialize application: ${error.message}`);
    process.exit(1);
  }
})();

// Start server
const PORT = process.env.PORT || config.port; // Use environment PORT for Render, fallback to config for local development

httpServer.listen(PORT, () => {
  logger.info(`Server running in ${config.env} mode on port ${PORT}`);
  logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  httpServer.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  httpServer.close(() => process.exit(1));
});