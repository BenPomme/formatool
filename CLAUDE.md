# Document Formatter - Project Overview

## Project Description
A web application that allows users to upload Word (.docx) or text (.txt) documents and apply professional formatting styles (McKinsey, New York Times, Design Agency, Tech Documentation, etc.) while preserving all original content. The system processes large documents by splitting them into manageable chunks for AI processing, then reassembles the formatted output.

## Core Technologies
- **Frontend**: React with TypeScript
- **Backend**: Node.js/Express
- **AI Processing**: OpenAI GPT-4 API
- **Document Processing**:
  - mammoth.js (Word document parsing)
  - docx (Word document generation)
  - PDFKit or Puppeteer (PDF generation)
- **File Upload**: multer
- **Styling**: Tailwind CSS

## Key Features
1. Multi-format document upload (.docx, .txt)
2. Multiple professional formatting templates
3. Intelligent document chunking for API token limits
4. Content preservation guarantee
5. Export options (.docx, .pdf)

## Security & Best Practices

### API Key Management
- **NEVER** commit API keys to version control
- Store API keys in environment variables (.env file)
- Use server-side proxy for all API calls
- Implement rate limiting and usage monitoring

### Document Processing
- Validate file types and sizes on both client and server
- Implement virus scanning for uploaded files
- Process documents in isolated environments
- Clear temporary files after processing
- Implement proper error boundaries

### Content Protection
- No content modification - formatting only
- Maintain original text integrity
- Preserve special characters and formatting markers
- Implement checksums to verify content preservation

### Token Management
- Calculate token counts before API calls
- Implement smart chunking based on:
  - Paragraph boundaries
  - Section headers
  - Maximum token limits (GPT-4: 8,192 tokens per request)
- Queue management for large documents
- Progress tracking for user feedback

## Formatting Styles

### McKinsey Style
- Professional business document format
- Clear hierarchy with numbered sections
- Executive summary structure
- Bullet points and action items
- Clean, minimalist design

### New York Times
- Newspaper column layout
- Serif fonts (Georgia, Times)
- Pull quotes and subheadings
- Justified text alignment
- Byline and dateline formatting

### Design Agency
- Modern, creative layout
- Sans-serif fonts (Helvetica, Inter)
- Generous white space
- Color accents
- Visual hierarchy emphasis

### Tech Documentation
- Monospace code blocks
- Clear section numbering
- API reference style
- Tables and diagrams support
- Syntax highlighting

## Architecture Pattern

### Frontend Structure
```
src/
├── components/
│   ├── FileUpload/
│   ├── StyleSelector/
│   ├── ProgressTracker/
│   └── DocumentPreview/
├── services/
│   ├── api/
│   ├── documentProcessor/
│   └── tokenManager/
├── utils/
│   ├── chunking/
│   └── validation/
└── styles/
    └── templates/
```

### Backend Structure
```
server/
├── routes/
│   ├── upload/
│   ├── format/
│   └── export/
├── services/
│   ├── openai/
│   ├── documentParser/
│   └── formatter/
├── middleware/
│   ├── auth/
│   ├── validation/
│   └── errorHandler/
└── utils/
    ├── tokenCounter/
    └── chunker/
```

## Development Workflow

1. **Local Development**
   - Use nodemon for backend hot-reload
   - Vite for frontend development
   - Mock API responses for testing

2. **Testing Strategy**
   - Unit tests for chunking algorithms
   - Integration tests for document processing
   - E2E tests for complete workflow
   - Load testing for large documents

3. **Deployment Considerations**
   - Use CDN for static assets
   - Implement caching for formatted templates
   - Queue system for heavy processing (Redis/Bull)
   - Horizontal scaling for API processing

## Performance Optimizations

- Lazy loading for large documents
- Streaming responses for real-time progress
- Client-side caching of formatted results
- Compression for file transfers
- Background processing for large files

## Error Handling

- Graceful degradation for API failures
- Retry logic with exponential backoff
- User-friendly error messages
- Fallback formatting options
- Recovery mechanisms for partial failures

## Monitoring & Analytics

- Track API usage and costs
- Monitor processing times
- Log formatting success rates
- User behavior analytics
- Performance metrics dashboard

## Future Enhancements

- Additional formatting styles
- Custom style builder
- Batch processing
- Team collaboration features
- Version control for documents
- AI-powered style recommendations