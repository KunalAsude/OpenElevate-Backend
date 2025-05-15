import axios from 'axios';
import { logger } from '../utils/logger.js';
import User from '../models/User.js';
import GithubAnalytics from '../models/GithubAnalytics.js';

class GitHubService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.apiClient = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
  }

  // Get user profile information
  async getUserProfile() {
    try {
      const { data } = await this.apiClient.get('/user');
      return data;
    } catch (error) {
      logger.error(`GitHub API - getUserProfile error: ${error.message}`);
      throw error;
    }
  }

  // Get user's repositories
  async getUserRepositories(username, page = 1, perPage = 100) {
    try {
      const { data } = await this.apiClient.get(`/users/${username}/repos`, {
        params: { page, per_page: perPage, sort: 'updated' }
      });
      
      return data;
    } catch (error) {
      logger.error(`GitHub API - getUserRepositories error: ${error.message}`);
      throw error;
    }
  }

  // Get user's starred repositories
  async getUserStarredRepos(username, page = 1, perPage = 100) {
    try {
      const { data } = await this.apiClient.get(`/users/${username}/starred`, {
        params: { page, per_page: perPage }
      });
      
      return data;
    } catch (error) {
      logger.error(`GitHub API - getUserStarredRepos error: ${error.message}`);
      throw error;
    }
  }

  // Get user's contributions (need to fetch events as GitHub doesn't provide a direct API)
  async getUserContributions(username, page = 1, perPage = 100) {
    try {
      const { data } = await this.apiClient.get(`/users/${username}/events`, {
        params: { page, per_page: perPage }
      });
      
      return data;
    } catch (error) {
      logger.error(`GitHub API - getUserContributions error: ${error.message}`);
      throw error;
    }
  }

  // Get user's pull requests (need to use search API)
  async getUserPullRequests(username) {
    try {
      const { data } = await this.apiClient.get('/search/issues', {
        params: {
          q: `author:${username} type:pr`,
          per_page: 100
        }
      });
      
      return data;
    } catch (error) {
      logger.error(`GitHub API - getUserPullRequests error: ${error.message}`);
      throw error;
    }
  }

  // Get user's issues
  async getUserIssues(username) {
    try {
      const { data } = await this.apiClient.get('/search/issues', {
        params: {
          q: `author:${username} type:issue`,
          per_page: 100
        }
      });
      
      return data;
    } catch (error) {
      logger.error(`GitHub API - getUserIssues error: ${error.message}`);
      throw error;
    }
  }

  // Get user's projects
  async getUserProjects(username) {
    try {
      const { data } = await this.apiClient.get(`/users/${username}/projects`, {
        headers: {
          Accept: 'application/vnd.github.inertia-preview+json'
        }
      });
      
      return data;
    } catch (error) {
      logger.error(`GitHub API - getUserProjects error: ${error.message}`);
      // Projects API might not be accessible for all users
      return [];
    }
  }

  // Analyze languages used in repositories
  async analyzeLanguages(repositories) {
    const languageStats = new Map();
    
    try {
      for (const repo of repositories) {
        if (repo.language) {
          // Sanitize language name by replacing dots with underscores to avoid Mongoose error
          // Mongoose doesn't allow keys with dots in maps
          const sanitizedLanguage = repo.language.replace(/\./g, '_');
          const count = languageStats.get(sanitizedLanguage) || 0;
          languageStats.set(sanitizedLanguage, count + 1);
        }
      }
      
      return Object.fromEntries(languageStats);
    } catch (error) {
      logger.error(`GitHub API - analyzeLanguages error: ${error.message}`);
      return {};
    }
  }

  // Collect comprehensive GitHub data for a user
  async collectUserAnalytics(userId) {
    try {
      // Get user from database
      const user = await User.findById(userId);
      if (!user || !user.oauth || !user.oauth.github || !user.oauth.github.accessToken) {
        throw new Error('User not found or GitHub not connected');
      }

      // Set access token from user record
      this.accessToken = user.oauth.github.accessToken;
      this.apiClient.defaults.headers.Authorization = `token ${this.accessToken}`;
      
      // Get GitHub profile
      const profile = await this.getUserProfile();
      const username = profile.login;
      
      // Get repositories
      const repositories = await this.getUserRepositories(username);
      
      // Get starred repos
      const starredRepos = await this.getUserStarredRepos(username);
      
      // Get contributions (events)
      const contributionEvents = await this.getUserContributions(username);
      
      // Get pull requests
      const pullRequests = await this.getUserPullRequests(username);
      
      // Get issues
      const issues = await this.getUserIssues(username);
      
      // Get projects (if available)
      const projects = await this.getUserProjects(username);
      
      // Analyze languages
      const languageDistribution = await this.analyzeLanguages(repositories);

      // Calculate contribution calendar (simplified - in production you'd want more detailed analysis)
      const contributionCalendar = new Map();
      contributionEvents.forEach(event => {
        // Get date and sanitize by replacing dashes with underscores to avoid MongoDB dot notation problems
        const date = event.created_at.split('T')[0].replace(/-/g, '_');
        const count = contributionCalendar.get(date) || 0;
        contributionCalendar.set(date, count + 1);
      });
      
      // Prepare analytics data
      const analyticsData = {
        userId,
        githubId: profile.id.toString(),
        username: profile.login,
        profileData: {
          name: profile.name,
          avatarUrl: profile.avatar_url,
          bio: profile.bio,
          company: profile.company,
          blog: profile.blog,
          location: profile.location,
          email: profile.email,
          hireable: profile.hireable,
          followers: profile.followers,
          following: profile.following,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at
        },
        repositories: {
          totalCount: profile.public_repos + (profile.total_private_repos || 0),
          publicCount: profile.public_repos,
          privateCount: profile.total_private_repos || 0,
          languageDistribution: languageDistribution,
          stargazersCount: repositories.reduce((sum, repo) => sum + repo.stargazers_count, 0),
          totalForks: repositories.reduce((sum, repo) => sum + repo.forks_count, 0),
          // Add detailed repository information
          details: repositories.map(repo => ({
            id: repo.id.toString(),
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            url: repo.url,
            htmlUrl: repo.html_url,
            language: repo.language,
            fork: repo.fork,
            forksCount: repo.forks_count,
            stargazersCount: repo.stargazers_count,
            watchersCount: repo.watchers_count,
            size: repo.size,
            defaultBranch: repo.default_branch,
            openIssuesCount: repo.open_issues_count,
            topics: repo.topics || [],
            hasIssues: repo.has_issues,
            hasProjects: repo.has_projects,
            hasWiki: repo.has_wiki,
            hasPages: repo.has_pages,
            hasDiscussions: repo.has_discussions || false,
            archived: repo.archived,
            disabled: repo.disabled,
            visibility: repo.visibility || (repo.private ? 'private' : 'public'),
            pushedAt: repo.pushed_at,
            createdAt: repo.created_at,
            updatedAt: repo.updated_at
          }))
        },
        contributions: {
          totalCommits: contributionEvents.filter(event => event.type === 'PushEvent').length,
          contributionCalendar: Object.fromEntries(contributionCalendar),
          contributionYears: [...new Set(contributionEvents.map(event => new Date(event.created_at).getFullYear()))],
          contributionRepositories: [...new Set(contributionEvents.map(event => event.repo?.name).filter(Boolean))]
        },
        pullRequests: {
          totalCount: pullRequests.total_count,
          openCount: pullRequests.items.filter(pr => pr.state === 'open').length,
          closedCount: pullRequests.items.filter(pr => pr.state === 'closed').length,
          mergedCount: pullRequests.items.filter(pr => pr.pull_request?.merged_at).length
        },
        issues: {
          totalCount: issues.total_count,
          openCount: issues.items.filter(issue => issue.state === 'open').length,
          closedCount: issues.items.filter(issue => issue.state === 'closed').length
        },
        stars: {
          totalGiven: starredRepos.length,
          repositories: starredRepos.map(repo => ({
            name: repo.name,
            owner: repo.owner.login,
            url: repo.html_url,
            description: repo.description,
            starredAt: new Date() // GitHub API doesn't provide starred_at in basic endpoint
          }))
        },
        projects: projects.map(project => ({
          name: project.name,
          body: project.body,
          url: project.html_url,
          state: project.state,
          closedAt: project.closed_at,
          createdAt: project.created_at,
          updatedAt: project.updated_at
        })),
        lastUpdated: new Date()
      };
      
      // Save analytics to database
      await GithubAnalytics.createOrUpdate(userId, analyticsData);
      
      // Update user's avatar and socialLinks from GitHub if not already set
      if (!user.avatarUrl && profile.avatar_url) {
        user.avatarUrl = profile.avatar_url;
      }
      
      if (!user.socialLinks.github) {
        user.socialLinks.github = `https://github.com/${profile.login}`;
      }
      
      await user.save({ validateBeforeSave: false });
      
      return analyticsData;
    } catch (error) {
      logger.error(`GitHub API - collectUserAnalytics error: ${error.message}`);
      throw error;
    }
  }

  // Refresh access token if it has expired (if GitHub supports refresh tokens)
  static async refreshAccessToken(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.oauth || !user.oauth.github || !user.oauth.github.refreshToken) {
        throw new Error('Cannot refresh token: user or refresh token not found');
      }
      
      // GitHub OAuth doesn't traditionally use refresh tokens, but this is here for future compatibility
      // or if you implement an extension to the standard OAuth flow
      
      // Simply return the current access token for now
      return user.oauth.github.accessToken;
    } catch (error) {
      logger.error(`GitHub API - refreshAccessToken error: ${error.message}`);
      throw error;
    }
  }
}

export default GitHubService;
