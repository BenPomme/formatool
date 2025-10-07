import { FormattedBlock, FormattedDocumentRepresentation } from '../types';
import { RawDocxStyles, StyleExtractionResult } from '../types/styleAttributes';
import { normalizeBulletSymbol } from '../utils/styleNormalization';

type StyleMismatchCategory =
  | 'general'
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'color'
  | 'numbering';

type StyleMismatchSeverity = 'warning' | 'error';

export interface StyleValidationMismatch {
  category: StyleMismatchCategory;
  scope: string;
  property: string;
  expected?: string | number;
  actual?: string | number;
  severity: StyleMismatchSeverity;
  message: string;
}

export interface StyleValidationResult {
  isCompliant: boolean;
  complianceScore: number;
  checkedElements: number;
  mismatches: StyleValidationMismatch[];
}

interface ExpectedHeadingStyle {
  font?: string;
  fontSize?: number;
  color?: string;
}

export class StyleValidator {
  static validate(
    structured: FormattedDocumentRepresentation | null | undefined,
    extraction: StyleExtractionResult | null | undefined
  ): StyleValidationResult {
    if (!structured || !extraction) {
      return {
        isCompliant: true,
        complianceScore: 100,
        checkedElements: 0,
        mismatches: []
      };
    }

    const mismatches: StyleValidationMismatch[] = [];
    let checks = 0;
    let passes = 0;

    const directives = structured.generalDirectives || {};
    const simplified = extraction.simplified;
    const raw = extraction.rawDocxStyles;
    const headingAttributes = extraction.attributes?.typography?.headings || {};

    const recordCheck = (condition: boolean, mismatch?: StyleValidationMismatch) => {
      checks += 1;
      if (condition) {
        passes += 1;
      } else if (mismatch) {
        mismatches.push(mismatch);
      }
    };

    // General typography checks
    const expectedFont = normalizedFont(firstNonEmpty([
      simplified.font,
      raw?.defaultFont
    ]));
    const actualBaseFont = normalizedFont(directives.defaultFont || getSampleFont(structured));
    if (expectedFont && actualBaseFont) {
      recordCheck(
        fontsEqual(expectedFont, actualBaseFont),
        buildMismatch('general', 'document', 'font', expectedFont, actualBaseFont)
      );
    }

    const expectedColor = normalizeColor(firstNonEmpty([
      simplified.colors?.text,
      raw?.defaultColor
    ]));
    const actualColor = normalizeColor(directives.defaultColor || getSampleColor(structured));
    if (expectedColor && actualColor) {
      recordCheck(
        expectedColor === actualColor,
        buildMismatch('color', 'document', 'textColor', expectedColor, actualColor)
      );
    }

    const expectedFontSize = firstFiniteNumber([
      simplified.fontSize,
      raw?.defaultFontSize
    ]);
    const actualFontSize = firstFiniteNumber([
      directives.defaultFontSize,
      getSampleFontSize(structured)
    ]);
    if (expectedFontSize && actualFontSize) {
      recordCheck(
        approximatelyEqual(expectedFontSize, actualFontSize, 0.25),
        buildMismatch('general', 'document', 'fontSize', expectedFontSize, actualFontSize)
      );
    }

    const expectedLineHeight = simplified.lineHeight || raw?.defaultLineHeight;
    const actualLineHeight = directives.lineHeight;
    if (expectedLineHeight && actualLineHeight) {
      recordCheck(
        approximatelyEqual(expectedLineHeight, actualLineHeight, 0.05),
        buildMismatch('general', 'document', 'lineHeight', expectedLineHeight, actualLineHeight)
      );
    }

    const expectedParagraphSpacingLines = pointsToLineSpacing(
      simplified.paragraphSpacing || raw?.paragraphSpacing?.after?.[0]
    );
    const actualParagraphSpacing = directives.paragraphSpacing;
    if (expectedParagraphSpacingLines && actualParagraphSpacing !== undefined) {
      recordCheck(
        approximatelyEqual(expectedParagraphSpacingLines, actualParagraphSpacing, 0.5),
        buildMismatch(
          'general',
          'document',
          'paragraphSpacing',
          Number(expectedParagraphSpacingLines.toFixed(2)),
          Number(actualParagraphSpacing.toFixed(2))
        )
      );
    }

    const expectedBulletRaw = firstNonEmpty([
      raw?.bulletSymbols?.[0],
      simplified.listStyle
    ]);
    const actualBulletRaw = structured.blocks.find(block => block.type === 'bulletList')?.bulletSymbol
      || directives.bulletSymbol;
    if (expectedBulletRaw && actualBulletRaw) {
      const expectedBullet = normalizeBulletSymbol(expectedBulletRaw);
      const actualBullet = normalizeBulletSymbol(actualBulletRaw);
      recordCheck(
        markersEqual(expectedBullet, actualBullet),
        buildMismatch('list', 'bulletList', 'bulletSymbol', expectedBullet, actualBullet, 'warning')
      );
    }

    const expectedNumberFormat = firstNonEmpty([
      raw?.numberingFormats?.[0],
      directives.numberFormat
    ]);
    const actualNumberFormat = structured.blocks.find(block => block.type === 'numberedList')?.numberFormat
      || directives.numberFormat;
    if (expectedNumberFormat && actualNumberFormat) {
      recordCheck(
        listFormatsEqual(expectedNumberFormat, actualNumberFormat),
        buildMismatch('numbering', 'numberedList', 'numberFormat', expectedNumberFormat, actualNumberFormat, 'warning')
      );
    }

    // Heading checks
    const headingMap: Array<{ type: FormattedBlock['type']; tokens: string[] }> = [
      { type: 'title', tokens: ['title'] },
      { type: 'chapter', tokens: ['heading1', 'heading 1', 'h1'] },
      { type: 'section', tokens: ['heading2', 'heading 2', 'h2'] },
      { type: 'subsection', tokens: ['heading3', 'heading 3', 'h3'] }
    ];

    headingMap.forEach(({ type, tokens }) => {
      const block = structured.blocks.find(b => b.type === type && b.typography);
      if (!block) {
        return;
      }

      const expectedHeading = getExpectedHeadingStyle(raw, headingAttributes, tokens);
      const typography = block.typography;

      if (expectedHeading.font && typography?.font) {
        recordCheck(
          fontsEqual(expectedHeading.font, typography.font),
          buildMismatch('heading', type, 'font', expectedHeading.font, typography.font)
        );
      }

      if (expectedHeading.fontSize && typography?.fontSize) {
        recordCheck(
          approximatelyEqual(expectedHeading.fontSize, typography.fontSize, 0.5),
          buildMismatch('heading', type, 'fontSize', expectedHeading.fontSize, typography.fontSize)
        );
      }

      if (expectedHeading.color && typography?.color) {
        const expectedHeadingColor = normalizeColor(expectedHeading.color);
        const actualHeadingColor = normalizeColor(typography.color);
        recordCheck(
          expectedHeadingColor === actualHeadingColor,
          buildMismatch('heading', type, 'color', expectedHeadingColor, actualHeadingColor)
        );
      }
    });

    const complianceScore = checks === 0 ? 100 : Math.round((passes / checks) * 100);
    const isCompliant = mismatches.length === 0;

    return {
      isCompliant,
      complianceScore,
      checkedElements: checks,
      mismatches
    };
  }
}

