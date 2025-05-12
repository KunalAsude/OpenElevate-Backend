const Project = require('../models/Project');
const User = require('../models/User');
const { validateProject, validateProjectUpdate } = require('../utils/validators');
const { errorHandler } = require('../utils/errorHandler');
const logger = require('../config/winston');

/**
 * Create a new project
 * @route POST /api/v1/projects
 */
exports.createProject = async (req, res) => {
  try {
    // Validate request body
    const { error } = validateProject(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    // Only verified clients or admins can create projects
    if (req.user.role !== 'client' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Only verified clients or admins can create projects' 
      });
    }

    const {
      title,
      description,
      techStack,
      difficulty,
      type,
      githubLink,
      tags
    } = req.body;

    // Create project
    const project = new Project({
      title,
      description,
      techStack,
      difficulty,
      type,
      githubLink,
      tags,
      creatorId: req.user.id
    });

    // Handle thumbnail upload if available
    // if (req.file) {
    //   project.thumbnailUrl = req.file.path;
    // }

    await project.save();

    logger.info(`New project created: ${project.title} by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project
    });
  } catch (error) {
    logger.error(`Create project error: ${error.message}`);
    errorHandler(error, req, res);
  }
};

/**
 * Get all projects with optional filtering
 * @route GET /api/v1/projects
 */
exports.getProjects = async (req, res) => {
  try {
    const {
      stack,
      level,
      tag,
      type,
      status,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    
    // Apply filters if provided
    if (stack) query.techStack = { $in: [stack] };
    if (level) query.difficulty = level;
    if (tag) query.tags = { $in: [tag] };
    if (type) query.type = type;
    if (status) query.status = status;

    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Sort order
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const projects = await Project.find(query)
      .populate('creatorId', 'name profileImage')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Project.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: projects.length,
      total,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      },
      data: projects
    });
  } catch (error) {
    logger.error(`Get projects error: ${error.message}`);
    errorHandler(error, req, res);
  }
};

/**
 * Get project by ID
 * @route GET /api/v1/projects/:id
 */
exports.getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('creatorId', 'name profileImage email')
      .populate('contributors', 'name profileImage');

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Increment view count
    project.viewCount += 1;
    await project.save();

    res.status(200).json({
      success: true,
      data: project
    });
  } catch (error) {
    logger.error(`Get project by ID error: ${error.message}`);
    errorHandler(error, req, res);
  }
};

/**
 * Update project
 * @route PUT /api/v1/projects/:id
 */
exports.updateProject = async (req, res) => {
  try {
    // Validate request body
    const { error } = validateProjectUpdate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    // Find project
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Check if user is authorized to update (creator or admin)
    if (project.creatorId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to update this project' 
      });
    }

    const {
      title,
      description,
      techStack,
      difficulty,
      type,
      status,
      githubLink,
      tags
    } = req.body;

    // Create update object
    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (techStack) updateData.techStack = techStack;
    if (difficulty) updateData.difficulty = difficulty;
    if (type) updateData.type = type;
    if (status) updateData.status = status;
    if (githubLink) updateData.githubLink = githubLink;
    if (tags) updateData.tags = tags;

    // Handle thumbnail update if available
    // if (req.file) {
    //   updateData.thumbnailUrl = req.file.path;
    // }

    // Update project
    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).populate('creatorId', 'name profileImage email');

    logger.info(`Project updated: ${updatedProject._id} by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      data: updatedProject
    });
  } catch (error) {
    logger.error(`Update project error: ${error.message}`);
    errorHandler(error, req, res);
  }
};

/**
 * Delete project
 * @route DELETE /api/v1/projects/:id
 */
exports.deleteProject = async (req, res) => {
  try {
    // Find project
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Check if user is authorized to delete (creator or admin)
    if (project.creatorId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this project' 
      });
    }

    // Delete project
    await project.remove();

    logger.info(`Project deleted: ${req.params.id} by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    logger.error(`Delete project error: ${error.message}`);
    errorHandler(error, req, res);
  }
};