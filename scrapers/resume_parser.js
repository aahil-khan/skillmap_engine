import PdfParse from 'pdf-parse';
import fs from 'fs';
  

export async function parseResume(filePath) {
    try {
        // Check if file exists first
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        
        const dataBuffer = await fs.readFileSync(filePath);

        // Pass the buffer explicitly to PdfParse
        const data = await PdfParse(dataBuffer);
        
        return data.text;
    } catch (err) {
        console.error('Error parsing PDF:', err.message);
        console.error('Full error:', err);
    }
}

