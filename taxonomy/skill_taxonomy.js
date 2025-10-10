export const skill_taxonomy = [
  {
    "category": "Data Structures & Algorithms(DSA)",
    "description": "Core programming fundamentals for technical interviews and problem-solving.",
    "skills": [
      {
        "name": "Arrays & Strings",
        "level": "Beginner",
        "tags": ["indexing", "manipulation", "sliding window", "two pointers", "hashing", "iteration"],
        "description": "Understanding indexing, slicing, string manipulation, 2D arrays, sliding window technique, and common array patterns for efficiently solving sequence-based problems.",
        "relatedSkills": ["Searching & Sorting", "Dynamic Programming"],
        "learningResources": {
          "docs": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array",
          "video": "https://www.youtube.com/watch?v=RBSGKlAvoiM",
          "practice": "https://neetcode.io/roadmap"
        },
        "subskills": ["Sliding Window", "Two Pointers", "Prefix Sum", "String Matching", "2D Matrix Traversal"]
      },
      {
        "name": "Linked Lists",
        "level": "Intermediate",
        "tags": ["pointers", "traversal", "cycles", "reversal", "merging", "memory management"],
        "description": "Implementing singly/doubly linked lists, circular lists, detecting cycles, reversing lists, and merge operations for non-contiguous memory allocation problems.",
        "relatedSkills": ["Stacks & Queues", "Trees & Graphs"],
        "learningResources": {
          "video": "https://www.youtube.com/watch?v=njTh_OwMljA",
          "practice": "https://neetcode.io/roadmap"
        },
        "subskills": ["Singly Linked List", "Doubly Linked List", "Fast & Slow Pointers", "List Reversal", "Cycle Detection"]
      },
      {
        "name": "Stacks & Queues",
        "level": "Intermediate",
        "tags": ["LIFO", "FIFO", "monotonic", "priority", "implementation", "deque"],
        "description": "Implementing stack/queue using arrays/linked lists, monotonic stack patterns, priority queues, and deques for efficient data processing with specific access patterns.",
        "relatedSkills": ["Linked Lists", "Trees & Graphs"],
        "learningResources": {
          "video": "https://www.youtube.com/watch?v=wjI1WNcIntg",
          "practice": "https://neetcode.io/roadmap"
        },
        "subskills": ["Stack Implementation", "Queue Implementation", "Monotonic Stack", "Priority Queue", "Deque Operations"]
      },
      {
        "name": "Trees & Graphs",
        "level": "Advanced",
        "tags": ["traversal", "recursion", "paths", "connectivity", "hierarchies", "optimization"],
        "description": "Binary trees, BST, heaps, tries, graph representations (adjacency list/matrix), DFS, BFS, shortest paths, and MST algorithms for modeling hierarchical and networked relationships.",
        "relatedSkills": ["Dynamic Programming", "Searching & Sorting"],
        "learningResources": {
          "video": "https://www.youtube.com/watch?v=fAAZixBzIAI",
          "practice": "https://neetcode.io/roadmap"
        },
        "subskills": ["Binary Tree Traversal", "DFS & BFS", "Binary Search Trees", "Graph Algorithms", "Shortest Path", "Tries"]
      },
      {
        "name": "Dynamic Programming",
        "level": "Advanced",
        "tags": ["memoization", "tabulation", "optimization", "subproblems", "states", "recursion"],
        "description": "Top-down/bottom-up approaches, state design, overlapping subproblems, 1D/2D DP, path problems, and optimization problems using systematic sub-problem decomposition and caching.",
        "relatedSkills": ["Recursion", "Trees & Graphs"],
        "learningResources": {
          "video": "https://www.youtube.com/watch?v=oBt53YbR9Kk",
          "practice": "https://neetcode.io/roadmap"
        },
        "subskills": ["1D DP", "2D DP", "Knapsack Variants", "State Transition Design", "Overlapping Subproblems", "Memoization"]
      },
      {
        "name": "Searching & Sorting",
        "level": "Intermediate",
        "tags": ["binary search", "divide-and-conquer", "comparison", "non-comparison", "complexity", "stability"],
        "description": "Binary search variations, merge sort, quick sort, bucket sort, counting sort with space/time complexity analysis and implementation for efficient data retrieval and organization.",
        "relatedSkills": ["Arrays & Strings", "Dynamic Programming"],
        "learningResources": {
          "video": "https://www.youtube.com/watch?v=kPRA0W1kECg",
          "practice": "https://neetcode.io/roadmap"
        },
        "subskills": ["Binary Search", "Merge Sort", "Quick Sort", "Counting Sort", "Bucket Sort", "Heap Sort"]
      }
    ]
  },
  {
    "category": "Web Development",
    "description": "Technologies and frameworks used to build interactive web applications and sites.",
    "skills": [
      {
        "name": "HTML and CSS",
        "level": "Beginner",
        "tags": ["semantic markup", "responsive design", "layout", "styling", "accessibility", "animations"],
        "description": "Semantic HTML5, CSS Grid/Flexbox, responsive design, animations, CSS variables, preprocessors (SASS), and accessibility practices for creating well-structured, visually appealing web interfaces.",
        "relatedSkills": ["JavaScript", "React"],
        "learningResources": {
          "docs": "https://developer.mozilla.org/en-US/docs/Web/HTML",
          "video": "https://www.youtube.com/watch?v=mU6anWqZJcc",
          "practice": "https://frontendmentor.io/challenges"
        },
        "subskills": ["Semantic HTML5", "CSS Grid", "Flexbox", "Responsive Design", "CSS Animations", "Accessibility"]
      },
      {
        "name": "JavaScript",
        "level": "Intermediate",
        "tags": ["ES6+", "async", "DOM", "events", "functional", "prototypes"],
        "description": "ES6+ features, promises, async/await, DOM manipulation, event handling, closures, prototypes, and modern JS patterns for building dynamic, interactive web applications.",
        "relatedSkills": ["HTML and CSS", "React", "Nodejs and Expressjs"],
        "learningResources": {
          "docs": "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
          "video": "https://www.youtube.com/watch?v=W6NZfCO5SIk",
          "practice": "https://exercism.org/tracks/javascript"
        },
        "subskills": ["ES6+ Syntax", "DOM Manipulation", "Event Handling", "Async/Await", "Closures", "Prototypes"]
      },
      {
        "name": "React",
        "level": "Intermediate",
        "tags": ["components", "hooks", "virtual DOM", "state", "props", "lifecycle"],
        "description": "Hooks (useState, useEffect, custom hooks), context API, performance optimization, error boundaries, and state management (Redux/Zustand) for building declarative, component-based user interfaces.",
        "relatedSkills": ["JavaScript", "Nextjs", "Authentication"],
        "learningResources": {
          "docs": "https://react.dev",
          "video": "https://www.youtube.com/watch?v=bMknfKXIFA8",
          "practice": "https://exercism.org/tracks/javascript"
        },
        "subskills": ["useState", "useEffect", "Custom Hooks", "Context API", "Redux", "Error Boundaries"]
      },
      {
        "name": "Nextjs",
        "level": "Advanced",
        "tags": ["SSR", "SSG", "ISR", "routing", "middleware", "optimization"],
        "description": "App/Pages router, server components, data fetching strategies, middleware, image optimization, and deployment best practices for production-ready React applications with enhanced performance.",
        "relatedSkills": ["React", "Nodejs and Expressjs"],
        "learningResources": {
          "docs": "https://nextjs.org/docs",
          "video": "https://www.youtube.com/watch?v=mTz0GXj8NN0",
          "practice": "https://nextjs.org/learn"
        },
        "subskills": ["App Router", "Server Components", "Data Fetching", "Middleware", "Image Optimization", "SEO"]
      },
      {
        "name": "Nodejs and Expressjs",
        "level": "Intermediate",
        "tags": ["server-side", "REST", "middleware", "APIs", "async", "websockets"],
        "description": "RESTful APIs, middleware patterns, error handling, rate limiting, file uploads, WebSockets, and MongoDB/SQL integration for building scalable and efficient server-side applications.",
        "relatedSkills": ["JavaScript", "Authentication", "SQL"],
        "learningResources": {
          "docs": "https://nodejs.org/en/docs",
          "video": "https://www.youtube.com/watch?v=Oe421EPjeBE",
          "practice": "https://exercism.org/tracks/javascript"
        },
        "subskills": ["RESTful APIs", "Middleware", "Error Handling", "Authentication", "File Uploads", "WebSockets"]
      },
      {
        "name": "Authentication",
        "level": "Advanced",
        "tags": ["security", "tokens", "sessions", "OAuth", "authorization", "encryption"],
        "description": "JWT implementation, OAuth 2.0 flows, session management, password hashing, RBAC, and security best practices (CSRF/XSS protection) for creating secure, user-centric web applications.",
        "relatedSkills": ["Nodejs and Expressjs", "React", "JavaScript"],
        "learningResources": {
          "video": "https://www.youtube.com/watch?v=mbsmsi7l3r4",
          "practice": "https://exercism.org/tracks/javascript"
        },
        "subskills": ["JWT", "OAuth 2.0", "Session Management", "Password Hashing", "RBAC", "CSRF Protection"]
      }
    ]
  },
  {
    "category": "Databases",
    "description": "Storage systems, query languages, and data management techniques for persistent application data.",
    "skills": [
      {
        "name": "SQL",
        "level": "Intermediate",
        "tags": ["queries", "joins", "functions", "procedures", "optimization", "normalization"],
        "description": "Complex joins, window functions, CTEs, stored procedures, triggers, indexes, and query optimization techniques for effective relational database management and data retrieval.",
        "relatedSkills": ["PostgreSQL", "ORMs (Prisma/SQLAlchemy)"],
        "learningResources": {
          "video": "https://www.youtube.com/watch?v=HXV3zeQKqGY",
          "practice": "https://sqlbolt.com"
        },
        "subskills": ["Joins", "Window Functions", "CTEs", "Indexes", "Stored Procedures", "Query Optimization"]
      },
      {
        "name": "PostgreSQL",
        "level": "Advanced",
        "tags": ["JSONB", "full-text", "views", "performance", "replication", "extensions"],
        "description": "JSON operations, full-text search, materialized views, partitioning, replication, and performance tuning with EXPLAIN/ANALYZE for leveraging PostgreSQL's advanced features in production environments.",
        "relatedSkills": ["SQL", "ORMs (Prisma/SQLAlchemy)"],
        "learningResources": {
          "docs": "https://www.postgresql.org/docs/",
          "video": "https://www.youtube.com/watch?v=qw--VYLpxG4",
          "practice": "https://sqlbolt.com"
        },
        "subskills": ["JSONB Operations", "Full-Text Search", "Materialized Views", "Partitioning", "Replication", "EXPLAIN/ANALYZE"]
      },
      {
        "name": "NoSQL (MongoDB)",
        "level": "Intermediate",
        "tags": ["documents", "aggregation", "indexes", "schemas", "sharding", "modeling"],
        "description": "Schema design patterns, indexing strategies, aggregation framework, transactions, sharding, and data modeling best practices for flexible, scalable non-relational database solutions.",
        "relatedSkills": ["ORMs (Prisma/SQLAlchemy)", "Nodejs and Expressjs"],
        "learningResources": {
          "docs": "https://www.mongodb.com/docs/",
          "video": "https://www.youtube.com/watch?v=ofme2o29ngU",
          "practice": "https://www.mongodb.com/docs/manual/tutorial/"
        },
        "subskills": ["Schema Design", "Aggregation Pipeline", "Indexing", "Transactions", "Sharding", "Data Modeling"]
      },
      {
        "name": "ORMs (Prisma/SQLAlchemy)",
        "level": "Intermediate",
        "tags": ["migrations", "models", "queries", "relationships", "caching", "typing"],
        "description": "Schema migrations, relationships, raw queries, connection pooling, caching strategies, and TypeScript/Python integration for abstracting database operations while maintaining performance and type safety.",
        "relatedSkills": ["SQL", "PostgreSQL", "NoSQL (MongoDB)"],
        "learningResources": {
          "docs": "https://www.prisma.io/docs/",
          "video": "https://www.youtube.com/watch?v=RebA5J-rlwg",
          "practice": "https://www.prisma.io/docs/getting-started"
        },
        "subskills": ["Schema Migrations", "Model Relationships", "Raw Queries", "Connection Pooling", "Type Safety", "Caching"]
      }
    ]
  },
  {
    "category": "AI & ML",
    "description": "Techniques and technologies for building intelligent systems that learn from data and generate content.",
    "skills": [
      {
        "name": "Prompt Engineering",
        "level": "Intermediate",
        "tags": ["instructions", "context", "chain-of-thought", "examples", "constraints", "templates"],
        "description": "System prompts, few-shot learning, chain-of-thought prompting, constraint satisfaction, and prompt templating systems for effectively controlling and optimizing large language model outputs.",
        "relatedSkills": ["RAG", "LangChain", "OpenAI Assistants API"],
        "learningResources": {
          "docs": "https://platform.openai.com/docs/guides/prompt-engineering",
          "video": "https://www.youtube.com/watch?v=_ZvnD73m40o",
          "practice": "https://platform.openai.com/playground"
        },
        "subskills": ["System Prompts", "Few-Shot Learning", "Chain-of-Thought", "Constraint Satisfaction", "Prompt Templates", "Output Parsing"]
      },
      {
        "name": "RAG",
        "level": "Advanced",
        "tags": ["retrieval", "chunking", "relevance", "context", "augmentation", "evaluation"],
        "description": "Document preprocessing, chunk optimization, hybrid search, reranking strategies, and evaluation metrics for retrieval quality to enhance LLM responses with accurate, relevant information.",
        "relatedSkills": ["Embeddings & Vector DBs", "Prompt Engineering", "LangChain"],
        "learningResources": {
          "docs": "https://python.langchain.com/docs/tutorials/rag/",
          "video": "https://www.youtube.com/watch?v=wd7TZ4w1mSw",
          "practice": "https://python.langchain.com/docs/tutorials/"
        },
        "subskills": ["Document Chunking", "Hybrid Search", "Reranking", "Context Window Management", "Retrieval Metrics", "Query Optimization"]
      },
      {
        "name": "Embeddings & Vector DBs",
        "level": "Advanced",
        "tags": ["vectors", "semantics", "similarity", "indexing", "dimensionality", "search"],
        "description": "Text/image embeddings, dimensionality reduction, similarity metrics, ANN algorithms, and vector DB optimization (Pinecone/Weaviate) for semantic search and AI-powered information retrieval.",
        "relatedSkills": ["RAG", "LangChain", "Open Source LLMs"],
        "learningResources": {
          "docs": "https://www.pinecone.io/docs/",
          "video": "https://www.youtube.com/watch?v=dN0lsF2cvm4",
          "practice": "https://www.pinecone.io/learn/"
        },
        "subskills": ["Text Embeddings", "Similarity Search", "Vector Indexing", "Dimensionality Reduction", "ANN Algorithms", "Hybrid Search"]
      },
      {
        "name": "LangChain",
        "level": "Advanced",
        "tags": ["agents", "tools", "memory", "parsers", "chains", "orchestration"],
        "description": "Custom agents, tool creation, memory systems, output parsers, structured outputs, and chain composition patterns for building complex, composable LLM-powered applications and workflows.",
        "relatedSkills": ["RAG", "Embeddings & Vector DBs", "OpenAI Assistants API"],
        "learningResources": {
          "docs": "https://python.langchain.com/docs/",
          "video": "https://www.youtube.com/watch?v=LbT1yp6quS8",
          "practice": "https://python.langchain.com/docs/tutorials/"
        },
        "subskills": ["Agents", "Tool Creation", "Memory Systems", "Output Parsers", "Chain Composition", "Callbacks"]
      },
      {
        "name": "OpenAI Assistants API",
        "level": "Intermediate",
        "tags": ["functions", "threads", "retrieval", "code", "conversation", "integration"],
        "description": "Function calling, code interpreter, retrieval integration, thread management, and multi-turn conversation handling for building specialized AI assistants with persistent memory and tool use.",
        "relatedSkills": ["Prompt Engineering", "LangChain", "RAG"],
        "learningResources": {
          "docs": "https://platform.openai.com/docs/assistants/overview",
          "video": "https://www.youtube.com/watch?v=5rcjGjgJNQc",
          "practice": "https://platform.openai.com/playground"
        },
        "subskills": ["Function Calling", "Thread Management", "Code Interpreter", "Retrieval", "Multi-Turn Conversations", "Tool Integration"]
      },
      {
        "name": "Open Source LLMs",
        "level": "Advanced",
        "tags": ["quantization", "fine-tuning", "deployment", "inference", "evaluation", "models"],
        "description": "Model quantization, fine-tuning techniques, deployment strategies, GGUF format, and model evaluation metrics for implementing efficient, specialized open-source language models in production.",
        "relatedSkills": ["LangChain", "RAG", "Embeddings & Vector DBs"],
        "learningResources": {
          "docs": "https://huggingface.co/docs/",
          "video": "https://www.youtube.com/watch?v=jkrNMKz9pWU",
          "practice": "https://huggingface.co/learn"
        },
        "subskills": ["Model Quantization", "Fine-Tuning", "GGUF Format", "Inference Optimization", "Model Evaluation", "Deployment Strategies"]
      }
    ]
  },
  {
    "category": "DevOps & Infra",
    "description": "Tools and practices for software delivery, deployment, and infrastructure management.",
    "skills": [
      {
        "name": "Git & GitHub",
        "level": "Intermediate",
        "tags": ["version control", "branches", "workflows", "automation", "collaboration", "history"],
        "description": "Advanced git operations, rebase workflows, hooks, monorepo management, GitHub Actions, and collaboration best practices for effective team-based development and source code management.",
        "relatedSkills": ["CI/CD", "Linux/Bash"],
        "learningResources": {
          "docs": "https://git-scm.com/docs",
          "video": "https://www.youtube.com/watch?v=RGOj5yH7evk",
          "practice": "https://learngitbranching.js.org"
        },
        "subskills": ["Branching Strategies", "Rebasing", "Git Hooks", "GitHub Actions", "Merge Conflicts", "Monorepo Management"]
      },
      {
        "name": "CI/CD",
        "level": "Advanced",
        "tags": ["pipelines", "automation", "testing", "deployment", "environments", "integration"],
        "description": "Pipeline design, environment management, secret handling, automated testing, deployment strategies (blue-green/canary) for reliable, consistent software delivery and quality assurance.",
        "relatedSkills": ["Git & GitHub", "Docker", "Monitoring & Logs"],
        "learningResources": {
          "docs": "https://docs.github.com/en/actions",
          "video": "https://www.youtube.com/watch?v=R8_veQiYBjI",
          "practice": "https://docs.github.com/en/actions/learn-github-actions"
        },
        "subskills": ["Pipeline Design", "Environment Management", "Secret Handling", "Automated Testing", "Deployment Strategies", "Artifact Management"]
      },
      {
        "name": "Docker",
        "level": "Intermediate",
        "tags": ["containers", "images", "networking", "volumes", "compose", "optimization"],
        "description": "Multi-stage builds, networking, volume management, Docker Compose, image optimization, and security best practices for consistent, isolated application deployment across environments.",
        "relatedSkills": ["CI/CD", "Linux/Bash", "Monitoring & Logs"],
        "learningResources": {
          "docs": "https://docs.docker.com/",
          "video": "https://www.youtube.com/watch?v=fqMOX6JJhGo",
          "practice": "https://play-with-docker.com"
        },
        "subskills": ["Multi-Stage Builds", "Docker Networking", "Volume Management", "Docker Compose", "Image Optimization", "Container Security"]
      },
      {
        "name": "Linux/Bash",
        "level": "Intermediate",
        "tags": ["scripting", "automation", "processes", "permissions", "networking", "system"],
        "description": "Shell scripting, process management, cron jobs, system monitoring, networking tools, and server administration for effective command-line operations and environment management.",
        "relatedSkills": ["Docker", "CI/CD", "Monitoring & Logs"],
        "learningResources": {
          "docs": "https://www.gnu.org/software/bash/manual/",
          "video": "https://www.youtube.com/watch?v=I4EWvMFj37g",
          "practice": "https://exercism.org/tracks/bash"
        },
        "subskills": ["Shell Scripting", "Process Management", "Cron Jobs", "File Permissions", "Networking Tools", "System Monitoring"]
      },
      {
        "name": "Monitoring & Logs",
        "level": "Advanced",
        "tags": ["metrics", "alerts", "dashboards", "tracing", "aggregation", "observability"],
        "description": "Metrics collection, alerting systems, log aggregation, distributed tracing, and observability best practices for maintaining system reliability and quickly diagnosing production issues.",
        "relatedSkills": ["Docker", "CI/CD", "Linux/Bash"],
        "learningResources": {
          "docs": "https://grafana.com/docs/",
          "video": "https://www.youtube.com/watch?v=9TJx7QTrTyo",
          "practice": "https://prometheus.io/docs/introduction/overview/"
        },
        "subskills": ["Metrics Collection", "Alerting", "Log Aggregation", "Distributed Tracing", "Dashboard Design", "Incident Response"]
      }
    ]
  }
]