// Environment variable validation
interface RequiredEnvVars {
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
  NEXT_PUBLIC_SENTRY_DSN?: string;
  AUTH_SECRET?: string;
}

export function validateEnvironment(): void {
  const env: RequiredEnvVars = {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    AUTH_SECRET: process.env.AUTH_SECRET,
  };

  const missing: string[] = [];
  const warnings: string[] = [];

  // Check database connection
  if (!env.DATABASE_URL && !env.POSTGRES_URL) {
    missing.push('DATABASE_URL or POSTGRES_URL');
  }

  // Check auth secret
  if (!env.AUTH_SECRET) {
    missing.push('AUTH_SECRET');
  }

  // Check Sentry DSN (warning only)
  if (!env.NEXT_PUBLIC_SENTRY_DSN) {
    warnings.push(
      'NEXT_PUBLIC_SENTRY_DSN - Sentry monitoring will be disabled',
    );
  }

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach((envVar) => console.error(`  - ${envVar}`));
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Missing optional environment variables:');
    warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  console.log('✅ Environment validation passed');
}

export function getDatabaseUrl(): string {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    throw new Error('No database URL configured');
  }
  return dbUrl;
}
