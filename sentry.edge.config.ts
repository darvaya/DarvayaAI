// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

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
  });

  console.log('✅ Sentry edge configuration loaded successfully');
} catch (error) {
  // Don't let Sentry initialization failure crash the app
  console.warn('⚠️ Sentry edge initialization failed:', error);
}
