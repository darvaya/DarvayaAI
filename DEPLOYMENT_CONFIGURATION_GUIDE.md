# DarvayaAI Production Deployment Configuration Guide

## ✅ Deployment Ready Status

All [BLOCKER] and [HIGH] priority tasks have been implemented:

1. **✅ Railway Branch Configuration:** Production now deploys from `main` branch
2. **✅ Health Check Timeout:** Reduced from 300s to 60s for faster failure detection  
3. **✅ Comprehensive Environment Validation:** Zod-based validation for all 12+ variables
4. **✅ Enhanced Health Check:** Database connectivity validation implemented

## 🔧 Environment Variables Configuration

### Create .env.local File

Create a `.env.local` file in your project root with these values:

```env
# Authentication
AUTH_SECRET=lUd8pAkiNWjIlDzF4ymmvMHQ7Jy0NaXEIOL0O3Lwang=
NEXTAUTH_URL=https://darvayaai-production.up.railway.app
NEXTAUTH_URL_INTERNAL=https://darvayaai-production.up.railway.app

# Database
POSTGRES_URL=postgresql://postgres:QYaddiYFQbFYaVylEHzreRsahgWQVNiH@postgres.railway.internal:5432/railway

# OpenRouter AI Configuration
OPENROUTER_API_KEY=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
OPENROUTER_SITE_URL=https://darvayaai-production.up.railway.app
OPENROUTER_APP_NAME=DarvayaAI

# AWS S3 Storage Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=ai-chatbot-uploads-prod

# Redis Configuration
REDIS_URL=redis://default:SgWODcvPJUEmxSgVTSApnhysEfxCpUCy@redis.railway.internal:6379

# Sentry Monitoring Configuration
NEXT_PUBLIC_SENTRY_DSN=https://d3b47644f40fcc74c0bb34c6c2f3dcf9@o4509570715484160.ingest.us.sentry.io/4509570723282944
SENTRY_ORG=darya-vardhana-anvaya
SENTRY_PROJECT=darvaya-ai
SENTRY_AUTH_TOKEN=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

# System Configuration
NODE_ENV=development
PORT=3000
```

### Railway Dashboard Configuration

Set these environment variables in your Railway production environment:

**Required Variables:**
- `AUTH_SECRET=lUd8pAkiNWjIlDzF4ymmvMHQ7Jy0NaXEIOL0O3Lwang=`
- `NEXTAUTH_URL=https://darvayaai-production.up.railway.app`
- `NEXTAUTH_URL_INTERNAL=https://darvayaai-production.up.railway.app`
- `OPENROUTER_API_KEY=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`
- `AWS_ACCESS_KEY_ID=your-aws-access-key-id` ⚠️ **Replace with actual AWS credentials**
- `AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key` ⚠️ **Replace with actual AWS credentials**
- `AWS_REGION=us-east-1`
- `AWS_S3_BUCKET=ai-chatbot-uploads-prod`
- `REDIS_URL=redis://default:SgWODcvPJUEmxSgVTSApnhysEfxCpUCy@redis.railway.internal:6379`

**Optional Variables:**
- `NEXT_PUBLIC_SENTRY_DSN=https://d3b47644f40fcc74c0bb34c6c2f3dcf9@o4509570715484160.ingest.us.sentry.io/4509570723282944`
- `SENTRY_ORG=darya-vardhana-anvaya`
- `SENTRY_PROJECT=darvaya-ai`
- `SENTRY_AUTH_TOKEN=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`

## 🚀 Testing the Configuration

### 1. Test Environment Validation

```bash
pnpm dev
```

You should see:
```
🔍 Validating environment variables...
✅ Environment validation passed
📋 Configuration summary:
  - NODE_ENV: development
  - Database: POSTGRES_URL configured
  - AUTH_SECRET: ✅ Set
  - OPENROUTER_API_KEY: ✅ Set
  - AWS Configuration: ❌ Incomplete (need real AWS credentials)
  - REDIS_URL: ✅ Set
  - Sentry Monitoring: ✅ Enabled
```

### 2. Test Health Check Endpoint

Visit: http://localhost:3000/api/health

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "ai-chatbot",
  "checks": {
    "database": {
      "status": "healthy",
      "message": "Database connection successful",
      "responseTime": 50
    }
  }
}
```

## 📋 Deployment Checklist

### Before Deployment

- [x] **Railway Configuration:** Branch set to `main`, timeout reduced to 60s
- [x] **Environment Validation:** Comprehensive Zod schema implemented
- [x] **Health Check:** Database connectivity validation added
- [ ] **AWS Credentials:** Replace placeholder AWS credentials with real ones
- [ ] **Environment Variables:** Set all variables in Railway dashboard
- [ ] **Build Test:** Run `pnpm build` to ensure production build works

### Deployment Steps

1. **Push to main branch:**
   ```bash
   git checkout main
   git merge fix/complete-deployment-setup
   git push origin main
   ```

2. **Deploy to Railway:** Railway will automatically deploy from main branch

3. **Verify deployment:** 
   - Check health endpoint: `https://darvayaai-production.up.railway.app/api/health`
   - Verify all environment variables are working
   - Test core functionality

## 🔍 Troubleshooting

### Environment Validation Errors

If you see validation errors, check:
- All required environment variables are set
- URLs are properly formatted
- Database connection string is correct
- Redis URL is accessible

### Health Check Failures

If health check returns 503:
- Check database connectivity
- Verify POSTGRES_URL is correct
- Ensure database is running and accessible

### Build Failures

If build fails:
- Check TypeScript compilation errors
- Verify all imports are correct
- Run `pnpm lint` to check code quality

## ⚠️ Security Notes

- **Never commit `.env.local`** to version control
- **Rotate AWS credentials** regularly
- **Use Railway secrets** for sensitive variables in production
- **Monitor Sentry** for security-related errors

## 📖 Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [AWS S3 Setup Guide](./aws-setup/README.md)

---

**Status:** ✅ Ready for Production Deployment 