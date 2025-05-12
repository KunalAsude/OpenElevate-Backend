import express from 'express';
import { check, validationResult } from 'express-validator';
import { authMiddleware, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendEmail } from '../utils/email.js';
import User from '../models/User.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /api/v1/emails/contact:
 *   post:
 *     summary: Send a contact email from user
 *     tags: [Emails]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - subject
 *               - message
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/contact', [
  check('name').notEmpty().withMessage('Name is required').trim().escape(),
  check('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  check('subject').notEmpty().withMessage('Subject is required').trim().escape(),
  check('message').notEmpty().withMessage('Message is required').trim()
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, email, subject, message } = req.body;

  // Send email to admin
  await sendEmail({
    to: process.env.ADMIN_EMAIL || 'admin@openelevate.org',
    subject: `Contact Form: ${subject}`,
    html: `
      <h3>New contact from OpenElevate</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <p>${message}</p>
    `
  });

  // Send confirmation email to sender
  await sendEmail({
    to: email,
    subject: 'Thank you for contacting OpenElevate',
    html: `
      <h3>Thank you for contacting OpenElevate</h3>
      <p>We have received your message and will get back to you as soon as possible.</p>
      <p>Your message:</p>
      <p><em>${message}</em></p>
    `
  });

  logger.info(`Contact form submitted by: ${email}`);

  res.status(200).json({
    success: true,
    message: 'Email sent successfully'
  });
}));

/**
 * @swagger
 * /api/v1/emails/newsletter/subscribe:
 *   post:
 *     summary: Subscribe to newsletter
 *     tags: [Emails]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscribed successfully
 *       400:
 *         description: Invalid input or already subscribed
 *       500:
 *         description: Server error
 */
router.post('/newsletter/subscribe', [
  check('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  check('name').optional().trim().escape()
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, name = '' } = req.body;

  // Check if Newsletter model exists, if not, create it inline
  let Newsletter;
  try {
    Newsletter = mongoose.model('Newsletter');
  } catch (e) {
    // Define Newsletter schema if not already defined
    const NewsletterSchema = new mongoose.Schema({
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
      },
      name: {
        type: String,
        trim: true
      },
      subscribed: {
        type: Boolean,
        default: true
      },
      subscribedAt: {
        type: Date,
        default: Date.now
      }
    });
    Newsletter = mongoose.model('Newsletter', NewsletterSchema);
  }

  // Check if already subscribed
  const existingSubscription = await Newsletter.findOne({ email });
  if (existingSubscription) {
    if (existingSubscription.subscribed) {
      return res.status(400).json({
        success: false,
        message: 'Email already subscribed to the newsletter'
      });
    } else {
      // Re-subscribe
      existingSubscription.subscribed = true;
      existingSubscription.subscribedAt = new Date();
      if (name) existingSubscription.name = name;
      await existingSubscription.save();
      
      await sendEmail({
        to: email,
        subject: 'Welcome back to OpenElevate Newsletter',
        html: `
          <h3>Welcome back to the OpenElevate Newsletter!</h3>
          <p>You have been successfully re-subscribed to our newsletter.</p>
          <p>You'll now receive updates on new features, projects, and opportunities in the open source ecosystem.</p>
        `
      });

      return res.status(200).json({
        success: true,
        message: 'Successfully re-subscribed to the newsletter'
      });
    }
  }

  // Create new subscription
  await Newsletter.create({
    email,
    name,
    subscribed: true,
    subscribedAt: new Date()
  });

  // Send welcome email
  await sendEmail({
    to: email,
    subject: 'Welcome to OpenElevate Newsletter',
    html: `
      <h3>Welcome to the OpenElevate Newsletter!</h3>
      <p>Thank you for subscribing to our newsletter.</p>
      <p>You'll now receive updates on new features, projects, and opportunities in the open source ecosystem.</p>
    `
  });

  logger.info(`New newsletter subscription: ${email}`);

  res.status(200).json({
    success: true,
    message: 'Successfully subscribed to the newsletter'
  });
}));

