#!/bin/bash

# AWS S3 Setup Script for AI Chatbot File Storage Migration
# This script creates S3 buckets and configures them for the migration

set -e

# Configuration
AWS_REGION=${AWS_REGION:-"us-east-1"}
BUCKET_PREFIX="ai-chatbot-uploads"
ENVIRONMENTS=("dev" "staging" "prod")

echo "🚀 Setting up S3 buckets for AI Chatbot file storage..."
echo "Region: $AWS_REGION"

# Function to create and configure bucket
setup_bucket() {
    local env=$1
    local bucket_name="${BUCKET_PREFIX}-${env}"
    
    echo "📦 Creating bucket: $bucket_name"
    
    # Create bucket
    if [ "$AWS_REGION" = "us-east-1" ]; then
        aws s3api create-bucket --bucket "$bucket_name" --region "$AWS_REGION"
    else
        aws s3api create-bucket \
            --bucket "$bucket_name" \
            --region "$AWS_REGION" \
            --create-bucket-configuration LocationConstraint="$AWS_REGION"
    fi
    
    # Enable versioning
    echo "🔄 Enabling versioning for $bucket_name"
    aws s3api put-bucket-versioning \
        --bucket "$bucket_name" \
        --versioning-configuration Status=Enabled
    
    # Apply bucket policy for public read access
    echo "🔐 Applying bucket policy for $bucket_name"
    cat > temp_policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${bucket_name}/*"
    }
  ]
}
EOF
    aws s3api put-bucket-policy --bucket "$bucket_name" --policy file://temp_policy.json
    rm temp_policy.json
    
    # Apply CORS configuration
    echo "🌐 Applying CORS configuration for $bucket_name"
    aws s3api put-bucket-cors --bucket "$bucket_name" --cors-configuration file://s3-cors-policy.json
    
    # Configure lifecycle policy to manage storage costs
    echo "♻️ Applying lifecycle policy for $bucket_name"
    cat > temp_lifecycle.json << EOF
{
  "Rules": [
    {
      "ID": "DeleteIncompleteMultipartUploads",
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 1
      }
    },
    {
      "ID": "TransitionToIA",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "uploads/"
      },
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
EOF
    aws s3api put-bucket-lifecycle-configuration \
        --bucket "$bucket_name" \
        --lifecycle-configuration file://temp_lifecycle.json
    rm temp_lifecycle.json
    
    echo "✅ Bucket $bucket_name configured successfully"
    echo "   URL: https://$bucket_name.s3.$AWS_REGION.amazonaws.com"
    echo ""
}

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ AWS CLI not configured. Please run 'aws configure' first."
    exit 1
fi

echo "👤 AWS Account: $(aws sts get-caller-identity --query Account --output text)"
echo "🏷️  User/Role: $(aws sts get-caller-identity --query Arn --output text)"
echo ""

# Create buckets for all environments
for env in "${ENVIRONMENTS[@]}"; do
    setup_bucket "$env"
done

echo "🎉 All S3 buckets created and configured successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Create IAM user: aws iam create-user --user-name ai-chatbot-s3-user"
echo "2. Attach policy: aws iam attach-user-policy --user-name ai-chatbot-s3-user --policy-arn arn:aws:iam::ACCOUNT:policy/AIChatbotS3Policy"
echo "3. Create access keys: aws iam create-access-key --user-name ai-chatbot-s3-user"
echo "4. Configure environment variables in Railway/GitHub"
echo ""
echo "🔧 Environment variables to set:"
echo "AWS_REGION=$AWS_REGION"
echo "AWS_S3_BUCKET_DEV=${BUCKET_PREFIX}-dev"
echo "AWS_S3_BUCKET_STAGING=${BUCKET_PREFIX}-staging" 
echo "AWS_S3_BUCKET_PROD=${BUCKET_PREFIX}-prod" 