import { refreshAllUsersAnalytics } from '../controllers/githubController.js';
import { logger } from './logger.js';

/**
 * Scheduled tasks manager for OpenElevate
 * Handles periodic tasks like refreshing GitHub analytics
 */

// Schedule tasks to run at specific intervals
export const startScheduledTasks = () => {
  logger.info('Starting scheduled tasks');
  
  // Schedule GitHub analytics refresh (once daily)
  setInterval(async () => {
    try {
      logger.info('Running scheduled GitHub analytics refresh');
      const result = await refreshAllUsersAnalytics();
      logger.info(`Completed GitHub analytics refresh: ${JSON.stringify(result)}`);
    } catch (error) {
      logger.error(`Error in scheduled GitHub analytics refresh: ${error.message}`);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
  
  // You can add more scheduled tasks here
};

// Run specific tasks on demand
export const runTask = async (taskName) => {
  logger.info(`Running task on demand: ${taskName}`);
  
  switch (taskName) {
    case 'refreshGithubAnalytics':
      return await refreshAllUsersAnalytics();
    
    // Add more task types as needed
    
    default:
      throw new Error(`Unknown task: ${taskName}`);
  }
};
