# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Document Formatter is an AI-powered document formatting application that transforms documents (.docx, .doc, .txt) into professional styles using OpenAI's GPT models. The system combines local processing with selective AI enhancement to handle documents of any size efficiently.

## Core Architecture

### Hybrid Formatting Pipeline

The application uses a **hybrid formatting approach** that minimizes token usage while maintaining quality:

1. **Local Structure Detection** (`LocalStructureDetector`): Parses documents into structured elements (titles, chapters, sections, paragraphs, lists, tables) without using tokens
2. **AI Style Learning** (`StyleTemplateLearner`): Uses minimal tokens to learn formatting rules from a small sample
3. **Local Formatting Application** (`LocalFormattingEngine`): Applies learned rules to the entire document locally (zero tokens)
4. **Optional AI Polish**: Selective AI enhancement for key sections when needed

This architecture allows processing documents of **any size** efficiently, breaking the traditional token limit constraints.

### Key Services

- **`HybridFormatter`** (`src/services/hybridFormatter.ts`): Main orchestrator combining local and AI processing
- **`IntelligentChunker`** (`src/services/intelligentChunker.ts`): Structure-aware document chunking respecting element boundaries
- **`StyleExtractor`** (`src/services/docxStyleExtractor.ts`): Extracts typography, fonts, colors, spacing from reference documents
- **`StyleValidator`** (`src/services/styleValidator.ts`): Validates formatted output maintains content integrity
- **`LocalFormattingEngine`** (`src/services/localFormattingEngine.ts`): Applies formatting rules and emits structured blocks
- **`DocxGenerator`** (`src/services/docxGenerator.ts`): Converts formatted content to Word documents
- **`PdfGenerator`** (`src/services/pdfGenerator.ts`): Converts formatted content to PDFs

### Document Structure Types

The system uses rich TypeScript types defined in `src/types/index.ts`:

- **`DocumentStructure`**: Hierarchical representation of document with elements and metadata
- **`DocumentElement`**: Individual components (title, section, paragraph, list, etc.) with position info
- **`FormattedBlock`**: Structured formatting output with typography, spacing, numbering
- **`FormattedDocumentRepresentation`**: Complete formatted document with blocks and style directives
- **`StructuredChunk`**: Chunk with element IDs and context for multi-part processing

## Development Commands

### Backend (from root directory)

```bash
# Start development server with hot-reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run tests
npm test

# Start production server
npm start
```

The dev server runs on `http://localhost:3001` and uses `nodemon` to watch for TypeScript changes.

### Frontend (from client/ directory)

```bash
# Start Vite dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run ESLint
npm run lint
```

The frontend runs on `http://localhost:5173` by default.

### Running Full Stack

In two separate terminals:

```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
cd client && npm run dev
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
PORT=3001
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
MAX_TOKENS_PER_REQUEST=3000
MAX_TOKENS_PER_RESPONSE=4000
FORMAT_CONCURRENCY=4
```

**Critical**: Never commit `.env` file or API keys to version control.

## API Structure

### Routes (`src/routes/`)

- **`POST /api/upload`**: Upload single document for processing
- **`POST /api/dual`**: Upload document + style template for style extraction
- **`POST /api/format`**: Format uploaded document with selected style
- **`GET /api/format/styles`**: Get available formatting styles
- **`POST /api/export`**: Export formatted document as .docx or .pdf
- **`GET /api/progress/:jobId`**: Get progress for processing job
- **`GET /api/health`**: Health check endpoint

### Request Flow

1. User uploads document → `uploadRoutes` saves to temp storage
2. User selects style → `formatRoutes` calls `HybridFormatter`
3. `HybridFormatter` detects structure, learns style, applies formatting
4. User downloads result → `exportRoutes` generates .docx or .pdf

## Formatting Styles

8 built-in styles defined in `src/types/index.ts`:

1. **Business Memo**: Internal communication format with TO/FROM/DATE/SUBJECT
2. **Book/Novel Manuscript**: Standard manuscript format with chapters
3. **Sales Proposal**: Executive summary with value propositions
4. **Academic Paper**: Scholarly format with abstract and citations
5. **Legal Document**: Numbered sections and defined terms
6. **Technical Manual**: Step-by-step procedures with warnings
7. **Marketing Brief**: Campaign objectives and target audience
8. **Meeting Minutes**: Attendees, decisions, action items

Each style has a `systemPrompt` that **strictly preserves all original content** while applying formatting.

## Style Extraction & Learning

The application supports **learning styles from reference documents**:

1. User uploads reference .docx with desired formatting (`uploadDualRoutes`)
2. `DocxStyleExtractor` extracts typography, fonts, colors, spacing, numbering
3. `StyleTemplateLearner` converts extraction into declarative formatting rules
4. `LocalFormattingEngine` applies learned rules to target document
5. `StyleValidator` ensures output matches reference style

