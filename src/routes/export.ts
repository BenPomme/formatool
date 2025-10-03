import { Router, Request, Response, NextFunction } from 'express';
import { generateDocx } from '../services/docxGenerator';
import { generatePdf } from '../services/pdfGenerator';
import path from 'path';
import fs from 'fs/promises';

const router = Router();

interface ExportRequest {
  content: string;
  format: 'docx' | 'pdf';
  filename: string;
  styleId: string;
}

router.post('/', async (req: Request<{}, {}, ExportRequest>, res: Response, next: NextFunction) => {
  try {
    const { content, format, filename, styleId } = req.body;

    if (!content || !format || !filename) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: content, format, or filename'
      });
    }

    let filePath: string;
    const sanitizedFilename = filename.replace(/[^a-z0-9]/gi, '_');

    if (format === 'docx') {
      filePath = await generateDocx(content, sanitizedFilename, styleId);
    } else if (format === 'pdf') {
      filePath = await generatePdf(content, sanitizedFilename, styleId);
    } else {
      return res.status(400).json({
        success: false,
        message: `Invalid format: ${format}`
      });
    }

    const fileBuffer = await fs.readFile(filePath);
    const mimeType = format === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}.${format}"`);
    res.send(fileBuffer);

    await fs.unlink(filePath).catch(console.error);

  } catch (error) {
    next(error);
  }
});

export default router;