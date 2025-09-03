import { openai } from "../config/openai.js";
import { getLastnSubmissions } from "./leetcodeService.js";

export async function suggestProblem(username){
    try{
        const {submissions} = await getLastnSubmissions(username, 10);
        if(!submissions || submissions.length === 0){
            return getDefaultRecommendations();
        }

        // Clean submissions data
        const solvedProblems = submissions
            .filter(sub => sub.statusDisplay === "Accepted")
            .map(sub => sub.title);

        console.log("Solved problems:", solvedProblems);

        // Try OpenAI with very simple prompt and short timeout
        try {
            const completion = await Promise.race([
                openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: "Respond with JSON: {\"recommended_problems\": [{\"title\": \"Problem Name\", \"difficulty\": \"Easy\", \"category\": \"Array\", \"description\": \"Short desc\", \"url\": \"https://leetcode.com/problems/slug/\"}]}"
                        },
                        {
                            role: "user", 
                            content: `I solved: ${solvedProblems.slice(0,3).join(", ")}. Recommend 4 new problems.`
                        }
                    ],
                    temperature: 0,
                    max_tokens: 300
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 8000)
                )
            ]);

            return JSON.parse(completion.choices[0].message.content);

        } catch (openaiError) {
            console.log("OpenAI failed, using smart fallback");
            return getSmartRecommendations(solvedProblems);
        }

    } catch (error) {
        console.error("Error in suggestProblem:", error);
        return getDefaultRecommendations();
    }
}

function getDefaultRecommendations() {
    return {
        recommended_problems: [
            {
                title: "Two Sum",
                difficulty: "Easy",
                category: "Array",
                description: "Hash table fundamentals",
                url: "https://leetcode.com/problems/two-sum/"
            },
            {
                title: "Valid Parentheses",
                difficulty: "Easy",
                category: "Stack",
                description: "Stack basics",
                url: "https://leetcode.com/problems/valid-parentheses/"
            },
            {
                title: "Maximum Subarray",
                difficulty: "Medium",
                category: "Dynamic Programming", 
                description: "DP introduction",
                url: "https://leetcode.com/problems/maximum-subarray/"
            },
            {
                title: "Binary Tree Inorder Traversal",
                difficulty: "Easy",
                category: "Tree",
                description: "Tree traversal",
                url: "https://leetcode.com/problems/binary-tree-inorder-traversal/"
            }
        ]
    };
}

function getSmartRecommendations(solvedProblems) {
    const allProblems = [
        {
            title: "Reverse Linked List",
            difficulty: "Easy", 
            category: "Linked List",
            description: "Linked list manipulation",
            url: "https://leetcode.com/problems/reverse-linked-list/"
        },
        {
            title: "Valid Anagram",
            difficulty: "Easy",
            category: "String",
            description: "String manipulation and sorting", 
            url: "https://leetcode.com/problems/valid-anagram/"
        },
        {
            title: "Best Time to Buy and Sell Stock",
            difficulty: "Easy",
            category: "Array",
            description: "Array traversal and optimization",
            url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/"
        },
        {
            title: "Contains Duplicate", 
            difficulty: "Easy",
            category: "Array",
            description: "Hash set usage",
            url: "https://leetcode.com/problems/contains-duplicate/"
        },
        {
            title: "Climbing Stairs",
            difficulty: "Easy",
            category: "Dynamic Programming",
            description: "Basic DP concept",
            url: "https://leetcode.com/problems/climbing-stairs/"
        },
        {
            title: "Merge Two Sorted Lists",
            difficulty: "Easy", 
            category: "Linked List",
            description: "Linked list merging",
            url: "https://leetcode.com/problems/merge-two-sorted-lists/"
        }
    ];

    // Filter out already solved problems
    const unsolvedProblems = allProblems.filter(problem => 
        !solvedProblems.some(solved => 
            solved.toLowerCase().includes(problem.title.toLowerCase()) ||
            problem.title.toLowerCase().includes(solved.toLowerCase())
        )
    );

    // Return 4 unsolved problems, or default if not enough
    const recommendations = unsolvedProblems.slice(0, 4);
    
    while (recommendations.length < 4) {
        recommendations.push(allProblems[recommendations.length]);
    }

    return {
        recommended_problems: recommendations
    };
}
