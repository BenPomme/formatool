import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

export async function generatePdf(
  content: string,
  filename: string,
  styleId: string
): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const htmlContent = convertToHtml(content, styleId);

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

function convertToHtml(content: string, styleId: string): string {
  const styles = getStylesForId(styleId);
  const processedContent = processContent(content);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        ${styles}
      </style>
    </head>
    <body>
      ${processedContent}
    </body>
    </html>
  `;
}

function getStylesForId(styleId: string): string {
  const baseStyles = `
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      font-size: 28px;
      margin: 20px 0;
      color: #000;
    }
    h2 {
      font-size: 22px;
      margin: 18px 0;
      color: #222;
    }
    h3 {
      font-size: 18px;
      margin: 16px 0;
      color: #333;
    }
    p {
      margin: 12px 0;
    }
    ul, ol {
      margin: 12px 0;
      padding-left: 30px;
    }
    li {
      margin: 6px 0;
    }
    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 16px;
      margin: 16px 0;
      font-style: italic;
    }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: #f4f4f4;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
    }
  `;

  const styleSpecific: Record<string, string> = {
    'business-memo': `
      body { font-family: Calibri, 'Segoe UI', sans-serif; line-height: 1.5; }
      h1 { text-transform: uppercase; font-size: 14px; font-weight: bold; text-align: center; }
      h2 { font-size: 12px; font-weight: bold; }
    `,
    'book-manuscript': `
      body { font-family: 'Times New Roman', serif; line-height: 2; }
      h1 { text-align: center; margin-top: 3em; }
      p { text-indent: 0.5in; }
      p:first-of-type { text-indent: 0; }
    `,
    'sales-proposal': `
      body { font-family: Arial, sans-serif; line-height: 1.6; }
      h1 { color: #2c5282; font-size: 24px; }
      h2 { color: #4a5568; border-bottom: 2px solid #e2e8f0; }
    `,
    'academic-paper': `
      body { font-family: 'Times New Roman', serif; text-align: justify; }
      h1 { font-size: 14px; text-align: center; font-weight: bold; }
      h2 { font-size: 12px; font-weight: bold; margin-top: 1em; }
    `,
    'legal-document': `
      body { font-family: 'Times New Roman', serif; line-height: 2; }
      h1 { text-align: center; text-transform: uppercase; font-size: 14px; }
      p { text-align: justify; margin-bottom: 1em; }
    `,
    'technical-manual': `
      body { font-family: 'Segoe UI', sans-serif; }
      h1, h2, h3 { font-family: 'Segoe UI', sans-serif; color: #1a202c; }
      code { background: #f7fafc; border: 1px solid #e2e8f0; padding: 2px 4px; }
    `,
    'marketing-brief': `
      body { font-family: Helvetica, Arial, sans-serif; }
      h1 { font-weight: 300; font-size: 32px; color: #e91e63; }
      h2 { font-weight: 300; color: #666; }
    `,
    'meeting-minutes': `
      body { font-family: Calibri, sans-serif; }
      h1 { font-size: 16px; text-decoration: underline; }
      ul { margin-left: 0; padding-left: 20px; }
    `
  };

  return baseStyles + (styleSpecific[styleId] || '');
}

function processContent(content: string): string {
  let html = content
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');

  html = html.replace(/<li>/g, (match, offset, str) => {
    const prevChar = offset > 0 ? str[offset - 1] : '';
    if (prevChar !== '>') {
      return '<ul><li>';
    }
    return match;
  });

  html = html.replace(/<\/li>/g, (match, offset, str) => {
    const nextChar = offset + 5 < str.length ? str[offset + 5] : '';
    if (nextChar !== '<') {
      return '</li></ul>';
    }
    return match;
  });

  return html;
}