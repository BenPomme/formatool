import type { FormattedBlock } from '../types';

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

const PIPE_SEPARATOR = /\|/;
const TAB_SEPARATOR = /\t+/g;
const MULTI_SPACE_SEPARATORS = [/\s{3,}/g, /\s{2,}/g];

export function looksLikeTableLine(line: string): boolean {
  if (!line?.trim()) return false;
  if (PIPE_SEPARATOR.test(line) && /\|.*\|/.test(line)) return true;
  if (TAB_SEPARATOR.test(line)) {
    const cols = splitColumnsInternal(line, undefined, [TAB_SEPARATOR]);
    if (cols.length >= 2) return true;
  }
  const spaceCols = splitColumnsInternal(line, undefined, MULTI_SPACE_SEPARATORS);
  return spaceCols.length >= 2;
}

export function collectTableLines(
  lines: string[],
  startIndex: number
): { lines: string[]; endIndex: number } | null {
  const collected: string[] = [];
  let index = startIndex;
  let lastRowIndex = -1;

  while (index < lines.length) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed) break;

    if (!looksLikeTableLine(trimmed)) {
      if (!collected.length) break;
      collected[lastRowIndex] = `${collected[lastRowIndex]}\n${trimmed}`.trim();
      index += 1;
      continue;
    }

    collected.push(trimmed);
    lastRowIndex = collected.length - 1;
    index += 1;
  }

  if (!collected.length) {
    return null;
  }

  return {
    lines: collected,
    endIndex: index - 1
  };
}

export function parseTableFromText(content: string): ParsedTable | null {
  if (!content) return null;
  const rawLines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  return parseTableFromLines(rawLines);
}

export function parseTableFromLines(lines: string[]): ParsedTable | null {
  if (!lines?.length) return null;

  let headerIndex = -1;
  let headerColumns: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const columns = splitColumns(lines[i]);
    if (columns && columns.length >= 2) {
      headerIndex = i;
      headerColumns = columns;
      break;
    }
  }

  if (headerIndex === -1 || !headerColumns || headerColumns.length < 2) {
    return null;
  }

  const expectedColumns = headerColumns.length;
  const dataLines = lines.slice(headerIndex + 1);
  const rows: string[][] = [];
  let pendingRow: string[] | null = null;

  const pushCompletedRow = (row: string[]) => {
    if (row.length !== expectedColumns) return;
    rows.push(row.map(normalizeCell));
  };

  const appendContinuation = (target: string[] | null, text: string) => {
    if (target && target.length) {
      target[target.length - 1] = `${target[target.length - 1]} ${text}`.trim();
    } else if (rows.length) {
      const lastRow = rows[rows.length - 1];
      lastRow[lastRow.length - 1] = `${lastRow[lastRow.length - 1]} ${text}`.trim();
    }
  };

  for (const rawLine of dataLines) {
    const cleanedLine = rawLine.replace(/^[-•\u2022]+\s*/, '').trim();
    if (!cleanedLine) continue;

    const columns = splitColumns(cleanedLine, expectedColumns);

    if (!columns || !columns.length) {
      appendContinuation(pendingRow, cleanedLine);
      continue;
    }

    if (columns.length >= expectedColumns) {
      const base = columns.slice(0, expectedColumns);
      if (columns.length > expectedColumns) {
        base[base.length - 1] = `${base[base.length - 1]} ${columns.slice(expectedColumns).join(' ')}`.trim();
      }
      pushCompletedRow(base);
      pendingRow = null;
      continue;
    }

    if (!pendingRow) {
      pendingRow = [...columns];
    } else {
      const remaining = expectedColumns - pendingRow.length;
      const toTake = Math.min(remaining, columns.length);
      for (let i = 0; i < toTake; i++) {
        pendingRow.push(columns[i]);
      }
      if (columns.length > toTake) {
        pendingRow[pendingRow.length - 1] =
          `${pendingRow[pendingRow.length - 1]} ${columns.slice(toTake).join(' ')}`.trim();
      }
    }

    if (pendingRow && pendingRow.length >= expectedColumns) {
      const completed = pendingRow.slice(0, expectedColumns);
      pushCompletedRow(completed);
      pendingRow = null;
    }
  }

  if (pendingRow && pendingRow.length === expectedColumns) {
    pushCompletedRow(pendingRow);
  }

  if (!rows.length) {
    return null;
  }

  return {
    headers: headerColumns.map(normalizeCell),
    rows
  };
}

export function splitColumns(line: string, expected?: number): string[] | null {
  if (!line) return null;

  if (PIPE_SEPARATOR.test(line) && /\|.*\|/.test(line)) {
    const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
    const parts = trimmed.split('|').map(part => part.trim()).filter(Boolean);
    if (!parts.length) return null;
    if (expected && parts.length > expected) {
      const head = parts.slice(0, expected - 1);
      const tail = parts.slice(expected - 1).join(' ');
      return [...head, tail.trim()];
    }
    return parts;
  }

  const tabParts = splitColumnsInternal(line, expected, [TAB_SEPARATOR]);
  if (tabParts.length >= 2) return tabParts;

  const spaceParts = splitColumnsInternal(line, expected, MULTI_SPACE_SEPARATORS);
  return spaceParts.length >= 2 ? spaceParts : null;
}

function splitColumnsInternal(
  line: string,
  expected: number | undefined,
  separators: RegExp[]
): string[] {
  for (const separator of separators) {
    const parts = line.split(separator).map(part => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (expected && parts.length > expected) {
        const head = parts.slice(0, expected - 1);
        const tail = parts.slice(expected - 1).join(' ');
        return [...head, tail.trim()];
      }
      return parts;
    }
  }
  return [];
}

function normalizeCell(cell: string): string {
  return cell.replace(/\s+/g, ' ').trim();
}

export function renderMarkdownTable(table: ParsedTable): string {
  const headerRow = `| ${table.headers.map(h => escapeCell(h)).join(' | ')} |`;
  const separatorRow = `| ${table.headers.map(() => '---').join(' | ')} |`;
  const bodyRows = table.rows
    .map(row => `| ${row.map(cell => escapeCell(cell)).join(' | ')} |`)
    .join('\n');

  return [headerRow, separatorRow, bodyRows].filter(Boolean).join('\n');
}

function escapeCell(text: string): string {
  if (!text) return '';
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br />');
}

export function ensureBlockHasTableData(block: FormattedBlock): FormattedBlock {
  if (block.type !== 'table') return block;
  if (block.tableData && block.tableData.headers?.length) return block;

  const candidateText = block.metadata?.rawContent || block.runs?.map(r => r.text).join('\n') || '';
  const parsed = parseTableFromText(candidateText);
  if (!parsed) return block;

  return {
    ...block,
    tableData: parsed,
    metadata: {
      ...block.metadata,
      tableData: parsed
    }
  };
}
