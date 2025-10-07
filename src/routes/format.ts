import { Router, Request, Response, NextFunction } from 'express';
import { FORMATTING_STYLES, FormattingStyle, FormattedDocumentRepresentation } from '../types';
import { StyleExtractionResult } from '../types/styleAttributes';
import { formatDocument } from '../services/formatter';
import { chunkDocument } from '../utils/chunker';
import { progressTracker } from '../services/progressTracker';
import { conformityChecker } from '../services/conformityChecker';
import { DocumentAnalyzer } from '../services/documentAnalyzer';
import { IntelligentChunker } from '../services/intelligentChunker';
import { StructuredFormatter } from '../services/structuredFormatter';
import { HybridFormatter } from '../services/hybridFormatter';
import { documentStore } from './uploadDual';
import { registerCustomStyle, clearCustomStyle, getCustomStyle } from '../services/customStyleRegistry';

const router = Router();

interface FormatRequest {
  content: string;
  styleId: string;
  jobId: string;
  sessionId?: string;
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

    let style: FormattingStyle | undefined;
    let styleExtraction: StyleExtractionResult | undefined;

    // Check if this is a custom extracted style
    if (styleId === 'custom-extracted' && req.body.sessionId) {
      const sessionData = documentStore.get(req.body.sessionId);
      if (sessionData && sessionData.referenceDoc.styleAttributes) {
        const extracted = sessionData.referenceDoc.styleAttributes as StyleExtractionResult;
        // Create a temporary FormattingStyle object for processing
        style = buildCustomFormattingStyle(extracted, req.body.sessionId);
        registerCustomStyle(style.id, extracted);
        styleExtraction = extracted;
      }
    } else {
      style = FORMATTING_STYLES.find(s => s.id === styleId);
    }

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
    processDocument(jobId, content, style, styleExtraction);

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

async function processDocument(
  jobId: string,
  content: string,
  style: FormattingStyle,
  styleExtractionOverride?: StyleExtractionResult
) {
  try {
    const jobStart = Date.now();
    const debugInfo: any = {
      startTimestamp: new Date().toISOString(),
      styleId: style.id,
      mode: undefined,
      pipeline: [] as string[],
      timings: {} as Record<string, number>,
      fonts: {} as Record<string, any>,
      logs: [] as string[],
      validation: null as any
    };

    // Check if we should use hybrid approach (for large documents or after failures)
    const contentLength = content.length;
    const estimatedTokens = Math.ceil(contentLength / 4); // Rough estimate
    const shouldUseHybrid = contentLength > 50000 || estimatedTokens > 12000;
    const forceHybrid = style.id.startsWith('custom-extracted');
    const useHybrid = shouldUseHybrid || forceHybrid;

    debugInfo.mode = useHybrid ? 'hybrid' : 'openai-structured';
    debugInfo.pipeline.push(`Mode selected: ${debugInfo.mode} (forceHybrid=${forceHybrid})`);

    let formattedContent: string;
    let structure: any;
    let structuredRepresentation: FormattedDocumentRepresentation | null = null;
    let conformityResult: any = { isConformant: true, conformityScore: 100 };
    let styleValidation: any = null;
    let chunks: any[] = [];

    const effectiveExtraction = styleExtractionOverride
      || (style.id.startsWith('custom-extracted') ? getCustomStyle(style.id) : undefined);

    if (effectiveExtraction?.rawDocxStyles || effectiveExtraction?.simplified) {
      debugInfo.fonts.extracted = {
        bodyFont: effectiveExtraction.rawDocxStyles?.defaultFont || effectiveExtraction.simplified.font,
        bodyFontSize: effectiveExtraction.rawDocxStyles?.defaultFontSize || effectiveExtraction.simplified.fontSize,
        headingFont: effectiveExtraction.rawDocxStyles?.headingStyles?.Heading1?.font ||
          effectiveExtraction.simplified.headingStyles?.h1?.font,
        headingFontSize: effectiveExtraction.rawDocxStyles?.headingStyles?.Heading1?.fontSize ||
          effectiveExtraction.simplified.headingStyles?.h1?.fontSize
      };
    }

    if (useHybrid) {
      console.log('📚 Using hybrid approach for large document...');
      debugInfo.pipeline.push('Using hybrid formatter (local formatting + validation)');

      // Use new hybrid formatter that handles ANY size
      const hybridFormatter = new HybridFormatter();
      const hybridStart = Date.now();
      const result = await hybridFormatter.formatDocument(
        content,
        style,
        jobId,
        {
          useAIPolish: false, // Disable for now to save tokens
          polishSections: [],
          styleExtraction: effectiveExtraction || undefined
        }
      );
      debugInfo.timings.hybridTotalMs = Date.now() - hybridStart;

      formattedContent = result.formatted;
      structure = result.structure;
      structuredRepresentation = result.structuredRepresentation || null;
      styleValidation = result.styleValidation || null;

      if (result.debug) {
        debugInfo.timings = { ...debugInfo.timings, ...result.debug.timings };
        if (result.debug.notes?.length) {
          debugInfo.pipeline.push(...result.debug.notes);
        }
        if (result.debug.generalRules) {
          debugInfo.fonts.generalRules = result.debug.generalRules;
        }
      }

      // Validation is already done in hybrid formatter
      if (!result.validation.isValid) {
        console.warn(`⚠️ Content preservation below threshold for job ${jobId}`);
        debugInfo.pipeline.push('Validation flagged potential content loss');
      }
    } else {
      // Use original AI approach for smaller documents
      console.log('📄 Using AI approach for regular document...');
      debugInfo.pipeline.push('Using OpenAI formatter path');

      // Phase 1: Analyze document structure
      progressTracker.setAnalyzing(jobId);
      const analyzer = new DocumentAnalyzer();
      const analyzeStart = Date.now();
      structure = await analyzer.analyzeDocument(content);
      debugInfo.timings.structureDetectionMs = Date.now() - analyzeStart;
      debugInfo.pipeline.push(`Analyzer detected ${structure.elements.length} elements (document type: ${structure.documentType})`);
      console.log(`📊 Document analyzed: ${structure.elements.length} elements detected`);
      console.log(`   Document type: ${structure.documentType}`);
      console.log(`   Title: ${structure.title || 'Not detected'}`);

      // Phase 2: Intelligent structure-aware chunking
      progressTracker.setChunking(jobId);
      const chunker = new IntelligentChunker();
      let chunks;

      try {
        const chunkStart = Date.now();
        chunks = chunker.chunkByStructure(content, structure);
        debugInfo.timings.chunkingMs = Date.now() - chunkStart;
        debugInfo.pipeline.push(`Created ${chunks.length} structure-aware chunks`);
        console.log(`📦 Created ${chunks.length} structure-aware chunks`);
      } catch (chunkError) {
        console.warn('Structure-aware chunking failed, falling back to basic chunking:', chunkError);
        debugInfo.pipeline.push('Chunking failed, falling back to basic chunking');
        chunks = chunker.fallbackChunk(content);
      }

      // Phase 3: Format with structure awareness
      const formatStart = Date.now();
      const formatter = new StructuredFormatter();
      const formattedChunks = await formatter.formatWithStructure(chunks, style, structure, jobId);
      debugInfo.timings.openAiFormattingMs = Date.now() - formatStart;

      // Post-process formatting
      const processedChunks = formatter.postProcessFormatting(formattedChunks, structure);
      formattedContent = processedChunks.map(chunk => chunk.content).join('\n\n');

      // Build structured representation for frontend
      structuredRepresentation = formatter.buildStructuredRepresentation(
        processedChunks,
        structure,
        style.id
      );
      debugInfo.pipeline.push(`Built structured representation with ${structuredRepresentation.blocks.length} blocks`);

      // Phase 4: Conformity check
      progressTracker.setCheckingConformity(jobId);

      conformityResult = conformityChecker.checkConformity(content, formattedContent);
      console.log('✅ Conformity Check:', conformityChecker.generateReport(conformityResult));

      progressTracker.setConformityResult(jobId, conformityResult.isConformant, conformityResult.conformityScore);
      debugInfo.pipeline.push(`Conformity score: ${conformityResult.conformityScore}%`);

      // If not conformant, log warning but continue
      if (!conformityResult.isConformant) {
        console.warn(`⚠️ Content conformity check failed for job ${jobId}. Score: ${conformityResult.conformityScore}%`);
        console.warn(`Missing words: ${conformityResult.missingContent.join(', ')}`);
        debugInfo.pipeline.push('Conformity check reported missing content');
      }
    }

    // Phase 5: Finalize
    progressTracker.setFinalizing(jobId);

    if (structuredRepresentation?.generalDirectives) {
      debugInfo.fonts.applied = {
        defaultFont: structuredRepresentation.generalDirectives.defaultFont,
        defaultFontSize: structuredRepresentation.generalDirectives.defaultFontSize,
        defaultColor: structuredRepresentation.generalDirectives.defaultColor
      };
    }

    if (styleValidation) {
      debugInfo.validation = styleValidation;
    }

    debugInfo.timings.totalMs = Date.now() - jobStart;
    debugInfo.logs = progressTracker.getLogs(jobId);

    // Store result with conformity and structure info
    (global as any)[`job_${jobId}`] = {
      content: formattedContent,
      conformity: useHybrid ? { isConformant: true, conformityScore: 100 } : (conformityResult as any),
      structure: {
        documentType: structure.documentType,
        title: structure.title,
        elementCount: structure.elements.length,
        chunkCount: useHybrid ? 0 : (chunks as any)?.length || 0
      },
      structuredRepresentation,
      styleId: style.id,
      styleValidation: styleValidation || undefined,
      debug: debugInfo
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

  const responsePayload = {
    success: true,
    formattedContent: result.content || result,
    conformity: result.conformity,
    jobId,
    styleId: result.styleId,
    structuredRepresentation: result.structuredRepresentation,
    styleValidation: result.styleValidation,
    debug: result.debug
  };

  res.json(responsePayload);

  if (typeof result.styleId === 'string' && result.styleId.startsWith('custom-extracted')) {
    clearCustomStyle(result.styleId);
  }

  delete (global as any)[`job_${jobId}`];
});

function buildCustomFormattingStyle(
  extraction: StyleExtractionResult,
  sessionId?: string
): FormattingStyle {
  const simplified = extraction.simplified;
  const raw = extraction.rawDocxStyles;

  const fonts = Array.from(new Set(
    [raw?.defaultFont, simplified.font, ...(raw?.fonts || [])]
      .filter((font): font is string => typeof font === 'string' && font.trim().length > 0)
      .map(font => font.trim())
  ));

  const primaryFont = fonts[0] || 'Calibri';
  const fallbackFonts = fonts.slice(1);
  const bodyFontSize = raw?.defaultFontSize || simplified.fontSize || 12;
  const lineHeight = simplified.lineHeight || raw?.lineHeights?.[0];
  const paragraphBefore = raw?.paragraphSpacing?.before?.[0];
  const paragraphAfter = simplified.paragraphSpacing || raw?.paragraphSpacing?.after?.[0];
  const textColor = simplified.colors?.text || raw?.defaultColor || raw?.colors?.[0];
  const headingColor = simplified.colors?.heading || raw?.colors?.[0];
  const bulletSymbol = simplified.listStyle || '•';

  const combinedHeadingRules: Record<string, { font?: string; fontSize?: number; color?: string }> = {};

  const mergeHeading = (key: string, value: any) => {
    const normalized = normalizeHeadingKey(key);
    if (!combinedHeadingRules[normalized]) {
      combinedHeadingRules[normalized] = {};
    }
    if (value?.font) combinedHeadingRules[normalized].font = value.font;
    if (value?.fontSize) combinedHeadingRules[normalized].fontSize = value.fontSize;
    if (value?.color) combinedHeadingRules[normalized].color = value.color;
  };

  Object.entries(raw?.headingStyles || {}).forEach(([key, value]) => mergeHeading(key, value));
  Object.entries(simplified.headingStyles || {}).forEach(([key, value]) => mergeHeading(key, value));

  const headingLines = Object.entries(combinedHeadingRules).map(([level, rule]) => {
    const parts: string[] = [];
    if (rule.font) parts.push(`font ${rule.font}`);
    if (rule.fontSize) parts.push(`size ${formatNumber(rule.fontSize)}pt`);
    if (rule.color || headingColor) parts.push(`color ${rule.color || headingColor}`);
    return `${level.toUpperCase()}: ${parts.join(', ')}`;
  });

  const instructions: string[] = [];
  instructions.push(
    fallbackFonts.length
      ? `Body font must be ${primaryFont} with fallbacks ${fallbackFonts.join(', ')}.`
      : `Body font must be ${primaryFont}.`
  );
  instructions.push(`Body font size: ${formatNumber(bodyFontSize)}pt.`);
  if (lineHeight) {
    instructions.push(`Line spacing multiplier: ${formatNumber(lineHeight)}.`);
  }
  if (paragraphBefore || paragraphAfter) {
    const spacingParts = [
      paragraphBefore ? `${formatNumber(paragraphBefore)}pt before` : null,
      paragraphAfter ? `${formatNumber(paragraphAfter)}pt after` : null
    ].filter(Boolean);
    if (spacingParts.length) {
      instructions.push(`Paragraph spacing: ${spacingParts.join(', ')}.`);
    }
  }
  if (textColor) {
    instructions.push(`Body text color: ${textColor}.`);
  }
  if (headingLines.length) {
    instructions.push(`Heading styling:\n${headingLines.map(line => `  • ${line}`).join('\n')}`);
  } else if (headingColor) {
    instructions.push(`Use heading color ${headingColor}.`);
  }
  instructions.push(`Bullet symbol: ${bulletSymbol}. Preserve list indentation levels.`);

  const accentColors = (raw?.colors || []).filter(color => color !== textColor && color !== headingColor);
  if (accentColors.length) {
    instructions.push(`Accent colors available: ${accentColors.join(', ')}.`);
  }

  const basePrompt = `You are a meticulous document formatter. Your ONLY job is to apply formatting without altering the original words.`;
  const profile = `STYLE PROFILE (follow exactly):\n${instructions.map((line, idx) => `${idx + 1}. ${line}`).join('\n')}`;
  const rules = `ABSOLUTE RULES:\n- Preserve every word and its order\n- Do not invent fonts, colors, or sizes outside the style profile\n- Apply markdown that reflects the specified typography and spacing\n- Maintain the existing document hierarchy and list structure`;

  return {
    id: sessionId ? `custom-extracted-${sessionId}` : 'custom-extracted',
    name: 'Custom Extracted Style',
    description: 'Style learned from reference document formatting',
    systemPrompt: `${basePrompt}\n\n${profile}\n\n${rules}`
  };
}

function normalizeHeadingKey(key: string): string {
  const normalized = key.trim().toLowerCase();
  if (normalized === 'heading1' || normalized === 'heading 1') return 'h1';
  if (normalized === 'heading2' || normalized === 'heading 2') return 'h2';
  if (normalized === 'heading3' || normalized === 'heading 3') return 'h3';
  if (normalized.startsWith('h')) return normalized;
  return normalized;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(2)).toString().replace(/\.00$/, '') : `${value}`;
}

router.get('/styles', (req: Request, res: Response) => {
  const styles = FORMATTING_STYLES.map(({ id, name, description }) => ({
    id,
    name,
    description
  }));

  res.json({ styles });
});

export default router;
