import mongoose from 'mongoose';

const BadgeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a badge title'],
    trim: true,
    unique: true,
    maxlength: [50, 'Title cannot be more than 50 characters']
  },
  description: {
    type: String,
    required: [true, 'Please add badge description'],
    maxlength: [200, 'Description cannot be more than 200 characters']
  },
  iconUrl: {
    type: String,
    required: [true, 'Please add an icon URL for this badge']
  },
  conditions: {
    type: {
      type: String,
      enum: ['contribution_count', 'project_count', 'time_active', 'skill_level', 'special'],
      required: [true, 'Please specify badge condition type']
    },
    count: {
      type: Number,
      default: 1
    },
    skill: {
      type: String,
      default: null
    },
    specialCondition: {
      type: String,
      default: null
    }
  },
  rarity: {
    type: String,
    enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  pointsAwarded: {
    type: Number,
    default: 10
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Predefined badge types and automatic creator
BadgeSchema.statics.createDefaultBadges = async function() {
  const defaultBadges = [
    {
      title: 'First Contribution',
      description: 'Made your first contribution to an open-source project',
      iconUrl: '/badges/first-contribution.svg',
      conditions: {
        type: 'contribution_count',
        count: 1
      },
      rarity: 'common',
      pointsAwarded: 10
    },
    {
      title: 'Code Warrior',
      description: 'Made 10 contributions to open-source projects',
      iconUrl: '/badges/code-warrior.svg',
      conditions: {
        type: 'contribution_count',
        count: 10
      },
      rarity: 'uncommon',
      pointsAwarded: 50
    },
    {
      title: 'Open Source Hero',
      description: 'Made 50 contributions to open-source projects',
      iconUrl: '/badges/os-hero.svg',
      conditions: {
        type: 'contribution_count',
        count: 50
      },
      rarity: 'rare',
      pointsAwarded: 200
    },
    {
      title: 'Project Starter',
      description: 'Created your first open-source project',
      iconUrl: '/badges/project-starter.svg',
      conditions: {
        type: 'project_count',
        count: 1
      },
      rarity: 'uncommon',
      pointsAwarded: 100
    },
    {
      title: 'Mentor',
      description: 'Became a mentor to help others grow',
      iconUrl: '/badges/mentor.svg',
      conditions: {
        type: 'special',
        specialCondition: 'become_mentor'
      },
      rarity: 'rare',
      pointsAwarded: 150
    }
  ];
  
  try {
    for (const badge of defaultBadges) {
      await this.findOneAndUpdate(
        { title: badge.title },
        badge,
        { upsert: true, new: true }
      );
    }
    console.log('Default badges created');
  } catch (err) {
    console.error('Error creating default badges:', err);
  }
};

const Badge = mongoose.model('Badge', BadgeSchema);

export default Badge;