import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import crypto from 'crypto';
import config from './index.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';

// JWT Strategy Configuration
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.jwtSecret || 'default_jwt_secret_for_development_only'
};

// Log warning if using default secret
if (!config.jwtSecret) {
  logger.warn('Using default JWT secret. This is insecure and should only be used for development.');
}

// Configure JWT Strategy
passport.use(new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
  try {
    const user = await User.findById(jwtPayload.id).select('-password');
    
    if (!user) {
      return done(null, false, { message: 'User not found' });
    }
    
    // Check if token was issued before password change
    if (user.passwordChangedAt) {
      const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
      
      // If password was changed after token was issued
      if (jwtPayload.iat < changedTimestamp) {
        return done(null, false, { message: 'Please log in again' });
      }
    }
    
    return done(null, user);
  } catch (error) {
    logger.error(`JWT Strategy error: ${error.message}`);
    return done(error);
  }
}));

// Configure Google OAuth Strategy
// Use dummy credentials for testing if actual credentials aren't present
const googleClientID = config.oauth.google.clientID || 'dummy-google-client-id';
const googleClientSecret = config.oauth.google.clientSecret || 'dummy-google-client-secret';

passport.use(new GoogleStrategy({
  clientID: googleClientID,
  clientSecret: googleClientSecret,
  callbackURL: `${config.serverUrl}/api/v1/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user exists with this Google ID
    let user = await User.findOne({ 'oauth.google.id': profile.id });
    
    if (!user) {
      // Create new user if doesn't exist
      user = await User.create({
        name: profile.displayName,
        email: profile.emails[0].value,
        password: crypto.randomBytes(16).toString('hex'), // Random password
        oauth: {
          google: {
            id: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName
          }
        },
        emailVerified: true, // Google verified this email
        profileImage: profile.photos[0]?.value || null
      });
      
      logger.info(`New user registered via Google: ${user.email}`);
    } else {
      logger.info(`User logged in via Google: ${user.email}`);
    }
    
    return done(null, user);
  } catch (error) {
    logger.error(`Google auth error: ${error.message}`);
    return done(error);
  }
}));

// Configure GitHub OAuth Strategy
// Use dummy credentials for testing if actual credentials aren't present
const githubClientID = config.oauth.github.clientID || 'dummy-github-client-id';
const githubClientSecret = config.oauth.github.clientSecret || 'dummy-github-client-secret';

// Log the GitHub credential information (without the actual secret)
logger.info(`Using GitHub OAuth with Client ID: ${githubClientID === 'dummy-github-client-id' ? 'DUMMY ID' : 'PROVIDED'}`); 

passport.use(new GitHubStrategy({
  clientID: githubClientID,
  clientSecret: githubClientSecret,
  // Explicitly hardcode the callback URL to match what's set in GitHub settings
  callbackURL: `${config.serverUrl}/api/v1/auth/github/callback`, // Use server URL from config
  scope: ['user', 'repo', 'read:org', 'read:user', 'user:email'],
  // Add proper error handling
  passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
  // Log the request information for debugging
  logger.info(`GitHub OAuth callback processing with profile ID: ${profile.id}`);
  try {
    // GitHub might not provide email, handle that case
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.username}@github.com`;
    
    // First check if user exists with this GitHub ID
    let user = await User.findOne({ 'oauth.github.id': profile.id });
    
    // If no user found with GitHub ID, check if user exists with the same email
    if (!user) {
      user = await User.findOne({ email: email });
    }
    
    // Calculate token expiry (use GitHub's default token expiry or set your own)    
    const tokenExpiry = new Date();
    tokenExpiry.setDate(tokenExpiry.getDate() + 60); // Default to 60 days if not specified
    
    if (!user) {
      // Create new user if doesn't exist with either GitHub ID or email
      user = await User.create({
        name: profile.displayName || profile.username,
        email: email,
        password: crypto.randomBytes(16).toString('hex'), // Random password
        oauth: {
          github: {
            id: profile.id,
            username: profile.username,
            name: profile.displayName,
            accessToken: accessToken,
            refreshToken: refreshToken || null,
            tokenScope: 'user,repo,read:org,read:user,user:email',
            tokenExpiry: tokenExpiry
          }
        },
        emailVerified: true, // GitHub verified this
        avatarUrl: profile.photos[0]?.value || null,
        socialLinks: {
          github: `https://github.com/${profile.username}`
        }
      });
      
      // Update user's skills based on GitHub programming languages (can be done later with the service)
      logger.info(`New user registered via GitHub: ${user.email}`);
    } else if (user.oauth?.github?.id) {
      // Update existing user's GitHub OAuth data
      user.oauth.github = {
        ...user.oauth.github,
        accessToken: accessToken,
        refreshToken: refreshToken || null,
        tokenScope: 'user,repo,read:org,read:user,user:email',
        tokenExpiry: tokenExpiry
      };
      
      // Update profile information
      if (!user.avatarUrl && profile.photos && profile.photos[0]) {
        user.avatarUrl = profile.photos[0].value;
      }
      
      if (!user.socialLinks.github) {
        user.socialLinks.github = `https://github.com/${profile.username}`;
      }
      
      await user.save({ validateBeforeSave: false });
      logger.info(`User logged in via GitHub: ${user.email}`);
    } else {
      // This is an existing user found by email but doesn't have GitHub OAuth data yet
      // Link GitHub to this existing account
      if (!user.oauth) {
        user.oauth = {};
      }
      
      user.oauth.github = {
        id: profile.id,
        username: profile.username,
        name: profile.displayName,
        accessToken: accessToken,
        refreshToken: refreshToken || null,
        tokenScope: 'user,repo,read:org,read:user,user:email',
        tokenExpiry: tokenExpiry
      };
      
      // Update profile information if needed
      if (!user.avatarUrl && profile.photos && profile.photos[0]) {
        user.avatarUrl = profile.photos[0].value;
      }
      
      if (!user.socialLinks) {
        user.socialLinks = {};
      }
      
      if (!user.socialLinks.github) {
        user.socialLinks.github = `https://github.com/${profile.username}`;
      }
      
      await user.save({ validateBeforeSave: false });
      logger.info(`Existing user linked with GitHub: ${user.email}`);
    }
    
    return done(null, user);
  } catch (error) {
    logger.error(`GitHub auth error: ${error.message}`);
    return done(error);
  }
}));

// Serialize and deserialize user instances to and from the session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export default passport;