import pdfParse from 'pdf-parse';
import fs from 'fs';

/**
 * Parse PDF file and extract text content
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
    
    // Read file as buffer
    const dataBuffer = fs.readFileSync(filePath);
    
    // Parse PDF
    const data = await pdfParse(dataBuffer);
    
    console.log(`Successfully extracted ${data.text.length} characters from PDF`);
    
    return data.text;
    
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}
