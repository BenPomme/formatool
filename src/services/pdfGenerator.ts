import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import {
  FormattedBlock,
  FormattedDocumentRepresentation,
  FormattedTextRun
} from '../types';
import { StyleExtractionResult } from '../types/styleAttributes';
import { normalizeBulletSymbol } from '../utils/styleNormalization';

const PT_TO_PX = 96 / 72;

interface BaseStyleConfig {
  font: string;
  fontSizePt: number;
  textColor: string;
  headingFont?: string;
  headingFontSizePt?: number;
  headingColor?: string;
  lineHeight: number;
  bulletSymbol: string;
  numberFormat?: string;
}

interface ResolvedStyleConfig {
  font: string;
  bodyFontSizePt: number;
  textColor: string;
  headingFont: string;
  headingFontSizePt: number;
  headingColor: string;
  lineHeight: number;
  bulletSymbol: string;
  numberFormat?: string;
}

interface BlockTypography {
  font: string;
  fontSizePt: number;
  color: string;
}

const BASE_STYLE_CONFIGS: Record<string, BaseStyleConfig> = {
  'business-memo': {
    font: 'Calibri, "Segoe UI", sans-serif',
    fontSizePt: 11,
    textColor: '#2B2B2B',
    headingFont: 'Calibri, "Segoe UI", sans-serif',
    headingFontSizePt: 14,
    headingColor: '#1A1A1A',
    lineHeight: 1.5,
    bulletSymbol: '•',
    numberFormat: 'decimal'
  },
  'book-manuscript': {
    font: '"Times New Roman", serif',
    fontSizePt: 12,
    textColor: '#000000',
    headingFont: '"Times New Roman", serif',
    headingFontSizePt: 16,
    headingColor: '#000000',
    lineHeight: 2,
    bulletSymbol: '•',
    numberFormat: 'decimal'
  },
  'sales-proposal': {
    font: 'Arial, sans-serif',
    fontSizePt: 11,
    textColor: '#1A1A1A',
    headingFont: 'Arial, sans-serif',
    headingFontSizePt: 15,
    headingColor: '#2C5282',
    lineHeight: 1.6,
    bulletSymbol: '•',
    numberFormat: 'decimal'
  },
  'academic-paper': {
    font: '"Times New Roman", serif',
    fontSizePt: 12,
    textColor: '#000000',
    headingFont: '"Times New Roman", serif',
    headingFontSizePt: 15,
    headingColor: '#000000',
    lineHeight: 1.5,
    bulletSymbol: '•',
    numberFormat: 'decimal'
  },
  'legal-document': {
    font: '"Times New Roman", serif',
    fontSizePt: 12,
    textColor: '#242424',
    headingFont: '"Times New Roman", serif',
    headingFontSizePt: 15,
    headingColor: '#242424',
    lineHeight: 2,
    bulletSymbol: '•',
    numberFormat: 'upper-roman'
  },
  'technical-manual': {
    font: '"Segoe UI", sans-serif',
    fontSizePt: 11,
    textColor: '#202124',
    headingFont: '"Segoe UI", sans-serif',
    headingFontSizePt: 14,
    headingColor: '#1A202C',
    lineHeight: 1.55,
    bulletSymbol: '•',
    numberFormat: 'decimal'
  },
  'marketing-brief': {
    font: 'Helvetica, Arial, sans-serif',
    fontSizePt: 11,
    textColor: '#222222',
    headingFont: 'Helvetica, Arial, sans-serif',
    headingFontSizePt: 16,
    headingColor: '#E91E63',
    lineHeight: 1.6,
    bulletSymbol: '•',
    numberFormat: 'decimal'
  },
  'meeting-minutes': {
    font: 'Calibri, "Segoe UI", sans-serif',
    fontSizePt: 11,
    textColor: '#2B2B2B',
    headingFont: 'Calibri, "Segoe UI", sans-serif',
    headingFontSizePt: 14,
    headingColor: '#1F2937',
    lineHeight: 1.55,
    bulletSymbol: '•',
    numberFormat: 'decimal'
  }
};

const DEFAULT_STYLE_CONFIG: BaseStyleConfig = {
  font: 'Inter, "Helvetica Neue", Arial, sans-serif',
  fontSizePt: 11,
  textColor: '#222222',
  headingFont: 'Inter, "Helvetica Neue", Arial, sans-serif',
  headingFontSizePt: 15,
  headingColor: '#111111',
  lineHeight: 1.5,
  bulletSymbol: '•',
  numberFormat: 'decimal'
};

