/**
 * Comprehensive style attributes that can be extracted from a reference document
 * These attributes cover all major formatting aspects
 */

export interface StyleAttributes {
  // Document-level styles
  document: {
    pageSize: 'A4' | 'Letter' | 'Legal' | 'Custom';
    pageOrientation: 'portrait' | 'landscape';
    margins: {
      top: number;    // in mm
      bottom: number;
      left: number;
      right: number;
    };
    lineHeight: number; // multiplier (e.g., 1.5, 2)
    defaultFont: string;
    defaultFontSize: number; // in pt
    defaultColor: string; // hex color
    backgroundColor?: string;
    columns?: number;
    columnSpacing?: number; // in mm
  };

  // Typography styles
  typography: {
    fonts: string[];  // List of all fonts used
    fontSizes: number[]; // List of all font sizes used

    // Heading styles
    headings: {
      [level: string]: {  // h1, h2, h3, etc.
        font?: string;
        fontSize: number;
        fontWeight: 'normal' | 'bold' | 'light' | 'medium' | 'semibold' | 'extrabold';
        fontStyle: 'normal' | 'italic' | 'oblique';
        color?: string;
        textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
        letterSpacing?: number;
        lineHeight?: number;
        marginTop?: number;
        marginBottom?: number;
        alignment?: 'left' | 'center' | 'right' | 'justify';
        numbering?: {
          style: 'decimal' | 'roman' | 'letter' | 'none';
          prefix?: string;
          suffix?: string;
        };
      };
    };

    // Body text styles
    bodyText: {
      font: string;
      fontSize: number;
      fontWeight: string;
      color: string;
      lineHeight: number;
      paragraphSpacing: number;
      firstLineIndent?: number;
      alignment: 'left' | 'center' | 'right' | 'justify';
    };
  };

  // Paragraph styles
  paragraphs: {
    spacing: {
      before: number; // in pt
      after: number;
      line: number; // line height multiplier
    };
    indentation: {
      firstLine?: number; // in mm
      left?: number;
      right?: number;
      hanging?: number;
    };
    alignment: 'left' | 'center' | 'right' | 'justify';
    dropCap?: boolean;
    keepWithNext?: boolean;
    widowControl?: boolean;
  };

  // List styles
  lists: {
    bulleted: {
      symbol: string; // •, ◦, ▪, -, *, etc.
      indentLevel: number; // in mm
      spacing: number;
      font?: string;
      color?: string;
      nestedSymbols?: string[]; // Symbols for nested levels
    };
    numbered: {
      format: string; // '1.', '(1)', 'a)', 'i.', etc.
      indentLevel: number;
      spacing: number;
      font?: string;
      color?: string;
      nestedFormats?: string[]; // Formats for nested levels
      restartNumbering?: boolean;
    };
  };

  // Table styles
  tables: {
    borderStyle: 'none' | 'solid' | 'dashed' | 'dotted' | 'double';
    borderWidth: number;
    borderColor: string;
    cellPadding: number;
    cellSpacing: number;
    headerRow?: {
      backgroundColor: string;
      textColor: string;
      fontWeight: string;
      fontSize?: number;
      alignment?: string;
    };
    alternateRows?: boolean;
    alternateRowColor?: string;
    gridLines?: boolean;
    alignment?: 'left' | 'center' | 'right';
  };

  // Section styles
  sections: {
    titleFormat?: {
      font?: string;
      fontSize: number;
      fontWeight: string;
      color?: string;
      alignment: string;
      numbering?: boolean;
      pageBreakBefore?: boolean;
    };
    spacing: {
      before: number;
      after: number;
    };
  };

  // Header and footer styles
  headerFooter: {
    header?: {
      content?: string;
      font?: string;
      fontSize?: number;
      alignment?: 'left' | 'center' | 'right';
      color?: string;
      includePageNumber?: boolean;
      includeDate?: boolean;
      includeTitle?: boolean;
      borderBottom?: boolean;
      margin?: number;
    };
    footer?: {
      content?: string;
      font?: string;
      fontSize?: number;
      alignment?: 'left' | 'center' | 'right';
      color?: string;
      includePageNumber?: boolean;
      pageNumberFormat?: string;
      borderTop?: boolean;
      margin?: number;
    };
  };

