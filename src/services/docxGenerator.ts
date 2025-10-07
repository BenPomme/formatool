import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  NumberFormat
} from 'docx';
import fs from 'fs/promises';
import path from 'path';
import { StyleExtractionResult } from '../types/styleAttributes';
import { FormattedDocumentRepresentation, FormattedBlock, FormattedTextRun, ElementType } from '../types';
import { parseRichTextSegments } from '../utils/richText';
import { normalizeBulletSymbol } from '../utils/styleNormalization';

// Simple base style configurations (font size values are docx half-points)
const STYLE_CONFIGS: Record<string, { font: string; fontSize: number; color?: string }> = {
  'business-memo': { font: 'Calibri', fontSize: 24, color: '2B2B2B' },
  'book-manuscript': { font: 'Times New Roman', fontSize: 24, color: '000000' },
  'sales-proposal': { font: 'Arial', fontSize: 22, color: '1A1A1A' },
  'academic-paper': { font: 'Times New Roman', fontSize: 24, color: '000000' },
  'legal-document': { font: 'Times New Roman', fontSize: 24, color: '000000' },
  'technical-manual': { font: 'Segoe UI', fontSize: 20, color: '202124' },
  'marketing-brief': { font: 'Helvetica', fontSize: 22, color: '111111' },
  'meeting-minutes': { font: 'Calibri', fontSize: 22, color: '2B2B2B' }
};

interface ResolvedStyleConfig {
  font: string;
  fontSize: number;
  color: string;
  headingFont: string;
  headingFontSize: number;
  headingColor: string;
  bulletSymbol: string;
}

type HeadingLevelValue = (typeof HeadingLevel)[keyof typeof HeadingLevel];

export async function generateDocx(
  content: string,
  filename: string,
  styleId: string,
  styleExtraction?: StyleExtractionResult | null,
  structured?: FormattedDocumentRepresentation | null
): Promise<string> {
  let styleConfig = resolveStyleConfig(styleId, styleExtraction);

  if (structured?.generalDirectives) {
    const directives = structured.generalDirectives;
    if (directives.defaultFont) {
      styleConfig = {
        ...styleConfig,
        font: directives.defaultFont,
        headingFont: styleConfig.headingFont || directives.defaultFont
      };
    }
    if (typeof directives.defaultFontSize === 'number' && directives.defaultFontSize > 0) {
      styleConfig = {
        ...styleConfig,
        fontSize: Math.round(directives.defaultFontSize * 2)
      };
    }
    if (directives.defaultColor) {
      styleConfig = {
        ...styleConfig,
        color: normalizeColor(directives.defaultColor, styleConfig.color)
      };
    }
    if (directives.bulletSymbol) {
      styleConfig = {
        ...styleConfig,
        bulletSymbol: normalizeBulletSymbol(directives.bulletSymbol)
      };
    }
  }

  const paragraphs = structured?.blocks?.length
    ? buildParagraphsFromStructured(structured, styleConfig, styleExtraction)
    : parseContentToParagraphs(content, styleId, styleConfig, styleExtraction);

  const numberingConfig = buildNumberingConfig(styleConfig, structured);

  const doc = new Document({
    creator: 'Document Formatter',
    title: filename,
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,  // 1 inch
            right: 1440,
            bottom: 1440,
            left: 1440,
          }
        }
      },
      children: paragraphs
    }],
    styles: {
      default: {
        document: {
          run: {
            font: styleConfig.font,
            size: styleConfig.fontSize,
            color: styleConfig.color
          }
        },
        heading1: {
          run: {
            font: styleConfig.headingFont,
            size: styleConfig.headingFontSize,
            bold: true,
            color: styleConfig.headingColor
          },
          paragraph: {
            spacing: {
              after: 200,
              before: 200,
            },
          },
        },
        heading2: {
          run: {
            font: styleConfig.headingFont,
            size: Math.max(styleConfig.headingFontSize - 2, styleConfig.fontSize + 2),
            bold: true,
            color: styleConfig.headingColor
          },
          paragraph: {
            spacing: {
              after: 150,
              before: 150,
            },
          },
        },
      },
    },
    numbering: {
      config: numberingConfig
    }
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(process.env.UPLOAD_DIR || './uploads', `${filename}.docx`);
  await fs.writeFile(outputPath, buffer);

  return outputPath;
}

