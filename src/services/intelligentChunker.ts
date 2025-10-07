import { encoding_for_model } from '@dqbd/tiktoken';
import { DocumentElement, DocumentStructure, StructuredChunk } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { MAX_TOKENS_PER_REQUEST } from './openaiClient';

// Smaller chunks for faster processing
const MAX_TOKENS = MAX_TOKENS_PER_REQUEST;
const IDEAL_CHUNK_SIZE = Math.floor(MAX_TOKENS * 0.8); // 80% of max for safety
const MIN_CHUNK_SIZE = 600; // Allow smaller chunks for speed

let encoder: any;
try {
  encoder = encoding_for_model('gpt-4o' as any);
} catch {
  encoder = encoding_for_model('gpt-4');
}

export class IntelligentChunker {
  /**
   * Create chunks based on document structure, respecting element boundaries
   */
  chunkByStructure(
    content: string,
    structure: DocumentStructure
  ): StructuredChunk[] {
    console.log('📦 Creating structure-aware chunks...');

    const chunks: StructuredChunk[] = [];
    const elementsToChunk = [...structure.elements];

    let currentChunk: StructuredChunk | null = null;
    let currentTokenCount = 0;
    let chunkOrder = 0;

    // Group elements that should stay together
    const elementGroups = this.groupRelatedElements(elementsToChunk, structure.hierarchy);

    for (const group of elementGroups) {
      const groupContent = this.getGroupContent(group, content);
      const groupTokens = this.countTokens(groupContent);

      // If group is too large, try to split it intelligently
      if (groupTokens > MAX_TOKENS) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = null;
          currentTokenCount = 0;
        }

        // Split large group into smaller chunks
        const splitChunks = this.splitLargeGroup(group, content, chunkOrder);
        chunks.push(...splitChunks);
        chunkOrder += splitChunks.length;
        continue;
      }

      // If adding this group would exceed limit, start new chunk
      if (currentChunk && currentTokenCount + groupTokens > IDEAL_CHUNK_SIZE) {
        chunks.push(currentChunk);
        currentChunk = null;
        currentTokenCount = 0;
      }

      // Start new chunk if needed
      if (!currentChunk) {
        currentChunk = this.createNewChunk(chunkOrder++);
      }

      // Add group to current chunk
      this.addGroupToChunk(currentChunk, group, groupContent, groupTokens);
      currentTokenCount += groupTokens;

