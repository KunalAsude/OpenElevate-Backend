import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a project title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    minlength: [10, 'Description must be at least 10 characters']
  },
  techStack: {
    type: [String],
    required: [true, 'Please add technologies used in the project']
  },
  difficulty: {
    type: String,
    required: [true, 'Please specify difficulty level'],
    enum: ['beginner', 'intermediate', 'advanced']
  },
  type: {
    type: String,
    required: [true, 'Please specify project type'],
    enum: ['frontend', 'backend', 'fullstack', 'mobile', 'other']
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'completed', 'archived'],
    default: 'open'
  },
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  githubLink: {
    type: String,
    required: [true, 'Please add a GitHub repository link'],
    match: [
      /^(https?:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?$/,
      'Please add a valid GitHub repository URL'
    ]
  },
  tags: {
    type: [String],
    default: []
  },
  thumbnailUrl: {
    type: String,
    default: ''
  },
  contributors: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],
  featuredIssues: [
    {
      title: String,
      description: String,
      link: String,
      difficulty: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced']
      }
    }
  ],
  viewCount: {
    type: Number,
    default: 0
  },
  starCount: {
    type: Number,
    default: 0
  },
  usersStarred: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create project slug from the title
ProjectSchema.pre('save', function(next) {
  this.slug = this.title
    .toLowerCase()
    .replace(/[^\w ]+/g, '')
    .replace(/ +/g, '-');
  next();
});

// Reverse populate with contributions
ProjectSchema.virtual('contributions', {
  ref: 'Contribution',
  localField: '_id',
  foreignField: 'projectId',
  justOne: false
});

// Get contributor count
ProjectSchema.virtual('contributorCount').get(function() {
  return this.contributors.length;
});

const Project = mongoose.model('Project', ProjectSchema);

export default Project;