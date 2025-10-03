import OpenAI from 'openai';
import { DocumentElement, DocumentStructure, ElementType } from '../types';
import { v4 as uuidv4 } from 'uuid';

const getOpenAIClient = () => {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || ''
  });
};

export class DocumentAnalyzer {
  private openai: any;

  constructor() {
    this.openai = getOpenAIClient() as any;
  }

  /**
   * Analyze document content and extract its structure
   * This will identify titles, chapters, paragraphs, lists, tables, etc.
   */
  async analyzeDocument(content: string): Promise<DocumentStructure> {
    console.log('🔍 Analyzing document structure...');
    console.log(`  Document length: ${content.length} chars, ${content.split(/\s+/).length} words`);

    try {
      // First pass: Use AI to understand document structure
      console.log('  Calling AI for structure detection...');
      const structureAnalysis = await this.detectStructureWithAI(content);
      console.log('  AI response received:', structureAnalysis.substring(0, 200) + '...');

      // Parse the AI response and create structured elements
      const elements = this.parseAIResponse(structureAnalysis, content);

      // Build hierarchy from elements
      const hierarchy = this.buildHierarchy(elements);

      // Detect document type
      const documentType = this.detectDocumentType(elements, content);

      // Extract title if present
      const title = this.extractTitle(elements);

      // Generate metadata
      const metadata = this.generateMetadata(elements, content);

      return {
        title,
        documentType,
        elements,
        hierarchy,
        metadata
      };
    } catch (error) {
      console.error('Error analyzing document:', error);
      // Fallback to basic paragraph detection
      return this.fallbackAnalysis(content);
    }
  }

