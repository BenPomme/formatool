import { RawDocxStyles, StyleAttributes, SimplifiedStyleAttributes, StyleExtractionResult } from '../types/styleAttributes';
import { getOpenAIClient, OPENAI_MODELS } from './openaiClient';
import * as mammoth from 'mammoth';
import { DocxStyleExtractor } from './docxStyleExtractor';
const pdfParse = require('pdf-parse');

/**
 * Service for extracting style attributes from reference documents
 * Supports DOCX, PDF, and HTML formats
 */
export class StyleExtractor {
  private openai: any;
  private rawDocxStyles: RawDocxStyles | null = null;

  constructor() {
    this.openai = getOpenAIClient();
  }

  /**
   * Extract style attributes from a reference document
   */
  async extractStyles(
    fileBuffer: Buffer,
    fileType: string,
    fileName: string
  ): Promise<StyleExtractionResult> {
    console.log(`🎨 Extracting styles from reference document: ${fileName}`);

    try {
      // Step 1: Extract text and basic structure based on file type
      const extractedContent = await this.extractContentByType(fileBuffer, fileType);

      // Store raw DOCX styles if available
      if (extractedContent.metadata?.docxStyles) {
        this.rawDocxStyles = this.normalizeRawDocxStyles(extractedContent.metadata.docxStyles);
      } else {
        this.rawDocxStyles = null;
      }

      // Step 2: Use AI to analyze and extract comprehensive style attributes
      const styleAttributes = this.applyDocxMetadata(await this.analyzeWithAI(extractedContent, fileType));

      // Step 3: Create simplified version for quick access
      const simplified = this.createSimplifiedAttributes(styleAttributes);

      // Step 4: Validate and calculate confidence
      const validation = this.validateAttributes(styleAttributes);

      const rawDocxStyles = this.rawDocxStyles ? this.cloneRawDocxStyles(this.rawDocxStyles) : null;

      return {
        success: true,
        attributes: styleAttributes,
        simplified,
        confidence: validation.confidence,
        warnings: validation.warnings,
        documentType: this.detectDocumentType(extractedContent.text),
        rawDocxStyles
      };
    } catch (error) {
      console.error('Style extraction failed:', error);
      return {
        success: false,
        attributes: this.getDefaultAttributes(),
        simplified: this.getDefaultSimplifiedAttributes(),
        confidence: 0,
        warnings: ['Failed to extract styles from reference document'],
        rawDocxStyles: this.rawDocxStyles ? this.cloneRawDocxStyles(this.rawDocxStyles) : null
      };
    }
  }

  /**
   * Extract content based on file type
   */
  private async extractContentByType(
    fileBuffer: Buffer,
    fileType: string
  ): Promise<{ text: string; html?: string; metadata?: any }> {
    switch (fileType.toLowerCase()) {
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'docx':
        return await this.extractFromDocx(fileBuffer);

      case 'application/pdf':
      case 'pdf':
        return await this.extractFromPdf(fileBuffer);

      case 'text/html':
      case 'html':
        return { text: fileBuffer.toString('utf-8'), html: fileBuffer.toString('utf-8') };

      case 'text/plain':
      case 'txt':
        return { text: fileBuffer.toString('utf-8') };

      default:
        // Try to parse as text
        return { text: fileBuffer.toString('utf-8') };
    }
  }

  /**
   * Extract content from DOCX with REAL style information from the document's XML
   */
  private async extractFromDocx(fileBuffer: Buffer): Promise<{ text: string; html?: string; metadata?: any }> {
    try {
      // Extract plain text using mammoth
      const textResult = await mammoth.extractRawText({ buffer: fileBuffer });

      // Extract REAL styles from the DOCX XML structure
      const docxExtractor = new DocxStyleExtractor();
      const extractedStyles = await docxExtractor.extractStyles(fileBuffer);

      console.log('📊 Extracted REAL styles from DOCX:');
      console.log('   Fonts:', Array.from(extractedStyles.fonts));
      console.log('   Font sizes:', Array.from(extractedStyles.fontSizes));
      console.log('   Colors:', Array.from(extractedStyles.colors));
      console.log('   Default font:', extractedStyles.defaultFont);
      console.log('   Default size:', extractedStyles.defaultFontSize);
      console.log('   Default color:', extractedStyles.defaultColor);

      return {
        text: textResult.value,
        html: undefined,
        metadata: {
          docxStyles: {
            fonts: Array.from(extractedStyles.fonts),
            fontSizes: Array.from(extractedStyles.fontSizes),
            colors: Array.from(extractedStyles.colors),
            lineHeights: Array.from(extractedStyles.lineHeights),
            defaultFont: extractedStyles.defaultFont,
            defaultFontSize: extractedStyles.defaultFontSize,
            defaultColor: extractedStyles.defaultColor,
            defaultAlignment: extractedStyles.defaultAlignment,
            defaultLineHeight: extractedStyles.defaultLineHeight,
            headingStyles: extractedStyles.headingStyles,
            paragraphSpacing: {
              before: Array.from(extractedStyles.paragraphSpacing.before),
              after: Array.from(extractedStyles.paragraphSpacing.after)
            },
            paragraphStyles: Object.fromEntries(
              Object.entries(extractedStyles.paragraphStyles).map(([key, value]) => [key, value])
            ),
            bulletSymbols: Array.from(extractedStyles.bulletSymbols),
            numberingFormats: Array.from(extractedStyles.numberingFormats),
            numberingMap: extractedStyles.numberingMap,
            numIdToAbstract: extractedStyles.numIdToAbstract
          }
        }
      };
    } catch (error) {
      console.error('DOCX extraction error:', error);
      throw error;
    }
  }

