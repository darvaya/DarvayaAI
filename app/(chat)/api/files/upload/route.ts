import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';

import { auth } from '@/app/(auth)/auth';

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

    // Add file context to Sentry
    Sentry.getCurrentScope().setContext('file', {
      filename,
      size: file.size,
      type: file.type,
    });

    try {
      const data = await put(`${filename}`, fileBuffer, {
        access: 'public',
      });

      return NextResponse.json(data);
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          operation: 'blob_upload',
          user_id: session.user.id,
        },
        extra: {
          filename,
          fileSize: file.size,
          fileType: file.type,
        },
      });
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
