import { Router, Request, Response } from 'express';
import { progressTracker } from '../services/progressTracker';

const router = Router();

router.get('/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const progress = progressTracker.getProgress(jobId);

  if (!progress) {
    return res.status(404).json({
      error: 'Job not found'
    });
  }

  res.json(progress);
});

router.get('/:jobId/logs', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const logs = progressTracker.getLogs(jobId);

  if (!logs) {
    return res.status(404).json({
      error: 'Job not found'
    });
  }

  res.json({ logs });
});

export default router;