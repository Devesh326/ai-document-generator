import express from 'express';
import { retryFailedJobs, cleanOldJobs, docQueue } from '../queues/docQueue.js';

const router = express.Router();

// ========================================
// GET /admin/queue/stats
// ========================================
router.get('/queue/stats', async (req, res) => {
  const waiting = await docQueue.getWaitingCount();
  const active = await docQueue.getActiveCount();
  const completed = await docQueue.getCompletedCount();
  const failed = await docQueue.getFailedCount();
  const delayed = await docQueue.getDelayedCount();
  
  res.json({
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  });
});

// ========================================
// POST /admin/queue/retry-failed
// ========================================
router.post('/queue/retry-failed', async (req, res) => {
  const retriedCount = await retryFailedJobs();
  res.json({ retriedCount, message: `Retried ${retriedCount} failed jobs` });
});

// ========================================
// POST /admin/queue/clean
// ========================================
router.post('/queue/clean', async (req, res) => {
  await cleanOldJobs();
  res.json({ message: 'Old jobs cleaned' });
});

// ========================================
// GET /admin/queue/failed
// ========================================
router.get('/queue/failed', async (req, res) => {
  const failedJobs = await docQueue.getFailed();
  
  const jobs = failedJobs.map(job => ({
    id: job.id,
    repo: `${job.data.owner}/${job.data.repo}`,
    commitSha: job.data.commitSha.substring(0, 7),
    failedAt: job.finishedOn,
    error: job.failedReason,
    attempts: job.attemptsMade,
    canRetry: job.attemptsMade < 3
  }));
  
  res.json({ count: jobs.length, jobs });
});

export default router;