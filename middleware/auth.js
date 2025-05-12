import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from './errorHandler.js';
import User from '../models/User.js';
import config from '../config/index.js';

export const authMiddleware = asyncHandler(async (req, res, next) => {
  // This is the main auth middleware used throughout the application
  let token;
  
  // Check if token exists in headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Get token from header
    token = req.headers.authorization.split(' ')[1];
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