import OpenAI from 'openai';
import {
  StructuredChunk,
  FormattingStyle,
  DocumentStructure,
  DocumentElement,
  ElementType
} from '../types';
import { progressTracker } from './progressTracker';

const getOpenAIClient = () => {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || ''
  });
};

// Element-specific formatting rules per style
const ELEMENT_FORMATTING_RULES: Record<string, Record<ElementType, any>> = {
  'business-memo': {
    title: { uppercase: true, center: true, bold: true, spacing: 'double' },
    chapter: { bold: true, spacing: 'single' },
    section: { bold: true, underline: false },
    subsection: { bold: false, italic: true },
    paragraph: { indent: false, justify: false },
    bulletList: { symbol: '•', indent: true },
    numberedList: { format: '1.', indent: true },
    table: { borders: true, headerBold: true },
    tableOfContents: { dotLeaders: true },
    footnote: { superscript: true, bottomPage: true },
    citation: { brackets: true },
    codeBlock: { monospace: true, background: true },
    imageCaption: { italic: true, center: true },
    header: { position: 'top', fontSize: 'small' },
    footer: { position: 'bottom', fontSize: 'small' }
  },
  'book-manuscript': {
    title: { center: true, pageBreak: true, caps: false },
    chapter: { center: true, pageBreak: true, format: 'Chapter {number}' },
    section: { center: false, bold: false },
    subsection: { italic: true },
    paragraph: { indent: true, firstLineNoIndent: true, doubleSpace: true },
    bulletList: { symbol: '—', indent: true },
    numberedList: { format: '1)', indent: true },
    table: { center: true, caption: 'above' },
    tableOfContents: { romanNumerals: true },
    footnote: { endnotes: true },
    citation: { authorYear: true },
    codeBlock: { indent: true },
    imageCaption: { italic: true },
    header: { omit: true },
    footer: { pageNumbers: 'center' }
  },
  'academic-paper': {
    title: { center: true, bold: true, larger: true },
    chapter: { numbered: true, format: '1. {title}' },
    section: { numbered: true, format: '1.1 {title}' },
    subsection: { numbered: true, format: '1.1.1 {title}' },
    paragraph: { justify: true, indent: false },
    bulletList: { symbol: '•', hanging: true },
    numberedList: { format: '(1)', hanging: true },
    table: { numbered: true, caption: 'above' },
    tableOfContents: { includePageNumbers: true },
    footnote: { bottomPage: true, numbered: true },
    citation: { format: '[1]', bibliography: true },
    codeBlock: { numbered: true, caption: true },
    imageCaption: { format: 'Figure {number}: {caption}' },
    header: { content: 'title', position: 'right' },
    footer: { pageNumbers: 'bottom-center' }
  }
  // Add more styles as needed
};

export class StructuredFormatter {
  private openai: any;

  constructor() {
    this.openai = getOpenAIClient() as any;
  }

  /**
   * Format chunks with awareness of document structure and element types
   */
  async formatWithStructure(
    chunks: StructuredChunk[],
    style: FormattingStyle,
    structure: DocumentStructure,
    jobId?: string
  ): Promise<StructuredChunk[]> {
    console.log(`🎨 Formatting ${chunks.length} chunks with structure awareness...`);
    console.log(`📝 Style being used: ${style.name} (${style.id})`);
    const formattedChunks: StructuredChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      if (jobId) {
        progressTracker.setFormatting(jobId, i + 1, chunks.length);
      }

      try {
        console.log(`\n📋 Processing chunk ${chunk.order + 1}:`);
        console.log(`  - Element IDs: ${chunk.elementIds.join(', ')}`);
        console.log(`  - Context: ${JSON.stringify(chunk.context)}`);
        console.log(`  - Word count: ${chunk.content.split(/\s+/).length} words`);

        const formattedChunk = await this.formatStructuredChunk(
          chunk,
          style,
          structure
        );

        console.log(`  ✅ Chunk formatted successfully`);
        console.log(`  - New word count: ${formattedChunk.content.split(/\s+/).length} words`);
        console.log(`  - Content changed: ${formattedChunk.content !== chunk.content}`);

        formattedChunks.push(formattedChunk);

        console.log(`Formatted chunk ${chunk.order + 1}/${chunks.length}`);
      } catch (error) {
        console.error(`❌ Error formatting chunk ${chunk.order}:`, error);
        console.log(`⚠️ Returning original chunk to prevent data loss`);
        // Return original chunk on error to prevent data loss
        formattedChunks.push(chunk);
      }
    }