  // Special formatting
  special: {
    blockQuotes?: {
      indentLeft: number;
      indentRight: number;
      borderLeft?: boolean;
      borderColor?: string;
      backgroundColor?: string;
      fontStyle?: string;
      fontSize?: number;
    };
    codeBlocks?: {
      font: string;
      fontSize: number;
      backgroundColor: string;
      textColor: string;
      borderRadius?: number;
      padding?: number;
      lineNumbers?: boolean;
    };
    callouts?: {
      borderColor: string;
      backgroundColor: string;
      iconColor?: string;
      padding: number;
      borderRadius?: number;
    };
    footnotes?: {
      fontSize: number;
      superscript: boolean;
      separator?: boolean;
      numberFormat?: string;
    };
    captions?: {
      font?: string;
      fontSize: number;
      fontStyle: string;
      alignment: string;
      color?: string;
      prefix?: string; // e.g., "Figure 1: ", "Table 1: "
    };
  };

  // Color scheme
  colors: {
    primary: string;
    secondary?: string;
    accent?: string;
    text: {
      primary: string;
      secondary: string;
      disabled?: string;
      inverse?: string;
    };
    background: {
      primary: string;
      secondary?: string;
      paper?: string;
    };
    links?: {
      default: string;
      visited?: string;
      hover?: string;
      active?: string;
    };
    highlights?: string[];
  };

  // Spacing and layout
  layout: {
    sectionBreaks: 'continuous' | 'nextPage' | 'evenPage' | 'oddPage';
    columnBreaks?: boolean;
    pageBreaks?: {
      beforeHeading1?: boolean;
      beforeHeading2?: boolean;
      avoidInParagraph?: boolean;
    };
    whitespace: {
      preserveMultipleSpaces?: boolean;
      preserveLineBreaks?: boolean;
      trimTrailingSpaces?: boolean;
    };
  };

  // Metadata
  metadata: {
    language?: string;
    direction?: 'ltr' | 'rtl';
    hyphenation?: boolean;
    kerning?: boolean;
    ligatures?: boolean;
    documentClass?: string; // e.g., 'report', 'article', 'book', 'memo'
    customCSS?: string;
  };
}

/**
 * Raw DOCX styles extracted directly from the document XML
 * Arrays ensure the data can be serialized in API responses
 */
export interface RawDocxStyles {
  fonts: string[];
  fontSizes: number[];
  colors: string[];
  lineHeights: number[];
  paragraphSpacing: {
    before: number[];
    after: number[];
  };
  defaultFont?: string;
  defaultFontSize?: number;
  defaultColor?: string;
  defaultAlignment?: 'left' | 'center' | 'right' | 'justify';
  defaultLineHeight?: number;
  headingStyles: {
    [key: string]: {
      font?: string;
      fontSize?: number;
      color?: string;
      bold?: boolean;
    };
  };
  paragraphStyles: {
    [key: string]: {
      id: string;
      name?: string;
      type?: string;
      font?: string;
      fontSize?: number;
      color?: string;
      alignment?: 'left' | 'center' | 'right' | 'justify';
      spacingBefore?: number;
      spacingAfter?: number;
      lineHeight?: number;
      indent?: {
        left?: number;
        right?: number;
        firstLine?: number;
        hanging?: number;
      };
      numbering?: {
        numId?: string;
        abstractNumId?: string;
        level?: number;
        numFormat?: string;
        levelText?: string;
      };
    };
  };
  bulletSymbols: string[];
  numberingFormats: string[];
  numberingMap: {
    [abstractNumId: string]: {
      abstractNumId: string;
      levels: {
        [level: number]: {
          numFormat?: string;
          levelText?: string;
        };
      };
    };
  };
  numIdToAbstract: Record<string, string>;
}

/**
 * Simplified style attributes for quick extraction
 */
export interface SimplifiedStyleAttributes {
  font: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  headingStyles: Record<string, any>;
  listStyle: string;
  colors: {
    text: string;
    heading: string;
    background: string;
  };
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

/**
 * Style extraction result
 */
export interface StyleExtractionResult {
  success: boolean;
  attributes: StyleAttributes;
  simplified: SimplifiedStyleAttributes;
  confidence: number; // 0-100
  warnings?: string[];
  documentType?: string;
  rawDocxStyles: RawDocxStyles | null;
}
