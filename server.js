import { httpServer } from './app.js';
import connectDB from './config/db.js';
import config from './config/index.js';
import { logger } from './utils/logger.js';

// Connect to MongoDB
connectDB();

// Start server
const PORT = config.port;

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