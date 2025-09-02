import fetch from 'node-fetch';

/**
 * Fetches LeetCode stats for a given username using GraphQL API
 * @param {string} username - LeetCode username
 * @param {string} sessionCookie - Optional LEETCODE_SESSION cookie for detailed stats
 * @returns {Promise<Object>} Stats including solved counts by difficulty and basic info
 */

//get name and other details
export async function getLeetCodeProfile(username, _sessionCookie = null) {
  try {
    const endpoint = "https://leetcode-api.aahil-khan.tech";
    const response = await fetch(`${endpoint}/${username}`);

    const data = await response.json();
    return {
      "username": username,
      "name": data.name || null,
      "birthday": data.birthday || null,
      "avatar": data.avatar || null,
      "ranking": data.ranking || null,
      "reputation": data.reputation || null,
      "gitHub": data.gitHub || null,
      "twitter": data.twitter || null,
      "linkedIN": data.linkedIN || null,
      "website": data.website || [],
      "country": data.country || null,
      "company": data.company || null,
      "school": data.school || null,
      "skillTags": data.skillTags || [],
      "about": data.about || ""
    };
  } catch (error) {
    console.error("Error in getLeetCodeProfile:", error);
    throw new Error(`Failed to fetch LeetCode profile: ${error.message}`);
  }
}



export async function getLeetCodeStats(username, _sessionCookie = null) {
  try{
      console.log("Starting getLeetCodeStats for username:", username);
      const endpoint = "https://leetcode-api.aahil-khan.tech"
  
      const response = await fetch(`${endpoint}/userProfile/${username}`);

      /*console.log("API response status:", response.status);
      
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}: ${response.statusText}`);
      }*/
      
      const data = await response.json();
      //console.log("API data keys:", Object.keys(data));
      //console.log("matchedUserStats exists:", !!data.matchedUserStats);
      
      // Calculate acceptance rate from matchedUserStats (using submissions for accurate rate)
      const acSubmissions = data.matchedUserStats?.acSubmissionNum?.find(item => item.difficulty === "All")?.submissions || 0;
      const totalSubmissions = data.matchedUserStats?.totalSubmissionNum?.find(item => item.difficulty === "All")?.submissions || 0;
      
      //console.log("AC Submissions (submissions):", acSubmissions, "Total Submissions (submissions):", totalSubmissions);
      
      const acceptanceRate = totalSubmissions > 0 ? ((acSubmissions / totalSubmissions) * 100).toFixed(2) + "%" : "0%";

      const res = {
        "username": username,
        "totalSolved": data.totalSolved || 0,
        "acceptanceRate": acceptanceRate,
        "ranking": data.ranking || null,
        "problemStats": {
          "easy": {
            "solved": data.easySolved,
            "total": data.totalEasy,
            "percentage": data.totalEasy > 0 ? parseFloat(((data.easySolved / data.totalEasy) * 100).toFixed(2)) : 0,
            "avgTime": 7
          },
          "medium": {
            "solved": data.mediumSolved,
            "total": data.totalMedium,
            "percentage": data.totalMedium > 0 ? parseFloat(((data.mediumSolved / data.totalMedium) * 100).toFixed(2)) : 0,
            "avgTime": 18
          },
          "hard": {
            "solved": data.hardSolved,
            "total": data.totalHard,
            "percentage": data.totalHard > 0 ? parseFloat(((data.hardSolved / data.totalHard) * 100).toFixed(2)) : 0,
            "avgTime": 41
          }
        }
      }
      
      console.log("Successfully created response object");
      return res;
  
    } catch (error) {
      console.error("Error in getLeetCodeStats:", error);
      throw new Error(`Failed to fetch LeetCode stats: ${error.message}`);
    }
  }


  export async function getLastnSubmissions(username, limit, sessionCookie= null){
    try {
      const endpoint = "https://leetcode-api.aahil-khan.tech";
      const response = await fetch(`${endpoint}/${username}/submission?limit=${limit}`);

      const data = await response.json();
      console.log("API data keys:", Object.keys(data));

      const res ={
        "username": username,
        "submissions": data.submission || []
      }

      return res;
    } catch (error) {
      throw new Error(`Failed to fetch last ${limit} submission: ${error.message}`);
    }
  }

  export async function getLeetCodeLanguages(username, sessionCookie= null){
    try {
      const endpoint = "https://leetcode-api.aahil-khan.tech";
      const response = await fetch(`${endpoint}/languageStats?username=${username}`);
      const data = await response.json();

      const res = {
        "username": username,
        "languages": data.matchedUser?.languageProblemCount || []
      }

      return res;
    } catch (error) {
      throw new Error(`Failed to fetch programming languages: ${error.message}`);
    }
  }

  export async function getLeetCodeTopics(username, sessionCookie= null){
    try {
      const endpoint = "https://leetcode-api.aahil-khan.tech";
      const url = `${endpoint}/skillStats/${username}`;
      console.log("Fetching from:", url);
      
      const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0", 
        "Accept": "application/json"
      }
    });

    const data = await response.json();

    if (!data?.data?.matchedUser) {
      return {
        username,
        topics: {},
        error: "User not found from backend (check headers/casing)"
      };
    }

    return {
      username,
      topics: data.data.matchedUser.tagProblemCounts
    };
  } catch (error) {
    throw new Error(`Failed to fetch topics: ${error.message}`);
  }
}


//heatmap, streak, daily average, total active days
export async function getLeetCodeActivity(username, sessionCookie= null){
  try{
    const endpoint = "https://leetcode-api.aahil-khan.tech";
    const currentYear = new Date().getFullYear();
    const url = `${endpoint}/userProfileCalendar?username=${username}&year=${currentYear}`;
    const response = await fetch(url);
    const data = await response.json();
    
    const userCal = data?.data?.matchedUser?.userCalendar;
    if (!userCal) throw new Error("User calendar not found");

    // Parse submission calendar (string -> JSON object)
    const calendarData = JSON.parse(userCal.submissionCalendar);

    // Convert to heatmap-friendly array
    const submissions = Object.entries(calendarData).map(([ts, count]) => ({
      date: new Date(Number(ts) * 1000).toISOString().split("T")[0],
      count: count
    }));

    return {
      username,
      streak: userCal.streak,
      totalActiveDays: userCal.totalActiveDays,
      submissions
    };
  } catch (error) {
    throw new Error(`Failed to fetch activity: ${error.message}`);
  }
}