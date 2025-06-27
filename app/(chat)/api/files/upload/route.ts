import { Upload } from '@aws-sdk/lib-storage';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';

import { auth } from '@/app/(auth)/auth';
import {
  createS3Client,
  getStorageConfig,
  validateStorageConfig,
} from '@/lib/storage/s3-client';

// Use Blob instead of File since File is not available in Node.js environment
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: 'File size should be less than 5MB',
    })
    // Update the file type based on the kind of files you want to accept
    .refine((file) => ['image/jpeg', 'image/png'].includes(file.type), {
      message: 'File type should be JPEG or PNG',
    }),
});

export async function POST(request: Request) {
  // Add Sentry instrumentation
  Sentry.getCurrentScope().setTag('api.route', 'file-upload');

  // Validate required environment variables
  if (!validateStorageConfig()) {
    console.error('Missing required AWS environment variables');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Set user context for better error tracking
  Sentry.setUser({
    id: session.user.id,
    email: session.user.email || undefined,
  });

  if (request.body === null) {
    return new Response('Request body is empty', { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(', ');

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Get filename from formData since Blob doesn't have name property
    const filename = (formData.get('file') as File).name;
    const fileBuffer = await file.arrayBuffer();

    // Generate unique key with timestamp and user ID for better organization
    const timestamp = Date.now();
    const key = `uploads/${session.user.id}/${timestamp}-${filename}`;

    // Get storage configuration
    const config = getStorageConfig();
    const s3Client = createS3Client();

    // Add file context to Sentry
    Sentry.getCurrentScope().setContext('file', {
      filename,
      size: file.size,
      type: file.type,
      key,
    });

    try {
      // Use multipart upload for better reliability and progress tracking
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: config.awsS3Bucket,
          Key: key,
          Body: Buffer.from(fileBuffer),
          ContentType: file.type,
          ACL: 'public-read',
          Metadata: {
            'uploaded-by': session.user.id,
            'uploaded-at': new Date().toISOString(),
            'original-filename': filename,
          },
        },
      });

      await upload.done();

      // Construct the public URL - compatible with existing frontend expectations
      const fileUrl = `https://${config.awsS3Bucket}.s3.${config.awsRegion}.amazonaws.com/${key}`;

      // Return the same format as Vercel Blob for compatibility
      const responseData = {
        url: fileUrl,
        pathname: filename, // Keep for frontend compatibility
        contentType: file.type,
        size: file.size,
        // Additional metadata that could be useful
        downloadUrl: fileUrl,
        key: key,
      };

      return NextResponse.json(responseData);
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          operation: 's3_upload',
          user_id: session.user.id,
        },
        extra: {
          filename,
          fileSize: file.size,
          fileType: file.type,
          key,
          bucket: config.awsS3Bucket,
          region: config.awsRegion,
        },
      });
      console.error('S3 upload error:', error);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        operation: 'file_processing',
        user_id: session.user.id,
      },
    });
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 },
    );
  }
}
