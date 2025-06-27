# Environment Setup for S3 Storage

This guide explains how to set up environment variables for the AWS S3 file storage system.

## Required Environment Variables

### Local Development (.env.local)

Create a `.env.local` file in your project root with:

```env
# Database
POSTGRES_URL=your-postgres-connection-string

# Authentication
AUTH_SECRET=your-auth-secret

# Redis (for session storage)
REDIS_URL=your-redis-url

# AWS S3 Storage Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=ai-chatbot-uploads-dev

# Optional: Sentry Error Tracking
SENTRY_DSN=your-sentry-dsn
```

### Production/Staging (Railway)

Set these environment variables in your Railway project:

**Required (Secret Variables):**
- `AWS_ACCESS_KEY_ID` - Your AWS access key ID
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret access key
- `POSTGRES_URL` - Database connection string
- `AUTH_SECRET` - Authentication secret
- `REDIS_URL` - Redis connection string

**Required (Regular Variables):**
- `AWS_REGION` - AWS region (e.g., `us-east-1`)
- `AWS_S3_BUCKET` - S3 bucket name:
  - Production: `ai-chatbot-uploads-prod`
  - Staging: `ai-chatbot-uploads-staging`

### CI/CD (GitHub Actions)

Add these secrets to your GitHub repository:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_S3_BUCKET` (use staging bucket for tests)
- `POSTGRES_URL`
- `AUTH_SECRET`
- `REDIS_URL`

## Environment-Specific Bucket Names

- **Development:** `ai-chatbot-uploads-dev`
- **Staging:** `ai-chatbot-uploads-staging`
- **Production:** `ai-chatbot-uploads-prod`

## AWS IAM User Permissions

Your AWS user should have the following permissions (use the policy in `aws-setup/iam-policy.json`):

- `s3:GetObject` - Read files
- `s3:PutObject` - Upload files
- `s3:DeleteObject` - Delete files (if needed)
- `s3:ListBucket` - List bucket contents

## Validation

The application will validate environment variables on startup. If any required variables are missing, you'll see an error in the logs:

```
Missing required AWS environment variables
```

Check that all required variables are set and accessible to your application. 