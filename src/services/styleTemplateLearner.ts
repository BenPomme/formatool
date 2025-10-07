import { FormattingStyle, DocumentStructure, ElementType } from '../types';
import { getOpenAIClient, OPENAI_MODELS } from './openaiClient';
import { getCustomStyle } from './customStyleRegistry';
import { RawDocxStyles, StyleExtractionResult } from '../types/styleAttributes';
import { normalizeBulletSymbol } from '../utils/styleNormalization';

export interface StyleTemplate {
  styleId: string;
  rules: Record<ElementType, FormattingRule>;
  generalRules: GeneralFormattingRules;
}

interface FormattingRule {
  markdown: {
    prefix?: string;
    suffix?: string;
    wrapper?: string;
    level?: number;
  };
  spacing: {
    before?: number; // Lines before
    after?: number;  // Lines after
  };
  formatting: {
    bold?: boolean;
    italic?: boolean;
    uppercase?: boolean;
    center?: boolean;
    indent?: boolean | number;
  };
  special?: {
    pageBreak?: boolean;
    underline?: boolean;
    numbering?: string; // e.g., "1.", "a)", "Chapter {n}"
  };
  typography?: {
    font?: string;
    fontSize?: number;
    color?: string;
  };
}

interface GeneralFormattingRules {
  paragraphSpacing: number;
  indentSize: number;
  lineLength?: number;
  useJustification?: boolean;
  lineHeight?: number;
  baseAlignment?: 'left' | 'center' | 'right' | 'justify';
  defaultFont?: string;
  defaultFontSize?: number;
  defaultColor?: string;
  bulletSymbol: string;
  numberFormat: string;
}

export class StyleTemplateLearner {
  private static readonly TEMPLATE_VERSION = 'v3';
  private openai: any;
  private templateCache: Map<string, StyleTemplate> = new Map();

  constructor() {
    this.openai = getOpenAIClient() as any;
  }

  /**
   * Learn formatting rules from a style using a SMALL sample
   * This creates a template that can be applied locally without AI
   */
  async learnStyleTemplate(
    style: FormattingStyle,
    sampleStructure: DocumentStructure
  ): Promise<StyleTemplate> {
    const cacheKey = this.getCacheKey(style.id);
    // Check cache first
    if (this.templateCache.has(cacheKey)) {
      console.log(`📚 Using cached template for ${style.name}`);
      return this.templateCache.get(cacheKey)!;
    }

    const customExtraction = getCustomStyle(style.id);
    if (customExtraction) {
      const template = this.buildTemplateFromExtraction(customExtraction, style.id, sampleStructure);
      this.templateCache.set(cacheKey, template);
      return template;
    }

    console.log(`🎓 Learning style template for: ${style.name}`);

    // Create a small representative sample
    const sample = this.createRepresentativeSample(sampleStructure);

    // Get AI to format the sample and extract rules
    const rules = await this.extractFormattingRules(style, sample);

    // Create template
    const template: StyleTemplate = {
      styleId: style.id,
      rules: this.parseFormattingRules(rules, style.id),
      generalRules: this.getGeneralRules(style.id)
    };

    // Cache for future use
    this.templateCache.set(cacheKey, template);

    console.log(`✅ Style template learned and cached`);
    return template;
  }

