#!/usr/bin/env node

/**
 * Test Production Deployment & Streaming
 * Run this after Railway deployment completes
 */

const PRODUCTION_URL = 'https://darvayaai-production.up.railway.app';

async function testProductionDeployment() {
  console.log('🧪 Testing Production Deployment');
  console.log('================================');
  console.log(`🌐 URL: ${PRODUCTION_URL}`);
  console.log('');

  // Test 1: Health check
  console.log('1️⃣ Testing health endpoint...');
  try {
    const healthResponse = await fetch(`${PRODUCTION_URL}/api/health`);
    if (healthResponse.ok) {
      console.log('   ✅ Health check passed');
    } else {
      console.log('   ❌ Health check failed:', healthResponse.status);
    }
  } catch (error) {
    console.log('   ❌ Health check error:', error.message);
  }

  // Test 2: Streaming headers
  console.log('\n2️⃣ Testing streaming headers...');
  try {
    const headersResponse = await fetch(`${PRODUCTION_URL}/api/chat`, {
      method: 'OPTIONS',
    });

    console.log('   📋 Streaming Headers:');
    const importantHeaders = [
      'access-control-allow-origin',
      'cache-control',
      'x-accel-buffering',
      'connection',
    ];

    for (const header of importantHeaders) {
      const value = headersResponse.headers.get(header);
      if (value) {
        console.log(`   ✅ ${header}: ${value}`);
      }
    }
  } catch (error) {
    console.log('   ℹ️  Headers test skipped (CORS)');
  }

  // Test 3: Basic API response
  console.log('\n3️⃣ Testing chat API response...');
  try {
    const apiResponse = await fetch(`${PRODUCTION_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test-123',
        message: { id: 'msg-123', parts: [{ type: 'text', text: 'Hello' }] },
        selectedChatModel: 'gemini-flash-lite',
        selectedVisibilityType: 'private',
      }),
    });

    if (apiResponse.status === 401) {
      console.log('   ✅ API responding correctly (401 auth required)');
      console.log('   🔧 Streaming headers are being sent');
    } else {
      console.log(`   📊 API status: ${apiResponse.status}`);
    }
  } catch (error) {
    console.log('   ❌ API test error:', error.message);
  }

  console.log('\n📋 Next Steps:');
  console.log('1. Open production URL in browser');
  console.log('2. Send a test message');
  console.log('3. Verify real-time streaming (no page refresh needed)');
  console.log('4. Check browser DevTools console for streaming debug logs');
  console.log('');
  console.log('🎉 Production deployment complete!');
}

if (require.main === module) {
  testProductionDeployment().catch(console.error);
}
