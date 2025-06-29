import { S3Client } from '@aws-sdk/client-s3';
import { validateEnvironment, isS3Configured } from '../env-validation';

// Storage configuration interface
export interface StorageConfig {
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsS3Bucket: string;
}

// Check if S3 storage is available
export function isStorageAvailable(): boolean {
  try {
    // Only validate environment when actually needed, not during build
    if (
      typeof window !== 'undefined' ||
      process.env.NODE_ENV === 'development'
    ) {
      const env = validateEnvironment();
      return isS3Configured(env);
    }
    // In production build, check for basic AWS config without full validation
    return !!(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_REGION &&
      process.env.AWS_S3_BUCKET
    );
  } catch {
    return false;
  }
}

// Get and validate storage configuration
export function getStorageConfig(): StorageConfig {
  // Only validate environment when actually needed, not during build
  if (typeof window !== 'undefined' || process.env.NODE_ENV === 'development') {
    const env = validateEnvironment();

    if (!isS3Configured(env)) {
      throw new Error(
        'AWS S3 storage is not properly configured. File upload functionality is disabled.',
      );
    }

    // At this point, we know all values exist due to isS3Configured check
    const awsAccessKeyId = env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = env.AWS_SECRET_ACCESS_KEY;
    const awsS3Bucket = env.AWS_S3_BUCKET;

    if (!awsAccessKeyId || !awsSecretAccessKey || !awsS3Bucket) {
      throw new Error('AWS S3 configuration validation failed');
    }

    return {
      awsRegion: env.AWS_REGION || 'us-east-1',
      awsAccessKeyId,
      awsSecretAccessKey,
      awsS3Bucket,
    };
  } else {
    // In production build, use process.env directly
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsS3Bucket = process.env.AWS_S3_BUCKET;
    const awsRegion = process.env.AWS_REGION;

    if (!awsAccessKeyId || !awsSecretAccessKey || !awsS3Bucket) {
      throw new Error(
        'AWS S3 storage is not properly configured. File upload functionality is disabled.',
      );
    }

    return {
      awsRegion: awsRegion || 'us-east-1',
      awsAccessKeyId,
      awsSecretAccessKey,
      awsS3Bucket,
    };
  }
}

// Create S3 client instance
export function createS3Client(): S3Client {
  const config = getStorageConfig();

  return new S3Client({
    region: config.awsRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    },
  });
}

// Validate storage configuration without throwing
export function validateStorageConfig(): boolean {
  return isStorageAvailable();
}
