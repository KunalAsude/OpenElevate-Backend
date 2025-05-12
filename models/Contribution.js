import mongoose from 'mongoose';

const ContributionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  type: {
    type: String,
    enum: ['PR', 'issue', 'review', 'documentation', 'other'],
    required: [true, 'Please specify contribution type']
  },
  title: {
    type: String,
    required: [true, 'Please add a title for this contribution'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  link: {
    type: String,
    required: [true, 'Please add a link to the contribution (PR, issue, etc.)'],
    match: [
      /^(https?:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/(pull|issues)\/\d+\/?$/,
      'Please add a valid GitHub PR or issue URL'
    ]
  },
  status: {
    type: String,
    enum: ['open', 'merged', 'closed', 'approved'],
    default: 'open'
  },
  points: {
    type: Number,
    default: 0
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  verifiedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Update user's points after saving contribution
ContributionSchema.post('save', async function() {
  try {
    // Calculate points based on contribution type and status
    let points = 0;
    
    // Base points for different contribution types
    switch (this.type) {
      case 'PR':
        points = 10;
        break;
      case 'issue':
        points = 3;
        break;
      case 'review':
        points = 5;
        break;
      case 'documentation':
        points = 7;
        break;
      case 'other':
        points = 2;
        break;
    }
    
    // Bonus points for merged/approved contributions
    if (this.status === 'merged' || this.status === 'approved') {
      points *= 2;
    }
    
    // Update the contribution's points
    this.points = points;
    await this.save();
    
    // Update User model to reflect the contribution (this would be handled in a service/controller)
  } catch (err) {
    console.error('Error updating points:', err);
  }
});

const Contribution = mongoose.model('Contribution', ContributionSchema);

export default Contribution;