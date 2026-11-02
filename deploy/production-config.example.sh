# Written by deploy/setup-infrastructure.sh as ./production-config.sh (gitignored).
# Copy this to ./production-config.sh and fill it in only if the
# infrastructure already exists and you are taking over deployments.
export PRODUCTION_BUCKET="ingenet-production-s3"
export PRODUCTION_REGION="eu-south-2"
export PRODUCTION_DISTRIBUTION_ID=""       # CloudFront distribution ID
export PRODUCTION_CLOUDFRONT_DOMAIN=""     # e.g. dxxxxxxxxxxxxx.cloudfront.net
export AWS_PROFILE="ingenet3d"             # an AWS CLI profile with S3 + CloudFront rights
export OAC_ID=""                           # CloudFront Origin Access Control ID
