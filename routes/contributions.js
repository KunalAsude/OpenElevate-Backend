import express from 'express';
import { check, validationResult } from 'express-validator';
import { authMiddleware, authorize, checkOwnership } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import Contribution from '../models/Contribution.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Badge from '../models/Badge.js';
import { logger } from '../utils/logger.js';
import { sendContributionStatusEmail } from '../utils/email.js';

const router = express.Router();

/**
 * @swagger
 * /contributions:
 *   post:
 *     summary: Create a new contribution
 *     tags: [Contributions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - type
 *               - title
 *               - link
 *             properties:
 *               projectId:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [PR, issue, review, documentation, other]
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               link:
 *                 type: string
 *     responses:
 *       201:
 *         description: Contribution created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/', authMiddleware, [
  check('projectId', 'Project ID is required').not().isEmpty().isMongoId(),
  check('type').isIn(['PR', 'issue', 'review', 'documentation', 'other']).withMessage('Invalid contribution type'),
  check('title').notEmpty().withMessage('Title is required').isLength({ max: 100 }).withMessage('Title cannot be more than 100 characters'),
  check('description').optional().isLength({ max: 500 }).withMessage('Description cannot be more than 500 characters'),
  check('link').notEmpty().withMessage('Link is required').matches(/^(https?:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/(pull|issues)\/\d+\/?$/).withMessage('Please add a valid GitHub PR or issue URL')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { projectId, type, title, description, link } = req.body;

  // Check if project exists
  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  // Create contribution
  const contribution = await Contribution.create({
    userId: req.user.id,
    projectId,
    type,
    title,
    description,
    link,
    status: 'open'
  });

  // Add user to project contributors if not already there
  if (!project.contributors.includes(req.user.id)) {
    project.contributors.push(req.user.id);
    await project.save();
  }

  // Add contribution to user's contributions array
  await User.findByIdAndUpdate(req.user.id, {
    $push: { contributions: contribution._id }
  });

  // Check for badge eligibility - First Contribution
  const contributionCount = await Contribution.countDocuments({ userId: req.user.id });
  if (contributionCount === 1) {
    // Find the 'First Contribution' badge
    const firstContributionBadge = await Badge.findOne({
      title: 'First Contribution',
      'conditions.type': 'contribution_count',
      'conditions.count': 1
    });

    if (firstContributionBadge) {
      // Add badge to user if not already awarded
      const user = await User.findById(req.user.id);
      if (!user.badges.includes(firstContributionBadge._id)) {
        user.badges.push(firstContributionBadge._id);
        await user.save();
        logger.info(`First Contribution badge awarded to user: ${user.email}`);
      }
    }
  }

  logger.info(`New contribution created: ${contribution.title} by user: ${req.user.email}`);

  res.status(201).json({
    success: true,
    data: contribution
  });
}));

/**
 * @swagger
 * /contributions:
 *   get:
 *     summary: Get all contributions (with filters)
 *     tags: [Contributions]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by contribution type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by contribution status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of contributions
 *       500:
 *         description: Server error
 */
router.get('/', asyncHandler(async (req, res) => {
  // Extract query parameters
  const { userId, projectId, type, status, page = 1, limit = 10 } = req.query;

  // Build filter object
  const filter = {};
  if (userId) filter.userId = userId;
  if (projectId) filter.projectId = projectId;
  if (type) filter.type = type;
  if (status) filter.status = status;

  // Calculate pagination
  const startIndex = (Number(page) - 1) * Number(limit);
  const endIndex = Number(page) * Number(limit);
  const total = await Contribution.countDocuments(filter);

  // Find contributions with filter and pagination
  const contributions = await Contribution.find(filter)
    .sort({ createdAt: -1 })
    .skip(startIndex)
    .limit(Number(limit))
    .populate('userId', 'name email avatarUrl')
    .populate('projectId', 'title githubLink thumbnailUrl')
    .populate('verifiedBy', 'name email');

  // Pagination results
  const pagination = {};
  if (endIndex < total) {
    pagination.next = {
      page: Number(page) + 1,
      limit: Number(limit)
    };
  }
  if (startIndex > 0) {
    pagination.prev = {
      page: Number(page) - 1,
      limit: Number(limit)
    };
  }

  res.status(200).json({
    success: true,
    count: contributions.length,
    pagination,
    totalPages: Math.ceil(total / Number(limit)),
    data: contributions
  });
}));

