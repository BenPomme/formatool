export interface RichTextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  color?: string;
}

/**
 * Parse lightweight markdown-style markers into rich text segments.
 * Supports **bold**, *italic*, and [color=#HEX]...[/color] spans.
 */
export function parseRichTextSegments(input: string): RichTextSegment[] {
  if (!input) {
    return [];
  }

  const segments: RichTextSegment[] = [];
  const colorStack: string[] = [];
  let buffer = '';
  let bold = false;
  let italic = false;

  const flush = () => {
    if (!buffer) {
      return;
    }
    const currentColor = colorStack[colorStack.length - 1];
    const lastSegment = segments[segments.length - 1];

    if (
      lastSegment &&
      lastSegment.bold === bold &&
      lastSegment.italic === italic &&
      lastSegment.color === currentColor
    ) {
      lastSegment.text += buffer;
    } else {
      segments.push({
        text: buffer,
        bold,
        italic,
        color: currentColor
      });
    }

    buffer = '';
  };

  const length = input.length;
  let index = 0;

  while (index < length) {
    // Handle bold toggles (**)
    if (input.startsWith('**', index)) {
      flush();
      bold = !bold;
      index += 2;
      continue;
    }

    // Handle italic toggles (*) - ensure we don't double-count bold markers
    if (input[index] === '*' && !input.startsWith('**', index)) {
      flush();
      italic = !italic;
      index += 1;
      continue;
    }

    // Handle color start
    if (input.startsWith('[color=', index)) {
      const close = input.indexOf(']', index);
      if (close !== -1) {
        const colorValue = input.slice(index + 7, close).trim();
        flush();
        colorStack.push(colorValue);
        index = close + 1;
        continue;
      }
    }

    // Handle color end
    if (input.startsWith('[/color]', index)) {
      flush();
      colorStack.pop();
      index += 8;
      continue;
    }

    buffer += input[index];
    index += 1;
  }

  flush();
  return segments;
}
