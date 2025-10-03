# Document Formatter - Improved Architecture

## Problem with Current Approach
- Blindly chunks text without understanding structure
- AI formats without context of what elements are (titles, lists, etc.)
- Content gets lost because AI doesn't understand document hierarchy
- No preservation of document structure

## New Architecture: Structure-Aware Processing

### Phase 1: Document Analysis & Understanding
**Goal**: Understand what the document contains before processing

1. **Initial Parse**
   - Extract full text from uploaded document
   - Preserve formatting hints (line breaks, indentation, bullets, etc.)

2. **Structure Detection** (using GPT-5-nano)
   - Send entire document (or large sections) to analyze structure
   - Identify and tag:
     - Document title and metadata
     - Table of contents
     - Chapter/Section headers (H1, H2, H3 hierarchy)
     - Paragraphs
     - Bullet and numbered lists
     - Tables
     - Code blocks
     - Footnotes/citations
     - Image captions

3. **Output: Document Map**
   ```json
   {
     "title": "Document Title",
     "type": "report|book|article|memo",
     "elements": [
       {
         "id": "elem_1",
         "type": "title",
         "content": "SOLSTOR IBERIA",
         "level": 0,
         "position": { "start": 0, "end": 15 }
       },
       {
         "id": "elem_2",
         "type": "chapter",
         "content": "Chapter 1: Introduction",
         "level": 1,
         "position": { "start": 16, "end": 40 }
       },
       {
         "id": "elem_3",
         "type": "paragraph",
         "content": "This document presents...",
         "parentId": "elem_2",
         "position": { "start": 41, "end": 200 }
       },
       {
         "id": "elem_4",
         "type": "bulletList",
         "items": ["Item 1", "Item 2", "Item 3"],
         "parentId": "elem_2",
         "position": { "start": 201, "end": 300 }
       }
     ],
     "hierarchy": {
       "elem_1": {
         "children": ["elem_2"]
       },
       "elem_2": {
         "children": ["elem_3", "elem_4"]
       }
     }
   }
   ```

### Phase 2: Intelligent Chunking
**Goal**: Create chunks that respect document structure

1. **Structure-Based Chunking**
   - Never split an element (paragraph, list, table)
   - Keep related elements together (e.g., heading with its first paragraph)
   - Create chunks at natural boundaries (section breaks)

2. **Chunk Metadata**
   Each chunk includes:
   - Element IDs it contains
   - Context (what section it's in)
   - Relationship to other chunks

   ```json
   {
     "chunkId": "chunk_1",
     "elementIds": ["elem_2", "elem_3", "elem_4"],
     "context": {
       "section": "Chapter 1",
       "previousSection": null,
       "nextSection": "Chapter 2"
     },
     "content": "Chapter 1: Introduction\n\nThis document..."
   }
   ```

### Phase 3: Style-Aware Formatting
**Goal**: Apply formatting that respects document structure

1. **Element-Specific Formatting**
   For each element type and style combination:
   ```javascript
   const formattingRules = {
     'business-memo': {
       'title': { font: 'Calibri', size: 16, bold: true, center: true },
       'chapter': { font: 'Calibri', size: 14, bold: true },
       'paragraph': { font: 'Calibri', size: 11, justify: false },
       'bulletList': { font: 'Calibri', size: 11, indent: 0.5 }
     },
     'book-manuscript': {
       'title': { font: 'Times New Roman', size: 14, center: true },
       'chapter': { font: 'Times New Roman', size: 12, center: true, pageBreak: true },
       'paragraph': { font: 'Times New Roman', size: 12, indent: 0.5, doubleSpace: true }
     }
   }
   ```

2. **Contextual Formatting Prompt**
   ```
   You are formatting element type: "paragraph"
   This paragraph is in: "Chapter 1: Introduction"
   Apply business-memo style: Font Calibri 11pt, single space, no indent

   Original text: [paragraph content]

   Format this paragraph according to the rules above. Preserve ALL content.
   ```

### Phase 4: Assembly & Validation
**Goal**: Reconstruct document with proper formatting

1. **Ordered Assembly**
   - Reassemble chunks in original order
   - Apply document-level formatting (margins, headers, footers)
   - Insert proper spacing between elements

2. **Validation**
   - Check all elements are present
   - Verify word count preservation
   - Ensure structure is maintained

## Implementation Steps

### Step 1: Create Document Analyzer Service
```typescript
// src/services/documentAnalyzer.ts
interface DocumentElement {
  id: string;
  type: 'title' | 'chapter' | 'section' | 'paragraph' | 'list' | 'table';
  content: string;
  level?: number;
  parentId?: string;
  position: { start: number; end: number };
  metadata?: any;
}

async function analyzeDocument(content: string): Promise<DocumentStructure> {
  // Use GPT-5-nano to analyze and tag document structure
}
```

### Step 2: Update Chunking Strategy
```typescript
// src/services/intelligentChunker.ts
function chunkByStructure(
  content: string,
  structure: DocumentStructure
): StructuredChunk[] {
  // Chunk respecting element boundaries
}
```

### Step 3: Enhance Formatter
```typescript
// src/services/structuredFormatter.ts
async function formatWithStructure(
  chunk: StructuredChunk,
  style: FormattingStyle,
  documentContext: DocumentStructure
): Promise<FormattedChunk> {
  // Format with awareness of element types
}
```

## Benefits of This Approach
1. **No content loss** - Structure awareness prevents truncation
2. **Consistent formatting** - Elements formatted based on their type
3. **Better quality** - AI understands context and relationships
4. **Scalability** - Works for any document size
5. **Maintainability** - Clear separation of concerns

## Next Actions
1. Build document analyzer to detect structure
2. Create intelligent chunker that respects boundaries
3. Update formatter to use element-aware prompts
4. Implement proper assembly with validation
5. Test with various document types