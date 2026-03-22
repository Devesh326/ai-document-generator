import express from 'express';
import { getCurrentUsage } from '../configs/redisConfig.js';
import { prisma } from '../models/prisma.js';

const router = express.Router();

// GET /usage/:installationId
router.get('/:installationId', async (req, res) => {
  try {
    const installationId = parseInt(req.params.installationId);
    
    const user = await prisma.user.findUnique({
      where: { installation_id: installationId }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const tier = (user as any).tier || 'free';
    const usage = await getCurrentUsage(installationId, tier);
    
    return res.json({
      tier,
      usage: {
        used: usage.used,
        limit: usage.limit,
        remaining: usage.remaining,
        percentUsed: Math.round((usage.used / usage.limit) * 100),
        resetDate: usage.resetDate,
      },
      totalGenerated: user.total_readme_generated,
    });
    
  } catch (error: any) {
    console.error('Error fetching usage:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;