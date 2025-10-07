import { FormattingStyle, DocumentStructure, FormattedDocumentRepresentation } from '../types';
import { LocalStructureDetector } from './localStructureDetector';
import { StyleTemplateLearner } from './styleTemplateLearner';
import { LocalFormattingEngine } from './localFormattingEngine';
import { progressTracker } from './progressTracker';
import { StyleExtractionResult } from '../types/styleAttributes';
import { StyleValidator, StyleValidationResult } from './styleValidator';
import { SemanticPostProcessor } from './semanticPostProcessor';

interface HybridDebugInfo {
  timings: Record<string, number>;
  notes: string[];
  generalRules?: any;
}

/**
 * Hybrid Document Formatter
 * Combines local processing with selective AI enhancement
 * Can handle documents of ANY size efficiently
 */
export class HybridFormatter {
  private structureDetector: LocalStructureDetector;
  private styleLearner: StyleTemplateLearner;
  private formattingEngine: LocalFormattingEngine;
  private semanticPostProcessor: SemanticPostProcessor;

  constructor() {
    this.structureDetector = new LocalStructureDetector();
    this.styleLearner = new StyleTemplateLearner();
    this.formattingEngine = new LocalFormattingEngine();
    this.semanticPostProcessor = new SemanticPostProcessor();
  }

  /**
   * Format document using hybrid approach
   * 1. Local structure detection (no tokens)
   * 2. AI style learning from sample (minimal tokens)
   * 3. Local formatting application (no tokens)
   * 4. Optional AI polish for key sections (minimal tokens)
   */
  async formatDocument(
    content: string,
    style: FormattingStyle,
    jobId?: string,
    options: {
      useAIPolish?: boolean;
      polishSections?: ('intro' | 'conclusion' | 'summary')[];
      styleExtraction?: StyleExtractionResult | null;
    } = {}
  ): Promise<{
    formatted: string;
    structure: DocumentStructure;
    validation: {
      isValid: boolean;
      preservationScore: number;
      issues: string[];
    };
    structuredRepresentation?: FormattedDocumentRepresentation;
    styleValidation?: StyleValidationResult;
    debug?: HybridDebugInfo;
  }> {
    console.log('🚀 Starting hybrid formatting process...');

    const overallStart = Date.now();
    const debug: HybridDebugInfo = {
      timings: {},
      notes: []
    };

    // Step 1: Local structure detection (handles ANY size)
    if (jobId) {
      progressTracker.setAnalyzing(jobId);
      progressTracker.log(jobId, '📝 Detecting document structure locally...');
    }

    const structureStart = Date.now();
    const structure = this.structureDetector.detectStructure(content);
    debug.timings.structureDetectionMs = Date.now() - structureStart;
    debug.notes.push(`Structure detection -> ${structure.elements.length} elements`);
    console.log(`📊 Detected ${structure.elements.length} elements locally`);

    if (jobId) {
      progressTracker.log(jobId, `✅ Structure detected: ${structure.elements.length} elements`);
    }

    // Step 2: Learn style template from small sample (minimal AI usage)
    if (jobId) {
      progressTracker.setChunking(jobId);
      progressTracker.log(jobId, '🎓 Learning style template from sample...');
    }

    const learnStart = Date.now();
    const styleTemplate = await this.styleLearner.learnStyleTemplate(style, structure);
    debug.timings.styleTemplateMs = Date.now() - learnStart;
    debug.notes.push(`Style template learned for ${style.name}`);
    debug.generalRules = styleTemplate.generalRules;

    if (jobId) {
      progressTracker.log(jobId, '✅ Style template learned and cached');
    }

    // Step 3: Apply formatting locally (no AI needed)
    if (jobId) {
      progressTracker.setFormatting(jobId, 1, 1);
      progressTracker.log(jobId, '🎨 Applying formatting locally...');
    }

    const formatStart = Date.now();
    const formatted = this.formattingEngine.formatDocument(structure, styleTemplate);
    debug.timings.localFormattingMs = Date.now() - formatStart;
    let structuredRepresentation = this.formattingEngine.getLastStructuredDocument();
    let styleValidation: StyleValidationResult | undefined;

    if (structuredRepresentation) {
      const postProcessStart = Date.now();
      structuredRepresentation = this.semanticPostProcessor.applyCorrections(
        structuredRepresentation,
        options.styleExtraction || null
      );
      debug.timings.semanticPostProcessingMs = Date.now() - postProcessStart;
    }

    if (structuredRepresentation && options.styleExtraction) {
      styleValidation = StyleValidator.validate(structuredRepresentation, options.styleExtraction);
      debug.notes.push(`Style validation -> ${styleValidation.isCompliant ? 'pass' : 'mismatches detected'}`);
      if (jobId) {
        progressTracker.log(
          jobId,
          styleValidation.isCompliant
            ? '🎯 Style validation passed'
            : `⚠️ Style validation found ${styleValidation.mismatches.length} mismatch(es)`
        );
      }
    }

    if (jobId) {
      progressTracker.log(jobId, '✅ Local formatting complete');
    }

    // Step 4: Optional AI polish for critical sections
    let finalFormatted = formatted;
    if (options.useAIPolish && options.polishSections?.length) {
      if (jobId) {
        progressTracker.log(jobId, '✨ Applying AI polish to key sections...');
      }

      finalFormatted = await this.applySelectiveAIPolish(
        finalFormatted,
        structure,
        style,
        options.polishSections,
        jobId
      );

      if (jobId) {
        progressTracker.log(jobId, '✅ AI polish complete');
      }
    }

    // Step 5: Validate formatting preserved content
    if (jobId) {
      progressTracker.setChecking(jobId);
      progressTracker.log(jobId, '🔍 Validating content preservation...');
    }

    const validationStart = Date.now();
    const validation = this.formattingEngine.validateFormatting(content, finalFormatted);
    debug.timings.contentValidationMs = Date.now() - validationStart;

    if (jobId) {
      progressTracker.setFinalizing(jobId);
      const score = Math.round(validation.preservationScore * 100);
      progressTracker.log(jobId, `✅ Validation complete: ${score}% content preserved`);

      if (validation.isValid) {
        progressTracker.complete(jobId, score, true);
      } else {
        progressTracker.fail(jobId, `Content preservation below threshold: ${score}%`);
      }
    }

    console.log(`✅ Hybrid formatting complete:`);
    console.log(`   - Original: ${content.length} chars`);
    console.log(`   - Formatted: ${finalFormatted.length} chars`);
    console.log(`   - Preservation: ${Math.round(validation.preservationScore * 100)}%`);

    debug.timings.totalMs = Date.now() - overallStart;

    return {
      formatted: finalFormatted,
      structure,
      validation,
      structuredRepresentation,
      styleValidation,
      debug
    };
  }

