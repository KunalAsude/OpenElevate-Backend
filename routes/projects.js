import express from 'express';
import { check, validationResult } from 'express-validator';
import { authMiddleware, authorize, checkOwnership } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import Badge from '../models/Badge.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
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
 *               - techStack
 *               - difficulty
 *               - type
 *               - githubLink
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               techStack:
 *                 type: array
 *                 items:
 *                   type: string
 *               difficulty:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *               type:
 *                 type: string
 *                 enum: [frontend, backend, fullstack, mobile, other]
 *               githubLink:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               thumbnailUrl:
 *                 type: string
 *               featuredIssues:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     link:
 *                       type: string
 *                     difficulty:
 *                       type: string
 *                       enum: [beginner, intermediate, advanced]
 *     responses:
 *       201:
 *         description: Project created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/', authMiddleware, [
  check('title').notEmpty().withMessage('Title is required').isLength({ max: 100 }).withMessage('Title cannot be more than 100 characters'),
  check('description').notEmpty().withMessage('Description is required').isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  check('techStack').isArray({ min: 1 }).withMessage('At least one technology must be specified'),
  check('difficulty').isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
  check('type').isIn(['frontend', 'backend', 'fullstack', 'mobile', 'other']).withMessage('Invalid project type'),
  check('githubLink').notEmpty().withMessage('GitHub link is required').matches(/^(https?:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?$/).withMessage('Please provide a valid GitHub repository URL'),
  check('tags').optional().isArray().withMessage('Tags must be an array'),
  check('thumbnailUrl').optional().isURL().withMessage('Thumbnail URL must be a valid URL'),
  check('featuredIssues').optional().isArray().withMessage('Featured issues must be an array'),
  check('featuredIssues.*.title').optional().notEmpty().withMessage('Issue title is required'),
  check('featuredIssues.*.link').optional().matches(/^(https?:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/issues\/\d+\/?$/).withMessage('Please provide a valid GitHub issue URL'),
  check('featuredIssues.*.difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid issue difficulty level')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  // Create project with current user as creator
  const project = await Project.create({
    ...req.body,
    creatorId: req.user.id,
    contributors: [req.user.id] // Creator is automatically a contributor
  });

  // Check for Project Starter badge eligibility
  const projectCount = await Project.countDocuments({ creatorId: req.user.id });
  if (projectCount === 1) {
    // Find the 'Project Starter' badge
    const projectStarterBadge = await Badge.findOne({
      title: 'Project Starter',
      'conditions.type': 'project_count',
      'conditions.count': 1
    });

    if (projectStarterBadge) {
      // Add badge to user if not already awarded
      const user = await User.findById(req.user.id);
      if (!user.badges.includes(projectStarterBadge._id)) {
        user.badges.push(projectStarterBadge._id);
        await user.save();
        logger.info(`Project Starter badge awarded to user: ${user.email}`);
      }
    }
  }

  logger.info(`New project created: ${project.title} by user: ${req.user.email}`);

  res.status(201).json({
    success: true,
    data: project
  });
}));

/**
 * @swagger
 * /projects:
 *   get:
 *     summary: Get all projects (with filters)
 *     tags: [Projects]
 *     parameters:
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *         description: Filter by difficulty level
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by project type
 *       - in: query
 *         name: techStack
 *         schema:
 *           type: string
 *         description: Filter by technologies (comma-separated)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by project status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title and description
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Filter by tags (comma-separated)
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
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort field (e.g., -createdAt, viewCount)
 *     responses:
 *       200:
 *         description: List of projects
 *       500:
 *         description: Server error
 */
router.get('/', asyncHandler(async (req, res) => {
  const { difficulty, type, techStack, status, search, tags, page = 1, limit = 10, sort = '-createdAt' } = req.query;

  // Build filter
  const filter = {};
  if (difficulty) filter.difficulty = difficulty;
  if (type) filter.type = type;
  if (status) filter.status = status;
  
  if (techStack) {
    const techStackArray = techStack.split(',').map(tech => tech.trim());
    filter.techStack = { $in: techStackArray };
  }
  
  if (tags) {
    const tagsArray = tags.split(',').map(tag => tag.trim());
    filter.tags = { $in: tagsArray };
  }
  
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  // Calculate pagination
  const startIndex = (Number(page) - 1) * Number(limit);
  const endIndex = Number(page) * Number(limit);
  const total = await Project.countDocuments(filter);

  // Find projects with filter and pagination
  const projects = await Project.find(filter)
    .populate('creatorId', 'name email avatarUrl')
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
    count: projects.length,
    pagination,
    totalPages: Math.ceil(total / Number(limit)),
    data: projects
  });
}));

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   get:
 *     summary: Get a single project by ID
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project details
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id)
    .populate('creatorId', 'name email avatarUrl')
    .populate('contributors', 'name email avatarUrl')
    .populate('usersStarred', 'name');

  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  // Increment view count
  project.viewCount += 1;
  await project.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    data: project
  });
}));

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   put:
 *     summary: Update a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
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
 *               techStack:
 *                 type: array
 *                 items:
 *                   type: string
 *               difficulty:
 *                 type: string
 *               type:
 *                 type: string
 *               status:
 *                 type: string
 *               githubLink:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               thumbnailUrl:
 *                 type: string
 *               featuredIssues:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Project updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.put('/:id', authMiddleware, [
  check('title').optional().notEmpty().withMessage('Title cannot be empty').isLength({ max: 100 }).withMessage('Title cannot be more than 100 characters'),
  check('description').optional().notEmpty().withMessage('Description cannot be empty').isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  check('techStack').optional().isArray({ min: 1 }).withMessage('At least one technology must be specified'),
  check('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
  check('type').optional().isIn(['frontend', 'backend', 'fullstack', 'mobile', 'other']).withMessage('Invalid project type'),
  check('status').optional().isIn(['open', 'in-progress', 'completed', 'archived']).withMessage('Invalid project status'),
  check('githubLink').optional().matches(/^(https?:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?$/).withMessage('Please provide a valid GitHub repository URL'),
  check('tags').optional().isArray().withMessage('Tags must be an array'),
  check('thumbnailUrl').optional().isURL().withMessage('Thumbnail URL must be a valid URL'),
  check('featuredIssues').optional().isArray().withMessage('Featured issues must be an array')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  // Find project
  let project = await Project.findById(req.params.id);
  
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  // Check if user is the creator or an admin
  if (project.creatorId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to update this project'
    });
  }

  // Update project
  project = await Project.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  logger.info(`Project updated: ${project.title} by user: ${req.user.email}`);

  res.status(200).json({
    success: true,
    data: project
  });
}));

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   delete:
 *     summary: Delete a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  // Check if user is the creator or an admin
  if (project.creatorId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to delete this project'
    });
  }

  // Delete project
  await project.remove();
  
  logger.info(`Project deleted: ${project.title} by user: ${req.user.email}`);

  res.status(200).json({
    success: true,
    message: 'Project deleted successfully'
  });
}));

