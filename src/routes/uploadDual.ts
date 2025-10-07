import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import { StyleExtractor } from '../services/styleExtractor';
const pdfParse = require('pdf-parse');

const router = Router();

// Configure multer for handling dual file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit per file
  }
});

// Store uploaded documents and extracted styles temporarily
export const documentStore: Map<string, {
  referenceDoc: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    extractedText?: string;
    styleAttributes?: any;
  };
  targetDoc: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    extractedText?: string;
  };
  timestamp: number;
}> = new Map();

// Clean up old documents after 30 minutes
setInterval(() => {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;

  for (const [key, value] of documentStore.entries()) {
    if (now - value.timestamp > thirtyMinutes) {
      documentStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

/**
 * Upload both reference (style guide) and target documents
 */
router.post('/upload-dual', upload.fields([
  { name: 'referenceDocument', maxCount: 1 },
  { name: 'targetDocument', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    const files = req.files as {
      referenceDocument?: Express.Multer.File[];
      targetDocument?: Express.Multer.File[]
    };

    if (!files.referenceDocument || !files.targetDocument) {
      return res.status(400).json({
        error: 'Both reference and target documents are required'
      });
    }

    const referenceFile = files.referenceDocument[0];
    const targetFile = files.targetDocument[0];

    console.log(`📁 Received dual upload:`);
    console.log(`   Reference: ${referenceFile.originalname} (${referenceFile.size} bytes)`);
    console.log(`   Target: ${targetFile.originalname} (${targetFile.size} bytes)`);

    // Generate session ID
    const sessionId = uuidv4();

    // Extract text from both documents
    const [referenceText, targetText] = await Promise.all([
      extractText(referenceFile.buffer, referenceFile.mimetype),
      extractText(targetFile.buffer, targetFile.mimetype)
    ]);

    // Extract style attributes from reference document
    const styleExtractor = new StyleExtractor();
    const styleResult = await styleExtractor.extractStyles(
      referenceFile.buffer,
      referenceFile.mimetype,
      referenceFile.originalname
    );

    // Store documents and styles
    documentStore.set(sessionId, {
      referenceDoc: {
        buffer: referenceFile.buffer,
        mimeType: referenceFile.mimetype,
        fileName: referenceFile.originalname,
        extractedText: referenceText,
        styleAttributes: styleResult
      },
      targetDoc: {
        buffer: targetFile.buffer,
        mimeType: targetFile.mimetype,
        fileName: targetFile.originalname,
        extractedText: targetText
      },
      timestamp: Date.now()
    });

    // Return session info and extracted styles
    res.json({
      sessionId,
      reference: {
        fileName: referenceFile.originalname,
        fileSize: referenceFile.size,
        mimeType: referenceFile.mimetype,
        wordCount: referenceText.split(/\s+/).length
      },
      target: {
        fileName: targetFile.originalname,
        fileSize: targetFile.size,
        mimeType: targetFile.mimetype,
        wordCount: targetText.split(/\s+/).length,
        extractedText: targetText
      },
      styleExtraction: {
        success: styleResult.success,
        confidence: styleResult.confidence,
        documentType: styleResult.documentType,
        warnings: styleResult.warnings,
        simplifiedStyles: styleResult.simplified,
        rawDocxStyles: styleResult.rawDocxStyles
      }
    });

  } catch (error) {
    console.error('Dual upload error:', error);
    res.status(500).json({
      error: 'Failed to process documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get uploaded documents and styles by session ID
 */
router.get('/session/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = documentStore.get(sessionId);

  if (!session) {
    return res.status(404).json({
      error: 'Session not found or expired'
    });
  }

  res.json({
    sessionId,
    reference: {
      fileName: session.referenceDoc.fileName,
      mimeType: session.referenceDoc.mimeType,
      hasText: !!session.referenceDoc.extractedText,
      hasStyles: !!session.referenceDoc.styleAttributes
    },
    target: {
      fileName: session.targetDoc.fileName,
      mimeType: session.targetDoc.mimeType,
      hasText: !!session.targetDoc.extractedText
    },
    styleAttributes: session.referenceDoc.styleAttributes
  });
});

/**
 * Apply extracted styles to target document
 */
router.post('/apply-styles', async (req: Request, res: Response) => {
  try {
    const { sessionId, customStyles } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required'
      });
    }

    const session = documentStore.get(sessionId);
    if (!session) {
      return res.status(404).json({
        error: 'Session not found or expired'
      });
    }

    // Get styles (either from extraction or custom)
    const stylesToApply = customStyles || session.referenceDoc.styleAttributes?.attributes;

    if (!stylesToApply) {
      return res.status(400).json({
        error: 'No styles available to apply'
      });
    }

    // Generate job ID for processing
    const jobId = uuidv4();

    // Store the text and styles for the format route to use
    (global as any)[`upload_${jobId}`] = {
      text: session.targetDoc.extractedText,
      styles: stylesToApply,
      fileName: session.targetDoc.fileName
    };

    res.json({
      success: true,
      jobId,
      sessionId,
      targetFileName: session.targetDoc.fileName,
      message: 'Ready to format with extracted styles'
    });

  } catch (error) {
    console.error('Apply styles error:', error);
    res.status(500).json({
      error: 'Failed to apply styles',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Extract text from document buffer
 */
async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    switch (mimeType) {
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const mammothResult = await mammoth.extractRawText({ buffer });
        return mammothResult.value;

      case 'application/pdf':
        const pdfData = await pdfParse(buffer);
        return pdfData.text;

      case 'text/plain':
        return buffer.toString('utf-8');

      case 'text/html':
        // Simple HTML text extraction
        const html = buffer.toString('utf-8');
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      default:
        // Try as plain text
        return buffer.toString('utf-8');
    }
  } catch (error) {
    console.error('Text extraction error:', error);
    throw new Error(`Failed to extract text from ${mimeType} file`);
  }
}

export default router;
