#!/bin/bash

# Update existing deployment with new files
# Usage: ./update-deployment.sh

set -e

# Configuration
export AWS_PROFILE=ingenet3d  # Always use ingenet3d profile

echo "📋 Using AWS profile: $AWS_PROFILE"

# Read deployment info
if [ ! -f "deployment-info.json" ]; then
    echo "❌ No deployment found. Run ./deploy-aws.sh first"
    exit 1
fi

BUCKET=$(jq -r '.bucket' deployment-info.json)
CF_ID=$(jq -r '.cloudfront_id' deployment-info.json)

echo "📤 Syncing files to S3 bucket: $BUCKET"

# Sync files (only uploads changed files)
aws s3 sync ./src s3://"$BUCKET"/ \
    --delete \
    --exclude ".DS_Store" \
    --exclude "*.sh" \
    --exclude "Dockerfile" \
    --exclude "*.md" \
    --exclude ".git/*"

echo "🔄 Creating CloudFront invalidation..."

# Invalidate CloudFront cache
INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$CF_ID" \
    --paths "/*" \
    --query 'Invalidation.Id' \
    --output text)

echo "✅ Update complete!"
echo "   Invalidation ID: $INVALIDATION_ID"
echo "   Changes will be live in 5-10 minutes"