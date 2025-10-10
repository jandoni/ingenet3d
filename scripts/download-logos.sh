#!/bin/bash

# Download Logos Script
# Downloads all logo images from config.json and saves them locally

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Directories
CONFIG_FILE="src/config.json"
LOGOS_DIR="src/assets/logos"
TEMP_MAPPING="/tmp/logo-mapping-$$.json"

# Counters
SUCCESS_COUNT=0
FAIL_COUNT=0

echo "=========================================="
echo "  Logo Download Script"
echo "=========================================="
echo ""
echo "📂 Logos will be saved to: $LOGOS_DIR"
echo ""

# Create logos directory if it doesn't exist
mkdir -p "$LOGOS_DIR"

# Create array to store mappings
echo "{" > "$TEMP_MAPPING"

# Function to sanitize filename
sanitize_filename() {
    local title="$1"
    # Convert to lowercase, replace spaces and special chars with hyphens
    echo "$title" | tr '[:upper:]' '[:lower:]' | \
                    sed 's/[^a-z0-9]/-/g' | \
                    sed 's/--*/-/g' | \
                    sed 's/^-//' | \
                    sed 's/-$//' | \
                    cut -c1-50  # Limit to 50 chars
}

# Function to get file extension from URL
get_extension() {
    local url="$1"

    # First try to get from URL path
    local ext=$(echo "$url" | grep -oE '\.(jpg|jpeg|png|svg|gif|webp)(\?|$)' | head -1 | sed 's/[?]$//' | tr '[:upper:]' '[:lower:]')

    # If not found, try from query parameters
    if [ -z "$ext" ]; then
        ext=$(echo "$url" | grep -oE 'format=(jpg|jpeg|png|svg|gif|webp)' | cut -d= -f2 | head -1)
        if [ -n "$ext" ]; then
            ext=".$ext"
        fi
    fi

    # Default to .png if can't detect
    if [ -z "$ext" ]; then
        ext=".png"
    fi

    echo "$ext"
}

# Function to download a single logo
download_logo() {
    local id="$1"
    local title="$2"
    local url="$3"

    # Skip if URL is empty
    if [ -z "$url" ] || [ "$url" = "null" ]; then
        echo -e "${YELLOW}⏭️  Skipping #$id (no logo URL)${NC}"
        return 1
    fi

    # Sanitize filename
    local base_name=$(sanitize_filename "$title")
    local extension=$(get_extension "$url")
    local filename="${base_name}${extension}"
    local filepath="$LOGOS_DIR/$filename"

    echo "---"
    echo "📥 #$id: $title"
    echo "   URL: $url"
    echo "   Saving as: $filename"

    # Download with curl
    if curl -f -L \
            --max-time 10 \
            --retry 2 \
            --retry-delay 1 \
            -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
            -H "Accept: image/webp,image/apng,image/*,*/*;q=0.8" \
            -o "$filepath" \
            "$url" 2>/dev/null; then

        # Verify file is not empty
        if [ -s "$filepath" ]; then
            echo -e "${GREEN}   ✅ Downloaded successfully!${NC}"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))

            # Add to mapping (append to JSON)
            local escaped_url=$(echo "$url" | sed 's/"/\\"/g')
            echo "  \"$escaped_url\": \"assets/logos/$filename\"," >> "$TEMP_MAPPING"
            return 0
        else
            echo -e "${RED}   ❌ File is empty${NC}"
            rm -f "$filepath"
            FAIL_COUNT=$((FAIL_COUNT + 1))
            return 1
        fi
    else
        echo -e "${RED}   ❌ Download failed (likely CORS or 404)${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi
}

echo "Starting downloads..."
echo ""

# Extract all chapters and download their logos
# Using jq to parse JSON properly
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed. Please install it first:${NC}"
    echo "  brew install jq"
    exit 1
fi

# Read config and process each chapter
# Process each chapter using jq
CHAPTER_COUNT=$(jq '.chapters | length' "$CONFIG_FILE")

for ((i=0; i<CHAPTER_COUNT; i++)); do
    ID=$(jq -r ".chapters[$i].id" "$CONFIG_FILE")
    TITLE=$(jq -r ".chapters[$i].title" "$CONFIG_FILE")
    LOGO_URL=$(jq -r ".chapters[$i].logoUrl // \"\"" "$CONFIG_FILE")

    download_logo "$ID" "$TITLE" "$LOGO_URL"
done

# Close JSON mapping
echo "  \"__end__\": \"\"" >> "$TEMP_MAPPING"
echo "}" >> "$TEMP_MAPPING"

echo ""
echo "=========================================="
echo "  Download Complete!"
echo "=========================================="
echo -e "${GREEN}✅ Successful: $SUCCESS_COUNT${NC}"
echo -e "${RED}❌ Failed: $FAIL_COUNT${NC}"
echo "📂 Logos saved in: $LOGOS_DIR"
echo ""
echo "Mapping file created: $TEMP_MAPPING"
echo ""
echo "Next step: Update config.json with local paths"
echo ""
