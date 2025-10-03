import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';

export async function parseDocument(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.txt':
      return await parseTxtFile(filePath);
    case '.docx':
      return await parseDocxFile(filePath);
    case '.doc':
      return await parseDocxFile(filePath);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

async function parseTxtFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`Failed to parse text file: ${error}`);
  }
}

async function parseDocxFile(filePath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });

    if (result.messages && result.messages.length > 0) {
      console.warn('Mammoth warnings:', result.messages);
    }

    return result.value;
  } catch (error) {
    throw new Error(`Failed to parse Word document: ${error}`);
  }
}