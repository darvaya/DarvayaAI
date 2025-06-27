#!/usr/bin/env node

const { config } = require('dotenv');

// Load environment variables
config({
  path: '.env.local',
});

console.log('🧪 Testing Guest User Creation...\n');

// Log environment variables (without sensitive data)
console.log('Environment check:');
console.log(
  '- POSTGRES_URL:',
  process.env.POSTGRES_URL ? '✅ Set' : '❌ Missing',
);
console.log(
  '- DATABASE_URL:',
  process.env.DATABASE_URL ? '✅ Set' : '❌ Missing',
);

async function testGuestUserCreation() {
  try {
    // Import after env is loaded
    const { createGuestUser } = require('../lib/db/queries');

    console.log('\n🔄 Creating guest user...');
    const result = await createGuestUser();

    console.log('✅ Guest user created successfully!');
    console.log('📋 Result:', result);
  } catch (error) {
    console.error('❌ Failed to create guest user:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    if (error.originalError) {
      console.error('Original Error:', error.originalError);
    }

    process.exit(1);
  }
}

testGuestUserCreation();