function resolveStyleConfig(styleId: string, extraction?: StyleExtractionResult | null): ResolvedStyleConfig {
  const base = STYLE_CONFIGS[styleId] || STYLE_CONFIGS['business-memo'];

  if (styleId.startsWith('custom-extracted') && extraction) {
    const simplified = extraction.simplified;
    const raw = extraction.rawDocxStyles;

    const fonts = Array.from(new Set(
      [raw?.defaultFont, simplified.font, ...(raw?.fonts || [])]
        .filter((font): font is string => typeof font === 'string' && font.trim().length > 0)
        .map(font => font.trim())
    ));

    const primaryFont = fonts[0] || base.font;
    const headingFont = raw?.headingStyles?.Heading1?.font || simplified.headingStyles?.h1?.font || primaryFont;
    const bodyFontSizePt = raw?.defaultFontSize || simplified.fontSize || base.fontSize / 2;
    const headingFontSizePt = simplified.headingStyles?.h1?.fontSize || raw?.headingStyles?.Heading1?.fontSize || (bodyFontSizePt * 1.4);

    const bodyColor = (simplified.colors?.text || raw?.defaultColor || base.color || '000000').replace('#', '').toUpperCase();
    const headingColor = (simplified.colors?.heading || raw?.headingStyles?.Heading1?.color || bodyColor).replace('#', '').toUpperCase();
    const bulletSymbol = normalizeBulletSymbol(simplified.listStyle);

    return {
      font: primaryFont,
      fontSize: Math.round(bodyFontSizePt * 2),
      color: bodyColor,
      headingFont,
      headingFontSize: Math.round(headingFontSizePt * 2),
      headingColor,
      bulletSymbol
    };
  }

  return {
    font: base.font,
    fontSize: base.fontSize,
    color: (base.color || '000000').replace('#', '').toUpperCase(),
    headingFont: base.font,
    headingFontSize: base.fontSize + 6,
    headingColor: (base.color || '000000').replace('#', '').toUpperCase(),
    bulletSymbol: '•'
  };
}

function parseContentToParagraphs(
  content: string,
  styleId: string,
  styleConfig: ResolvedStyleConfig,
  styleExtraction?: StyleExtractionResult | null
): Paragraph[] {
  const lines = content.split('\n');
  const paragraphs: Paragraph[] = [];
  let isFirstParagraph = true;

  const bulletSymbol = normalizeBulletSymbol(
    styleExtraction?.simplified.listStyle || styleConfig.bulletSymbol
  );

  for (let i = 0; i < lines.length; i++) {
    let line = sanitizeLine(lines[i]);

    if (!line.length) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }

    line = line.trim();

    // Special handling for specific document types (simplified)
    if (styleId === 'business-memo' && line === 'MEMORANDUM') {
      paragraphs.push(
        new Paragraph({
          text: line,
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [
            new TextRun({
              text: line,
              font: styleConfig.font,
              size: styleConfig.fontSize + 4,
              bold: true,
              color: styleConfig.headingColor
            })
          ]
        })
      );
      continue;
    }

    // Handle TO/FROM/DATE/SUBJECT for memos
    if (styleId === 'business-memo' &&
        (line.startsWith('TO:') || line.startsWith('FROM:') ||
         line.startsWith('DATE:') || line.startsWith('SUBJECT:'))) {
      paragraphs.push(
        new Paragraph({
          text: line,
          spacing: { after: 60 }
        })
      );
      continue;
    }

    // Handle chapter headings for manuscripts
    if (styleId === 'book-manuscript' && line.match(/^Chapter\s+\d+/i)) {
      paragraphs.push(
        new Paragraph({
          text: line.toUpperCase(),
          alignment: AlignmentType.CENTER,
          spacing: { before: 720, after: 480 },
          pageBreakBefore: i > 0
        })
      );
      isFirstParagraph = true;
      continue;
    }

    const paragraphRuns = createTextRuns(line, styleConfig);

    paragraphs.push(
      new Paragraph({
        children: paragraphRuns,
        spacing: {
          line: styleId === 'book-manuscript' ? 480 : 276,
          after: styleId === 'book-manuscript' ? 0 : 120
        },
        alignment: getAlignment(styleId, styleExtraction),
        indent: getIndent(styleId, isFirstParagraph)
      })
    );

    // Only first paragraph after header/chapter doesn't get indented
    if (line.trim() && !line.startsWith('#') && !line.match(/^Chapter\s+\d+/i)) {
      isFirstParagraph = false;
    }
  }

  return paragraphs;
}