export async function generatePdf(
  content: string,
  filename: string,
  styleId: string,
  structured?: FormattedDocumentRepresentation | null,
  styleExtraction?: StyleExtractionResult | null
): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const htmlContent = convertToHtml(content, styleId, structured || null, styleExtraction || null);

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const outputPath = path.join(process.env.UPLOAD_DIR || './uploads', `${filename}.pdf`);

    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: {
        top: '1in',
        right: '1in',
        bottom: '1in',
        left: '1in'
      },
      printBackground: true
    });

    return outputPath;
  } finally {
    await browser.close();
  }
}

function convertToHtml(
  content: string,
  styleId: string,
  structured: FormattedDocumentRepresentation | null,
  styleExtraction: StyleExtractionResult | null
): string {
  const config = resolveStyleConfig(styleId, structured, styleExtraction);
  const bodyContent = structured?.blocks?.length
    ? renderStructuredDocument(structured, config)
    : fallbackMarkdownToHtml(content);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          ${buildGlobalStyles(config)}
        </style>
      </head>
      <body>
        ${bodyContent}
      </body>
    </html>
  `;
}

function renderStructuredDocument(
  structured: FormattedDocumentRepresentation,
  config: ResolvedStyleConfig
): string {
  const directives = structured.generalDirectives;
  return structured.blocks
    .map(block => renderBlock(block, config, directives))
    .join('\n');
}

function renderBlock(
  block: FormattedBlock,
  config: ResolvedStyleConfig,
  directives: FormattedDocumentRepresentation['generalDirectives'] | undefined
): string {
  switch (block.type) {
    case 'bulletList':
      return renderBulletList(block, config, directives);
    case 'numberedList':
      return renderNumberedList(block, config, directives);
    case 'codeBlock':
      return renderCodeBlock(block, config, directives);
    default:
      return renderParagraphLike(block, config, directives);
  }
}

function renderParagraphLike(
  block: FormattedBlock,
  config: ResolvedStyleConfig,
  directives: FormattedDocumentRepresentation['generalDirectives'] | undefined
): string {
  const tag = mapBlockTypeToTag(block.type);
  const typography = resolveBlockTypography(block, config, directives);
  const styles = buildBlockStyle(block, typography, config, directives);
  const numbering = block.numbering ? `<span class="block-numbering">${escapeHtml(block.numbering)} </span>` : '';
  const content = numbering + (renderRuns(block.runs, typography) || '&nbsp;');
  return `<${tag} class="doc-block doc-block--${block.type}"${styleAttr(styles)}>${content}</${tag}>`;
}

function renderBulletList(
  block: FormattedBlock,
  config: ResolvedStyleConfig,
  directives: FormattedDocumentRepresentation['generalDirectives'] | undefined
): string {
  if (!block.listItems || block.listItems.length === 0) {
    return renderParagraphLike(block, config, directives);
  }

  const typography = resolveBlockTypography(block, config, directives);
  const styles = buildBlockStyle(block, typography, config, directives, { omitIndent: true });
  styles.push('list-style: none');
  styles.push('margin-left: 0');

  const indentSpaces = typeof block.indent === 'number' ? block.indent : directives?.indentSize;
  const paddingLeft = spacesToEm(indentSpaces) + 1.25;
  styles.push(`padding-left: ${formatNumber(paddingLeft)}em`);

  const bulletSymbol = normalizeBulletSymbol(
    block.bulletSymbol || directives?.bulletSymbol || config.bulletSymbol
  );

  const items = block.listItems
    .map(itemRuns => {
      const content = renderRuns(itemRuns, typography) || '&nbsp;';
      return `<li><span class="list-marker">${escapeHtml(bulletSymbol)}</span><span class="list-content">${content}</span></li>`;
    })
    .join('');

  return `<ul class="doc-block doc-block--bullet"${styleAttr(styles)}>${items}</ul>`;
}

function renderNumberedList(
  block: FormattedBlock,
  config: ResolvedStyleConfig,
  directives: FormattedDocumentRepresentation['generalDirectives'] | undefined
): string {
  if (!block.listItems || block.listItems.length === 0) {
    return renderParagraphLike(block, config, directives);
  }

  const typography = resolveBlockTypography(block, config, directives);
  const styles = buildBlockStyle(block, typography, config, directives, { omitIndent: true });
  styles.push('margin-left: 0');

  const indentSpaces = typeof block.indent === 'number' ? block.indent : directives?.indentSize;
  const paddingLeft = spacesToEm(indentSpaces) + 1.5;
  styles.push(`padding-left: ${formatNumber(paddingLeft)}em`);

  const listStyle = mapNumberFormatToListStyle(block.numberFormat || directives?.numberFormat || config.numberFormat);
  if (listStyle) {
    styles.push(`list-style-type: ${listStyle}`);
  }
  styles.push('list-style-position: outside');

  const items = block.listItems
    .map(itemRuns => `<li>${renderRuns(itemRuns, typography) || '&nbsp;'}</li>`)
    .join('');

  return `<ol class="doc-block doc-block--numbered"${styleAttr(styles)}>${items}</ol>`;
}

function renderCodeBlock(
  block: FormattedBlock,
  config: ResolvedStyleConfig,
  directives: FormattedDocumentRepresentation['generalDirectives'] | undefined
): string {
  const typography = resolveBlockTypography(block, config, directives);
  const styles = buildBlockStyle(block, typography, config, directives, { omitIndent: true });
  styles.push('font-family: "Courier New", monospace');
  styles.push('background: #f4f4f4');
  styles.push('padding: 12px');
  styles.push('border-radius: 4px');
  styles.push('white-space: pre-wrap');

  const rawContent = block.metadata?.rawContent || block.runs.map(run => run.text).join('');
  const escaped = escapeHtml(rawContent).replace(/\r?\n/g, '<br />');

  return `<pre class="doc-block doc-block--code"${styleAttr(styles)}><code>${escaped}</code></pre>`;
}

function buildBlockStyle(
  block: FormattedBlock,
  typography: BlockTypography,
  config: ResolvedStyleConfig,
  directives: FormattedDocumentRepresentation['generalDirectives'] | undefined,
  options: { omitIndent?: boolean } = {}
): string[] {
  const styles: string[] = [];

  styles.push(`font-family: ${typography.font}`);
  styles.push(`font-size: ${formatNumber(ptToPx(typography.fontSizePt))}px`);
  styles.push(`color: ${typography.color}`);

  const appliedLineHeight = block.lineHeight ?? config.lineHeight;
  styles.push(`line-height: ${formatNumber(appliedLineHeight)}`);

  const alignment = block.alignment || directives?.baseAlignment;
  if (alignment) {
    styles.push(`text-align: ${alignment}`);
  }

  const marginTop = linesToEm(block.spacing?.before, appliedLineHeight);
  if (marginTop) {
    styles.push(`margin-top: ${marginTop}`);
  }

  const marginBottom = linesToEm(block.spacing?.after, appliedLineHeight);
  if (marginBottom) {
    styles.push(`margin-bottom: ${marginBottom}`);
  }

  if (!options.omitIndent) {
    const indentSpaces = typeof block.indent === 'number' ? block.indent : directives?.indentSize;
    const indentEm = spacesToEm(indentSpaces);
    if (indentEm > 0) {
      styles.push(`text-indent: ${formatNumber(indentEm)}em`);
    }
  }

  return styles;
}

function renderRuns(runs: FormattedTextRun[], typography: BlockTypography): string {
  if (!runs || runs.length === 0) {
    return '';
  }

  return runs
    .map(run => {
      const segments: string[] = [];
      if (run.bold) segments.push('font-weight: 700');
      if (run.italic) segments.push('font-style: italic');
      if (run.color) {
        segments.push(`color: ${normalizeColor(run.color, typography.color)}`);
      }
      const style = segments.length ? ` style="${segments.join('; ')}"` : '';
      const safeText = escapeHtml(run.text ?? '').replace(/\r?\n/g, '<br />');
      return `<span${style}>${safeText}</span>`;
    })
    .join('');
}

function resolveBlockTypography(
  block: FormattedBlock,
  config: ResolvedStyleConfig,
  directives?: FormattedDocumentRepresentation['generalDirectives']
): BlockTypography {
  const isHeading = ['title', 'chapter', 'section', 'subsection'].includes(block.type);

  const font = block.typography?.font
    || directives?.defaultFont
    || (isHeading ? config.headingFont : config.font);

  const fontSizePt = block.typography?.fontSize
    || directives?.defaultFontSize
    || (isHeading ? config.headingFontSizePt : config.bodyFontSizePt);

  const color = normalizeColor(
    block.typography?.color || directives?.defaultColor,
    isHeading ? config.headingColor : config.textColor
  );

  return {
    font,
    fontSizePt,
    color
  };
}

function resolveStyleConfig(
  styleId: string,
  structured: FormattedDocumentRepresentation | null,
  styleExtraction: StyleExtractionResult | null
): ResolvedStyleConfig {
  const base = BASE_STYLE_CONFIGS[styleId] || DEFAULT_STYLE_CONFIG;
  const simplified = styleExtraction?.simplified;
  const directives = structured?.generalDirectives;
  const headingBlock = findFirstHeadingBlock(structured);

  const font = directives?.defaultFont
    || simplified?.font
    || base.font;

  const bodyFontSizePt = findFirstParagraphFontSize(structured)
    || simplified?.fontSize
    || base.fontSizePt;

  const headingFont = headingBlock?.typography?.font
    || directives?.defaultFont
    || base.headingFont
    || font;

  const headingFontSizePt = headingBlock?.typography?.fontSize
    || base.headingFontSizePt
    || bodyFontSizePt * 1.25;

  const textColor = normalizeColor(
    directives?.defaultColor || simplified?.colors?.text,
    base.textColor
  );

  const headingColor = normalizeColor(
    headingBlock?.typography?.color || simplified?.colors?.heading,
    base.headingColor || textColor
  );

  const lineHeight = directives?.lineHeight || simplified?.lineHeight || base.lineHeight;

  const bulletSymbol = normalizeBulletSymbol(
    headingBlock?.bulletSymbol
      || structured?.blocks?.find(b => b.bulletSymbol)?.bulletSymbol
      || directives?.bulletSymbol
      || simplified?.listStyle
      || base.bulletSymbol
  );

  const numberFormat = structured?.blocks?.find(b => b.numberFormat)?.numberFormat
    || directives?.numberFormat
    || base.numberFormat;

  return {
    font,
    bodyFontSizePt,
    textColor,
    headingFont,
    headingFontSizePt,
    headingColor,
    lineHeight,
    bulletSymbol,
    numberFormat
  };
}

function findFirstHeadingBlock(
  structured: FormattedDocumentRepresentation | null
): FormattedBlock | undefined {
  if (!structured) {
    return undefined;
  }
  return structured.blocks.find(block => ['title', 'chapter', 'section', 'subsection'].includes(block.type));
}

function findFirstParagraphFontSize(
  structured: FormattedDocumentRepresentation | null
): number | undefined {
  if (!structured) {
    return undefined;
  }
  const paragraph = structured.blocks.find(block => block.type === 'paragraph' && block.typography?.fontSize);
  return paragraph?.typography?.fontSize;
}

function mapBlockTypeToTag(type: FormattedBlock['type']): string {
  switch (type) {
    case 'title':
      return 'h1';
    case 'chapter':
      return 'h2';
    case 'section':
      return 'h3';
    case 'subsection':
      return 'h4';
    case 'imageCaption':
      return 'figcaption';
    default:
      return 'p';
  }
}

function mapNumberFormatToListStyle(format?: string | null): string | undefined {
  if (!format) {
    return undefined;
  }

  const normalized = format.toLowerCase();

  if (
    normalized.includes('upper-roman') ||
    normalized.includes('upperroman') ||
    (/^[ivxlcdm]+\.?$/.test(normalized) && format === format.toUpperCase())
  ) {
    return 'upper-roman';
  }

  if (
    normalized.includes('lower-roman') ||
    normalized.includes('lowerroman') ||
    (/^[ivxlcdm]+\.?$/.test(normalized) && format === format.toLowerCase())
  ) {
    return 'lower-roman';
  }

  if (
    normalized.includes('upper-letter') ||
    normalized.includes('upperletter') ||
    normalized.includes('upperalpha') ||
    (/^[a-z]\.?$/.test(normalized) && format === format.toUpperCase())
  ) {
    return 'upper-alpha';
  }

  if (
    normalized.includes('lower-letter') ||
    normalized.includes('lowerletter') ||
    normalized.includes('loweralpha') ||
    (/^[a-z]\.?$/.test(normalized) && format === format.toLowerCase())
  ) {
    return 'lower-alpha';
  }

  if (normalized.includes('decimal-leading-zero')) {
    return 'decimal-leading-zero';
  }

  if (normalized.includes('decimal') || /\d/.test(format)) {
    return 'decimal';
  }

  return undefined;
}

function buildGlobalStyles(config: ResolvedStyleConfig): string {
  return `
    body {
      font-family: ${config.font};
      font-size: ${formatNumber(ptToPx(config.bodyFontSizePt))}px;
      line-height: ${formatNumber(config.lineHeight)};
      color: ${config.textColor};
      max-width: 800px;
      margin: 0 auto;
      padding: 48px;
      background: #ffffff;
    }
    .doc-block {
      margin: 0;
    }
    h1.doc-block, h2.doc-block, h3.doc-block, h4.doc-block {
      font-family: ${config.headingFont};
      color: ${config.headingColor};
      font-weight: 600;
    }
    .doc-block--bullet {
      list-style: none;
    }
    .doc-block--bullet li {
      display: flex;
      gap: 0.6em;
      align-items: flex-start;
      margin: 0.15em 0;
    }
    .doc-block--bullet .list-marker {
      min-width: 1.2em;
    }
    .doc-block--numbered li {
      margin: 0.15em 0;
    }
    .doc-block--code {
      font-family: 'Courier New', monospace;
    }
    .block-numbering {
      font-weight: 600;
    }
  `;
}

function fallbackMarkdownToHtml(content: string): string {
  const lines = content.split(/\r?\n/);
  const blocks: string[] = [];
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer || listBuffer.items.length === 0) {
      listBuffer = null;
      return;
    }

    const tag = listBuffer.type === 'ul' ? 'ul' : 'ol';
    const className = listBuffer.type === 'ul'
      ? 'doc-block doc-block--bullet'
      : 'doc-block doc-block--numbered';
    const items = listBuffer.items.map(item => `<li>${item}</li>`).join('');
    blocks.push(`<${tag} class="${className}">${items}</${tag}>`);
    listBuffer = null;
  };

  const renderInline = (text: string): string => {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  };

  const pushParagraph = (text: string) => {
    flushList();
    blocks.push(`<p class="doc-block">${renderInline(text)}</p>`);
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith('#')) {
      flushList();
      const level = Math.min(trimmed.match(/^#+/)?.[0].length || 1, 6);
      const text = trimmed.replace(/^#+\s*/, '') || '&nbsp;';
      blocks.push(
        `<h${level} class="doc-block">${renderInline(text)}</h${level}>`
      );
      continue;
    }

    const bulletMatch = trimmed.match(/^([\-\*•‣◦▪▫●○])\s+(.*)$/);
    if (bulletMatch) {
      const [, symbol, text] = bulletMatch;
      const normalized = normalizeBulletSymbol(symbol);
      if (!listBuffer || listBuffer.type !== 'ul') {
        flushList();
        listBuffer = { type: 'ul', items: [] };
      }
      const itemContent = renderInline(text || normalized);
      listBuffer.items.push(itemContent);
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+[\.\)]|[a-zA-Z][\.\)])\s+(.*)$/);
    if (numberedMatch) {
      const [, , text] = numberedMatch;
      if (!listBuffer || listBuffer.type !== 'ol') {
        flushList();
        listBuffer = { type: 'ol', items: [] };
      }
      listBuffer.items.push(renderInline(text));
      continue;
    }

    pushParagraph(trimmed);
  }

  flushList();

  if (!blocks.length) {
    return '<p class="doc-block">&nbsp;</p>';
  }

  return blocks.join('\n');
}

function linesToEm(lines: number | undefined, lineHeight: number): string | null {
  if (!lines || lines <= 0 || !Number.isFinite(lineHeight) || lineHeight <= 0) {
    return null;
  }
  const value = parseFloat((lines * lineHeight).toFixed(3));
  if (value <= 0) {
    return null;
  }
  return `${formatNumber(value)}em`;
}

function spacesToEm(spaces?: number | null): number {
  if (!spaces || spaces <= 0) {
    return 0;
  }
  return parseFloat((spaces * 0.25).toFixed(3));
}

function styleAttr(styles: string[]): string {
  const filtered = styles.filter(Boolean);
  return filtered.length ? ` style="${filtered.join('; ')}"` : '';
}

function normalizeColor(input: string | undefined | null, fallback: string): string {
  if (!input) {
    return fallback;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return fallback;
  }
  if (/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }
  return fallback;
}

function ptToPx(pt: number): number {
  return pt * PT_TO_PX;
}

function formatNumber(value: number): string {
  return parseFloat(value.toFixed(3)).toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
