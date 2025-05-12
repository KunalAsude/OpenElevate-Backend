import express from 'express';
import { check, validationResult } from 'express-validator';
import { authMiddleware, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';

const router = express.Router();

// Define Settings schema if not defined elsewhere
const SettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    required: false
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  category: {
    type: String,
    required: true,
    enum: ['general', 'email', 'appearance', 'security', 'advanced']
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now
  }
});

const Settings = mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);

// Initialize default settings if not exists
const initializeDefaultSettings = async () => {
  try {
    const defaultSettings = [
      {
        key: 'siteName',
        value: 'OpenElevate',
        description: 'Site name displayed across the platform',
        isPublic: true,
        category: 'general'
      },
      {
        key: 'siteDescription',
        value: 'Elevating your open source journey',
        description: 'Site description for SEO and branding',
        isPublic: true,
        category: 'general'
      },
      {
        key: 'contactEmail',
        value: 'contact@openelevate.org',
        description: 'Primary contact email for the site',
        isPublic: true,
        category: 'email'
      },
      {
        key: 'maintenanceMode',
        value: false,
        description: 'Enable maintenance mode',
        isPublic: false,
        category: 'advanced'
      },
      {
        key: 'signupEnabled',
        value: true,
        description: 'Allow new user registrations',
        isPublic: true,
        category: 'security'
      },
      {
        key: 'primaryColor',
        value: '#4A90E2',
        description: 'Primary theme color',
        isPublic: true,
        category: 'appearance'
      },
      {
        key: 'secondaryColor',
        value: '#50E3C2',
        description: 'Secondary theme color',
        isPublic: true,
        category: 'appearance'
      },
      {
        key: 'maxProjectsPerUser',
        value: 10,
        description: 'Maximum number of projects a regular user can create',
        isPublic: true,
        category: 'general'
      },
      {
        key: 'maxMentorshipsPerMentor',
        value: 5,
        description: 'Maximum active mentorships per mentor',
        isPublic: true,
        category: 'general'
      },
      {
        key: 'featuredProjectsCount',
        value: 6,
        description: 'Number of featured projects to show on homepage',
        isPublic: true,
        category: 'general'
      }
    ];

    for (const setting of defaultSettings) {
      const exists = await Settings.findOne({ key: setting.key });
      if (!exists) {
        await Settings.create(setting);
        logger.info(`Default setting created: ${setting.key}`);
      }
    }
  } catch (error) {
    logger.error(`Error initializing default settings: ${error.message}`);
  }
};

// Initialize default settings when the module is loaded
initializeDefaultSettings();

/**
 * @swagger
 * /api/v1/settings:
 *   get:
 *     summary: Get all public settings or all settings for admin
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter settings by category
 *     responses:
 *       200:
 *         description: List of settings
 *       500:
 *         description: Server error
 */
router.get('/', asyncHandler(async (req, res) => {
  const { category } = req.query;
  
  // Determine if user is admin
  const isAdmin = req.user && req.user.role === 'admin';
  
  // Build filter
  const filter = {};
  if (category) filter.category = category;
  
  // Non-admins can only see public settings
  if (!isAdmin) {
    filter.isPublic = true;
  }
  
  const settings = await Settings.find(filter).sort('key');
  
  res.status(200).json({
    success: true,
    count: settings.length,
    data: settings
  });
}));

/**
 * @swagger
 * /api/v1/settings/{key}:
 *   get:
 *     summary: Get a specific setting by key
 *     tags: [Settings]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Setting key
 *     responses:
 *       200:
 *         description: Setting details
 *       404:
 *         description: Setting not found
 *       403:
 *         description: Not authorized to view this setting
 *       500:
 *         description: Server error
 */
router.get('/:key', asyncHandler(async (req, res) => {
  const setting = await Settings.findOne({ key: req.params.key });
  
  if (!setting) {
    return res.status(404).json({
      success: false,
      message: 'Setting not found'
    });
  }
  
  // Check if user can access this setting
  const isAdmin = req.user && req.user.role === 'admin';
  if (!setting.isPublic && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this setting'
    });
  }
  
  res.status(200).json({
    success: true,
    data: setting
  });
}));

/**
 * @swagger
 * /api/v1/settings:
 *   post:
 *     summary: Create a new setting
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *               - value
 *               - category
 *             properties:
 *               key:
 *                 type: string
 *               value:
 *                 type: object
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *               category:
 *                 type: string
 *                 enum: [general, email, appearance, security, advanced]
 *     responses:
 *       201:
 *         description: Setting created successfully
 *       400:
 *         description: Invalid input or setting already exists
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/', authMiddleware, authorize('admin'), [
  check('key').notEmpty().withMessage('Key is required').trim(),
  check('value').notEmpty().withMessage('Value is required'),
  check('category').isIn(['general', 'email', 'appearance', 'security', 'advanced']).withMessage('Invalid category'),
  check('isPublic').optional().isBoolean().withMessage('isPublic must be a boolean'),
  check('description').optional().trim()
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  const { key, value, description, isPublic = false, category } = req.body;
  
  // Check if setting already exists
  const existingSetting = await Settings.findOne({ key });
  if (existingSetting) {
    return res.status(400).json({
      success: false,
      message: 'Setting with this key already exists'
    });
  }
  
  // Create setting
  const setting = await Settings.create({
    key,
    value,
    description,
    isPublic,
    category,
    lastModifiedBy: req.user.id,
    lastModifiedAt: new Date()
  });
  
  logger.info(`New setting created: ${key} by admin: ${req.user.email}`);
  
  res.status(201).json({
    success: true,
    data: setting
  });
}));

/**
 * @swagger
 * /api/v1/settings/{key}:
 *   put:
 *     summary: Update a setting
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Setting key
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 type: object
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *               category:
 *                 type: string
 *                 enum: [general, email, appearance, security, advanced]
 *     responses:
 *       200:
 *         description: Setting updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Setting not found
 *       500:
 *         description: Server error
 */
