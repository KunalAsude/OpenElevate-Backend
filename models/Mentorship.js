import mongoose from 'mongoose';

const MentorshipSchema = new mongoose.Schema({
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  menteeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'cancelled'],
    default: 'pending'
  },
  focusAreas: {
    type: [String],
    required: [true, 'Please specify focus areas for mentorship'],
    validate: [arrayLimit, 'Cannot specify more than 5 focus areas']
  },
  goals: {
    type: String,
    required: [true, 'Please specify goals for this mentorship'],
    maxlength: [500, 'Goals cannot be more than 500 characters']
  },
  duration: {
    type: Number, // Duration in weeks
    required: [true, 'Please specify mentorship duration'],
    min: [1, 'Duration must be at least 1 week'],
    max: [52, 'Duration cannot exceed 52 weeks (1 year)']
  },
  startDate: {
    type: Date,
    default: null // Set when status changes to active
  },
  endDate: {
    type: Date,
    default: null // Calculated based on startDate and duration
  },
  meetingFrequency: {
    type: String,
    enum: ['weekly', 'biweekly', 'monthly', 'as-needed'],
    default: 'biweekly'
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot be more than 1000 characters']
  },
  feedbacks: [
    {
      from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
      },
      comment: {
        type: String,
        maxlength: [500, 'Feedback comment cannot be more than 500 characters']
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ]
}, {
  timestamps: true
});

// Validate array length
function arrayLimit(val) {
  return val.length <= 5;
}

// Set end date when mentorship becomes active
MentorshipSchema.pre('save', function(next) {
  if (this.status === 'active' && !this.startDate) {
    this.startDate = new Date();
    
    // Calculate end date based on duration (in weeks)
    const endDate = new Date(this.startDate);
    endDate.setDate(endDate.getDate() + (this.duration * 7));
    this.endDate = endDate;
  }
  next();
});

// Check if mentorship should be marked as completed based on end date
MentorshipSchema.methods.checkCompletion = function() {
  if (this.status === 'active' && this.endDate && new Date() > this.endDate) {
    this.status = 'completed';
    return true;
  }
  return false;
};

const Mentorship = mongoose.model('Mentorship', MentorshipSchema);

export default Mentorship;