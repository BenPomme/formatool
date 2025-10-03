# Document Formatter

An AI-powered document formatting application that transforms documents into professional styles using OpenAI's GPT-4.

## Features

- **Multiple Format Support**: Upload .docx, .doc, or .txt files
- **Professional Formatting Styles**:
  - McKinsey (Business consulting format)
  - New York Times (Newspaper style)
  - Design Agency (Creative modern layout)
  - Technical Documentation (Developer-friendly)
- **Smart Document Processing**: Automatically chunks large documents for optimal AI processing
- **Multiple Export Options**: Download as Word (.docx) or PDF
- **Content Preservation**: Guarantees 100% content preservation while transforming formatting

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd docformatter
```

2. Install backend dependencies:
```bash
npm install
```

3. Install frontend dependencies:
```bash
cd client
npm install
cd ..
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

### Running the Application

1. Start the backend server (from root directory):
```bash
npm run dev
# Server runs on http://localhost:3001
```

2. Start the frontend (in a new terminal):
```bash
cd client
npm run dev
# Frontend runs on http://localhost:5173
```

3. Open http://localhost:5173 in your browser

## Usage

1. **Upload Document**: Drag and drop or click to upload a .docx, .doc, or .txt file
2. **Choose Style**: Select from McKinsey, NYT, Design Agency, or Tech Docs styles
3. **Processing**: The app will automatically process your document
4. **Download**: Choose between .docx or .pdf format and download your formatted document

## Project Structure

```
docformatter/
├── src/                    # Backend source code
│   ├── server.ts          # Express server setup
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic
│   ├── middleware/        # Express middleware
│   ├── utils/             # Utility functions
│   └── types/             # TypeScript types
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   └── App.tsx        # Main application
│   └── package.json
├── uploads/               # Temporary file storage
├── CLAUDE.md              # Project documentation
├── roadmap.md             # Development roadmap
└── package.json           # Backend dependencies
```

## API Endpoints

- `POST /api/upload` - Upload document for processing
- `GET /api/format/styles` - Get available formatting styles
- `POST /api/format` - Format document with selected style
- `POST /api/export` - Export formatted document

## Technology Stack

### Backend
- Node.js & Express
- TypeScript
- OpenAI GPT-4 API
- Multer (file uploads)
- Mammoth (Word parsing)
- Docx (Word generation)
- Puppeteer (PDF generation)

### Frontend
- React 18
- TypeScript
- Vite
- React Dropzone
- Axios

## Security Considerations

- API keys stored in environment variables
- Server-side API calls only
- File type validation
- Size limits on uploads
- Temporary file cleanup

## Development

### Building for Production

Backend:
```bash
npm run build
npm start
```

Frontend:
```bash
cd client
npm run build
```

### Testing

```bash
npm test
```

## Cost Considerations

- OpenAI API costs approximately $0.03 per page processed
- Consider implementing usage limits for production

## License

MIT

## Support

For issues or questions, please check the documentation in CLAUDE.md or roadmap.md