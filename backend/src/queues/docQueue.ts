import Queue from "bull";
import dotenv from "dotenv";

dotenv.config();

// ============================================================================
// Redis Connection Configuration
// ============================================================================

const redisConfig = process.env.REDIS_URL
  ? // Production: Use REDIS_URL (Upstash)
    {
      redis: process.env.REDIS_URL,
      settings: {
        // Add TLS config for Upstash
        ...(process.env.REDIS_URL.includes("upstash") && {
          tls: {
            rejectUnauthorized: false,
          },
        }),
      },
    }
  : // Development: Use localhost
    {
      redis: {
        host: "127.0.0.1",
        port: 6379,
      },
    };

// ============================================================================
// Create Bull Queue
// ============================================================================

const docQueue = new Queue("doc-processing", {
  redis: {
    host: process.env.REDIS_URL || "127.0.0.1",
    port: 6379,
    password: process.env.REDIS_PASSWORD || "UPSTASH_REDIS_PASSWORD",
    tls: {}
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

// ============================================================================
// JOB DEDUPLICATION (Problem 2 Fix)
// ============================================================================

interface JobData {
  owner: string;
  repo: string;
  repoId: number;
  commitSha: string;
  commits: any[];
  installationId: number;
  changedFiles?: string[];
}

/**
 * Add job with deduplication logic
 * - If job for same repo exists and is <5min old, merge commits
 * - Otherwise, create new job
 */
export async function addReadmeJob(data: JobData): Promise<void> {
  const repoKey = `${data.owner}/${data.repo}`;
  
  // Check for existing jobs for this repo
  const waitingJobs = await docQueue.getWaiting();
  const activeJobs = await docQueue.getActive();
  const delayedJobs = await docQueue.getDelayed();
  
  const existingJobs = [...waitingJobs, ...activeJobs, ...delayedJobs];
  
  const repoJob = existingJobs.find(job => {
    const jobData = job.data as JobData;
    return `${jobData.owner}/${jobData.repo}` === repoKey;
  });
  
  if (repoJob) {
    // ========================================
    // Job exists - merge commits instead of creating new job
    // ========================================
    console.log(`🔄 Existing job found for ${repoKey}, merging commits`);
    
    const existingData = repoJob.data as JobData;
    
    // Merge commits (deduplicate by commit SHA)
    const existingCommitShas = new Set(existingData.commits.map((c: any) => c.id));
    const newCommits = data.commits.filter((c: any) => !existingCommitShas.has(c.id));
    
    const mergedCommits = [...existingData.commits, ...newCommits];
    
    // Merge changed files
    const existingFiles = new Set(existingData.changedFiles || []);
    const newFiles = data.changedFiles || [];
    newFiles.forEach(f => existingFiles.add(f));
    
    // Update job data
    await repoJob.update({
      ...existingData,
      commitSha: data.commitSha,  // Use latest commit SHA
      commits: mergedCommits,
      changedFiles: Array.from(existingFiles),
    });
    
    console.log(`✅ Merged ${newCommits.length} new commits into existing job`);
    console.log(`   Total commits in job: ${mergedCommits.length}`);
    
  } else {
    // ========================================
    // No existing job - create new one
    // ========================================
    console.log(`➕ Creating new job for ${repoKey}`);
    
    await docQueue.add(data, {
      jobId: `${repoKey}-${Date.now()}`,  // Unique job ID
      
      // Delay execution by 30 seconds to allow batching
      delay: 30000,
      
      // Priority (lower number = higher priority)
      priority: 1,
    });
    
    console.log(`✅ Job queued with 30s delay (allows batching)`);
  }
}

// ============================================================================
// MANUAL RETRY FOR FAILED JOBS
// ============================================================================

export async function retryFailedJobs(): Promise<number> {
  const failedJobs = await docQueue.getFailed();
  
  let retriedCount = 0;
  
  for (const job of failedJobs) {
    // Only retry if not already retried too many times
    if (job.attemptsMade < 3) {
      await job.retry();
      retriedCount++;
      console.log(`♻️  Retried job ${job.id}`);
    }
  }
  
  console.log(`♻️  Retried ${retriedCount} failed jobs`);
  return retriedCount;
}

// ============================================================================
// CLEAN UP OLD JOBS
// ============================================================================

export async function cleanOldJobs(): Promise<void> {
  // Remove completed jobs older than 7 days
  await docQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed');
  
  // Remove failed jobs older than 30 days (keep longer for debugging)
  await docQueue.clean(30 * 24 * 60 * 60 * 1000, 'failed');
  
  console.log('🧹 Cleaned old jobs');
}

// ============================================================================
// EVENTS - For monitoring
// ============================================================================

docQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
  console.error(`   Repo: ${job.data.owner}/${job.data.repo}`);
  console.error(`   Attempt: ${job.attemptsMade}/${job.opts.attempts}`);
});

docQueue.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
  console.log(`   Repo: ${job.data.owner}/${job.data.repo}`);
});

docQueue.on('stalled', (job) => {
  console.warn(`⚠️  Job ${job.id} stalled (might be stuck)`);
  console.warn(`   Repo: ${job.data.owner}/${job.data.repo}`);
});

export {docQueue};