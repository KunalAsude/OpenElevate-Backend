import express from 'express';
import { check, validationResult } from 'express-validator';
import { authMiddleware, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import User from '../models/User.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';

const router = express.Router();

// Define Mentorship schema if it doesn't exist elsewhere
const MentorshipSchema = new mongoose.Schema({
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  menteeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'rejected'],
    default: 'pending'
  },
  skills: [{
    type: String
  }],
  goals: {
    type: String,
    required: [true, 'Please provide mentorship goals'],
    maxlength: [500, 'Goals cannot be more than 500 characters']
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot be more than 1000 characters']
  },
  lastInteraction: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const Mentorship = mongoose.models.Mentorship || mongoose.model('Mentorship', MentorshipSchema);

/**
 * @swagger
 * /api/v1/mentorship:
 *   post:
 *     summary: Request mentorship from a mentor
 *     tags: [Mentorship]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mentorId
 *               - goals
 *             properties:
 *               mentorId:
 *                 type: string
 *               goals:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Mentorship request created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Mentor not found
 *       500:
 *         description: Server error
 */
router.post('/', authMiddleware, [
  check('mentorId').notEmpty().withMessage('Mentor ID is required').isMongoId().withMessage('Invalid mentor ID format'),
  check('goals').notEmpty().withMessage('Mentorship goals are required').isLength({ max: 500 }).withMessage('Goals cannot be more than 500 characters'),
  check('skills').optional().isArray().withMessage('Skills must be an array')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { mentorId, goals, skills = [] } = req.body;

  // Check if mentee is trying to mentor themselves
  if (mentorId === req.user.id) {
    return res.status(400).json({
      success: false,
      message: 'You cannot request mentorship from yourself'
    });
  }

  // Check if mentor exists and is a mentor
  const mentor = await User.findById(mentorId);
  if (!mentor) {
    return res.status(404).json({
      success: false,
      message: 'Mentor not found'
    });
  }

  if (!mentor.isMentor) {
    return res.status(400).json({
      success: false,
      message: 'The selected user is not a mentor'
    });
  }

  // Check if a mentorship already exists between these users
  const existingMentorship = await Mentorship.findOne({
    mentorId,
    menteeId: req.user.id,
    status: { $in: ['pending', 'active'] }
  });

  if (existingMentorship) {
    return res.status(400).json({
      success: false,
      message: 'You already have a pending or active mentorship with this mentor'
    });
  }

  // Create mentorship request
  const mentorship = await Mentorship.create({
    mentorId,
    menteeId: req.user.id,
    goals,
    skills,
    startDate: new Date(),
    status: 'pending'
  });

  logger.info(`New mentorship request created by: ${req.user.email} for mentor: ${mentor.email}`);

  res.status(201).json({
    success: true,
    data: mentorship
  });
}));

/**
 * @swagger
 * /api/v1/mentorship:
 *   get:
 *     summary: Get all mentorships for current user
 *     tags: [Mentorship]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by mentorship status
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by user role (mentor or mentee)
 *     responses:
 *       200:
 *         description: List of mentorships
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  const { status, role } = req.query;
  
  // Build filter
  const filter = {};
  if (status) filter.status = status;
  
  // Filter by role (mentor or mentee)
  if (role === 'mentor') {
    filter.mentorId = req.user.id;
  } else if (role === 'mentee') {
    filter.menteeId = req.user.id;
  } else {
    // If no role specified, get all mentorships where user is involved
    filter.$or = [
      { mentorId: req.user.id },
      { menteeId: req.user.id }
    ];
  }
  
  const mentorships = await Mentorship.find(filter)
    .populate('mentorId', 'name email avatarUrl')
    .populate('menteeId', 'name email avatarUrl')
    .sort('-createdAt');
  
  res.status(200).json({
    success: true,
    count: mentorships.length,
    data: mentorships
  });
}));

/**
 * @swagger
 * /api/v1/mentorship/{id}:
 *   get:
 *     summary: Get a single mentorship by ID
 *     tags: [Mentorship]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mentorship ID
 *     responses:
 *       200:
 *         description: Mentorship details
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Mentorship not found
 *       500:
 *         description: Server error
 */
router.get('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const mentorship = await Mentorship.findById(req.params.id)
    .populate('mentorId', 'name email avatarUrl skills bio socialLinks')
    .populate('menteeId', 'name email avatarUrl skills bio socialLinks');
  
  if (!mentorship) {
    return res.status(404).json({
      success: false,
      message: 'Mentorship not found'
    });
  }
  
  // Check if user is part of this mentorship
  if (mentorship.mentorId._id.toString() !== req.user.id && 
      mentorship.menteeId._id.toString() !== req.user.id && 
      req.user.role !== 'admin') {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to view this mentorship'
    });
  }
  
  res.status(200).json({
    success: true,
    data: mentorship
  });
}));

/**
 * @swagger
 * /api/v1/mentorship/{id}/respond:
 *   put:
 *     summary: Respond to a mentorship request (accept or reject)
 *     tags: [Mentorship]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mentorship ID
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
 *                 enum: [active, rejected]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Mentorship status updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Mentorship not found
 *       500:
 *         description: Server error
 */
