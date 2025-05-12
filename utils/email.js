import nodemailer from 'nodemailer';
import config from '../config/index.js';
import { logger } from './logger.js';

/**
 * Send an email using nodemailer
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text email content
 * @param {string} [options.html] - HTML email content (optional)
 * @returns {Promise} - Nodemailer send mail promise
 */
export const sendEmail = async (options) => {
  try {
    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465, // true for 465, false for other ports
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });
    
    // Email options
    const mailOptions = {
      from: `OpenElevate <${config.email.from}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
    };
    
    // Add HTML content if provided
    if (options.html) {
      mailOptions.html = options.html;
    }
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    
    return info;
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    throw error;
  }
};

/**
 * Send a welcome email to a new user
 * @param {Object} user - User object
 * @returns {Promise} - Nodemailer send mail promise
 */
export const sendWelcomeEmail = async (user) => {
  const text = `
    Welcome to OpenElevate, ${user.name}!
    
    Thank you for joining our platform. We're excited to have you as part of our community.
    
    OpenElevate connects developers with open-source projects to help you grow your skills
    and make meaningful contributions.
    
    Get started by:
    1. Completing your profile
    2. Exploring projects that match your skills
    3. Connecting with mentors who can guide your journey
    
    If you have any questions, please don't hesitate to contact us.
    
    Happy coding!
    The OpenElevate Team
  `;
  
  return sendEmail({
    to: user.email,
    subject: 'Welcome to OpenElevate',
    text,
  });
};

/**
 * Send a notification email about contribution status change
 * @param {Object} user - User object
 * @param {Object} contribution - Contribution object
 * @returns {Promise} - Nodemailer send mail promise
 */
export const sendContributionStatusEmail = async (user, contribution) => {
  const statusMessages = {
    merged: 'Great news! Your contribution has been merged.',
    approved: 'Congratulations! Your contribution has been approved.',
    closed: 'Your contribution has been closed.',
  };
  
  const text = `
    Hello ${user.name},
    
    ${statusMessages[contribution.status] || 'There has been an update to your contribution.'}
    
    Contribution: ${contribution.title}
    Project: ${contribution.projectId.name || 'Project'}
    Link: ${contribution.link}
    
    Keep up the great work!
    
    The OpenElevate Team
  `;
  
  return sendEmail({
    to: user.email,
    subject: `Contribution Update: ${contribution.title}`,
    text,
  });
};

export default {
  sendEmail,
  sendWelcomeEmail,
  sendContributionStatusEmail,
};
