import React, { useEffect, useMemo, useState } from 'react';
import './DocumentActions.css';

interface DocumentActionsProps {
  content: string;
  filename: string;
  styleId: string;
  sessionId?: string | null;
  structuredRepresentation?: any | null;
  debugInfo?: any | null;
  onReset: () => void;
}

const DEFAULT_BULLET = '•';
const ALLOWED_BULLET_CODEPOINTS = new Set([
  0x2022, // •
  0x25CF, // ●
  0x25CB, // ○
  0x25E6, // ◦
  0x25A0, // ■
  0x25AA, // ▪
  0x25AB, // ▫
  0x2219, // ∙
  0x2023, // ‣
  0x26AC, // ⚬
  0x2043  // ⁃
]);

const sanitizeFontFamily = (font?: string) => {
  if (!font) return undefined;
  const trimmed = font.trim();
  if (!trimmed) return undefined;
  return trimmed.includes(' ') ? `'${trimmed}'` : trimmed;
};

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeBullet = (symbol?: string | null): string => {
  if (!symbol) return DEFAULT_BULLET;
  const trimmed = symbol.trim();
  if (!trimmed) return DEFAULT_BULLET;
  const char = Array.from(trimmed)[0];
  if (!char) return DEFAULT_BULLET;
  const codePoint = char.codePointAt(0) ?? 0;
  if (
    (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
    (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
    (codePoint >= 0x100000 && codePoint <= 0x10fffd)
  ) {
    return DEFAULT_BULLET;
  }
  if (ALLOWED_BULLET_CODEPOINTS.has(codePoint)) {
    return char;
  }
  if (char === '-' || char === '–' || char === '—') {
    return '–';
  }
  if (char === '*' || char === '·') {
    return DEFAULT_BULLET;
  }
  if (char === 'o' || char === 'O') {
    return '◦';
  }
  return DEFAULT_BULLET;
};

const spacesToEm = (spaces?: number | null) => {
  if (!spaces || spaces <= 0) return undefined;
  return `${(spaces * 0.25).toFixed(2)}em`;
};

const linesToMargin = (lines?: number) => {
  if (!lines || lines <= 0) return undefined;
  return `${(lines * 0.6).toFixed(2)}em`;
};

const buildStyleAttr = (styles: (string | undefined)[]) => {
  const filtered = styles.filter(Boolean) as string[];
  return filtered.length ? ` style="${filtered.join('; ')}"` : '';
};

const resolveTypography = (block: any, directives: any) => {
  const isHeading = ['title', 'chapter', 'section', 'subsection'].includes(block.type);
  return {
    font: block.typography?.font || directives?.defaultFont,
    fontSize: block.typography?.fontSize || directives?.defaultFontSize,
    color: block.typography?.color || directives?.defaultColor,
    isHeading
  };
};

const renderRuns = (
  runs: any[] | undefined,
  defaults: { font?: string; fontSize?: number; color?: string }
): string => {
  if (!runs || runs.length === 0) {
    return '';
  }

  return runs.map(run => {
    const styles: string[] = [];
    const font = run.font || defaults.font;
    const fontFamily = sanitizeFontFamily(font);
    if (fontFamily) {
      styles.push(`font-family: ${fontFamily}`);
    }
    const fontSize = run.fontSize || defaults.fontSize;
    if (fontSize) {
      styles.push(`font-size: ${fontSize}pt`);
    }
    const color = run.color || defaults.color;
    if (color) {
      styles.push(`color: ${color}`);
    }
    if (run.bold) {
      styles.push('font-weight: 600');
    }
    if (run.italic) {
      styles.push('font-style: italic');
    }
    let text = escapeHtml(run.text ?? '');
    text = text.replace(/\r?\n/g, '<br />');
    return `<span${buildStyleAttr(styles)}>${text || '&nbsp;'}</span>`;
  }).join('');
};

const renderParagraphLike = (block: any, directives: any, tag: string) => {
  const typography = resolveTypography(block, directives);
  const styles: string[] = [];
  const fontFamily = sanitizeFontFamily(typography.font);
  if (fontFamily) {
    styles.push(`font-family: ${fontFamily}`);
  }
  if (typography.fontSize) {
    styles.push(`font-size: ${typography.fontSize}pt`);
  }
  if (typography.color) {
    styles.push(`color: ${typography.color}`);
  }
  const alignment = block.alignment || directives?.baseAlignment;
  if (alignment) {
    styles.push(`text-align: ${alignment}`);
  }
  const lineHeight = block.lineHeight ?? directives?.lineHeight;
  if (lineHeight) {
    styles.push(`line-height: ${lineHeight}`);
  }
  const marginTop = linesToMargin(block.spacing?.before);
  if (marginTop) {
    styles.push(`margin-top: ${marginTop}`);
  }
  const marginBottom = linesToMargin(block.spacing?.after);
  if (marginBottom) {
    styles.push(`margin-bottom: ${marginBottom}`);
  }
  if (block.indent) {
    const indent = spacesToEm(block.indent);
    if (indent) {
      styles.push(`text-indent: ${indent}`);
    }
  }

  const defaultTypography = {
    font: typography.font,
    fontSize: typography.fontSize,
    color: typography.color
  };

  const numbering = block.numbering ? `<span class="preview-numbering">${escapeHtml(block.numbering)} </span>` : '';
  const contentHtml = renderRuns(block.runs, defaultTypography) || escapeHtml(block.metadata?.rawContent || '') || '&nbsp;';

  return `<${tag}${buildStyleAttr(styles)}>${numbering}${contentHtml}</${tag}>`;
};

const renderBulletList = (block: any, directives: any) => {
  const typography = resolveTypography(block, directives);
  const styles: string[] = [];
  const fontFamily = sanitizeFontFamily(typography.font);
  if (fontFamily) {
    styles.push(`font-family: ${fontFamily}`);
  }
  if (typography.fontSize) {
    styles.push(`font-size: ${typography.fontSize}pt`);
  }
  if (typography.color) {
    styles.push(`color: ${typography.color}`);
  }
  const bullet = normalizeBullet(block.bulletSymbol || directives?.bulletSymbol || DEFAULT_BULLET);
  const indent = typeof block.indent === 'number' ? spacesToEm(block.indent) : undefined;
  if (indent) {
    styles.push(`padding-left: calc(${indent} + 1.5em)`);
  }
  const marginTop = linesToMargin(block.spacing?.before);
  if (marginTop) {
    styles.push(`margin-top: ${marginTop}`);
  }
  const marginBottom = linesToMargin(block.spacing?.after);
  if (marginBottom) {
    styles.push(`margin-bottom: ${marginBottom}`);
  }

  const defaultTypography = {
    font: typography.font,
    fontSize: typography.fontSize,
    color: typography.color
  };

  const items = (block.listItems || []).map((runs: any[]) => {
    const contentHtml = renderRuns(runs, defaultTypography) || '&nbsp;';
    return `<li><span class="preview-list-marker">${escapeHtml(bullet)}</span><span class="preview-list-content">${contentHtml}</span></li>`;
  }).join('');

  return `<ul class="preview-list preview-list--bullet"${buildStyleAttr(styles)}>${items}</ul>`;
};

const renderNumberedList = (block: any, directives: any) => {
  const typography = resolveTypography(block, directives);
  const styles: string[] = [];
  const fontFamily = sanitizeFontFamily(typography.font);
  if (fontFamily) {
    styles.push(`font-family: ${fontFamily}`);
  }
  if (typography.fontSize) {
    styles.push(`font-size: ${typography.fontSize}pt`);
  }
  if (typography.color) {
    styles.push(`color: ${typography.color}`);
  }
  const indent = typeof block.indent === 'number' ? spacesToEm(block.indent) : undefined;
  if (indent) {
    styles.push(`padding-left: calc(${indent} + 1.75em)`);
  }
  const marginTop = linesToMargin(block.spacing?.before);
  if (marginTop) {
    styles.push(`margin-top: ${marginTop}`);
  }
  const marginBottom = linesToMargin(block.spacing?.after);
  if (marginBottom) {
    styles.push(`margin-bottom: ${marginBottom}`);
  }

  const defaultTypography = {
    font: typography.font,
    fontSize: typography.fontSize,
    color: typography.color
  };

  const items = (block.listItems || []).map((runs: any[], index: number) => {
    const contentHtml = renderRuns(runs, defaultTypography) || '&nbsp;';
    return `<li><span class="preview-numbering">${index + 1}.</span><span class="preview-list-content">${contentHtml}</span></li>`;
  }).join('');

  return `<ol class="preview-list preview-list--numbered"${buildStyleAttr(styles)}>${items}</ol>`;
};

const renderBlock = (block: any, directives: any): string => {
  if (block.tableData && block.tableData.headers && block.tableData.headers.length) {
    return renderTable(block.tableData);
  }
  switch (block.type) {
    case 'title':
      return renderParagraphLike(block, directives, 'h1');
    case 'chapter':
      return renderParagraphLike(block, directives, 'h2');
    case 'section':
      return renderParagraphLike(block, directives, 'h3');
    case 'subsection':
      return renderParagraphLike(block, directives, 'h4');
    case 'bulletList':
      return renderBulletList(block, directives);
    case 'numberedList':
      return renderNumberedList(block, directives);
    default:
      return renderParagraphLike(block, directives, 'p');
  }
};

const renderTable = (table: { headers: string[]; rows: string[][] }): string => {
  const headerHtml = table.headers
    .map(header => `<th>${escapeHtml(header)}</th>`)
    .join('');
  const bodyHtml = table.rows
    .map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `
    <table class="preview-table">
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  `;
};

const renderStructuredPreview = (structured: any | null): string => {
  if (!structured || !structured.blocks) {
    return '<div class="preview-root"><p class="preview-empty">No structured preview available.</p></div>';
  }
  const directives = structured.generalDirectives || {};
  const body = structured.blocks
    .map((block: any) => renderBlock(block, directives))
    .join('');

  return `<div class="preview-root">${body || '<p class="preview-empty">No content detected.</p>'}</div>`;
};

const renderPlainPreview = (content: string): string => {
  if (!content) {
    return '<div class="preview-root"><p class="preview-empty">No preview available.</p></div>';
  }

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
      ? 'preview-list preview-list--bullet'
      : 'preview-list preview-list--numbered';
    const items = listBuffer.items.join('');
    blocks.push(`<${tag} class="${className}">${items}</${tag}>`);
    listBuffer = null;
  };

  const renderInline = (text: string) => {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    return html;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith('#')) {
      flushList();
      const level = Math.min(trimmed.match(/^#+/)?.[0].length || 1, 6);
      const text = trimmed.replace(/^#+\s*/, '') || '&nbsp;';
      blocks.push(`<h${level}>${renderInline(text)}</h${level}>`);
      continue;
    }

    const bulletMatch = trimmed.match(/^([\-\*•‣◦▪▫●])\s+(.*)$/);
    if (bulletMatch) {
      const [, symbol, text] = bulletMatch;
      if (!listBuffer || listBuffer.type !== 'ul') {
        flushList();
        listBuffer = { type: 'ul', items: [] };
      }
      const bullet = normalizeBullet(symbol);
      listBuffer.items.push(`<li><span class="preview-list-marker">${escapeHtml(bullet)}</span><span class="preview-list-content">${renderInline(text)}</span></li>`);
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+[\.\)]|[a-zA-Z][\.\)])\s+(.*)$/);
    if (numberedMatch) {
      const [, marker, text] = numberedMatch;
      if (!listBuffer || listBuffer.type !== 'ol') {
        flushList();
        listBuffer = { type: 'ol', items: [] };
      }
      listBuffer.items.push(`<li><span class="preview-numbering">${escapeHtml(marker)}</span><span class="preview-list-content">${renderInline(text)}</span></li>`);
      continue;
    }

    flushList();
    blocks.push(`<p>${renderInline(trimmed)}</p>`);
  }

  flushList();

  return `<div class="preview-root">${blocks.join('') || '<p class="preview-empty">No content detected.</p>'}</div>`;
};

