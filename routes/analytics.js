import express from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Analytics from '../models/Analytics.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Contribution from '../models/Contribution.js';
import Badge from '../models/Badge.js';
import GithubAnalytics from '../models/GithubAnalytics.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /analytics/platform:
 *   get:
 *     summary: Get platform-wide analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform analytics data
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/platform', authMiddleware, authorize('admin'), asyncHandler(async (req, res) => {
  // Get or create the analytics document
  const analytics = await Analytics.getOrCreate();
  
  res.status(200).json({
    success: true,
    data: analytics
  });
}));

/**
 * @swagger
 * /analytics/refresh:
 *   post:
 *     summary: Refresh all analytics data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics data refreshed
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/refresh', authMiddleware, authorize('admin'), asyncHandler(async (req, res) => {
  // Refresh all analytics data
  const analytics = await Analytics.refresh();
  
  logger.info('Analytics data refreshed');
  
  res.status(200).json({
    success: true,
    message: 'Analytics data refreshed successfully',
    data: analytics
  });
}));

/**
 * @swagger
 * /analytics/dashboard:
 *   get:
 *     summary: Get summary dashboard analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard analytics data
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/dashboard', authMiddleware, asyncHandler(async (req, res) => {
  // Get basic platform metrics for the dashboard
  const analytics = await Analytics.getOrCreate();
  
  // Extract only the necessary data for the dashboard
  const dashboardData = {
    totalUsers: analytics.platformMetrics.totalUsers,
    totalProjects: analytics.platformMetrics.totalProjects,
    totalContributions: analytics.platformMetrics.totalContributions,
    totalBadgesAwarded: analytics.platformMetrics.totalBadgesAwarded,
    activeUsers: analytics.platformMetrics.activeUsers,
    topProjects: analytics.projectPerformance.mostActiveProjects.slice(0, 5),
    badgeDistribution: analytics.badgeStatistics.rarityDistribution
  };
  
  res.status(200).json({
    success: true,
    data: dashboardData
  });
}));

/**
 * @swagger
 * /analytics/user/{id}:
 *   get:
 *     summary: Get analytics for a specific user
 *     tags: [Analytics]
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
 *         description: User analytics data
 *       401:
 *         description: Not authorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/user/:id', authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Check if user is requesting their own data or is an admin
  if (req.user.id !== id && req.user.role !== 'admin') {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to view this user\'s analytics'
    });
  }
  
  // Get user
  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  // Get user's contributions
  const contributions = await Contribution.find({ userId: id });
  
  // Get user's projects
  const projects = await Project.find({ createdBy: id });
  
  // Get user's GitHub analytics if available
  const githubAnalytics = await GithubAnalytics.findOne({ userId: id });
  
  // Compile user analytics
  const userAnalytics = {
    contributionCount: contributions.length,
    projectCount: projects.length,
    badgeCount: user.badges.length,
    contributionsByStatus: {
      pending: contributions.filter(c => c.status === 'pending').length,
      inProgress: contributions.filter(c => c.status === 'in_progress').length,
      completed: contributions.filter(c => c.status === 'completed').length,
      verified: contributions.filter(c => c.status === 'verified').length
    },
    contributionTimeline: generateTimeline(contributions, 'createdAt'),
    projectTimeline: generateTimeline(projects, 'createdAt'),
    badgeTimeline: generateTimeline(user.badges, 'awardedAt'),
    githubInsights: githubAnalytics ? {
      totalCommits: githubAnalytics.contributions?.totalCommits || 0,
      totalRepositories: githubAnalytics.repositories?.totalCount || 0,
      contributionCalendar: githubAnalytics.contributions?.contributionCalendar || {},
      languageDistribution: githubAnalytics.repositories?.languageDistribution || {}
    } : null
  };
  
  res.status(200).json({
    success: true,
    data: userAnalytics
  });
}));

/**
 * @swagger
 * /analytics/projects:
 *   get:
 *     summary: Get analytics for all projects
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Project analytics data
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/projects', authMiddleware, asyncHandler(async (req, res) => {
  // Get all projects with their contributions
  const projects = await Project.find().populate('contributions');
  
  // Aggregate project analytics
  const projectsAnalytics = {
    totalProjects: projects.length,
    projectsByDifficulty: {
      beginner: projects.filter(p => p.difficulty === 'beginner').length,
      intermediate: projects.filter(p => p.difficulty === 'intermediate').length,
      advanced: projects.filter(p => p.difficulty === 'advanced').length
    },
    projectsTimeline: generateTimeline(projects, 'createdAt'),
    languageDistribution: aggregateByProperty(projects, 'mainLanguage'),
    categoriesDistribution: aggregateByProperty(projects, 'category'),
    tagsDistribution: aggregateByProperty(projects, 'tags', true),
    mostActiveProjects: projects
      .map(project => ({
        id: project._id,
        name: project.name,
        contributionCount: project.contributions.length,
        userCount: [...new Set(project.contributions.map(c => c.userId.toString()))].length
      }))
      .sort((a, b) => b.contributionCount - a.contributionCount)
      .slice(0, 10)
  };
  
  res.status(200).json({
    success: true,
    data: projectsAnalytics
  });
}));

/**
 * @swagger
 * /analytics/badges:
 *   get:
 *     summary: Get analytics for badges
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Badge analytics data
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/badges', authMiddleware, asyncHandler(async (req, res) => {
  // Get all badges
  const badges = await Badge.find();
  
  // Get all users with badges
  const users = await User.find({ 'badges.0': { $exists: true } }, 'badges');
  
  // Count badge occurrences
  const badgeCounts = {};
  users.forEach(user => {
    user.badges.forEach(badge => {
      const badgeId = badge.badgeId.toString();
      badgeCounts[badgeId] = (badgeCounts[badgeId] || 0) + 1;
    });
  });
  
  // Count badges by rarity
  const rarityDistribution = {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    legendary: 0
  };
  
  badges.forEach(badge => {
    rarityDistribution[badge.rarity]++;
  });
  
  // Create most awarded badges list
  const mostAwardedBadges = badges
    .map(badge => ({
      badgeId: badge._id,
      title: badge.title,
      count: badgeCounts[badge._id.toString()] || 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  // Compile badge analytics
  const badgeAnalytics = {
    totalBadges: badges.length,
    totalAwards: users.reduce((total, user) => total + user.badges.length, 0),
    rarityDistribution,
    mostAwardedBadges,
    averageBadgesPerUser: users.length > 0 ? 
      users.reduce((total, user) => total + user.badges.length, 0) / users.length : 0
  };
  
  res.status(200).json({
    success: true,
    data: badgeAnalytics
  });
}));

/**
 * @swagger
 * /analytics/contributions:
 *   get:
 *     summary: Get analytics for contributions
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contribution analytics data
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/contributions', authMiddleware, asyncHandler(async (req, res) => {
  // Get all contributions
  const contributions = await Contribution.find().populate('projectId');
  
  // Aggregate contribution analytics
  const contributionAnalytics = {
    totalContributions: contributions.length,
    contributionsByStatus: {
      pending: contributions.filter(c => c.status === 'pending').length,
      inProgress: contributions.filter(c => c.status === 'in_progress').length,
      completed: contributions.filter(c => c.status === 'completed').length,
      verified: contributions.filter(c => c.status === 'verified').length
    },
    contributionsTimeline: generateTimeline(contributions, 'createdAt'),
    completionTimeline: generateTimeline(contributions.filter(c => c.status === 'completed' || c.status === 'verified'), 'completedAt'),
    verificationTimeline: generateTimeline(contributions.filter(c => c.status === 'verified'), 'verifiedAt'),
    contributionsByDifficulty: {
      beginner: contributions.filter(c => c.projectId?.difficulty === 'beginner').length,
      intermediate: contributions.filter(c => c.projectId?.difficulty === 'intermediate').length,
      advanced: contributions.filter(c => c.projectId?.difficulty === 'advanced').length
    },
    // Average time to complete (in days)
    averageTimeToComplete: calculateAverageTimeToComplete(contributions)
  };
  
  res.status(200).json({
    success: true,
    data: contributionAnalytics
  });
}));

/**
 * @swagger
 * /analytics/geographic:
 *   get:
 *     summary: Get geographic analytics data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Geographic analytics data
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/geographic', authMiddleware, authorize('admin'), asyncHandler(async (req, res) => {
  // Get all users with location data
  const users = await User.find({ location: { $exists: true, $ne: '' } }, 'location');
  
  // Get all projects with location data
  const projects = await Project.find({ location: { $exists: true, $ne: '' } }, 'location');
  
  // Get all contributions 
  const contributions = await Contribution.find().populate('userId', 'location');
  
  // Count by country
  const userCountByCountry = aggregateByProperty(users, 'location');
  
  const projectsByCountry = aggregateByProperty(projects, 'location');
  
  // For contributions, we use the user's location
  const contributionsByCountry = {};
  contributions.forEach(contribution => {
    if (contribution.userId && contribution.userId.location) {
      const location = contribution.userId.location;
      contributionsByCountry[location] = (contributionsByCountry[location] || 0) + 1;
    }
  });
  
  // Compile geographic analytics
  const geographicAnalytics = {
    userCountByCountry,
    projectsByCountry,
    contributionsByCountry
  };
  
  res.status(200).json({
    success: true,
    data: geographicAnalytics
  });
}));

// Helper function to generate timeline data
function generateTimeline(items, dateField) {
  const timeline = {};
  
  items.forEach(item => {
    if (item[dateField]) {
      const date = new Date(item[dateField]);
      const dateStr = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      
      timeline[dateStr] = (timeline[dateStr] || 0) + 1;
    }
  });
  
  return timeline;
}

// Helper function to aggregate items by a property
function aggregateByProperty(items, property, isArray = false) {
  const aggregation = {};
  
  items.forEach(item => {
    if (isArray && Array.isArray(item[property])) {
      // If the property is an array (like tags)
      item[property].forEach(value => {
        if (value) {
          aggregation[value] = (aggregation[value] || 0) + 1;
        }
      });
    } else if (item[property]) {
      // If the property is a simple value
      aggregation[item[property]] = (aggregation[item[property]] || 0) + 1;
    }
  });
  
  return aggregation;
}

// Helper function to calculate average time to complete
function calculateAverageTimeToComplete(contributions) {
  const completedContributions = contributions.filter(c => 
    c.status === 'completed' || c.status === 'verified' && c.completedAt && c.createdAt
  );
  
  if (completedContributions.length === 0) {
    return 0;
  }
  
  const totalDays = completedContributions.reduce((sum, c) => {
    const created = new Date(c.createdAt);
    const completed = new Date(c.completedAt);
    const diffInDays = (completed - created) / (1000 * 60 * 60 * 24);
    return sum + diffInDays;
  }, 0);
  
  return totalDays / completedContributions.length;
}

export default router;
