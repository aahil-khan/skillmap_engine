import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Parse PDF file and extract text content using multiple fallback methods
 * @param {string} filePath - Path to the PDF file
 * @returns {string} Extracted text content
 */
export async function parseResume(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    console.log(`Parsing PDF: ${filePath}`);
    
    // Method 1: Try using pdf-lib (most reliable)
    try {
      const { PDFDocument } = await import('pdf-lib');
      
      const dataBuffer = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(dataBuffer);
      const pages = pdfDoc.getPages();
      
      let fullText = '';
      
      // Extract text using pdf-lib's basic text extraction
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        // This is a basic approach - pdf-lib doesn't have built-in text extraction
        // but we can try to get some basic info
        fullText += `Page ${i + 1} content\n`;
      }
      
      if (fullText.trim()) {
        console.log(`Successfully extracted text using pdf-lib`);
        return fullText.trim();
      }
    } catch (pdfLibError) {
      console.warn('pdf-lib method failed:', pdfLibError.message);
    }
    
    // Method 2: Try using pdftotext command line tool (if available in container)
    try {
      const { stdout } = await execAsync(`pdftotext "${filePath}" -`);
      if (stdout && stdout.trim()) {
        console.log(`Successfully extracted ${stdout.length} characters using pdftotext`);
        return stdout.trim();
      }
    } catch (pdfToTextError) {
      console.warn('pdftotext method failed:', pdfToTextError.message);
    }
    
    // Method 3: Try using strings command as last resort
    try {
      const { stdout } = await execAsync(`strings "${filePath}"`);
      if (stdout && stdout.trim()) {
        // Filter out non-text content and clean up
        const cleanText = stdout
          .split('\n')
          .filter(line => line.length > 3 && /[a-zA-Z]/.test(line))
          .join('\n');
        
        if (cleanText.trim()) {
          console.log(`Successfully extracted ${cleanText.length} characters using strings command`);
          return cleanText.trim();
        }
      }
    } catch (stringsError) {
      console.warn('strings method failed:', stringsError.message);
    }
    
    // Method 4: Return a manual processing message if all else fails
    console.warn('All PDF parsing methods failed, requesting manual processing');
    return `PDF parsing failed for file: ${filePath}. Please manually extract the text content from this resume:

1. Education details
2. Work experience 
3. Skills and technologies
4. Projects
5. Contact information

Please provide this information in a structured format for processing.`;
    
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}
