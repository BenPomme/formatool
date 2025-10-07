import {
  DocumentStructure,
  DocumentElement,
  ElementType,
  FormattedBlock,
  FormattedDocumentRepresentation,
  FormattedTextRun
} from '../types';
import { parseRichTextSegments } from '../utils/richText';
import { parseTableFromText, renderMarkdownTable } from '../utils/tableUtils';
import { StyleTemplate } from './styleTemplateLearner';

const STYLE_ACCENT_COLORS: Record<string, string> = {
  'sales-proposal': '#0F7B6C',
  'marketing-brief': '#C53030',
  'technical-manual': '#D97706',
  'meeting-minutes': '#2B6CB0'
};

const METRIC_PATTERNS: RegExp[] = [
  /[$£€]\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?/g,
  /\b\d+(?:\.\d+)?%/g,
  /\b\d+(?:\.\d+)?x\b/gi,
  /\b(?:ROI|ARR|MRR|EBITDA|LTV|CAC|NPS)\b/gi
];

const DATE_PATTERNS: RegExp[] = [
  /\b(?:Q[1-4]\s*\d{4})\b/gi,
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?/gi,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g
];

export class LocalFormattingEngine {
  private lastStructuredDocument?: FormattedDocumentRepresentation;

  /**
   * Apply formatting rules locally without AI
   * This can handle documents of ANY size with zero token usage
   */
  formatDocument(
    structure: DocumentStructure,
    template: StyleTemplate
  ): string {
    console.log('🎨 Applying local formatting with learned template...');

    const formattedElements: string[] = [];
    const structuredBlocks: FormattedBlock[] = [];
    const summary = {
      titles: 0,
      headings: 0,
      paragraphs: 0,
      lists: 0,
      tables: 0,
      other: 0
    };
    let chapterCount = 0;
    let sectionCount = 0;
    let subsectionCount = 0;
    let listItemCount = 0;

    structure.elements.forEach((element, index) => {
      const rule = template.rules[element.type];
      if (!rule) {
        // No specific rule, keep as-is
        formattedElements.push(element.content);
        return;
      }

      // Track numbering
      if (element.type === 'chapter') chapterCount++;
      if (element.type === 'section') sectionCount++;
      if (element.type === 'subsection') subsectionCount++;

      // Apply formatting
      let formatted = this.applyElementFormatting(
        element,
        rule,
        template.generalRules,
        {
          chapterNum: chapterCount,
          sectionNum: sectionCount,
          subsectionNum: subsectionCount,
          listItemNum: listItemCount
        },
        template
      );

      // Add spacing before
      if (rule.spacing.before && index > 0) {
        const spacingLines = '\n'.repeat(rule.spacing.before);
        formatted = spacingLines + formatted;
      }

      // Add spacing after
      if (rule.spacing.after) {
        const spacingLines = '\n'.repeat(rule.spacing.after);
        formatted = formatted + spacingLines;
      }

      formattedElements.push(formatted);
      structuredBlocks.push(
        this.createFormattedBlock(
          element,
          formatted,
          rule,
          template,
          {
            chapterNum: chapterCount,
            sectionNum: sectionCount,
            subsectionNum: subsectionCount,
            listItemNum: listItemCount
          },
          template.generalRules
        )
      );

      this.bumpSemanticSummary(summary, element.type);

      // Reset counters as needed
      if (element.type === 'chapter') {
        sectionCount = 0;
        subsectionCount = 0;
      }
      if (element.type === 'section') {
        subsectionCount = 0;
      }
    });

    const result = formattedElements.join('\n').trim();
    console.log(`✅ Local formatting complete: ${result.length} characters`);
    this.lastStructuredDocument = {
      text: result,
      blocks: structuredBlocks,
      styleId: template.styleId,
      generalDirectives: this.mapGeneralRules(template.generalRules)
    };
    return result;
  }

