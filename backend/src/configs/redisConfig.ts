import { Redis as IORedis } from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// ============================================================================
// IORedis Client (for BullMQ)
// ============================================================================

let ioredis: IORedis | null = null;

export function getRedisClient(): IORedis {
  if (!ioredis) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    
    console.log(`🔗 Connecting to Redis (IORedis): ${redisUrl.replace(/:[^:]*@/, ':****@')}`);
    
    ioredis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    ioredis.on("connect", () => {
      console.log("✅ Redis (IORedis) connected");
    });

    ioredis.on("error", (err: Error) => {
      console.error("❌ Redis (IORedis) error:", err.message);
    });
  }

  return ioredis;
}

export function closeRedis(): void {
  if (ioredis) {
    ioredis.quit();
    ioredis = null;
  }
  console.log("🔌 Redis disconnected");
}

// ============================================================================
// Upstash Redis Client (for Rate Limiting)
// ============================================================================

const upstashRedis = new UpstashRedis({
  url: process.env.REDIS_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '', // Optional: only needed for REST API
});

// ============================================================================
// Rate Limiters by Tier
// ============================================================================

// Free tier: 50 requests per month (sliding window)
const freeTierLimiter = new Ratelimit({
  redis: upstashRedis,  // ✅ Use Upstash Redis
  limiter: Ratelimit.slidingWindow(50, "30 d"),
  prefix: "ratelimit:free",
  analytics: true,
});

// Pro tier: 500 requests per month
const proTierLimiter = new Ratelimit({
  redis: upstashRedis,
  limiter: Ratelimit.slidingWindow(500, "30 d"),
  prefix: "ratelimit:pro",
  analytics: true,
});

// Enterprise: unlimited (or very high limit)
const enterpriseLimiter = new Ratelimit({
  redis: upstashRedis,
  limiter: Ratelimit.slidingWindow(999999, "30 d"),
  prefix: "ratelimit:enterprise",
  analytics: true,
});

// ============================================================================
// Rate Limit Check Function
// ============================================================================

export async function checkRateLimit(
  installationId: number,
  tier: 'free' | 'pro' | 'enterprise' = 'free'
): Promise<{
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
}> {
  
  // Select limiter based on tier
  const limiter = tier === 'enterprise' 
    ? enterpriseLimiter 
    : tier === 'pro' 
    ? proTierLimiter 
    : freeTierLimiter;
  
  // Check rate limit using installation ID as identifier
  const identifier = `installation:${installationId}`;
  const result = await limiter.limit(identifier);
  
  console.log(`🔒 Rate limit check for ${identifier} (${tier}):`);
  console.log(`   Allowed: ${result.success}`);
  console.log(`   Remaining: ${result.remaining}/${result.limit}`);
  console.log(`   Resets: ${new Date(result.reset).toISOString()}`);
  
  return {
    allowed: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

// ============================================================================
// Get Current Usage (Analytics)
// ============================================================================

export async function getCurrentUsage(
  installationId: number,
  tier: 'free' | 'pro' | 'enterprise' = 'free'
): Promise<{
  used: number;
  limit: number;
  remaining: number;
  resetDate: Date;
}> {
  
  const limiter = tier === 'enterprise' 
    ? enterpriseLimiter 
    : tier === 'pro' 
    ? proTierLimiter 
    : freeTierLimiter;
  
  const identifier = `installation:${installationId}`;
  
  // Get without incrementing
  const result = await limiter.getRemaining(identifier);
  
  const limit = tier === 'free' ? 50 : tier === 'pro' ? 500 : 999999;
  const used = limit - result.remaining;
  
  return {
    used,
    limit,
    remaining: result.remaining,
    resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  };
}


// ============================================================================
// Reset User Limit (for admins/support)
// ============================================================================

export async function resetUserLimit(
  installationId: number,
  tier: 'free' | 'pro' | 'enterprise' = 'free'
): Promise<void> {
  const identifier = `installation:${installationId}`;
  const prefix = tier === 'free' ? 'ratelimit:free' : tier === 'pro' ? 'ratelimit:pro' : 'ratelimit:enterprise';
  
  await upstashRedis.del(`${prefix}:${identifier}`);
  console.log(`✅ Reset rate limit for ${identifier}`);
}
