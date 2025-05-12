import { check, validationResult } from 'express-validator';
import { ApiError } from './errorHandler.js';

// Validate request and return errors
export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array().map(error => error.msg).join(', ');
    return next(new ApiError(400, message));
  }
  next();
};

// Registration validation rules
export const registerValidation = [
  check('name')
    .trim()
    .not()
    .isEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  
  check('email')
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage('Please provide a valid email address'),
  
  check('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .matches(/[a-zA-Z]/)
    .withMessage('Password must contain at least one letter'),
  
  check('role')
    .isIn(['developer', 'client', 'mentor', 'admin'])
    .withMessage('Invalid role specified'),
  
  validateRequest
];

// Login validation rules
export const loginValidation = [
  check('email')
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage('Please provide a valid email address'),
  
  check('password')
    .not()
    .isEmpty()
    .withMessage('Password is required'),
  
  validateRequest
];

// Project validation rules
export const projectValidation = [
  check('title')
    .trim()
    .not()
    .isEmpty()
    .withMessage('Project title is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  
  check('description')
    .trim()
    .not()
    .isEmpty()
    .withMessage('Project description is required')
    .isLength({ min: 10 })
    .withMessage('Description must be at least 10 characters long'),
  
  check('techStack')
    .isArray()
    .withMessage('Tech stack must be an array')
    .not()
    .isEmpty()
    .withMessage('Tech stack is required'),
  
  check('difficulty')
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Difficulty must be beginner, intermediate, or advanced'),
  
  check('githubLink')
    .trim()
    .not()
    .isEmpty()
    .withMessage('GitHub link is required')
    .isURL()
    .withMessage('Please provide a valid URL'),
  
  validateRequest
];