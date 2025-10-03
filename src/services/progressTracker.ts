interface JobProgress {
  jobId: string;
  status: 'pending' | 'analyzing' | 'chunking' | 'formatting' | 'checking' | 'finalizing' | 'completed' | 'failed';
  progress: number;
  currentChunk?: number;
  totalChunks?: number;
  message?: string;
  error?: string;
  conformityScore?: number;
  isConformant?: boolean;
}

class ProgressTracker {
  private jobs: Map<string, JobProgress> = new Map();

  createJob(jobId: string): void {
    this.jobs.set(jobId, {
      jobId,
      status: 'pending',
      progress: 0,
      message: 'Initializing document processing'
    });
  }

  updateProgress(jobId: string, update: Partial<JobProgress>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.set(jobId, { ...job, ...update });
    }
  }

  getProgress(jobId: string): JobProgress | undefined {
    return this.jobs.get(jobId);
  }

  deleteJob(jobId: string): void {
    // Keep job for 5 minutes after completion for retrieval
    setTimeout(() => {
      this.jobs.delete(jobId);
    }, 5 * 60 * 1000);
  }

  setAnalyzing(jobId: string): void {
    this.updateProgress(jobId, {
      status: 'analyzing',
      progress: 10,
      message: 'Analyzing document structure'
    });
  }

  setChunking(jobId: string): void {
    this.updateProgress(jobId, {
      status: 'chunking',
      progress: 25,
      message: 'Creating structure-aware chunks'
    });
  }

  setFormatting(jobId: string, currentChunk: number, totalChunks: number): void {
    const baseProgress = 30;
    const progressPerChunk = 60 / totalChunks;
    const progress = Math.round(Math.min(baseProgress + (currentChunk * progressPerChunk), 90));

    this.updateProgress(jobId, {
      status: 'formatting',
      progress,
      currentChunk,
      totalChunks,
      message: `Formatting chunk ${currentChunk} of ${totalChunks}`
    });
  }

  setCheckingConformity(jobId: string): void {
    this.updateProgress(jobId, {
      status: 'checking',
      progress: 90,
      message: 'Checking content conformity'
    });
  }

  setConformityResult(jobId: string, isConformant: boolean, conformityScore: number): void {
    this.updateProgress(jobId, {
      status: 'checking',
      progress: 92,
      conformityScore,
      isConformant,
      message: `Conformity check: ${isConformant ? '✅ Passed' : '⚠️ Issues found'} (${conformityScore}% score)`
    });
  }

  setFinalizing(jobId: string): void {
    this.updateProgress(jobId, {
      status: 'finalizing',
      progress: 95,
      message: 'Finalizing document'
    });
  }

  setCompleted(jobId: string): void {
    this.updateProgress(jobId, {
      status: 'completed',
      progress: 100,
      message: 'Document formatting completed'
    });
    this.deleteJob(jobId);
  }

  setFailed(jobId: string, error: string): void {
    this.updateProgress(jobId, {
      status: 'failed',
      progress: 0,
      error,
      message: 'Processing failed'
    });
    this.deleteJob(jobId);
  }
}

export const progressTracker = new ProgressTracker();