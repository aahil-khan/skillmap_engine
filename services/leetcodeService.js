import fetch from 'node-fetch';

/**
 * Fetches LeetCode stats for a given username using GraphQL API
 * @param {string} username - LeetCode username
 * @param {string} sessionCookie - Optional LEETCODE_SESSION cookie for detailed stats
 * @returns {Promise<Object>} Stats including solved counts by difficulty and basic info
 */
export async function getLeetCodeStats(username, sessionCookie = null) {
  const endpoint = 'https://leetcode.com/graphql';
  
  const query = `
    query getUserProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile {
          ranking
        }
        submitStats {
          acSubmissionNum {
            difficulty
            count
            submissions
          }
        }
        tagProblemCounts {
          advanced {
            tagName
            tagSlug
            problemsSolved
          }
          intermediate {
            tagName
            tagSlug
            problemsSolved
          }
          fundamental {
            tagName
            tagSlug
            problemsSolved
          }
        }
      }
    }
  `;

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  if (sessionCookie) {
    headers['Cookie'] = `LEETCODE_SESSION=${sessionCookie}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { username }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    if (!data.data || !data.data.matchedUser) {
      throw new Error('User not found or no data returned');
    }

    const { matchedUser } = data.data;
    
    // Process difficulty stats
    const difficultyStats = {};
    let totalSubmissions = 0;
    
    if (matchedUser.submitStats?.acSubmissionNum) {
      for (const item of matchedUser.submitStats.acSubmissionNum) {
        difficultyStats[item.difficulty] = {
          solved: item.count,
          submissions: item.submissions
        };
        totalSubmissions += item.submissions;
      }
    }

    // Process category stats with difficulty breakdown
    const categoryStats = {
      "Advanced": {},
      "Intermediate": {},
      "Fundamental": {}
    };
    // List of all LeetCode categories (tags) as of 2024
    const targetCategories = [
      'Array', 'String', 'Hash Table', 'Math', 'Dynamic Programming', 'Sorting', 'Greedy', 'Depth-First Search', 'Binary Search', 'Breadth-First Search',
      'Tree', 'Database', 'Two Pointers', 'Bit Manipulation', 'Stack', 'Design', 'Heap (Priority Queue)', 'Backtracking', 'Graph', 'Simulation',
      'Sliding Window', 'Linked List', 'Recursion', 'Divide and Conquer', 'Union Find', 'Ordered Set', 'Trie', 'Geometry', 'Topological Sort',
      'Segment Tree', 'Binary Indexed Tree', 'Number Theory', 'Combinatorics', 'Game Theory', 'Monotonic Stack', 'Shortest Path', 'Randomized',
      'Memoization', 'Interactive', 'Data Stream', 'Rolling Hash', 'Concurrency', 'Minimum Spanning Tree', 'Counting', 'Suffix Array', 'Line Sweep',
      'Eulerian Circuit', 'Hash Function', 'Probability and Statistics', 'Rejection Sampling', 'Reservoir Sampling', 'Quickselect', 'Bucket Sort',
      'Fibonacci Heap', 'Radix Sort', 'Bitmask', 'Meet in the Middle', 'Brainteaser', 'Doubly-Linked List', 'Map', 'Queue', 'Union-Find', 'Matrix',
      'DFS', 'BFS', 'Shortest Path', 'Topological Sort', 'Trie', 'Bit Manipulation', 'Sliding Window', 'Greedy', 'Backtracking', 'Divide and Conquer',
      'Heap', 'Stack', 'Priority Queue', 'Segment Tree', 'Binary Indexed Tree', 'Ordered Set', 'Monotonic Stack', 'Suffix Array', 'Line Sweep',
      'Geometry', 'Game Theory', 'Randomized', 'Memoization', 'Interactive', 'Data Stream', 'Concurrency', 'Minimum Spanning Tree', 'Counting',
      'Hash Function', 'Probability and Statistics', 'Rejection Sampling', 'Reservoir Sampling', 'Quickselect', 'Bucket Sort', 'Fibonacci Heap',
      'Radix Sort', 'Bitmask', 'Meet in the Middle', 'Brainteaser', 'Doubly-Linked List', 'Map', 'Queue', 'Union-Find', 'Matrix'
    ];
    
    if (matchedUser.tagProblemCounts) {
      // Process advanced (hard) problems
      if (matchedUser.tagProblemCounts.advanced) {
        for (const tag of matchedUser.tagProblemCounts.advanced) {
          const categoryName = tag.tagName;
          if (targetCategories.some(cat => categoryName.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(categoryName.toLowerCase()))) {
            categoryStats.Advanced[categoryName] = {
              totalSolved: tag.problemsSolved
            };
          }
        }
      }
      
      // Process intermediate (medium) problems
      if (matchedUser.tagProblemCounts.intermediate) {
        for (const tag of matchedUser.tagProblemCounts.intermediate) {
          const categoryName = tag.tagName;
          if (targetCategories.some(cat => categoryName.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(categoryName.toLowerCase()))) {
            categoryStats.Intermediate[categoryName] = {
              totalSolved: tag.problemsSolved
            };
          }
        }
      }
      
      // Process fundamental (easy) problems
      if (matchedUser.tagProblemCounts.fundamental) {
        for (const tag of matchedUser.tagProblemCounts.fundamental) {
          const categoryName = tag.tagName;
          if (targetCategories.some(cat => categoryName.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(categoryName.toLowerCase()))) {
            categoryStats.Fundamental[categoryName] = {
              totalSolved: tag.problemsSolved
            };
          }
        }
      }
    }

    const result = {
      username: matchedUser.username,
      ranking: matchedUser.profile?.ranking || null,
      difficultyStats,
      categoryStats,
      totalSubmissions,
      hasDetailedStats: !!matchedUser.submitStats
    };

    // For debugging - pretty print
    console.log('LeetCode Stats Result:');
    console.log(JSON.stringify(result, null, 2));

    return result;

  } catch (error) {
    throw new Error(`Failed to fetch LeetCode stats: ${error.message}`);
  }
}

