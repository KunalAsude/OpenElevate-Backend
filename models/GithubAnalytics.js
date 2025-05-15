import mongoose from 'mongoose';

const GithubAnalyticsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  githubId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  profileData: {
    name: String,
    avatarUrl: String,
    bio: String,
    company: String,
    blog: String,
    location: String,
    email: String,
    hireable: Boolean,
    followers: Number,
    following: Number,
    createdAt: Date,
    updatedAt: Date
  },
  repositories: {
    totalCount: Number,
    publicCount: Number,
    privateCount: Number, // Only if permissions allow
    languageDistribution: Map,
    stargazersCount: Number,
    totalForks: Number,
    // Detailed repository information
    details: [{
      id: String,
      name: String,
      fullName: String,
      description: String,
      url: String,
      htmlUrl: String,
      language: String,
      fork: Boolean,
      forksCount: Number,
      stargazersCount: Number,
      watchersCount: Number,
      size: Number,
      defaultBranch: String,
      openIssuesCount: Number,
      topics: [String],
      hasIssues: Boolean,
      hasProjects: Boolean,
      hasWiki: Boolean,
      hasPages: Boolean,
      hasDiscussions: Boolean,
      archived: Boolean,
      disabled: Boolean,
      visibility: String,
      pushedAt: Date,
      createdAt: Date,
      updatedAt: Date
    }]
  },
  contributions: {
    totalCommits: Number,
    contributionCalendar: Map, // Dates and count
    contributionYears: [Number],
    contributionRepositories: [String]
  },
  pullRequests: {
    totalCount: Number,
    openCount: Number,
    closedCount: Number,
    mergedCount: Number
  },
  issues: {
    totalCount: Number,
    openCount: Number,
    closedCount: Number
  },
  stars: {
    totalGiven: Number,
    repositories: [{
      name: String,
      owner: String,
      url: String,
      description: String,
      starredAt: Date
    }]
  },
  projects: [{
    name: String,
    body: String,
    url: String,
    state: String,
    closedAt: Date,
    createdAt: Date,
    updatedAt: Date
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create compound index for userId and githubId
GithubAnalyticsSchema.index({ userId: 1, githubId: 1 }, { unique: true });

// Static method to create or update analytics
GithubAnalyticsSchema.statics.createOrUpdate = async function(userId, data) {
  const { githubId } = data;
  
  const analytics = await this.findOneAndUpdate(
    { userId, githubId },
    { ...data, lastUpdated: Date.now() },
    { new: true, upsert: true }
  );
  
  return analytics;
};

const GithubAnalytics = mongoose.model('GithubAnalytics', GithubAnalyticsSchema);

export default GithubAnalytics;