function buildParagraphsFromStructured(
  structured: FormattedDocumentRepresentation,
  styleConfig: ResolvedStyleConfig,
  styleExtraction?: StyleExtractionResult | null
): Paragraph[] {
  const directives = structured.generalDirectives;
  const paragraphs: Paragraph[] = [];

  structured.blocks.forEach(block => {
    const blockParagraphs = convertBlockToParagraphs(block, directives, styleConfig);
    paragraphs.push(...blockParagraphs);
  });

  if (!paragraphs.length) {
    return parseContentToParagraphs(structured.text, structured.styleId, styleConfig, styleExtraction);
  }

  return paragraphs;
}

function convertBlockToParagraphs(
  block: FormattedBlock,
  directives: FormattedDocumentRepresentation['generalDirectives'] | undefined,
  styleConfig: ResolvedStyleConfig
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const spacing = buildParagraphSpacing(block, directives);
  const alignment = mapAlignment(block.alignment, directives?.baseAlignment);
  const indent = buildIndentProps(block);
  const resolvedTypography = resolveBlockTypography(block, styleConfig, directives);

  const applySpacing = (options: any) => {
    if (spacing) {
      options.spacing = spacing;
    }
    options.alignment = alignment;
    if (indent) {
      options.indent = indent;
    }
    return options;
  };

  const createParagraphWithRuns = (runs: FormattedTextRun[], overrides?: { heading?: HeadingLevelValue }) => {
    const children = createRunsFromFormattedRuns(runs, resolvedTypography);
    if (!children.length) {
      children.push(new TextRun({ text: '' }));
    }
    const options: any = applySpacing({ children });
    if (overrides?.heading) {
      options.heading = overrides.heading;
    }
    return new Paragraph(options);
  };

  if (block.type === 'bulletList' && block.listItems?.length) {
    block.listItems.forEach(itemRuns => {
      const children = createRunsFromFormattedRuns(itemRuns, resolvedTypography);
      if (!children.length) {
        children.push(new TextRun({ text: '' }));
      }
      paragraphs.push(new Paragraph(applySpacing({
        children,
        numbering: { reference: 'bullet-numbering', level: 0 }
      })));
    });
    return paragraphs;
  }

  if (block.type === 'numberedList' && block.listItems?.length) {
    const numberingRef = resolveNumberingReference(block.numberFormat);
    block.listItems.forEach(itemRuns => {
      const children = createRunsFromFormattedRuns(itemRuns, resolvedTypography);
      if (!children.length) {
        children.push(new TextRun({ text: '' }));
      }
      paragraphs.push(new Paragraph(applySpacing({
        children,
        numbering: {
          reference: numberingRef,
          level: 0
        }
      })));
    });
    return paragraphs;
  }

  const headingLevel = resolveHeadingLevel(block.type);
  paragraphs.push(createParagraphWithRuns(block.runs, headingLevel ? { heading: headingLevel } : undefined));
  return paragraphs;
}

function resolveBlockTypography(
  block: FormattedBlock,
  styleConfig: ResolvedStyleConfig,
  directives?: FormattedDocumentRepresentation['generalDirectives']
) {
  const isHeading = block.type === 'title' || block.type === 'chapter' || block.type === 'section' || block.type === 'subsection';

  const fallbackFont = block.typography?.font
    || directives?.defaultFont
    || (isHeading ? styleConfig.headingFont : styleConfig.font);

  const fallbackColor = normalizeColor(
    block.typography?.color || directives?.defaultColor,
    isHeading ? styleConfig.headingColor : styleConfig.color
  );

  const baseFontSizePt = block.typography?.fontSize
    || directives?.defaultFontSize
    || (isHeading ? styleConfig.headingFontSize / 2 : styleConfig.fontSize / 2);

  return {
    font: fallbackFont,
    size: Math.round(baseFontSizePt * 2),
    color: fallbackColor
  };
}

