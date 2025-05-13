import Contribution from '../models/Contribution.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Badge from '../models/Badge.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * @desc    Get all contributions with optional filtering
 * @route   GET /contributions
 * @access  Public
 */
export const getAllContributions = asyncHandler(async (req, res) => {
  const { 
    userId, 
    projectId, 
    status,
    page = 1, 
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;
  
  // Build filter
  const filter = {};
  if (userId) filter.userId = userId;
  if (projectId) filter.projectId = projectId;
  if (status) filter.status = status;
  
  // Calculate pagination
  const skip = (page - 1) * limit;
  
  // Sort order
  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
  
  // Execute query
  const contributions = await Contribution.find(filter)
    .populate('userId', 'name email profileImage')
    .populate('projectId', 'title')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));
  
  // Get total count for pagination
  const total = await Contribution.countDocuments(filter);
  
  res.status(200).json({
    success: true,
    count: contributions.length,
    total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    },
    data: contributions
  });
});

/**
 * @desc    Get contribution by ID
 * @route   GET /contributions/:id
 * @access  Public
 */
export const getContributionById = asyncHandler(async (req, res) => {
  const contribution = await Contribution.findById(req.params.id)
    .populate('userId', 'name email profileImage bio')
    .populate('projectId', 'title description techStack difficulty')
    .populate('verifiedBy', 'name email');
  
  if (!contribution) {
    throw new ApiError(404, 'Contribution not found');
  }
  
  res.status(200).json({
    success: true,
    data: contribution
  });
});

/**
 * @desc    Create a new contribution
 * @route   POST /contributions
 * @access  Private
 */
export const createContribution = asyncHandler(async (req, res) => {
  const { projectId, title, description, contributionType, pullRequestUrl, issueUrl } = req.body;
  
  // Check if project exists
  const project = await Project.findById(projectId);
  if (!project) {
    throw new ApiError(404, 'Project not found');
  }
  
  // Create contribution
  const contribution = await Contribution.create({
    userId: req.user.id,
    projectId,
    title,
    description,
    contributionType,
    pullRequestUrl,
    issueUrl,
    status: 'pending'
  });
  
  // Add contribution to user's contributions array
  await User.findByIdAndUpdate(
    req.user.id,
    { $push: { contributions: contribution._id } }
  );
  
  // Add user to project's contributors if not already there
  const isContributor = project.contributors.includes(req.user.id);
  if (!isContributor) {
    project.contributors.push(req.user.id);
    await project.save();
  }
  
  logger.info(`New contribution created: ${contribution.title} by user ${req.user.id}`);
  
  res.status(201).json({
    success: true,
    data: contribution
  });
});

/**
 * @desc    Update a contribution
 * @route   PUT /contributions/:id
 * @access  Private
 */
export const updateContribution = asyncHandler(async (req, res) => {
  const { title, description, contributionType, pullRequestUrl, issueUrl, status } = req.body;
  
  // Find contribution
  const contribution = await Contribution.findById(req.params.id);
  
  if (!contribution) {
    throw new ApiError(404, 'Contribution not found');
  }
  
  // Check if user is authorized to update
  if (contribution.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'Not authorized to update this contribution');
  }
  
  // User can only update certain fields if contribution is pending
  if (contribution.status !== 'pending' && req.user.role !== 'admin') {
    throw new ApiError(400, 'Cannot update contribution after verification');
  }
  
  // Update fields
  if (title) contribution.title = title;
  if (description) contribution.description = description;
  if (contributionType) contribution.contributionType = contributionType;
  if (pullRequestUrl) contribution.pullRequestUrl = pullRequestUrl;
  if (issueUrl) contribution.issueUrl = issueUrl;
  
  // Only admin can update status
  if (status && req.user.role === 'admin') {
    contribution.status = status;
  }
  
  await contribution.save();
  
  logger.info(`Contribution updated: ${contribution._id}`);
  
  res.status(200).json({
    success: true,
    data: contribution
  });
});

/**
 * @desc    Delete a contribution
 * @route   DELETE /contributions/:id
 * @access  Private
 */
export const deleteContribution = asyncHandler(async (req, res) => {
  // Find contribution
  const contribution = await Contribution.findById(req.params.id);
  
  if (!contribution) {
    throw new ApiError(404, 'Contribution not found');
  }
  
  // Check if user is authorized to delete
  if (contribution.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'Not authorized to delete this contribution');
  }
  
  // Remove contribution from user's contributions array
  await User.findByIdAndUpdate(
    contribution.userId,
    { $pull: { contributions: contribution._id } }
  );
  
  // Delete contribution
  await contribution.deleteOne();
  
  logger.info(`Contribution deleted: ${contribution._id}`);
  
  res.status(200).json({
    success: true,
    message: 'Contribution deleted successfully'
  });
});

/**
 * @desc    Verify a contribution
 * @route   PUT /contributions/:id/verify
 * @access  Admin/Mentor
 */
