#!/usr/bin/env node

// Test Sentry configuration
async function testSentrySetup() {
  console.log('🔍 Testing Sentry Configuration...\n');

  // Check environment variables
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!sentryDsn) {
    console.error('❌ NEXT_PUBLIC_SENTRY_DSN not found in environment');
    console.log('💡 Make sure to set it in .env.local file');
    process.exit(1);
  }

  if (sentryDsn === 'your_sentry_dsn_here') {
    console.error('❌ Sentry DSN is still placeholder value');
    console.log(
      '💡 Replace "your_sentry_dsn_here" with your actual Sentry DSN',
    );
    process.exit(1);
  }

  console.log('✅ NEXT_PUBLIC_SENTRY_DSN found');
  console.log(`🔗 DSN: ${sentryDsn.substring(0, 30)}...`);

  // Test Sentry import and initialization
  try {
    const Sentry = require('@sentry/nextjs');

    Sentry.init({
      dsn: sentryDsn,
      environment: 'test',
      debug: true,
    });

    console.log('✅ Sentry initialized successfully');

    // Test capturing a test message
    Sentry.captureMessage('Test message from setup script', 'info');
    console.log('✅ Test message sent to Sentry');

    // Wait a bit for the message to be sent
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('\n🎉 Sentry setup completed successfully!');
    console.log('🔍 Check your Sentry dashboard for the test message');
    console.log(
      '📊 Dashboard: https://sentry.io/organizations/[your-org]/issues/',
    );
  } catch (error) {
    console.error('❌ Error testing Sentry:', error.message);
    process.exit(1);
  }
}

testSentrySetup();