function createRunsFromFormattedRuns(
  runs: FormattedTextRun[],
  typography: { font: string; size: number; color: string }
): TextRun[] {
  if (!runs || !runs.length) {
    return [];
  }

  return runs.map(run => new TextRun({
    text: run.text,
    bold: run.bold || undefined,
    italics: run.italic || undefined,
    font: typography.font,
    size: typography.size,
    color: normalizeColor(run.color, typography.color)
  }));
}

function buildParagraphSpacing(
  block: FormattedBlock,
  directives?: FormattedDocumentRepresentation['generalDirectives']
) {
  const beforeLines = block.spacing?.before ?? directives?.paragraphSpacing;
  const afterLines = block.spacing?.after ?? directives?.paragraphSpacing;
  const lineHeight = block.lineHeight ?? directives?.lineHeight;

  const spacing: any = {};

  if (beforeLines && beforeLines > 0) {
    spacing.before = Math.round(beforeLines * 240);
  }

  if (afterLines && afterLines > 0) {
    spacing.after = Math.round(afterLines * 240);
  }

  if (lineHeight && lineHeight > 0) {
    spacing.line = Math.round(lineHeight * 240);
    spacing.lineRule = 'AUTO';
  }

  return Object.keys(spacing).length ? spacing : undefined;
}

function mapAlignment(
  alignment?: 'left' | 'center' | 'right' | 'justify',
  fallback: 'left' | 'center' | 'right' | 'justify' = 'left'
) {
  const value = alignment || fallback;
  switch (value) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    case 'left':
    default:
      return AlignmentType.LEFT;
  }
}

function buildIndentProps(block: FormattedBlock) {
  if (block.type === 'bulletList' || block.type === 'numberedList') {
    return {
      left: 720,
      hanging: 360
    };
  }

  if (block.indent && block.indent > 0) {
    const twips = Math.round(block.indent * 120);
    return {
      firstLine: twips
    };
  }

  return undefined;
}

function resolveHeadingLevel(type: ElementType): HeadingLevelValue | undefined {
  switch (type) {
    case 'title':
      return HeadingLevel.HEADING_1;
    case 'chapter':
      return HeadingLevel.HEADING_1;
    case 'section':
      return HeadingLevel.HEADING_2;
    case 'subsection':
      return HeadingLevel.HEADING_3;
    default:
      return undefined;
  }
}

function resolveNumberingReference(format?: string): string {
  if (!format) {
    return 'decimal-numbering';
  }

  const trimmed = format.trim();
  if (!trimmed) {
    return 'decimal-numbering';
  }

  if (trimmed.includes('01')) {
    return 'decimal-zero-numbering';
  }

  if (trimmed.includes('(') || trimmed.includes(')')) {
    return 'decimal-parenthesis-numbering';
  }

  if (/[A]/.test(trimmed)) {
    return 'upper-letter-numbering';
  }

  if (/[a]/.test(trimmed)) {
    return 'lower-letter-numbering';
  }

  if (/I/.test(trimmed) && !/[a-z]/.test(trimmed)) {
    return 'upper-roman-numbering';
  }

  if (/i/.test(trimmed)) {
    return 'lower-roman-numbering';
  }

  return 'decimal-numbering';
}