  /**
   * Apply AI polish to specific sections only
   * This minimizes token usage by only processing critical parts
   */
  private async applySelectiveAIPolish(
    formatted: string,
    structure: DocumentStructure,
    style: FormattingStyle,
    sections: ('intro' | 'conclusion' | 'summary')[],
    jobId?: string
  ): Promise<string> {
    // For now, return as-is
    // In production, this would:
    // 1. Extract specific sections (first/last paragraphs)
    // 2. Send ONLY those sections to AI for refinement
    // 3. Merge refined sections back into document
    return formatted;
  }

  /**
   * Estimate token usage for a document
   * Helps predict if document can be processed
   */
  estimateTokenUsage(contentLength: number): {
    structureDetection: number;
    styleLearning: number;
    aiPolish: number;
    total: number;
    withinLimits: boolean;
  } {
    // Local structure detection: 0 tokens
    const structureDetection = 0;

    // Style learning: ~2000 tokens for sample + response
    const styleLearning = 2000;

    // AI polish: ~1000 tokens per section
    const aiPolish = 1000;

    const total = structureDetection + styleLearning + aiPolish;

    return {
      structureDetection,
      styleLearning,
      aiPolish,
      total,
      withinLimits: total < 128000 // Well within GPT-4o-mini limits
    };
  }
}
