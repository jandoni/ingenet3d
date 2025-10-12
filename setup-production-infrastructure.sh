#!/bin/bash

# ================================================================================================
# PRODUCTION INFRASTRUCTURE SETUP FOR SPAIN
# ================================================================================================
# This script creates a new S3 bucket in Spain and CloudFront distribution
# Run this ONCE to set up your production infrastructure
# ================================================================================================

set -e  # Exit on error

# Configuration
BUCKET_NAME="ingenet-production-s3"
REGION="eu-south-2"  # Spain - Aragón
CLOUDFRONT_NAME="Ingenet-Production-Cloudfront"
AWS_PROFILE="ingenet3d"

echo "🚀 Setting up Production Infrastructure in Spain..."
echo "=================================================="
echo "Bucket: $BUCKET_NAME"
echo "Region: $REGION"
echo "CloudFront: $CLOUDFRONT_NAME"
echo "=================================================="
echo ""

# Step 1: Create S3 Bucket
echo "📦 Step 1: Creating S3 bucket..."
if aws s3 ls "s3://$BUCKET_NAME" --profile $AWS_PROFILE 2>&1 | grep -q 'NoSuchBucket'; then
    aws s3 mb "s3://$BUCKET_NAME" --region $REGION --profile $AWS_PROFILE
    echo "✅ Bucket created successfully"
else
    echo "⚠️  Bucket already exists, skipping creation"
fi

# Step 2: Enable Static Website Hosting
echo ""
echo "🌐 Step 2: Enabling static website hosting..."
aws s3 website "s3://$BUCKET_NAME" \
    --index-document index.html \
    --error-document index.html \
    --profile $AWS_PROFILE

echo "✅ Static website hosting enabled"

# Step 3: Set Bucket Policy for Public Read Access
echo ""
echo "🔓 Step 3: Setting bucket policy for public read access..."
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
    --bucket $BUCKET_NAME \
    --policy file:///tmp/bucket-policy.json \
    --profile $AWS_PROFILE

echo "✅ Bucket policy applied"

# Step 4: Disable Block Public Access
echo ""
echo "🔓 Step 4: Configuring public access settings..."
aws s3api put-public-access-block \
    --bucket $BUCKET_NAME \
    --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
    --profile $AWS_PROFILE

echo "✅ Public access configured"

# Step 5: Get S3 Website Endpoint
echo ""
echo "🔗 Step 5: Getting S3 website endpoint..."
WEBSITE_ENDPOINT="${BUCKET_NAME}.s3-website.${REGION}.amazonaws.com"
echo "Website endpoint: http://$WEBSITE_ENDPOINT"

# Step 6: Create CloudFront Distribution
echo ""
echo "☁️  Step 6: Creating CloudFront distribution..."
echo "This may take 5-10 minutes..."

cat > /tmp/cloudfront-config.json <<EOF
{
  "CallerReference": "$(date +%s)",
  "Comment": "$CLOUDFRONT_NAME",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "$BUCKET_NAME-origin",
        "DomainName": "$WEBSITE_ENDPOINT",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only",
          "OriginSslProtocols": {
            "Quantity": 3,
            "Items": ["TLSv1", "TLSv1.1", "TLSv1.2"]
          },
          "OriginReadTimeout": 30,
          "OriginKeepaliveTimeout": 5
        }
      }
    ]
  },
  "DefaultRootObject": "index.html",
  "DefaultCacheBehavior": {
    "TargetOriginId": "$BUCKET_NAME-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "Compress": true,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {
        "Forward": "none"
      }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "SmoothStreaming": false
  },
  "PriceClass": "PriceClass_100",
  "ViewerCertificate": {
    "CloudFrontDefaultCertificate": true,
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
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

DISTRIBUTION_OUTPUT=$(aws cloudfront create-distribution \
    --distribution-config file:///tmp/cloudfront-config.json \
    --profile $AWS_PROFILE \
    --output json)

DISTRIBUTION_ID=$(echo $DISTRIBUTION_OUTPUT | grep -o '"Id": "[^"]*' | grep -o '[^"]*$' | head -1)
DISTRIBUTION_DOMAIN=$(echo $DISTRIBUTION_OUTPUT | grep -o '"DomainName": "[^"]*' | grep -o '[^"]*$' | head -1)

echo "✅ CloudFront distribution created!"
echo ""
echo "=================================================="
echo "🎉 SETUP COMPLETE!"
echo "=================================================="
echo ""
echo "📝 Save these values:"
echo "-------------------"
echo "S3 Bucket: $BUCKET_NAME"
echo "S3 Region: $REGION"
echo "S3 Website Endpoint: http://$WEBSITE_ENDPOINT"
echo "CloudFront Distribution ID: $DISTRIBUTION_ID"
echo "CloudFront Domain: https://$DISTRIBUTION_DOMAIN"
echo ""
echo "🌍 Your website will be available at:"
echo "   https://$DISTRIBUTION_DOMAIN"
echo ""
echo "⏰ CloudFront distribution is being deployed..."
echo "   This takes 5-15 minutes. Check status with:"
echo "   aws cloudfront get-distribution --id $DISTRIBUTION_ID --profile $AWS_PROFILE --query 'Distribution.Status'"
echo ""
echo "📋 Next steps:"
echo "1. Wait for CloudFront status to be 'Deployed'"
echo "2. Run: npm install"
echo "3. Run: ./build-and-deploy-production.sh"
echo ""

# Save configuration for deployment script
cat > /tmp/production-config.sh <<EOF
#!/bin/bash
export PRODUCTION_BUCKET="$BUCKET_NAME"
export PRODUCTION_REGION="$REGION"
export PRODUCTION_DISTRIBUTION_ID="$DISTRIBUTION_ID"
export PRODUCTION_CLOUDFRONT_DOMAIN="$DISTRIBUTION_DOMAIN"
export AWS_PROFILE="$AWS_PROFILE"
EOF

mv /tmp/production-config.sh ./production-config.sh
chmod +x ./production-config.sh

echo "✅ Configuration saved to: ./production-config.sh"
echo ""