  private buildTemplateFromExtraction(
    extraction: StyleExtractionResult,
    styleId: string,
    sampleStructure: DocumentStructure
  ): StyleTemplate {
    console.log('🧩 Building style template from extracted DOCX styles');

    const simplified = extraction.simplified;
    const raw = extraction.rawDocxStyles;

    const rawStyles = raw ?? null;
    const paragraphSpacingPt = this.resolveParagraphSpacing(simplified.paragraphSpacing, rawStyles);
    const paragraphSpacing = this.pointsToBlankLines(paragraphSpacingPt, 1);
    const indentSize = this.resolveIndentSize(rawStyles);
    const bulletSymbol = normalizeBulletSymbol(
      this.resolveBulletSymbol(rawStyles, simplified.listStyle)
    );
    const numberFormat = this.resolveNumberFormat(rawStyles);
    const lineHeight = this.resolveLineHeight(simplified.lineHeight, rawStyles);
    const baseAlignment = rawStyles?.defaultAlignment;

    const generalRules: GeneralFormattingRules = {
      paragraphSpacing,
      indentSize,
      bulletSymbol,
      numberFormat,
      useJustification: baseAlignment === 'justify',
      lineHeight,
      baseAlignment,
      defaultFont: rawStyles?.defaultFont || simplified.font,
      defaultFontSize: rawStyles?.defaultFontSize || simplified.fontSize,
      defaultColor: rawStyles?.defaultColor || simplified.colors?.text
    };

    const headingRules = this.mergeHeadingRules(simplified.headingStyles, raw?.headingStyles);

    const rules: Record<ElementType, FormattingRule> = {} as any;

    const setRule = (type: ElementType, rule: FormattingRule) => {
      rules[type] = rule;
    };

    const titleStyle = this.findParagraphStyle(rawStyles, style => this.matchesStyle(style, ['title']));
    const chapterStyle = this.findParagraphStyle(rawStyles, style => this.matchesStyle(style, ['heading 1', 'heading1']));
    const sectionStyle = this.findParagraphStyle(rawStyles, style => this.matchesStyle(style, ['heading 2', 'heading2']));
    const subsectionStyle = this.findParagraphStyle(rawStyles, style => this.matchesStyle(style, ['heading 3', 'heading3']));

    setRule(
      'title',
      this.createHeadingRule(
        '',
        headingRules.h1,
        this.spacingFromParagraphStyle(titleStyle, { before: 0, after: 2 }),
        {
          bold: true,
          uppercase: true,
          center: titleStyle?.alignment === 'center'
        }
      )
    );

    setRule(
      'chapter',
      this.createHeadingRule(
        '',
        headingRules.h1,
        this.spacingFromParagraphStyle(chapterStyle, { before: 2, after: 1 }),
        {
          bold: true,
          center: chapterStyle?.alignment === 'center'
        }
      )
    );

    setRule(
      'section',
      this.createHeadingRule(
        '',
        headingRules.h2,
        this.spacingFromParagraphStyle(sectionStyle, { before: 1, after: 1 }),
        {
          bold: true,
          center: sectionStyle?.alignment === 'center'
        }
      )
    );

    setRule(
      'subsection',
      this.createHeadingRule(
        '',
        headingRules.h3,
        this.spacingFromParagraphStyle(subsectionStyle, { before: 1, after: 1 }),
        {
          italic: true,
          center: subsectionStyle?.alignment === 'center'
        }
      )
    );

    setRule('paragraph', {
      markdown: { prefix: '' },
      spacing: { before: 0, after: paragraphSpacing },
      formatting: {
        bold: false,
        italic: false,
        uppercase: false,
        center: false,
        indent: indentSize > 0 ? indentSize : false
      },
      special: {},
      typography: {
        font: generalRules.defaultFont,
        fontSize: generalRules.defaultFontSize,
        color: generalRules.defaultColor
      }
    });

    setRule('bulletList', {
      markdown: { prefix: '' },
      spacing: { before: 0, after: Math.max(1, paragraphSpacing) },
      formatting: {},
      special: {},
      typography: {
        font: generalRules.defaultFont,
        fontSize: generalRules.defaultFontSize,
        color: generalRules.defaultColor
      }
    });

    setRule('numberedList', {
      markdown: { prefix: '' },
      spacing: { before: 0, after: paragraphSpacing },
      formatting: {},
      special: { numbering: numberFormat },
      typography: {
        font: generalRules.defaultFont,
        fontSize: generalRules.defaultFontSize,
        color: generalRules.defaultColor
      }
    });

    // Table rule: use extracted fonts when no table examples exist in reference
    setRule('table', {
      markdown: { prefix: '' },
      spacing: { before: 1, after: 1 },
      formatting: {},
      special: {},
      typography: {
        font: generalRules.defaultFont,
        fontSize: generalRules.defaultFontSize,
        color: generalRules.defaultColor
      }
    });

    const defaultTypes: ElementType[] = [
      'tableOfContents', 'footnote', 'citation', 'codeBlock',
      'imageCaption', 'header', 'footer'
    ];

    defaultTypes.forEach(type => {
      if (!rules[type]) {
        rules[type] = this.getDefaultRules('business-memo')[type];
      }
    });

    return {
      styleId,
      rules,
      generalRules
    };
  }

