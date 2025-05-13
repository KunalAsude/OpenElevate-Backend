import mongoose from 'mongoose';
import User from '../models/User.js';
import { sendEmail } from '../utils/email.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

/**
 * @desc    Send contact form email
 * @route   POST /emails/contact
 * @access  Public
 */
export const sendContactEmail = asyncHandler(async (req, res) => {
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
});

/**
 * @desc    Subscribe to newsletter
 * @route   POST /emails/newsletter/subscribe
 * @access  Public
 */
export const subscribeToNewsletter = asyncHandler(async (req, res) => {
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
      throw new ApiError(400, 'Email already subscribed to the newsletter');
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
});

/**
 * @desc    Unsubscribe from newsletter
 * @route   POST /emails/newsletter/unsubscribe
 * @access  Public
 */
export const unsubscribeFromNewsletter = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Get Newsletter model
  let Newsletter;
  try {
    Newsletter = mongoose.model('Newsletter');
  } catch (e) {
    throw new ApiError(400, 'You are not subscribed to the newsletter');
  }

  // Check if subscribed
  const subscription = await Newsletter.findOne({ email });
  if (!subscription || !subscription.subscribed) {
    throw new ApiError(400, 'Email not subscribed to the newsletter');
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
});

/**
 * @desc    Send notification email to a user
 * @route   POST /emails/notification
 * @access  Admin
 */
export const sendNotificationEmail = asyncHandler(async (req, res) => {
  const { userId, subject, message } = req.body;

  // Find user
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
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
});

/**
 * @desc    Send bulk emails to multiple users
 * @route   POST /emails/bulk
 * @access  Admin
 */
export const sendBulkEmails = asyncHandler(async (req, res) => {
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
    throw new ApiError(400, 'No valid recipients found');
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
});