This enables users to format documents to match their organization's style guide.

## Content Preservation

**Critical principle**: The system NEVER modifies content, only formatting.

- `ConformityChecker` (`src/services/conformityChecker.ts`): Validates word counts match
- `StyleValidator`: Ensures no content drift after formatting
- All style prompts emphasize: "PRESERVE EVERY SINGLE WORD"
- Validation checks run automatically after formatting

## Token Management

- Uses `@dqbd/tiktoken` for accurate token counting
- `IntelligentChunker` splits documents at natural boundaries (paragraphs, sections)
- Default limits: 3000 tokens per request (configurable via env)
- Hybrid approach minimizes token usage by processing locally when possible

## Progress Tracking

`ProgressTracker` (`src/services/progressTracker.ts`) provides real-time status:

- Tracks: parsing, structuring, analyzing, formatting, generating
- Updates sent to frontend via polling (`/api/progress/:jobId`)
- Shows current chunk progress (e.g., "Formatting 3/10")

## Testing

Tests are configured with Jest. Test directory: `__tests__/` (currently being set up)

To run tests:
```bash
npm test
```

## Frontend Components

Located in `client/src/components/`:

- **`FileUpload.tsx`**: Single file upload with drag-and-drop
- **`DualFileUpload.tsx`**: Upload document + style template
- **`StyleSelector.tsx`**: Choose from built-in formatting styles
- **`StylePreview.tsx`**: Preview extracted styles before formatting
- **`ProgressTracker.tsx`**: Real-time processing progress display
- **`DocumentActions.tsx`**: Download formatted document as .docx or .pdf

## Key Technical Decisions

1. **Hybrid Processing**: Combines local algorithms with selective AI to handle unlimited document sizes
2. **Structure-First**: Parses document structure before formatting to maintain semantic meaning
3. **Zero Content Modification**: Strict validation ensures no content changes, only formatting
4. **Style Extraction**: Users can provide reference documents instead of choosing presets
5. **Token Efficiency**: Learns style rules from samples, applies locally without repeated API calls

## Roadmap Priorities (2025)

Current focus areas documented in `roadmap.md`:

**Workstream A - Style Fidelity**: Extend style extraction to capture full typography (fonts, sizes, colors, spacing), preserve through export pipeline

**Workstream B - Declarative Engine**: Replace heuristics with structured formatting primitives and rule DSL, transport structured runs through hybrid formatter to native Word styles

**Workstream C - Long-Document Scalability**: Chapter-aware chunking, caching per-style templates, streaming output with progress UI, checkpointing for resumable jobs

## Common Tasks

### Adding a New Formatting Style

1. Add style definition to `FORMATTING_STYLES` array in `src/types/index.ts`
2. Define `systemPrompt` emphasizing content preservation
3. Update `StyleSelector.tsx` to display new style

### Debugging Format Issues

1. Check `ProgressTracker` state in `/api/progress/:jobId`
2. Review console logs for chunk processing
3. Verify `ConformityChecker` validation results
4. Inspect `FormattedDocumentRepresentation` blocks

### Modifying Export Format

- DOCX: Edit `src/services/docxGenerator.ts`
- PDF: Edit `src/services/pdfGenerator.ts`
- Both use `FormattedBlock` data from local engine

## File Structure

```
docformatter/
├── src/                          # Backend source
│   ├── server.ts                 # Express server setup
│   ├── routes/                   # API endpoints
│   ├── services/                 # Core business logic
│   ├── middleware/               # Express middleware
│   ├── utils/                    # Utility functions
│   └── types/                    # TypeScript definitions
├── client/                       # React frontend
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── App.tsx              # Main application
│   │   └── App.css
│   └── package.json
├── uploads/                      # Temporary file storage
├── roadmap.md                    # Development priorities
└── package.json                  # Backend dependencies
```

## Security Notes

- All API calls go through backend proxy (never expose API key to frontend)
- File uploads limited by `MAX_FILE_SIZE` in .env
- CORS configured for specific origins only
- Helmet.js for security headers
- Rate limiting on API routes (configurable)
- Temporary files cleaned after processing

## Performance Characteristics

- Small documents (<10 pages): ~5-10 seconds
- Medium documents (10-50 pages): ~15-30 seconds
- Large documents (50-150 pages): ~1-3 minutes (hybrid mode)
- Token usage: ~100-500 tokens total (vs. thousands with traditional chunking)

## Dependencies

Key production dependencies:

- `express`: Web framework
- `openai`: OpenAI API client
- `docx`: Word document generation
- `mammoth`: Word document parsing
- `puppeteer`: PDF generation
- `@dqbd/tiktoken`: Token counting
- `multer`: File upload handling
- `xml2js`: XML parsing for docx structure
