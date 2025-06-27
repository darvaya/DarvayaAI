'use client';

import * as Sentry from '@sentry/nextjs';

/**
 * Test utility for validating Sentry integration
 * Use only in development environment
 */
export function testSentryIntegration() {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') {
    console.warn(
      'Sentry test should only be run in development on client side',
    );
    return;
  }

  console.log('🧪 Testing Sentry integration...');

  // Test 1: Basic error capture
  try {
    throw new Error('Test error from Sentry integration test');
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        test: 'sentry_integration',
        component: 'test_utility',
      },
      extra: {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      },
    });
    console.log('✅ Test error sent to Sentry');
  }

  // Test 2: Custom message
  Sentry.captureMessage('Sentry integration test message', 'info');
  console.log('✅ Test message sent to Sentry');

  // Test 3: Add breadcrumb
  Sentry.addBreadcrumb({
    category: 'test',
    message: 'Sentry integration test breadcrumb',
    level: 'info',
  });
  console.log('✅ Test breadcrumb added');

  console.log('🎉 Sentry test complete! Check your Sentry dashboard.');
}

/**
 * Test utility for GA4 integration
 */
export function testGA4Integration() {
  if (typeof window === 'undefined') {
    console.warn('GA4 test should only be run on client side');
    return;
  }

  console.log('🧪 Testing GA4 integration...');

  // Test if gtag is available
  if (window.gtag) {
    // Test custom event
    window.gtag('event', 'test_event', {
      event_category: 'integration_test',
      event_label: 'sentry_ga4_setup',
      value: 1,
    });
    console.log('✅ Test event sent to GA4');
    console.log('🎉 GA4 test complete! Check GA4 DebugView.');
  } else {
    console.warn('❌ gtag not found. Check GA4 setup.');
  }
}