const DocumentActions: React.FC<DocumentActionsProps> = ({
  content,
  filename,
  styleId,
  sessionId,
  structuredRepresentation,
  debugInfo,
  onReset
}) => {
  const [downloading, setDownloading] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'docx' | 'pdf'>('docx');

  useEffect(() => {
    console.groupCollapsed('Formatter Debug Payload');
    console.log('Debug info:', debugInfo);
    if (debugInfo?.timings) {
      console.log('Timings (ms):', debugInfo.timings);
    }
    if (debugInfo?.fonts) {
      console.log('Fonts snapshot:', debugInfo.fonts);
    }
    if (debugInfo?.validation) {
      console.log('Style validation:', debugInfo.validation);
    }
    if (Array.isArray(debugInfo?.pipeline)) {
      debugInfo.pipeline.forEach((entry: string) => console.log(entry));
    }
    if (Array.isArray(debugInfo?.logs)) {
      console.log('Server logs:', debugInfo.logs);
    }
    console.groupEnd();
  }, [debugInfo]);

  const directives = structuredRepresentation?.generalDirectives;
  const semanticSummary = structuredRepresentation?.semanticSummary;
  const previewHtml = useMemo(() => {
    if (structuredRepresentation?.blocks?.length) {
      return renderStructuredPreview(structuredRepresentation);
    }
    return renderPlainPreview(content);
  }, [structuredRepresentation, content]);

  const timings = useMemo(() => {
    if (!debugInfo?.timings) return [] as Array<{ key: string; value: number }>;
    return Object.entries(debugInfo.timings)
      .map(([key, value]) => ({ key, value: Number(value) || 0 }))
      .sort((a, b) => b.value - a.value);
  }, [debugInfo]);

  const pipeline = debugInfo?.pipeline || [];
  const validation = debugInfo?.validation;
  const blockInsights = useMemo(() => {
    return (structuredRepresentation?.blocks || []).slice(0, 6).map((block: any) => ({
      type: block.type,
      role: block.insights?.role,
      confidence: block.insights?.confidence,
      typography: block.insights?.typography,
      layout: block.insights?.layout,
      raw: block.metadata?.rawContent?.slice(0, 120)
    }));
  }, [structuredRepresentation]);
  const validationIssues: any[] = validation?.mismatches || [];

  const appliedFonts = {
    bodyFont: directives?.defaultFont || debugInfo?.fonts?.applied?.defaultFont,
    bodySize: directives?.defaultFontSize || debugInfo?.fonts?.applied?.defaultFontSize,
    bodyColor: directives?.defaultColor || debugInfo?.fonts?.applied?.defaultColor,
    headingFont: debugInfo?.fonts?.extracted?.headingFont || debugInfo?.fonts?.generalRules?.defaultFont,
    headingSize: debugInfo?.fonts?.extracted?.headingFontSize,
    extractedBodyFont: debugInfo?.fonts?.extracted?.bodyFont,
    extractedBodySize: debugInfo?.fonts?.extracted?.bodyFontSize
  };

  const handleDownload = async () => {
    setDownloading(true);

    try {
      const response = await fetch('http://localhost:3001/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          format: selectedFormat,
          filename: filename.replace(/\.[^/.]+$/, ''),
          styleId,
          sessionId,
          structuredRepresentation
        })
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename.replace(/\.[^/.]+$/, '')}_formatted.${selectedFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download document');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="document-actions">
      <div className="success-message">
        <div className="success-icon">✅</div>
        <h2>Document formatted successfully!</h2>
        <p>Your document has been transformed with the {styleId} style.</p>
      </div>

      <div className="preview-section">
        <h3>Preview</h3>
        <div
          className="document-preview"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>

      <div className="insights-section">
        <div className="insights-grid">
          <div className="insight-card">
            <h4>Typography Snapshot</h4>
            <ul>
              <li>
                <span className="label">Body Font</span>
                <span className="value">{appliedFonts.bodyFont || appliedFonts.extractedBodyFont || 'n/a'}</span>
              </li>
              <li>
                <span className="label">Body Size</span>
                <span className="value">{appliedFonts.bodySize ? `${appliedFonts.bodySize} pt` : appliedFonts.extractedBodySize ? `${appliedFonts.extractedBodySize} pt` : 'n/a'}</span>
              </li>
              <li>
                <span className="label">Heading Font</span>
                <span className="value">{appliedFonts.headingFont || 'n/a'}</span>
              </li>
              <li>
                <span className="label">Text Color</span>
                <span className="value swatch"><span style={{ background: appliedFonts.bodyColor || '#2d3748' }} /></span>
              </li>
            </ul>
          </div>

          <div className="insight-card">
            <h4>Pipeline Timeline</h4>
            {pipeline.length === 0 ? (
              <p className="muted">No diagnostic data available.</p>
            ) : (
              <ol className="timeline">
                {pipeline.map((entry: string, idx: number) => (
                  <li key={idx}>{entry}</li>
                ))}
              </ol>
            )}
          </div>

          <div className="insight-card">
            <h4>Execution Timings</h4>
            {timings.length === 0 ? (
              <p className="muted">Timing data not captured.</p>
            ) : (
              <ul className="timing-list">
                {timings.map(item => (
                  <li key={item.key}>
                    <span className="label">{item.key}</span>
                    <span className="value">{item.value.toLocaleString()} ms</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="insight-card">
            <h4>Style Validation</h4>
            {validation ? (
              <>
                <p className="validation-summary">
                  Compliance: <strong>{validation.complianceScore}%</strong> · Checked {validation.checkedElements} elements
                </p>
                {validationIssues.length ? (
                  <ul className="validation-list">
                    {validationIssues.slice(0, 5).map((issue, idx) => (
                      <li key={idx}>
                        <span className={`badge badge--${issue.severity}`}>{issue.severity}</span>
                        <span className="issue-message">{issue.message}</span>
                      </li>
                    ))}
                    {validationIssues.length > 5 && (
                      <li className="muted">+{validationIssues.length - 5} more</li>
                    )}
                  </ul>
                ) : (
                  <p className="muted">No mismatches detected.</p>
                )}
              </>
            ) : (
              <p className="muted">Validation report not available.</p>
            )}
          </div>

          <div className="insight-card">
            <h4>Semantic Summary</h4>
            {semanticSummary ? (
              <ul className="semantic-summary">
                <li><span className="label">Detector</span><span className="value">{semanticSummary.detectorVersion}</span></li>
                <li><span className="label">Template</span><span className="value">{semanticSummary.templateVersion}</span></li>
                <li><span className="label">Titles</span><span className="value">{semanticSummary.summary.titles}</span></li>
                <li><span className="label">Headings</span><span className="value">{semanticSummary.summary.headings}</span></li>
                <li><span className="label">Paragraphs</span><span className="value">{semanticSummary.summary.paragraphs}</span></li>
                <li><span className="label">Lists</span><span className="value">{semanticSummary.summary.lists}</span></li>
                <li><span className="label">Tables</span><span className="value">{semanticSummary.summary.tables}</span></li>
                <li><span className="label">Other</span><span className="value">{semanticSummary.summary.other}</span></li>
              </ul>
            ) : (
              <p className="muted">Summary not available.</p>
            )}
          </div>

          <div className="insight-card">
            <h4>Block Insights</h4>
            {blockInsights.length === 0 ? (
              <p className="muted">No structured blocks to display.</p>
            ) : (
              <ul className="block-insight-list">
            {blockInsights.map((item: any, idx: number) => (
              <li key={idx}>
                <div className="block-insight-header">
                  <span className="badge">
                    {item.role || item.type}
                  </span>
                      <span className="confidence">{item.confidence ? `${Math.round(item.confidence * 100)}%` : '—'}</span>
                    </div>
                    {item.typography && (
                      <div className="block-insight-meta">
                        {item.typography.font && <span>{item.typography.font}</span>}
                        {item.typography.fontSizePt && <span>{item.typography.fontSizePt} pt</span>}
                        {item.typography.weight && <span>{item.typography.weight}</span>}
                        {item.typography.italic && <span>italic</span>}
                      </div>
                    )}
                    {item.raw && (
                      <p className="block-insight-snippet">{item.raw}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="export-section">
        <h3>Export Options</h3>
        <div className="format-selector">
          <label className={`format-option ${selectedFormat === 'docx' ? 'selected' : ''}`}>
            <input
              type="radio"
              value="docx"
              checked={selectedFormat === 'docx'}
              onChange={(e) => setSelectedFormat(e.target.value as 'docx')}
            />
            <span>📄 Word Document (.docx)</span>
          </label>
          <label className={`format-option ${selectedFormat === 'pdf' ? 'selected' : ''}`}>
            <input
              type="radio"
              value="pdf"
              checked={selectedFormat === 'pdf'}
              onChange={(e) => setSelectedFormat(e.target.value as 'pdf')}
            />
            <span>📑 PDF Document (.pdf)</span>
          </label>
        </div>
      </div>

      <div className="action-buttons">
        <button
          className="btn-download"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? 'Downloading...' : `Download as ${selectedFormat.toUpperCase()}`}
        </button>
        <button
          className="btn-reset"
          onClick={onReset}
        >
          Format Another Document
        </button>
      </div>
    </div>
  );
};

export default DocumentActions;
