import Queue from "bull";

const docQueue = new Queue("doc-processing", {
  redis: {
    host: "127.0.0.1",
    port: 6379
  },
  defaultJobOptions: {
    // ========================================
    // RETRY CONFIGURATION (Problem 1 Fix)
    // ========================================
    attempts: 3,  // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',  // Wait longer between retries
      delay: 5000,  // Start with 5s delay, then 10s, then 20s
    },
    removeOnComplete: 100,  // Keep last 100 completed jobs for debugging
    removeOnFail: false,  // ✅ NEVER remove failed jobs (keep for manual retry)
    
    // ========================================
    // TIMEOUT CONFIGURATION
    // ========================================
    timeout: 300000,  // 5 minute timeout (LLM can be slow)
  },
  settings: {
    // Lock jobs for 6 minutes (longer than timeout)
    lockDuration: 360000,
    
    // Check for stalled jobs every minute
    stalledInterval: 60000,
    
    // Max stalled check count before giving up
    maxStalledCount: 2,
  }
});

export {docQueue};