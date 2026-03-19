import { Redis } from "ioredis";

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    
    console.log(`🔗 Connecting to Redis: ${redisUrl.replace(/:[^:]*@/, ':****@')}`);
    
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    redis.on("connect", () => {
      console.log("✅ Redis connected");
    });

    redis.on("error", (err: Error) => {
      console.error("❌ Redis error:", err.message);
    });
  }

  return redis;
}

export function closeRedis(): void {
  if (redis) {
    redis.quit();
    redis = null;
  }
  console.log("🔌 Redis disconnected");
}