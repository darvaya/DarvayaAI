// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

// Only initialize Sentry if DSN is available
const sentryDsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  'https://d3b47644f40fcc74c0bb34c6c2f3dcf9@o4509570715484160.ingest.us.sentry.io/4509570723282944';

try {
  Sentry.init({
    dsn: sentryDsn,

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,

    // Enable debug in development or when troubleshooting
    debug:
      process.env.NODE_ENV === 'development' ||
      process.env.SENTRY_DEBUG === 'true',

    // Don't fail startup if Sentry has issues
    beforeSend(event) {
      // In development, log to console instead of sending
      if (process.env.NODE_ENV === 'development') {
        console.log('Sentry event:', event);
        return null;
      }
      return event;
    },
  });

  console.log('✅ Sentry server configuration loaded successfully');
} catch (error) {
  // Don't let Sentry initialization failure crash the app
  console.warn('⚠️ Sentry server initialization failed:', error);
}