export const verifyContribution = asyncHandler(async (req, res) => {
  const { status, points = 10, feedback } = req.body;
  
  if (!['approved', 'rejected'].includes(status)) {
    throw new ApiError(400, 'Status must be either approved or rejected');
  }
  
  // Find contribution
  const contribution = await Contribution.findById(req.params.id);
  
  if (!contribution) {
    throw new ApiError(404, 'Contribution not found');
  }
  
  // Only verify pending contributions
  if (contribution.status !== 'pending') {
    throw new ApiError(400, 'Contribution has already been verified');
  }
  
  // Update contribution
  contribution.status = status;
  contribution.verifiedBy = req.user.id;
  contribution.verifiedAt = Date.now();
  contribution.feedback = feedback;
  
  if (status === 'approved') {
    contribution.points = points;
    
    // Update user's contribution points
    const user = await User.findById(contribution.userId);
    user.contributionPoints = (user.contributionPoints || 0) + points;
    await user.save();
    
    // Check if user qualifies for badges based on contributions
    await checkAndAwardBadges(user);
  }
  
  await contribution.save();
  
  logger.info(`Contribution ${status}: ${contribution._id} by ${req.user.id}`);
  
  res.status(200).json({
    success: true,
    message: `Contribution ${status} successfully`,
    data: contribution
  });
});

/**
 * @desc    Get contributions by user ID
 * @route   GET /contributions/user/:userId
 * @access  Public
 */
export const getUserContributions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status, page = 1, limit = 10 } = req.query;
  
  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  // Build filter
  const filter = { userId };
  if (status) filter.status = status;
  
  // Calculate pagination
  const skip = (page - 1) * limit;
  
  // Execute query
  const contributions = await Contribution.find(filter)
    .populate('projectId', 'title techStack')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
  
  // Get total count for pagination
  const total = await Contribution.countDocuments(filter);
  
  res.status(200).json({
    success: true,
    count: contributions.length,
    total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    },
    data: contributions
  });
});

/**
 * @desc    Get contributions by project ID
 * @route   GET /contributions/project/:projectId
 * @access  Public
 */
export const getProjectContributions = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { status, page = 1, limit = 10 } = req.query;
  
  // Check if project exists
  const project = await Project.findById(projectId);
  if (!project) {
    throw new ApiError(404, 'Project not found');
  }
  
  // Build filter
  const filter = { projectId };
  if (status) filter.status = status;
  
  // Calculate pagination
  const skip = (page - 1) * limit;
  
  // Execute query
  const contributions = await Contribution.find(filter)
    .populate('userId', 'name profileImage')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
  
  // Get total count for pagination
  const total = await Contribution.countDocuments(filter);
  
  res.status(200).json({
    success: true,
    count: contributions.length,
    total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    },
    data: contributions
  });
});

/**
 * @desc    Get contribution statistics
 * @route   GET /contributions/stats
 * @access  Public
 */
export const getContributionStats = asyncHandler(async (req, res) => {
  // Get total contributions count
  const totalContributions = await Contribution.countDocuments();
  
  // Get counts by status
  const statusCounts = await Contribution.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  
  // Format status counts
  const statusCountsObj = {};
  statusCounts.forEach(item => {
    statusCountsObj[item._id] = item.count;
  });
  
  // Get counts by contribution type
  const typeCounts = await Contribution.aggregate([
    { $group: { _id: '$contributionType', count: { $sum: 1 } } }
  ]);
  
  // Format type counts
  const typeCountsObj = {};
  typeCounts.forEach(item => {
    typeCountsObj[item._id] = item.count;
  });
  
  // Get top contributors
  const topContributors = await User.aggregate([
    { $match: { contributionPoints: { $gt: 0 } } },
    { $sort: { contributionPoints: -1 } },
    { $limit: 5 },
    { $project: { _id: 1, name: 1, profileImage: 1, contributionPoints: 1 } }
  ]);
  
  res.status(200).json({
    success: true,
    data: {
      totalContributions,
      byStatus: statusCountsObj,
      byType: typeCountsObj,
      topContributors
    }
  });
});

// Helper function to check and award badges based on contributions
const checkAndAwardBadges = async (user) => {
  try {
    // Get user's approved contributions count
    const contributionsCount = await Contribution.countDocuments({
      userId: user._id,
      status: 'approved'
    });
    
    // Find badges based on contribution count condition
    const badges = await Badge.find({
      'conditions.type': 'contributions',
      'conditions.count': { $lte: contributionsCount }
    });
    
    if (badges.length === 0) return;
    
    // Check which badges the user doesn't have yet
    const userBadgeIds = user.badges.map(id => id.toString());
    const newBadges = badges.filter(badge => !userBadgeIds.includes(badge._id.toString()));
    
    if (newBadges.length === 0) return;
    
    // Award new badges to user
    user.badges = [...user.badges, ...newBadges.map(badge => badge._id)];
    await user.save();
    
    logger.info(`Awarded ${newBadges.length} new badges to user ${user._id} for contributions`);
  } catch (error) {
    logger.error(`Error awarding badges: ${error.message}`);
  }
};