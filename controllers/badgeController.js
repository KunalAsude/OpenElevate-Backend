import Badge from '../models/Badge.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * @desc    Get all badges
 * @route   GET /badges
 * @access  Public
 */
export const getAllBadges = asyncHandler(async (req, res) => {
  const badges = await Badge.find({});
  
  res.status(200).json({
    success: true,
    count: badges.length,
    data: badges
  });
});

/**
 * @desc    Get badge by ID
 * @route   GET /api/v1/badges/:id
 * @access  Public
 */
export const getBadgeById = asyncHandler(async (req, res) => {
  const badge = await Badge.findById(req.params.id);
  
  if (!badge) {
    throw new ApiError(404, 'Badge not found');
  }
  
  res.status(200).json({
    success: true,
    data: badge
  });
});

/**
 * @desc    Create a new badge
 * @route   POST /badges
 * @access  Admin
 */
export const createBadge = asyncHandler(async (req, res) => {
  const { title, description, criteria, image, conditions } = req.body;
  
  // Check if badge already exists
  const existingBadge = await Badge.findOne({ title });
  if (existingBadge) {
    throw new ApiError(400, 'Badge with this title already exists');
  }
  
  const badge = await Badge.create({
    title,
    description,
    criteria,
    image,
    conditions
  });
  
  logger.info(`New badge created: ${badge.title}`);
  
  res.status(201).json({
    success: true,
    data: badge
  });
});

/**
 * @desc    Update a badge
 * @route   PUT /badges/:id
 * @access  Admin
 */
export const updateBadge = asyncHandler(async (req, res) => {
  const { title, description, criteria, image, conditions } = req.body;
  
  const badge = await Badge.findById(req.params.id);
  
  if (!badge) {
    throw new ApiError(404, 'Badge not found');
  }
  
  // Check if new title conflicts with existing badge
  if (title && title !== badge.title) {
    const existingBadge = await Badge.findOne({ title });
    if (existingBadge) {
      throw new ApiError(400, 'Badge with this title already exists');
    }
  }
  
  // Update fields
  if (title) badge.title = title;
  if (description) badge.description = description;
  if (criteria) badge.criteria = criteria;
  if (image) badge.image = image;
  if (conditions) badge.conditions = conditions;
  
  await badge.save();
  
  logger.info(`Badge updated: ${badge.title}`);
  
  res.status(200).json({
    success: true,
    data: badge
  });
});

/**
 * @desc    Delete a badge
 * @route   DELETE /badges/:id
 * @access  Admin
 */
export const deleteBadge = asyncHandler(async (req, res) => {
  const badge = await Badge.findById(req.params.id);
  
  if (!badge) {
    throw new ApiError(404, 'Badge not found');
  }
  
  // Remove badge from all users who have it
  await User.updateMany(
    { badges: badge._id },
    { $pull: { badges: badge._id } }
  );
  
  await badge.deleteOne();
  
  logger.info(`Badge deleted: ${badge.title}`);
  
  res.status(200).json({
    success: true,
    message: 'Badge deleted successfully'
  });
});

/**
 * @desc    Award badge to user
 * @route   POST /badges/:id/award/:userId
 * @access  Admin
 */
export const awardBadgeToUser = asyncHandler(async (req, res) => {
  const { id, userId } = req.params;
  
  const badge = await Badge.findById(id);
  if (!badge) {
    throw new ApiError(404, 'Badge not found');
  }
  
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  // Check if user already has this badge
  if (user.badges.includes(badge._id)) {
    throw new ApiError(400, 'User already has this badge');
  }
  
  // Award badge to user
  user.badges.push(badge._id);
  await user.save();
  
  logger.info(`Badge '${badge.title}' awarded to user: ${user.email}`);
  
  res.status(200).json({
    success: true,
    message: `Badge '${badge.title}' awarded to user successfully`
  });
});

/**
 * @desc    Get users with a specific badge
 * @route   GET /badges/:id/users
 * @access  Public
 */
export const getUsersWithBadge = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10 } = req.query;
  
  const badge = await Badge.findById(id);
  if (!badge) {
    throw new ApiError(404, 'Badge not found');
  }
  
  const skip = (page - 1) * limit;
  
  const users = await User.find({ badges: id })
    .select('name email profileImage bio level')
    .skip(skip)
    .limit(parseInt(limit));
  
  const total = await User.countDocuments({ badges: id });
  
  res.status(200).json({
    success: true,
    count: users.length,
    total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    },
    data: users
  });
});

/**
 * @desc    Check if current user has specific badge
 * @route   GET /badges/:id/check
 * @access  Private
 */
export const checkUserBadge = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('badges');
  
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  const hasBadge = user.badges.includes(req.params.id);
  
  res.status(200).json({
    success: true,
    hasBadge
  });
});

/**
 * @desc    Remove badge from user
 * @route   DELETE /badges/:id/user/:userId
 * @access  Admin
 */
export const removeBadgeFromUser = asyncHandler(async (req, res) => {
  const { id, userId } = req.params;
  
  const badge = await Badge.findById(id);
  if (!badge) {
    throw new ApiError(404, 'Badge not found');
  }
  
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  // Check if user has the badge
  if (!user.badges.includes(mongoose.Types.ObjectId(id))) {
    throw new ApiError(400, 'User does not have this badge');
  }
  
  // Remove badge from user
  user.badges = user.badges.filter(badge => badge.toString() !== id);
  await user.save();
  
  logger.info(`Badge '${badge.title}' removed from user: ${user.email}`);
  
  res.status(200).json({
    success: true,
    message: `Badge '${badge.title}' removed from user successfully`
  });
});