router.put('/:id/respond', authMiddleware, [
  check('status').isIn(['active', 'rejected']).withMessage('Status must be either active or rejected'),
  check('notes').optional().isLength({ max: 1000 }).withMessage('Notes cannot be more than 1000 characters')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  const { status, notes } = req.body;
  
  const mentorship = await Mentorship.findById(req.params.id);
  
  if (!mentorship) {
    return res.status(404).json({
      success: false,
      message: 'Mentorship not found'
    });
  }
  
  // Check if user is the mentor
  if (mentorship.mentorId.toString() !== req.user.id) {
    return res.status(401).json({
      success: false,
      message: 'Only the mentor can respond to mentorship requests'
    });
  }
  
  // Check if mentorship is in pending status
  if (mentorship.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: 'This mentorship request has already been processed'
    });
  }
  
  // Update mentorship status
  mentorship.status = status;
  if (notes) mentorship.notes = notes;
  
  // Set endDate if rejected
  if (status === 'rejected') {
    mentorship.endDate = new Date();
  }
  
  await mentorship.save();
  
  // If accepted, update mentor's badge if they don't have it yet
  if (status === 'active') {
    try {
      // Find the 'Mentor' badge
      const Badge = mongoose.model('Badge');
      const mentorBadge = await Badge.findOne({
        title: 'Mentor',
        'conditions.type': 'special',
        'conditions.specialCondition': 'become_mentor'
      });
      
      if (mentorBadge) {
        const mentor = await User.findById(req.user.id);
        if (!mentor.badges.includes(mentorBadge._id)) {
          mentor.badges.push(mentorBadge._id);
          await mentor.save();
          logger.info(`Mentor badge awarded to user: ${mentor.email}`);
        }
      }
    } catch (error) {
      logger.error(`Error awarding mentor badge: ${error.message}`);
    }
  }
  
  logger.info(`Mentorship request ${status} by mentor: ${req.user.email}`);
  
  res.status(200).json({
    success: true,
    message: `Mentorship request ${status === 'active' ? 'accepted' : 'rejected'}`,
    data: mentorship
  });
}));

/**
 * @swagger
 * /api/v1/mentorship/{id}:
 *   put:
 *     summary: Update a mentorship
 *     tags: [Mentorship]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mentorship ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               goals:
 *                 type: string
 *               notes:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, completed]
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Mentorship updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Mentorship not found
 *       500:
 *         description: Server error
 */
router.put('/:id', authMiddleware, [
  check('goals').optional().isLength({ max: 500 }).withMessage('Goals cannot be more than 500 characters'),
  check('notes').optional().isLength({ max: 1000 }).withMessage('Notes cannot be more than 1000 characters'),
  check('status').optional().isIn(['active', 'completed']).withMessage('Status must be either active or completed'),
  check('skills').optional().isArray().withMessage('Skills must be an array')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  const mentorship = await Mentorship.findById(req.params.id);
  
  if (!mentorship) {
    return res.status(404).json({
      success: false,
      message: 'Mentorship not found'
    });
  }
  
  // Check if user is part of this mentorship
  if (mentorship.mentorId.toString() !== req.user.id && 
      mentorship.menteeId.toString() !== req.user.id) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to update this mentorship'
    });
  }
  
  // If transitioning to completed status, set endDate
  if (req.body.status === 'completed' && mentorship.status !== 'completed') {
    mentorship.endDate = new Date();
  }
  
  // Update fields if provided
  const { goals, notes, status, skills } = req.body;
  if (goals !== undefined) mentorship.goals = goals;
  if (notes !== undefined) mentorship.notes = notes;
  if (status !== undefined) mentorship.status = status;
  if (skills !== undefined) mentorship.skills = skills;
  
  // Update last interaction time
  mentorship.lastInteraction = new Date();
  
  await mentorship.save();
  
  logger.info(`Mentorship updated: ${mentorship._id}`);
  
  res.status(200).json({
    success: true,
    data: mentorship
  });
}));

/**
 * @swagger
 * /api/v1/mentorship/stats:
 *   get:
 *     summary: Get mentorship statistics
 *     tags: [Mentorship]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mentorship statistics
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/stats', authMiddleware, authorize('admin'), asyncHandler(async (req, res) => {
  // Get total mentorship count
  const totalMentorships = await Mentorship.countDocuments();
  
  // Get mentorship counts by status
  const statusCounts = await Mentorship.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  
  // Format status counts into an object
  const statusCountsObj = {};
  statusCounts.forEach(status => {
    statusCountsObj[status._id] = status.count;
  });
  
  // Get active mentors count
  const activeMentors = await User.countDocuments({ isMentor: true });
  
  // Get average mentorship duration for completed mentorships
  const completedMentorships = await Mentorship.find({ status: 'completed' });
  let averageDurationDays = 0;
  
  if (completedMentorships.length > 0) {
    const totalDurationMs = completedMentorships.reduce((sum, mentorship) => {
      const start = new Date(mentorship.startDate).getTime();
      const end = new Date(mentorship.endDate).getTime();
      return sum + (end - start);
    }, 0);
    
    averageDurationDays = Math.round(totalDurationMs / (1000 * 60 * 60 * 24) / completedMentorships.length);
  }
  
  // Get new mentorships in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const newMentorshipsLast30Days = await Mentorship.countDocuments({
    createdAt: { $gte: thirtyDaysAgo }
  });
  
  res.status(200).json({
    success: true,
    data: {
      totalMentorships,
      byStatus: statusCountsObj,
      activeMentors,
      averageDurationDays,
      newMentorshipsLast30Days
    }
  });
}));

/**
 * @swagger
 * /api/v1/mentorship/mentors:
 *   get:
 *     summary: Get available mentors
 *     tags: [Mentorship]
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
 *         description: List of available mentors
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
    .select('name email avatarUrl bio skills level lastActive')
    .sort('-lastActive')
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

export default router;