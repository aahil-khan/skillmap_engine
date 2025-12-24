import pdf from 'pdf-parse';
import logger from '../../utils/logger.js';

/**
 * Extracts text from PDF buffer.
 * Uses pdf-parse library (already in dependencies)
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    logger.error({  error  }, 'PDF parsing failed');
    throw new Error('Failed to extract text from PDF');
  }
}
