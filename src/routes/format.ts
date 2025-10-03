import { Router, Request, Response, NextFunction } from 'express';
import { FORMATTING_STYLES, FormattingStyle } from '../types';
import { formatDocument } from '../services/formatter';
import { chunkDocument } from '../utils/chunker';
import { progressTracker } from '../services/progressTracker';
import { conformityChecker } from '../services/conformityChecker';
import { DocumentAnalyzer } from '../services/documentAnalyzer';
import { IntelligentChunker } from '../services/intelligentChunker';
import { StructuredFormatter } from '../services/structuredFormatter';

const router = Router();

interface FormatRequest {
  content: string;
  styleId: string;
  jobId: string;
}

interface FormatResponse {
  success: boolean;
  formattedContent?: string;
  jobId?: string;
  message?: string;
  progress?: number;
}

router.post('/', async (req: Request<{}, {}, FormatRequest>, res: Response<FormatResponse>, next: NextFunction) => {
  try {
    const { content, styleId, jobId } = req.body;

    if (!content || !styleId || !jobId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: content, styleId, or jobId'
      });
    }

    const style = FORMATTING_STYLES.find(s => s.id === styleId);
    if (!style) {
      return res.status(400).json({
        success: false,
        message: `Invalid style ID: ${styleId}`
      });
    }

    console.log(`Starting format job ${jobId} with style: ${style.name}`);

    // Create job and immediately return
    progressTracker.createJob(jobId);

    // Process asynchronously
    processDocument(jobId, content, style);

    res.json({
      success: true,
      jobId,
      message: 'Processing started',
      progress: 0
    });

  } catch (error) {
    next(error);
  }
});

async function processDocument(jobId: string, content: string, style: FormattingStyle) {
  try {
    // Phase 1: Analyze document structure
    progressTracker.setAnalyzing(jobId);
    const analyzer = new DocumentAnalyzer();
    const structure = await analyzer.analyzeDocument(content);
    console.log(`📊 Document analyzed: ${structure.elements.length} elements detected`);
    console.log(`   Document type: ${structure.documentType}`);
    console.log(`   Title: ${structure.title || 'Not detected'}`);

    await new Promise(resolve => setTimeout(resolve, 300));

    // Phase 2: Intelligent structure-aware chunking
    progressTracker.setChunking(jobId);
    const chunker = new IntelligentChunker();
    let chunks;

    try {
      chunks = chunker.chunkByStructure(content, structure);
      console.log(`📦 Created ${chunks.length} structure-aware chunks`);
    } catch (chunkError) {
      console.warn('Structure-aware chunking failed, falling back to basic chunking:', chunkError);
      chunks = chunker.fallbackChunk(content);
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    // Phase 3: Format with structure awareness
    const formatter = new StructuredFormatter();
    const formattedChunks = await formatter.formatWithStructure(chunks, style, structure, jobId);

    // Post-process formatting
    const processedChunks = formatter.postProcessFormatting(formattedChunks, structure);
    const formattedContent = processedChunks.map(chunk => chunk.content).join('\n\n');

    // Phase 4: Conformity check
    progressTracker.setCheckingConformity(jobId);
    await new Promise(resolve => setTimeout(resolve, 400));

    const conformityResult = conformityChecker.checkConformity(content, formattedContent);
    console.log('✅ Conformity Check:', conformityChecker.generateReport(conformityResult));

    progressTracker.setConformityResult(jobId, conformityResult.isConformant, conformityResult.conformityScore);
    await new Promise(resolve => setTimeout(resolve, 300));

    // If not conformant, log warning but continue
    if (!conformityResult.isConformant) {
      console.warn(`⚠️ Content conformity check failed for job ${jobId}. Score: ${conformityResult.conformityScore}%`);
      console.warn(`Missing words: ${conformityResult.missingContent.join(', ')}`);
    }

    // Phase 5: Finalize
    progressTracker.setFinalizing(jobId);
    await new Promise(resolve => setTimeout(resolve, 300));

    // Store result with conformity and structure info
    (global as any)[`job_${jobId}`] = {
      content: formattedContent,
      conformity: conformityResult,
      structure: {
        documentType: structure.documentType,
        title: structure.title,
        elementCount: structure.elements.length,
        chunkCount: chunks.length
      }
    };

    progressTracker.setCompleted(jobId);
  } catch (error) {
    console.error('Processing error:', error);
    progressTracker.setFailed(jobId, error instanceof Error ? error.message : 'Processing failed');
  }
}

router.get('/result/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const result = (global as any)[`job_${jobId}`];

  if (!result) {
    return res.status(404).json({
      error: 'Result not found or still processing'
    });
  }

  res.json({
    success: true,
    formattedContent: result.content || result, // Handle both old and new format
    conformity: result.conformity,
    jobId
  });

  // Clean up
  delete (global as any)[`job_${jobId}`];
});

router.get('/styles', (req: Request, res: Response) => {
  const styles = FORMATTING_STYLES.map(({ id, name, description }) => ({
    id,
    name,
    description
  }));

  res.json({ styles });
});

export default router;