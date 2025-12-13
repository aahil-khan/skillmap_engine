# SkillMap API Documentation

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Endpoints](#endpoints)
  - [Resume Upload](#resume-upload)
  - [User Profile](#user-profile)
  - [Skill Analysis](#skill-analysis)
  - [LeetCode Integration](#leetcode-integration)
  - [ATS Scoring](#ats-scoring)

---

## Overview

Base URL: `http://localhost:5005` (Development)

All API responses follow a consistent format:
```json
{
  "success": true,
  "data": { ... },
  "requestId": "uuid-v4"
}
```

---

## Authentication

Most endpoints require JWT authentication via Supabase.

### Headers Required
```
Authorization: Bearer <jwt_token>
```

### Unauthenticated Endpoints
The following endpoints do NOT require authentication:
- `GET /api/leetcode/:username/*` (All public LeetCode endpoints)

### Getting a Token
Tokens are obtained through Supabase authentication on the frontend.

---

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "details": [], // Optional: validation errors
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "uuid-v4"
  }
}
```

### Error Codes

| HTTP Status | Error Code | Description |
|------------|------------|-------------|
| 400 | VALIDATION_ERROR | Invalid input data |
| 401 | AUTHENTICATION_ERROR | Missing or invalid authentication |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Resource conflict |
| 429 | RATE_LIMIT_ERROR | Too many requests |
| 500 | INTERNAL_ERROR | Server error |
| 502 | EXTERNAL_SERVICE_ERROR | External API failure |
| 503 | DATABASE_ERROR | Database connection issue |

### Validation Error Format

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "field": "name",
        "message": "Name must be at least 2 characters"
      },
      {
        "field": "technical_skills",
        "message": "At least one skill category is required"
      }
    ],
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "abc-123"
  }
}
```

---

## Rate Limiting

- **Window**: 15 minutes
- **Limit**: 50 requests per IP
- **Response on limit**: HTTP 429

Rate limit headers:
```
RateLimit-Limit: 50
RateLimit-Remaining: 45
RateLimit-Reset: 1705318200
```

---

## Endpoints

### Resume Upload

#### `POST /upload-resume`

Upload and parse a resume PDF.

**Authentication**: Required

**Request**:
- Content-Type: `multipart/form-data`
- Body:
  ```
  resume: <PDF file>
  ```

**Success Response** (200):
```json
{
  "success": true,
  "message": "Resume uploaded and processed successfully",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "technical_skills": [
      {
        "category": "Programming Languages",
        "skills": ["JavaScript", "Python", "Java"]
      }
    ],
    "experience": [
      {
        "company": "Tech Corp",
        "role": "Software Engineer",
        "duration": "2020-2023",
        "description": "...",
        "technologies": ["React", "Node.js"]
      }
    ],
    "projects": [...],
    "raw_text": "Full resume text..."
  }
}
```

**Error Responses**:

- **400 - No file uploaded**:
```json
{
  "success": false,
  "error": {
    "message": "No resume file uploaded",
    "code": "VALIDATION_ERROR",
    "statusCode": 400
  }
}
```

- **400 - Invalid file type**:
```json
{
  "success": false,
  "error": {
    "message": "Only PDF files are allowed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400
  }
}
```

- **500 - Parse error**:
```json
{
  "success": false,
  "error": {
    "message": "Failed to parse resume",
    "code": "INTERNAL_ERROR",
    "statusCode": 500
  }
}
```

---

### User Profile

#### `POST /user-profile`

Create or update user profile.

**Authentication**: Required

**Request Body**:
```json
{
  "name": "John Doe",
  "technical_skills": [
    {
      "category": "Programming Languages",
      "skills": ["JavaScript", "Python"]
    }
  ],
  "inferred_areas_of_strength": ["Full Stack Development"],
  "goal": "Become a senior full-stack engineer",
  "experience": [
    {
      "company": "Tech Corp",
      "role": "Software Engineer",
      "duration": "2020-2023",
      "description": "Built web applications",
      "technologies": ["React", "Node.js"]
    }
  ],
  "projects": [
    {
      "name": "E-commerce Platform",
      "description": "Built a full-stack e-commerce site",
      "technologies": ["React", "Express", "PostgreSQL"],
      "link": "https://github.com/user/project"
    }
  ]
}
```

**Validation Rules**:
- `name`: Required, 2-100 characters
- `technical_skills`: Optional array, each category must have at least 1 skill
- `goal`: Optional, 10-500 characters
- `experience`: Optional array
- `projects`: Optional array, links must be valid URLs

**Success Response** (200):
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user_id": "uuid",
    "name": "John Doe",
    "technical_skills": [...],
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Responses**:

- **400 - Validation error**:
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "field": "name",
        "message": "Name must be at least 2 characters"
      }
    ]
  }
}
```

- **503 - Database error**:
```json
{
  "success": false,
  "error": {
    "message": "Failed to save user profile",
    "code": "DATABASE_ERROR",
    "statusCode": 503
  }
}
```

---

### Skill Analysis

#### `GET /analyze-skill-gaps`

Analyze skill gaps based on user's profile and goal.

**Authentication**: Required

**Request**: No body required (uses authenticated user ID)

**Success Response** (200):
```json
{
  "success": true,
  "data": {
    "current_skills": ["JavaScript", "React", "Node.js"],
    "target_skills": ["TypeScript", "GraphQL", "Docker", "Kubernetes"],
    "skill_gaps": [
      {
        "skill": "TypeScript",
        "importance": "High",
        "learning_resources": [...]
      },
      {
        "skill": "GraphQL",
        "importance": "Medium",
        "learning_resources": [...]
      }
    ],
    "recommendations": "Focus on TypeScript first as it builds on your JavaScript knowledge...",
    "estimated_learning_time": "3-6 months"
  }
}
```

**Error Responses**:

- **404 - Profile not found**:
```json
{
  "success": false,
  "error": {
    "message": "User profile not found",
    "code": "NOT_FOUND",
    "statusCode": 404
  }
}
```

- **502 - OpenAI error**:
```json
{
  "success": false,
  "error": {
    "message": "Failed to analyze skill gaps",
    "code": "EXTERNAL_SERVICE_ERROR",
    "statusCode": 502
  }
}
```

---

#### `POST /search-skills`

Search for similar skills in taxonomy.

**Authentication**: Required

**Request Body**:
```json
{
  "query": "machine learning",
  "limit": 10
}
```

**Validation Rules**:
- `query`: Required, 2-200 characters
- `limit`: Optional integer, 1-50, default 10

**Success Response** (200):
```json
{
  "success": true,
  "query": "machine learning",
  "results": [
    {
      "skill": "Machine Learning",
      "category": "AI/ML",
      "similarity": 0.98,
      "related_skills": ["Deep Learning", "Neural Networks"]
    },
    {
      "skill": "Supervised Learning",
      "category": "AI/ML",
      "similarity": 0.85
    }
  ]
}
```

**Error Responses**:

- **400 - Missing query**:
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "field": "query",
        "message": "Search query must be at least 2 characters"
      }
    ]
  }
}
```