  getLastStructuredDocument(): FormattedDocumentRepresentation | undefined {
    return this.lastStructuredDocument;
  }

  private applyElementFormatting(
    element: DocumentElement,
    rule: any,
    generalRules: any,
    counters: any,
    template: StyleTemplate
  ): string {
    let content = this.applyStyleIntelligence(
      element.content,
      element,
      template,
      generalRules
    );

    // Apply special numbering
    if (rule.special?.numbering) {
      const numbering = rule.special.numbering
        .replace('{n}', counters.chapterNum || '')
        .replace('{N}', counters.sectionNum || '')
        .replace('{nn}', counters.subsectionNum || '');
      content = numbering + ' ' + content;
    }

    // Apply text transformations
    if (rule.formatting.uppercase) {
      content = content.toUpperCase();
    }

    // Apply markdown formatting
    if (rule.markdown.wrapper) {
      const wrapper = rule.markdown.wrapper;
      const startsWithWrapper = content.startsWith(wrapper);
      const endsWithWrapper = content.endsWith(wrapper);
      if (!startsWithWrapper || !endsWithWrapper) {
        content = `${wrapper}${content}${wrapper}`;
      }
    }

    if (rule.formatting.bold) {
      content = this.ensureWrapped(content, '**');
    }

    if (rule.formatting.italic) {
      content = this.ensureWrapped(content, '*');
    }

    // Apply element-specific adjustments without injecting markdown headings
    switch (element.type) {
      case 'chapter':
        if (rule.special?.pageBreak) {
          content = `\n\n${content}`;
        }
        break;

      case 'paragraph':
        if (rule.formatting.indent) {
          const indentSize = typeof rule.formatting.indent === 'number'
            ? rule.formatting.indent
            : generalRules.indentSize;
          if (indentSize > 0) {
            content = `${' '.repeat(indentSize)}${content}`;
          }
        }
        break;

      case 'bulletList':
      case 'numberedList': {
        const lines = content
          .split('\n')
          .map(line => line.replace(/^[-*•·◦▪▫◾◽○●\d\w][\.\)]?\s*/, '').trim())
          .filter(Boolean);
        content = lines.join('\n');
        break;
      }

      case 'table':
        const originalTableData = parseTableFromText(element.content);
        if (originalTableData && !this.isMarkdownTable(content)) {
          content = renderMarkdownTable(originalTableData);
        } else {
          // Ensure proper formatting if already markdown-style
          const tableLines = content.split('\n');
          if (tableLines.length > 1 && !tableLines[1].includes('---')) {
            const firstRow = tableLines[0];
            const columnCount = (firstRow.match(/\|/g) || []).length - 1;
            if (columnCount > 0) {
              const separator = '|' + ' --- |'.repeat(columnCount);
              tableLines.splice(1, 0, separator);
              content = tableLines.join('\n');
            }
          }
        }
        break;

      case 'codeBlock':
        // Ensure code blocks are properly formatted
        if (!content.startsWith('```')) {
          content = '```\n' + content + '\n```';
        }
        break;

      case 'tableOfContents':
        content = `## ${content}`;
        break;

      case 'footnote':
        content = `[^${counters.listItemNum || 1}]: ${content}`;
        break;

      case 'imageCaption':
        content = `*${content}*`;
        if (rule.formatting.center) {
          content = `<div align="center">${content}</div>`;
        }
        break;
    }

    // Apply prefix and suffix
    if (rule.markdown.prefix && !content.startsWith(rule.markdown.prefix)) {
      content = rule.markdown.prefix + ' ' + content;
    }
    if (rule.markdown.suffix) {
      content = content + ' ' + rule.markdown.suffix;
    }

