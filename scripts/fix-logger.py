#!/usr/bin/env python3
"""
Fix all Pino logger calls in TypeScript files.
Changes from: logger.method('message', { obj })
To: logger.method({ obj }, 'message')
"""

import re
import os
from pathlib import Path

def fix_logger_inline(content):
    """Fix single-line logger calls"""
    pattern = r"(logger\.(info|error|warn|debug))\('([^']+)',\s*\{([^}]+)\}\)"
    replacement = r"\1({ \4 }, '\3')"
    return re.sub(pattern, replacement, content)

def fix_logger_multiline(content):
    """Fix multi-line logger calls"""
    lines = content.split('\n')
    result = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        match = re.search(r"(logger\.(info|error|warn|debug))\('([^']+)',\s*\{", line)
        
        if match:
            logger_call = match.group(1)
            message = match.group(3)
            indent = len(line) - len(line.lstrip())
            
            # Collect the entire object
            obj_lines = [line[line.index('{'):]]
            brace_count = 1
            j = i + 1
            
            while j < len(lines) and brace_count > 0:
                next_line = lines[j]
                obj_lines.append(next_line.lstrip())
                brace_count += next_line.count('{')
                brace_count -= next_line.count('}')
                j += 1
            
            # Remove trailing );
            obj_str = '\n'.join(obj_lines).rstrip()
            obj_str = re.sub(r'\);?\s*$', '', obj_str)
            
            # Reconstruct with proper formatting
            result.append(f"{' ' * indent}{logger_call}({obj_str}, '{message}');")
            i = j
        else:
            result.append(line)
            i += 1
    
    return '\n'.join(result)

def process_file(filepath):
    """Process a single TypeScript file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Fix inline first
    content = fix_logger_inline(content)
    
    # Then fix multiline
    if "logger." in content and "', {" in content:
        content = fix_logger_multiline(content)
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    src_dir = Path(__file__).parent.parent / 'src'
    fixed_count = 0
    
    for ts_file in src_dir.rglob('*.ts'):
        if process_file(ts_file):
            print(f"✅ Fixed: {ts_file.relative_to(src_dir)}")
            fixed_count += 1
    
    print(f"\n✨ Fixed {fixed_count} files")

if __name__ == '__main__':
    main()