/**
 * @swagger
 * /api/v1/projects/{id}/star:
 *   post:
 *     summary: Star or unstar a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project starred/unstarred successfully
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.post('/:id/star', authMiddleware, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  // Check if user has already starred this project
  const alreadyStarred = project.usersStarred.some(
    userId => userId.toString() === req.user.id
  );

  let message;
  
  if (alreadyStarred) {
    // Unstar - remove user from usersStarred array
    project.usersStarred = project.usersStarred.filter(
      userId => userId.toString() !== req.user.id
    );
    project.starCount = Math.max(0, project.starCount - 1);
    message = 'Project unstarred successfully';
  } else {
    // Star - add user to usersStarred array
    project.usersStarred.push(req.user.id);
    project.starCount += 1;
    message = 'Project starred successfully';
  }

  await project.save();
  
  res.status(200).json({
    success: true,
    message,
    starred: !alreadyStarred,
    starCount: project.starCount
  });
}));

/**
 * @swagger
 * /api/v1/projects/{id}/featured-issues:
 *   post:
 *     summary: Add a featured issue to a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - link
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               link:
 *                 type: string
 *               difficulty:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *     responses:
 *       200:
 *         description: Featured issue added successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.post('/:id/featured-issues', authMiddleware, [
  check('title').notEmpty().withMessage('Title is required'),
  check('link').notEmpty().withMessage('Link is required').matches(/^(https?:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/issues\/\d+\/?$/).withMessage('Please provide a valid GitHub issue URL'),
  check('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level')
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const project = await Project.findById(req.params.id);
  
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  // Check if user is the creator or an admin
  if (project.creatorId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to update this project'
    });
  }

  // Add featured issue
  const newIssue = {
    title: req.body.title,
    description: req.body.description || '',
    link: req.body.link,
    difficulty: req.body.difficulty || 'beginner'
  };

  project.featuredIssues.push(newIssue);
  await project.save();
  
  logger.info(`Featured issue added to project ${project.title}: ${newIssue.title}`);

  res.status(200).json({
    success: true,
    data: project.featuredIssues
  });
}));

/**
 * @swagger
 * /api/v1/projects/{id}/featured-issues/{issueId}:
 *   delete:
 *     summary: Remove a featured issue from a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *       - in: path
 *         name: issueId
 *         required: true
 *         schema:
 *           type: string
 *         description: Issue ID
 *     responses:
 *       200:
 *         description: Featured issue removed successfully
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Project or issue not found
 *       500:
 *         description: Server error
 */
router.delete('/:id/featured-issues/:issueId', authMiddleware, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  // Check if user is the creator or an admin
  if (project.creatorId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to update this project'
    });
  }

  // Check if issue exists
  if (!project.featuredIssues.id(req.params.issueId)) {
    return res.status(404).json({
      success: false,
      message: 'Featured issue not found'
    });
  }

  // Remove featured issue
  project.featuredIssues.id(req.params.issueId).remove();
  await project.save();
  
  logger.info(`Featured issue removed from project ${project.title}`);

  res.status(200).json({
    success: true,
    message: 'Featured issue removed successfully',
    data: project.featuredIssues
  });
}));

/**
 * @swagger
 * /api/v1/projects/tech-stack:
 *   get:
 *     summary: Get all unique technologies used across projects
 *     tags: [Projects]
 *     responses:
 *       200:
 *         description: List of unique technologies
 *       500:
 *         description: Server error
 */
router.get('/tech-stack', asyncHandler(async (req, res) => {
  const projects = await Project.find().select('techStack');
  
  // Extract unique technologies from all projects
  const allTech = projects.flatMap(project => project.techStack);
  const uniqueTech = [...new Set(allTech)].filter(Boolean).sort();
  
  res.status(200).json({
    success: true,
    count: uniqueTech.length,
    data: uniqueTech
  });
}));

export default router;