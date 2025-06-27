#!/usr/bin/env node

const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');

async function testDatabaseConnection() {
  console.log('Testing database connection...');

  try {
    // Use the same environment variable as the app
    const connectionString =
      process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (!connectionString) {
      console.error('❌ No DATABASE_URL or POSTGRES_URL found in environment');
      process.exit(1);
    }

    console.log(
      `🔗 Connecting to database: ${connectionString.replace(/:[^:@]*@/, ':****@')}`,
    );

    const client = postgres(connectionString);
    const db = drizzle(client);

    // Test basic connection
    const result =
      await client`SELECT NOW() as timestamp, version() as version`;
    console.log('✅ Database connection successful!');
    console.log(`📅 Server timestamp: ${result[0].timestamp}`);
    console.log(`🗄️  Server version: ${result[0].version}`);

    // Test if tables exist
    const tables = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    console.log('\n📋 Available tables:');
    tables.forEach((table) => {
      console.log(`  - ${table.table_name}`);
    });

    // Test Chat table specifically
    const chatCount = await client`SELECT COUNT(*) as count FROM "Chat"`;
    console.log(`\n💬 Total chats in database: ${chatCount[0].count}`);

    // Test User table
    const userCount = await client`SELECT COUNT(*) as count FROM "User"`;
    console.log(`👥 Total users in database: ${userCount[0].count}`);

    await client.end();
    console.log('\n✅ Database test completed successfully!');
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testDatabaseConnection();