  private getCacheKey(styleId: string): string {
    return `${styleId}::${StyleTemplateLearner.TEMPLATE_VERSION}`;
  }

  private mergeHeadingRules(
    simplifiedHeadings: Record<string, any> | undefined,
    rawHeadings: Record<string, any> | undefined
  ): Record<string, { font?: string; fontSize?: number; color?: string }> {
    const merged: Record<string, { font?: string; fontSize?: number; color?: string }> = {};

    const apply = (key: string, value: any) => {
      const normalized = key.toLowerCase();
      if (!merged[normalized]) merged[normalized] = {};
      if (value?.font) merged[normalized].font = value.font;
      if (value?.fontSize) merged[normalized].fontSize = value.fontSize;
      if (value?.color) merged[normalized].color = value.color;
    };

    Object.entries(simplifiedHeadings || {}).forEach(([key, value]) => apply(key, value));
    Object.entries(rawHeadings || {}).forEach(([key, value]) => apply(key, value));

    return merged;
  }

  private resolveParagraphSpacing(
    simplifiedSpacing: number | undefined,
    rawStyles: RawDocxStyles | null
  ): number {
    if (typeof simplifiedSpacing === 'number' && simplifiedSpacing > 0) {
      return simplifiedSpacing;
    }

    const rawAfter = rawStyles?.paragraphSpacing?.after;
    if (rawAfter && rawAfter.length) {
      const avg = this.average(rawAfter);
      if (avg !== undefined) return avg;
    }

    const rawBefore = rawStyles?.paragraphSpacing?.before;
    if (rawBefore && rawBefore.length) {
      const avg = this.average(rawBefore);
      if (avg !== undefined) return avg;
    }

    return 12; // default single line spacing in points
  }

  private resolveIndentSize(rawStyles: RawDocxStyles | null): number {
    const normalStyle = this.findParagraphStyle(rawStyles, style =>
      this.matchesStyle(style, ['normal', 'body text'])
    );

    const indentPoints = normalStyle?.indent?.firstLine || normalStyle?.indent?.left;
    if (indentPoints === undefined) {
      return 0;
    }

    return this.pointsToSpaceCount(indentPoints);
  }

  private resolveBulletSymbol(
    rawStyles: RawDocxStyles | null,
    fallback?: string
  ): string {
    const fromStyles = rawStyles?.bulletSymbols?.find(symbol => symbol && symbol.trim().length > 0);
    if (fromStyles) {
      return fromStyles.trim();
    }

    if (fallback && fallback.trim().length > 0) {
      return fallback.trim();
    }

    return '•';
  }

  private resolveNumberFormat(rawStyles: RawDocxStyles | null): string {
    if (rawStyles?.numberingMap) {
      for (const numbering of Object.values(rawStyles.numberingMap)) {
        if (!numbering?.levels) continue;
        for (const level of Object.values(numbering.levels)) {
          if (!level) continue;
          const { numFormat, levelText } = level;
          if (numFormat && numFormat !== 'bullet') {
            if (levelText) {
              const normalized = levelText.replace(/%\d/g, '1').trim();
              if (normalized) {
                return normalized;
              }
            }
            const mapped = this.mapNumberFormat(numFormat);
            if (mapped) {
              return mapped;
            }
          }
        }
      }
    }
    return '1.';
  }