function buildNumberingConfig(
  styleConfig: ResolvedStyleConfig,
  structured?: FormattedDocumentRepresentation | null
) {
  const bulletSymbol = normalizeBulletSymbol(
    structured?.generalDirectives?.bulletSymbol || styleConfig.bulletSymbol || '•'
  );

  return [
    {
      reference: 'default-numbering',
      levels: [
        {
          level: 0,
          format: NumberFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT
        }
      ]
    },
    {
      reference: 'decimal-numbering',
      levels: [
        {
          level: 0,
          format: NumberFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT
        }
      ]
    },
    {
      reference: 'decimal-zero-numbering',
      levels: [
        {
          level: 0,
          format: NumberFormat.DECIMAL,
          text: '%01.',
          alignment: AlignmentType.LEFT
        }
      ]
    },
    {
      reference: 'decimal-parenthesis-numbering',
      levels: [
        {
          level: 0,
          format: NumberFormat.DECIMAL,
          text: '(%1)',
          alignment: AlignmentType.LEFT
        }
      ]
    },
    {
      reference: 'lower-letter-numbering',
      levels: [
        {
          level: 0,
          format: NumberFormat.LOWER_LETTER,
          text: '%1.',
          alignment: AlignmentType.LEFT
        }
      ]
    },
    {
      reference: 'upper-letter-numbering',
      levels: [
        {
          level: 0,
          format: NumberFormat.UPPER_LETTER,
          text: '%1.',
          alignment: AlignmentType.LEFT
        }
      ]
    },
    {
      reference: 'lower-roman-numbering',
      levels: [
        {
          level: 0,
          format: NumberFormat.LOWER_ROMAN,
          text: '%1.',
          alignment: AlignmentType.LEFT
        }
      ]
    },
    {
      reference: 'upper-roman-numbering',
      levels: [
        {
          level: 0,
          format: NumberFormat.UPPER_ROMAN,
          text: '%1.',
          alignment: AlignmentType.LEFT
        }
      ]
    },
    {
      reference: 'bullet-numbering',
      levels: [
        {
          level: 0,
          format: NumberFormat.BULLET,
          text: bulletSymbol,
          alignment: AlignmentType.LEFT
        }
      ]
    }
  ];
}

function getAlignment(
  styleId: string,
  extraction?: StyleExtractionResult | null
): typeof AlignmentType[keyof typeof AlignmentType] {
  const alignment = extraction?.attributes?.typography?.bodyText?.alignment;
  if (alignment) {
    switch (alignment) {
      case 'center':
        return AlignmentType.CENTER;
      case 'right':
        return AlignmentType.RIGHT;
      case 'justify':
        return AlignmentType.JUSTIFIED;
      default:
        return AlignmentType.LEFT;
    }
  }

  switch (styleId) {
    case 'academic-paper':
    case 'legal-document':
      return AlignmentType.JUSTIFIED;
    default:
      return AlignmentType.LEFT;
  }
}

function getIndent(styleId: string, isFirstParagraph: boolean): any {
  // Only indent for book manuscripts, and only non-first paragraphs
  if (styleId === 'book-manuscript' && !isFirstParagraph) {
    return { firstLine: 360 }; // 0.25 inch indent (reduced from 0.5)
  }
  return undefined;
}

function createTextRuns(
  line: string,
  styleConfig: ResolvedStyleConfig,
  options: { color?: string; font?: string; fontSize?: number } = {}
): TextRun[] {
  const segments = parseRichTextSegments(line);
  const baseColor = normalizeColor(options.color, styleConfig.color);
  const font = options.font || styleConfig.font;
  const size = options.fontSize || styleConfig.fontSize;

  if (!segments.length) {
    return [
      new TextRun({
        text: line,
        font,
        size,
        color: baseColor
      })
    ];
  }

  return segments.map(segment => (
    new TextRun({
      text: segment.text,
      font,
      size,
      color: normalizeColor(segment.color, baseColor),
      bold: segment.bold || undefined,
      italics: segment.italic || undefined
    })
  ));
}

function normalizeColor(color: string | undefined, fallback: string): string {
  const normalizedFallback = fallback.replace('#', '').toUpperCase();
  if (!color) {
    return normalizedFallback;
  }

  let cleaned = color.replace('#', '').trim();
  if (!cleaned) {
    return normalizedFallback;
  }

  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map(ch => `${ch}${ch}`)
      .join('');
  }

  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return normalizedFallback;
  }

  return cleaned.toUpperCase();
}

function sanitizeLine(input: string): string {
  if (!input) return '';

  let line = input.replace(/&nbsp;/gi, ' ');

  const divMatch = line.match(/^<div[^>]*>([\s\S]*?)<\/div>$/i);
  if (divMatch) {
    line = divMatch[1];
  }

  const pMatch = line.match(/^<p[^>]*>([\s\S]*?)<\/p>$/i);
  if (pMatch) {
    line = pMatch[1];
  }

  line = line.replace(/<\/?div[^>]*>/gi, '');
  line = line.replace(/<\/?p[^>]*>/gi, '');
  line = line.replace(/<br\s*\/?>(\r?\n)?/gi, '\n');
  line = line.replace(/<[^>]+>/g, '');

  return line.trimStart();
}
