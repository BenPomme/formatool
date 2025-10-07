// eslint-disable-next-line @typescript-eslint/no-var-requires
const unzipper: any = require('unzipper');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const xml2js: any = require('xml2js');
import { Readable } from 'stream';

export interface DocxStyles {
  fonts: Set<string>;
  fontSizes: Set<number>;
  colors: Set<string>;
  lineHeights: Set<number>;
  paragraphSpacing: { before: Set<number>; after: Set<number> };
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
  bulletSymbols: Set<string>;
  numberingFormats: Set<string>;
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

export class DocxStyleExtractor {
  /**
   * Extract actual styles from a DOCX file by reading its XML structure
   */
  async extractStyles(buffer: Buffer): Promise<DocxStyles> {
    const styles: DocxStyles = {
      fonts: new Set(),
      fontSizes: new Set(),
      colors: new Set(),
      lineHeights: new Set(),
      paragraphSpacing: { before: new Set(), after: new Set() },
      headingStyles: {},
      paragraphStyles: {},
      bulletSymbols: new Set(),
      numberingFormats: new Set(),
      numberingMap: {},
      numIdToAbstract: {}
    };

    try {
      // Parse the DOCX file (which is a ZIP archive)
      const directory = await unzipper.Open.buffer(buffer) as {
        files: Array<{ path: string; buffer(): Promise<Buffer> }>;
      };

      // Find the styles.xml file
      const stylesFile = directory.files.find(file => file.path === 'word/styles.xml');
      const documentFile = directory.files.find(file => file.path === 'word/document.xml');
      const fontTableFile = directory.files.find(file => file.path === 'word/fontTable.xml');
      const numberingFile = directory.files.find(file => file.path === 'word/numbering.xml');

      if (numberingFile) {
        const numberingContent = await numberingFile.buffer();
        await this.parseNumbering(numberingContent.toString(), styles);
      }

      if (stylesFile) {
        const stylesContent = await stylesFile.buffer();
        await this.parseStyles(stylesContent.toString(), styles);
      }

      if (documentFile) {
        const docContent = await documentFile.buffer();
        await this.parseDocument(docContent.toString(), styles);
      }

      if (fontTableFile) {
        const fontContent = await fontTableFile.buffer();
        await this.parseFontTable(fontContent.toString(), styles);
      }

    } catch (error) {
      console.error('Error extracting DOCX styles:', error);
    }

    return styles;
  }

  private async parseStyles(xml: string, styles: DocxStyles): Promise<void> {
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true,
      xmlns: false,
      explicitRoot: false
    });
    const result = await parser.parseStringPromise(xml);

    // Debug logging
    console.log('Parsing styles.xml...');

    // Handle different XML structure possibilities
    const stylesRoot = result['w:styles'] || result.styles || result;
    const styleElements = stylesRoot['w:style'] || stylesRoot.style || [];

