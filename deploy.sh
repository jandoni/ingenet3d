#!/bin/bash

# Deploy to S3
echo "🚀 Syncing files to S3..."
AWS_PROFILE=ingenet3d aws s3 sync ./src s3://ingenet3d-webapp-1751575263 --delete

# CloudFront Distribution ID
DISTRIBUTION_ID="ENWN06TMTK1VF"

# Create CloudFront invalidation
echo "🔄 Creating CloudFront invalidation..."
AWS_PROFILE=ingenet3d aws cloudfront create-invalidation \
    --distribution-id $DISTRIBUTION_ID \
    --paths "/*" \
    --query 'Invalidation.Id' \
    --output text

echo "✅ Deployment complete! Changes will be visible in 5-10 minutes."
echo "🌐 Visit: https://d3f4r7eoos0m2t.cloudfront.net/"