---

#### `POST /convert-to-standalone`

Convert a goal into a standalone question.

**Authentication**: Required

**Request Body**:
```json
{
  "goal": "I want to become a machine learning engineer at a FAANG company"
}
```

**Validation Rules**:
- `goal`: Required, 5-500 characters

**Success Response** (200):
```json
{
  "success": true,
  "goalResponse": "What are the essential skills and experience needed to become a machine learning engineer at a FAANG company, and what is a structured learning path to achieve this goal?"
}
```

**Error Responses**:

- **400 - Missing goal**:
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "field": "goal",
        "message": "Goal must be at least 5 characters"
      }
    ]
  }
}
```

---

### LeetCode Integration

All LeetCode endpoints accept a `username` parameter and return data from LeetCode's public API.

#### `GET /api/leetcode/:username/profile`

Get LeetCode user profile.

**Authentication**: Not required

**URL Parameters**:
- `username`: LeetCode username (alphanumeric, underscore, hyphen only)

**Success Response** (200):
```json
{
  "username": "user123",
  "ranking": 12345,
  "reputation": 890,
  "profile": {
    "realName": "John Doe",
    "about": "Software engineer...",
    "countryName": "United States",
    "websites": ["https://example.com"]
  }
}
```

**Error Responses**:

- **400 - Invalid username format**:
```json
{
  "success": false,
  "error": {
    "message": "Parameter validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "field": "username",
        "message": "Username can only contain letters, numbers, underscores, and hyphens"
      }
    ]
  }
}
```

- **404 - User not found**:
```json
{
  "success": false,
  "error": {
    "message": "LeetCode user not found",
    "code": "NOT_FOUND",
    "statusCode": 404
  }
}
```

- **502 - LeetCode API error**:
```json
{
  "success": false,
  "error": {
    "message": "Failed to fetch LeetCode data",
    "code": "EXTERNAL_SERVICE_ERROR",
    "statusCode": 502
  }
}
```

---

#### `GET /api/leetcode/:username`

Get LeetCode statistics.

**Authentication**: Not required

**URL Parameters**:
- `username`: LeetCode username

**Success Response** (200):
```json
{
  "username": "user123",
  "totalSolved": 450,
  "easySolved": 200,
  "mediumSolved": 180,
  "hardSolved": 70,
  "acceptanceRate": 45.5,
  "ranking": 12345,
  "contributionPoints": 890
}
```

---

#### `GET /api/leetcode/:username/submission`

Get recent submissions.

**Authentication**: Not required

**URL Parameters**:
- `username`: LeetCode username

**Query Parameters**:
- `limit`: Number of submissions (1-100, default: 5)

**Example**: `GET /api/leetcode/user123/submission?limit=10`

**Success Response** (200):
```json
{
  "submissions": [
    {
      "title": "Two Sum",
      "timestamp": "2024-01-15T10:30:00Z",
      "statusDisplay": "Accepted",
      "lang": "Python",
      "runtime": "45 ms",
      "memory": "14.2 MB"
    }
  ]
}
```

---

#### `GET /api/leetcode/:username/languages`

Get language statistics.

**Authentication**: Not required

**Success Response** (200):
```json
{
  "languages": [
    {
      "language": "Python",
      "problemsSolved": 250
    },
    {
      "language": "JavaScript",
      "problemsSolved": 150
    }
  ]
}
```

---

#### `GET /api/leetcode/:username/topics`

Get topic-wise statistics.

**Authentication**: Not required

**Success Response** (200):
```json
{
  "topics": [
    {
      "topic": "Array",
      "problemsSolved": 120
    },
    {
      "topic": "Dynamic Programming",
      "problemsSolved": 45
    }
  ]
}
```

---

#### `GET /api/leetcode/:username/activity`

Get activity heatmap data.

**Authentication**: Not required

**Success Response** (200):
```json
{
  "heatmap": [
    {
      "date": "2024-01-15",
      "submissions": 5
    }
  ],
  "streak": 15,
  "totalActiveDays": 120,
  "dailyAverage": 2.3
}
```

---

#### `GET /api/leetcode/:username/suggestions`

Get personalized problem suggestions.

**Authentication**: Not required

**Success Response** (200):
```json
{
  "suggestions": [
    {
      "title": "Longest Substring Without Repeating Characters",
      "difficulty": "Medium",
      "topics": ["Hash Table", "String", "Sliding Window"],
      "acceptance": 33.5,
      "link": "https://leetcode.com/problems/...",
      "reason": "Strengthens your hash table skills"
    }
  ]
}
```

---

#### `POST /leetcode-stats`

Store LeetCode stats for authenticated user.

**Authentication**: Required

**Request Body**:
```json
{
  "username": "user123"
}
```

**Validation Rules**:
- `username`: Required, 1-50 characters, alphanumeric/underscore/hyphen only

**Success Response** (200):
```json
{
  "success": true,
  "message": "LeetCode stats saved successfully",
  "data": {
    "user_id": "uuid",
    "username": "user123",
    "totalSolved": 450,
    "easySolved": 200,
    "mediumSolved": 180,
    "hardSolved": 70,
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### ATS Scoring

#### `POST /ats-score`

Calculate ATS score for resume against job description.

**Authentication**: Required

**Request Body**:
```json
{
  "resume_text": "Full resume text...",
  "job_description": "Job description text..."
}
```

**Success Response** (200):
```json
{
  "success": true,
  "data": {
    "score": 85,
    "keyword_matches": [
      {
        "keyword": "JavaScript",
        "found": true,
        "frequency": 5
      },
      {
        "keyword": "React",
        "found": true,
        "frequency": 3
      }
    ],
    "missing_keywords": ["TypeScript", "GraphQL"],
    "suggestions": "Add TypeScript and GraphQL to your resume...",
    "category_scores": {
      "technical_skills": 90,
      "experience": 85,
      "education": 75
    }
  }
}
```

**Error Responses**:

- **400 - Missing data**:
```json
{
  "success": false,
  "error": {
    "message": "Resume text and job description are required",
    "code": "VALIDATION_ERROR",
    "statusCode": 400
  }
}
```

---

## Request Tracking

Every request includes a unique `requestId` in the response for debugging:

```json
{
  "success": true,
  "data": {...},
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Use this ID when reporting issues or checking logs.

---

## Best Practices

1. **Always handle errors**: Check the `success` field in responses
2. **Use request IDs**: Include them when reporting bugs
3. **Respect rate limits**: Implement exponential backoff
4. **Cache responses**: Especially for LeetCode public data
5. **Validate inputs**: Frontend validation prevents unnecessary API calls
6. **Monitor status codes**: Different codes require different handling

---

## Examples

### Successful Request Flow

```javascript
// 1. Upload resume
const formData = new FormData();
formData.append('resume', pdfFile);

const uploadResponse = await fetch('http://localhost:5005/upload-resume', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const uploadData = await uploadResponse.json();
if (!uploadData.success) {
  console.error('Upload failed:', uploadData.error);
  return;
}

// 2. Create/update profile
const profileResponse = await fetch('http://localhost:5005/user-profile', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: uploadData.data.name,
    technical_skills: uploadData.data.technical_skills,
    goal: "Become a senior engineer"
  })
});

const profileData = await profileResponse.json();

// 3. Analyze skill gaps
const gapsResponse = await fetch('http://localhost:5005/analyze-skill-gaps', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const gapsData = await gapsResponse.json();
console.log('Skill gaps:', gapsData.data);
```

### Error Handling

```javascript
async function apiRequest(url, options) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!data.success) {
      // Handle API error
      if (data.error.code === 'VALIDATION_ERROR') {
        // Show validation errors to user
        data.error.details.forEach(err => {
          console.error(`${err.field}: ${err.message}`);
        });
      } else if (data.error.code === 'RATE_LIMIT_ERROR') {
        // Implement exponential backoff
        await delay(60000); // Wait 1 minute
        return apiRequest(url, options); // Retry
      } else {
        // Generic error handling
        console.error('API Error:', data.error.message);
      }
      return null;
    }
    
    return data.data;
  } catch (error) {
    // Network error
    console.error('Network error:', error);
    return null;
  }
}
```

---

## Support

For issues or questions:
- Check error codes and requestId in responses
- Review logs for detailed error information
- Refer to ERROR_HANDLING_GUIDE.md for troubleshooting

