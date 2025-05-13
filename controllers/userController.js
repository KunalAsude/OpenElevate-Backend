import User from '../models/User.js';
import { validateUserUpdate } from '../utils/validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

/**
 * @desc    Get all users with optional filtering
 * @route   GET /users
 * @access  Public
 */
export const getUsers = asyncHandler(async (req, res) => {
  const { 
    role, 
    skill, 
    level, 
    page = 1, 
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const query = {};
  
  // Apply filters if provided
  if (role) query.role = role;
  if (level) query.level = level;
  if (skill) query.skills = { $in: [skill] };

  // Calculate pagination
  const skip = (page - 1) * limit;
  
  // Sort order
  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // Execute query
  const users = await User.find(query)
    .select('-password')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count for pagination
  const total = await User.countDocuments(query);
  
  res.status(200).json({
    success: true,
    count: users.length,
    total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    },
    data: users
  });
});

/**
 * @desc    Get user by ID
 * @route   GET /users/:id
 * @access  Public
 */
export const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-password')
    .populate('badges')
    .populate({
      path: 'contributions',
      options: { sort: { createdAt: -1 }, limit: 10 }
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
 * @desc    Update user profile
 * @route   PUT /users/:id
 * @access  Private
 */
export const updateUser = asyncHandler(async (req, res) => {
  // Only allow users to update their own profile (unless admin)
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'Not authorized to update this profile');
  }

  // Validate request body
  const { error } = validateUserUpdate(req.body);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }

  // Create sanitized update object
  const {
    name,
    bio,
    skills,
    level,
    socialLinks
  } = req.body;

  const updateData = {};
  if (name) updateData.name = name;
  if (bio) updateData.bio = bio;
  if (skills) updateData.skills = skills;
  if (level) updateData.level = level;
  if (socialLinks) updateData.socialLinks = socialLinks;

  // Profile image handling would be here (using Cloudinary or similar)
  // if (req.file) updateData.profileImage = req.file.path;

  // Update user
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: updateData },
    { new: true }
  ).select('-password');

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  logger.info(`User updated: ${user._id}`);

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: user
  });
});

/**
 * @desc    Get user badges
 * @route   GET /users/:id/badges
 * @access  Public
 */
export const getUserBadges = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('badges name')
    .populate('badges');

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json({
    success: true,
    data: user.badges
  });
});

/**
 * @desc    Get user's position in leaderboard
 * @route   GET /users/:id/leaderboard
 * @access  Public
 */
export const getUserLeaderboardPosition = asyncHandler(async (req, res) => {
  // Find all users sorted by contribution points (or another metric)
  const users = await User.find()
    .select('_id name level contributions')
    .sort({ contributions: -1 });
  
  // Find the user's position
  const userIndex = users.findIndex(user => user._id.toString() === req.params.id);
  
  if (userIndex === -1) {
    throw new ApiError(404, 'User not found');
  }
  
  const position = userIndex + 1;
  
  // Get users around the target user
  const startIndex = Math.max(0, userIndex - 2);
  const endIndex = Math.min(users.length, userIndex + 3);
  const nearbyUsers = users.slice(startIndex, endIndex);
  
  res.status(200).json({
    success: true,
    data: {
      position,
      total: users.length,
      percentile: Math.round((1 - position / users.length) * 100),
      nearbyUsers
    }
  });
});