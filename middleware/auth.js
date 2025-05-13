import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from './errorHandler.js';
import User from '../models/User.js';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

export const authMiddleware = asyncHandler(async (req, res, next) => {
  // This is the main auth middleware used throughout the application
  let token;
  
  // DEVELOPMENT MODE: Check if we should enable dev authentication bypass
  // Enable this by setting DEV_AUTH_BYPASS=true in your .env file
  if (config.env === 'development' && process.env.DEV_AUTH_BYPASS === 'true') {
    logger.warn('⚠️ DEVELOPMENT MODE: Authentication bypass enabled');
    
    try {
      // Try to find an admin user to use for authentication
      const adminUser = await User.findOne({ role: 'admin' }).select('-password');
      
      if (adminUser) {
        // Use admin user for authentication
        req.user = adminUser;
        logger.info(`Dev auth using admin: ${adminUser.name} (${adminUser._id})`);
        return next();
      }
      
      // Fall back to any user if admin not found
      const anyUser = await User.findOne().select('-password');
      if (anyUser) {
        req.user = anyUser;
        logger.info(`Dev auth using: ${anyUser.name} (${anyUser._id})`);
        return next();
      }
      
      // If no users found, continue with normal auth flow
      logger.warn('Dev auth bypass enabled but no users found in database');
    } catch (err) {
      logger.error(`Error in dev auth bypass: ${err.message}`);
      // Continue with normal authentication flow
    }
  }
  
  // NORMAL AUTHENTICATION FLOW
  // Check if token exists in headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Get token from header
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    // Also check for token in cookies
    token = req.cookies.token;
  }
  
  // Check if token exists
  if (!token) {
    return next(new ApiError(401, 'Not authorized to access this route'));
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Find user from token
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return next(new ApiError(401, 'User not found'));
    }
    
    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    return next(new ApiError(401, 'Not authorized to access this route'));
  }
});

// Alias for backward compatibility
export const protect = authMiddleware;

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authorized to access this route'));
    }
    
    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError(403, `User role ${req.user.role} is not authorized to access this route`)
      );
    }
    
    next();
  };
};

export const checkOwnership = (model) => asyncHandler(async (req, res, next) => {
  const document = await model.findById(req.params.id);
  
  if (!document) {
    return next(new ApiError(404, 'Resource not found'));
  }
  
  // Check if user is owner or admin
  if (
    document.user?.toString() !== req.user.id && 
    req.user.role !== 'admin'
  ) {
    return next(new ApiError(403, 'Not authorized to modify this resource'));
  }
  
  next();
});