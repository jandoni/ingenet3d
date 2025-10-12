#!/bin/bash

# ================================================================================================
# SIMPLIFIED PRODUCTION INFRASTRUCTURE SETUP FOR SPAIN
# ================================================================================================
# This version works with limited IAM permissions
# Uses CloudFront Origin Access Identity instead of public bucket policy
# ================================================================================================

set -e  # Exit on error

# Configuration
BUCKET_NAME="ingenet-production-s3"
REGION="eu-south-2"  # Spain - Aragón
CLOUDFRONT_NAME="Ingenet-Production-Cloudfront"
AWS_PROFILE="ingenet3d"

echo "🚀 Setting up Production Infrastructure in Spain (Simplified)..."
echo "================================================================="
echo "Bucket: $BUCKET_NAME"
echo "Region: $REGION"
echo "CloudFront: $CLOUDFRONT_NAME"
echo "================================================================="
echo ""

# Step 1: Create S3 Bucket
echo "📦 Step 1: Creating S3 bucket..."
if aws s3 ls "s3://$BUCKET_NAME" --profile $AWS_PROFILE 2>&1 | grep -q 'NoSuchBucket'; then
    aws s3 mb "s3://$BUCKET_NAME" --region $REGION --profile $AWS_PROFILE
    echo "✅ Bucket created successfully"
else
    echo "⚠️  Bucket already exists, skipping creation"
fi

# Step 2: Note about Website Hosting
echo ""
echo "📝 Step 2: Note about Static Website Hosting"
echo "   We're using CloudFront as the public endpoint"
echo "   The S3 bucket will remain private (more secure)"
echo "✅ Using CloudFront Origin Access Control"

# Step 3: Create CloudFront Origin Access Control
echo ""
echo "🔐 Step 3: Creating CloudFront Origin Access Control..."

# Create OAC config
cat > /tmp/oac-config.json <<EOF
{
  "Name": "${BUCKET_NAME}-oac",
  "Description": "OAC for ${BUCKET_NAME}",
  "SigningProtocol": "sigv4",
  "SigningBehavior": "always",
  "OriginAccessControlOriginType": "s3"
}
EOF

OAC_OUTPUT=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config file:///tmp/oac-config.json \
    --profile $AWS_PROFILE \
    --output json 2>&1)

if echo "$OAC_OUTPUT" | grep -q "OriginAccessControlAlreadyExists"; then
    echo "⚠️  OAC already exists, fetching existing one..."
    OAC_ID=$(aws cloudfront list-origin-access-controls --profile $AWS_PROFILE --output json | grep -o '"Id": "[^"]*' | grep -o '[^"]*$' | head -1)
else
    OAC_ID=$(echo $OAC_OUTPUT | grep -o '"Id": "[^"]*' | grep -o '[^"]*$')
fi

echo "✅ Origin Access Control ID: $OAC_ID"

# Step 4: Create CloudFront Distribution with OAC
echo ""
echo "☁️  Step 4: Creating CloudFront distribution..."
echo "This may take 5-10 minutes..."

# Get AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile $AWS_PROFILE --query Account --output text)

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
        "DomainName": "$BUCKET_NAME.s3.$REGION.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        },
        "OriginAccessControlId": "$OAC_ID"
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
DISTRIBUTION_ARN=$(echo $DISTRIBUTION_OUTPUT | grep -o '"ARN": "[^"]*' | grep -o '[^"]*$' | head -1)

echo "✅ CloudFront distribution created!"

# Step 5: Update S3 Bucket Policy to allow CloudFront OAC
echo ""
echo "🔐 Step 5: Updating S3 bucket policy for CloudFront access..."

cat > /tmp/bucket-policy-oac.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "$DISTRIBUTION_ARN"
        }
      }
    }
  ]
}
EOF

# Try to set bucket policy (may fail if no permissions)
if aws s3api put-bucket-policy \
    --bucket $BUCKET_NAME \
    --policy file:///tmp/bucket-policy-oac.json \
    --profile $AWS_PROFILE 2>&1; then
    echo "✅ Bucket policy applied successfully"
else
    echo ""
    echo "⚠️  IMPORTANT: Bucket policy could not be set automatically"
    echo ""
    echo "Please add this policy manually in AWS Console:"
    echo "1. Go to: https://s3.console.aws.amazon.com/s3/buckets/$BUCKET_NAME"
    echo "2. Click 'Permissions' tab"
    echo "3. Scroll to 'Bucket policy'"
    echo "4. Click 'Edit' and paste this policy:"
    echo ""
    cat /tmp/bucket-policy-oac.json
    echo ""
    echo "5. Click 'Save changes'"
    echo ""
    read -p "Press Enter when you've added the policy manually..."
fi

echo ""
echo "=================================================="
echo "🎉 SETUP COMPLETE!"
echo "=================================================="
echo ""
echo "📝 Save these values:"
echo "-------------------"
echo "S3 Bucket: $BUCKET_NAME"
echo "S3 Region: $REGION"
echo "CloudFront Distribution ID: $DISTRIBUTION_ID"
echo "CloudFront Domain: https://$DISTRIBUTION_DOMAIN"
echo "Origin Access Control ID: $OAC_ID"
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
export OAC_ID="$OAC_ID"
EOF

mv /tmp/production-config.sh ./production-config.sh
chmod +x ./production-config.sh

echo "✅ Configuration saved to: ./production-config.sh"
echo ""
