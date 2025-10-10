import fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Parse PDF file and extract text content using PDF.js (Mozilla's library)
 * This is the most reliable PDF parsing library, used by Firefox
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} Extracted text content
 */
export async function parseResume(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    console.log(`Parsing PDF with PDF.js: ${filePath}`);
    
    // Read the PDF file
    const dataBuffer = fs.readFileSync(filePath);
    const uint8Array = new Uint8Array(dataBuffer);
    
    // Load the PDF document
    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/',
    });
    
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    console.log(`PDF has ${numPages} pages`);
    
    let fullText = '';
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine text items with proper spacing
      const pageText = textContent.items
        .map(item => item.str)
        .join(' ');
      
      fullText += pageText + '\n\n';
      
      console.log(`Extracted ${pageText.length} characters from page ${pageNum}`);
    }
    
    // Clean up the text
    const cleanedText = fullText
      .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
      .replace(/\n\s*\n\s*\n/g, '\n\n')  // Replace multiple newlines with double newline
      .trim();
    
    if (cleanedText.length < 50) {
      throw new Error(`Extracted text too short (${cleanedText.length} characters). PDF may be image-based or corrupted.`);
    }
    
    console.log(`Successfully extracted ${cleanedText.length} characters from ${numPages} pages`);
    return cleanedText;
    
  } catch (error) {
    console.error('Error parsing PDF with PDF.js:', error);
    
    // If PDF.js fails, provide helpful error message
    if (error.message.includes('image-based')) {
      throw new Error('This PDF appears to be image-based (scanned document). Please use a text-based PDF or OCR the document first.');
    }
    
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}
