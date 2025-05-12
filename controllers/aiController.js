import axios from 'axios';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import User from '../models/User.js';
import Project from '../models/Project.js';

/**
 * @desc    Generate project recommendations based on user skills
 * @route   GET /api/v1/ai/recommendations
 * @access  Private
 */
export const getProjectRecommendations = asyncHandler(async (req, res) => {
  // Get current user with their skills
  const user = await User.findById(req.user.id).select('skills level');
  
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  if (!user.skills || user.skills.length === 0) {
    throw new ApiError(400, 'Please update your profile with your skills first');
  }
  
  // Find projects that match user skills and are appropriate for their level
  const userSkills = user.skills || [];
  const userLevel = user.level || 'beginner';
  
  // Define difficulty mapping
  const difficultyLevels = {
    'beginner': ['beginner'],
    'intermediate': ['beginner', 'intermediate'],
    'advanced': ['beginner', 'intermediate', 'advanced'],
    'expert': ['intermediate', 'advanced', 'expert']
  };
  
  // Get suitable difficulties based on user level
  const suitableDifficulties = difficultyLevels[userLevel] || ['beginner'];
  
  // Find matching projects
  const recommendedProjects = await Project.find({
    techStack: { $in: userSkills },
    difficulty: { $in: suitableDifficulties },
    status: 'active'
  })
  .sort('-createdAt')
  .limit(10);
  
  // Find trending projects (most stars/views) that might be interesting
  const trendingProjects = await Project.find({
    status: 'active'
  })
  .sort('-starCount -viewCount')
  .limit(5);
  
  // Find projects that would help the user learn new skills
  // (projects with at least one skill they know but others they could learn)
  const learningProjects = await Project.aggregate([
    { $match: { status: 'active' } },
    { $match: { techStack: { $in: userSkills } } }, // At least one skill they know
    { $match: { techStack: { $not: { $all: userSkills } } } }, // Not all skills they know
    { $sort: { createdAt: -1 } },
    { $limit: 5 }
  ]);
  
  logger.info(`Generated project recommendations for user: ${req.user.id}`);
  
  res.status(200).json({
    success: true,
    data: {
      recommended: recommendedProjects,
      trending: trendingProjects,
      learning: learningProjects
    }
  });
});

/**
 * @desc    Analyze code for learning opportunities
 * @route   POST /api/v1/ai/analyze-code
 * @access  Private
 */
export const analyzeCode = asyncHandler(async (req, res) => {
  const { code, language } = req.body;
  
  if (!code) {
    throw new ApiError(400, 'No code provided for analysis');
  }
  
  if (!language) {
    throw new ApiError(400, 'Programming language must be specified');
  }
  
  // In a real implementation, this would call an AI service API
  // For now, we'll mock a simple analysis
  
  // Mock analysis based on language
  const mockAnalysis = generateMockAnalysis(code, language);
  
  logger.info(`Code analysis generated for user: ${req.user.id}`);
  
  res.status(200).json({
    success: true,
    data: mockAnalysis
  });
});

/**
 * @desc    Generate learning path for a user
 * @route   POST /api/v1/ai/learning-path
 * @access  Private
 */
export const generateLearningPath = asyncHandler(async (req, res) => {
  const { targetSkills, timeframe, currentLevel } = req.body;
  
  if (!targetSkills || !targetSkills.length) {
    throw new ApiError(400, 'Target skills are required');
  }
  
  // Get user's current skills
  const user = await User.findById(req.user.id).select('skills level');
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  const userCurrentSkills = user.skills || [];
  const userLevel = currentLevel || user.level || 'beginner';
  
  // Find relevant projects for learning path
  const relevantProjects = await Project.find({
    techStack: { $in: targetSkills },
    status: 'active'
  })
  .sort('difficulty') // Easier projects first
  .limit(10);
  
  // Generate a mock learning path
  // In a real app, this would use a more sophisticated AI service
  const learningPath = generateMockLearningPath(userCurrentSkills, targetSkills, userLevel, timeframe, relevantProjects);
  
  logger.info(`Learning path generated for user: ${req.user.id}`);
  
  res.status(200).json({
    success: true,
    data: learningPath
  });
});

/**
 * @desc    Get skill gap analysis between user and project
 * @route   GET /api/v1/ai/skill-gap/:projectId
 * @access  Private
 */
