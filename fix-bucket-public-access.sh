#!/bin/bash

# ================================================================================================
# FIX BUCKET PUBLIC ACCESS SETTINGS
# ================================================================================================
# This script disables "Block Public Access" for the production bucket
# This is required to allow public website hosting
# ================================================================================================

set -e  # Exit on error

BUCKET_NAME="ingenet-production-s3"
AWS_PROFILE="ingenet3d"

echo "🔓 Fixing Block Public Access settings..."
echo "=================================================="
echo "Bucket: $BUCKET_NAME"
echo ""

# Check if bucket exists
if ! aws s3 ls "s3://$BUCKET_NAME" --profile $AWS_PROFILE 2>&1 >/dev/null; then
    echo "✅ Bucket doesn't exist yet, will be created with correct settings"
    echo "   Run ./setup-production-infrastructure.sh again"
    exit 0
fi

echo "📝 Current Block Public Access settings:"
aws s3api get-public-access-block --bucket $BUCKET_NAME --profile $AWS_PROFILE 2>&1 || echo "  No settings found (that's okay)"

echo ""
echo "🔧 Disabling Block Public Access for bucket..."

# Disable Block Public Access for this bucket
aws s3api put-public-access-block \
    --bucket $BUCKET_NAME \
    --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
    --profile $AWS_PROFILE

echo "✅ Block Public Access disabled for bucket"

echo ""
echo "📝 New settings:"
aws s3api get-public-access-block --bucket $BUCKET_NAME --profile $AWS_PROFILE

echo ""
echo "=================================================="
echo "✅ FIXED!"
echo "=================================================="
echo ""
echo "Now run the setup script again:"
echo "  ./setup-production-infrastructure.sh"
echo ""
