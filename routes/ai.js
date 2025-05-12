import express from 'express';
import { check, validationResult } from 'express-validator';
import { authMiddleware } from '../middleware/auth.js';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /api/v1/ai/project-recommendations:
 *   post:
 *     summary: Get personalized project recommendations based on user skills
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               level:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *     responses:
 *       200:
 *         description: List of project recommendations
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/project-recommendations', 
  authMiddleware,
  [
    check('skills').isArray().withMessage('Skills must be an array'),
    check('level').isIn(['beginner', 'intermediate', 'advanced']).withMessage('Level must be beginner, intermediate, or advanced')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { skills, level } = req.body;
      
      // Check if API keys are available
      if (!config.ai.togetherAiKey && !config.ai.openrouterKey) {
        return res.status(500).json({ 
          success: false, 
          message: 'AI service is not configured' 
        });
      }

      // Mock response for now - would be replaced with actual API call to LLM
      const projectRecommendations = generateMockProjectRecommendations(skills, level);
      
      return res.status(200).json({
        success: true,
        data: projectRecommendations
      });
    } catch (error) {
      logger.error(`Error in project recommendations: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate project recommendations',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/ai/code-analysis:
 *   post:
 *     summary: Analyze code snippet and provide improvement suggestions
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - language
 *             properties:
 *               code:
 *                 type: string
 *               language:
 *                 type: string
 *     responses:
 *       200:
 *         description: Code analysis results
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/code-analysis', 
  authMiddleware,
  [
    check('code').notEmpty().withMessage('Code is required'),
    check('language').notEmpty().withMessage('Programming language is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { code, language } = req.body;
      
      // Check if API keys are available
      if (!config.ai.togetherAiKey && !config.ai.openrouterKey) {
        return res.status(500).json({ 
          success: false, 
          message: 'AI service is not configured' 
        });
      }

      // Mock response for now - would be replaced with actual API call to LLM
      const codeAnalysis = generateMockCodeAnalysis(code, language);
      
      return res.status(200).json({
        success: true,
        data: codeAnalysis
      });
    } catch (error) {
      logger.error(`Error in code analysis: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to analyze code',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/ai/learning-path:
 *   post:
 *     summary: Generate personalized learning path for a technology or skill
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - skill
 *               - currentLevel
 *             properties:
 *               skill:
 *                 type: string
 *               currentLevel:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *               targetLevel:
 *                 type: string
 *                 enum: [intermediate, advanced, expert]
 *     responses:
 *       200:
 *         description: Personalized learning path
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/learning-path', 
  authMiddleware,
  [
    check('skill').notEmpty().withMessage('Skill is required'),
    check('currentLevel').isIn(['beginner', 'intermediate', 'advanced']).withMessage('Current level must be beginner, intermediate, or advanced'),
    check('targetLevel').optional().isIn(['intermediate', 'advanced', 'expert']).withMessage('Target level must be intermediate, advanced, or expert')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { skill, currentLevel, targetLevel = getNextLevel(currentLevel) } = req.body;
      
      // Check if API keys are available
      if (!config.ai.togetherAiKey && !config.ai.openrouterKey) {
        return res.status(500).json({ 
          success: false, 
          message: 'AI service is not configured' 
        });
      }

      // Mock response for now - would be replaced with actual API call to LLM
      const learningPath = generateMockLearningPath(skill, currentLevel, targetLevel);
      
      return res.status(200).json({
        success: true,
        data: learningPath
      });
    } catch (error) {
      logger.error(`Error in learning path generation: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate learning path',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Helper functions for mock responses
function generateMockProjectRecommendations(skills, level) {
  // Create project recommendations based on skills and level
  const projectTypes = {
    beginner: ['Todo App', 'Weather App', 'Blog', 'Calculator'],
    intermediate: ['E-commerce Site', 'Social Media Clone', 'Dashboard', 'Chat Application'],
    advanced: ['Streaming Platform', 'AI-assisted Tool', 'Microservices Architecture', 'Blockchain Application']
  };
  
  const techStacks = {
    'javascript': ['React', 'Node.js', 'Express', 'MongoDB'],
    'python': ['Django', 'Flask', 'SQLAlchemy', 'PostgreSQL'],
    'java': ['Spring Boot', 'Hibernate', 'MySQL', 'Thymeleaf'],
    'typescript': ['Angular', 'NestJS', 'TypeORM', 'MySQL'],
    'ruby': ['Ruby on Rails', 'PostgreSQL', 'Devise', 'Sidekiq'],
    'php': ['Laravel', 'MySQL', 'Blade', 'Composer'],
    'go': ['Gin', 'GORM', 'PostgreSQL', 'Docker']
  };
  
  const projects = [];
  const projectCount = Math.min(3, Math.max(1, skills.length));
  
  for (let i = 0; i < projectCount; i++) {
    const projectType = projectTypes[level][Math.floor(Math.random() * projectTypes[level].length)];
    const relevantSkills = skills.filter(skill => Object.keys(techStacks).includes(skill.toLowerCase()));
    const techStack = relevantSkills.length > 0 ?
      techStacks[relevantSkills[Math.floor(Math.random() * relevantSkills.length)].toLowerCase()] :
      techStacks['javascript']; // Default to JavaScript stack if no matching skills
    
    projects.push({
      title: `${projectType} using ${techStack[0]}`,
      description: `A ${level} level project to build a ${projectType.toLowerCase()} using ${techStack.join(', ')}.`,
      difficulty: level,
      estimatedHours: level === 'beginner' ? 20 : level === 'intermediate' ? 40 : 80,
      technologies: techStack,
      learningOutcomes: [
        `Master ${techStack[0]} fundamentals`,
        `Learn how to integrate ${techStack[0]} with ${techStack[1]}`,
        'Apply best practices for project structure and code organization',
        'Implement user authentication and authorization'
      ]
    });
  }
  
  return projects;
}

function generateMockCodeAnalysis(code, language) {
  // Simple mock code analysis - in a real implementation, this would call an AI service
  return {
    summary: "Analysis of your code snippet",
    improvements: [
      {
        type: "Performance",
        suggestions: [
          "Consider using memoization for expensive computations",
          "Optimize database queries by adding proper indexes"
        ]
      },
      {
        type: "Readability",
        suggestions: [
          "Add more descriptive variable names",
          "Break down complex functions into smaller, focused ones",
          "Add JSDoc comments for better documentation"
        ]
      },
      {
        type: "Security",
        suggestions: [
          "Validate all user inputs",
          "Use parameterized queries to prevent SQL injection",
          "Implement proper authentication checks"
        ]
      }
    ],
    codeSnippets: [
      {
        title: "Improved version",
        code: "// This is a sample improved version\n// In a real implementation, we would provide actual improvements",
        explanation: "This is a placeholder for real AI-generated improvements"
      }
    ]
  };
}

function generateMockLearningPath(skill, currentLevel, targetLevel) {
  // Create a learning path based on skill and levels
  const resources = {
    'javascript': {
      courses: [
        { name: "JavaScript Fundamentals", url: "https://example.com/js-fundamentals", level: "beginner" },
        { name: "Advanced JavaScript Concepts", url: "https://example.com/advanced-js", level: "intermediate" },
        { name: "JavaScript Design Patterns", url: "https://example.com/js-patterns", level: "advanced" }
      ],
      books: [
        { name: "Eloquent JavaScript", author: "Marijn Haverbeke", level: "beginner" },
        { name: "You Don't Know JS", author: "Kyle Simpson", level: "intermediate" },
        { name: "JavaScript: The Good Parts", author: "Douglas Crockford", level: "advanced" }
      ],
      projects: [
        { name: "Build a Todo App", description: "Create a simple todo application", level: "beginner" },
        { name: "Create a Weather Dashboard", description: "Build a weather app with API integration", level: "intermediate" },
        { name: "Develop a Full-Stack Social Media App", description: "Create a complete social platform with authentication", level: "advanced" }
      ]
    },
    'python': {
      courses: [
        { name: "Python for Beginners", url: "https://example.com/python-basics", level: "beginner" },
        { name: "Intermediate Python Programming", url: "https://example.com/intermediate-python", level: "intermediate" },
        { name: "Advanced Python: Concurrency & Performance", url: "https://example.com/advanced-python", level: "advanced" }
      ],
      books: [
        { name: "Python Crash Course", author: "Eric Matthes", level: "beginner" },
        { name: "Fluent Python", author: "Luciano Ramalho", level: "intermediate" },
        { name: "Python Cookbook", author: "David Beazley", level: "advanced" }
      ],
      projects: [
        { name: "CLI Quiz App", description: "Build a command-line quiz application", level: "beginner" },
        { name: "Web Scraper", description: "Create a tool to extract data from websites", level: "intermediate" },
        { name: "Machine Learning Pipeline", description: "Develop a complete ML workflow", level: "advanced" }
      ]
    },
    // Add more skills as needed
  };
  
  // Default to JavaScript if the skill isn't found
  const skillResources = resources[skill.toLowerCase()] || resources['javascript'];
  
  // Map skill levels to numerical values for comparison
  const levelValues = { 'beginner': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4 };
  const currentLevelValue = levelValues[currentLevel];
  const targetLevelValue = levelValues[targetLevel];
  
  // Filter resources based on the learning path from current to target level
  const filteredCourses = skillResources.courses.filter(course => {
    const courseLevelValue = levelValues[course.level];
    return courseLevelValue >= currentLevelValue && courseLevelValue <= targetLevelValue;
  });
  
  const filteredBooks = skillResources.books.filter(book => {
    const bookLevelValue = levelValues[book.level];
    return bookLevelValue >= currentLevelValue && bookLevelValue <= targetLevelValue;
  });
  
  const filteredProjects = skillResources.projects.filter(project => {
    const projectLevelValue = levelValues[project.level];
    return projectLevelValue >= currentLevelValue && projectLevelValue <= targetLevelValue;
  });
  
  return {
    skill,
    currentLevel,
    targetLevel,
    estimatedTimeInWeeks: (targetLevelValue - currentLevelValue) * 4, // Simple estimation: 4 weeks per level
    milestones: [
      {
        name: `${skill} Fundamentals`,
        description: `Master the core concepts of ${skill}`,
        estimatedCompletionTime: '2 weeks',
        resources: [
          ...filteredCourses.slice(0, 1),
          ...filteredBooks.slice(0, 1)
        ]
      },
      {
        name: `${skill} Practical Application`,
        description: `Apply your knowledge in real projects`,
        estimatedCompletionTime: '4 weeks',
        resources: [
          ...filteredProjects.slice(0, 2)
        ]
      },
      {
        name: `Advanced ${skill} Concepts`,
        description: `Deepen your understanding with advanced material`,
        estimatedCompletionTime: '6 weeks',
        resources: [
          ...filteredCourses.slice(1, 3),
          ...filteredBooks.slice(1, 2)
        ]
      }
    ],
    recommendedResources: {
      courses: filteredCourses,
      books: filteredBooks,
      projects: filteredProjects
    }
  };
}

function getNextLevel(currentLevel) {
  const levels = {
    'beginner': 'intermediate',
    'intermediate': 'advanced',
    'advanced': 'expert'
  };
  return levels[currentLevel] || 'intermediate';
}

export default router;
