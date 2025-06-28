import { z } from 'zod';

// Comprehensive environment variable validation schema
const envSchema = z
  .object({
    // Database Configuration (either DATABASE_URL or POSTGRES_URL required)
    DATABASE_URL: z.string().optional(),
    POSTGRES_URL: z.string().optional(),

    // Authentication Configuration
    AUTH_SECRET: z
      .string()
      .min(1, 'AUTH_SECRET is required for authentication'),
    NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL').optional(),
    NEXTAUTH_URL_INTERNAL: z
      .string()
      .url('NEXTAUTH_URL_INTERNAL must be a valid URL')
      .optional(),

    // OpenRouter AI Configuration
    OPENROUTER_API_KEY: z
      .string()
      .min(1, 'OPENROUTER_API_KEY is required for AI functionality'),
    OPENROUTER_SITE_URL: z
      .string()
      .url('OPENROUTER_SITE_URL must be a valid URL')
      .optional(),
    OPENROUTER_APP_NAME: z.string().optional(),

    // AWS S3 Storage Configuration (optional - file uploads disabled if not configured)
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_REGION: z.string().optional(),
    AWS_S3_BUCKET: z.string().optional(),

    // Redis Configuration
    REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),

    // Sentry Monitoring Configuration
    NEXT_PUBLIC_SENTRY_DSN: z
      .string()
      .url('NEXT_PUBLIC_SENTRY_DSN must be a valid URL')
      .optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),

    // System Configuration
    NODE_ENV: z.enum(['development', 'production', 'test']),
    PORT: z.string().regex(/^\d+$/, 'PORT must be a valid number').optional(),
  })
  .refine((env) => env.DATABASE_URL || env.POSTGRES_URL, {
    message: 'Either DATABASE_URL or POSTGRES_URL must be provided',
    path: ['DATABASE_URL'],
  })
  .refine(
    (env) => {
      // In production, NEXTAUTH_URL is required
      if (env.NODE_ENV === 'production') {
        return env.NEXTAUTH_URL && env.NEXTAUTH_URL_INTERNAL;
      }
      return true;
    },
    {
      message:
        'NEXTAUTH_URL and NEXTAUTH_URL_INTERNAL are required in production',
      path: ['NEXTAUTH_URL'],
    },
  );

export type Environment = z.infer<typeof envSchema>;

// Helper function to check if AWS S3 is properly configured
export function isS3Configured(env: Environment): boolean {
  return !!(
    env.AWS_ACCESS_KEY_ID &&
    env.AWS_SECRET_ACCESS_KEY &&
    env.AWS_REGION &&
    env.AWS_S3_BUCKET &&
    env.AWS_ACCESS_KEY_ID !== 'your-aws-access-key-id' &&
    env.AWS_SECRET_ACCESS_KEY !== 'your-aws-secret-access-key'
  );
}

export function validateEnvironment(): Environment {
  console.log('🔍 Validating environment variables...');

  try {
    const env = envSchema.parse(process.env);

    // Log successful validation with masked sensitive values
    console.log('✅ Environment validation passed');
    console.log('📋 Configuration summary:');
    console.log(`  - NODE_ENV: ${env.NODE_ENV}`);
    console.log(
      `  - Database: ${env.DATABASE_URL ? 'DATABASE_URL' : 'POSTGRES_URL'} configured`,
    );
    console.log(
      `  - AUTH_SECRET: ${env.AUTH_SECRET ? '✅ Set' : '❌ Missing'}`,
    );
    console.log(
      `  - OPENROUTER_API_KEY: ${env.OPENROUTER_API_KEY ? '✅ Set' : '❌ Missing'}`,
    );

    const s3Configured = isS3Configured(env);
    console.log(
      `  - AWS Configuration: ${s3Configured ? '✅ Complete' : '⚠️ Incomplete (file uploads disabled)'}`,
    );
    console.log(`  - REDIS_URL: ${env.REDIS_URL ? '✅ Set' : '❌ Missing'}`);
    console.log(
      `  - Sentry Monitoring: ${env.NEXT_PUBLIC_SENTRY_DSN ? '✅ Enabled' : '⚠️ Disabled'}`,
    );

    if (!s3Configured) {
      console.log(
        '📝 Note: File upload functionality is disabled until AWS S3 credentials are properly configured',
      );
    }

    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      console.error('');
      console.error('Missing or invalid environment variables:');

      error.errors.forEach((err) => {
        const path = err.path.join('.');
        console.error(`  - ${path}: ${err.message}`);
      });

      console.error('');
      console.error('💡 Required environment variables checklist:');
      console.error('   Authentication:');
      console.error('     - AUTH_SECRET (required)');
      console.error('     - NEXTAUTH_URL (required in production)');
      console.error('     - NEXTAUTH_URL_INTERNAL (required in production)');
      console.error('   Database:');
      console.error('     - POSTGRES_URL or DATABASE_URL (one required)');
      console.error('   AI Services:');
      console.error('     - OPENROUTER_API_KEY (required)');
      console.error('   Caching:');
      console.error('     - REDIS_URL (required)');
      console.error('   File Storage (optional):');
      console.error('     - AWS_ACCESS_KEY_ID');
      console.error('     - AWS_SECRET_ACCESS_KEY');
      console.error('     - AWS_REGION');
      console.error('     - AWS_S3_BUCKET');
      console.error('   Monitoring (optional):');
      console.error('     - NEXT_PUBLIC_SENTRY_DSN');
      console.error('     - SENTRY_ORG');
      console.error('     - SENTRY_PROJECT');
      console.error('     - SENTRY_AUTH_TOKEN');
      console.error('');
      console.error(
        '📖 See docs/environment-setup.md for detailed setup instructions',
      );

      throw new Error(
        `Environment validation failed: ${error.errors.length} error(s) found`,
      );
    }

    throw error;
  }
}

export function getDatabaseUrl(): string {
  const env = validateEnvironment();
  const dbUrl = env.DATABASE_URL || env.POSTGRES_URL;
  if (!dbUrl) {
    throw new Error('No database URL configured');
  }
  return dbUrl;
}

// Note: Environment validation is called explicitly where needed
// rather than at startup to prevent crashes
