import mongoose from 'mongoose';

const AnalyticsSchema = new mongoose.Schema({
  // General platform metrics
  platformMetrics: {
    totalUsers: Number,
    totalProjects: Number,
    totalContributions: Number,
    totalBadgesAwarded: Number,
    totalMentorships: Number,
    activeUsers: {
      daily: Number,
      weekly: Number,
      monthly: Number
    },
    projectsCreatedTimeline: {
      type: Map,
      of: Number // Date string -> count
    },
    contributionsTimeline: {
      type: Map,
      of: Number // Date string -> count
    },
    userRegistrationTimeline: {
      type: Map,
      of: Number // Date string -> count
    }
  },
  
  // User engagement metrics
  userEngagement: {
    averageContributionsPerUser: Number,
    averageProjectsPerUser: Number,
    averageBadgesPerUser: Number,
    userRetentionRate: Number, // Percentage of returning users
    contributionCompletionRate: Number, // Percentage of started contributions that are completed
    averageTimeToCompleteContribution: Number, // In days
  },
  
  // Project performance metrics
  projectPerformance: {
    mostActiveProjects: [{
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      name: String,
      contributionCount: Number,
      userCount: Number
    }],
    languageDistribution: {
      type: Map,
      of: Number // language -> count
    },
    categoriesDistribution: {
      type: Map,
      of: Number // category -> count
    },
    tagsDistribution: {
      type: Map,
      of: Number // tag -> count
    },
    difficultyDistribution: {
      beginner: Number,
      intermediate: Number,
      advanced: Number
    }
  },
  
  // Badge statistics
  badgeStatistics: {
    totalBadgesAwarded: Number,
    badgeDistribution: {
      type: Map,
      of: Number // badgeId -> count
    },
    rarityDistribution: {
      common: Number,
      uncommon: Number,
      rare: Number,
      epic: Number,
      legendary: Number
    },
    mostAwardedBadges: [{
      badgeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Badge'
      },
      title: String,
      count: Number
    }]
  },
  
  // Geographic data
  geographicData: {
    userCountByCountry: {
      type: Map,
      of: Number // country -> count
    },
    contributionsByCountry: {
      type: Map,
      of: Number // country -> count
    },
    projectsByCountry: {
      type: Map,
      of: Number // country -> count
    }
  },
  
  // Time-based analytics
  timeBasedAnalytics: {
    hourlyActivity: {
      type: Map,
      of: Number // hour (0-23) -> count
    },
    dailyActivity: {
      type: Map,
      of: Number // day of week (0-6) -> count
    },
    monthlyActivity: {
      type: Map,
      of: Number // month (1-12) -> count
    }
  },
  
  // Last updated timestamp
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Static method to get or create analytics document
// Since we only have one main analytics document, we'll use a single document approach
AnalyticsSchema.statics.getOrCreate = async function() {
  let analytics = await this.findOne();
  
  if (!analytics) {
    analytics = await this.create({
      platformMetrics: {
        totalUsers: 0,
        totalProjects: 0,
        totalContributions: 0,
        totalBadgesAwarded: 0,
        totalMentorships: 0,
        activeUsers: {
          daily: 0,
          weekly: 0,
          monthly: 0
        },
        projectsCreatedTimeline: {},
        contributionsTimeline: {},
        userRegistrationTimeline: {}
      },
      userEngagement: {
        averageContributionsPerUser: 0,
        averageProjectsPerUser: 0,
        averageBadgesPerUser: 0,
        userRetentionRate: 0,
        contributionCompletionRate: 0,
        averageTimeToCompleteContribution: 0
      },
      projectPerformance: {
        mostActiveProjects: [],
        languageDistribution: {},
        categoriesDistribution: {},
        tagsDistribution: {},
        difficultyDistribution: {
          beginner: 0,
          intermediate: 0,
          advanced: 0
        }
      },
      badgeStatistics: {
        totalBadgesAwarded: 0,
        badgeDistribution: {},
        rarityDistribution: {
          common: 0,
          uncommon: 0,
          rare: 0,
          epic: 0,
          legendary: 0
        },
        mostAwardedBadges: []
      },
      geographicData: {
        userCountByCountry: {},
        contributionsByCountry: {},
        projectsByCountry: {}
      },
      timeBasedAnalytics: {
        hourlyActivity: {},
        dailyActivity: {},
        monthlyActivity: {}
      }
    });
  }
  
  return analytics;
};

// Method to update platform metrics
AnalyticsSchema.statics.updatePlatformMetrics = async function() {
  const User = mongoose.model('User');
  const Project = mongoose.model('Project');
  const Contribution = mongoose.model('Contribution');
  const Badge = mongoose.model('Badge');
  const Mentorship = mongoose.model('Mentorship');
  
  // Count total documents
  const totalUsers = await User.countDocuments();
  const totalProjects = await Project.countDocuments();
  const totalContributions = await Contribution.countDocuments();
  const totalMentorships = await Mentorship.countDocuments();
  
  // Count badges awarded
  const users = await User.find({}, 'badges');
  const totalBadgesAwarded = users.reduce((total, user) => total + user.badges.length, 0);
  
  // Get active users
  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  
  const activeUsersDaily = await User.countDocuments({ lastActive: { $gte: oneDayAgo } });
  const activeUsersWeekly = await User.countDocuments({ lastActive: { $gte: oneWeekAgo } });
  const activeUsersMonthly = await User.countDocuments({ lastActive: { $gte: oneMonthAgo } });
  
  // Update analytics document
  const analytics = await this.getOrCreate();
  
  analytics.platformMetrics.totalUsers = totalUsers;
  analytics.platformMetrics.totalProjects = totalProjects;
  analytics.platformMetrics.totalContributions = totalContributions;
  analytics.platformMetrics.totalBadgesAwarded = totalBadgesAwarded;
  analytics.platformMetrics.totalMentorships = totalMentorships;
  
  analytics.platformMetrics.activeUsers.daily = activeUsersDaily;
  analytics.platformMetrics.activeUsers.weekly = activeUsersWeekly;
  analytics.platformMetrics.activeUsers.monthly = activeUsersMonthly;
  
  analytics.lastUpdated = new Date();
  
  await analytics.save();
  
  return analytics;
};

// Create or update analytics data
AnalyticsSchema.statics.refresh = async function() {
  // This method will call various update methods to refresh all analytics data
  await this.updatePlatformMetrics();
  
  // Additional update methods can be called here
  
  const analytics = await this.getOrCreate();
  return analytics;
};

const Analytics = mongoose.model('Analytics', AnalyticsSchema);

export default Analytics;