      // Check if we should finalize this chunk (good breaking point)
      if (this.isNaturalBreakpoint(group, structure) && currentTokenCount > MIN_CHUNK_SIZE) {
        chunks.push(currentChunk);
        currentChunk = null;
        currentTokenCount = 0;
      }
    }

    // Add final chunk if exists
    if (currentChunk && currentChunk.content.trim()) {
      chunks.push(currentChunk);
    }

    console.log(`Created ${chunks.length} structure-aware chunks`);
    return chunks;
  }

  /**
   * Group related elements that should stay together
   */
  private groupRelatedElements(
    elements: DocumentElement[],
    hierarchy: Record<string, { children: string[] }>
  ): DocumentElement[][] {
    const groups: DocumentElement[][] = [];
    const processed = new Set<string>();

    elements.forEach(element => {
      if (processed.has(element.id)) return;

      const group: DocumentElement[] = [element];
      processed.add(element.id);

      // Special grouping rules
      if (element.type === 'title' || element.type === 'chapter' || element.type === 'section') {
        // Include first paragraph or list after heading
        const children = hierarchy[element.id]?.children || [];
        const firstChild = elements.find(e => children.includes(e.id));

        if (firstChild && (firstChild.type === 'paragraph' ||
                          firstChild.type === 'bulletList' ||
                          firstChild.type === 'numberedList')) {
          group.push(firstChild);
          processed.add(firstChild.id);
        }
      } else if (element.type === 'table') {
        // Tables should never be split
        // Include any caption that follows
        const nextElement = elements[elements.indexOf(element) + 1];
        if (nextElement && nextElement.type === 'imageCaption') {
          group.push(nextElement);
          processed.add(nextElement.id);
        }
      } else if (element.type === 'bulletList' || element.type === 'numberedList') {
        // Lists should stay as single units
        // Already handled as single element
      }

      groups.push(group);
    });

    return groups;
  }

  /**
   * Get the combined content of a group of elements
   */
  private getGroupContent(group: DocumentElement[], fullContent: string): string {
    if (group.length === 0) return '';

    const contents = group.map(element => element.content);
    return contents.join('\n\n');
  }

  /**
   * Split a large group into smaller chunks intelligently
   */
  private splitLargeGroup(
    group: DocumentElement[],
    content: string,
    startOrder: number
  ): StructuredChunk[] {
    const chunks: StructuredChunk[] = [];

    // If it's a single large element (e.g., huge paragraph)
    if (group.length === 1) {
      const element = group[0];

      if (element.type === 'paragraph' || element.type === 'section') {
        // Split by sentences
        const sentences = this.splitIntoSentences(element.content);
        let currentChunk = this.createNewChunk(startOrder);
        let currentTokens = 0;

        sentences.forEach(sentence => {
          const sentenceTokens = this.countTokens(sentence);

          if (currentTokens + sentenceTokens > IDEAL_CHUNK_SIZE && currentTokens > 0) {
            chunks.push(currentChunk);
            currentChunk = this.createNewChunk(startOrder + chunks.length);
            currentTokens = 0;
          }

          currentChunk.content += (currentChunk.content ? ' ' : '') + sentence;
          currentTokens += sentenceTokens;
        });

        if (currentChunk.content) {
          currentChunk.elementIds = [element.id];
          chunks.push(currentChunk);
        }
      } else if (element.type === 'bulletList' || element.type === 'numberedList') {
        // Split lists by items
        const items = element.metadata?.listItems || [];
        let currentChunk = this.createNewChunk(startOrder);
        let currentTokens = 0;

        items.forEach(item => {
          const itemTokens = this.countTokens(item);

          if (currentTokens + itemTokens > IDEAL_CHUNK_SIZE && currentTokens > 0) {
            chunks.push(currentChunk);
            currentChunk = this.createNewChunk(startOrder + chunks.length);
            currentTokens = 0;
          }

          currentChunk.content += (currentChunk.content ? '\n' : '') + `• ${item}`;
          currentTokens += itemTokens;
        });

        if (currentChunk.content) {
          currentChunk.elementIds = [element.id];
          chunks.push(currentChunk);
        }
      } else {
        // For other types, create a single chunk even if large
        const chunk = this.createNewChunk(startOrder);
        chunk.content = element.content;
        chunk.elementIds = [element.id];
        chunk.tokenCount = this.countTokens(element.content);
        chunks.push(chunk);
      }
    } else {
      // Multiple elements in group - split between elements
      let currentChunk = this.createNewChunk(startOrder);
      let currentTokens = 0;

      group.forEach(element => {
        const elementTokens = this.countTokens(element.content);

        if (currentTokens + elementTokens > IDEAL_CHUNK_SIZE && currentTokens > 0) {
          chunks.push(currentChunk);
          currentChunk = this.createNewChunk(startOrder + chunks.length);
          currentTokens = 0;
        }

        currentChunk.content += (currentChunk.content ? '\n\n' : '') + element.content;
        currentChunk.elementIds.push(element.id);
        currentTokens += elementTokens;
      });

      if (currentChunk.content) {
        chunks.push(currentChunk);
      }
    }

    return chunks;
  }

  /**
   * Check if this is a natural breakpoint in the document
   */
  private isNaturalBreakpoint(group: DocumentElement[], structure: DocumentStructure): boolean {
    const lastElement = group[group.length - 1];

    // Natural breakpoints:
    // - End of chapter
    // - End of major section
    // - Before new chapter/section
    // - After table of contents
    return (
      lastElement.type === 'chapter' ||
      lastElement.type === 'section' ||
      lastElement.type === 'tableOfContents' ||
      (lastElement.parentId !== undefined && structure.hierarchy[lastElement.parentId]?.children.slice(-1)[0] === lastElement.id)
    );
  }

  /**
   * Create a new chunk with initial properties
   */
  private createNewChunk(order: number): StructuredChunk {
    return {
      id: uuidv4(),
      content: '',
      tokenCount: 0,
      order,
      elementIds: [],
      context: {}
    };
  }

  /**
   * Add a group of elements to a chunk
   */
  private addGroupToChunk(
    chunk: StructuredChunk,
    group: DocumentElement[],
    content: string,
    tokenCount: number
  ): void {
    // Add content
    chunk.content += (chunk.content ? '\n\n' : '') + content;
    chunk.tokenCount += tokenCount;

    // Add element IDs
    chunk.elementIds.push(...group.map(e => e.id));

    // Update context
    group.forEach(element => {
      if (element.type === 'chapter') {
        chunk.context.chapter = element.content;
      } else if (element.type === 'section' && !chunk.context.section) {
        chunk.context.section = element.content;
      }
    });
  }

  /**
   * Split text into sentences for fine-grained chunking
   */
  private splitIntoSentences(text: string): string[] {
    // Basic sentence splitting - could be improved with NLP
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.map(s => s.trim());
  }

  /**
   * Count tokens in text
   */
  private countTokens(text: string): number {
    try {
      const tokens = encoder.encode(text);
      return tokens.length;
    } catch {
      // Fallback estimation
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Fallback to simple chunking if structure-aware fails
   */
  fallbackChunk(content: string): StructuredChunk[] {
    console.log('Using fallback chunking...');
    const chunks: StructuredChunk[] = [];
    const paragraphs = content.split(/\n\n+/);

    let currentChunk = this.createNewChunk(0);
    let currentTokenCount = 0;
    let chunkOrder = 0;

    for (const paragraph of paragraphs) {
      const paragraphTokens = this.countTokens(paragraph);

      if (currentTokenCount + paragraphTokens > IDEAL_CHUNK_SIZE && currentTokenCount > 0) {
        chunks.push(currentChunk);
        currentChunk = this.createNewChunk(++chunkOrder);
        currentTokenCount = 0;
      }

      currentChunk.content += (currentChunk.content ? '\n\n' : '') + paragraph;
      currentTokenCount += paragraphTokens;
    }

    if (currentChunk.content) {
      currentChunk.tokenCount = currentTokenCount;
      chunks.push(currentChunk);
    }

    return chunks;
  }
}