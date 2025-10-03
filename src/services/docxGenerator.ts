import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  PageBreak,
  NumberFormat
} from 'docx';
import fs from 'fs/promises';
import path from 'path';

// Simple style configurations with just fonts - no complex formatting
const STYLE_CONFIGS: Record<string, { font: string; fontSize: number }> = {
  'business-memo': { font: 'Calibri', fontSize: 24 }, // 12pt
  'book-manuscript': { font: 'Times New Roman', fontSize: 24 }, // 12pt
  'sales-proposal': { font: 'Arial', fontSize: 22 }, // 11pt
  'academic-paper': { font: 'Times New Roman', fontSize: 24 }, // 12pt
  'legal-document': { font: 'Times New Roman', fontSize: 24 }, // 12pt
  'technical-manual': { font: 'Segoe UI', fontSize: 20 }, // 10pt
  'marketing-brief': { font: 'Helvetica', fontSize: 22 }, // 11pt
  'meeting-minutes': { font: 'Calibri', fontSize: 22 } // 11pt
};

export async function generateDocx(
  content: string,
  filename: string,
  styleId: string
): Promise<string> {
  const styleConfig = STYLE_CONFIGS[styleId] || STYLE_CONFIGS['business-memo'];
  const paragraphs = parseContentToParagraphs(content, styleId, styleConfig);

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
            size: styleConfig.fontSize
          }
        },
        heading1: {
          run: {
            font: styleConfig.font,
            size: styleConfig.fontSize + 8, // Slightly larger for headings
            bold: true,
            color: '000000',
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
            font: styleConfig.font,
            size: styleConfig.fontSize + 4,
            bold: true,
            color: '000000',
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
      config: [
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
        }
      ]
    }
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(process.env.UPLOAD_DIR || './uploads', `${filename}.docx`);
  await fs.writeFile(outputPath, buffer);

  return outputPath;
}

function parseContentToParagraphs(
  content: string,
  styleId: string,
  styleConfig: { font: string; fontSize: number }
): Paragraph[] {
  const lines = content.split('\n');
  const paragraphs: Paragraph[] = [];
  let isFirstParagraph = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }

    // Special handling for specific document types (simplified)
    if (styleId === 'business-memo' && line.trim() === 'MEMORANDUM') {
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
              bold: true
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

    // Handle markdown headers
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)?.[0].length || 1;
      const text = line.replace(/^#+\s*/, '');

      paragraphs.push(
        new Paragraph({
          text,
          heading: level === 1 ? HeadingLevel.HEADING_1 :
                   level === 2 ? HeadingLevel.HEADING_2 :
                   HeadingLevel.HEADING_3
        })
      );
      isFirstParagraph = true;
      continue;
    }

    // Handle bullet points
    if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('✓ ')) {
      paragraphs.push(
        new Paragraph({
          text: line.substring(2),
          bullet: {
            level: 0
          },
          spacing: {
            after: 60
          }
        })
      );
      continue;
    }

    // Handle numbered lists
    if (/^\d+\.\s/.test(line)) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^\d+\.\s/, ''),
          numbering: {
            reference: 'default-numbering',
            level: 0
          }
        })
      );
      continue;
    }

    // Handle bold text (**text**)
    const boldPattern = /\*\*(.*?)\*\*/g;
    const hasFormatting = boldPattern.test(line);

    if (hasFormatting) {
      const runs: TextRun[] = [];
      let lastIndex = 0;
      let match;

      // Reset the regex
      boldPattern.lastIndex = 0;

      while ((match = boldPattern.exec(line)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
          runs.push(new TextRun({
            text: line.substring(lastIndex, match.index),
            font: styleConfig.font,
            size: styleConfig.fontSize
          }));
        }

        // Add the bold text
        runs.push(new TextRun({
          text: match[1],
          bold: true,
          font: styleConfig.font,
          size: styleConfig.fontSize
        }));

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < line.length) {
        runs.push(new TextRun({
          text: line.substring(lastIndex),
          font: styleConfig.font,
          size: styleConfig.fontSize
        }));
      }

      paragraphs.push(
        new Paragraph({
          children: runs,
          spacing: {
            line: 276,
            after: 120
          },
          alignment: getAlignment(styleId),
          indent: getIndent(styleId, isFirstParagraph)
        })
      );
    } else {
      // Regular paragraph
      paragraphs.push(
        new Paragraph({
          text: line,
          spacing: {
            line: styleId === 'book-manuscript' ? 480 : 276, // Double spacing for manuscripts
            after: styleId === 'book-manuscript' ? 0 : 120
          },
          alignment: getAlignment(styleId),
          indent: getIndent(styleId, isFirstParagraph)
        })
      );
    }

    // Only first paragraph after header/chapter doesn't get indented
    if (line.trim() && !line.startsWith('#') && !line.match(/^Chapter\s+\d+/i)) {
      isFirstParagraph = false;
    }
  }

  return paragraphs;
}

function getAlignment(styleId: string): typeof AlignmentType[keyof typeof AlignmentType] {
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