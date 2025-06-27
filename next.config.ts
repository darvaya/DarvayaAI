import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
    serverComponentsExternalPackages: [
      'require-in-the-middle',
      'import-in-the-middle',
    ],
  },
  images: {
    remotePatterns: [
      {
        hostname: 'avatar.vercel.sh',
      },
    ],
  },
  serverExternalPackages: ['require-in-the-middle', 'import-in-the-middle'],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  sourcemaps: {
    disable: true,
  },
  disableLogger: true,
});
