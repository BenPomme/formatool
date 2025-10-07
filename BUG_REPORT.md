# Bug Report: Font Detection Not Displaying in UI Despite Successful Extraction

## Issue Summary
The document formatting application successfully extracts font information from DOCX files but fails to display the correct font names in the UI. The frontend shows empty/null font fields despite the backend correctly identifying fonts like "Aptos Light" and "Times New Roman".

## Environment
- **Platform**: macOS Darwin 24.6.0
- **Node.js**: Latest version with TypeScript
- **Key Dependencies**:
  - unzipper: For extracting DOCX contents
  - xml2js: For parsing Word document XML
  - mammoth: For text extraction
  - OpenAI API: GPT-4.1 and GPT-5 models

## Bug Description

### Expected Behavior
When uploading a reference DOCX document, the system should:
1. Extract actual font names from the document
2. Display them in the StylePreview component
3. Show fonts like "Aptos Light", "Times New Roman", etc., as detected

### Actual Behavior
- Backend successfully extracts fonts (confirmed via console logs)
- Server logs show: `Found fonts: ['Times New Roman', 'Aptos Light', 'Cambria Math', etc.]`
- Frontend displays empty font field or shows fallback value
- UI shows warnings: "Default font not detected"

## Technical Details

### Root Cause Analysis

1. **Initial Problem**: The system was using mammoth.js to convert DOCX to HTML, which strips all styling information
2. **Solution Implemented**: Created `DocxStyleExtractor` class to read actual XML from Word documents
3. **Current Issue**: Despite successful extraction, the data flow between backend and frontend breaks

### Code Flow

1. **DOCX Style Extraction** (`/src/services/docxStyleExtractor.ts`):
   - Reads `word/styles.xml`, `word/document.xml`, `word/fontTable.xml`
   - Successfully extracts fonts, colors, sizes
   - Returns structured `DocxStyles` object

2. **Style Extractor Service** (`/src/services/styleExtractor.ts`):
   - Receives extracted DOCX styles
   - Attempts to create simplified attributes
   - Issue: `rawDocxStyles` property not properly propagated

3. **Frontend Display** (`/client/src/components/StylePreview.tsx`):
   - Expects `styleExtraction.simplifiedStyles`
   - Receives null/undefined for font field

### Server Logs (Working)
```
📊 Extracted REAL styles from DOCX:
   Fonts: ['Times New Roman', 'Aptos Light', 'Cambria Math', 'Symbol', 'Courier New', 'Wingdings', 'Aptos', 'Aptos Display']
   Font sizes: [20, 16, 14, 28, 12, 24, 18]
   Colors: ['#0F4761', '#595959', '#272727', '#404040', '#215E99', '#C00000']
```

### UI Display (Not Working)
- Font: [empty]
- Colors: #272727, #0F4761 (working)
- Sizes: 20pt, 16pt (working)

## Attempted Fixes

1. **Removed Hardcoded Defaults**: Eliminated all hardcoded "Arial" and default values
2. **Implemented XML Parsing**: Direct extraction from DOCX XML structure
3. **Fixed Namespace Handling**: Updated XML parser configuration for Word namespaces
4. **Added rawDocxStyles Storage**: Attempted to store and use extracted styles

## Code Snippets

### Problem Area in styleExtractor.ts
```typescript
private createSimplifiedAttributes(full: StyleAttributes): SimplifiedStyleAttributes {
  // rawDocxStyles exists but isn't properly accessible
  if (this.rawDocxStyles && this.rawDocxStyles.fonts) {
    const fonts = Array.from(this.rawDocxStyles.fonts);
    // This should work but doesn't reach the UI
  }
}
```

## Reproduction Steps

1. Start the application (`npm run dev`)
2. Navigate to http://localhost:5173
3. Upload any DOCX file as reference document
4. Upload any DOCX file as target document
5. Observe the StylePreview component shows empty font field
6. Check backend logs to confirm fonts are being extracted

## Impact
- Users cannot see which fonts will be applied from their reference documents
- Reduces confidence in the style extraction accuracy
- Core feature of the dual-document upload system is compromised

## Suggested Investigation Areas

1. **Data Flow**: Trace the exact path from `DocxStyleExtractor` → `StyleExtractor` → `uploadDual` route → Frontend
2. **State Management**: Check if `rawDocxStyles` is being reset between method calls
3. **API Response**: Verify the structure of data sent from `/api/dual/upload-dual` endpoint
4. **TypeScript Types**: Ensure interfaces properly define the expected data structure

## Files to Review

- `/src/services/docxStyleExtractor.ts` - Extraction logic (working)
- `/src/services/styleExtractor.ts` - Integration point (issue likely here)
- `/src/routes/uploadDual.ts` - API endpoint
- `/client/src/components/StylePreview.tsx` - Display component
- `/client/src/components/DualFileUpload.tsx` - Upload handler

## Priority
**High** - This is a core feature of the document formatting system that directly impacts user experience and trust in the application's capability to accurately extract and apply document styles.

---

# Bug Report: Tables Render as Plain Text in Structured Preview

## Issue Summary
Tables detected in DOCX uploads are now parsed on the backend, but the web preview still shows them as tab-delimited paragraphs without visible borders. End users never see a grid despite the server generating full table metadata.

## Environment
- **Mode**: `/api/format` running in OpenAI (non-hybrid) mode
- **Frontend**: Vite React app (`client/`) @ current main
- **Backend**: Node.js (TypeScript) service with recent table-utils refactor

## Reproduction Steps
1. Start backend (`npm run dev`) and frontend (`npm run dev --prefix client`).
2. Trigger `/api/format` with a DOCX containing a tabular comparison (e.g., "Table 1. Evaluation Summary…").
3. Open the “Formatted Output Preview” in the UI.
4. Observe that the supposed table appears as lines with tabs/spacing, no borders.

## Expected Behavior
- Structured preview should render an HTML `<table>` with the `.preview-table` styles (borders, alternating rows).
- Downloaded DOCX should also reflect the grid (this now works).

## Actual Behavior
- Preview pane displays raw text; no `<table>` markup is emitted.
- `block.type` arrives as `paragraph` for the table chunk in OpenAI mode, so `DocumentActions.renderBlock` never calls `renderTable`.

## Technical Notes
- Hybrid formatter path sets `tableData` via `parseTableFromText`, but the OpenAI/StructuredFormatter path still emits flattened text without the metadata.
- Even after the shared `tableUtils` refactor, `StructuredFormatter.postProcessFormatting` only converts markdown strings; it does not patch the `structuredRepresentation` that the frontend consumes.
- The frontend relies on `structured.blocks[*].tableData` to branch into `renderTable`; missing metadata is why borders never appear.

## Suspected Root Cause
`StructuredFormatter` builds markdown strings but does not surface the parsed table summary back to the client response (`job_X` global, `/routes/format.ts`). The response `structuredRepresentation` is undefined in OpenAI mode, so the client falls back to raw markdown without table cues.

## Proposed Fix
1. Extend `StructuredFormatter` to emit a lightweight representation (e.g., `extractTablesFromContent(chunk.content)`) and return it alongside the formatted text.
2. Update `/routes/format.ts` to forward this structured context to the client, mirroring the hybrid pipeline’s `structuredRepresentation`.
3. Add a Jest regression test that runs a format job in OpenAI mode and asserts that the response includes at least one block with `type === 'table'`.

## Priority
**Medium-High** – The backend now preserves tables, but users still see them as text in the core UI. Needs follow-up to complete the end-to-end table experience.*** End Patch
