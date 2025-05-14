import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { logger } from './logger.js';
import { initSettings } from '../routes/settings.js';

/**
 * Initializes the database by creating necessary collections and default data
 * This script can be run independently to prepare the database before starting the main application
 */
const initializeDatabase = async () => {
  try {
    // Connect to MongoDB with increased timeout
    logger.info('Connecting to MongoDB...');
    await connectDB();
    logger.info('MongoDB connected successfully');

    // Initialize settings
    logger.info('Initializing default settings...');
    await initSettings();
    logger.info('Default settings initialized successfully');

    // Add any other initialization functions here
    // For example, creating default admin user, etc.

    logger.info('Database initialization completed successfully');
    
    // Close the database connection
    await mongoose.connection.close();
    logger.info('Database connection closed');
    
    return { success: true };
  } catch (error) {
    logger.error(`Database initialization failed: ${error.message}`);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      logger.info('Database connection closed');
    }
    return { success: false, error: error.message };
  }
};

// Run if script is executed directly
if (process.argv[1].includes('initDb.js')) {
  (async () => {
    const result = await initializeDatabase();
    if (result.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })();
}

export default initializeDatabase;