  private resolveLineHeight(
    simplifiedLineHeight: number | undefined,
    rawStyles: RawDocxStyles | null
  ): number | undefined {
    if (typeof simplifiedLineHeight === 'number' && simplifiedLineHeight > 0) {
      return simplifiedLineHeight;
    }

    if (rawStyles?.defaultLineHeight && rawStyles.defaultLineHeight > 0) {
      return rawStyles.defaultLineHeight;
    }

    if (rawStyles?.lineHeights && rawStyles.lineHeights.length) {
      const avg = this.average(rawStyles.lineHeights);
      if (avg !== undefined) return avg;
    }

    return undefined;
  }

  private findParagraphStyle(
    rawStyles: RawDocxStyles | null,
    predicate: (style: RawDocxStyles['paragraphStyles'][string]) => boolean
  ): RawDocxStyles['paragraphStyles'][string] | undefined {
    if (!rawStyles?.paragraphStyles) return undefined;
    return Object.values(rawStyles.paragraphStyles).find(style => predicate(style));
  }

  private matchesStyle(
    style: RawDocxStyles['paragraphStyles'][string] | undefined,
    keywords: string[]
  ): boolean {
    if (!style) return false;
    const name = style.name?.toLowerCase() || '';
    const id = style.id?.toLowerCase() || '';
    return keywords.some(keyword => {
      const normalized = keyword.toLowerCase().replace(/\s+/g, '');
      return name.replace(/\s+/g, '').includes(normalized) || id.replace(/\s+/g, '').includes(normalized);
    });
  }

  private spacingFromParagraphStyle(
    style: RawDocxStyles['paragraphStyles'][string] | undefined,
    fallback: { before: number; after: number }
  ): { before: number; after: number } {
    if (!style) {
      return fallback;
    }

    const before = this.pointsToBlankLines(style.spacingBefore, fallback.before);
    const after = this.pointsToBlankLines(style.spacingAfter, fallback.after);

    return { before, after };
  }

  private createHeadingRule(
    _prefix: string,
    _ruleData: { font?: string; fontSize?: number; color?: string } | undefined,
    spacing: { before: number; after: number },
    formatting: { bold?: boolean; italic?: boolean; uppercase?: boolean; center?: boolean }
  ): FormattingRule {
    return {
      markdown: { prefix: '' },
      spacing,
      formatting: {
        bold: formatting.bold ?? true,
        italic: formatting.italic ?? false,
        uppercase: formatting.uppercase ?? false,
        center: formatting.center ?? false
      },
      special: {
        numbering: undefined,
        underline: false,
        pageBreak: false
      },
      typography: {
        font: _ruleData?.font,
        fontSize: _ruleData?.fontSize,
        color: _ruleData?.color
      }
    };
  }

  private createRepresentativeSample(structure: DocumentStructure): string {
    // Take first few elements of each type (max 2000 chars total)
    const sampleElements: string[] = [];
    const typesSeen = new Set<ElementType>();
    let totalLength = 0;
    const maxLength = 2000;

    for (const element of structure.elements) {
      if (totalLength > maxLength) break;

      // Include at least one of each type
      if (!typesSeen.has(element.type) || element.type === 'paragraph') {
        const elementSample = `[${element.type.toUpperCase()}]: ${element.content.substring(0, 200)}`;
        sampleElements.push(elementSample);
        typesSeen.add(element.type);
        totalLength += elementSample.length;

        // Include max 2 paragraphs
        if (element.type === 'paragraph' &&
            sampleElements.filter(s => s.includes('[PARAGRAPH]')).length >= 2) {
          continue;
        }
      }
    }

    return sampleElements.join('\n\n');
  }

