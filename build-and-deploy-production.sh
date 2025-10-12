#!/bin/bash

# ================================================================================================
# BUILD AND DEPLOY TO PRODUCTION (SPAIN)
# ================================================================================================
# This script builds the project with Vite and deploys to Spain S3 + CloudFront
# Run this every time you want to deploy changes to production
# ================================================================================================

set -e  # Exit on error

echo "🚀 Starting Production Build and Deployment..."
echo "=============================================="
echo ""

# Load production configuration
if [ -f "./production-config.sh" ]; then
    source ./production-config.sh
    echo "✅ Loaded production configuration"
else
    echo "❌ ERROR: production-config.sh not found!"
    echo "   Please run ./setup-production-infrastructure.sh first"
    exit 1
fi

echo ""
echo "📦 Configuration:"
echo "  Bucket: $PRODUCTION_BUCKET"
echo "  Region: $PRODUCTION_REGION"
echo "  Distribution: $PRODUCTION_DISTRIBUTION_ID"
echo "  Domain: https://$PRODUCTION_CLOUDFRONT_DOMAIN"
echo ""

# Step 1: Clean previous build
echo "🧹 Step 1: Cleaning previous build..."
if [ -d "dist" ]; then
    rm -rf dist
    echo "✅ Removed old dist/ folder"
else
    echo "✅ No previous build found"
fi

# Step 2: Install dependencies (if needed)
echo ""
echo "📚 Step 2: Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

# Step 3: Build with Vite
echo ""
echo "🏗️  Step 3: Building project with Vite..."
echo "This may take 30-60 seconds..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ ERROR: Build failed - dist/ folder not created"
    exit 1
fi

echo "✅ Build completed successfully!"
echo ""

# Show build statistics
echo "📊 Build Statistics:"
du -sh dist/
echo "Files created:"
find dist -type f | wc -l | awk '{print "  Total files: " $1}'
echo ""

# Step 4: Upload to S3 with optimized cache headers
echo "☁️  Step 4: Uploading to S3..."
echo ""

# Upload HTML files (no cache - always check for updates)
echo "  Uploading HTML files (no-cache)..."
aws s3 sync ./dist s3://$PRODUCTION_BUCKET \
    --profile $AWS_PROFILE \
    --region $PRODUCTION_REGION \
    --exclude "*" \
    --include "*.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --metadata-directive REPLACE \
    --delete

# Upload CSS and JS files (no-cache - always check for updates)
echo "  Uploading CSS and JS files (no-cache)..."
aws s3 sync ./dist s3://$PRODUCTION_BUCKET \
    --profile $AWS_PROFILE \
    --region $PRODUCTION_REGION \
    --exclude "*" \
    --include "*.css" \
    --include "*.js" \
    --cache-control "no-cache, must-revalidate" \
    --metadata-directive REPLACE \
    --delete

# Upload JSON configuration files (no-cache)
echo "  Uploading config files (no-cache)..."
aws s3 sync ./dist s3://$PRODUCTION_BUCKET \
    --profile $AWS_PROFILE \
    --region $PRODUCTION_REGION \
    --exclude "*" \
    --include "*.json" \
    --cache-control "no-cache, must-revalidate" \
    --metadata-directive REPLACE \
    --delete

# Upload images with 1 week cache (images rarely change)
echo "  Uploading images (1 week cache)..."
aws s3 sync ./dist s3://$PRODUCTION_BUCKET \
    --profile $AWS_PROFILE \
    --region $PRODUCTION_REGION \
    --exclude "*" \
    --include "*.png" \
    --include "*.jpg" \
    --include "*.jpeg" \
    --include "*.gif" \
    --include "*.svg" \
    --include "*.webp" \
    --include "*.ico" \
    --cache-control "max-age=604800, public" \
    --delete

# Upload fonts with 1 year cache (fonts never change)
echo "  Uploading fonts (1 year cache)..."
aws s3 sync ./dist s3://$PRODUCTION_BUCKET \
    --profile $AWS_PROFILE \
    --region $PRODUCTION_REGION \
    --exclude "*" \
    --include "*.woff" \
    --include "*.woff2" \
    --include "*.ttf" \
    --include "*.eot" \
    --cache-control "max-age=31536000, public, immutable" \
    --delete

# Upload all remaining files
echo "  Uploading remaining files..."
aws s3 sync ./dist s3://$PRODUCTION_BUCKET \
    --profile $AWS_PROFILE \
    --region $PRODUCTION_REGION \
    --exclude "*.html" \
    --exclude "*.css" \
    --exclude "*.js" \
    --exclude "*.json" \
    --exclude "*.png" \
    --exclude "*.jpg" \
    --exclude "*.jpeg" \
    --exclude "*.gif" \
    --exclude "*.svg" \
    --exclude "*.webp" \
    --exclude "*.ico" \
    --exclude "*.woff" \
    --exclude "*.woff2" \
    --exclude "*.ttf" \
    --exclude "*.eot" \
    --cache-control "max-age=3600, public" \
    --delete

echo "✅ Upload to S3 complete!"

# Step 5: Invalidate CloudFront Cache
echo ""
echo "🔄 Step 5: Invalidating CloudFront cache..."
INVALIDATION_OUTPUT=$(aws cloudfront create-invalidation \
    --distribution-id $PRODUCTION_DISTRIBUTION_ID \
    --paths "/*" \
    --profile $AWS_PROFILE \
    --output json)

INVALIDATION_ID=$(echo $INVALIDATION_OUTPUT | grep -o '"Id": "[^"]*' | grep -o '[^"]*$')

echo "✅ CloudFront invalidation created: $INVALIDATION_ID"
echo "   Invalidation typically takes 1-3 minutes to complete"

# Step 6: Summary
echo ""
echo "=================================================="
echo "🎉 DEPLOYMENT COMPLETE!"
echo "=================================================="
echo ""
echo "🌍 Your website is now live at:"
echo "   https://$PRODUCTION_CLOUDFRONT_DOMAIN"
echo ""
echo "📋 What was deployed:"
echo "   - Optimized and minified JS/CSS bundles"
echo "   - All assets with proper cache headers"
echo "   - CloudFront cache invalidated"
echo ""
echo "⏰ Wait 1-3 minutes for CloudFront invalidation"
echo "   Then test on mobile:"
echo "   1. Open Safari in Private/Incognito mode"
echo "   2. Visit: https://$PRODUCTION_CLOUDFRONT_DOMAIN"
echo "   3. Test mobile menu and markers"
echo ""
echo "🔍 Check invalidation status:"
echo "   aws cloudfront get-invalidation --distribution-id $PRODUCTION_DISTRIBUTION_ID --id $INVALIDATION_ID --profile $AWS_PROFILE --query 'Invalidation.Status'"
echo ""
echo "✅ All done!"
