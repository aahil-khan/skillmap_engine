import fetch from 'node-fetch';

/**
 * Fetches LeetCode stats for a given username using GraphQL API
 * @param {string} username - LeetCode username
 * @param {string} sessionCookie - Optional LEETCODE_SESSION cookie for detailed stats
 * @returns {Promise<Object>} Stats including solved counts by difficulty and basic info
 */
export async function getLeetCodeStats2(username) {
  try{
    const endpoint = "https://leetcode-api.aahil-khan.tech"

    const response = await fetch(`${endpoint}/userProfile/${username}`);
    const data = await response.json();

    const res = {
        "username":username,
        "totalSolved":data.totalSolved,
        "acceptanceRate":"100%"
    }

    return res;

  } catch (error) {
    throw new Error(`Failed to fetch LeetCode stats: ${error.message}`);
  }
}

