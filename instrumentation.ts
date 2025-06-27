// Safer instrumentation with error handling to prevent startup failures
export async function register() {
  try {
    console.log('🚀 Starting instrumentation...');

    if (process.env.NEXT_RUNTIME === 'nodejs') {
      console.log('📡 Loading server Sentry config...');
      await import('./sentry.server.config');
      console.log('✅ Server Sentry loaded');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
      console.log('⚡ Loading edge Sentry config...');
      await import('./sentry.edge.config');
      console.log('✅ Edge Sentry loaded');
    }

    console.log('🎉 Instrumentation completed successfully');
  } catch (error) {
    // Don't let Sentry failure crash the app - this is critical for Railway deployments
    console.error('⚠️ Instrumentation failed (non-fatal):', error);
    console.log('📦 App will continue without Sentry monitoring');
  }
}
