# SkillMap Engine API

A comprehensive skill analysis and peer-learning platform that processes resumes, analyzes skill gaps, and provides personalized learning recommendations.

## 🏗️ Architecture

```
skillmap-engine/
├── index.js                 # Main API server
├── config.js               # Configuration (OpenAI, Qdrant)
├── skill_taxonomy.js       # Skill taxonomy definitions
├── package.json
├── services/               # Business logic
│   ├── resumeService.js    # Resume processing
│   ├── userProfileService.js # User profile management
│   ├── skillGapService.js  # Skill gap analysis
│   └── skillSearchService.js # Skill similarity search
├── utils/                  # Shared utilities
│   ├── pdfParser.js        # PDF parsing utilities
│   └── vectorStore.js      # Vector database utilities
├── scripts/                # Utility scripts
│   └── seedTaxonomy.js     # Seed skill taxonomy
└── data/                   # Generated data files
```

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   # Create .env file
   OPENAI_API_KEY=your_openai_api_key
   QDRANT_URL=your_qdrant_url
   QDRANT_API_KEY=your_qdrant_api_key
   PORT=3000
   ```

3. **Seed the skill taxonomy:**
   ```bash
   npm run seed-taxonomy
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

## 📋 API Endpoints

### Health Check
```http
GET /health
```
Returns API status and timestamp.

### Resume Processing
```http
POST /upload-resume
Content-Type: multipart/form-data

# Body: PDF file with key 'resume'
```
Processes uploaded resume and extracts structured profile data.

### User Profile Management
```http
POST /user-profile
Content-Type: application/json

{
  "name": "John Doe",
  "technical_skills": [...],
  "inferred_areas_of_strength": [...],
  "goal": "Become a full-stack developer",
  "experience": [...],
  "projects": [...]
}
```
Creates or updates user profile with vector embeddings.

### Skill Gap Analysis
```http
POST /analyze-skill-gaps
Content-Type: application/json

{
  "name": "John Doe"
}
```
Analyzes skill gaps based on user's goal and provides AI-generated recommendations.

### Skill Search
```http
POST /search-skills
Content-Type: application/json

{
  "query": "machine learning",
  "limit": 10
}
```
Searches for similar skills using semantic similarity.

## 🔧 Services Overview

### Resume Service (`services/resumeService.js`)
- Processes PDF resumes
- Extracts structured data using OpenAI
- Maps skills to taxonomy
- Saves structured profiles

### User Profile Service (`services/userProfileService.js`)
- Creates/updates user profiles
- Generates comprehensive profile embeddings
- Manages vector database operations
- Handles profile text formatting

### Skill Gap Service (`services/skillGapService.js`)
- Analyzes skill gaps based on user goals
- Matches goals to relevant skill categories
- Provides detailed gap analysis
- Generates AI-powered summaries and recommendations

### Skill Search Service (`services/skillSearchService.js`)
- Semantic skill similarity search
- Category-based skill filtering
- Vector similarity scoring

## 🛠️ Utilities

### PDF Parser (`utils/pdfParser.js`)
- Extracts text from PDF files
- Handles file validation
- Error handling for corrupted files

### Vector Store (`utils/vectorStore.js`)
- Qdrant collection management
- Index creation and management
- Collection utilities (create, delete, info)

## 📊 Data Flow

1. **Resume Upload** → PDF parsing → OpenAI structuring → Profile creation
2. **Profile Creation** → Text formatting → Embedding generation → Vector storage
3. **Skill Analysis** → Goal matching → Category analysis → Gap identification → AI summary
4. **Skill Search** → Query embedding → Vector similarity → Ranked results

## 🔒 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for embeddings and chat | Yes |
| `QDRANT_URL` | Qdrant vector database URL | Yes |
| `QDRANT_API_KEY` | Qdrant API key | Yes |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |

## 📝 Example Responses

### Skill Gap Analysis Response
```json
{
  "success": true,
  "user": "John Doe",
  "analysis": [
    {
      "detected_category": "Web Development",
      "matched_taxonomy_category": "Web Development", 
      "confidence": 0.85,
      "similarity": 1.0,
      "skills": {
        "gaps": [
          {
            "name": "Next.js",
            "description": "Building full-stack React apps...",
            "priority": "high"
          }
        ],
        "present": [...],
        "needs_improvement": [...]
      }
    }
  ],
  "summary": "Based on your goal to 'Become a full-stack developer'...",
  "categories_analyzed": 1,
  "user_goal": "Become a full-stack developer"
}
```

## 🚨 Error Handling

All endpoints return consistent error responses:
```json
{
  "error": "Error description",
  "details": "Detailed error message"
}
```

Common HTTP status codes:
- `400`: Bad Request (missing parameters)
- `404`: Not Found (user/resource not found)
- `500`: Internal Server Error

## 🧪 Development

- **Logs**: Detailed console logging for debugging
- **File Output**: Analysis results saved to files for inspection
- **Error Handling**: Comprehensive error catching and reporting
- **Validation**: Input validation on all endpoints

## 📈 Performance Considerations

- **Caching**: Consider implementing Redis for frequently accessed data
- **Batch Processing**: Resume processing handles large files efficiently
- **Vector Search**: Optimized similarity search with thresholds
- **Concurrent Processing**: Multiple skill analysis in parallel

## 🔄 Migration from Old Structure

The refactored codebase consolidates:
- `profiler.js` → `services/resumeService.js`
- `seed_user_profile.js` → `services/userProfileService.js`
- `find_gaps.js` → `services/skillGapService.js`
- `seed_taxonomy.js` → `scripts/seedTaxonomy.js`

All functionality is now accessible through the single `index.js` API server.