  private async extractFormattingRules(
    style: FormattingStyle,
    sample: string
  ): Promise<string> {
    const prompt = `You are analyzing formatting rules for the "${style.name}" style.

Given this document sample with labeled elements, describe the EXACT markdown formatting rules that should be applied to each element type.

Sample:
${sample}

For each element type present, specify:
1. Markdown syntax to use (e.g., # for title, ## for chapter, **text** for bold)
2. Line spacing before/after (e.g., 2 blank lines after chapters)
3. Special formatting (uppercase, centering, indentation)
4. Any numbering patterns

Return as JSON with this structure:
{
  "title": { "markdown": "#", "spacing_before": 0, "spacing_after": 2, "uppercase": true },
  "chapter": { "markdown": "##", "spacing_before": 3, "spacing_after": 2, "prefix": "Chapter {n}: " },
  "section": { "markdown": "###", "spacing_before": 2, "spacing_after": 1 },
  "paragraph": { "indent": true, "spacing_after": 1 },
  "bulletList": { "symbol": "-", "indent": 2 },
  // ... etc
}

Base your rules on this style guide:
${style.systemPrompt}

Be specific and practical.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: OPENAI_MODELS.FORMATTING,
        messages: [
          {
            role: 'system',
            content: 'You are a document formatting expert. Extract precise formatting rules as JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });

      return response.choices[0]?.message?.content || '{}';
    } catch (error) {
      console.error('Error learning style:', error);
      return '{}';
    }
  }

  private parseFormattingRules(rulesJson: string, styleId: string): Record<ElementType, FormattingRule> {
    try {
      const parsed = JSON.parse(rulesJson);
      const rules: Record<ElementType, FormattingRule> = {} as any;

      // Define all element types with defaults
      const elementTypes: ElementType[] = [
        'title', 'chapter', 'section', 'subsection', 'paragraph',
        'bulletList', 'numberedList', 'table', 'tableOfContents',
        'footnote', 'citation', 'codeBlock', 'imageCaption', 'header', 'footer'
      ];

      elementTypes.forEach(type => {
        const ruleData = parsed[type] || {};

        rules[type] = {
          markdown: {
            prefix: ruleData.markdown || this.getDefaultMarkdown(type),
            suffix: ruleData.suffix || '',
            wrapper: ruleData.wrapper,
            level: ruleData.level
          },
          spacing: {
            before: ruleData.spacing_before ?? this.getDefaultSpacing(type, 'before'),
            after: ruleData.spacing_after ?? this.getDefaultSpacing(type, 'after')
          },
          formatting: {
            bold: ruleData.bold || (type === 'title' && styleId === 'business-memo'),
            italic: ruleData.italic,
            uppercase: ruleData.uppercase || (type === 'title' && styleId === 'business-memo'),
            center: ruleData.center || (type === 'title'),
            indent: ruleData.indent || (type === 'paragraph' && styleId !== 'business-memo')
          },
          special: {
            pageBreak: ruleData.page_break,
            underline: ruleData.underline,
            numbering: ruleData.prefix || ruleData.numbering
          }
        };
      });

      return rules;
    } catch (error) {
      console.error('Error parsing formatting rules:', error);
      return this.getDefaultRules(styleId);
    }
  }

  private getDefaultMarkdown(_type: ElementType): string {
    return '';
  }

  private pointsToBlankLines(points?: number, fallback = 0): number {
    if (points === undefined || !Number.isFinite(points)) {
      return fallback;
    }
    const lines = Math.round(points / 12);
    return lines >= 0 ? lines : fallback;
  }

  private pointsToSpaceCount(points?: number): number {
    if (points === undefined || !Number.isFinite(points)) {
      return 0;
    }
    const spaces = Math.round(points / 4);
    return spaces > 0 ? spaces : 0;
  }

  private mapNumberFormat(numFormat: string): string | undefined {
    const normalized = numFormat.toLowerCase();
    switch (normalized) {
      case 'decimal':
        return '1.';
      case 'decimalzero':
        return '01.';
      case 'lowerletter':
        return 'a.';
      case 'upperletter':
        return 'A.';
      case 'lowerroman':
        return 'i.';
      case 'upperroman':
        return 'I.';
      default:
        return undefined;
    }
  }

  private average(values: number[] | undefined): number | undefined {
    if (!values || !values.length) return undefined;
    const sum = values.reduce((acc, value) => acc + value, 0);
    return sum / values.length;
  }

  private getDefaultSpacing(type: ElementType, position: 'before' | 'after'): number {
    if (position === 'before') {
      if (type === 'chapter') return 3;
      if (type === 'section') return 2;
      return 0;
    } else {
      if (type === 'title' || type === 'chapter') return 2;
      if (type === 'section' || type === 'subsection') return 1;
      if (type === 'paragraph') return 1;
      return 0;
    }
  }

  private getGeneralRules(styleId: string): GeneralFormattingRules {
    // Style-specific general rules
    const styleRules: Record<string, GeneralFormattingRules> = {
      'business-memo': {
        paragraphSpacing: 1,
        indentSize: 0,
        bulletSymbol: '•',
        numberFormat: '1.',
        useJustification: false,
        defaultFont: 'Calibri',
        defaultFontSize: 11,
        defaultColor: '#2B2B2B'
      },
      'academic-paper': {
        paragraphSpacing: 1,
        indentSize: 4,
        bulletSymbol: '•',
        numberFormat: '(1)',
        useJustification: true,
        defaultFont: 'Times New Roman',
        defaultFontSize: 12,
        defaultColor: '#000000'
      },
      'book-manuscript': {
        paragraphSpacing: 2,
        indentSize: 4,
        bulletSymbol: '—',
        numberFormat: '1)',
        useJustification: false,
        defaultFont: 'Times New Roman',
        defaultFontSize: 12,
        defaultColor: '#000000'
      },
      'marketing-brief': {
        paragraphSpacing: 1,
        indentSize: 0,
        bulletSymbol: '▪',
        numberFormat: '1.',
        useJustification: false,
        defaultFont: 'Helvetica',
        defaultFontSize: 11,
        defaultColor: '#222222'
      },
      'technical-documentation': {
        paragraphSpacing: 1,
        indentSize: 2,
        bulletSymbol: '*',
        numberFormat: '1.',
        useJustification: false,
        defaultFont: 'Segoe UI',
        defaultFontSize: 11,
        defaultColor: '#202124'
      },
      'legal-contract': {
        paragraphSpacing: 1,
        indentSize: 4,
        bulletSymbol: '•',
        numberFormat: 'a.',
        useJustification: true,
        defaultFont: 'Times New Roman',
        defaultFontSize: 12,
        defaultColor: '#000000',
        lineLength: 80
      }
    };

    return styleRules[styleId] || styleRules['business-memo'];
  }

  private getDefaultRules(styleId: string): Record<ElementType, FormattingRule> {
    const rules: Record<ElementType, FormattingRule> = {} as any;
    const elementTypes: ElementType[] = [
      'title', 'chapter', 'section', 'subsection', 'paragraph',
      'bulletList', 'numberedList', 'table', 'tableOfContents',
      'footnote', 'citation', 'codeBlock', 'imageCaption', 'header', 'footer'
    ];

    elementTypes.forEach(type => {
      rules[type] = {
        markdown: {
          prefix: this.getDefaultMarkdown(type)
        },
        spacing: {
          before: this.getDefaultSpacing(type, 'before'),
          after: this.getDefaultSpacing(type, 'after')
        },
        formatting: {
          bold: type === 'title',
          uppercase: type === 'title' && styleId === 'business-memo',
          center: type === 'title'
        },
        special: {}
      };
    });

    return rules;
  }
}
