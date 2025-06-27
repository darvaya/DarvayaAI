# AWS S3 Setup for AI Chatbot File Storage Migration

This directory contains scripts and configuration files for setting up AWS S3 infrastructure for the AI Chatbot file storage migration from Vercel Blob to AWS S3.

## 📋 Prerequisites

1. **AWS CLI installed and configured**
   ```bash
   aws configure
   ```
   
2. **Required AWS permissions**
   - S3 bucket creation and management
   - IAM user and policy creation
   - Your AWS user must have administrative privileges or specific permissions for S3 and IAM

3. **jq installed** (for JSON parsing in scripts)
   ```bash
   # macOS
   brew install jq
   
   # Ubuntu/Debian
   sudo apt install jq
   ```

## 🚀 Setup Process

### Step 1: Create S3 Buckets

```bash
cd aws-setup
chmod +x setup-s3-buckets.sh
./setup-s3-buckets.sh
```

This will create three S3 buckets:
- `ai-chatbot-uploads-dev` (for local development)
- `ai-chatbot-uploads-staging` (for staging environment)
- `ai-chatbot-uploads-prod` (for production)

Each bucket will be configured with:
- ✅ Public read access for uploaded files
- ✅ CORS policy for web uploads
- ✅ Versioning enabled
- ✅ Lifecycle policies for cost optimization

### Step 2: Create IAM User

```bash
chmod +x create-iam-user.sh
./create-iam-user.sh
```

This will:
- ✅ Create an IAM user `ai-chatbot-s3-user`
- ✅ Create and attach a minimal permissions policy
- ✅ Generate access keys
- ✅ Display credentials (store these securely!)

### Step 3: Configure Environment Variables

Add the generated credentials to your environments:

**Railway (Production/Staging):**
```
AWS_ACCESS_KEY_ID=<generated-key>
AWS_SECRET_ACCESS_KEY=<generated-secret>
AWS_REGION=us-east-1
AWS_S3_BUCKET=ai-chatbot-uploads-prod  # or staging
```

**GitHub Actions (CI/CD):**
Add these as repository secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_S3_BUCKET`

**Local Development (.env.local):**
```env
AWS_ACCESS_KEY_ID=<generated-key>
AWS_SECRET_ACCESS_KEY=<generated-secret>
AWS_REGION=us-east-1
AWS_S3_BUCKET=ai-chatbot-uploads-dev
```

## 🔧 Configuration Files

- **`s3-bucket-policy.json`** - Public read access policy
- **`s3-cors-policy.json`** - CORS configuration for web uploads
- **`iam-policy.json`** - Minimal IAM permissions for the application

## 🔐 Security Notes

1. **Least Privilege**: The IAM policy provides minimal required permissions
2. **Access Keys**: Store credentials securely, never commit to git
3. **Public Read**: Only uploaded files are publicly readable, not the bucket itself
4. **CORS**: Configured to allow uploads from any origin (adjust as needed)

## 🧪 Testing

After setup, test the configuration:

```bash
# Test bucket access
aws s3 ls s3://ai-chatbot-uploads-dev/

# Test file upload
echo "test" > test.txt
aws s3 cp test.txt s3://ai-chatbot-uploads-dev/test.txt
rm test.txt

# Test public access
curl https://ai-chatbot-uploads-dev.s3.us-east-1.amazonaws.com/test.txt

# Cleanup test file
aws s3 rm s3://ai-chatbot-uploads-dev/test.txt
```

## 💰 Cost Optimization

The buckets are configured with lifecycle policies:
- Files transition to Standard-IA after 30 days
- Files transition to Glacier after 90 days
- Incomplete multipart uploads are deleted after 1 day

## 🆘 Troubleshooting

**Permission Denied:**
- Ensure your AWS user has S3 and IAM permissions
- Check AWS CLI configuration: `aws sts get-caller-identity`

**Bucket Creation Failed:**
- Bucket names must be globally unique
- Try different region if needed

**Access Key Creation Failed:**
- Check IAM permissions
- Ensure user doesn't already exist

## 🧹 Cleanup (if needed)

To remove all created resources:

```bash
# Delete buckets (will fail if not empty)
aws s3 rb s3://ai-chatbot-uploads-dev --force
aws s3 rb s3://ai-chatbot-uploads-staging --force
aws s3 rb s3://ai-chatbot-uploads-prod --force

# Delete IAM user and policy
aws iam detach-user-policy --user-name ai-chatbot-s3-user --policy-arn arn:aws:iam::ACCOUNT:policy/AIChatbotS3Policy
aws iam delete-access-key --user-name ai-chatbot-s3-user --access-key-id <ACCESS-KEY-ID>
aws iam delete-user --user-name ai-chatbot-s3-user
aws iam delete-policy --policy-arn arn:aws:iam::ACCOUNT:policy/AIChatbotS3Policy
``` 