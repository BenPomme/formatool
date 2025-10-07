import { FormattedDocumentRepresentation, FormattedBlock } from '../types';
import { StyleExtractionResult } from '../types/styleAttributes';

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

    const lines = candidate
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length < 2) {
      return null;
    }

    let headerIndex = -1;
    let header: string[] | null = null;
    for (let i = 0; i < lines.length; i++) {
      const columns = this.splitColumns(lines[i]);
      if (columns && columns.length >= 2) {
        headerIndex = i;
        header = columns;
        break;
      }
    }

    if (headerIndex === -1 || !header || header.length < 2) {
      return null;
    }

    const expectedColumns = header.length;
    const dataLines = lines.slice(headerIndex + 1);

    const rows: string[][] = [];
    let pendingRow: string[] | null = null;

    const pushCompletedRow = (row: string[]) => {
      if (row.length !== expectedColumns) {
        return;
      }
      rows.push(
        row.map(cell => cell.replace(/\s+/g, ' ').trim())
      );
    };

    const appendContinuation = (target: string[] | null, textValue: string) => {
      if (!target || !target.length) {
        if (!rows.length) {
          return;
        }
        rows[rows.length - 1][rows[rows.length - 1].length - 1] =
          `${rows[rows.length - 1][rows[rows.length - 1].length - 1]} ${textValue}`.trim();
        return;
      }
      target[target.length - 1] = `${target[target.length - 1]} ${textValue}`.trim();
    };

    for (const rawLine of dataLines) {
      const cleanedLine = rawLine.replace(/^[-•\u2022]+\s*/, '').trim();
      if (!cleanedLine) {
        continue;
      }

      const columns = this.splitColumns(cleanedLine, expectedColumns);

      if (!columns || columns.length === 0) {
        appendContinuation(pendingRow, cleanedLine);
        continue;
      }

      if (columns.length >= expectedColumns) {
        const base = columns.slice(0, expectedColumns);
        if (columns.length > expectedColumns) {
          base[base.length - 1] = `${base[base.length - 1]} ${columns.slice(expectedColumns).join(' ')}`.trim();
        }
        pushCompletedRow(base);
        pendingRow = null;
        continue;
      }

      if (!pendingRow) {
        pendingRow = [...columns];
      } else {
        const remaining = expectedColumns - pendingRow.length;
        const toTake = Math.min(remaining, columns.length);
        for (let i = 0; i < toTake; i++) {
          pendingRow.push(columns[i]);
        }
        if (columns.length > toTake) {
          pendingRow[pendingRow.length - 1] =
            `${pendingRow[pendingRow.length - 1]} ${columns.slice(toTake).join(' ')}`.trim();
        }
      }

      if (pendingRow && pendingRow.length >= expectedColumns) {
        const completed = pendingRow.slice(0, expectedColumns);
        pushCompletedRow(completed);
        const overflow = pendingRow.slice(expectedColumns);
        if (overflow.length && rows.length) {
          rows[rows.length - 1][rows[rows.length - 1].length - 1] =
            `${rows[rows.length - 1][rows[rows.length - 1].length - 1]} ${overflow.join(' ')}`.trim();
        }
        pendingRow = null;
      }
    }

    if (pendingRow && pendingRow.length === expectedColumns) {
      pushCompletedRow(pendingRow);
    }

    if (!rows.length) {
      return null;
    }

    return { headers: header.map(cell => cell.replace(/\s+/g, ' ').trim()), rows };
  }

  private splitColumns(line: string, expected?: number): string[] | null {
    const separators = [
      /\t+/g,
      /\s{3,}/g,
      /\s{2,}/g
    ];
    for (const sep of separators) {
      const parts = line.split(sep).map(part => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        if (expected && parts.length > expected) {
          const head = parts.slice(0, expected - 1);
          const tail = parts.slice(expected - 1).join(' ');
          return [...head, tail.trim()];
        }
        return parts;
      }
    }
    return null;
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