function firstNonEmpty(values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length) {
      return value;
    }
  }
  return undefined;
}

function normalizedFont(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value.trim().toLowerCase();
}

function fontsEqual(expected: string, actual: string): boolean {
  return normalizedFont(expected) === normalizedFont(actual);
}

function normalizeColor(color?: string | null): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  if (!trimmed) return undefined;
  const prefixed = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(prefixed)) {
    return undefined;
  }
  return prefixed.toUpperCase();
}

function approximatelyEqual(expected: number, actual: number, tolerance: number): boolean {
  return Math.abs(expected - actual) <= tolerance;
}

function buildMismatch(
  category: StyleMismatchCategory,
  scope: string,
  property: string,
  expected?: string | number,
  actual?: string | number,
  severity: StyleMismatchSeverity = 'error'
): StyleValidationMismatch {
  return {
    category,
    scope,
    property,
    expected,
    actual,
    severity,
    message: `${scope} ${property} mismatch: expected ${formatMismatchValue(expected)}, got ${formatMismatchValue(actual)}`
  };
}

function formatMismatchValue(value?: string | number): string {
  if (value === undefined) return 'n/a';
  if (typeof value === 'number') return value.toString();
  return value;
}

function pointsToLineSpacing(points?: number | null): number | undefined {
  if (!points || !Number.isFinite(points)) {
    return undefined;
  }
  const lines = points / 12;
  return lines > 0 ? lines : undefined;
}

function markersEqual(expected: string, actual: string): boolean {
  return expected.trim() === actual.trim();
}

function listFormatsEqual(expected: string, actual: string): boolean {
  const normalizedExpected = expected.trim().toLowerCase();
  const normalizedActual = actual.trim().toLowerCase();
  if (normalizedExpected === normalizedActual) return true;

  const decimalLike = ['decimal', '1.', '1)', 'decimal-leading-zero'];
  if (decimalLike.includes(normalizedExpected) && decimalLike.includes(normalizedActual)) {
    return true;
  }

  return false;
}

function getSampleFont(structured: FormattedDocumentRepresentation): string | undefined {
  const paragraph = structured.blocks.find(block => block.type === 'paragraph' && block.typography?.font);
  return paragraph?.typography?.font;
}

function getSampleFontSize(structured: FormattedDocumentRepresentation): number | undefined {
  const paragraph = structured.blocks.find(block => block.type === 'paragraph' && typeof block.typography?.fontSize === 'number');
  return paragraph?.typography?.fontSize;
}

function getSampleColor(structured: FormattedDocumentRepresentation): string | undefined {
  const paragraph = structured.blocks.find(block => block.type === 'paragraph' && block.typography?.color);
  return paragraph?.typography?.color;
}

function getExpectedHeadingStyle(
  raw: RawDocxStyles | null,
  headings: Record<string, any>,
  tokens: string[]
): ExpectedHeadingStyle {
  const expected: ExpectedHeadingStyle = {};
  const normalizedTokens = tokens.map(token => normalizeHeadingKey(token));

  if (raw?.headingStyles) {
    for (const [key, value] of Object.entries(raw.headingStyles)) {
      const normalizedKey = normalizeHeadingKey(key);
      if (normalizedTokens.includes(normalizedKey)) {
        if (value.font) expected.font = value.font;
        if (typeof value.fontSize === 'number') expected.fontSize = value.fontSize;
        if (value.color) expected.color = value.color;
        break;
      }
    }
  }

  if (Object.keys(expected).length === 0 && headings) {
    for (const [key, value] of Object.entries(headings)) {
      const normalizedKey = normalizeHeadingKey(key);
      if (normalizedTokens.includes(normalizedKey)) {
        if (value.font) expected.font = value.font;
        if (typeof value.fontSize === 'number') expected.fontSize = value.fontSize;
        if (value.color) expected.color = value.color;
        break;
      }
    }
  }

  return expected;
}

function normalizeHeadingKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^heading/, 'heading');
}

function firstFiniteNumber(values: Array<number | undefined | null>): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}
