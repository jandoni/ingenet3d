#!/usr/bin/env python3
"""
Update config.json to use local logo paths instead of external URLs
"""

import json
import os
import re

# File paths
CONFIG_FILE = "src/config.json"
LOGOS_DIR = "src/assets/logos"

# Function to sanitize filename (same as bash script)
def sanitize_filename(title):
    """Convert title to filename format"""
    # Convert to lowercase, replace special chars with hyphens
    filename = title.lower()
    filename = re.sub(r'[^a-z0-9]+', '-', filename)
    filename = re.sub(r'-+', '-', filename)  # Remove duplicate hyphens
    filename = filename.strip('-')  # Remove leading/trailing hyphens
    return filename[:50]  # Limit to 50 chars

# Get file extension from URL
def get_extension_from_url(url):
    """Extract file extension from URL"""
    if not url:
        return ".png"

    # Try to find extension in URL
    match = re.search(r'\.(jpg|jpeg|png|svg|gif|webp)(\?|$)', url, re.IGNORECASE)
    if match:
        return '.' + match.group(1).lower()

    return ".png"  # Default

# Load config
print("📖 Loading config.json...")
with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
    config = json.load(f)

# Get list of downloaded logos
downloaded_logos = {}
if os.path.exists(LOGOS_DIR):
    for filename in os.listdir(LOGOS_DIR):
        if filename.startswith('.'):
            continue
        downloaded_logos[filename] = True

print(f"✅ Found {len(downloaded_logos)} downloaded logos\n")

# Statistics
updated_count = 0
skipped_count = 0
missing_count = 0

# Update each chapter
print("🔄 Updating chapter logo URLs...\n")
for chapter in config['chapters']:
    chapter_id = chapter.get('id')
    title = chapter.get('title', '')
    original_url = chapter.get('logoUrl', '')

    if not original_url:
        skipped_count += 1
        continue

    # Generate expected filename
    base_name = sanitize_filename(title)
    extension = get_extension_from_url(original_url)
    expected_filename = f"{base_name}{extension}"

    # Check if file exists
    local_path = f"assets/logos/{expected_filename}"

    if expected_filename in downloaded_logos:
        chapter['logoUrl'] = local_path
        print(f"✅ #{chapter_id}: {title}")
        print(f"   {local_path}")
        updated_count += 1
    else:
        print(f"⚠️  #{chapter_id}: {title}")
        print(f"   Logo not found: {expected_filename}")
        print(f"   Keeping original URL: {original_url}")
        missing_count += 1

    print()

# Save updated config
print("\n💾 Saving updated config.json...")
with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=2, ensure_ascii=False)

print("\n" + "="*50)
print("✨ Update Complete!")
print("="*50)
print(f"✅ Updated: {updated_count} logos")
print(f"⚠️  Missing: {missing_count} logos (keeping original URLs)")
print(f"⏭️  Skipped: {skipped_count} chapters (no logoUrl)")
print(f"\n📂 Logos location: {LOGOS_DIR}")
print("="*50)