export const getSkillGapAnalysis = asyncHandler(async (req, res) => {
  // Get project
  const project = await Project.findById(req.params.projectId);
  if (!project) {
    throw new ApiError(404, 'Project not found');
  }
  
  // Get user
  const user = await User.findById(req.user.id).select('skills level');
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  const userSkills = user.skills || [];
  const projectSkills = project.techStack || [];
  
  // Find skills the user has that are used in the project
  const matchingSkills = userSkills.filter(skill => projectSkills.includes(skill));
  
  // Find skills required by the project that the user doesn't have
  const missingSkills = projectSkills.filter(skill => !userSkills.includes(skill));
  
  // Calculate a readiness score (0-100)
  const skillMatchPercentage = projectSkills.length ? (matchingSkills.length / projectSkills.length) * 100 : 0;
  
  // Difficulty factor based on project difficulty vs user level
  const difficultyLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
  const userLevelIndex = difficultyLevels.indexOf(user.level || 'beginner');
  const projectLevelIndex = difficultyLevels.indexOf(project.difficulty || 'intermediate');
  
  let difficultyFactor = 1; // equal levels
  if (userLevelIndex > projectLevelIndex) {
    // User's level is higher than project difficulty
    difficultyFactor = 1.2; // bonus for being over-qualified
  } else if (userLevelIndex < projectLevelIndex) {
    // Project is more difficult than user's level
    const levelGap = projectLevelIndex - userLevelIndex;
    difficultyFactor = 1 - (levelGap * 0.2); // penalty for each level gap
  }
  
  // Calculate final readiness score, capped at 100
  const readinessScore = Math.min(Math.round(skillMatchPercentage * difficultyFactor), 100);
  
  // Generate learning resources for missing skills
  const learningResources = missingSkills.map(skill => ({
    skill,
    resources: generateMockLearningResources(skill)
  }));
  
  logger.info(`Skill gap analysis generated for user: ${req.user.id} and project: ${project._id}`);
  
  res.status(200).json({
    success: true,
    data: {
      matchingSkills,
      missingSkills,
      readinessScore,
      learningResources
    }
  });
});

/**
 * @desc    AI Chat Assistant
 * @route   POST /api/v1/ai/chat
 * @access  Private
 */
export const aiChat = asyncHandler(async (req, res) => {
  const { message, context } = req.body;
  
  if (!message) {
    throw new ApiError(400, 'Message is required');
  }

  // Example prompt for AI chat
  const prompt = `
    User message: ${message}
    ${context ? `Context: ${context}` : ''}
    Respond as a helpful developer assistant.
  `;

  // In a real implementation, this would call an AI service
  const response = {
    text: simulateAIChat(message),
    suggestions: [
      "How do I contribute to open source?",
      "What projects match my skills?",
      "Help me prepare for a technical interview"
    ]
  };

  logger.info(`AI chat response generated for user: ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: response
  });
});

/**
 * @desc    AI Mentorship Suggestions
 * @route   POST /api/v1/ai/mentorship/suggest
 * @access  Private
 */
export const suggestMentorship = asyncHandler(async (req, res) => {
  const { skills, goals, mentorPreferences } = req.body;
  
  // Get user's skills if not provided
  let userSkills = skills;
  if (!userSkills && req.user) {
    const user = await User.findById(req.user.id);
    userSkills = user?.skills || [];
  }

  // Find potential mentors based on skills
  const potentialMentors = await User.find({
    isMentor: true,
    skills: { $in: userSkills }
  })
  .select('name skills level bio socialLinks')
  .limit(3);
  
  // Format mentor suggestions
  const mentorSuggestions = potentialMentors.map(mentor => ({
    id: mentor._id,
    name: mentor.name,
    skills: mentor.skills,
    level: mentor.level,
    bio: mentor.bio,
    matchReason: `Expert in ${mentor.skills.filter(s => userSkills.includes(s)).join(', ')}`
  }));

  // Add AI-generated suggestions for learning goals
  const learningGoals = [
    `Master ${userSkills[0]} by building a real-world project`,
    `Learn how to integrate ${userSkills[0]} with ${userSkills[1] || 'other technologies'}`,
    `Understand best practices and patterns for ${userSkills[0]} development`
  ];

  logger.info(`Mentorship suggestions generated for user: ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: {
      mentorSuggestions,
      learningGoals,
      recommendedMeetingFrequency: "Weekly",
      suggestedTopics: [
        "Code review of personal projects",
        "Career guidance and industry trends",
        "Technical interview preparation"
      ]
    }
  });
});

// Helper Functions

/**
 * Helper function to generate mock analysis
 */
