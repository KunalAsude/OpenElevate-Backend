import rateLimit from 'express-rate-limit';
import { ApiError } from './errorHandler.js';

// General rate limiter (100 requests in 10 minutes)
export const generalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: 'Too many requests, please try again later',
  },
  handler: (req, res, next, options) => {
    next(new ApiError(429, 'Too many requests, please try again later'));
  },
});

// Authentication rate limiter (more strict: 10 requests in 15 minutes)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login/register attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts, please try again later',
  },
  handler: (req, res, next, options) => {
    next(new ApiError(429, 'Too many login attempts, please try again later'));
  },
});

// AI API rate limiter (20 requests in 60 minutes)
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 60 minutes
  max: 20, // Limit each IP to 20 AI API requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'AI request limit reached, please try again later',
  },
  handler: (req, res, next, options) => {
    next(new ApiError(429, 'AI request limit reached, please try again later'));
  },
});