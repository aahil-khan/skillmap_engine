## 1
get last n submissions returns using the endpoint

/api/leetcode/:username/submission

{
    "success": true,
    "data": {
        "username": "vanshgupta1810",
        "submissions": [
            {
                "title": "Course Schedule",
                "titleSlug": "course-schedule",
                "timestamp": "1755540707",
                "statusDisplay": "Accepted",
                "lang": "cpp"
            }
        ]
    }
}

## 2
within getleetcodetopics function 
/skillStats/:username
returns 

{
  "data": {
    "matchedUser": {
      "tagProblemCounts": {
        "advanced": [
          {
            "tagName": "Dynamic Programming",
            "tagSlug": "dynamic-programming",
            "problemsSolved": 4
          }
        ],
        "intermediate": [
          {
            "tagName": "Tree",
            "tagSlug": "tree",
            "problemsSolved": 18
          }
        ],
        "fundamental": [
          {
            "tagName": "Array",
            "tagSlug": "array",
            "problemsSolved": 30
          }
        ]
      }
    }
  }
}

## 3

/select?titleSlug=two-sum endpoint returns

{
  "link": "https://leetcode.com/problems/two-sum",
  "questionId": "1",
  "questionFrontendId": "1",
  "questionTitle": "Two Sum",
  "titleSlug": "two-sum",
  "difficulty": "Easy",
  "isPaidOnly": false,
  "question": "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
  "exampleTestcases": "[2,7,11,15]\n9",
  "topicTags": [
    {
      "name": "Array",
      "slug": "array",
      "translatedName": null
    }
  ],
  "hints": [
    "Use a hash map to find complements efficiently."
  ],
  "solution": {
    "id": "7",
    "canSeeDetail": true,
    "paidOnly": false,
    "hasVideoSolution": true,
    "paidOnlyVideo": false
  },
  "companyTagStats": null,
  "likes": 66183,
  "dislikes": 2463,
  "similarQuestions": "[{\"title\":\"3Sum\",\"titleSlug\":\"3sum\",\"difficulty\":\"Medium\",\"translatedTitle\":null}]"
}

## FULL API REFERENCE (root / endpoint)

{
    "apiOverview": "Welcome to the Alfa-Leetcode-API! Alfa-Leetcode-Api is a custom solution born out of the need for a well-documented and detailed LeetCode API. This project is designed to provide developers with endpoints that offer insights into a user\"s profile, badges, solved questions, contest details, contest history, submissions, and also daily questions, selected problem, list of problems.",
    "apiEndpointsLink": "https://github.com/alfaarghya/alfa-leetcode-api?tab=readme-ov-file#endpoints-",
    "routes": {
        "userDetails": {
            "description": "Endpoints for retrieving detailed user profile information on Leetcode.",
            "Method": "GET",
            "/:username": "Get your leetcodevis profile Details",
            "/:username/badges": "Get your badges",
            "/:username/solved": "Get total number of question you solved",
            "/:username/contest": "Get your contest details",
            "/:username/contest/history": "Get all contest history",
            "/:username/submission": "Get your last 20 submission",
            "/:username/acSubmission": "Get your last 20 accepted submission",
            "/:username/calendar": "Get your submission calendar",
            "/userProfile/:username": "Get full profile details in one call",
            "/userProfileCalendar?username=yourname&year=2024": "Get your calendar details with year",
            "/languageStats?username=yourname": "Get the language stats of a user",
            "/userProfileUserQuestionProgressV2/:userSlug": "Get your question progress",
            "/skillStats/:username": "Get your skill stats"
        },
        "contest": {
            "description": "Endpoints for retrieving contest ranking and performance data.",
            "Method": "GET",
            "/userContestRankingInfo/:username": "Get user contest ranking info"
        },
        "discussion": {
            "description": "Endpoints for fetching discussion topics and comments.",
            "Method": "GET",
            "/trendingDiscuss?first=20": "Get top 20 trending discussions",
            "/discussTopic/:topicId": "Get discussion topic",
            "/discussComments/:topicId": "Get discussion comments"
        },
        "problems": {
            "description": "Endpoints for fetching problem-related data, including lists, details, and solutions.",
            "Method": "GET",
            "singleProblem": {
                "/select?titleSlug=two-sum": "Get selected Problem",
                "/daily": "Get daily Problem",
                "/dailyQuestion": "Get raw daily question"
            },
            "problemList": {
                "/problems": "Get list of 20 problems",
                "/problems?limit=50": "Get list of some problems",
                "/problems?tags=array+math": "Get list problems on selected topics",
                "/problems?tags=array+math+string&limit=5": "Get list some problems on selected topics",
                "/officialSolution?titleSlug=two-sum": "Get official solution of selected problem"
            }
        }
    }
}


