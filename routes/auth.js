import express from 'express';
import { check, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import User from '../models/User.js';
import { sendEmail } from '../utils/email.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import config from '../config/index.js';

const router = express.Router();

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               role:
 *                 type: string
 *                 enum: [developer, client, mentor]
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/register', [
  check('name', 'Name is required').not().isEmpty(),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Please enter a password with 8 or more characters').isLength({ min: 8 }),
  check('role').optional().isIn(['developer', 'client', 'mentor'])
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, email, password, role = 'developer' } = req.body;

  // Check if user already exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({
      success: false, 
      message: 'User already exists'
    });
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    role,
    isMentor: role === 'mentor',
    isClient: role === 'client'
  });

  // Generate auth token
  const token = user.getSignedJwtToken();

  // Update lastActive
  user.lastActive = Date.now();
  await user.save();

  logger.info(`New user registered: ${user.email}`);

  res.status(201).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isMentor: user.isMentor,
      isClient: user.isClient,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt
    }
  });
}));

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Log in a user and get an auth token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Server error
 */
router.post('/login', [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').exists()
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, password } = req.body;

  // Find user
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return res.status(401).json({
      success: false, 
      message: 'Invalid credentials'
    });
  }

  // Match password
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({
      success: false, 
      message: 'Invalid credentials'
    });
  }

  // Generate auth token
  const token = user.getSignedJwtToken();

  // Update lastActive
  user.lastActive = Date.now();
  await user.save({ validateBeforeSave: false });

  logger.info(`User logged in: ${user.email}`);

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isMentor: user.isMentor,
      isClient: user.isClient,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt
    }
  });
}));

/**
 * @swagger
 * /api/v1/auth/logout:
 *   get:
 *     summary: Logout current user (client-side only)
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.get('/logout', (req, res) => {
  // JWT is stateless so actual logout happens on the client side
  // This endpoint exists for API consistency
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current logged in user's profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 *       401:
 *         description: Not authorized
 */
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .populate('badges')
    .populate('contributions');

  // Update lastActive
  user.lastActive = Date.now();
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    data: user
  });
}));

/**
 * @swagger
 * /api/v1/auth/update-profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               bio:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               level:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *               socialLinks:
 *                 type: object
 *                 properties:
 *                   github:
 *                     type: string
 *                   linkedin:
 *                     type: string
 *                   twitter:
 *                     type: string
 *                   website:
 *                     type: string
 *               avatarUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 */
router.put('/update-profile', authMiddleware, [
  check('name').optional().notEmpty().withMessage('Name cannot be empty'),
  check('bio').optional().isLength({ max: 500 }).withMessage('Bio cannot be more than 500 characters'),
  check('skills').optional().isArray().withMessage('Skills must be an array'),
  check('level').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Level must be beginner, intermediate, or advanced'),
  check('socialLinks.github').optional().isURL().withMessage('GitHub link must be a valid URL'),
  check('socialLinks.linkedin').optional().isURL().withMessage('LinkedIn link must be a valid URL'),
  check('socialLinks.twitter').optional().isURL().withMessage('Twitter link must be a valid URL'),
  check('socialLinks.website').optional().isURL().withMessage('Website link must be a valid URL'),
  check('avatarUrl').optional().isURL().withMessage('Avatar URL must be a valid URL')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const {
    name,
    bio,
    skills,
    level,
    socialLinks,
    avatarUrl
  } = req.body;

  const updateData = {};

  // Only update fields that were actually passed
  if (name) updateData.name = name;
  if (bio !== undefined) updateData.bio = bio;
  if (skills) updateData.skills = skills;
  if (level) updateData.level = level;
  if (socialLinks) {
    updateData.socialLinks = { ...req.user.socialLinks };
    if (socialLinks.github !== undefined) updateData.socialLinks.github = socialLinks.github;
    if (socialLinks.linkedin !== undefined) updateData.socialLinks.linkedin = socialLinks.linkedin;
    if (socialLinks.twitter !== undefined) updateData.socialLinks.twitter = socialLinks.twitter;
    if (socialLinks.website !== undefined) updateData.socialLinks.website = socialLinks.website;
  }
  if (avatarUrl) updateData.avatarUrl = avatarUrl;

  // Update user
  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    updateData,
    { new: true, runValidators: true }
  );

  // Recalculate profile completeness
  updatedUser.profileCompleteness = updatedUser.calculateProfileCompleteness();
  await updatedUser.save({ validateBeforeSave: false });

  logger.info(`User profile updated: ${updatedUser.email}`);

  res.status(200).json({
    success: true,
    data: updatedUser
  });
}));

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   put:
 *     summary: Change user password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Current password is incorrect
 */
router.put('/change-password', authMiddleware, [
  check('currentPassword', 'Current password is required').exists(),
  check('newPassword', 'New password must be at least 8 characters').isLength({ min: 8 })
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const user = await User.findById(req.user.id).select('+password');

  // Check current password
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    return res.status(401).json({
      success: false, 
      message: 'Current password is incorrect'
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  logger.info(`User changed password: ${user.email}`);

  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
}));

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request password reset email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset email sent
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post('/forgot-password', [
  check('email', 'Please include a valid email').isEmail()
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email } = req.body;

  // Find user
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({
      success: false, 
      message: 'User not found'
    });
  }

  // Generate reset token
  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  // Create reset URL
  const resetUrl = `${config.frontendUrl}/reset-password/${resetToken}`;

  // Create email message
  const message = `
    You are receiving this email because you (or someone else) has requested a password reset.
    Please click the link below to reset your password:
    ${resetUrl}
    This link will expire in 10 minutes.
    If you did not request this, please ignore this email and your password will remain unchanged.
  `;

  try {
    await sendEmail({
      to: user.email,
      subject: 'OpenElevate Password Reset',
      text: message
    });

    logger.info(`Password reset email sent to: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Reset email sent'
    });
  } catch (error) {
    logger.error(`Error sending password reset email: ${error.message}`);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });

    throw new ApiError(500, 'Could not send reset email');
  }
}));

/**
 * @swagger
 * /api/v1/auth/reset-password/{token}:
 *   put:
 *     summary: Reset password with token
 *     tags: [Authentication]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Password reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 *       500:
 *         description: Server error
 */
router.put('/reset-password/:token', [
  check('password', 'Password must be at least 8 characters').isLength({ min: 8 })
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  // Find user with token and valid expiry
  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({
      success: false, 
      message: 'Invalid or expired token'
    });
  }

  // Set new password
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  logger.info(`User reset password: ${user.email}`);

  // Generate new auth token
  const token = user.getSignedJwtToken();

  res.status(200).json({
    success: true,
    message: 'Password reset successful',
    token
  });
}));

export default router;