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
  secretOrKey: config.jwtSecret
};

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

passport.use(new GitHubStrategy({
  clientID: githubClientID,
  clientSecret: githubClientSecret,
  callbackURL: `${config.serverUrl}/api/v1/auth/github/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // GitHub might not provide email, handle that case
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.username}@github.com`;
    
    // Check if user exists with this GitHub ID
    let user = await User.findOne({ 'oauth.github.id': profile.id });
    
    if (!user) {
      // Create new user if doesn't exist
      user = await User.create({
        name: profile.displayName || profile.username,
        email: email,
        password: crypto.randomBytes(16).toString('hex'), // Random password
        oauth: {
          github: {
            id: profile.id,
            username: profile.username,
            name: profile.displayName
          }
        },
        emailVerified: true, // GitHub verified this
        profileImage: profile.photos[0]?.value || null
      });
      
      logger.info(`New user registered via GitHub: ${user.email}`);
    } else {
      logger.info(`User logged in via GitHub: ${user.email}`);
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