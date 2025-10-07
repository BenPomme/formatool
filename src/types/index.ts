export interface DocumentChunk {
  id: string;
  content: string;
  tokenCount: number;
  order: number;
}

export interface FormattingStyle {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

export interface ProcessingJob {
  id: string;
  filename: string;
  originalPath: string;
  style: FormattingStyle;
  chunks: DocumentChunk[];
  formattedChunks: DocumentChunk[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ExportOptions {
  format: 'docx' | 'pdf';
  filename: string;
  includeMetadata?: boolean;
}

export const FORMATTING_STYLES: FormattingStyle[] = [
  {
    id: 'business-memo',
    name: 'Business Memo',
    description: 'Internal business communication with TO/FROM/DATE/SUBJECT header',
    systemPrompt: `You are a document formatter. Your ONLY job is to reorganize and format text.

CRITICAL RULES:
1. PRESERVE EVERY SINGLE WORD from the original text - do not add, remove, or change ANY words
2. Only reorganize and add formatting markers
3. DO NOT add content that doesn't exist in the original
4. Return 100% of the input text

Format as a business memo:
- Add "MEMORANDUM" at the top
- If the text mentions recipients, sender, date, or subject, format as:
  TO: [recipients if mentioned]
  FROM: [sender if mentioned]
  DATE: [date if mentioned]
  SUBJECT: [subject/topic if identifiable]
- Use single line breaks between paragraphs (not double)
- Keep paragraphs left-aligned
- Add section headers if content has clear topics
- Use bullet points (•) for lists

Return the COMPLETE text with formatting applied.`
  },
  {
    id: 'book-manuscript',
    name: 'Book/Novel Manuscript',
    description: 'Standard manuscript format for books and novels with proper chapter formatting',
    systemPrompt: `You are a document formatter. Your ONLY job is to reorganize and format text.

CRITICAL RULES:
1. PRESERVE EVERY SINGLE WORD - do not modify ANY content
2. Only add formatting and organization
3. Return 100% of the input text

Format as a book manuscript:
- Mark chapter breaks with "Chapter [number]" if divisions are clear
- First paragraph of each chapter/section: no indent (full out)
- All other paragraphs: indent with tab marker ->
- Scene breaks: use "* * *" centered
- No extra lines between paragraphs
- Dialogue on new lines with proper indentation
- If text has natural chapter/section breaks, preserve them

Return the COMPLETE text with formatting applied.`
  },
  {
    id: 'sales-proposal',
    name: 'Sales Proposal',
    description: 'Professional sales document with executive summary and value propositions',
    systemPrompt: `You are a document formatter. Your ONLY job is to reorganize and format text.

CRITICAL RULES:
1. PRESERVE EVERY SINGLE WORD - do not add or remove content
2. Only reorganize existing text
3. Return 100% of the input text

Format as a sales proposal:
- Create "## EXECUTIVE SUMMARY" section if overview content exists
- Identify and format problem statements as "### The Challenge"
- Format solutions as "### Our Solution"
- Use bullet points for benefits/features (•)
- If pricing is mentioned, format as "## INVESTMENT" section
- Create "### Value Proposition" for key benefits
- Use bold (**) for key metrics or numbers
- Add "## NEXT STEPS" if action items exist

Return the COMPLETE text with formatting applied.`
  },
  {
    id: 'academic-paper',
    name: 'Academic Paper',
    description: 'Scholarly format with abstract, citations, and formal structure',
    systemPrompt: `You are a document formatter. Your ONLY job is to reorganize and format text.

CRITICAL RULES:
1. PRESERVE EVERY SINGLE WORD - do not modify content
2. Only add formatting markers
3. Return 100% of the input text

Format as an academic paper:
- If summary exists at start, label as "## Abstract"
- Create numbered sections: 1. Introduction, 2. Methodology, etc.
- Use subsections: 2.1, 2.2, etc.
- Format citations as [1], [2] if references exist
- Create "## References" section if citations are listed
- Indent block quotes if present (>)
- Use formal paragraph structure

Return the COMPLETE text with formatting applied.`
  },
  {
    id: 'legal-document',
    name: 'Legal Document',
    description: 'Formal legal format with numbered paragraphs and defined terms',
    systemPrompt: `You are a document formatter. Your ONLY job is to reorganize and format text.

CRITICAL RULES:
1. PRESERVE EVERY SINGLE WORD - do not change content
2. Only add formatting and numbering
3. Return 100% of the input text

Format as a legal document:
- Number main sections with Roman numerals (I., II., III.)
- Number paragraphs as 1.1, 1.2, etc.
- CAPITALIZE defined terms when first introduced
- Use "WHEREAS" for recitals if present
- Indent sub-paragraphs with (a), (b), (c)
- Bold section headings
- Format definitions as: "**Term**" means...

Return the COMPLETE text with formatting applied.`
  },
  {
    id: 'technical-manual',
    name: 'Technical Manual',
    description: 'Step-by-step technical documentation with warnings and procedures',
    systemPrompt: `You are a document formatter. Your ONLY job is to reorganize and format text.

CRITICAL RULES:
1. PRESERVE EVERY SINGLE WORD - do not modify content
2. Only add formatting
3. Return 100% of the input text

Format as a technical manual:
- Number procedures: Step 1:, Step 2:, etc.
- Format warnings as: ⚠️ WARNING:
- Format notes as: 📝 NOTE:
- Use code blocks for commands/code \`\`\`
- Create numbered sections for topics
- Use sub-bullets for detailed steps (-)
- Format requirements/prerequisites as bulleted list
- Tables for specifications if data exists

Return the COMPLETE text with formatting applied.`
  },
  {
    id: 'marketing-brief',
    name: 'Marketing Brief',
    description: 'Creative brief with campaign objectives, target audience, and key messages',
    systemPrompt: `You are a document formatter. Your ONLY job is to reorganize and format text.

CRITICAL RULES:
1. PRESERVE EVERY SINGLE WORD - do not add content
2. Only reorganize and format
3. Return 100% of the input text

Format as a marketing brief:
- Create "## CAMPAIGN OVERVIEW" if overview exists
- Format objectives as "### Objectives" with bullets
- Identify and format "### Target Audience"
- Create "### Key Messages" section
- Use bold (**) for important points
- Format metrics/KPIs with bullet points
- Add "### Call to Action" if CTA exists
- Use ✓ for success criteria
- Highlight deadlines/dates in bold

Return the COMPLETE text with formatting applied.`
  },
  {
    id: 'meeting-minutes',
    name: 'Meeting Minutes',
    description: 'Structured meeting notes with attendees, decisions, and action items',
    systemPrompt: `You are a document formatter. Your ONLY job is to reorganize and format text.

CRITICAL RULES:
1. PRESERVE EVERY SINGLE WORD - do not modify content
2. Only add formatting markers
3. Return 100% of the input text

Format as meeting minutes:
- Add "MEETING MINUTES" header
- Format attendees as "**Attendees:**" with bullet list
- Create "## Discussion Points" section
- Number main topics discussed
- Format decisions as: "📌 DECISION:"
- Format action items as: "[ ] ACTION:"
- Add owner and deadline if mentioned: "[ ] ACTION: [task] (Owner: [name], Due: [date])"
- Create "## Next Steps" section if future items exist

Return the COMPLETE text with formatting applied.`
  }
];

// Document Structure Types
export type ElementType =
  | 'title'
  | 'chapter'
  | 'section'
  | 'subsection'
  | 'paragraph'
  | 'bulletList'
  | 'numberedList'
  | 'table'
  | 'tableOfContents'
  | 'footnote'
  | 'citation'
  | 'codeBlock'
  | 'imageCaption'
  | 'header'
  | 'footer';

export interface DocumentElement {
  id: string;
  type: ElementType;
  content: string;
  level?: number; // For hierarchical elements (h1, h2, h3, etc.)
  parentId?: string;
  position: {
    start: number;
    end: number;
  };
  metadata?: {
    listItems?: string[];
    tableData?: any;
    language?: string; // For code blocks
    [key: string]: any;
  };
}

export interface DocumentStructure {
  title?: string;
  documentType?: 'report' | 'book' | 'article' | 'memo' | 'manual' | 'proposal' | 'paper';
  elements: DocumentElement[];
  hierarchy: Record<string, { children: string[] }>;
  metadata?: {
    wordCount: number;
    hasTableOfContents: boolean;
    hasTables: boolean;
    hasLists: boolean;
    hasCodeBlocks: boolean;
  };
}

export interface FormattedTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface FormattedBlock {
  id: string;
  elementId: string;
  type: ElementType;
  numbering?: string;
  spacing?: {
    before?: number;
    after?: number;
  };
  runs: FormattedTextRun[];
  listItems?: FormattedTextRun[][];
  alignment?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number;
  indent?: number;
  bulletSymbol?: string;
  numberFormat?: string;
  typography?: {
    font?: string;
    fontSize?: number;
    color?: string;
  };
  metadata?: Record<string, any>;
  insights?: SemanticInsight;
  tableData?: {
    headers: string[];
    rows: string[][];
  };
}

export interface FormattedDocumentRepresentation {
  text: string;
  blocks: FormattedBlock[];
  styleId: string;
  generalDirectives?: {
    paragraphSpacing?: number;
    indentSize?: number;
    lineHeight?: number;
    baseAlignment?: 'left' | 'center' | 'right' | 'justify';
    defaultFont?: string;
    defaultFontSize?: number;
    defaultColor?: string;
    bulletSymbol?: string;
    numberFormat?: string;
  };
  semanticSummary?: SemanticDocumentInsight;
}

export interface SemanticInsight {
  role: SemanticRole;
  confidence: number;
  rationale?: string;
  typography?: {
    font?: string;
    fontSizePt?: number;
    weight?: 'normal' | 'bold';
    italic?: boolean;
    color?: string;
  };
  layout?: {
    alignment?: 'left' | 'center' | 'right' | 'justify';
    spacingBefore?: number;
    spacingAfter?: number;
    indent?: number;
  };
  contentSignals?: string[];
  source?: 'detector' | 'style-template' | 'override';
}

export type SemanticRole =
  | 'document-title'
  | 'chapter-heading'
  | 'section-heading'
  | 'subsection-heading'
  | 'paragraph'
  | 'list-item'
  | 'table'
  | 'table-header'
  | 'table-row'
  | 'quote'
  | 'code'
  | 'footnote'
  | 'figure-caption'
  | 'header'
  | 'footer'
  | 'unknown';

export interface SemanticDocumentInsight {
  detectorVersion: string;
  templateVersion: string;
  generatedAt: string;
  sourceStyleId: string;
  summary: {
    titles: number;
    headings: number;
    paragraphs: number;
    lists: number;
    tables: number;
    other: number;
  };
  notes?: string[];
}

export interface StructuredChunk extends DocumentChunk {
  elementIds: string[];
  context: {
    section?: string;
    chapter?: string;
    previousSection?: string;
    nextSection?: string;
  };
}

export interface ConformityResult {
  isConformant: boolean;
  originalWords?: number;
  formattedWords?: number;
  percentageRetained?: number;
  originalWordCount?: number;
  formattedWordCount?: number;
  originalCharCount?: number;
  formattedCharCount?: number;
  missingContent?: string[];
  addedContent?: string[];
  conformityScore?: number;
  issues?: string[];
}