/**
 * @swagger
 * /api/v1/emails/newsletter/unsubscribe:
 *   post:
 *     summary: Unsubscribe from newsletter
 *     tags: [Emails]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Unsubscribed successfully
 *       400:
 *         description: Invalid input or not subscribed
 *       500:
 *         description: Server error
 */
router.post('/newsletter/unsubscribe', [
  check('email').isEmail().withMessage('Please provide a valid email').normalizeEmail()
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email } = req.body;

  // Get Newsletter model
  let Newsletter;
  try {
    Newsletter = mongoose.model('Newsletter');
  } catch (e) {
    return res.status(400).json({
      success: false,
      message: 'You are not subscribed to the newsletter'
    });
  }

  // Check if subscribed
  const subscription = await Newsletter.findOne({ email });
  if (!subscription || !subscription.subscribed) {
    return res.status(400).json({
      success: false,
      message: 'Email not subscribed to the newsletter'
    });
  }

  // Update subscription status
  subscription.subscribed = false;
  await subscription.save();

  // Send confirmation email
  await sendEmail({
    to: email,
    subject: 'Unsubscribed from OpenElevate Newsletter',
    html: `
      <h3>You have been unsubscribed from the OpenElevate Newsletter</h3>
      <p>We're sorry to see you go! If you change your mind, you can always re-subscribe later.</p>
    `
  });

  logger.info(`Newsletter unsubscription: ${email}`);

  res.status(200).json({
    success: true,
    message: 'Successfully unsubscribed from the newsletter'
  });
}));

/**
 * @swagger
 * /api/v1/emails/notification:
 *   post:
 *     summary: Send a notification email to a user
 *     tags: [Emails]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - subject
 *               - message
 *             properties:
 *               userId:
 *                 type: string
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Notification sent successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post('/notification', authMiddleware, authorize('admin'), [
  check('userId').notEmpty().withMessage('User ID is required').isMongoId().withMessage('Invalid user ID format'),
  check('subject').notEmpty().withMessage('Subject is required').trim().escape(),
  check('message').notEmpty().withMessage('Message is required').trim()
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { userId, subject, message } = req.body;

  // Find user
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Send notification email
  await sendEmail({
    to: user.email,
    subject: `OpenElevate: ${subject}`,
    html: `
      <h3>${subject}</h3>
      <p>${message}</p>
    `
  });

  logger.info(`Notification email sent to: ${user.email} by admin: ${req.user.email}`);

  res.status(200).json({
    success: true,
    message: 'Notification sent successfully'
  });
}));

/**
 * @swagger
 * /api/v1/emails/bulk:
 *   post:
 *     summary: Send bulk emails to multiple users
 *     tags: [Emails]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipients
 *               - subject
 *               - message
 *             properties:
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bulk emails sent successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/bulk', authMiddleware, authorize('admin'), [
  check('recipients').isArray().withMessage('Recipients must be an array').notEmpty().withMessage('Recipients are required'),
  check('subject').notEmpty().withMessage('Subject is required').trim().escape(),
  check('message').notEmpty().withMessage('Message is required').trim()
], asyncHandler(async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { recipients, subject, message } = req.body;

  // Validate recipients format (emails or user IDs)
  const isEmailFormat = recipients[0].includes('@');
  
  let emails = [];
  
  if (isEmailFormat) {
    // Recipients are already emails
    emails = recipients.filter(email => {
      // Simple email validation
      return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
    });
  } else {
    // Recipients are user IDs, fetch emails
    const users = await User.find({
      _id: { $in: recipients }
    }).select('email');
    
    emails = users.map(user => user.email);
  }

  if (emails.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No valid recipients found'
    });
  }

  // Send bulk emails
  const emailPromises = emails.map(email => {
    return sendEmail({
      to: email,
      subject: `OpenElevate: ${subject}`,
      html: `
        <h3>${subject}</h3>
        <p>${message}</p>
      `
    });
  });

  await Promise.all(emailPromises);

  logger.info(`Bulk email sent to ${emails.length} recipients by admin: ${req.user.email}`);

  res.status(200).json({
    success: true,
    message: `Emails sent successfully to ${emails.length} recipients`
  });
}));

export default router;