import express from 'express';
import { check, validationResult } from 'express-validator';
import { authMiddleware, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by user role
 *       - in: query
 *         name: isMentor
 *         schema:
 *           type: boolean
 *         description: Filter by mentor status
 *       - in: query
 *         name: skills
 *         schema:
 *           type: string
 *         description: Filter by skills (comma-separated)
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *         description: Filter by skill level
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
 *         description: List of users
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  const { role, isMentor, skills, level, page = 1, limit = 10, sort = '-createdAt' } = req.query;
  
  // Build filter
  const filter = {};
  if (role) filter.role = role;
  if (isMentor !== undefined) filter.isMentor = isMentor === 'true';
  if (level) filter.level = level;
  if (skills) {
    const skillsArray = skills.split(',').map(skill => skill.trim());
    filter.skills = { $in: skillsArray };
  }
  
  // Calculate pagination
  const startIndex = (Number(page) - 1) * Number(limit);
  const endIndex = Number(page) * Number(limit);
  const total = await User.countDocuments(filter);
  
  // Find users with filter and pagination
  const users = await User.find(filter)
    .select('-password')
    .sort(sort)
    .skip(startIndex)
    .limit(Number(limit));
  
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
    count: users.length,
    pagination,
    totalPages: Math.ceil(total / Number(limit)),
    data: users
  });
}));

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get a single user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-password')
    .populate('badges')
    .populate({
      path: 'contributions',
      select: 'title description type status link points createdAt',
      options: { limit: 5, sort: { createdAt: -1 } }
    });
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  res.status(200).json({
    success: true,
    data: user
  });
}));

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     summary: Update a user (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *               isMentor:
 *                 type: boolean
 *               isClient:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.put('/:id', authMiddleware, authorize('admin'), [
  check('name').optional().notEmpty().withMessage('Name cannot be empty'),
  check('email').optional().isEmail().withMessage('Please include a valid email'),
  check('role').optional().isIn(['developer', 'client', 'mentor', 'admin']).withMessage('Invalid role'),
  check('isMentor').optional().isBoolean().withMessage('isMentor must be a boolean'),
  check('isClient').optional().isBoolean().withMessage('isClient must be a boolean')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  // Find user
  let user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  // Update user
  user = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  }).select('-password');
  
  logger.info(`User updated by admin: ${user.email}`);
  
  res.status(200).json({
    success: true,
    data: user
  });
}));

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: Delete a user (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       401:
 *         description: Not authorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', authMiddleware, authorize('admin'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  // Delete user
  await user.remove();
  
  logger.info(`User deleted: ${user.email}`);
  
  res.status(200).json({
    success: true,
    message: 'User deleted successfully'
  });
}));

/**
 * @swagger
 * /api/v1/users/mentors:
 *   get:
 *     summary: Get all mentors
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: skills
 *         schema:
 *           type: string
 *         description: Filter by skills (comma-separated)
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
 *         description: List of mentors
 *       500:
 *         description: Server error
 */
router.get('/mentors', asyncHandler(async (req, res) => {
  const { skills, page = 1, limit = 10 } = req.query;
  
  // Build filter
  const filter = { isMentor: true };
  if (skills) {
    const skillsArray = skills.split(',').map(skill => skill.trim());
    filter.skills = { $in: skillsArray };
  }
  
  // Calculate pagination
  const startIndex = (Number(page) - 1) * Number(limit);
  const endIndex = Number(page) * Number(limit);
  const total = await User.countDocuments(filter);
  
  // Find mentors with filter and pagination
  const mentors = await User.find(filter)
    .select('-password')
    .sort('-createdAt')
    .skip(startIndex)
    .limit(Number(limit));
  
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
    count: mentors.length,
    pagination,
    totalPages: Math.ceil(total / Number(limit)),
    data: mentors
  });
}));

/**
 * @swagger
 * /api/v1/users/skills:
 *   get:
 *     summary: Get all unique skills across users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of unique skills
 *       500:
 *         description: Server error
 */
router.get('/skills', asyncHandler(async (req, res) => {
  const users = await User.find().select('skills');
  
  // Extract unique skills from all users
  const allSkills = users.flatMap(user => user.skills);
  const uniqueSkills = [...new Set(allSkills)].filter(Boolean).sort();
  
  res.status(200).json({
    success: true,
    count: uniqueSkills.length,
    data: uniqueSkills
  });
}));

/**
 * @swagger
 * /api/v1/users/search:
 *   get:
 *     summary: Search users by name or email
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term
 *     responses:
 *       200:
 *         description: List of matching users
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/search', authMiddleware, asyncHandler(async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a search term'
    });
  }
  
  const users = await User.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } }
    ]
  }).select('-password');
  
  res.status(200).json({
    success: true,
    count: users.length,
    data: users
  });
}));

/**
 * @swagger
 * /api/v1/users/stats:
 *   get:
 *     summary: Get user statistics (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/stats', authMiddleware, authorize('admin'), asyncHandler(async (req, res) => {
  // Get total user count
  const totalUsers = await User.countDocuments();
  
  // Get user counts by role
  const roleCounts = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } }
  ]);
  
  // Format role counts into an object
  const roleCountsObj = {};
  roleCounts.forEach(role => {
    roleCountsObj[role._id] = role.count;
  });
  
  // Get mentor count
  const mentorCount = await User.countDocuments({ isMentor: true });
  
  // Get client count
  const clientCount = await User.countDocuments({ isClient: true });
  
  // Get new users in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const newUsersLast30Days = await User.countDocuments({
    createdAt: { $gte: thirtyDaysAgo }
  });
  
  // Get active users in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const activeUsersLast7Days = await User.countDocuments({
    lastActive: { $gte: sevenDaysAgo }
  });
  
  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      byRole: roleCountsObj,
      mentorCount,
      clientCount,
      newUsersLast30Days,
      activeUsersLast7Days
    }
  });
}));

export default router;