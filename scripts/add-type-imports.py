#!/usr/bin/env python3
"""Add type import to all route files"""

from pathlib import Path

def add_type_import(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if already has the import
    if "'../types/hono.js'" in content or '"../types/hono.js"' in content:
        return False
    
    lines = content.split('\n')
    
    # Find the first import line
    first_import_idx = -1
    for i, line in enumerate(lines):
        if line.startswith('import '):
            first_import_idx = i
            break
    
    if first_import_idx >= 0:
        # Add after first import
        lines.insert(first_import_idx + 1, "import '../types/hono.js'; // Type declarations for Hono context")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        return True
    
    return False

def main():
    src_dir = Path(__file__).parent.parent / 'src'
    routes_dir = src_dir / 'routes'
    
    fixed = []
    for ts_file in routes_dir.glob('*.ts'):
        if add_type_import(ts_file):
            fixed.append(ts_file.name)
            print(f"✅ Added type import to: {ts_file.name}")
    
    print(f"\n✨ Updated {len(fixed)} route files")

if __name__ == '__main__':
    main()
