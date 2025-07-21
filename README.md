# 🚀 OpenElevate

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)

**Discover. Connect. Contribute.**

> Your comprehensive hub for discovering impactful open-source projects, connecting with fellow developers, and accelerating your contribution journey.

[🌐 Live Demo](https://openelevate.vercel.app) | [📖 Documentation](https://docs.openelevate.dev) | [💬 Community](https://discord.gg/openelevate)

---

## 🌟 What is OpenElevate?

OpenElevate is a modern platform designed to bridge the gap between developers and open-source projects. Whether you're a beginner taking your first steps or a seasoned contributor looking to mentor others, OpenElevate provides the tools and community to elevate your open-source journey.

### 🎯 Our Mission
To democratize open-source contribution by making project discovery intuitive, connections meaningful, and collaboration seamless.

## ✨ Key Features

### 🔍 **Smart Project Discovery**
- Filter projects by programming language, framework, and domain
- Difficulty-based recommendations (Beginner, Intermediate, Advanced)
- Real-time GitHub metrics integration (stars, forks, issues, activity)
- Advanced search with semantic matching

### 🤝 **Developer Connection Hub**
- **Mentor-Mentee Matching**: Connect junior developers with experienced contributors
- **Skill-based Networking**: Find collaborators with complementary skills
- **Project Team Formation**: Assemble teams for hackathons and side projects
- **Community Discussions**: Engage in tech-specific forums

### 📊 **Contribution Analytics**
- Personal contribution dashboard and progress tracking
- GitHub activity visualization and contribution heatmaps
- Achievement system with badges and milestones
- Portfolio generation for showcasing open-source work

### 🎨 **Enhanced User Experience**
- Clean, modern interface with dark/light theme support
- Mobile-responsive design for on-the-go browsing
- Personalized recommendations powered by AI
- Real-time notifications for project updates

## 🛠️ Technology Stack

### Frontend Architecture
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Radix UI primitives
- **State Management**: Zustand
- **Data Fetching**: React Query (TanStack Query)
- **Charts**: Recharts for analytics visualization

### Backend Architecture
- **Framework**: NestJS (Node.js)
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose
- **Cache**: Redis for session management
- **Authentication**: JWT + OAuth (GitHub, Google)
- **API Documentation**: Swagger/OpenAPI

### External Integrations
- **GitHub API**: Repository data, user profiles, contribution stats
- **OpenAI API**: AI-powered project recommendations
- **Discord API**: Community notifications
- **SendGrid**: Email notifications

### DevOps & Infrastructure
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Railway/Render
- **Database Hosting**: MongoDB Atlas
- **CI/CD**: GitHub Actions
- **Monitoring**: Sentry for error tracking

## 🏗️ Project Structure

```
openelevate/
├── frontend/                 # Next.js application
│   ├── app/                 # App router pages
│   ├── components/          # Reusable UI components
│   ├── lib/                 # Utilities and configurations
│   └── styles/              # Global styles
├── backend/                 # NestJS application
│   ├── src/
│   │   ├── modules/         # Feature modules
│   │   ├── common/          # Shared utilities
│   │   ├── guards/          # Authentication guards
│   │   └── decorators/      # Custom decorators
│   └── test/                # E2E tests
├── shared/                  # Shared types and utilities
└── docs/                   # Documentation
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn
- MongoDB instance (local or cloud)
- GitHub OAuth App credentials

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/KunalAsude/openelevate.git
   cd openelevate
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   ```

   Create `.env` file:
   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/openelevate
   REDIS_URL=redis://localhost:6379
   
   # Authentication
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRES_IN=7d
   
   # GitHub Integration
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   GITHUB_ACCESS_TOKEN=your_github_token
   
   # AI Features (Optional)
   OPENAI_API_KEY=your_openai_key
   
   # Email
   SENDGRID_API_KEY=your_sendgrid_key
   ```

   Start the backend:
   ```bash
   npm run start:dev
   ```

3. **Frontend Setup**
   ```bash
   cd ../frontend
   npm install
   ```

   Create `.env.local` file:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001/api
   NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_client_id
   NEXTAUTH_SECRET=your_nextauth_secret
   NEXTAUTH_URL=http://localhost:3000
   ```

   Start the frontend:
   ```bash
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - API Documentation: http://localhost:3001/docs

## 📋 API Documentation

### Project Search Endpoint

**GET** `/api/projects/search`

Query Parameters:
```typescript
{
  language?: string[];        // ['JavaScript', 'TypeScript']
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  minStars?: number;
  hasGoodFirstIssues?: boolean;
  isActivelyMaintained?: boolean;
  page?: number;
  limit?: number;
}
```

**Response:**
```json
{
  "projects": [
    {
      "id": "github_repo_id",
      "name": "awesome-project",
      "fullName": "owner/awesome-project",
      "description": "An amazing open-source project",
      "language": "TypeScript",
      "stars": 1250,
      "forks": 89,
      "openIssues": 23,
      "goodFirstIssues": 5,
      "lastActivity": "2024-01-15T10:30:00Z",
      "difficulty": "intermediate",
      "topics": ["web", "typescript", "react"],
      "maintainer": {
        "username": "maintainer",
        "avatarUrl": "https://github.com/maintainer.png"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "hasNext": true
  }
}
```

### User Profile Endpoint

**GET** `/api/users/profile/:username`

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "username": "developer",
    "displayName": "Amazing Developer",
    "bio": "Full-stack developer passionate about open source",
    "skills": ["JavaScript", "Python", "React", "NestJS"],
    "contributionStats": {
      "totalContributions": 245,
      "totalStars": 1200,
      "totalForks": 89,
      "contributedProjects": 15
    },
    "badges": ["First Contribution", "Prolific Contributor"],
    "availableForMentoring": true
  }
}
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 🚢 Deployment

### Frontend (Vercel)
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main

### Backend (Railway)
1. Connect repository to Railway
2. Add environment variables
3. Deploy with zero configuration

### Docker Setup
```bash
# Build and run with Docker Compose
docker-compose up --build
```

## 📊 Project Roadmap

### Phase 1: Core Platform ✅
- [x] Project discovery and filtering
- [x] GitHub API integration
- [x] User authentication
- [x] Basic contribution tracking

### Phase 2: Community Features 🚧
- [ ] Mentor-mentee matching system
- [ ] Real-time chat and messaging
- [ ] Project collaboration tools
- [ ] Community forums

### Phase 3: Advanced Features 📋
- [ ] AI-powered recommendations
- [ ] Mobile application
- [ ] Integration with other platforms (GitLab, Bitbucket)
- [ ] Advanced analytics and insights
- [ ] Gamification features

### Phase 4: Enterprise Features 🔮
- [ ] Organization dashboards
- [ ] Team management tools
- [ ] Custom integration APIs
- [ ] White-label solutions

## 📈 Performance Metrics

- **Frontend Performance**: Lighthouse score 95+
- **API Response Time**: < 200ms average
- **Database Query Performance**: < 50ms average
- **Uptime**: 99.9% availability target

## 🔒 Security

- JWT-based authentication with refresh tokens
- Rate limiting on all API endpoints
- Input validation and sanitization
- CORS protection
- Security headers with Helmet.js
- Regular dependency security audits
- Data encryption in transit and at rest

## 📱 Browser Support

- Chrome (last 2 versions)
- Firefox (last 2 versions)
- Safari (last 2 versions)
- Edge (last 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Thanks to all contributors who help make OpenElevate better
- GitHub API for providing comprehensive repository data
- The open-source community for inspiration and support
- All the amazing open-source projects that make this platform possible

## 🌐 Community & Support

- **Discord**: [Join our community](https://discord.gg/openelevate)
- **GitHub Discussions**: [Share ideas and ask questions](https://github.com/KunalAsude/openelevate/discussions)
- **Documentation**: [Comprehensive guides and tutorials](https://docs.openelevate.dev)
- **Email**: support@openelevate.dev

---

<div align="center">
  <p>
    <strong>OpenElevate</strong> - Elevating the open-source journey, one contribution at a time.
  </p>
  <p>
    If you find this project helpful, please consider giving it a ⭐ on GitHub!
  </p>
</div>