    return formattedChunks;
  }

  /**
   * Format a single structured chunk
   */
  private async formatStructuredChunk(
    chunk: StructuredChunk,
    style: FormattingStyle,
    structure: DocumentStructure
  ): Promise<StructuredChunk> {
    // Get elements in this chunk
    const chunkElements = structure.elements.filter(
      element => chunk.elementIds.includes(element.id)
    );

    // Build element-aware prompt
    const prompt = this.buildElementAwarePrompt(
      chunk,
      chunkElements,
      style,
      structure.documentType
    );

    // Count original words for validation
    const originalWordCount = chunk.content.trim().split(/\s+/).length;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-nano-2025-08-07',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(style, structure.documentType)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0,
        max_completion_tokens: 32000
      });

      const formattedContent = response.choices[0]?.message?.content || chunk.content;

      // Validate content preservation
      const formattedWordCount = formattedContent.trim().split(/\s+/).length;
      if (formattedWordCount < originalWordCount * 0.95) {
        console.error(
          `⚠️ Content loss detected in chunk ${chunk.order}! ` +
          `Original: ${originalWordCount} words, Formatted: ${formattedWordCount} words`
        );
        return chunk; // Return original to prevent data loss
      }

      return {
        ...chunk,
        content: formattedContent
      };
    } catch (error: any) {
      console.error('❌ OpenAI API error:', error.message);
      console.error('Full error:', error);
      console.log('⚠️ Returning original chunk due to API error');
      return chunk; // Return original on error
    }
  }

  /**
   * Build an element-aware formatting prompt
   */
  private buildElementAwarePrompt(
    chunk: StructuredChunk,
    elements: DocumentElement[],
    style: FormattingStyle,
    documentType?: string
  ): string {
    let prompt = `You are formatting a ${documentType || 'document'} chunk that contains the following elements:\n\n`;

    // Describe elements in the chunk
    const elementSummary = this.summarizeElements(elements);
    prompt += elementSummary + '\n\n';

    // Add context
    if (chunk.context.chapter) {
      prompt += `Current Chapter: ${chunk.context.chapter}\n`;
    }
    if (chunk.context.section) {
      prompt += `Current Section: ${chunk.context.section}\n`;
    }
    prompt += '\n';

    // Add formatting rules for each element type
    prompt += 'Apply these specific formatting rules:\n';
    const rules = ELEMENT_FORMATTING_RULES[style.id] || {};

    const uniqueTypes = new Set(elements.map(e => e.type));
    uniqueTypes.forEach(type => {
      if (rules[type]) {
        prompt += `- ${type}: ${this.describeFormattingRules(rules[type])}\n`;
      }
    });

    prompt += '\n';

    // Add the critical preservation rule with markdown formatting
    prompt += `CRITICAL: You must return EVERY SINGLE WORD from the following text.
Apply proper markdown formatting based on the element types and style rules:
- Use # for titles (centered in memo style)
- Use ## for chapters/major sections
- Use ### for sections
- Use #### for subsections
- Use **bold** for emphasis and important terms
- Use * or - for bullet points with proper indentation
- Use 1. 2. 3. for numbered lists
- Use > for blockquotes
- Use --- for section breaks
- Apply proper spacing between sections
- Format tables with | pipes | for columns |

DO NOT summarize, shorten, or modify any content. Only add formatting.

Text to format:
${chunk.content}

Remember: Return 100% of the above text with proper markdown formatting applied based on the element types and style ${style.name}.`;

    return prompt;
  }

  /**
   * Create a summary of elements for the prompt
   */
  private summarizeElements(elements: DocumentElement[]): string {
    const typeCounts: Record<string, number> = {};
    elements.forEach(element => {
      typeCounts[element.type] = (typeCounts[element.type] || 0) + 1;
    });

    const summary = Object.entries(typeCounts)
      .map(([type, count]) => `- ${count} ${type}${count > 1 ? 's' : ''}`)
      .join('\n');

    return summary;
  }

  /**
   * Convert formatting rules to human-readable description
   */
  private describeFormattingRules(rules: any): string {
    const descriptions: string[] = [];

    if (rules.bold) descriptions.push('use **bold** markdown');
    if (rules.italic) descriptions.push('use *italic* markdown');
    if (rules.uppercase) descriptions.push('convert to UPPERCASE');
    if (rules.center) descriptions.push('indicate centering with markdown');
    if (rules.indent) descriptions.push('add proper indentation');
    if (rules.justify) descriptions.push('ensure justified alignment');
    if (rules.doubleSpace) descriptions.push('add extra line breaks for spacing');
    if (rules.pageBreak) descriptions.push('add --- page break marker');
    if (rules.numbered) descriptions.push('use 1. 2. 3. numbering');
    if (rules.symbol) descriptions.push(`use "${rules.symbol}" for bullet points`);
    if (rules.format) descriptions.push(`format as "${rules.format}" with proper markdown`);

    return descriptions.join(', ');
  }

  /**
   * Get system prompt based on style and document type
   */
  private getSystemPrompt(style: FormattingStyle, documentType?: string): string {
    let basePrompt = style.systemPrompt;

    // Enhance with structure awareness
    const enhancedPrompt = `You are an advanced document formatter with deep understanding of document structure.

${basePrompt}

ADDITIONAL STRUCTURAL RULES:
1. Recognize and respect element types (titles, chapters, paragraphs, lists, etc.)
2. Apply formatting that is appropriate for each element type
3. Maintain document hierarchy and relationships
4. Preserve ALL content - every single word must be retained
5. Only add formatting markers and structure
6. Never merge or split elements unless explicitly instructed
7. Respect natural document flow and transitions

Document Type: ${documentType || 'general'}
Style: ${style.name}`;

    return enhancedPrompt;
  }

  /**
   * Post-process formatted content to ensure consistency
   */
  postProcessFormatting(
    chunks: StructuredChunk[],
    structure: DocumentStructure
  ): StructuredChunk[] {
    console.log('🔧 Post-processing formatted chunks...');

    // Ensure consistent formatting across chunks
    chunks.forEach((chunk, index) => {
      // Remove duplicate headers/footers between chunks
      if (index > 0) {
        chunk.content = this.removeDuplicateHeaders(chunk.content, chunks[index - 1].content);
      }

      // Ensure proper spacing between chunks
      if (index < chunks.length - 1) {
        const nextChunk = chunks[index + 1];
        const lastElement = structure.elements.find(e =>
          chunk.elementIds.includes(e.id) &&
          chunk.elementIds.indexOf(e.id) === chunk.elementIds.length - 1
        );
        const firstNextElement = structure.elements.find(e =>
          nextChunk.elementIds.includes(e.id) &&
          nextChunk.elementIds.indexOf(e.id) === 0
        );

        if (lastElement && firstNextElement) {
          // Add appropriate spacing based on element types
          if (lastElement.type === 'chapter' || firstNextElement.type === 'chapter') {
            // Chapter breaks handled by page breaks
          } else if (lastElement.type === 'section' || firstNextElement.type === 'section') {
            chunk.content += '\n\n';
          } else {
            chunk.content += '\n';
          }
        }
      }
    });

    return chunks;
  }

  /**
   * Remove duplicate headers that might appear between chunks
   */
  private removeDuplicateHeaders(current: string, previous: string): string {
    // Simple implementation - can be enhanced
    const previousLines = previous.split('\n').slice(-3);
    const currentLines = current.split('\n');

    // Check if first line of current matches last lines of previous
    if (previousLines.includes(currentLines[0])) {
      return currentLines.slice(1).join('\n');
    }

    return current;
  }
}