    return content;
  }

  private createFormattedBlock(
    element: DocumentElement,
    renderedContent: string,
    rule: any,
    template: StyleTemplate,
    counters: any,
    generalRules: any
  ): FormattedBlock {
    const alignment: 'left' | 'center' | 'right' | 'justify' = rule.formatting?.center
      ? 'center'
      : generalRules?.baseAlignment || 'left';

    const lineHeight = generalRules?.lineHeight;
    const indentValue = typeof rule.formatting?.indent === 'number'
      ? rule.formatting.indent
      : generalRules?.indentSize || 0;

    const preparedText = this.prepareTextForRuns(
      renderedContent,
      element.type,
      generalRules?.bulletSymbol,
      typeof rule.formatting?.indent === 'number' ? rule.formatting.indent : generalRules?.indentSize
    );

    let runs: FormattedTextRun[] = [];
    let listItems: FormattedTextRun[][] | undefined;

    if (element.type === 'bulletList' || element.type === 'numberedList') {
      const lines = renderedContent
        .split('\n')
        .map(line => this.stripListMarker(line, generalRules?.bulletSymbol, element.type === 'numberedList'))
        .filter(Boolean);
      listItems = lines.map(line => this.buildRunsFromText(line));
    } else {
      runs = this.buildRunsFromText(preparedText);
    }

    const metadata: Record<string, any> = {
      rawContent: element.content,
      styleId: template.styleId,
      wrapper: rule.markdown?.wrapper,
      uppercase: rule.formatting?.uppercase,
      baseAlignment: alignment
    };

    const typography = this.resolveTypography(rule.typography, generalRules);
    const semanticInsight = this.buildSemanticInsight(
      element,
      rule,
      generalRules,
      typography,
      alignment
    );
    metadata.insight = semanticInsight;

    let tableData: { headers: string[]; rows: string[][] } | undefined;
    if (element.type === 'table') {
      const parsedTable = parseTableFromText(element.content);
      if (parsedTable) {
        tableData = parsedTable;
        metadata.tableData = parsedTable;
      }
    }

    return {
      id: `${element.id}-formatted`,
      elementId: element.id,
      type: element.type,
      numbering: rule.special?.numbering
        ?.replace('{n}', counters.chapterNum || '')
        ?.replace('{N}', counters.sectionNum || '')
        ?.replace('{nn}', counters.subsectionNum || ''),
      spacing: {
        before: rule.spacing?.before,
        after: rule.spacing?.after
      },
      alignment,
      lineHeight,
      indent: typeof indentValue === 'number' ? indentValue : 0,
      bulletSymbol: generalRules?.bulletSymbol,
      numberFormat: generalRules?.numberFormat,
      typography,
      runs,
      listItems,
      metadata,
      insights: semanticInsight,
      tableData
    };
  }

  private buildRunsFromText(content: string): FormattedTextRun[] {
    const segments = parseRichTextSegments(content);
    if (!segments.length) {
      return content
        ? [{ text: content }]
        : [];
    }

    return segments.map(segment => ({
      text: segment.text,
      bold: segment.bold || undefined,
      italic: segment.italic || undefined,
      color: segment.color
    }));
  }

  private isMarkdownTable(content: string): boolean {
    if (!content) return false;
    const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) return false;
    const header = lines[0];
    const separator = lines[1];
    return /\|/.test(header) && /\|?\s*:?-{3,}/.test(separator);
  }

  private resolveTypography(
    typography: { font?: string; fontSize?: number; color?: string } | undefined,
    generalRules: any
  ): { font?: string; fontSize?: number; color?: string } | undefined {
    const font = typography?.font || generalRules?.defaultFont;
    const fontSize = typography?.fontSize ?? generalRules?.defaultFontSize;
    const color = typography?.color || generalRules?.defaultColor;

    if (font === undefined && fontSize === undefined && color === undefined) {
      return undefined;
    }

    return {
      ...(font ? { font } : {}),
      ...(fontSize !== undefined ? { fontSize } : {}),
      ...(color ? { color } : {})
    };
  }

  private bumpSemanticSummary(summary: any, type: ElementType) {
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

  private buildSemanticInsight(
    element: DocumentElement,
    rule: any,
    generalRules: any,
    typography: { font?: string; fontSize?: number; color?: string } | undefined,
    alignment: 'left' | 'center' | 'right' | 'justify'
  ) {
    const baseInsight = element.metadata?.insight || {
      role: this.mapRole(element.type),
      confidence: 0.5,
      source: 'style-template'
    };

    const appliedTypography = {
      font: typography?.font || generalRules?.defaultFont,
      fontSizePt: typography?.fontSize || generalRules?.defaultFontSize,
      weight: rule.formatting?.bold ? 'bold' : 'normal',
      italic: Boolean(rule.formatting?.italic),
      color: typography?.color || generalRules?.defaultColor
    };

    const layout = {
      alignment,
      spacingBefore: rule.spacing?.before,
      spacingAfter: rule.spacing?.after,
      indent: typeof generalRules?.indentSize === 'number' ? generalRules.indentSize : undefined
    };

    return {
      ...baseInsight,
      typography: appliedTypography,
      layout,
      source: 'style-template'
    };
  }

  private mapRole(type: ElementType) {
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
        return 'paragraph';
    }
  }

  private prepareTextForRuns(
    content: string,
    type: ElementType,
    bulletSymbol?: string,
    indentSpaces?: number
  ): string {
    let prepared = content;

    if (type === 'title' || type === 'chapter' || type === 'section' || type === 'subsection') {
      prepared = prepared.replace(/^#+\s*/, '');
    }

    if (indentSpaces && indentSpaces > 0) {
      const indentRegex = new RegExp(`^\s{0,${indentSpaces}}`);
      prepared = prepared.replace(indentRegex, '').trimStart();
    }

    if (type === 'bulletList') {
      prepared = prepared
        .split('\n')
        .map(line => this.stripListMarker(line, bulletSymbol, false))
        .join('\n');
    }

    if (type === 'numberedList') {
      prepared = prepared
        .split('\n')
        .map(line => this.stripListMarker(line, bulletSymbol, true))
        .join('\n');
    }

    return prepared;
  }

  private stripListMarker(line: string, bulletSymbol?: string, isNumbered?: boolean): string {
    if (!line) return '';
    let cleaned = line.trim();

    if (isNumbered) {
      cleaned = cleaned.replace(/^\d+[\.\)]\s*/, '');
      cleaned = cleaned.replace(/^[a-zA-Z][\.\)]\s*/, '');
    } else {
      const symbol = bulletSymbol ? this.escapeRegExp(bulletSymbol) : '\\*\-•·◦▪▫◾◽○●';
      const regex = new RegExp(`^[${symbol}]\s*`);
      cleaned = cleaned.replace(regex, '');
    }

    return cleaned.trim();
  }

  private mapGeneralRules(generalRules: any) {
    if (!generalRules) {
      return undefined;
    }

    return {
      paragraphSpacing: generalRules.paragraphSpacing,
      indentSize: generalRules.indentSize,
      lineHeight: generalRules.lineHeight,
      baseAlignment: generalRules.baseAlignment,
      defaultFont: generalRules.defaultFont,
      defaultFontSize: generalRules.defaultFontSize,
      defaultColor: generalRules.defaultColor,
      bulletSymbol: generalRules.bulletSymbol,
      numberFormat: generalRules.numberFormat
    };
  }

  private applyStyleIntelligence(
    content: string,
    element: DocumentElement,
    template: StyleTemplate,
    generalRules: any
  ): string {
    if (!content || !content.trim()) {
      return content;
    }

    let enriched = content;

    switch (template.styleId) {
      case 'sales-proposal':
        enriched = this.applySalesProposalIntelligence(enriched, element, generalRules);
        break;
      case 'marketing-brief':
        enriched = this.applyMarketingBriefIntelligence(enriched, element, generalRules);
        break;
      case 'technical-manual':
        enriched = this.applyTechnicalManualIntelligence(enriched, element, generalRules);
        break;
      case 'meeting-minutes':
        enriched = this.applyMeetingMinutesIntelligence(enriched, element, generalRules);
        break;
      default:
        enriched = this.applyDefaultIntelligence(enriched, element);
    }

    enriched = this.applyGenericPolish(enriched, element, template.styleId);

    return enriched;
  }

  private applySalesProposalIntelligence(
    content: string,
    element: DocumentElement,
    generalRules: any
  ): string {
    let result = content;

    if (element.type === 'paragraph') {
      const bulletSymbol = generalRules.bulletSymbol || '-';
      result = this.convertDelimitedListToBullets(
        result,
        /^\s*((?:Key\s+)?(?:Benefits|Features|Highlights|Differentiators|Deliverables|Outcomes|Value Proposition|Success Metrics|Next Steps|Risks))[:\-]\s*(.+)$/i,
        bulletSymbol,
        { boldLabel: true, minItems: 2 }
      );
    }

    const accent = STYLE_ACCENT_COLORS['sales-proposal'];
    result = this.highlightMetrics(result, accent);
    result = this.applyBoldToKeywords(result, [
      'executive summary',
      'the challenge',
      'our solution',
      'value proposition',
      'next steps',
      'investment'
    ]);

    return result;
  }

  private applyMarketingBriefIntelligence(
    content: string,
    element: DocumentElement,
    generalRules: any
  ): string {
    let result = content;

    if (element.type === 'paragraph') {
      const bulletSymbol = generalRules.bulletSymbol || '-';
      result = this.convertDelimitedListToBullets(
        result,
        /^\s*((?:Key\s+)?(?:Messages|Objectives|Deliverables|Success Metrics|Target Audience|Call to Action|Insights))[:\-]\s*(.+)$/i,
        bulletSymbol,
        { boldLabel: true, minItems: 2 }
      );
    }

    const accent = STYLE_ACCENT_COLORS['marketing-brief'];
    result = this.highlightDates(result, accent);
    result = this.applyBoldToKeywords(result, [
      'campaign overview',
      'key messages',
      'call to action',
      'target audience',
      'success metrics'
    ]);

    return result;
  }

  private applyTechnicalManualIntelligence(
    content: string,
    element: DocumentElement,
    generalRules: any
  ): string {
    let result = content;

    const warningAccent = STYLE_ACCENT_COLORS['technical-manual'];
    result = result.replace(/(⚠️\s*WARNING:?)/gi, match =>
      this.decorateLabel(match, { color: warningAccent, bold: true })
    );

    result = result.replace(/(📝\s*NOTE:?)/gi, match =>
      this.decorateLabel(match, { color: '#2563EB', bold: true })
    );

    if (element.type === 'paragraph') {
      const bulletSymbol = generalRules.bulletSymbol || '-';
      result = this.convertDelimitedListToBullets(
        result,
        /^\s*((?:Prerequisites|Requirements|Tools Needed|Materials))[:\-]\s*(.+)$/i,
        bulletSymbol,
        { boldLabel: true, minItems: 2 }
      );
    }

    result = this.highlightMetrics(result);
    return result;
  }

  private applyMeetingMinutesIntelligence(
    content: string,
    element: DocumentElement,
    generalRules: any
  ): string {
    let result = content;

    if (element.type === 'paragraph') {
      const bulletSymbol = generalRules.bulletSymbol || '-';
      result = this.convertDelimitedListToBullets(
        result,
        /^\s*((?:Attendees?|Participants?|Present))[:\-]\s*(.+)$/i,
        bulletSymbol,
        { boldLabel: true, minItems: 2 }
      );

      result = this.convertDelimitedListToBullets(
        result,
        /^\s*((?:Action Items?|Open Items?))[:\-]\s*(.+)$/i,
        bulletSymbol,
        { boldLabel: true, minItems: 2 }
      );
    }

    const accent = STYLE_ACCENT_COLORS['meeting-minutes'];
    result = result.replace(/(📌\s*DECISION:)/gi, match =>
      this.decorateLabel(match, { color: accent, bold: true })
    );

    result = result.replace(/(\[\s?\] \s*ACTION:)/gi, match =>
      this.decorateLabel(match, { color: accent, bold: true })
    );

    result = result.replace(/(Owner:|Due:)/gi, match => this.ensureWrapped(match, '**'));

    return result;
  }

  private applyDefaultIntelligence(content: string, element: DocumentElement): string {
    let result = content;

    if (element.type === 'paragraph') {
      result = this.highlightMetrics(result);
    }

    return result;
  }

  private applyGenericPolish(content: string, element: DocumentElement, styleId: string): string {
    let result = content;

    if (element.type === 'paragraph' || element.type === 'bulletList') {
      result = this.italicizeParentheticalPhrases(result);
    }

    if (styleId === 'marketing-brief') {
      result = this.applyBoldToKeywords(result, ['deadline', 'launch']);
    }

    return result;
  }

  private convertDelimitedListToBullets(
    text: string,
    matchPattern: RegExp,
    bulletSymbol: string,
    options: { boldLabel?: boolean; minItems?: number; uppercaseLabel?: boolean; labelOverride?: string } = {}
  ): string {
    const match = text.match(matchPattern);
    if (!match) {
      return text;
    }

    const rawLabel = match[1] || '';
    const rawItems = match[2] || '';
    if (!rawItems.trim()) {
      return text;
    }

    const items = rawItems
      .split(/(?:\n|;|•|\u2022|,\s+)/)
      .map(item => item.replace(/^[-–•]\s*/, '').trim())
      .filter(Boolean);

    const minimum = options.minItems ?? 2;
    if (items.length < minimum) {
      return text;
    }

    const normalizedLabel = options.labelOverride
      ? options.labelOverride
      : (() => {
          const trimmed = rawLabel.trim().replace(/[:\-]$/, '');
          const labelText = options.uppercaseLabel ? trimmed.toUpperCase() : trimmed;
          const withColon = labelText.endsWith(':') ? labelText : `${labelText}:`;
          return options.boldLabel ? this.ensureWrapped(withColon, '**') : withColon;
        })();

    const bullet = bulletSymbol || '-';
    const bulletLines = items.map(item => `${bullet} ${item}`);

    return [normalizedLabel, ...bulletLines].join('\n');
  }

  private highlightMetrics(text: string, accentColor?: string): string {
    let result = text;
    METRIC_PATTERNS.forEach(pattern => {
      result = this.applyWrapperByPattern(result, pattern, { open: '**', close: '**' });
      if (accentColor) {
        result = this.applyColorRule(result, pattern, accentColor);
      }
    });
    return result;
  }

  private highlightDates(text: string, accentColor?: string): string {
    let result = text;
    DATE_PATTERNS.forEach(pattern => {
      result = this.applyWrapperByPattern(result, pattern, { open: '**', close: '**' });
      if (accentColor) {
        result = this.applyColorRule(result, pattern, accentColor);
      }
    });
    return result;
  }

  private applyBoldToKeywords(text: string, keywords: string[]): string {
    return keywords.reduce((acc, keyword) => {
      const pattern = new RegExp(`\\b${this.escapeRegExp(keyword)}\\b`, 'gi');
      return this.applyWrapperByPattern(acc, pattern, { open: '**', close: '**' });
    }, text);
  }

  private decorateLabel(
    label: string,
    options: { color?: string; bold?: boolean; italic?: boolean; uppercase?: boolean }
  ): string {
    let text = options.uppercase ? label.toUpperCase() : label;
    if (options.color) {
      text = `[color=${options.color}]${text}[/color]`;
    }
    if (options.bold) {
      text = this.ensureWrapped(text, '**');
    }
    if (options.italic) {
      text = this.ensureWrapped(text, '*');
    }
    return text;
  }

  private applyWrapperByPattern(
    text: string,
    pattern: RegExp,
    wrapper: { open: string; close: string }
  ): string {
    const regex = this.cloneRegExp(pattern);
    let result = '';
    let lastIndex = 0;
    let replaced = false;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = regex.lastIndex;
      result += text.slice(lastIndex, start);

      if (this.isAlreadyWrapped(text, start, end, wrapper)) {
        result += match[0];
      } else {
        result += `${wrapper.open}${match[0]}${wrapper.close}`;
        replaced = true;
      }

      lastIndex = end;
    }

    if (!replaced) {
      return text;
    }

    result += text.slice(lastIndex);
    return result;
  }

  private applyColorRule(text: string, pattern: RegExp, color: string): string {
    return this.applyWrapperByPattern(text, pattern, {
      open: `[color=${color}]`,
      close: '[/color]'
    });
  }

  private ensureWrapped(content: string, open: string, close: string = open): string {
    if (!content) {
      return content;
    }

    if (content.startsWith(open) && content.endsWith(close)) {
      return content;
    }

    return `${open}${content}${close}`;
  }

  private cloneRegExp(pattern: RegExp): RegExp {
    return new RegExp(pattern.source, pattern.flags);
  }

  private escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isAlreadyWrapped(
    text: string,
    start: number,
    end: number,
    wrapper: { open: string; close: string }
  ): boolean {
    const openStart = start - wrapper.open.length;
    const closeEnd = end + wrapper.close.length;

    if (
      openStart >= 0 &&
      closeEnd <= text.length &&
      text.slice(openStart, start) === wrapper.open &&
      text.slice(end, closeEnd) === wrapper.close
    ) {
      return true;
    }

    if (wrapper.open.startsWith('[color=')) {
      const colorStart = text.lastIndexOf('[color=', start);
      if (colorStart !== -1) {
        const tagEnd = text.indexOf(']', colorStart);
        if (tagEnd !== -1 && tagEnd < start) {
          const closing = text.indexOf('[/color]', start);
          if (closing !== -1 && closing >= end) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private italicizeParentheticalPhrases(text: string): string {
    return text.replace(/\(([^)]+)\)/g, (match, inner, offset, source) => {
      const trimmed = (inner || '').trim();
      if (!trimmed) {
        return match;
      }

      if (trimmed.split(/\s+/).length < 3) {
        return match;
      }

      const before = source[offset - 1];
      const after = source[offset + match.length];
      if (before === '*' && after === '*') {
        return match;
      }

      return `*(${inner})*`;
    });
  }

  /**
   * Apply polish to critical sections using AI
   * Only for small, important parts like intro/conclusion
   */
  async polishSection(
    content: string,
    sectionType: 'intro' | 'conclusion' | 'summary',
    styleGuide: string
  ): Promise<string> {
    // This would use AI but only for very small sections
    // For now, return as-is
    return content;
  }

  /**
   * Validate formatting preserved all content
   */
  validateFormatting(original: string, formatted: string): {
    isValid: boolean;
    preservationScore: number;
    issues: string[];
  } {
    const originalWords = original.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const formattedWords = formatted.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);

    const originalSet = new Set(originalWords);
    const formattedSet = new Set(formattedWords);

    const missing = [...originalSet].filter(w => !formattedSet.has(w));
    const added = [...formattedSet].filter(w => !originalSet.has(w));

    const preservationScore = (originalSet.size - missing.length) / originalSet.size;

    const issues: string[] = [];
    if (missing.length > 0) {
      issues.push(`Missing words: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`);
    }
    if (added.length > 0 && added.length > originalSet.size * 0.1) {
      issues.push(`Many words added (possible duplication)`);
    }

    return {
      isValid: preservationScore > 0.95,
      preservationScore,
      issues
    };
  }
}
