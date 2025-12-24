#!/usr/bin/env node

/**
 * Script to fix all Pino logger calls in the codebase
 * Changes from: logger.info('message', { obj })
 * To: logger.info({ obj }, 'message')
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '..', 'src');

// Regex to match logger calls with message first
const LOGGER_REGEX = /(logger\.(info|error|warn|debug))\('([^']+)',\s*(\{[^}]+\})\)/g;

async function getAllTsFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return getAllTsFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      return [fullPath];
    }
    return [];
  }));
  return files.flat();
}

async function fixLoggerCalls(filePath) {
  let content = await fs.readFile(filePath, 'utf8');
  const originalContent = content;
  let matchCount = 0;

  // Replace all logger calls
  content = content.replace(LOGGER_REGEX, (match, loggerCall, level, message, obj) => {
    matchCount++;
    return `${loggerCall}(${obj}, '${message}')`;
  });

  // Also handle multi-line object cases
  const multiLineRegex = /(logger\.(info|error|warn|debug))\('([^']+)',\s*\{/g;
  if (multiLineRegex.test(content)) {
    // Reset content for multi-line processing
    content = originalContent;
    
    // Split into lines for more precise matching
    const lines = content.split('\n');
    const result = [];
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i];
      const match = line.match(/(logger\.(info|error|warn|debug))\('([^']+)',\s*\{/);
      
      if (match) {
        const [, loggerCall, level, message] = match;
        const indent = line.match(/^(\s*)/)[1];
        
        // Find the closing of the object
        let objLines = [line.substring(line.indexOf('{'))];
        let braceCount = 1;
        let j = i + 1;
        
        while (j < lines.length && braceCount > 0) {
          const nextLine = lines[j];
          objLines.push(nextLine);
          braceCount += (nextLine.match(/\{/g) || []).length;
          braceCount -= (nextLine.match(/\}/g) || []).length;
          j++;
        }
        
        // Reconstruct
        const objStr = objLines.join('\n').replace(/\);?\s*$/, '');
        result.push(`${indent}${loggerCall}(${objStr}, '${message}');`);
        matchCount++;
        i = j;
      } else {
        result.push(line);
        i++;
      }
    }
    
    content = result.join('\n');
  }

  if (content !== originalContent) {
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`✅ Fixed ${matchCount} logger calls in ${path.relative(SRC_DIR, filePath)}`);
    return matchCount;
  }
  
  return 0;
}

async function main() {
  console.log('🔍 Finding all TypeScript files...');
  const files = await getAllTsFiles(SRC_DIR);
  console.log(`📝 Found ${files.length} TypeScript files\n`);

  let totalFixed = 0;
  for (const file of files) {
    const fixed = await fixLoggerCalls(file);
    totalFixed += fixed;
  }

  console.log(`\n✨ Done! Fixed ${totalFixed} logger calls across ${files.length} files`);
}

main().catch(console.error);