  private async detectStructureWithAI(content: string): Promise<string> {
    const systemPrompt = `You are a document structure analyzer. Identify and categorize all document elements accurately.

For each element, provide:
- Type: title|chapter|section|subsection|paragraph|bulletList|numberedList|table|tableOfContents|footnote|citation|codeBlock
- Content: The actual text content
- Level: For headings (1=main title, 2=chapter, 3=section, 4=subsection)
- Start position: Approximate character position where element starts
- End position: Approximate character position where element ends

Return as JSON array of elements in this format: {"elements": [...]}. Be thorough and identify ALL elements including every paragraph.

IMPORTANT:
- Identify ALL paragraphs, not just samples
- Detect natural chapter/section breaks
- Recognize lists (bullet and numbered)
- Identify tables if present
- Note any special formatting patterns`;

    const userPrompt = `Analyze the following document and identify its structural elements:

${content.substring(0, 50000)} ${content.length > 50000 ? '... [document continues]' : ''}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: [
        {
          role: 'system',
          content: systemPrompt + '\n\nYou must respond ONLY with valid JSON. No explanations, no text before or after the JSON.'
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0,
      max_completion_tokens: 32000,
      response_format: { type: 'json_object' }
    });

    return response.choices[0]?.message?.content || '{"elements": []}';
  }

  private parseAIResponse(aiResponse: string, originalContent: string): DocumentElement[] {
    try {
      const parsed = JSON.parse(aiResponse);
      const elements: DocumentElement[] = [];

      // Handle different response formats
      const rawElements = parsed.elements || parsed.items || parsed.data || [];

      rawElements.forEach((elem: any, index: number) => {
        const element: DocumentElement = {
          id: uuidv4(),
          type: this.normalizeElementType(elem.type || elem.element_type || 'paragraph'),
          content: elem.content || elem.text || '',
          level: elem.level,
          position: {
            start: elem.start || elem.start_position || index * 100,
            end: elem.end || elem.end_position || (index + 1) * 100
          },
          metadata: {}
        };

        // Add metadata for specific element types
        if (element.type === 'bulletList' || element.type === 'numberedList') {
          element.metadata!.listItems = this.extractListItems(element.content);
        }

        if (element.type === 'table' && elem.tableData) {
          element.metadata!.tableData = elem.tableData;
        }

        if (element.type === 'codeBlock' && elem.language) {
          element.metadata!.language = elem.language;
        }

        elements.push(element);
      });

      // If AI didn't identify enough elements, supplement with basic detection
      if (elements.length < originalContent.split('\n\n').length / 2) {
        console.log('⚠️ AI identified fewer elements than expected, supplementing with basic detection');
        return this.supplementWithBasicDetection(elements, originalContent);
      }

      return elements;
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return this.basicElementDetection(originalContent);
    }
  }

  private normalizeElementType(type: string): ElementType {
    const typeMap: Record<string, ElementType> = {
      'title': 'title',
      'heading': 'title',
      'h1': 'title',
      'chapter': 'chapter',
      'section': 'section',
      'subsection': 'subsection',
      'paragraph': 'paragraph',
      'para': 'paragraph',
      'p': 'paragraph',
      'bullet': 'bulletList',
      'bulletlist': 'bulletList',
      'bullet_list': 'bulletList',
      'numbered': 'numberedList',
      'numberedlist': 'numberedList',
      'numbered_list': 'numberedList',
      'table': 'table',
      'toc': 'tableOfContents',
      'table_of_contents': 'tableOfContents',
      'footnote': 'footnote',
      'citation': 'citation',
      'code': 'codeBlock',
      'codeblock': 'codeBlock',
      'code_block': 'codeBlock',
      'caption': 'imageCaption',
      'image_caption': 'imageCaption',
      'header': 'header',
      'footer': 'footer'
    };

    const normalized = type.toLowerCase().replace(/[\s-]/g, '_');
    return typeMap[normalized] || 'paragraph';
  }

  private extractListItems(content: string): string[] {
    const lines = content.split('\n');
    return lines
      .map(line => line.replace(/^[\s\-\*•◦▪▫◾◽○●]\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  private buildHierarchy(elements: DocumentElement[]): Record<string, { children: string[] }> {
    const hierarchy: Record<string, { children: string[] }> = {};
    let currentParent: string | null = null;
    let currentLevel = 0;

    elements.forEach(element => {
      hierarchy[element.id] = { children: [] };

      // Determine hierarchical relationship
      if (element.type === 'title') {
        currentParent = element.id;
        currentLevel = 1;
      } else if (element.type === 'chapter') {
        currentParent = element.id;
        currentLevel = 2;
      } else if (element.type === 'section') {
        if (currentLevel < 3 && currentParent) {
          hierarchy[currentParent].children.push(element.id);
          element.parentId = currentParent;
        }
        currentParent = element.id;
        currentLevel = 3;
      } else if (element.type === 'subsection') {
        if (currentLevel < 4 && currentParent) {
          hierarchy[currentParent].children.push(element.id);
          element.parentId = currentParent;
        }
        currentParent = element.id;
        currentLevel = 4;
      } else if (currentParent) {
        // Regular content elements belong to current parent
        hierarchy[currentParent].children.push(element.id);
        element.parentId = currentParent;
      }
    });

    return hierarchy;
  }

  private detectDocumentType(
    elements: DocumentElement[],
    content: string
  ): 'report' | 'book' | 'article' | 'memo' | 'manual' | 'proposal' | 'paper' {
    // Check for specific document markers
    const contentLower = content.toLowerCase();

    if (contentLower.includes('memorandum') ||
        contentLower.includes('to:') && contentLower.includes('from:') && contentLower.includes('subject:')) {
      return 'memo';
    }

    if (elements.some(e => e.type === 'chapter' || e.content.match(/^chapter\s+\d+/i))) {
      return 'book';
    }

    if (contentLower.includes('abstract') && contentLower.includes('references')) {
      return 'paper';
    }

    if (contentLower.includes('executive summary') && contentLower.includes('investment')) {
      return 'proposal';
    }

    if (contentLower.includes('installation') || contentLower.includes('troubleshooting')) {
      return 'manual';
    }

    if (elements.some(e => e.content.toLowerCase().includes('introduction') &&
                           e.content.toLowerCase().includes('conclusion'))) {
      return 'article';
    }

    return 'report';
  }

  private extractTitle(elements: DocumentElement[]): string | undefined {
    const titleElement = elements.find(e => e.type === 'title');
    if (titleElement) return titleElement.content;

    // Look for first major heading
    const firstHeading = elements.find(e =>
      e.type === 'chapter' || e.type === 'section' ||
      (e.type === 'paragraph' && e.content.length < 100 && e.position.start < 200)
    );

    return firstHeading?.content;
  }

  private generateMetadata(elements: DocumentElement[], content: string): any {
    return {
      wordCount: content.trim().split(/\s+/).length,
      hasTableOfContents: elements.some(e => e.type === 'tableOfContents'),
      hasTables: elements.some(e => e.type === 'table'),
      hasLists: elements.some(e => e.type === 'bulletList' || e.type === 'numberedList'),
      hasCodeBlocks: elements.some(e => e.type === 'codeBlock'),
      elementCounts: this.countElementTypes(elements)
    };
  }

  private countElementTypes(elements: DocumentElement[]): Record<string, number> {
    const counts: Record<string, number> = {};
    elements.forEach(element => {
      counts[element.type] = (counts[element.type] || 0) + 1;
    });
    return counts;
  }

  private supplementWithBasicDetection(
    existingElements: DocumentElement[],
    content: string
  ): DocumentElement[] {
    const lines = content.split('\n');
    const supplemented = [...existingElements];
    const existingPositions = new Set(existingElements.map(e => e.position.start));

    let currentPosition = 0;
    let currentParagraph = '';

    lines.forEach(line => {
      const lineStart = currentPosition;
      const lineEnd = currentPosition + line.length;

      // Check if this position is already covered
      if (!existingPositions.has(lineStart)) {
        if (line.trim() === '') {
          // Empty line - end of paragraph
          if (currentParagraph.trim()) {
            supplemented.push({
              id: uuidv4(),
              type: 'paragraph',
              content: currentParagraph.trim(),
              position: {
                start: lineStart - currentParagraph.length,
                end: lineStart
              }
            });
            currentParagraph = '';
          }
        } else {
          currentParagraph += (currentParagraph ? ' ' : '') + line;
        }
      }

      currentPosition = lineEnd + 1; // +1 for newline
    });

    // Add final paragraph if exists
    if (currentParagraph.trim()) {
      supplemented.push({
        id: uuidv4(),
        type: 'paragraph',
        content: currentParagraph.trim(),
        position: {
          start: currentPosition - currentParagraph.length,
          end: currentPosition
        }
      });
    }

    return supplemented;
  }

  private basicElementDetection(content: string): DocumentElement[] {
    const elements: DocumentElement[] = [];
    const paragraphs = content.split(/\n\n+/);
    let currentPosition = 0;

    paragraphs.forEach((para, index) => {
      const trimmed = para.trim();
      if (!trimmed) return;

      let type: ElementType = 'paragraph';
      let level: number | undefined;

      // Detect element type
      if (trimmed.match(/^#{1,6}\s/)) {
        const headerLevel = trimmed.match(/^(#{1,6})/)?.[1].length || 1;
        type = headerLevel === 1 ? 'title' :
               headerLevel === 2 ? 'chapter' :
               headerLevel === 3 ? 'section' : 'subsection';
        level = headerLevel;
      } else if (trimmed.match(/^Chapter\s+\d+/i)) {
        type = 'chapter';
        level = 2;
      } else if (trimmed.match(/^Section\s+\d+/i)) {
        type = 'section';
        level = 3;
      } else if (trimmed.match(/^[\*\-•]\s/m)) {
        type = 'bulletList';
      } else if (trimmed.match(/^\d+\.\s/m)) {
        type = 'numberedList';
      } else if (trimmed.match(/^\|.*\|$/m)) {
        type = 'table';
      } else if (trimmed.match(/^```/)) {
        type = 'codeBlock';
      }

      elements.push({
        id: uuidv4(),
        type,
        content: trimmed.replace(/^#{1,6}\s*/, ''),
        level,
        position: {
          start: currentPosition,
          end: currentPosition + para.length
        }
      });

      currentPosition += para.length + 2; // +2 for \n\n
    });

    return elements;
  }

  private fallbackAnalysis(content: string): DocumentStructure {
    console.log('Using fallback analysis...');
    const elements = this.basicElementDetection(content);
    const hierarchy = this.buildHierarchy(elements);

    return {
      title: this.extractTitle(elements),
      documentType: 'report',
      elements,
      hierarchy,
      metadata: this.generateMetadata(elements, content)
    };
  }
}