  /**
   * Extract content from PDF
   */
  private async extractFromPdf(fileBuffer: Buffer): Promise<{ text: string; metadata?: any }> {
    try {
      const data = await pdfParse(fileBuffer);

      return {
        text: data.text,
        metadata: {
          numPages: data.numpages,
          info: data.info,
          metadata: data.metadata
        }
      };
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw error;
    }
  }

  /**
   * Extract actual styles from HTML - no defaults
   */
  private extractStylesFromHtml(html: string): any {
    const styles: any = {
      fonts: new Set<string>(),
      fontSizes: new Set<number>(),
      colors: new Set<string>(),
      lineHeights: new Set<number>(),
      headings: {}
    };

    // Extract inline styles
    const styleRegex = /style="([^"]+)"/gi;
    let match;

    while ((match = styleRegex.exec(html)) !== null) {
      const styleStr = match[1];

      // Extract font-family - properly handle font stacks
      const fontMatch = styleStr.match(/font-family:\s*([^;]+)/i);
      if (fontMatch) {
        // Clean up font names, remove quotes, split by comma
        const fonts = fontMatch[1]
          .split(',')
          .map(f => f.trim().replace(/["']/g, ''))
          .filter(f => f && !f.match(/^(serif|sans-serif|monospace|cursive|fantasy)$/i));
        fonts.forEach(f => styles.fonts.add(f));
      }

      // Extract font-size with units
      const sizeMatch = styleStr.match(/font-size:\s*(\d+(?:\.\d+)?)(px|pt|em|rem|%)?/i);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2] || 'px';
        // Convert to pixels for consistency (approximate)
        let pxSize = size;
        if (unit === 'pt') pxSize = size * 1.333;
        else if (unit === 'em' || unit === 'rem') pxSize = size * 16;
        else if (unit === '%') pxSize = size * 0.16;
        styles.fontSizes.add(Math.round(pxSize));
      }

      // Extract color
      const colorMatch = styleStr.match(/color:\s*([^;]+)/i);
      if (colorMatch) {
        const color = colorMatch[1].trim();
        if (color && color !== 'inherit' && color !== 'initial' && color !== 'unset') {
          styles.colors.add(color);
        }
      }

      // Extract line-height
      const lineHeightMatch = styleStr.match(/line-height:\s*(\d+(?:\.\d+)?)/i);
      if (lineHeightMatch) {
        styles.lineHeights.add(parseFloat(lineHeightMatch[1]));
      }
    }

    // Also check for heading tags
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/gi);
    const h2Match = html.match(/<h2[^>]*>([^<]+)<\/h2>/gi);
    const h3Match = html.match(/<h3[^>]*>([^<]+)<\/h3>/gi);

    const fontSizes = Array.from(styles.fontSizes) as number[];
    fontSizes.sort((a, b) => a - b);

    return {
      fonts: Array.from(styles.fonts) as string[],
      fontSizes,
      colors: Array.from(styles.colors) as string[],
      lineHeights: Array.from(styles.lineHeights) as number[],
      hasH1: !!h1Match,
      hasH2: !!h2Match,
      hasH3: !!h3Match
    };
  }

  /**
   * Analyze content with AI to extract comprehensive style attributes
   */
  private async analyzeWithAI(
    content: { text: string; html?: string; metadata?: any },
    fileType: string
  ): Promise<StyleAttributes> {
    // Use REAL extracted styles from DOCX if available
    const docxStyles = content.metadata?.docxStyles;

    const prompt = `Analyze this document and extract comprehensive style attributes.

Document content (first 5000 chars):
${content.text.substring(0, 5000)}

${docxStyles ? `ACTUAL STYLES EXTRACTED FROM THE DOCUMENT:
- Fonts used: ${JSON.stringify(docxStyles.fonts)}
- Font sizes: ${JSON.stringify(docxStyles.fontSizes)} pt
- Colors: ${JSON.stringify(docxStyles.colors)}
- Default font: ${docxStyles.defaultFont || 'not found'}
- Default size: ${docxStyles.defaultFontSize || 'not found'} pt
- Default color: ${docxStyles.defaultColor || 'not found'}
- Line heights: ${JSON.stringify(docxStyles.lineHeights)}
- Paragraph spacing before: ${JSON.stringify(docxStyles.paragraphSpacing?.before)} pt
- Paragraph spacing after: ${JSON.stringify(docxStyles.paragraphSpacing?.after)} pt
- Heading styles: ${JSON.stringify(docxStyles.headingStyles, null, 2)}

USE THESE EXACT VALUES! Do not guess or use defaults.` : ''}

${!docxStyles && content.metadata ? `Other metadata:
${JSON.stringify(content.metadata, null, 2).substring(0, 1000)}` : ''}

Extract and return a comprehensive JSON object with the EXACT style attributes found in this document.

IMPORTANT:
- DO NOT use any default or example values
- Extract ONLY what you actually observe in the document
- If you cannot determine a value from the document, use null
- For fonts: extract the ACTUAL fonts used, not examples
- For colors: extract the ACTUAL colors used, not defaults
- For sizes: extract the ACTUAL sizes used, not standard values

Return a JSON object with this structure (but with ACTUAL observed values):
{
  "document": {
    "pageSize": "<actual page size or null>",
    "pageOrientation": "<actual orientation or null>",
    "margins": { "top": <actual>, "bottom": <actual>, "left": <actual>, "right": <actual> },
    "lineHeight": <actual line height>,
    "defaultFont": "<actual most common font>",
    "defaultFontSize": <actual most common size>,
    "defaultColor": "<actual most common color>"
  },
  "typography": {
    "fonts": [<list of ACTUALLY USED fonts>],
    "fontSizes": [<list of ACTUALLY USED sizes>],
    "headings": {
      "h1": { "fontSize": <actual>, "fontWeight": "<actual>", "color": "<actual>", "marginTop": <actual>, "marginBottom": <actual> },
      "h2": { "fontSize": <actual>, "fontWeight": "<actual>", "color": "<actual>", "marginTop": <actual>, "marginBottom": <actual> },
      "h3": { "fontSize": <actual>, "fontWeight": "<actual>", "color": "<actual>", "marginTop": <actual>, "marginBottom": <actual> }
    },
    "bodyText": {
      "font": "<actual body font>",
      "fontSize": <actual body size>,
      "fontWeight": "<actual>",
      "color": "<actual body color>",
      "lineHeight": <actual>,
      "paragraphSpacing": <actual>,
      "alignment": "<actual>"
    }
  },
  "paragraphs": {
    "spacing": { "before": <actual>, "after": <actual>, "line": <actual> },
    "indentation": { "firstLine": <actual>, "left": <actual>, "right": <actual> },
    "alignment": "<actual>"
  },
  "lists": {
    "bulleted": { "symbol": "<actual symbol>", "indentLevel": <actual>, "spacing": <actual> },
    "numbered": { "format": "<actual format>", "indentLevel": <actual>, "spacing": <actual> }
  },
  "tables": {
    "borderStyle": "<actual style or null>",
    "borderWidth": <actual or null>,
    "borderColor": "<actual color or null>",
    "cellPadding": <actual or null>,
    "cellSpacing": <actual or null>
  },
  "colors": {
    "primary": "<most common color>",
    "text": { "primary": "<actual text color>", "secondary": "<actual secondary color or null>" },
    "background": { "primary": "<actual background or null>" }
  }
}

Analyze the document meticulously and extract ONLY what you observe.
Return ONLY valid JSON, no additional text.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: OPENAI_MODELS.STYLE_EXTRACTION,
        messages: [
          {
            role: 'system',
            content: 'You are a document style analysis expert. Extract precise formatting attributes from documents.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      });

      const result = response.choices[0]?.message?.content;
      if (!result) {
        throw new Error('No response from AI');
      }

      const parsed = JSON.parse(result);
      return this.normalizeAttributes(parsed);
    } catch (error) {
      console.error('AI analysis error:', error);
      return this.getDefaultAttributes();
    }
  }

  /**
   * Normalize and fill in missing attributes
   */
  private normalizeAttributes(partial: any): StyleAttributes {
    const defaults = this.getDefaultAttributes();

    // Deep merge with defaults
    return this.deepMerge(defaults, partial) as StyleAttributes;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }

    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Create simplified attributes for quick access
   */
  private createSimplifiedAttributes(full: StyleAttributes): SimplifiedStyleAttributes {
    // Get the first font from the extracted DOCX fonts, or from AI attributes
    let primaryFont = full.typography.bodyText.font || full.document.defaultFont;
    let primaryFontSize = full.typography.bodyText.fontSize || full.document.defaultFontSize;
    let textColor = full.colors.text.primary;
    let headingColor = full.typography.headings.h1?.color || full.colors.primary;

    if (this.rawDocxStyles) {
      const docxFonts = this.rawDocxStyles.fonts;
      const docxFontCandidates = [
        this.rawDocxStyles.defaultFont,
        ...docxFonts
      ].filter((font): font is string => typeof font === 'string' && font.trim().length > 0);

      const preferredFont = docxFontCandidates.find(font => /aptos/i.test(font)) ||
        docxFontCandidates.find(font => /times/i.test(font)) ||
        docxFontCandidates[0];

      if (preferredFont) {
        primaryFont = preferredFont;
      }

      if (!primaryFontSize && this.rawDocxStyles.defaultFontSize) {
        primaryFontSize = this.rawDocxStyles.defaultFontSize;
      }

      if (!textColor) {
        textColor = this.rawDocxStyles.defaultColor || this.rawDocxStyles.colors[0];
      }

      if (!headingColor) {
        headingColor = this.rawDocxStyles.headingStyles?.Heading1?.color ||
          this.rawDocxStyles.headingStyles?.['Heading 1']?.color ||
          this.rawDocxStyles.colors[0];
      }
    }

    primaryFont = primaryFont || 'Calibri';
    primaryFontSize = primaryFontSize || 11;
    textColor = textColor || '#000000';
    headingColor = headingColor || '#0F4761';

    return {
      font: primaryFont,
      fontSize: primaryFontSize,
      lineHeight: full.typography.bodyText.lineHeight || this.rawDocxStyles?.lineHeights?.[0] || 1.15,
      paragraphSpacing: full.typography.bodyText.paragraphSpacing || this.rawDocxStyles?.paragraphSpacing?.after?.[0] || 6,
      headingStyles: full.typography.headings,
      listStyle: full.lists.bulleted.symbol || '•',
      colors: {
        text: textColor,
        heading: headingColor,
        background: full.colors.background.primary || '#FFFFFF'
      },
      margins: full.document.margins
    };
  }

  /**
   * Validate extracted attributes and calculate confidence
   */
  private validateAttributes(attrs: StyleAttributes): { confidence: number; warnings: string[] } {
    const warnings: string[] = [];
    let score = 100;

    // Check for missing critical attributes
    if (!attrs.document.defaultFont) {
      warnings.push('Default font not detected');
      score -= 10;
    }

    if (!attrs.document.defaultFontSize || attrs.document.defaultFontSize < 8 || attrs.document.defaultFontSize > 72) {
      warnings.push('Font size seems unusual');
      score -= 5;
    }

    if (!attrs.typography.headings.h1) {
      warnings.push('No heading styles detected');
      score -= 15;
    }

    if (attrs.document.margins.top === 0 && attrs.document.margins.bottom === 0) {
      warnings.push('No margins detected');
      score -= 10;
    }

    return {
      confidence: Math.max(0, score),
      warnings
    };
  }

  private applyDocxMetadata(attrs: StyleAttributes): StyleAttributes {
    if (!this.rawDocxStyles) {
      return attrs;
    }

    const docx = this.rawDocxStyles;

    attrs.typography.fonts = this.mergeUniqueStrings(attrs.typography.fonts || [], docx.fonts);

    const docxDefaultFont = docx.defaultFont || docx.fonts[0];

    if (!this.isNonEmptyString(attrs.document.defaultFont) && this.isNonEmptyString(docxDefaultFont)) {
      attrs.document.defaultFont = docxDefaultFont.trim();
    }

    if (!this.isNonEmptyString(attrs.typography.bodyText.font) && this.isNonEmptyString(docxDefaultFont)) {
      attrs.typography.bodyText.font = docxDefaultFont.trim();
    }

    attrs.typography.fontSizes = this.mergeUniqueNumbers(attrs.typography.fontSizes || [], docx.fontSizes);

    if ((!attrs.document.defaultFontSize || attrs.document.defaultFontSize <= 0) && docx.defaultFontSize) {
      attrs.document.defaultFontSize = docx.defaultFontSize;
    }

    if ((!attrs.typography.bodyText.fontSize || attrs.typography.bodyText.fontSize <= 0) && docx.defaultFontSize) {
      attrs.typography.bodyText.fontSize = docx.defaultFontSize;
    }

    if (!this.isNonEmptyString(attrs.document.defaultColor) && this.isNonEmptyString(docx.defaultColor)) {
      attrs.document.defaultColor = docx.defaultColor!.trim();
    }

    if (!this.isNonEmptyString(attrs.typography.bodyText.color)) {
      const colorCandidate = docx.defaultColor || docx.colors[0];
      if (this.isNonEmptyString(colorCandidate)) {
        attrs.typography.bodyText.color = colorCandidate.trim();
      }
    }

    if ((!attrs.typography.bodyText.lineHeight || attrs.typography.bodyText.lineHeight <= 0) && docx.lineHeights.length) {
      attrs.typography.bodyText.lineHeight = docx.lineHeights[0];
    }

    if ((!attrs.typography.bodyText.paragraphSpacing || attrs.typography.bodyText.paragraphSpacing <= 0) && docx.paragraphSpacing.after.length) {
      attrs.typography.bodyText.paragraphSpacing = docx.paragraphSpacing.after[0];
    }

    Object.entries(docx.headingStyles || {}).forEach(([key, docHeading]) => {
      if (!docHeading) return;
      const normalizedKey = this.normalizeHeadingKey(key);
      const heading = attrs.typography.headings[normalizedKey];
      if (!heading) return;

      if (this.isNonEmptyString(docHeading.font) && !this.isNonEmptyString(heading.font)) {
        heading.font = docHeading.font!.trim();
      }

      if (typeof docHeading.fontSize === 'number' && (!heading.fontSize || heading.fontSize <= 0)) {
        heading.fontSize = docHeading.fontSize;
      }

      if (this.isNonEmptyString(docHeading.color) && !this.isNonEmptyString(heading.color)) {
        heading.color = docHeading.color!.trim();
      }
    });

    return attrs;
  }

  private normalizeRawDocxStyles(raw: any): RawDocxStyles {
    const fonts = this.toUniqueStrings(raw?.fonts || []);
    const fontSizes = this.toUniqueNumbers(raw?.fontSizes || []);
    const lineHeights = this.toUniqueNumbers(raw?.lineHeights || []);
    const colors = this.toUniqueStrings(raw?.colors || [])
      .map(color => this.normalizeColor(color))
      .filter((color): color is string => Boolean(color));

    const headingStyles: RawDocxStyles['headingStyles'] = {};
    if (raw?.headingStyles && typeof raw.headingStyles === 'object') {
      Object.entries(raw.headingStyles).forEach(([key, value]) => {
        if (!value || typeof value !== 'object') {
          headingStyles[key] = {};
          return;
        }
        const normalizedHeading: RawDocxStyles['headingStyles'][string] = {};
        if (this.isNonEmptyString((value as any).font)) {
          normalizedHeading.font = (value as any).font.trim();
        }
        const fontSize = this.coerceNumber((value as any).fontSize);
        if (fontSize !== undefined) {
          normalizedHeading.fontSize = fontSize;
        }
        const color = this.normalizeColor((value as any).color);
        if (color) {
          normalizedHeading.color = color;
        }
        if (typeof (value as any).bold === 'boolean') {
          normalizedHeading.bold = (value as any).bold;
        }
      headingStyles[key] = normalizedHeading;
    });
  }

    const paragraphStyles: RawDocxStyles['paragraphStyles'] = {};
    if (raw?.paragraphStyles && typeof raw.paragraphStyles === 'object') {
      Object.entries(raw.paragraphStyles).forEach(([key, value]) => {
        if (!value || typeof value !== 'object') return;
        const normalized: RawDocxStyles['paragraphStyles'][string] = {
          id: this.isNonEmptyString((value as any).id) ? (value as any).id.trim() : key
        };

        if (this.isNonEmptyString((value as any).name)) {
          normalized.name = (value as any).name.trim();
        }

        if (this.isNonEmptyString((value as any).type)) {
          normalized.type = (value as any).type;
        }

        if (this.isNonEmptyString((value as any).font)) {
          normalized.font = (value as any).font.trim();
        }

        const fontSize = this.coerceNumber((value as any).fontSize);
        if (fontSize !== undefined) {
          normalized.fontSize = fontSize;
        }

        const color = this.normalizeColor((value as any).color);
        if (color) {
          normalized.color = color;
        }

        if (this.isNonEmptyString((value as any).alignment)) {
          const alignment = (value as any).alignment.toLowerCase();
          if (['left', 'right', 'center', 'justify'].includes(alignment)) {
            normalized.alignment = alignment as 'left' | 'right' | 'center' | 'justify';
          }
        }

        const spacingBefore = this.coerceNumber((value as any).spacingBefore);
        if (spacingBefore !== undefined) {
          normalized.spacingBefore = spacingBefore;
        }

        const spacingAfter = this.coerceNumber((value as any).spacingAfter);
        if (spacingAfter !== undefined) {
          normalized.spacingAfter = spacingAfter;
        }

        const lineHeight = this.coerceNumber((value as any).lineHeight);
        if (lineHeight !== undefined) {
          normalized.lineHeight = lineHeight;
        }

        const indentRaw = (value as any).indent;
        if (indentRaw && typeof indentRaw === 'object') {
          const indent: NonNullable<RawDocxStyles['paragraphStyles'][string]['indent']> = {};
          const left = this.coerceNumber(indentRaw.left);
          const right = this.coerceNumber(indentRaw.right);
          const firstLine = this.coerceNumber(indentRaw.firstLine);
          const hanging = this.coerceNumber(indentRaw.hanging);
          if (left !== undefined) indent.left = left;
          if (right !== undefined) indent.right = right;
          if (firstLine !== undefined) indent.firstLine = firstLine;
          if (hanging !== undefined) indent.hanging = hanging;
          if (Object.keys(indent).length) {
            normalized.indent = indent;
          }
        }

        const numberingRaw = (value as any).numbering;
        if (numberingRaw && typeof numberingRaw === 'object') {
          const numbering = {
            numId: this.isNonEmptyString(numberingRaw.numId) ? numberingRaw.numId.trim() : undefined,
            abstractNumId: this.isNonEmptyString(numberingRaw.abstractNumId) ? numberingRaw.abstractNumId.trim() : undefined,
            level: this.coerceNumber(numberingRaw.level),
            numFormat: this.isNonEmptyString(numberingRaw.numFormat) ? numberingRaw.numFormat : undefined,
            levelText: this.isNonEmptyString(numberingRaw.levelText) ? numberingRaw.levelText : undefined
          };
          if (
            numbering.numId !== undefined ||
            numbering.abstractNumId !== undefined ||
            numbering.level !== undefined ||
            numbering.numFormat !== undefined ||
            numbering.levelText !== undefined
          ) {
            normalized.numbering = numbering;
          }
        }

        paragraphStyles[key] = normalized;
      });
    }

    return {
      fonts,
      fontSizes,
      colors,
      lineHeights,
      paragraphSpacing: {
        before: this.toUniqueNumbers(raw?.paragraphSpacing?.before || []),
        after: this.toUniqueNumbers(raw?.paragraphSpacing?.after || [])
      },
      defaultFont: this.isNonEmptyString(raw?.defaultFont) ? raw.defaultFont.trim() : undefined,
      defaultFontSize: this.coerceNumber(raw?.defaultFontSize),
      defaultColor: this.normalizeColor(raw?.defaultColor),
      defaultAlignment: this.isNonEmptyString(raw?.defaultAlignment)
        ? (raw.defaultAlignment.toLowerCase() as RawDocxStyles['defaultAlignment'])
        : undefined,
      defaultLineHeight: this.coerceNumber(raw?.defaultLineHeight),
      headingStyles,
      paragraphStyles,
      bulletSymbols: this.toUniqueStrings(raw?.bulletSymbols || []),
      numberingFormats: this.toUniqueStrings(raw?.numberingFormats || []),
      numberingMap: this.normalizeNumberingMap(raw?.numberingMap),
      numIdToAbstract: this.normalizeNumIdMap(raw?.numIdToAbstract)
    };
  }

  private cloneRawDocxStyles(styles: RawDocxStyles): RawDocxStyles {
    return {
      fonts: [...styles.fonts],
      fontSizes: [...styles.fontSizes],
      colors: [...styles.colors],
      lineHeights: [...styles.lineHeights],
      paragraphSpacing: {
        before: [...styles.paragraphSpacing.before],
        after: [...styles.paragraphSpacing.after]
      },
      defaultFont: styles.defaultFont,
      defaultFontSize: styles.defaultFontSize,
      defaultColor: styles.defaultColor,
      defaultAlignment: styles.defaultAlignment,
      defaultLineHeight: styles.defaultLineHeight,
      headingStyles: Object.entries(styles.headingStyles || {}).reduce((acc, [key, value]) => {
        acc[key] = { ...value };
        return acc;
      }, {} as RawDocxStyles['headingStyles']),
      paragraphStyles: Object.entries(styles.paragraphStyles || {}).reduce((acc, [key, value]) => {
        acc[key] = {
          ...value,
          indent: value.indent ? { ...value.indent } : undefined,
          numbering: value.numbering ? { ...value.numbering } : undefined
        };
        return acc;
      }, {} as RawDocxStyles['paragraphStyles']),
      bulletSymbols: [...styles.bulletSymbols],
      numberingFormats: [...styles.numberingFormats],
      numberingMap: Object.entries(styles.numberingMap || {}).reduce((acc, [key, value]) => {
        acc[key] = {
          abstractNumId: value.abstractNumId,
          levels: Object.entries(value.levels || {}).reduce((lvlAcc, [lvlKey, lvlVal]) => {
            lvlAcc[Number(lvlKey)] = { ...lvlVal };
            return lvlAcc;
          }, {} as { [level: number]: { numFormat?: string; levelText?: string } })
        };
        return acc;
      }, {} as RawDocxStyles['numberingMap']),
      numIdToAbstract: { ...styles.numIdToAbstract }
    };
  }

  private mergeUniqueStrings(primary: string[], additions: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    const addValue = (value?: string) => {
      if (!this.isNonEmptyString(value)) return;
      const trimmed = value.trim();
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(trimmed);
      }
    };

    primary.forEach(addValue);
    additions.forEach(addValue);

    return result;
  }

  private mergeUniqueNumbers(primary: number[], additions: number[]): number[] {
    const seen = new Set<number>();
    const result: number[] = [];

    const addValue = (value?: number) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      if (!seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    };

    primary.forEach(addValue);
    additions.forEach(addValue);

    return result.sort((a, b) => a - b);
  }

  private toUniqueStrings(input: any): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    this.toIterableArray(input).forEach(value => {
      if (!this.isNonEmptyString(value)) return;
      const trimmed = (value as string).trim();
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(trimmed);
      }
    });
    return result;
  }

  private toUniqueNumbers(input: any): number[] {
    const seen = new Set<number>();
    const result: number[] = [];
    this.toIterableArray(input).forEach(value => {
      const num = this.coerceNumber(value);
      if (num === undefined) return;
      if (!seen.has(num)) {
        seen.add(num);
        result.push(num);
      }
    });
    return result.sort((a, b) => a - b);
  }

  private toIterableArray(input: any): any[] {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (input instanceof Set) return Array.from(input);
    return [];
  }

  private normalizeColor(value: any): string | undefined {
    if (!this.isNonEmptyString(value)) {
      return undefined;
    }
    const trimmed = (value as string).trim();
    if (!trimmed) return undefined;
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }

  private normalizeNumberingMap(input: any): RawDocxStyles['numberingMap'] {
    const map: RawDocxStyles['numberingMap'] = {};
    if (!input || typeof input !== 'object') {
      return map;
    }

    Object.entries(input).forEach(([abstractId, value]) => {
      if (!value || typeof value !== 'object') return;
      const levels: { [level: number]: { numFormat?: string; levelText?: string } } = {};
      const levelEntries = (value as any).levels;
      if (levelEntries && typeof levelEntries === 'object') {
        Object.entries(levelEntries).forEach(([levelKey, levelValue]) => {
          if (!levelValue || typeof levelValue !== 'object') return;
          const numFormat = this.isNonEmptyString((levelValue as any).numFormat)
            ? (levelValue as any).numFormat
            : undefined;
          const levelText = this.isNonEmptyString((levelValue as any).levelText)
            ? (levelValue as any).levelText
            : undefined;
          levels[Number(levelKey)] = {
            numFormat,
            levelText
          };
        });
      }

      map[abstractId] = {
        abstractNumId: abstractId,
        levels
      };
    });

    return map;
  }

  private normalizeNumIdMap(input: any): Record<string, string> {
    const map: Record<string, string> = {};
    if (!input || typeof input !== 'object') {
      return map;
    }

    Object.entries(input).forEach(([key, value]) => {
      if (!this.isNonEmptyString(value)) return;
      map[key] = (value as string).trim();
    });

    return map;
  }

  private coerceNumber(value: any): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private isNonEmptyString(value: any): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private normalizeHeadingKey(key: string): string {
    const normalized = key.toLowerCase().replace(/\s+/g, '');
    if (normalized === 'heading1') return 'h1';
    if (normalized === 'heading2') return 'h2';
    if (normalized === 'heading3') return 'h3';
    return key;
  }

  /**
   * Detect document type from content
   */
  private detectDocumentType(text: string): string {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('memo') || lowerText.includes('memorandum')) {
      return 'memo';
    }
    if (lowerText.includes('chapter') && lowerText.includes('section')) {
      return 'book';
    }
    if (lowerText.includes('abstract') && lowerText.includes('references')) {
      return 'academic';
    }
    if (lowerText.includes('invoice') || lowerText.includes('total') && lowerText.includes('amount')) {
      return 'invoice';
    }
    if (lowerText.includes('dear') && lowerText.includes('sincerely')) {
      return 'letter';
    }

    return 'general';
  }

  /**
   * Get default style attributes - returns null/empty values for undetectable properties
   */
  private getDefaultAttributes(): StyleAttributes {
    return {
      document: {
        pageSize: null as any,
        pageOrientation: null as any,
        margins: { top: null as any, bottom: null as any, left: null as any, right: null as any },
        lineHeight: null as any,
        defaultFont: null as any,
        defaultFontSize: null as any,
        defaultColor: null as any,
        backgroundColor: null as any
      },
      typography: {
        fonts: [],
        fontSizes: [],
        headings: {
          h1: {
            fontSize: null as any,
            fontWeight: null as any,
            fontStyle: null as any,
            color: null as any,
            marginTop: null as any,
            marginBottom: null as any,
            alignment: null as any
          },
          h2: {
            fontSize: null as any,
            fontWeight: null as any,
            fontStyle: null as any,
            color: null as any,
            marginTop: null as any,
            marginBottom: null as any,
            alignment: null as any
          },
          h3: {
            fontSize: null as any,
            fontWeight: null as any,
            fontStyle: null as any,
            color: null as any,
            marginTop: null as any,
            marginBottom: null as any,
            alignment: null as any
          }
        },
        bodyText: {
          font: null as any,
          fontSize: null as any,
          fontWeight: null as any,
          color: null as any,
          lineHeight: null as any,
          paragraphSpacing: null as any,
          alignment: null as any
        }
      },
      paragraphs: {
        spacing: { before: null as any, after: null as any, line: null as any },
        indentation: { left: null as any, right: null as any },
        alignment: null as any
      },
      lists: {
        bulleted: {
          symbol: null as any,
          indentLevel: null as any,
          spacing: null as any
        },
        numbered: {
          format: null as any,
          indentLevel: null as any,
          spacing: null as any
        }
      },
      tables: {
        borderStyle: null as any,
        borderWidth: null as any,
        borderColor: null as any,
        cellPadding: null as any,
        cellSpacing: null as any
      },
      sections: {
        spacing: { before: 12, after: 12 }
      },
      headerFooter: {},
      special: {},
      colors: {
        primary: null as any,
        text: {
          primary: null as any,
          secondary: null as any
        },
        background: {
          primary: null as any
        }
      },
      layout: {
        sectionBreaks: null as any,
        whitespace: {
          preserveMultipleSpaces: null as any,
          preserveLineBreaks: null as any,
          trimTrailingSpaces: null as any
        }
      },
      metadata: {
        language: 'en',
        direction: 'ltr'
      }
    };
  }

  /**
   * Get default simplified attributes - returns null/empty values
   */
  private getDefaultSimplifiedAttributes(): SimplifiedStyleAttributes {
    return {
      font: null as any,
      fontSize: null as any,
      lineHeight: null as any,
      paragraphSpacing: null as any,
      headingStyles: {
        h1: { fontSize: null as any, fontWeight: null as any },
        h2: { fontSize: null as any, fontWeight: null as any },
        h3: { fontSize: null as any, fontWeight: null as any }
      },
      listStyle: null as any,
      colors: {
        text: null as any,
        heading: null as any,
        background: null as any
      },
      margins: { top: null as any, bottom: null as any, left: null as any, right: null as any }
    };
  }
}
