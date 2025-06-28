import { NextResponse } from 'next/server';

export async function GET() {
  // Ultra-simple health check - just return healthy status
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ai-chatbot',
    version: '1.0.0',
  };

  return NextResponse.json(healthStatus, { status: 200 });
}
