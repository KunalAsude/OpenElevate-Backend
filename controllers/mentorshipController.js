import mongoose from 'mongoose';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// Get Mentorship model or define it if not already defined elsewhere
let Mentorship;
try {
  Mentorship = mongoose.model('Mentorship');
} catch (e) {
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
  
  Mentorship = mongoose.model('Mentorship', MentorshipSchema);
}

/**
 * @desc    Request mentorship from a mentor
 * @route   POST /api/v1/mentorship
 * @access  Private
 */
export const requestMentorship = asyncHandler(async (req, res) => {
  const { mentorId, goals, skills = [] } = req.body;

  // Check if mentee is trying to mentor themselves
  if (mentorId === req.user.id) {
    throw new ApiError(400, 'You cannot request mentorship from yourself');
  }

  // Check if mentor exists and is a mentor
  const mentor = await User.findById(mentorId);
  if (!mentor) {
    throw new ApiError(404, 'Mentor not found');
  }

  if (!mentor.isMentor) {
    throw new ApiError(400, 'The selected user is not a mentor');
  }

  // Check if a mentorship already exists between these users
  const existingMentorship = await Mentorship.findOne({
    mentorId,
    menteeId: req.user.id,
    status: { $in: ['pending', 'active'] }
  });

  if (existingMentorship) {
    throw new ApiError(400, 'You already have a pending or active mentorship with this mentor');
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
});

/**
 * @desc    Get all mentorships for current user
 * @route   GET /api/v1/mentorship
 * @access  Private
 */
export const getMentorships = asyncHandler(async (req, res) => {
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
});

/**
 * @desc    Get a single mentorship by ID
 * @route   GET /api/v1/mentorship/:id
 * @access  Private
 */
export const getMentorshipById = asyncHandler(async (req, res) => {
  const mentorship = await Mentorship.findById(req.params.id)
    .populate('mentorId', 'name email avatarUrl skills bio socialLinks')
    .populate('menteeId', 'name email avatarUrl skills bio socialLinks');
  
  if (!mentorship) {
    throw new ApiError(404, 'Mentorship not found');
  }
  
  // Check if user is part of this mentorship
  if (mentorship.mentorId._id.toString() !== req.user.id && 
      mentorship.menteeId._id.toString() !== req.user.id && 
      req.user.role !== 'admin') {
    throw new ApiError(401, 'Not authorized to view this mentorship');
  }
  
  res.status(200).json({
    success: true,
    data: mentorship
  });
});

/**
 * @desc    Respond to a mentorship request (accept or reject)
 * @route   PUT /api/v1/mentorship/:id/respond
 * @access  Private (Mentor only)
 */
export const respondToMentorshipRequest = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  
  if (!['active', 'rejected'].includes(status)) {
    throw new ApiError(400, 'Status must be either active or rejected');
  }
  
  const mentorship = await Mentorship.findById(req.params.id);
  
  if (!mentorship) {
    throw new ApiError(404, 'Mentorship not found');
  }
  
  // Check if user is the mentor
  if (mentorship.mentorId.toString() !== req.user.id) {
    throw new ApiError(401, 'Only the mentor can respond to mentorship requests');
  }
  
  // Check if mentorship is in pending status
  if (mentorship.status !== 'pending') {
    throw new ApiError(400, 'This mentorship request has already been processed');
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
});

/**
 * @desc    Update a mentorship
 * @route   PUT /api/v1/mentorship/:id
 * @access  Private (Mentorship participants only)
 */
export const updateMentorship = asyncHandler(async (req, res) => {
  const { goals, notes, status, skills } = req.body;
  
  const mentorship = await Mentorship.findById(req.params.id);
  
  if (!mentorship) {
    throw new ApiError(404, 'Mentorship not found');
  }
  
  // Check if user is part of this mentorship
  if (mentorship.mentorId.toString() !== req.user.id && 
      mentorship.menteeId.toString() !== req.user.id) {
    throw new ApiError(401, 'Not authorized to update this mentorship');
  }
  
  // If transitioning to completed status, set endDate
  if (req.body.status === 'completed' && mentorship.status !== 'completed') {
    mentorship.endDate = new Date();
  }
  
  // Update fields if provided
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
});

/**
 * @desc    Get mentorship statistics
 * @route   GET /api/v1/mentorship/stats
 * @access  Admin only
 */
export const getMentorshipStats = asyncHandler(async (req, res) => {
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
});

/**
 * @desc    Get available mentors
 * @route   GET /api/v1/mentorship/mentors
 * @access  Public
 */
export const getAvailableMentors = asyncHandler(async (req, res) => {
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
});