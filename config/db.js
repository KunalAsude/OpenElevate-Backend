import mongoose from 'mongoose';
import config from './index.js';
import { logger } from '../utils/logger.js';

const connectDB = async () => {
  try {
    if (!config.mongoURI) {
      throw new Error('MongoDB URI is not defined in configuration');
    }
    
    const conn = await mongoose.connect(config.mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000, // Timeout after 30 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 30000, // Give up initial connection after 30 seconds
      // Connection pool settings
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 5, // Maintain at least 5 socket connections
      // Retry options
      retryWrites: true, // Retry write operations on network errors
      retryReads: true // Retry read operations on network errors
    });
    
    logger.info(`MongoDB Connected: ${conn.connection.host} (${config.env} mode)`);
    return conn;
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    // Don't exit the process immediately on connection failure
    // This allows the app to start even if DB is temporarily unavailable
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Continuing without database connection in production mode');
    } else {
      process.exit(1);
    }
  }
};

export default connectDB;