import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config/index.js';

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['developer', 'client', 'mentor', 'admin'],
    default: 'developer'
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot be more than 500 characters']
  },
  skills: {
    type: [String],
    default: []
  },
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  badges: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Badge'
    }
  ],
  contributions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contribution'
    }
  ],
  isMentor: {
    type: Boolean,
    default: false
  },
  isClient: {
    type: Boolean,
    default: false
  },
  socialLinks: {
    github: String,
    linkedin: String,
    twitter: String,
    website: String
  },
  avatarUrl: {
    type: String,
    default: ''
  },
  profileCompleteness: {
    type: Number,
    default: 0
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  oauth: {
    google: {
      id: String,
      email: String,
      name: String
    },
    github: {
      id: String,
      username: String,
      name: String
    }
  },
  emailVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function() {
  return jwt.sign({ id: this._id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
};

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password token
UserSchema.methods.getResetPasswordToken = function() {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Calculate profile completeness
UserSchema.methods.calculateProfileCompleteness = function() {
  let completeness = 0;
  const totalFields = 7; // Total fields to check for completeness

  // Check name
  if (this.name) completeness += 1;
  
  // Check bio
  if (this.bio && this.bio.length > 10) completeness += 1;
  
  // Check skills
  if (this.skills && this.skills.length > 0) completeness += 1;
  
  // Check avatar
  if (this.avatarUrl) completeness += 1;
  
  // Check social links
  let socialLinksCount = 0;
  if (this.socialLinks.github) socialLinksCount += 1;
  if (this.socialLinks.linkedin) socialLinksCount += 1;
  if (this.socialLinks.twitter) socialLinksCount += 1;
  if (this.socialLinks.website) socialLinksCount += 1;
  
  if (socialLinksCount > 0) completeness += 1;
  if (socialLinksCount >= 2) completeness += 1;
  if (socialLinksCount >= 3) completeness += 1;

  return Math.floor((completeness / totalFields) * 100);
};

// Update profile completeness before saving
UserSchema.pre('save', function(next) {
  this.profileCompleteness = this.calculateProfileCompleteness();
  next();
});

// Reverse populate with contributions
UserSchema.virtual('contributionsCount', {
  ref: 'Contribution',
  localField: '_id',
  foreignField: 'userId',
  count: true
});

const User = mongoose.model('User', UserSchema);

export default User;