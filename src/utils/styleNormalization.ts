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

/**
 * Normalize bullet symbols extracted from DOCX numbering templates.
 * Many templates rely on Wingdings/Symbol private-use glyphs (e.g. U+F0B7),
 * which render as garbled characters unless the exact font is embedded.
 * We map unsupported glyphs to standard Unicode bullets that work with
 * default document fonts.
 */
export function normalizeBulletSymbol(input?: string | null): string {
  if (!input) {
    return DEFAULT_BULLET;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return DEFAULT_BULLET;
  }

  const symbol = Array.from(trimmed)[0];
  if (!symbol) {
    return DEFAULT_BULLET;
  }

  const codePoint = symbol.codePointAt(0) ?? 0;

  // Private Use Area glyphs (Wingdings, Symbol, etc.) → fallback
  if (
    (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
    (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
    (codePoint >= 0x100000 && codePoint <= 0x10fffd)
  ) {
    return DEFAULT_BULLET;
  }

  if (ALLOWED_BULLET_CODEPOINTS.has(codePoint)) {
    return symbol;
  }

  // Common ASCII stand-ins
  if (symbol === '-' || symbol === '–' || symbol === '—') {
    return '–';
  }
  if (symbol === '*' || symbol === '·') {
    return DEFAULT_BULLET;
  }
  if (symbol === 'o' || symbol === 'O') {
    return '◦';
  }

  // Fall back to canonical bullet
  return DEFAULT_BULLET;
}

/**
 * Normalize numbering format hints to a canonical token used by PDF/Docx generators.
 */
export function normalizeNumberFormat(input?: string | null): string | undefined {
  if (!input) {
    return undefined;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes('01') || lower.includes('leading')) {
    return 'decimal-leading-zero';
  }

  if (lower.includes('(') || lower.includes(')')) {
    return 'decimal-parenthesis';
  }

  if (/[a]/.test(lower) && !/[ivxlcdm]/.test(lower)) {
    return 'lower-alpha';
  }

  if (/[a]/.test(trimmed) && trimmed === trimmed.toUpperCase()) {
    return 'upper-alpha';
  }

  if (/\biv|\bv|\bix|\bx\b/i.test(lower)) {
    return lower === lower.toLowerCase() ? 'lower-roman' : 'upper-roman';
  }

  return 'decimal';
}
