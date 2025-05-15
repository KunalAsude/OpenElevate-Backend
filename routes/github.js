import express from 'express';
import { 
  getCurrentUserGithubAnalytics, 
  refreshGithubAnalytics, 
  disconnectGithub,
  getUserGithubAnalytics
} from '../controllers/githubController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /github/analytics:
 *   get:
 *     summary: Get current user's GitHub analytics
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: GitHub analytics retrieved successfully
 *       400:
 *         description: GitHub not connected
 *       401:
 *         description: Not authorized
 */
router.get('/analytics', authMiddleware, getCurrentUserGithubAnalytics);

/**
 * @swagger
 * /github/analytics/refresh:
 *   post:
 *     summary: Refresh GitHub analytics
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: GitHub analytics refreshed successfully
 *       400:
 *         description: GitHub not connected
 *       401:
 *         description: Not authorized or token expired
 */
router.post('/analytics/refresh', authMiddleware, refreshGithubAnalytics);

/**
 * @swagger
 * /github/disconnect:
 *   post:
 *     summary: Disconnect GitHub account
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: GitHub account disconnected successfully
 *       400:
 *         description: GitHub not connected
 *       401:
 *         description: Not authorized
 */
router.post('/disconnect', authMiddleware, disconnectGithub);

/**
 * @swagger
 * /github/analytics/{userId}:
 *   get:
 *     summary: Get GitHub analytics for a specific user (admin/mentor only)
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: GitHub analytics retrieved successfully
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden - not admin/mentor
 *       404:
 *         description: User or analytics not found
 */
router.get('/analytics/:userId', authMiddleware, getUserGithubAnalytics);

export default router;
