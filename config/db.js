import mongoose from 'mongoose';
import config from './index.js';
import { logger } from '../utils/logger.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 30000, // Increased from default 10000ms
      socketTimeoutMS: 45000,  // Increased socket timeout
      serverSelectionTimeoutMS: 30000, // Longer server selection timeout
      maxPoolSize: 10, // Maximum number of connections in the connection pool
      minPoolSize: 5,  // Minimum number of connections in the connection pool
      retryWrites: true, // Retry write operations if they fail
      retryReads: true   // Retry read operations if they fail
    });
    
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;