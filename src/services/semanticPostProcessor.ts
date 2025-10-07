import { FormattedDocumentRepresentation, FormattedBlock } from '../types';
import { StyleExtractionResult } from '../types/styleAttributes';
import { parseTableFromText } from '../utils/tableUtils';

interface CorrectionResult {
  corrected: FormattedBlock;
  corrections: string[];
}

export class SemanticPostProcessor {
  private static readonly VERSION = 'semantic-post@1.0';

  applyCorrections(
    document: FormattedDocumentRepresentation,
    extraction: StyleExtractionResult | null
  ): FormattedDocumentRepresentation {
    if (!document?.blocks?.length) {
      return document;
    }

    const corrections: string[] = [];
    const correctedBlocks = document.blocks.map(block => {
      const result = this.correctBlock(block, extraction);
      if (result.corrections.length) {
        corrections.push(...result.corrections.map(c => `${block.id}: ${c}`));
      }
      return result.corrected;
    });

    const summary = document.semanticSummary?.summary || this.createEmptySummary();
    correctedBlocks.forEach(block => {
      this.bumpSummary(summary, block.type);
    });

    return {
      ...document,
      blocks: correctedBlocks,
      semanticSummary: {
        ...(document.semanticSummary || {
          detectorVersion: 'local-structure-detector@1.0',
          templateVersion: 'style-template@v3',
          generatedAt: new Date().toISOString(),
          sourceStyleId: document.styleId,
          summary
        }),
        notes: corrections.length ? corrections.slice(0, 20) : document.semanticSummary?.notes || []
      }
    };
  }

  private correctBlock(
    block: FormattedBlock,
    extraction: StyleExtractionResult | null
  ): CorrectionResult {
    const corrections: string[] = [];
    const insight = block.insights;

    if (!insight) {
      return { corrected: block, corrections };
    }

    const corrected = { ...block } as FormattedBlock;

    if (this.shouldPromoteToHeading(block, extraction)) {
      corrections.push('Promoted paragraph to heading based on semantic signals.');
      corrected.type = this.deriveHeadingLevel(block);
      corrected.insights = {
        ...corrected.insights,
        role: this.mapRole(corrected.type),
        source: 'override',
        confidence: 0.9
      };
    }

    if (this.shouldEnsureBold(corrected)) {
      corrections.push('Applied bold emphasis for heading.');
      corrected.runs = (corrected.runs || []).map(run => ({
        ...run,
        bold: true
      }));
      if (corrected.insights) {
        corrected.insights.typography = {
          ...(corrected.insights.typography || {}),
          weight: 'bold'
        } as any;
        corrected.insights.source = 'override';
        corrected.insights.confidence = corrected.insights.confidence || 0.85;
      }
    }

    if (this.shouldNormalizeList(corrected)) {
      corrections.push('Normalized list indentation/markers.');
      corrected.listItems = corrected.listItems?.map(items =>
        items.map(run => ({ ...run, text: (run.text || '').trim() }))
      );
    }

    const parsedTable = this.parseTable(corrected);
    if (parsedTable) {
      corrections.push('Parsed table structure from heuristics.');
      corrected.type = 'table';
      corrected.tableData = parsedTable;
      corrected.insights = {
        ...corrected.insights,
        role: 'table',
        confidence: Math.max(corrected.insights?.confidence || 0.5, 0.85),
        source: 'override'
      };
    }

    return { corrected, corrections };
  }

  private shouldPromoteToHeading(block: FormattedBlock, extraction: StyleExtractionResult | null): boolean {
    if (block.type !== 'paragraph') return false;
    const text = block.runs?.map(r => r.text).join(' ').trim() || block.metadata?.rawContent || '';
    if (!text) return false;
    const maxLength = 120;
    const isShort = text.length < maxLength && text.split(/\s+/).length <= 12;
    const startsWithCapital = /^[A-Z0-9"\(\[]/.test(text);
    const hasColon = text.includes(':');
    const keywords = ['overview', 'summary', 'objective', 'context'];
    const matchedKeyword = keywords.some(keyword => text.toLowerCase().includes(keyword));
    const extractedFont = extraction?.rawDocxStyles?.headingStyles?.Heading2?.font;
    const blockFont = block.typography?.font;
    const fontMatches = extractedFont && blockFont && extractedFont.toLowerCase() === blockFont.toLowerCase();
    return isShort && startsWithCapital && (hasColon || matchedKeyword || fontMatches);
  }

  private deriveHeadingLevel(block: FormattedBlock): FormattedBlock['type'] {
    const text = block.runs?.map(r => r.text).join(' ').toLowerCase() || '';
    if (text.includes('overview') || text.includes('summary')) return 'section';
    if (text.includes('objective') || text.includes('context')) return 'section';
    return 'subsection';
  }

  private shouldEnsureBold(block: FormattedBlock): boolean {
    const headingTypes: FormattedBlock['type'][] = ['title', 'chapter', 'section', 'subsection'];
    if (!headingTypes.includes(block.type)) return false;
    return (block.runs || []).some(run => !run.bold);
  }

  private shouldNormalizeList(block: FormattedBlock): boolean {
    if (block.type !== 'bulletList' && block.type !== 'numberedList') {
      return false;
    }
    return Boolean(block.listItems?.length);
  }

  private mapRole(type: FormattedBlock['type']): any {
    switch (type) {
      case 'title':
        return 'document-title';
      case 'chapter':
        return 'chapter-heading';
      case 'section':
        return 'section-heading';
      case 'subsection':
        return 'subsection-heading';
      case 'bulletList':
      case 'numberedList':
        return 'list-item';
      case 'table':
        return 'table';
      default:
        return 'paragraph';
    }
  }

  private parseTable(block: FormattedBlock): { headers: string[]; rows: string[][] } | null {
    const candidates: string[] = [];
    if (block.metadata?.rawContent) {
      candidates.push(block.metadata.rawContent as string);
    }
    if (block.runs?.length) {
      candidates.push(block.runs.map(run => run.text).join('\n'));
    }

    const candidate = candidates.find(Boolean);
    if (!candidate) {
      return null;
    }

    return parseTableFromText(candidate);
  }

  private bumpSummary(summary: any, type: FormattedBlock['type']) {
    switch (type) {
      case 'title':
        summary.titles += 1;
        break;
      case 'chapter':
      case 'section':
      case 'subsection':
        summary.headings += 1;
        break;
      case 'paragraph':
        summary.paragraphs += 1;
        break;
      case 'bulletList':
      case 'numberedList':
        summary.lists += 1;
        break;
      case 'table':
        summary.tables += 1;
        break;
      default:
        summary.other += 1;
    }
  }

  private createEmptySummary() {
    return {
      titles: 0,
      headings: 0,
      paragraphs: 0,
      lists: 0,
      tables: 0,
      other: 0
    };
  }
}