/**
 * @swagger
 * /contributions/{id}:
 *   get:
 *     summary: Get a single contribution by ID
 *     tags: [Contributions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contribution ID
 *     responses:
 *       200:
 *         description: Contribution details
 *       404:
 *         description: Contribution not found
 *       500:
 *         description: Server error
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const contribution = await Contribution.findById(req.params.id)
    .populate('userId', 'name email avatarUrl')
    .populate('projectId', 'title githubLink thumbnailUrl')
    .populate('verifiedBy', 'name email');

  if (!contribution) {
    return res.status(404).json({
      success: false,
      message: 'Contribution not found'
    });
  }

  res.status(200).json({
    success: true,
    data: contribution
  });
}));

/**
 * @swagger
 * /contributions/{id}:
 *   put:
 *     summary: Update a contribution
 *     tags: [Contributions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contribution ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [PR, issue, review, documentation, other]
 *               link:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contribution updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Contribution not found
 *       500:
 *         description: Server error
 */
router.put('/:id', authMiddleware, [
  check('title').optional().notEmpty().withMessage('Title cannot be empty').isLength({ max: 100 }).withMessage('Title cannot be more than 100 characters'),
  check('description').optional().isLength({ max: 500 }).withMessage('Description cannot be more than 500 characters'),
  check('type').optional().isIn(['PR', 'issue', 'review', 'documentation', 'other']).withMessage('Invalid contribution type'),
  check('link').optional().matches(/^(https?:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/(pull|issues)\/\d+\/?$/).withMessage('Please add a valid GitHub PR or issue URL')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  // Find contribution
  let contribution = await Contribution.findById(req.params.id);
  
  if (!contribution) {
    return res.status(404).json({
      success: false,
      message: 'Contribution not found'
    });
  }

  // Check if user is the contributor or an admin
  if (contribution.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to update this contribution'
    });
  }

  // Update contribution fields
  const { title, description, type, link } = req.body;
  if (title) contribution.title = title;
  if (description !== undefined) contribution.description = description;
  if (type) contribution.type = type;
  if (link) contribution.link = link;
  
  await contribution.save();
  
  logger.info(`Contribution updated: ${contribution.title} by user: ${req.user.email}`);

  res.status(200).json({
    success: true,
    data: contribution
  });
}));

/**
 * @swagger
 * /contributions/{id}/verify:
 *   put:
 *     summary: Verify a contribution (change status)
 *     tags: [Contributions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contribution ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, merged, closed, approved]
 *     responses:
 *       200:
 *         description: Contribution status updated
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Contribution not found
 *       500:
 *         description: Server error
 */
router.put('/:id/verify', authMiddleware, authorize('admin', 'mentor'), [
  check('status').isIn(['open', 'merged', 'closed', 'approved']).withMessage('Invalid status value')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { status } = req.body;

  // Find contribution
  let contribution = await Contribution.findById(req.params.id);
  
  if (!contribution) {
    return res.status(404).json({
      success: false,
      message: 'Contribution not found'
    });
  }

  // Update status
  contribution.status = status;
  contribution.verifiedBy = req.user.id;
  contribution.verifiedAt = Date.now();
  
  await contribution.save();
  
  // Update points based on contribution type and status
  let points = 0;
  
  // Base points for different contribution types
  switch (contribution.type) {
    case 'PR':
      points = 10;
      break;
    case 'issue':
      points = 3;
      break;
    case 'review':
      points = 5;
      break;
    case 'documentation':
      points = 7;
      break;
    case 'other':
      points = 2;
      break;
  }
  
  // Bonus points for merged/approved contributions
  if (status === 'merged' || status === 'approved') {
    points *= 2;
  }
  
  contribution.points = points;
  await contribution.save();
  
  // Send notification email to the user
  try {
    const user = await User.findById(contribution.userId);
    if (user) {
      const project = await Project.findById(contribution.projectId);
      await sendContributionStatusEmail(user, { ...contribution.toObject(), projectId: project });
    }
  } catch (error) {
    logger.error(`Error sending contribution status email: ${error.message}`);
  }
  
  // Check for badges based on contribution count
  try {
    const contributionCount = await Contribution.countDocuments({ 
      userId: contribution.userId,
      status: { $in: ['merged', 'approved'] }
    });
    
    if (contributionCount === 10) {
      // Find the 'Code Warrior' badge
      const badge = await Badge.findOne({
        title: 'Code Warrior',
        'conditions.type': 'contribution_count',
        'conditions.count': 10
      });
      
      if (badge) {
        const user = await User.findById(contribution.userId);
        if (user && !user.badges.includes(badge._id)) {
          user.badges.push(badge._id);
          await user.save();
          logger.info(`Code Warrior badge awarded to user: ${user.email}`);
        }
      }
    } else if (contributionCount === 50) {
      // Find the 'Open Source Hero' badge
      const badge = await Badge.findOne({
        title: 'Open Source Hero',
        'conditions.type': 'contribution_count',
        'conditions.count': 50
      });
      
      if (badge) {
        const user = await User.findById(contribution.userId);
        if (user && !user.badges.includes(badge._id)) {
          user.badges.push(badge._id);
          await user.save();
          logger.info(`Open Source Hero badge awarded to user: ${user.email}`);
        }
      }
    }
  } catch (error) {
    logger.error(`Error checking badge eligibility: ${error.message}`);
  }
  
  logger.info(`Contribution verified: ${contribution.title}, Status: ${status}`);

  res.status(200).json({
    success: true,
    data: contribution
  });
}));

