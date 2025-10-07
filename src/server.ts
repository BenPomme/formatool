import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import uploadRoutes from './routes/upload';
import uploadDualRoutes from './routes/uploadDual';
import formatRoutes from './routes/format';
import exportRoutes from './routes/export';
import progressRoutes from './routes/progress';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map(origin => origin.trim())
  .filter(origin => origin.length > 0);

console.log('Allowed CORS origins:', allowedOrigins);

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    console.log('Request origin:', origin);
    console.log('Is origin allowed?', !origin || allowedOrigins.includes(origin));
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/upload', uploadRoutes);
app.use('/api/dual', uploadDualRoutes);
app.use('/api/format', formatRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/progress', progressRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
