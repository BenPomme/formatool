import { Router, Request, Response, NextFunction } from 'express';
import { upload } from '../middleware/upload';
import { parseDocument } from '../services/documentParser';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

interface UploadResponse {
  success: boolean;
  jobId: string;
  filename: string;
  content?: string;
  message?: string;
}

router.post('/',
  upload.single('document'),
  async (req: Request, res: Response<UploadResponse>, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          jobId: '',
          filename: '',
          message: 'No file uploaded'
        });
      }

      const jobId = uuidv4();
      const { originalname, path: filePath, size } = req.file;

      console.log(`File uploaded: ${originalname}, Size: ${size} bytes`);

      const content = await parseDocument(filePath);

      return res.json({
        success: true,
        jobId,
        filename: originalname,
        content,
        message: 'File uploaded and parsed successfully'
      });

    } catch (error) {
      next(error);
    }
  }
);

export default router;