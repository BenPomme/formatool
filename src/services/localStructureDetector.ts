import { DocumentElement, DocumentStructure, ElementType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { SemanticInsight, SemanticRole } from '../types';

/**
 * Local structure detection without AI - handles documents of ANY size
 * Uses heuristics and patterns to identify document elements
 */
export class LocalStructureDetector {

  /**
   * Detect document structure using local heuristics
   * No token limits - works with documents of any size
   */
  detectStructure(content: string): DocumentStructure {
    console.log('📝 Detecting structure locally (no AI needed)...');
    const lines = content.split('\n');
    const elements: DocumentElement[] = [];
    let currentPosition = 0;
    let currentBuffer: string[] = [];
    let bufferStart = 0;

    const flushParagraphBuffer = () => {
      if (!currentBuffer.length || !currentBuffer.some(l => l.trim())) {
        currentBuffer = [];
        return;
      }
      const paragraphContent = currentBuffer.join(' ').trim();
      if (!paragraphContent) {
        currentBuffer = [];
        return;
      }
      const paragraph: DocumentElement = {
        id: uuidv4(),
        type: 'paragraph',
        content: paragraphContent,
        position: {
          start: bufferStart,
          end: currentPosition
        },
        metadata: {
          insight: this.buildInsight({
            id: '',
            type: 'paragraph',
            content: paragraphContent,
            position: { start: bufferStart, end: currentPosition }
          })
        }
      };
      elements.push(paragraph);
      currentBuffer = [];
    };

    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();
      const lineLength = line.length + 1; // +1 for newline
      let elementType = this.detectElementType(line, trimmed, index, lines);

      if (elementType === 'table') {
        const tableData = this.collectTable(lines, index);
        if (!tableData.content.trim()) {
          elementType = 'content';
        } else {
          flushParagraphBuffer();
          const tableContent = tableData.content.trim();
          if (tableContent) {
            const tableElement = this.createElement(
              'table',
              tableContent,
              currentPosition,
              currentPosition + tableData.totalLength,
              tableContent
            );
            if (tableElement) {
              elements.push({
                ...tableElement,
                metadata: {
                  ...tableElement.metadata,
                  insight: this.buildInsight(tableElement)
                }
              });
            }
          }
          currentPosition += tableData.totalLength;
          bufferStart = currentPosition;
          index = tableData.endIndex + 1;
          continue;
        }
      }

      let resetBufferStart = false;

      if (elementType !== 'content' || trimmed === '') {
        flushParagraphBuffer();

        if (elementType !== 'content' && trimmed !== '') {
          const element = this.createElement(
            elementType,
            trimmed,
            currentPosition,
            currentPosition + lineLength,
            line
          );
          if (element) {
            elements.push({
              ...element,
              metadata: {
                ...element.metadata,
                insight: this.buildInsight(element)
              }
            });
          }
        }

        if (trimmed === '') {
          resetBufferStart = true;
        }
      } else {
        if (currentBuffer.length === 0) {
          bufferStart = currentPosition;
        }
        currentBuffer.push(trimmed);
      }

      currentPosition += lineLength;
      if (resetBufferStart) {
        bufferStart = currentPosition;
      }
      index += 1;
    }

    // Flush final buffer
    flushParagraphBuffer();

    // Build hierarchy
    const hierarchy = this.buildHierarchy(elements);

    // Detect document type
    const documentType = this.detectDocumentType(elements, content);

    // Extract title
    const title = this.extractTitle(elements);

    // Generate metadata
    const metadata = this.generateMetadata(elements, content);

    console.log(`✅ Structure detected: ${elements.length} elements found`);

    return {
      title,
      documentType,
      elements,
      hierarchy,
      metadata
    };
  }

  private detectElementType(
    line: string,
    trimmed: string,
    index: number,
    lines: string[]
  ): ElementType | 'content' {
    // Flattened table detection (tabs or multi-column spacing)
    if (this.isPotentialTableLine(line, lines[index - 1], lines[index + 1])) {
      return 'table';
    }

    // Title detection (first non-empty line or all caps)
    if (index < 5 && trimmed && trimmed === trimmed.toUpperCase() && trimmed.length > 5) {
      return 'title';
    }

    // Markdown headers
    if (trimmed.match(/^#{1,6}\s+/)) {
      const level = (trimmed.match(/^(#{1,6})/)?.[1].length || 1);
      return level === 1 ? 'title' :
             level === 2 ? 'chapter' :
             level === 3 ? 'section' : 'subsection';
    }

    // Chapter detection
    if (trimmed.match(/^(Chapter|CHAPTER|Capítulo|CAPÍTULO)\s+\d+/i)) {
      return 'chapter';
    }

    // Section detection
    if (trimmed.match(/^(Section|SECTION|Sección|SECCIÓN)\s+[\d\.]+/i)) {
      return 'section';
    }

    // Numbered headings (1., 1.1, 1.1.1, etc.)
    if (trimmed.match(/^\d+\.\s+[A-Z]/)) {
      return 'section';
    }
    if (trimmed.match(/^\d+\.\d+\.\s+/)) {
      return 'subsection';
    }

    // Roman numerals
    if (trimmed.match(/^[IVXLCDM]+\.\s+/)) {
      return 'chapter';
    }

    // Bullet lists
    if (trimmed.match(/^[\*\-•·◦▪▫◾◽○●]\s+/)) {
      return 'bulletList';
    }

    // Numbered lists
    if (trimmed.match(/^\d+[\.\)]\s+/)) {
      return 'numberedList';
    }

    // Letter lists
    if (trimmed.match(/^[a-zA-Z][\.\)]\s+/)) {
      return 'numberedList';
    }

    // Code blocks
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      return 'codeBlock';
    }

    // Table of contents
    if (trimmed.match(/^(Table of Contents|TABLE OF CONTENTS|Contents|CONTENTS|Índice|ÍNDICE)/i)) {
      return 'tableOfContents';
    }

    // Footnote
    if (trimmed.match(/^\[\d+\]/) || trimmed.match(/^\d+\./)) {
      // Check if it looks like a footnote (short, at end of document)
      if (index > lines.length * 0.8 && trimmed.length < 200) {
        return 'footnote';
      }
    }

    // Check for heading-like patterns (short, possibly all caps, followed by content)
    if (trimmed.length < 100 && trimmed.length > 3) {
      const nextLine = lines[index + 1]?.trim() || '';
      const prevLine = lines[index - 1]?.trim() || '';

      // Surrounded by empty lines and followed by content
      if (!prevLine && nextLine && !this.isStructuralLine(nextLine)) {
        // All caps heading
        if (trimmed === trimmed.toUpperCase() && !trimmed.match(/^\d/)) {
          return 'section';
        }
        // Title case heading
        if (this.isTitleCase(trimmed)) {
          return 'section';
        }
      }
    }

    return 'content';
  }

  private collectTable(
    lines: string[],
    startIndex: number
  ): { content: string; endIndex: number; totalLength: number } {
    const rows: string[] = [];
    let index = startIndex;
    let totalLength = 0;
    let lastRowIndex = -1;

    while (index < lines.length) {
      const rawLine = lines[index];
      const trimmedLine = rawLine.trim();

      if (!trimmedLine) {
        break;
      }

      if (!this.looksLikeTableRow(trimmedLine)) {
        if (rows.length === 0) {
          break;
        }
        // Treat as continuation of previous row
        rows[lastRowIndex] = `${rows[lastRowIndex]}\n${trimmedLine}`.trim();
        totalLength += rawLine.length + 1;
        index++;
        continue;
      }

      rows.push(trimmedLine);
      lastRowIndex = rows.length - 1;
      totalLength += rawLine.length + 1;
      index++;
    }

    if (!rows.length) {
      const fallbackLength = lines[startIndex]?.length
        ? lines[startIndex].length + 1
        : 0;
      return {
        content: '',
        endIndex: startIndex,
        totalLength: fallbackLength
      };
    }

    return {
      content: rows.join('\n'),
      endIndex: index - 1,
      totalLength
    };
  }

  private isPotentialTableLine(
    line: string,
    previousLine?: string,
    nextLine?: string
  ): boolean {
    if (!line || !line.trim()) return false;

    if (line.includes('|') && /\|.*\|/.test(line)) {
      return true;
    }

    const tabColumns = this.countTableColumns(line, /\t+/g);
    if (tabColumns >= 3) {
      return true;
    }
    if (tabColumns >= 2) {
      const prevTabs = previousLine ? this.countTableColumns(previousLine, /\t+/g) : 0;
      const nextTabs = nextLine ? this.countTableColumns(nextLine, /\t+/g) : 0;
      if (prevTabs >= 2 || nextTabs >= 2) {
        return true;
      }
    }

    const spaceColumns = this.countTableColumns(line, /\s{3,}/g);
    if (spaceColumns >= 3) {
      return true;
    }
    if (spaceColumns >= 2) {
      const prevSpaces = previousLine ? this.countTableColumns(previousLine, /\s{3,}/g) : 0;
      const nextSpaces = nextLine ? this.countTableColumns(nextLine, /\s{3,}/g) : 0;
      if (prevSpaces >= 2 || nextSpaces >= 2) {
        return true;
      }
    }

    return false;
  }

  private looksLikeTableRow(line: string): boolean {
    if (!line) return false;
    if (line.includes('|') && /\|.*\|/.test(line)) {
      return true;
    }
    if (this.countTableColumns(line, /\t+/g) >= 2) {
      return true;
    }
    if (this.countTableColumns(line, /\s{3,}/g) >= 2) {
      return true;
    }
    return false;
  }

  private countTableColumns(line: string, separator: RegExp): number {
    return line
      .split(separator)
      .map(part => part.trim())
      .filter(part => part.length > 0).length;
  }

  private buildInsight(element: DocumentElement): SemanticInsight {
    const role = this.mapRole(element.type, element.content);
    const confidence = this.estimateConfidence(element.type, element.content);
    return {
      role,
      confidence,
      source: 'detector',
      contentSignals: this.extractSignals(element.type, element.content)
    };
  }

  private mapRole(type: ElementType, content: string): SemanticRole {
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
      case 'codeBlock':
        return 'code';
      case 'footnote':
        return 'footnote';
      case 'imageCaption':
        return 'figure-caption';
      case 'header':
        return 'header';
      case 'footer':
        return 'footer';
      default:
        if (/table\s+\d+/i.test(content)) return 'table';
        return 'paragraph';
    }
  }

  private estimateConfidence(type: ElementType, content: string): number {
    if (type === 'title') return 0.95;
    if (type === 'chapter' || type === 'section') return 0.9;
    if (type === 'bulletList' || type === 'numberedList') return 0.85;
    if (type === 'paragraph') {
      return content.length > 100 ? 0.8 : 0.6;
    }
    return 0.7;
  }

  private extractSignals(type: ElementType, content: string): string[] {
    const signals: string[] = [];
    if (type === 'title' && content === content.toUpperCase()) {
      signals.push('upper-case');
    }
    if (type === 'bulletList' && /^[\-*•]/.test(content.trim())) {
      signals.push('bullet-prefix');
    }
    if (type === 'numberedList' && /^\d+/.test(content.trim())) {
      signals.push('numbered-prefix');
    }
    if (content.includes(':')) {
      signals.push('contains-colon');
    }
    return signals;
  }

  private isStructuralLine(line: string): boolean {
    return !!(
      line.match(/^#{1,6}\s+/) ||
      line.match(/^(Chapter|Section|CHAPTER|SECTION)/i) ||
      line.match(/^\d+\.\s+/) ||
      line.match(/^[\*\-•]\s+/) ||
      line.includes('|') ||
      /\t/.test(line) ||
      /\s{3,}/.test(line)
    );
  }

  private isTitleCase(text: string): boolean {
    const words = text.split(/\s+/);
    if (words.length < 2 || words.length > 15) return false;

    const titleCaseWords = words.filter(word => {
      if (word.length <= 3) return true; // Allow short words
      return word[0] === word[0].toUpperCase();
    });

    return titleCaseWords.length / words.length > 0.7;
  }

  private createElement(
    type: ElementType,
    content: string,
    start: number,
    end: number,
    originalLine: string
  ): DocumentElement | null {
    // Clean content based on type
    let cleanContent = content;
    let level: number | undefined;

    switch (type) {
      case 'title':
      case 'chapter':
      case 'section':
      case 'subsection':
        // Remove markdown headers
        cleanContent = content.replace(/^#{1,6}\s*/, '');
        // Remove numbering
        cleanContent = cleanContent.replace(/^\d+(\.\d+)*\s*/, '');
        cleanContent = cleanContent.replace(/^[IVXLCDM]+\.\s*/, '');
        cleanContent = cleanContent.replace(/^(Chapter|CHAPTER|Section|SECTION)\s+\d+:?\s*/i, '');

        // Determine level
        if (type === 'title') level = 1;
        else if (type === 'chapter') level = 2;
        else if (type === 'section') level = 3;
        else if (type === 'subsection') level = 4;
        break;

      case 'bulletList':
      case 'numberedList':
        // Keep original for lists (will be processed later)
        cleanContent = originalLine;
        break;
    }

    return {
      id: uuidv4(),
      type,
      content: cleanContent,
      level,
      position: { start, end }
    };
  }

  private buildHierarchy(elements: DocumentElement[]): Record<string, { children: string[] }> {
    const hierarchy: Record<string, { children: string[] }> = {};
    let currentParent: string | null = null;
    let currentLevel = 0;
    const levelStack: { id: string; level: number }[] = [];

    elements.forEach(element => {
      hierarchy[element.id] = { children: [] };

      const elementLevel = this.getElementLevel(element);

      if (elementLevel > 0) {
        // Pop stack until we find appropriate parent
        while (levelStack.length > 0 && levelStack[levelStack.length - 1].level >= elementLevel) {
          levelStack.pop();
        }

        // Set parent if exists
        if (levelStack.length > 0) {
          const parent = levelStack[levelStack.length - 1];
          hierarchy[parent.id].children.push(element.id);
          element.parentId = parent.id;
        }

        // Push current element to stack
        levelStack.push({ id: element.id, level: elementLevel });
        currentParent = element.id;
        currentLevel = elementLevel;
      } else if (currentParent) {
        // Regular content belongs to current parent
        hierarchy[currentParent].children.push(element.id);
        element.parentId = currentParent;
      }
    });

    return hierarchy;
  }

  private getElementLevel(element: DocumentElement): number {
    if (element.type === 'title') return 1;
    if (element.type === 'chapter') return 2;
    if (element.type === 'section') return 3;
    if (element.type === 'subsection') return 4;
    return 0;
  }

  private detectDocumentType(
    elements: DocumentElement[],
    content: string
  ): 'report' | 'book' | 'article' | 'memo' | 'manual' | 'proposal' | 'paper' {
    const contentLower = content.toLowerCase();

    // Memo detection
    if (contentLower.includes('memorandum') ||
        (contentLower.includes('to:') && contentLower.includes('from:') && contentLower.includes('subject:'))) {
      return 'memo';
    }

    // Book detection
    if (elements.some(e => e.type === 'chapter' || e.content.match(/^chapter\s+\d+/i))) {
      return 'book';
    }

    // Academic paper detection
    if (contentLower.includes('abstract') && contentLower.includes('references')) {
      return 'paper';
    }

    // Proposal detection
    if (contentLower.includes('proposal') && contentLower.includes('budget')) {
      return 'proposal';
    }

    // Manual detection
    if (contentLower.includes('installation') || contentLower.includes('troubleshooting') ||
        contentLower.includes('user guide') || contentLower.includes('manual')) {
      return 'manual';
    }

    // Article detection
    if (elements.length < 50 && contentLower.includes('conclusion')) {
      return 'article';
    }

    // Default to report
    return 'report';
  }

  private extractTitle(elements: DocumentElement[]): string | undefined {
    // First try to find explicit title element
    const titleElement = elements.find(e => e.type === 'title');
    if (titleElement) return titleElement.content;

    // Look for first major heading
    const firstHeading = elements.find(e =>
      e.type === 'chapter' || e.type === 'section'
    );
    if (firstHeading) return firstHeading.content;

    // Use first short paragraph if at beginning
    const firstParagraph = elements.find(e =>
      e.type === 'paragraph' &&
      e.content.length < 100 &&
      e.position.start < 500
    );

    return firstParagraph?.content;
  }

  private generateMetadata(elements: DocumentElement[], content: string): any {
    const counts: Record<string, number> = {};
    elements.forEach(element => {
      counts[element.type] = (counts[element.type] || 0) + 1;
    });

    return {
      wordCount: content.trim().split(/\s+/).length,
      characterCount: content.length,
      hasTableOfContents: elements.some(e => e.type === 'tableOfContents'),
      hasTables: elements.some(e => e.type === 'table'),
      hasLists: elements.some(e => e.type === 'bulletList' || e.type === 'numberedList'),
      hasCodeBlocks: elements.some(e => e.type === 'codeBlock'),
      elementCounts: counts,
      totalElements: elements.length
    };
  }
}
