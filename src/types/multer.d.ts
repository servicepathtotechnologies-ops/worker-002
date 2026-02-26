// Type definitions for multer with Express
// Global type augmentation for Express Request

import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      files?: Express.Multer.File[];
      file?: Express.Multer.File;
    }
  }
}

// This file is automatically included by TypeScript
// No need to import it explicitly
