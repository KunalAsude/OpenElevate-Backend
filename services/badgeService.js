import mongoose from 'mongoose';
import Badge from '../models/Badge.js';
import User from '../models/User.js';
import Contribution from '../models/Contribution.js';
import Project from '../models/Project.js';
import { logger } from '../utils/logger.js';

/**
 * Badge Service - Handles all badge-related logic
 */
class BadgeService {
  /**
   * Check and award badges to a user based on their contributions, projects, etc.
   * @param {string} userId - User ID to check badges for
   * @returns {Array} - Newly awarded badges
   */
  static async checkAndAwardBadges(userId) {
    try {
      // Get user with their current badges
      const user = await User.findById(userId);
      if (!user) {
        throw new Error(`User not found with ID: ${userId}`);
      }
      
      // Get all available badges
      const allBadges = await Badge.find({ isActive: true });
      
      // Get user's current badge IDs
      const userBadgeIds = user.badges.map(badge => badge.badgeId.toString());
      
      // Get eligible badges that user doesn't already have
      const eligibleBadges = allBadges.filter(badge => 
        !userBadgeIds.includes(badge._id.toString())
      );
      
      if (eligibleBadges.length === 0) {
        return []; // No new badges to check
      }
      
      // Check each badge condition
      const newlyAwardedBadges = [];
      
      for (const badge of eligibleBadges) {
        const isEligible = await this.checkBadgeEligibility(user._id, badge);
        
        if (isEligible) {
          // Award badge to user
          const awardedBadge = {
            badgeId: badge._id,
            title: badge.title,
            description: badge.description,
            iconUrl: badge.iconUrl,
            awardedAt: new Date(),
            pointsAwarded: badge.pointsAwarded
          };
          
          user.badges.push(awardedBadge);
          user.points += badge.pointsAwarded;
          
          newlyAwardedBadges.push(awardedBadge);
          
          logger.info(`Badge "${badge.title}" awarded to user ${user.name} (${user._id})`);
        }
      }
      
      if (newlyAwardedBadges.length > 0) {
        await user.save();
      }
      
      return newlyAwardedBadges;
    } catch (error) {
      logger.error(`Error in checkAndAwardBadges: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if a user is eligible for a specific badge
   * @param {string} userId - User ID to check
   * @param {Object} badge - Badge object to check eligibility for
   * @returns {boolean} - Whether the user is eligible for the badge
   */
  static async checkBadgeEligibility(userId, badge) {
    try {
      const { type, count, skill, specialCondition } = badge.conditions;
      
      switch (type) {
        case 'contribution_count':
          return this.checkContributionCount(userId, count);
        
        case 'project_count':
          return this.checkProjectCount(userId, count);
        
        case 'time_active':
          return this.checkTimeActive(userId, count);
        
        case 'skill_level':
          return this.checkSkillLevel(userId, skill);
        
        case 'special':
          return this.checkSpecialCondition(userId, specialCondition);
        
        default:
          logger.warn(`Unknown badge condition type: ${type}`);
          return false;
      }
    } catch (error) {
      logger.error(`Error checking badge eligibility: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if a user has the required number of contributions
   * @param {string} userId - User ID to check
   * @param {number} requiredCount - Required number of contributions
   * @returns {boolean} - Whether the user meets the condition
   */
  static async checkContributionCount(userId, requiredCount) {
    try {
      // Count verified contributions for the user
      const contributionCount = await Contribution.countDocuments({
        userId,
        status: 'verified'
      });
      
      return contributionCount >= requiredCount;
    } catch (error) {
      logger.error(`Error in checkContributionCount: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if a user has created the required number of projects
   * @param {string} userId - User ID to check
   * @param {number} requiredCount - Required number of projects
   * @returns {boolean} - Whether the user meets the condition
   */
  static async checkProjectCount(userId, requiredCount) {
    try {
      // Count projects created by the user
      const projectCount = await Project.countDocuments({
        createdBy: userId
      });
      
      return projectCount >= requiredCount;
    } catch (error) {
      logger.error(`Error in checkProjectCount: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if a user has been active for the required amount of time (in days)
   * @param {string} userId - User ID to check
   * @param {number} requiredDays - Required days of activity
   * @returns {boolean} - Whether the user meets the condition
   */
  static async checkTimeActive(userId, requiredDays) {
    try {
      const user = await User.findById(userId);
      if (!user) return false;
      
      const registrationDate = new Date(user.createdAt);
      const currentDate = new Date();
      
      const diffInTime = currentDate.getTime() - registrationDate.getTime();
      const diffInDays = Math.floor(diffInTime / (1000 * 3600 * 24));
      
      return diffInDays >= requiredDays;
    } catch (error) {
      logger.error(`Error in checkTimeActive: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if a user has reached the required skill level
   * @param {string} userId - User ID to check
   * @param {string} requiredSkill - Required skill and level
   * @returns {boolean} - Whether the user meets the condition
   */
  static async checkSkillLevel(userId, requiredSkill) {
    try {
      const user = await User.findById(userId).select('skills');
      if (!user) return false;
      
      // Parse the required skill (format: "javascript:3" means JavaScript at level 3)
      const [skillName, levelStr] = requiredSkill.split(':');
      const requiredLevel = parseInt(levelStr, 10);
      
      if (!skillName || isNaN(requiredLevel)) {
        logger.warn(`Invalid skill format: ${requiredSkill}`);
        return false;
      }
      
      // Check if user has the skill at the required level
      const userSkill = user.skills.find(s => 
        s.name.toLowerCase() === skillName.toLowerCase() && 
        s.level >= requiredLevel
      );
      
      return !!userSkill;
    } catch (error) {
      logger.error(`Error in checkSkillLevel: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if a user meets a special condition
   * @param {string} userId - User ID to check
   * @param {string} condition - Special condition to check
   * @returns {boolean} - Whether the user meets the condition
   */
  static async checkSpecialCondition(userId, condition) {
    try {
      const user = await User.findById(userId);
      if (!user) return false;
      
      switch (condition) {
        case 'become_mentor':
          return user.role === 'mentor';
        
        case 'perfect_contribution':
          // Check if the user has any contributions with perfect scores
          const perfectContributions = await Contribution.countDocuments({
            userId,
            status: 'verified',
            rating: 5
          });
          return perfectContributions > 0;
        
        case 'mentor_rating':
          // Check if the user has a high mentor rating (4.5+)
          return user.role === 'mentor' && user.mentorRating >= 4.5;
        
        case 'github_stars':
          // Check if the user has a GitHub project with 100+ stars
          const githubAnalytics = await mongoose.model('GithubAnalytics').findOne({ 
            userId, 
            'repositories.details.stargazersCount': { $gte: 100 } 
          });
          return !!githubAnalytics;
          
        case 'diverse_contributor':
          // Check if user has contributed to projects with different languages
          const contributions = await Contribution.find({ userId, status: 'verified' })
            .populate('projectId', 'mainLanguage');
          
          const languages = new Set();
          contributions.forEach(c => {
            if (c.projectId && c.projectId.mainLanguage) {
              languages.add(c.projectId.mainLanguage);
            }
          });
          
          return languages.size >= 3; // Contributed to projects in at least 3 different languages
          
        case 'streak_achievement':
          // Check if user has maintained a streak of activity for 7 consecutive days
          // This would require a more complex implementation with a log of user activity
          // Simplified version here
          return user.activityStreak >= 7;
          
        default:
          logger.warn(`Unknown special condition: ${condition}`);
          return false;
      }
    } catch (error) {
      logger.error(`Error in checkSpecialCondition: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Create a new custom badge
   * @param {Object} badgeData - Badge data
   * @returns {Object} - Created badge
   */
  static async createBadge(badgeData) {
    try {
      const badge = await Badge.create(badgeData);
      logger.info(`New badge created: ${badge.title}`);
      return badge;
    } catch (error) {
      logger.error(`Error creating badge: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update an existing badge
   * @param {string} badgeId - Badge ID to update
   * @param {Object} updateData - Badge data to update
   * @returns {Object} - Updated badge
   */
  static async updateBadge(badgeId, updateData) {
    try {
      const badge = await Badge.findByIdAndUpdate(badgeId, updateData, { 
        new: true, 
        runValidators: true 
      });
      
      if (!badge) {
        throw new Error(`Badge not found with ID: ${badgeId}`);
      }
      
      logger.info(`Badge updated: ${badge.title}`);
      return badge;
    } catch (error) {
      logger.error(`Error updating badge: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check for badge eligibility after specific events
   * @param {string} userId - User ID
   * @param {string} eventType - Event type (e.g., 'contribution_verified', 'project_created')
   * @param {Object} eventData - Additional data related to the event
   * @returns {Array} - Newly awarded badges
   */
  static async processEvent(userId, eventType, eventData = {}) {
    try {
      // Process specific events that might trigger badge awards
      switch (eventType) {
        case 'contribution_verified':
          // Custom logic for when a contribution is verified
          // For example, check contribution-specific badges
          break;
          
        case 'project_created':
          // Custom logic for when a project is created
          break;
          
        case 'skill_updated':
          // Custom logic for when skills are updated
          break;
          
        // Add more event types as needed
      }
      
      // After any specific processing, check all badges
      return await this.checkAndAwardBadges(userId);
    } catch (error) {
      logger.error(`Error processing event for badges: ${error.message}`);
      throw error;
    }
  }
}

export default BadgeService;
