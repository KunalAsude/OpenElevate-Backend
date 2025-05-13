import express from 'express';
import { check, validationResult } from 'express-validator';
import { authMiddleware, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Badge from '../models/Badge.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /badges:
 *   get:
 *     summary: Get all badges
 *     tags: [Badges]
 *     parameters:
 *       - in: query
 *         name: rarity
 *         schema:
 *           type: string
 *         description: Filter by badge rarity
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of badges
 *       500:
 *         description: Server error
 */
router.get('/', asyncHandler(async (req, res) => {
  const { rarity, isActive } = req.query;
  
  // Build filter
  const filter = {};
  if (rarity) filter.rarity = rarity;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  
  const badges = await Badge.find(filter).sort({ pointsAwarded: -1 });
  
  res.status(200).json({
    success: true,
    count: badges.length,
    data: badges
  });
}));

/**
 * @swagger
 * /badges/{id}:
 *   get:
 *     summary: Get a single badge by ID
 *     tags: [Badges]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Badge ID
 *     responses:
 *       200:
 *         description: Badge details
 *       404:
 *         description: Badge not found
 *       500:
 *         description: Server error
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const badge = await Badge.findById(req.params.id);
  
  if (!badge) {
    return res.status(404).json({
      success: false,
      message: 'Badge not found'
    });
  }
  
  res.status(200).json({
    success: true,
    data: badge
  });
}));

/**
 * @swagger
 * /badges:
 *   post:
 *     summary: Create a new badge
 *     tags: [Badges]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - iconUrl
 *               - conditions
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               iconUrl:
 *                 type: string
 *               conditions:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [contribution_count, project_count, time_active, skill_level, special]
 *                   count:
 *                     type: number
 *                   skill:
 *                     type: string
 *                   specialCondition:
 *                     type: string
 *               rarity:
 *                 type: string
 *                 enum: [common, uncommon, rare, epic, legendary]
 *               pointsAwarded:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Badge created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/', authMiddleware, authorize('admin'), [
  check('title').notEmpty().withMessage('Title is required').isLength({ max: 50 }).withMessage('Title cannot be more than 50 characters'),
  check('description').notEmpty().withMessage('Description is required').isLength({ max: 200 }).withMessage('Description cannot be more than 200 characters'),
  check('iconUrl').notEmpty().withMessage('Icon URL is required'),
  check('conditions.type').isIn(['contribution_count', 'project_count', 'time_active', 'skill_level', 'special']).withMessage('Invalid condition type'),
  check('conditions.count').optional().isNumeric().withMessage('Count must be a number'),
  check('rarity').optional().isIn(['common', 'uncommon', 'rare', 'epic', 'legendary']).withMessage('Invalid rarity value'),
  check('pointsAwarded').optional().isNumeric().withMessage('Points awarded must be a number'),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  // Create badge
  const badge = await Badge.create(req.body);
  
  logger.info(`New badge created: ${badge.title}`);
  
  res.status(201).json({
    success: true,
    data: badge
  });
}));

/**
 * @swagger
 * /badges/{id}:
 *   put:
 *     summary: Update a badge
 *     tags: [Badges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Badge ID
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
 *               iconUrl:
 *                 type: string
 *               conditions:
 *                 type: object
 *               rarity:
 *                 type: string
 *               pointsAwarded:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Badge updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Badge not found
 *       500:
 *         description: Server error
 */
router.put('/:id', authMiddleware, authorize('admin'), [
  check('title').optional().notEmpty().withMessage('Title cannot be empty').isLength({ max: 50 }).withMessage('Title cannot be more than 50 characters'),
  check('description').optional().notEmpty().withMessage('Description cannot be empty').isLength({ max: 200 }).withMessage('Description cannot be more than 200 characters'),
  check('iconUrl').optional().notEmpty().withMessage('Icon URL cannot be empty'),
  check('conditions.type').optional().isIn(['contribution_count', 'project_count', 'time_active', 'skill_level', 'special']).withMessage('Invalid condition type'),
  check('conditions.count').optional().isNumeric().withMessage('Count must be a number'),
  check('rarity').optional().isIn(['common', 'uncommon', 'rare', 'epic', 'legendary']).withMessage('Invalid rarity value'),
  check('pointsAwarded').optional().isNumeric().withMessage('Points awarded must be a number'),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  // Find badge
  let badge = await Badge.findById(req.params.id);
  
  if (!badge) {
    return res.status(404).json({
      success: false,
      message: 'Badge not found'
    });
  }
  
  // Update badge
  badge = await Badge.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  logger.info(`Badge updated: ${badge.title}`);
  
  res.status(200).json({
    success: true,
    data: badge
  });
}));

/**
 * @swagger
 * /badges/{id}:
 *   delete:
 *     summary: Delete a badge
 *     tags: [Badges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Badge ID
 *     responses:
 *       200:
 *         description: Badge deleted successfully
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Badge not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', authMiddleware, authorize('admin'), asyncHandler(async (req, res) => {
  const badge = await Badge.findById(req.params.id);
  
  if (!badge) {
    return res.status(404).json({
      success: false,
      message: 'Badge not found'
    });
  }
  
  // Remove badge from all users who have it
  await User.updateMany(
    { badges: badge._id },
    { $pull: { badges: badge._id } }
  );
  
  // Delete badge
  await badge.remove();
  
  logger.info(`Badge deleted: ${badge.title}`);
  
  res.status(200).json({
    success: true,
    message: 'Badge deleted successfully'
  });
}));

/**
 * @swagger
 * /badges/create-default:
 *   post:
 *     summary: Create default system badges
 *     tags: [Badges]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default badges created successfully
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/create-default', authMiddleware, authorize('admin'), asyncHandler(async (req, res) => {
  await Badge.createDefaultBadges();
  
  logger.info('Default badges created');
  
  res.status(200).json({
    success: true,
    message: 'Default badges created successfully'
  });
}));

/**
 * @swagger
 * /badges/user/{userId}:
 *   get:
 *     summary: Get all badges for a specific user
 *     tags: [Badges]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of user's badges
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/user/:userId', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).populate('badges');
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  res.status(200).json({
    success: true,
    count: user.badges.length,
    data: user.badges
  });
}));

/**
 * @swagger
 * /badges/award/{userId}:
 *   post:
 *     summary: Award a badge to a user
 *     tags: [Badges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - badgeId
 *             properties:
 *               badgeId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Badge awarded successfully
 *       400:
 *         description: Invalid input or user already has badge
 *       401:
 *         description: Not authorized
 *       404:
 *         description: User or badge not found
 *       500:
 *         description: Server error
 */
router.post('/award/:userId', authMiddleware, authorize('admin', 'mentor'), [
  check('badgeId').notEmpty().withMessage('Badge ID is required').isMongoId().withMessage('Invalid badge ID')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  const { badgeId } = req.body;
  
  // Find user
  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  // Find badge
  const badge = await Badge.findById(badgeId);
  if (!badge) {
    return res.status(404).json({
      success: false,
      message: 'Badge not found'
    });
  }
  
  // Check if user already has the badge
  if (user.badges.includes(badgeId)) {
    return res.status(400).json({
      success: false,
      message: 'User already has this badge'
    });
  }
  
  // Award badge
  user.badges.push(badgeId);
  await user.save();
  
  logger.info(`Badge "${badge.title}" awarded to user: ${user.email}`);
  
  res.status(200).json({
    success: true,
    message: `Badge "${badge.title}" awarded to ${user.name}`,
    data: badge
  });
}));

export default router;