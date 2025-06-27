import { S3Client } from '@aws-sdk/client-s3';

// Storage configuration interface
export interface StorageConfig {
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsS3Bucket: string;
}

// Get and validate storage configuration
export function getStorageConfig(): StorageConfig {
  const config = {
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    awsS3Bucket: process.env.AWS_S3_BUCKET || '',
  };

  // Validate required environment variables
  const missingVars = [];
  if (!config.awsAccessKeyId) missingVars.push('AWS_ACCESS_KEY_ID');
  if (!config.awsSecretAccessKey) missingVars.push('AWS_SECRET_ACCESS_KEY');
  if (!config.awsS3Bucket) missingVars.push('AWS_S3_BUCKET');

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`,
    );
  }

  return config;
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
  try {
    getStorageConfig();
    return true;
  } catch {
    return false;
  }
}
