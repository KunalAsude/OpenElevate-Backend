import GitHubService from '../services/githubService.js';
import GithubAnalytics from '../models/GithubAnalytics.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// Get current user's GitHub analytics
export const getCurrentUserGithubAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Check if user has GitHub connected
  const user = await User.findById(userId);
  if (!user.oauth || !user.oauth.github || !user.oauth.github.accessToken) {
    throw new ApiError(400, 'GitHub account not connected');
  }
  
  // Check if analytics exist and are recent
  let analytics = await GithubAnalytics.findOne({ userId });
  const isRecent = analytics && 
    (new Date() - new Date(analytics.lastUpdated)) / (1000 * 60 * 60 * 24) < 1; // Less than 1 day old
  
  // If no analytics or outdated, fetch new ones
  if (!analytics || !isRecent) {
    try {
      // Create GitHub service with user's access token
      const githubService = new GitHubService(user.oauth.github.accessToken);
      
      // Collect and save analytics
      await githubService.collectUserAnalytics(userId);
      
      // Fetch the updated analytics
      analytics = await GithubAnalytics.findOne({ userId });
    } catch (error) {
      logger.error(`Error fetching GitHub analytics: ${error.message}`);
      
      // If token expired, clear it and suggest reconnecting
      if (error.response && error.response.status === 401) {
        user.oauth.github.accessToken = null;
        user.oauth.github.tokenExpiry = null;
        await user.save({ validateBeforeSave: false });
        
        throw new ApiError(401, 'GitHub token expired. Please reconnect your GitHub account.');
      }
      
      // Return existing analytics if available, otherwise error
      if (analytics) {
        return res.status(200).json({
          success: true,
          data: analytics,
          message: 'Showing cached analytics. Failed to update from GitHub.'
        });
      }
      
      throw new ApiError(500, 'Failed to fetch GitHub analytics');
    }
  }
  
  res.status(200).json({
    success: true,
    data: analytics
  });
});

// Manually refresh GitHub analytics
export const refreshGithubAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Check if user has GitHub connected
  const user = await User.findById(userId);
  if (!user.oauth || !user.oauth.github || !user.oauth.github.accessToken) {
    throw new ApiError(400, 'GitHub account not connected');
  }
  
  try {
    // Create GitHub service with user's access token
    const githubService = new GitHubService(user.oauth.github.accessToken);
    
    // Collect and save analytics
    await githubService.collectUserAnalytics(userId);
    
    // Fetch the updated analytics
    const analytics = await GithubAnalytics.findOne({ userId });
    
    res.status(200).json({
      success: true,
      data: analytics,
      message: 'GitHub analytics refreshed successfully'
    });
  } catch (error) {
    logger.error(`Error refreshing GitHub analytics: ${error.message}`);
    
    // If token expired, clear it and suggest reconnecting
    if (error.response && error.response.status === 401) {
      user.oauth.github.accessToken = null;
      user.oauth.github.tokenExpiry = null;
      await user.save({ validateBeforeSave: false });
      
      throw new ApiError(401, 'GitHub token expired. Please reconnect your GitHub account.');
    }
    
    throw new ApiError(500, 'Failed to refresh GitHub analytics');
  }
});

// Disconnect GitHub account
export const disconnectGithub = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Find user
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  // Check if GitHub is connected
  if (!user.oauth || !user.oauth.github || !user.oauth.github.id) {
    throw new ApiError(400, 'GitHub account not connected');
  }
  
  // Remove GitHub connection
  user.oauth.github = {};
  await user.save({ validateBeforeSave: false });
  
  // Mark analytics as disconnected but don't delete
  await GithubAnalytics.findOneAndUpdate(
    { userId }, 
    { $set: { disconnectedAt: new Date() } }
  );
  
  logger.info(`User ${userId} disconnected GitHub account`);
  
  res.status(200).json({
    success: true,
    message: 'GitHub account disconnected successfully'
  });
});

// Get GitHub analytics for a specific user (admin or mentor only)
export const getUserGithubAnalytics = asyncHandler(async (req, res) => {
  // Check if requesting user is admin or mentor
  if (req.user.role !== 'admin' && req.user.role !== 'mentor') {
    throw new ApiError(403, 'Not authorized to access this resource');
  }
  
  const { userId } = req.params;
  
  // Find user
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  // Get analytics
  const analytics = await GithubAnalytics.findOne({ userId });
  if (!analytics) {
    throw new ApiError(404, 'GitHub analytics not found for this user');
  }
  
  res.status(200).json({
    success: true,
    data: analytics
  });
});

// For cron job or scheduled task - refresh all user analytics
export const refreshAllUsersAnalytics = async () => {
  logger.info('Starting scheduled refresh of all GitHub analytics');
  
  try {
    // Find all users with GitHub connected
    const users = await User.find({
      'oauth.github.accessToken': { $exists: true, $ne: null }
    });
    
    logger.info(`Found ${users.length} users with GitHub connected`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Process users in batches to avoid overwhelming GitHub API
    for (const user of users) {
      try {
        // Check if token is expired
        const tokenExpiry = user.oauth.github.tokenExpiry;
        if (tokenExpiry && new Date(tokenExpiry) < new Date()) {
          logger.warn(`Skipping user ${user._id}: GitHub token expired`);
          continue;
        }
        
        // Create GitHub service with user's access token
        const githubService = new GitHubService(user.oauth.github.accessToken);
        
        // Collect and save analytics
        await githubService.collectUserAnalytics(user._id);
        
        successCount++;
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Error refreshing analytics for user ${user._id}: ${error.message}`);
        failCount++;
        
        // If token expired, mark it
        if (error.response && error.response.status === 401) {
          user.oauth.github.tokenExpiry = new Date(0); // Set to epoch to mark as expired
          await user.save({ validateBeforeSave: false });
        }
      }
    }
    
    logger.info(`Completed GitHub analytics refresh. Success: ${successCount}, Failed: ${failCount}`);
    return { success: successCount, failed: failCount };
  } catch (error) {
    logger.error(`Error in refreshAllUsersAnalytics: ${error.message}`);
    throw error;
  }
};
