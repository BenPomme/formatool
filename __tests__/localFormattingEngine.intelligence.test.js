const defineTemplateDefaults = (styleId) => ({
  styleId,
  generalRules: {
    paragraphSpacing: 1,
    indentSize: 0,
    bulletSymbol: '-',
    numberFormat: '1.'
  },
  rules: {
    paragraph: {
      markdown: { prefix: '', suffix: '' },
      spacing: { before: 0, after: 1 },
      formatting: {
        bold: false,
        italic: false,
        uppercase: false,
        center: false,
        indent: false
      },
      special: {}
    },
    bulletList: {
      markdown: { prefix: '-', suffix: '' },
      spacing: { before: 0, after: 1 },
      formatting: {},
      special: {}
    },
    numberedList: {
      markdown: { prefix: '1.', suffix: '' },
      spacing: { before: 0, after: 1 },
      formatting: {},
      special: { numbering: '1.' }
    },
    title: {
      markdown: { prefix: '#', suffix: '' },
      spacing: { before: 0, after: 2 },
      formatting: { bold: true, italic: false, uppercase: false, center: true },
      special: {}
    },
    section: {
      markdown: { prefix: '##', suffix: '' },
      spacing: { before: 1, after: 1 },
      formatting: { bold: true, italic: false, uppercase: false, center: false },
      special: {}
    },
    subsection: {
      markdown: { prefix: '###', suffix: '' },
      spacing: { before: 1, after: 1 },
      formatting: { bold: false, italic: true, uppercase: false, center: false },
      special: {}
    },
    chapter: {
      markdown: { prefix: '##', suffix: '' },
      spacing: { before: 2, after: 1 },
      formatting: { bold: true, italic: false, uppercase: false, center: false },
      special: {}
    },
    table: {
      markdown: { prefix: '', suffix: '' },
      spacing: { before: 1, after: 1 },
      formatting: {},
      special: {}
    },
    tableOfContents: {
      markdown: { prefix: '##', suffix: '' },
      spacing: { before: 1, after: 1 },
      formatting: { bold: true, italic: false, uppercase: false, center: false },
      special: {}
    },
    footnote: {
      markdown: { prefix: '', suffix: '' },
      spacing: { before: 1, after: 1 },
      formatting: {},
      special: {}
    },
    citation: {
      markdown: { prefix: '', suffix: '' },
      spacing: { before: 0, after: 0 },
      formatting: {},
      special: {}
    },
    codeBlock: {
      markdown: { prefix: '```', suffix: '```' },
      spacing: { before: 1, after: 1 },
      formatting: {},
      special: {}
    },
    imageCaption: {
      markdown: { prefix: '', suffix: '' },
      spacing: { before: 1, after: 1 },
      formatting: { italic: true, bold: false, uppercase: false, center: false },
      special: {}
    },
    header: {
      markdown: { prefix: '', suffix: '' },
      spacing: { before: 0, after: 0 },
      formatting: {},
      special: {}
    },
    footer: {
      markdown: { prefix: '', suffix: '' },
      spacing: { before: 0, after: 0 },
      formatting: {},
      special: {}
    }
  }
});

const { LocalFormattingEngine } = require('../dist/services/localFormattingEngine');

describe('LocalFormattingEngine intelligent styling', () => {
  const makeStructure = (content) => ({
    elements: [
      {
        id: 'p1',
        type: 'paragraph',
        content,
        position: { start: 0, end: content.length }
      }
    ],
    hierarchy: {}
  });

  it('converts sales proposal colon-delimited lists into styled bullets', () => {
    const engine = new LocalFormattingEngine();
    const template = defineTemplateDefaults('sales-proposal');
    const structure = makeStructure('Key Benefits: Speed; Reliability; Scalability');

    const result = engine.formatDocument(structure, template);

    expect(result).toContain('**Key Benefits:**');
    expect(result).toMatch(/- Speed/);
    expect(result).toMatch(/- Reliability/);
    expect(result).toMatch(/- Scalability/);
  });

  it('highlights sales proposal metrics with bold color accents', () => {
    const engine = new LocalFormattingEngine();
    const template = defineTemplateDefaults('sales-proposal');
    const structure = makeStructure('Projected ROI of 125% with revenue of $5,000 in year one.');

    const result = engine.formatDocument(structure, template);

    expect(result).toContain('**[color=#0F7B6C]125%[/color]**');
    expect(result).toContain('**[color=#0F7B6C]$5,000[/color]**');
  });

  it('accentuates marketing brief dates and headlines', () => {
    const engine = new LocalFormattingEngine();
    const template = defineTemplateDefaults('marketing-brief');
    const structure = makeStructure('Campaign timeline targets launch on March 3, 2025 with a bold call to action.');

    const result = engine.formatDocument(structure, template);

    expect(result).toContain('**[color=#C53030]March 3, 2025[/color]**');
    expect(result.toLowerCase()).toContain('**call to action**');
  });
});