const generateMockAnalysis = (code, language) => {
  // This would be replaced with a real AI analysis in production
  const codeSize = code.length;
  const lineCount = code.split('\n').length;
  
  return {
    summary: `Analyzed ${lineCount} lines of ${language} code`,
    complexity: codeSize > 5000 ? 'High' : codeSize > 1000 ? 'Medium' : 'Low',
    suggestions: [
      'Consider adding more comments to explain complex logic',
      'Look for opportunities to refactor repeated code into functions',
      'Add proper error handling for robust code'
    ],
    learningOpportunities: [
      {
        topic: `Advanced ${language} techniques`,
        resources: [
          `https://developer.mozilla.org/en-US/docs/Web/${language}`,
          `https://www.freecodecamp.org/learn/${language.toLowerCase()}`
        ]
      }
    ]
  };
};

/**
 * Helper function to generate mock learning path
 */
const generateMockLearningPath = (currentSkills, targetSkills, currentLevel, timeframe, relevantProjects) => {
  // This would be replaced with a real AI-generated learning path in production
  const newSkills = targetSkills.filter(skill => !currentSkills.includes(skill));
  const timeframeInWeeks = timeframe === 'short' ? 4 : timeframe === 'medium' ? 12 : 24;
  
  // Generate steps based on skill gaps
  const steps = [];
  
  if (newSkills.length > 0) {
    // Add fundamental learning steps for each new skill
    newSkills.forEach((skill, index) => {
      steps.push({
        step: index + 1,
        title: `Learn ${skill} fundamentals`,
        description: `Build a foundation in ${skill} through tutorials and basic projects`,
        duration: `${Math.round(timeframeInWeeks / (newSkills.length + 1))} weeks`,
        resources: generateMockLearningResources(skill)
      });
    });
  }
  
  // Add relevant projects as practical steps
  if (relevantProjects.length > 0) {
    relevantProjects.slice(0, 3).forEach((project, index) => {
      steps.push({
        step: steps.length + 1,
        title: `Contribute to ${project.title}`,
        description: `Apply your learning by contributing to this open-source project`,
        duration: '2-3 weeks',
        projectId: project._id
      });
    });
  }
  
  // Add a final mastery project
  steps.push({
    step: steps.length + 1,
    title: 'Build a portfolio project',
    description: 'Create your own project using all the skills you\'ve learned',
    duration: '3-4 weeks'
  });
  
  return {
    targetSkills,
    timeframeInWeeks,
    startingLevel: currentLevel,
    expectedEndLevel: getNextLevel(currentLevel),
    steps
  };
};

/**
 * Helper function to generate mock learning resources
 */
const generateMockLearningResources = (skill) => {
  // This would be replaced with real, dynamically generated resources in production
  const resources = [
    {
      title: `${skill} Fundamentals`,
      url: `https://www.freecodecamp.org/learn/${skill.toLowerCase()}`,
      type: 'course'
    },
    {
      title: `${skill} Documentation`,
      url: `https://developer.mozilla.org/en-US/docs/Web/${skill}`,
      type: 'documentation'
    },
    {
      title: `${skill} Project Tutorial`,
      url: `https://www.youtube.com/results?search_query=${skill}+tutorial`,
      type: 'video'
    }
  ];
  
  return resources;
};

/**
 * Helper function to determine next level
 */
const getNextLevel = (currentLevel) => {
  const levels = ['beginner', 'intermediate', 'advanced', 'expert'];
  const currentIndex = levels.indexOf(currentLevel);
  
  if (currentIndex === -1 || currentIndex === levels.length - 1) {
    return currentLevel; // Stay at same level if already expert or invalid
  }
  
  return levels[currentIndex + 1];
};

/**
 * Helper function to simulate AI chat response
 */
const simulateAIChat = (message) => {
  const lowercaseMessage = message.toLowerCase();
  
  // Simple pattern matching for common questions
  if (lowercaseMessage.includes('contribute') && lowercaseMessage.includes('open source')) {
    return "To contribute to open source: 1) Find a project that matches your skills, 2) Look for issues labeled 'good first issue' or 'beginner friendly', 3) Fork the repository, 4) Make your changes and submit a PR. OpenElevate can help match you with projects that fit your skill level!";
  }
  
  if (lowercaseMessage.includes('learn') && (lowercaseMessage.includes('javascript') || lowercaseMessage.includes('js'))) {
    return "To learn JavaScript, I recommend starting with interactive platforms like freeCodeCamp or MDN's JavaScript guides. Build small projects to practice, and consider contributing to beginner-friendly JS projects on OpenElevate to get real-world experience.";
  }
  
  if (lowercaseMessage.includes('interview')) {
    return "For technical interviews, focus on: 1) Core concepts in your stack, 2) Problem-solving skills with algorithms and data structures, 3) System design for senior roles, 4) Preparing questions about the company. Would you like specific resources for interview prep?";
  }
  
  // Default response
  return "I'm here to help with your development journey! You can ask me about finding projects, learning resources, technical concepts, or how to make the most of OpenElevate.";
};