    if (styleElements) {
      const styleArray = Array.isArray(styleElements) ? styleElements : [styleElements];

      styleArray.forEach((style, index) => {
        // Get style ID and name
        const styleId = style['w:styleId'] || style.styleId || style.$?.['w:styleId'];
        const styleName = style['w:name']?.['w:val'] || style.name?.['w:val'] || style.name?.val;
        const styleType = style['w:type'] || style.type;
        const styleKey = styleId || styleName || `style-${index}`;

        if (styleType === 'paragraph') {
          styles.paragraphStyles[styleKey] = {
            ...(styles.paragraphStyles[styleKey] || {}),
            id: styleId || styleKey,
            name: styleName,
            type: styleType
          };
        }

        // Extract font from style - check multiple possible paths
        const rPr = style['w:rPr'] || style.rPr;
        const rFonts = rPr?.['w:rFonts'] || rPr?.rFonts;
        const fontName = rFonts?.['w:ascii'] || rFonts?.ascii ||
                        rFonts?.['w:hAnsi'] || rFonts?.hAnsi ||
                        rFonts?.['w:cs'] || rFonts?.cs;

        if (fontName) {
          console.log(`Found font in style: ${fontName}`);
          styles.fonts.add(fontName);

          // Check if this is a heading style
          if (styleName?.toLowerCase().includes('heading') || styleId?.toLowerCase().includes('heading')) {
            styles.headingStyles[styleId] = { ...styles.headingStyles[styleId], font: fontName };
          }

          if (styleType === 'paragraph') {
            styles.paragraphStyles[styleKey] = {
              ...(styles.paragraphStyles[styleKey] || { id: styleId || styleKey }),
              id: styleId || styleKey,
              name: styleName,
              type: styleType,
              font: fontName
            } as any;
          }
        }

        // Extract font size
        const sz = rPr?.['w:sz'] || rPr?.sz;
        const fontSize = sz?.['w:val'] || sz?.val || sz;
        if (fontSize) {
          console.log(`Found font size: ${fontSize}`);
          // Word stores font size in half-points
          const sizeInPt = parseInt(fontSize) / 2;
          styles.fontSizes.add(sizeInPt);

          if (styleName?.toLowerCase().includes('heading') || styleId?.toLowerCase().includes('heading')) {
            styles.headingStyles[styleId] = { ...styles.headingStyles[styleId], fontSize: sizeInPt };
          }

          if (styleType === 'paragraph') {
            styles.paragraphStyles[styleKey] = {
              ...(styles.paragraphStyles[styleKey] || { id: styleId || styleKey }),
              id: styleId || styleKey,
              name: styleName,
              type: styleType,
              fontSize: sizeInPt
            } as any;
          }
        }

        // Extract color
        const colorEl = rPr?.['w:color'] || rPr?.color;
        const color = colorEl?.['w:val'] || colorEl?.val || colorEl;
        if (color && color !== 'auto') {
          console.log(`Found color: ${color}`);
          const colorHex = color.startsWith('#') ? color : `#${color}`;
          styles.colors.add(colorHex);

          if (styleName?.toLowerCase().includes('heading') || styleId?.toLowerCase().includes('heading')) {
            styles.headingStyles[styleId] = { ...styles.headingStyles[styleId], color: colorHex };
          }

          if (styleType === 'paragraph') {
            styles.paragraphStyles[styleKey] = {
              ...(styles.paragraphStyles[styleKey] || { id: styleId || styleKey }),
              id: styleId || styleKey,
              name: styleName,
              type: styleType,
              color: colorHex
            } as any;
          }
        }

        // Extract line height
        const pPr = style['w:pPr'] || style.pPr;
        const spacing = pPr?.['w:spacing'] || pPr?.spacing;
        const lineSpacing = spacing?.['w:line'] || spacing?.line;
        if (lineSpacing) {
          // Convert from twips to a multiplier (240 = single spacing)
          const lineHeight = parseInt(lineSpacing) / 240;
          styles.lineHeights.add(lineHeight);

          if (styleType === 'paragraph') {
            styles.paragraphStyles[styleKey] = {
              ...(styles.paragraphStyles[styleKey] || { id: styleId || styleKey }),
              id: styleId || styleKey,
              name: styleName,
              type: styleType,
              lineHeight
            } as any;
          }
        }

        // Extract paragraph spacing
        const spacingBefore = spacing?.['w:before'] || spacing?.before;
        const spacingAfter = spacing?.['w:after'] || spacing?.after;

        if (spacingBefore) {
          styles.paragraphSpacing.before.add(parseInt(spacingBefore) / 20); // Convert twips to pt
          if (styleType === 'paragraph') {
            styles.paragraphStyles[styleKey] = {
              ...(styles.paragraphStyles[styleKey] || { id: styleId || styleKey }),
              id: styleId || styleKey,
              name: styleName,
              type: styleType,
              spacingBefore: parseInt(spacingBefore) / 20
            } as any;
          }
        }
        if (spacingAfter) {
          styles.paragraphSpacing.after.add(parseInt(spacingAfter) / 20);
          if (styleType === 'paragraph') {
            styles.paragraphStyles[styleKey] = {
              ...(styles.paragraphStyles[styleKey] || { id: styleId || styleKey }),
              id: styleId || styleKey,
              name: styleName,
              type: styleType,
              spacingAfter: parseInt(spacingAfter) / 20
            } as any;
          }
        }

        if (styleType === 'paragraph') {
          const alignmentVal = this.extractAlignment(pPr);
          if (alignmentVal) {
            styles.paragraphStyles[styleKey] = {
              ...(styles.paragraphStyles[styleKey] || { id: styleId || styleKey }),
              id: styleId || styleKey,
              name: styleName,
              type: styleType,
              alignment: alignmentVal
            } as any;
          }

          const indent = this.extractIndent(pPr);
          if (indent) {
            styles.paragraphStyles[styleKey] = {
              ...(styles.paragraphStyles[styleKey] || { id: styleId || styleKey }),
              id: styleId || styleKey,
              name: styleName,
              type: styleType,
              indent
            } as any;
          }

          const numbering = this.extractNumbering(pPr, styles);
          if (numbering) {
            styles.paragraphStyles[styleKey] = {
              ...(styles.paragraphStyles[styleKey] || { id: styleId || styleKey }),
              id: styleId || styleKey,
              name: styleName,
              type: styleType,
              numbering
            } as any;
          }
        }

        // Check for default style
        const isDefault = style['w:default'] === '1' || style.default === '1';
        const isParaStyle = style['w:type'] === 'paragraph' || style.type === 'paragraph';
        if (isDefault && isParaStyle) {
          if (fontName) styles.defaultFont = fontName;
          if (fontSize) styles.defaultFontSize = parseInt(fontSize) / 2;
          if (color && color !== 'auto') styles.defaultColor = color.startsWith('#') ? color : `#${color}`;
        }
      });
    }

