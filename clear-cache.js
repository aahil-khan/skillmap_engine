import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});

// Clear all match caches
const keys = await redis.keys('match:candidates:*');
console.log(`Found ${keys.length} cached matches`);

for (const key of keys) {
  await redis.del(key);
  console.log(`Deleted: ${key}`);
}

console.log('✓ Cache cleared!');