router.put('/:key', authMiddleware, authorize('admin'), [
  check('value').optional(),
  check('category').optional().isIn(['general', 'email', 'appearance', 'security', 'advanced']).withMessage('Invalid category'),
  check('isPublic').optional().isBoolean().withMessage('isPublic must be a boolean'),
  check('description').optional().trim()
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  const { value, description, isPublic, category } = req.body;
  
  // Find setting
  const setting = await Settings.findOne({ key: req.params.key });
  if (!setting) {
    return res.status(404).json({
      success: false,
      message: 'Setting not found'
    });
  }
  
  // Update fields if provided
  if (value !== undefined) setting.value = value;
  if (description !== undefined) setting.description = description;
  if (isPublic !== undefined) setting.isPublic = isPublic;
  if (category !== undefined) setting.category = category;
  
  // Update modification metadata
  setting.lastModifiedBy = req.user.id;
  setting.lastModifiedAt = new Date();
  
  await setting.save();
  
  logger.info(`Setting updated: ${req.params.key} by admin: ${req.user.email}`);
  
  res.status(200).json({
    success: true,
    data: setting
  });
}));

/**
 * @swagger
 * /api/v1/settings/{key}:
 *   delete:
 *     summary: Delete a setting
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Setting key
 *     responses:
 *       200:
 *         description: Setting deleted successfully
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Setting not found
 *       500:
 *         description: Server error
 */
router.delete('/:key', authMiddleware, authorize('admin'), asyncHandler(async (req, res) => {
  // Find setting
  const setting = await Settings.findOne({ key: req.params.key });
  if (!setting) {
    return res.status(404).json({
      success: false,
      message: 'Setting not found'
    });
  }
  
  await setting.deleteOne();
  
  logger.info(`Setting deleted: ${req.params.key} by admin: ${req.user.email}`);
  
  res.status(200).json({
    success: true,
    message: 'Setting deleted successfully'
  });
}));

/**
 * @swagger
 * /api/v1/settings/bulk/update:
 *   put:
 *     summary: Update multiple settings at once
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - settings
 *             properties:
 *               settings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - key
 *                     - value
 *                   properties:
 *                     key:
 *                       type: string
 *                     value:
 *                       type: object
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.put('/bulk/update', authMiddleware, authorize('admin'), [
  check('settings').isArray().withMessage('Settings must be an array').notEmpty().withMessage('Settings array is required')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  const { settings } = req.body;
  
  const results = {
    success: [],
    failed: []
  };
  
  // Process each setting update
  for (const setting of settings) {
    const { key, value } = setting;
    
    if (!key || value === undefined) {
      results.failed.push({ key, error: 'Missing key or value' });
      continue;
    }
    
    try {
      const existingSetting = await Settings.findOne({ key });
      
      if (!existingSetting) {
        results.failed.push({ key, error: 'Setting not found' });
        continue;
      }
      
      existingSetting.value = value;
      existingSetting.lastModifiedBy = req.user.id;
      existingSetting.lastModifiedAt = new Date();
      
      await existingSetting.save();
      results.success.push(key);
      
      logger.info(`Setting updated in bulk: ${key} by admin: ${req.user.email}`);
    } catch (error) {
      results.failed.push({ key, error: error.message });
      logger.error(`Error updating setting ${key} in bulk: ${error.message}`);
    }
  }
  
  res.status(200).json({
    success: true,
    message: `Updated ${results.success.length} settings, failed ${results.failed.length}`,
    data: results
  });
}));

/**
 * @swagger
 * /api/v1/settings/restore/defaults:
 *   post:
 *     summary: Restore default settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings restored to defaults
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/restore/defaults', authMiddleware, authorize('admin'), asyncHandler(async (req, res) => {
  try {
    // Delete all existing settings
    await Settings.deleteMany({});
    
    // Reinitialize default settings
    await initializeDefaultSettings();
    
    logger.info(`All settings restored to defaults by admin: ${req.user.email}`);
    
    res.status(200).json({
      success: true,
      message: 'Settings restored to defaults'
    });
  } catch (error) {
    logger.error(`Error restoring default settings: ${error.message}`);
    throw new ApiError(500, 'Error restoring default settings');
  }
}));

export default router;