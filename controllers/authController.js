import User from '../models/User.js';
import { validateLogin, validateRegistration } from '../utils/validators.js';
import jwt from 'jsonwebtoken';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import config from '../config/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * @desc    Register a new user
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
export const register = asyncHandler(async (req, res) => {
  // Validate request body
  const { error } = validateRegistration(req.body);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }

  const { name, email, password, role } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(400, 'User already exists with this email');
  }

  // Create new user
  const user = new User({
    name,
    email,
    password,
    role: role || 'developer'
  });

  await user.save();

  // Generate JWT token
  const token = jwt.sign(
    { id: user._id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  logger.info(`New user registered: ${user.email} with role ${user.role}`);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    token,
    user: user.getPublicProfile()
  });
});

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
export const login = asyncHandler(async (req, res) => {
  // Validate request body
  const { error } = validateLogin(req.body);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }

  const { email, password } = req.body;

  // Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // Compare password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // Generate JWT token
  const token = jwt.sign(
    { id: user._id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  // Update last active
  user.lastActive = Date.now();
  await user.save();

  logger.info(`User logged in: ${user.email}`);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    token,
    user: user.getPublicProfile()
  });
});

/**
 * @desc    Get current user profile
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .select('-password')
    .populate('badges')
    .populate({
      path: 'contributions',
      options: { sort: { createdAt: -1 }, limit: 5 }
    });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

/**
 * @desc    Logout user (invalidate token)
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
export const logout = asyncHandler(async (req, res) => {
  // In a real implementation, you might want to blacklist the token
  // For simplicity, we'll just send a success response since JWT 
  // invalidation typically happens on the client
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

/**
 * @desc    Refresh token
 * @route   POST /api/v1/auth/refresh
 * @access  Public
 */
export const refreshToken = asyncHandler(async (req, res) => {
  // Get the refresh token from request
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    throw new ApiError(400, 'Refresh token is required');
  }
  
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret);
    
    // Find user
    const user = await User.findById(decoded.id);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    // Generate new access token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
    
    res.status(200).json({
      success: true,
      token
    });
  } catch (error) {
    logger.error(`Token refresh error: ${error.message}`);
    throw new ApiError(401, 'Invalid or expired refresh token');
  }
});