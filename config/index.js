import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  serverUrl: process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`,
  mongoURI: process.env.NODE_ENV === 'production' 
    ? process.env.MONGODB_URI_PRODUCTION 
    : (process.env.MONGODB_URI || 'mongodb://localhost:27017/openelevate'),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d',
  email: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM
  },
  ai: {
    togetherAiKey: process.env.TOGETHER_AI_API_KEY,
    openrouterKey: process.env.OPENROUTER_API_KEY
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
  },
  redis: {
    url: process.env.REDIS_URL
  },
  oauth: {
    google: {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    },
    github: {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET
    }
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
};

export default config;