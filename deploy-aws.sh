#!/bin/bash

# AWS S3 + CloudFront Deployment Script for Ingenet3D
# Usage: ./deploy-aws.sh [domain-name]

set -e  # Exit on error

# Configuration
export AWS_PROFILE=ingenet3d  # Always use ingenet3d profile
BUCKET_NAME="ingenet3d-webapp-$(date +%s)"  # Unique bucket name
REGION="us-east-1"  # Must be us-east-1 for CloudFront
DOMAIN_NAME=${1:-""}  # Optional domain parameter

echo "🚀 Starting deployment of Ingenet3D to AWS..."
echo "📋 Using AWS profile: $AWS_PROFILE"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first:"
    echo "   brew install awscli"
    echo "   aws configure --profile ingenet3d"
    exit 1
fi

# Check AWS credentials for ingenet3d profile
if ! aws sts get-caller-identity --profile ingenet3d &> /dev/null; then
    echo "❌ AWS credentials not configured for ingenet3d profile. Run:"
    echo "   aws configure --profile ingenet3d"
    exit 1
fi

echo "📦 Creating S3 bucket: $BUCKET_NAME"

# Create S3 bucket
aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    --acl private

# Create bucket policy for CloudFront access
cat > /tmp/bucket-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowCloudFrontAccess",
            "Effect": "Allow",
            "Principal": {
                "Service": "cloudfront.amazonaws.com"
            },
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
        }
    ]
}
EOF

# Enable static website hosting
aws s3api put-bucket-website \
    --bucket "$BUCKET_NAME" \
    --website-configuration '{
        "IndexDocument": {"Suffix": "index.html"},
        "ErrorDocument": {"Key": "error.html"}
    }'

echo "📤 Uploading files to S3..."

# Upload files (excluding unnecessary ones)
aws s3 sync ./src s3://"$BUCKET_NAME"/ \
    --exclude ".DS_Store" \
    --exclude "*.sh" \
    --exclude "Dockerfile" \
    --exclude "*.md" \
    --exclude ".git/*"

# Create CloudFront Origin Access Control
OAC_ID=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config '{
        "Name": "'"$BUCKET_NAME"'-OAC",
        "Description": "OAC for Ingenet3D",
        "SigningProtocol": "sigv4",
        "SigningBehavior": "always",
        "OriginAccessControlOriginType": "s3"
    }' \
    --query 'OriginAccessControl.Id' \
    --output text 2>/dev/null || echo "existing")

echo "🌐 Creating CloudFront distribution..."

# Create CloudFront distribution configuration
cat > /tmp/cf-config.json << EOF
{
    "CallerReference": "ingenet3d-$(date +%s)",
    "Comment": "Ingenet3D 3D Storytelling App",
    "DefaultRootObject": "index.html",
    "Origins": {
        "Quantity": 1,
        "Items": [
            {
                "Id": "S3-${BUCKET_NAME}",
                "DomainName": "${BUCKET_NAME}.s3.${REGION}.amazonaws.com",
                "S3OriginConfig": {
                    "OriginAccessIdentity": ""
                },
                "OriginAccessControlId": "${OAC_ID}"
            }
        ]
    },
    "DefaultCacheBehavior": {
        "TargetOriginId": "S3-${BUCKET_NAME}",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 2,
            "Items": ["GET", "HEAD"]
        },
        "Compress": true,
        "ForwardedValues": {
            "QueryString": false,
            "Cookies": {
                "Forward": "none"
            }
        },
        "TrustedSigners": {
            "Enabled": false,
            "Quantity": 0
        },
        "MinTTL": 0,
        "DefaultTTL": 86400,
        "MaxTTL": 31536000
    },
    "Enabled": true,
    "PriceClass": "PriceClass_100",
    "ViewerCertificate": {
        "CloudFrontDefaultCertificate": true
    },
    "CustomErrorResponses": {
        "Quantity": 1,
        "Items": [
            {
                "ErrorCode": 404,
                "ResponsePagePath": "/index.html",
                "ResponseCode": "200",
                "ErrorCachingMinTTL": 300
            }
        ]
    }
}
EOF

# Add domain configuration if provided
if [ -n "$DOMAIN_NAME" ]; then
    echo "🔐 Domain configuration for: $DOMAIN_NAME"
    # This would require ACM certificate - manual step needed
    echo "⚠️  Note: You'll need to:"
    echo "   1. Create ACM certificate for $DOMAIN_NAME in us-east-1"
    echo "   2. Update CloudFront with the certificate"
    echo "   3. Create Route 53 A record pointing to CloudFront"
fi

# Create CloudFront distribution
DISTRIBUTION_ID=$(aws cloudfront create-distribution \
    --distribution-config file:///tmp/cf-config.json \
    --query 'Distribution.Id' \
    --output text)

DISTRIBUTION_DOMAIN=$(aws cloudfront get-distribution \
    --id "$DISTRIBUTION_ID" \
    --query 'Distribution.DomainName' \
    --output text)

# Apply bucket policy after CloudFront is created
aws s3api put-bucket-policy \
    --bucket "$BUCKET_NAME" \
    --policy file:///tmp/bucket-policy.json

echo "✅ Deployment complete!"
echo ""
echo "📊 Deployment Summary:"
echo "   S3 Bucket: $BUCKET_NAME"
echo "   CloudFront ID: $DISTRIBUTION_ID"
echo "   CloudFront URL: https://$DISTRIBUTION_DOMAIN"
echo ""
echo "⏳ Note: CloudFront distribution takes 10-15 minutes to deploy globally."
echo ""

# Save deployment info
cat > deployment-info.json << EOF
{
    "bucket": "$BUCKET_NAME",
    "region": "$REGION",
    "cloudfront_id": "$DISTRIBUTION_ID",
    "cloudfront_domain": "$DISTRIBUTION_DOMAIN",
    "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "💾 Deployment info saved to: deployment-info.json"

# Cleanup temp files
rm -f /tmp/bucket-policy.json /tmp/cf-config.json

echo ""
echo "🎉 Your app will be available at: https://$DISTRIBUTION_DOMAIN"
echo "   (after CloudFront deployment completes)"