    // Also check document defaults
    const docDefaults = stylesRoot['w:docDefaults'] || stylesRoot.docDefaults;
    if (docDefaults) {
      console.log('Found docDefaults');
      const rPrDefault = docDefaults['w:rPrDefault'] || docDefaults.rPrDefault;
      const rPr = rPrDefault?.['w:rPr'] || rPrDefault?.rPr;
      const rFonts = rPr?.['w:rFonts'] || rPr?.rFonts;
      const defaultFont = rFonts?.['w:ascii'] || rFonts?.ascii ||
                         rFonts?.['w:hAnsi'] || rFonts?.hAnsi;
      if (defaultFont) {
        console.log(`Found default font: ${defaultFont}`);
        styles.fonts.add(defaultFont);
        if (!styles.defaultFont) styles.defaultFont = defaultFont;
      }

      const sz = rPr?.['w:sz'] || rPr?.sz;
      const defaultSize = sz?.['w:val'] || sz?.val || sz;
      if (defaultSize) {
        console.log(`Found default size: ${defaultSize}`);
        const sizeInPt = parseInt(defaultSize) / 2;
        styles.fontSizes.add(sizeInPt);
        if (!styles.defaultFontSize) styles.defaultFontSize = sizeInPt;
      }

      const colorEl = rPr?.['w:color'] || rPr?.color;
      const defaultColor = colorEl?.['w:val'] || colorEl?.val || colorEl;
      if (defaultColor && defaultColor !== 'auto') {
        console.log(`Found default color: ${defaultColor}`);
        const colorHex = defaultColor.startsWith('#') ? defaultColor : `#${defaultColor}`;
        styles.colors.add(colorHex);
        if (!styles.defaultColor) styles.defaultColor = colorHex;
      }

      const pPrDefault = docDefaults['w:pPrDefault'] || docDefaults.pPrDefault;
      const pPrDefaults = pPrDefault?.['w:pPr'] || pPrDefault?.pPr;
      if (pPrDefaults) {
        const defaultAlignment = this.extractAlignment(pPrDefaults);
        if (defaultAlignment) {
          styles.defaultAlignment = defaultAlignment;
        }

        const defaultIndent = this.extractIndent(pPrDefaults);
        if (defaultIndent?.firstLine) {
          // store as default indent via paragraphStyles fallback if needed later
        }

        const spacingDefaults = pPrDefaults['w:spacing'] || pPrDefaults.spacing;
        const defaultLine = spacingDefaults?.['w:line'] || spacingDefaults?.line;
        if (defaultLine) {
          styles.defaultLineHeight = parseInt(defaultLine) / 240;
        }
      }
    }
  }

  private extractAlignment(pPr: any): 'left' | 'center' | 'right' | 'justify' | undefined {
    if (!pPr) return undefined;
    const jc = pPr['w:jc'] || pPr.jc;
    const raw = this.getValue(jc?.['w:val'], jc?.val, jc);
    if (!raw) return undefined;
    const normalized = raw.toLowerCase();
    if (['left', 'start'].includes(normalized)) return 'left';
    if (['right', 'end'].includes(normalized)) return 'right';
    if (normalized === 'center') return 'center';
    if (normalized === 'both' || normalized === 'justify') return 'justify';
    return undefined;
  }

  private extractIndent(pPr: any): {
    left?: number;
    right?: number;
    firstLine?: number;
    hanging?: number;
  } | undefined {
    if (!pPr) return undefined;
    const ind = pPr['w:ind'] || pPr.ind;
    if (!ind) return undefined;

    const left = this.toPoints(this.getValue(ind['w:left'], ind.left, ind['w:start'], ind.start));
    const right = this.toPoints(this.getValue(ind['w:right'], ind.right, ind['w:end'], ind.end));
    const firstLine = this.toPoints(this.getValue(ind['w:firstLine'], ind.firstLine));
    const hanging = this.toPoints(this.getValue(ind['w:hanging'], ind.hanging));

    if ([left, right, firstLine, hanging].every(v => v === undefined)) {
      return undefined;
    }

    return {
      left,
      right,
      firstLine,
      hanging
    };
  }

  private extractNumbering(pPr: any, styles: DocxStyles): {
    numId?: string;
    abstractNumId?: string;
    level?: number;
    numFormat?: string;
    levelText?: string;
  } | undefined {
    if (!pPr) return undefined;
    const numPr = pPr['w:numPr'] || pPr.numPr;
    if (!numPr) return undefined;

    const numIdRaw = numPr['w:numId'] || numPr.numId;
    const ilvlRaw = numPr['w:ilvl'] || numPr.ilvl;
    const numId = this.getValue(numIdRaw?.['w:val'], numIdRaw?.val, numIdRaw);
    const ilvl = this.getValue(ilvlRaw?.['w:val'], ilvlRaw?.val, ilvlRaw);
    const level = ilvl !== undefined ? parseInt(ilvl, 10) : 0;

    if (!numId) {
      return undefined;
    }

    const abstractNumId = styles.numIdToAbstract[numId];
    const levelInfo = abstractNumId
      ? styles.numberingMap[abstractNumId]?.levels?.[level] || styles.numberingMap[abstractNumId]?.levels?.[0]
      : undefined;

    const numFormat = levelInfo?.numFormat;
    const levelText = levelInfo?.levelText;

    if (numFormat) {
      styles.numberingFormats.add(numFormat);
      if (numFormat === 'bullet' && levelText) {
        const cleaned = this.cleanBulletSymbol(levelText);
        if (cleaned) {
          styles.bulletSymbols.add(cleaned);
        }
      }
    }

    return {
      numId,
      abstractNumId,
      level,
      numFormat,
      levelText
    };
  }

  private cleanBulletSymbol(lvlText: string): string | undefined {
    if (!lvlText) return undefined;
    const stripped = lvlText.replace(/%\d/g, '').trim();
    if (!stripped) return undefined;
    return stripped;
  }

  private getValue(...candidates: Array<string | number | undefined | null>): string | undefined {
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      if (typeof candidate === 'object') continue;
      const value = String(candidate).trim();
      if (value.length > 0) {
        return value;
      }
    }
    return undefined;
  }

  private toPoints(value?: string): number | undefined {
    if (!value) return undefined;
    const numeric = parseFloat(value);
    if (Number.isNaN(numeric)) return undefined;
    return numeric / 20; // twips to points
  }

  private async parseDocument(xml: string, styles: DocxStyles): Promise<void> {
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true,
      xmlns: false,
      explicitRoot: false
    });
    const result = await parser.parseStringPromise(xml);

    console.log('Parsing document.xml...');

    // Extract inline styles from runs
    const extractRunStyles = (run: any) => {
      const rPr = run?.['w:rPr'] || run?.rPr;
      if (!rPr) return;

      // Font
      const rFonts = rPr['w:rFonts'] || rPr.rFonts;
      const font = rFonts?.['w:ascii'] || rFonts?.ascii ||
                   rFonts?.['w:hAnsi'] || rFonts?.hAnsi ||
                   rFonts?.['w:cs'] || rFonts?.cs;
      if (font) {
        styles.fonts.add(font);
        console.log(`Found inline font: ${font}`);
      }

      // Size
      const sz = rPr['w:sz'] || rPr.sz;
      const size = sz?.['w:val'] || sz?.val || sz;
      if (size) {
        styles.fontSizes.add(parseInt(size) / 2);
        console.log(`Found inline size: ${parseInt(size) / 2}`);
      }

      // Color
      const colorEl = rPr['w:color'] || rPr.color;
      const color = colorEl?.['w:val'] || colorEl?.val || colorEl;
      if (color && color !== 'auto') {
        styles.colors.add(color.startsWith('#') ? color : `#${color}`);
        console.log(`Found inline color: ${color}`);
      }
    };

    // Recursively process document body
    const processElement = (element: any) => {
      // Process runs
      const runs = element?.['w:r'] || element?.r;
      if (runs) {
        const runArray = Array.isArray(runs) ? runs : [runs];
        runArray.forEach(extractRunStyles);
      }

      // Process paragraph properties
      const pPr = element?.['w:pPr'] || element?.pPr;
      if (pPr) {

        // Line spacing
        const spacing = pPr['w:spacing'] || pPr.spacing;
        const lineSpacing = spacing?.['w:line'] || spacing?.line;
        if (lineSpacing) {
          styles.lineHeights.add(parseInt(lineSpacing) / 240);
        }

        // Paragraph spacing
        const before = spacing?.['w:before'] || spacing?.before;
        const after = spacing?.['w:after'] || spacing?.after;
        if (before) styles.paragraphSpacing.before.add(parseInt(before) / 20);
        if (after) styles.paragraphSpacing.after.add(parseInt(after) / 20);
      }

      // Recursively process children
      for (const key in element) {
        if (element[key] && typeof element[key] === 'object') {
          if (Array.isArray(element[key])) {
            element[key].forEach(processElement);
          } else {
            processElement(element[key]);
          }
        }
      }
    };

    const document = result['w:document'] || result.document || result;
    const body = document['w:body'] || document.body;
    if (body) {
      console.log('Processing document body...');
      processElement(body);
    } else {
      console.log('No body found in document');
    }
  }

  private async parseFontTable(xml: string, styles: DocxStyles): Promise<void> {
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true,
      xmlns: false,
      explicitRoot: false
    });
    const result = await parser.parseStringPromise(xml);

    console.log('Parsing fontTable.xml...');

    const fontsRoot = result['w:fonts'] || result.fonts || result;
    const fontElements = fontsRoot['w:font'] || fontsRoot.font;

    if (fontElements) {
      const fonts = Array.isArray(fontElements) ? fontElements : [fontElements];

      fonts.forEach((font: any) => {
        const fontName = font['w:name'] || font.name;
        if (fontName) {
          styles.fonts.add(fontName);
          console.log(`Found font in table: ${fontName}`);
        }
      });
    } else {
      console.log('No fonts found in fontTable.xml');
    }
  }

  private async parseNumbering(xml: string, styles: DocxStyles): Promise<void> {
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true,
      xmlns: false,
      explicitRoot: false
    });

    try {
      const result = await parser.parseStringPromise(xml);
      console.log('Parsing numbering.xml...');

      const numberingRoot = result['w:numbering'] || result.numbering || result;
      const abstractNums = numberingRoot['w:abstractNum'] || numberingRoot.abstractNum || [];
      const abstractArray = Array.isArray(abstractNums) ? abstractNums : [abstractNums];

      abstractArray.forEach((abstract: any) => {
        if (!abstract) return;
        const abstractNumId = this.getValue(
          abstract['w:abstractNumId']?.['w:val'],
          abstract['w:abstractNumId']?.val,
          abstract['w:abstractNumId'],
          abstract.abstractNumId?.['w:val'],
          abstract.abstractNumId?.val,
          abstract.abstractNumId
        );
        if (!abstractNumId) return;

        const levels: Record<number, { numFormat?: string; levelText?: string }> = {};
        const lvlElements = abstract['w:lvl'] || abstract.lvl || [];
        const lvlArray = Array.isArray(lvlElements) ? lvlElements : [lvlElements];

        lvlArray.forEach((lvl: any) => {
          if (!lvl) return;
          const levelVal = this.getValue(lvl['w:ilvl']?.['w:val'], lvl['w:ilvl']?.val, lvl['w:ilvl'], lvl.ilvl?.['w:val'], lvl.ilvl?.val, lvl.ilvl);
          const level = levelVal ? parseInt(levelVal, 10) : 0;

          const numFmt = this.getValue(
            lvl['w:numFmt']?.['w:val'],
            lvl['w:numFmt']?.val,
            lvl['w:numFmt'],
            lvl.numFmt?.['w:val'],
            lvl.numFmt?.val,
            lvl.numFmt
          );

          const lvlText = this.getValue(
            lvl['w:lvlText']?.['w:val'],
            lvl['w:lvlText']?.val,
            lvl['w:lvlText'],
            lvl.lvlText?.['w:val'],
            lvl.lvlText?.val,
            lvl.lvlText
          );

          if (numFmt) {
            styles.numberingFormats.add(numFmt);
            if (numFmt === 'bullet' && lvlText) {
              const cleaned = this.cleanBulletSymbol(lvlText);
              if (cleaned) {
                styles.bulletSymbols.add(cleaned);
              }
            }
          }

          levels[level] = {
            numFormat: numFmt,
            levelText: lvlText
          };
        });

        styles.numberingMap[abstractNumId] = {
          abstractNumId,
          levels
        };
      });

      const numElements = numberingRoot['w:num'] || numberingRoot.num || [];
      const numArray = Array.isArray(numElements) ? numElements : [numElements];

      numArray.forEach((num: any) => {
        if (!num) return;
        const numId = this.getValue(num['w:numId']?.['w:val'], num['w:numId']?.val, num['w:numId'], num.numId?.['w:val'], num.numId?.val, num.numId);
        const abstractRef = num['w:abstractNumId'] || num.abstractNumId;
        const abstractNumId = this.getValue(abstractRef?.['w:val'], abstractRef?.val, abstractRef);

        if (numId && abstractNumId) {
          styles.numIdToAbstract[numId] = abstractNumId;
        }
      });
    } catch (error) {
      console.error('Error parsing numbering.xml:', error);
    }
  }
}