/**
 * @swagger
 * /contributions/{id}:
 *   delete:
 *     summary: Delete a contribution
 *     tags: [Contributions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contribution ID
 *     responses:
 *       200:
 *         description: Contribution deleted successfully
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Contribution not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const contribution = await Contribution.findById(req.params.id);
  
  if (!contribution) {
    return res.status(404).json({
      success: false,
      message: 'Contribution not found'
    });
  }

  // Check if user is the contributor or an admin
  if (contribution.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to delete this contribution'
    });
  }

  // Remove contribution from user's contributions array
  await User.findByIdAndUpdate(contribution.userId, {
    $pull: { contributions: contribution._id }
  });

  // Delete contribution
  await contribution.remove();
  
  logger.info(`Contribution deleted: ${contribution.title} by user: ${req.user.email}`);

  res.status(200).json({
    success: true,
    message: 'Contribution deleted successfully'
  });
}));

/**
 * @swagger
 * /contributions/user/{userId}:
 *   get:
 *     summary: Get all contributions by a specific user
 *     tags: [Contributions]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of user's contributions
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/user/:userId', asyncHandler(async (req, res) => {
  // Check if user exists
  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Extract query parameters
  const { page = 1, limit = 10 } = req.query;

  // Calculate pagination
  const startIndex = (Number(page) - 1) * Number(limit);
  const endIndex = Number(page) * Number(limit);
  const total = await Contribution.countDocuments({ userId: req.params.userId });

  // Find contributions for specified user
  const contributions = await Contribution.find({ userId: req.params.userId })
    .sort({ createdAt: -1 })
    .skip(startIndex)
    .limit(Number(limit))
    .populate('projectId', 'title githubLink thumbnailUrl')
    .populate('verifiedBy', 'name email');

  // Pagination results
  const pagination = {};
  if (endIndex < total) {
    pagination.next = {
      page: Number(page) + 1,
      limit: Number(limit)
    };
  }
  if (startIndex > 0) {
    pagination.prev = {
      page: Number(page) - 1,
      limit: Number(limit)
    };
  }

  res.status(200).json({
    success: true,
    count: contributions.length,
    pagination,
    totalPages: Math.ceil(total / Number(limit)),
    data: contributions
  });
}));

/**
 * @swagger
 * /contributions/project/{projectId}:
 *   get:
 *     summary: Get all contributions for a specific project
 *     tags: [Contributions]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of project contributions
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.get('/project/:projectId', asyncHandler(async (req, res) => {
  // Check if project exists
  const project = await Project.findById(req.params.projectId);
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  // Extract query parameters
  const { page = 1, limit = 10 } = req.query;

  // Calculate pagination
  const startIndex = (Number(page) - 1) * Number(limit);
  const endIndex = Number(page) * Number(limit);
  const total = await Contribution.countDocuments({ projectId: req.params.projectId });

  // Find contributions for specified project
  const contributions = await Contribution.find({ projectId: req.params.projectId })
    .sort({ createdAt: -1 })
    .skip(startIndex)
    .limit(Number(limit))
    .populate('userId', 'name email avatarUrl')
    .populate('verifiedBy', 'name email');

  // Pagination results
  const pagination = {};
  if (endIndex < total) {
    pagination.next = {
      page: Number(page) + 1,
      limit: Number(limit)
    };
  }
  if (startIndex > 0) {
    pagination.prev = {
      page: Number(page) - 1,
      limit: Number(limit)
    };
  }

  res.status(200).json({
    success: true,
    count: contributions.length,
    pagination,
    totalPages: Math.ceil(total / Number(limit)),
    data: contributions
  });
}));

export default router;