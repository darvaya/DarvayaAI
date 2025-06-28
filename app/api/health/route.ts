import { NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

export async function GET() {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ai-chatbot',
    checks: {
      database: { status: 'unknown', message: '', responseTime: 0 },
    },
  };

  // Database connectivity check (Phase 1)
  try {
    const startTime = Date.now();

    // Get database connection string
    const connectionString =
      process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      healthStatus.checks.database = {
        status: 'error',
        message: 'Database URL not configured',
        responseTime: 0,
      };
      healthStatus.status = 'unhealthy';
    } else {
      // Create database connection and run simple connectivity check
      const client = postgres(connectionString, {
        connect_timeout: 5, // 5 second timeout for health checks
        idle_timeout: 2, // Quick cleanup for health check connections
        max: 1, // Single connection for health check
      });
      const db = drizzle(client);

      // Simple connectivity test with SELECT 1
      await db.execute(sql`SELECT 1`);

      const responseTime = Date.now() - startTime;
      healthStatus.checks.database = {
        status: 'healthy',
        message: 'Database connection successful',
        responseTime,
      };

      // Close the connection
      await client.end();
    }
  } catch (error) {
    const responseTime =
      Date.now() - (healthStatus.checks.database.responseTime || Date.now());
    healthStatus.checks.database = {
      status: 'error',
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      responseTime,
    };
    healthStatus.status = 'unhealthy';
  }

  // Return appropriate HTTP status code based on health
  const httpStatus = healthStatus.status === 'healthy' ? 200 : 503;

  return NextResponse.json(healthStatus, { status: httpStatus });
}
