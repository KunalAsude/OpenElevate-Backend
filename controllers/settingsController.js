import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// Get Settings model or define it if not already defined elsewhere
let Settings;
try {
  Settings = mongoose.model('Settings');
} catch (e) {
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
  Settings = mongoose.model('Settings', SettingsSchema);
}

// Initialize default settings
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
 * @desc    Get all settings (public for all, all for admin)
 * @route   GET /settings
 * @access  Public/Admin
 */
export const getAllSettings = asyncHandler(async (req, res) => {
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
});

/**
 * @desc    Get a specific setting by key
 * @route   GET /settings/:key
 * @access  Public/Admin
 */
export const getSettingByKey = asyncHandler(async (req, res) => {
  const setting = await Settings.findOne({ key: req.params.key });
  
  if (!setting) {
    throw new ApiError(404, 'Setting not found');
  }
  
  // Check if user can access this setting
  const isAdmin = req.user && req.user.role === 'admin';
  if (!setting.isPublic && !isAdmin) {
    throw new ApiError(403, 'Not authorized to view this setting');
  }
  
  res.status(200).json({
    success: true,
    data: setting
  });
});

/**
 * @desc    Create a new setting
 * @route   POST /settings
 * @access  Admin
 */
export const createSetting = asyncHandler(async (req, res) => {
  const { key, value, description, isPublic = false, category } = req.body;
  
  // Check if setting already exists
  const existingSetting = await Settings.findOne({ key });
  if (existingSetting) {
    throw new ApiError(400, 'Setting with this key already exists');
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
});

/**
 * @desc    Update a setting
 * @route   PUT /settings/:key
 * @access  Admin
 */
export const updateSetting = asyncHandler(async (req, res) => {
  const { value, description, isPublic, category } = req.body;
  
  // Find setting
  const setting = await Settings.findOne({ key: req.params.key });
  if (!setting) {
    throw new ApiError(404, 'Setting not found');
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
});

/**
 * @desc    Delete a setting
 * @route   DELETE /settings/:key
 * @access  Admin
 */
export const deleteSetting = asyncHandler(async (req, res) => {
  // Find setting
  const setting = await Settings.findOne({ key: req.params.key });
  if (!setting) {
    throw new ApiError(404, 'Setting not found');
  }
  
  await setting.deleteOne();
  
  logger.info(`Setting deleted: ${req.params.key} by admin: ${req.user.email}`);
  
  res.status(200).json({
    success: true,
    message: 'Setting deleted successfully'
  });
});

/**
 * @desc    Update multiple settings at once
 * @route   PUT /settings/bulk/update
 * @access  Admin
 */
export const updateBulkSettings = asyncHandler(async (req, res) => {
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
});

/**
 * @desc    Restore default settings
 * @route   POST /settings/restore/defaults
 * @access  Admin
 */
export const restoreDefaultSettings = asyncHandler(async (req, res) => {
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
});