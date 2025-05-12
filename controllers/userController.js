const User = require('../models/User');
const { validateUserUpdate } = require('../utils/validators');
const { errorHandler } = require('../utils/errorHandler');
const logger = require('../config/winston');

/**
 * Get all users with optional filtering
 * @route GET /api/v1/users
 */
exports.getUsers = async (req, res) => {
  try {
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
  } catch (error) {
    logger.error(`Get users error: ${error.message}`);
    errorHandler(error, req, res);
  }
};

/**
 * Get user by ID
 * @route GET /api/v1/users/:id
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('badges')
      .populate({
        path: 'contributions',
        options: { sort: { createdAt: -1 }, limit: 10 }
      });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error(`Get user by ID error: ${error.message}`);
    errorHandler(error, req, res);
  }
};

/**
 * Update user profile
 * @route PUT /api/v1/users/:id
 */
exports.updateUser = async (req, res) => {
  try {
    // Only allow users to update their own profile (unless admin)
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this profile' });
    }

    // Validate request body
    const { error } = validateUserUpdate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
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
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.info(`User updated: ${user._id}`);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    logger.error(`Update user error: ${error.message}`);
    errorHandler(error, req, res);
  }
};

/**
 * Get user badges
 * @route GET /api/v1/users/:id/badges
 */
exports.getUserBadges = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('badges name')
      .populate('badges');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      data: user.badges
    });
  } catch (error) {
    logger.error(`Get user badges error: ${error.message}`);
    errorHandler(error, req, res);
  }
};

/**
 * Get user's position in leaderboard
 * @route GET /api/v1/users/:id/leaderboard
 */
exports.getUserLeaderboardPosition = async (req, res) => {
  try {
    // Find all users sorted by contribution points (or another metric)
    const users = await User.find()
      .select('_id name level contributions')
      .sort({ contributions: -1 });
    
    // Find the user's position
    const userIndex = users.findIndex(user => user._id.toString() === req.params.id);
    
    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: 'User not found' });
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
  } catch (error) {
    logger.error(`Get user leaderboard position error: ${error.message}`);
    errorHandler(error, req, res);
  }
};