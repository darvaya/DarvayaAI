#!/bin/bash

# IAM User Setup Script for AI Chatbot S3 Access
# This script creates an IAM user with minimal required permissions for S3 access

set -e

USER_NAME="ai-chatbot-s3-user"
POLICY_NAME="AIChatbotS3Policy"

echo "👤 Creating IAM user and policy for AI Chatbot S3 access..."

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "🏷️  AWS Account ID: $ACCOUNT_ID"

# Create IAM policy
echo "📜 Creating IAM policy: $POLICY_NAME"
cat > temp_iam_policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::ai-chatbot-uploads-dev/*",
        "arn:aws:s3:::ai-chatbot-uploads-staging/*",
        "arn:aws:s3:::ai-chatbot-uploads-prod/*"
      ]
    },
    {
      "Sid": "S3BucketList",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::ai-chatbot-uploads-dev",
        "arn:aws:s3:::ai-chatbot-uploads-staging", 
        "arn:aws:s3:::ai-chatbot-uploads-prod"
      ]
    }
  ]
}
EOF

# Create the policy
aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --policy-document file://temp_iam_policy.json \
    --description "Policy for AI Chatbot S3 file upload access"

rm temp_iam_policy.json

# Create IAM user
echo "👤 Creating IAM user: $USER_NAME"
aws iam create-user --user-name "$USER_NAME"

# Attach policy to user
echo "🔗 Attaching policy to user"
aws iam attach-user-policy \
    --user-name "$USER_NAME" \
    --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

# Create access keys
echo "🔑 Creating access keys"
CREDENTIALS=$(aws iam create-access-key --user-name "$USER_NAME" --output json)

ACCESS_KEY_ID=$(echo "$CREDENTIALS" | jq -r '.AccessKey.AccessKeyId')
SECRET_ACCESS_KEY=$(echo "$CREDENTIALS" | jq -r '.AccessKey.SecretAccessKey')

echo ""
echo "✅ IAM user created successfully!"
echo ""
echo "🔐 IMPORTANT: Store these credentials securely!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "AWS_ACCESS_KEY_ID=$ACCESS_KEY_ID"
echo "AWS_SECRET_ACCESS_KEY=$SECRET_ACCESS_KEY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Add these to your environment variables:"
echo "- Railway: Add as secret environment variables"
echo "- GitHub Actions: Add as repository secrets"
echo "- Local development: Add to .env.local"
echo ""
echo "⚠️  These credentials will only be displayed once!" 