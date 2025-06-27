#!/usr/bin/env node

/**
 * Test script for OpenRouter weather tool integration
 *
 * Usage:
 *   node scripts/test-weather-tool.js
 *   node scripts/test-weather-tool.js "What's the weather in Paris?"
 *   node scripts/test-weather-tool.js "Weather in Tokyo" 35.6762 139.6503
 */

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function testWeatherTool(message, latitude, longitude) {
  // Default to NYC coordinates if not provided
  const lat = latitude || '40.7128';
  const lon = longitude || '-74.0060';

  const url = new URL('/api/test-openrouter-tools', baseUrl);
  if (message) url.searchParams.set('message', message);
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lon);

  console.log(`🌤️  Testing Weather Tool`);
  console.log(`📍 Coordinates: ${lat}, ${lon}`);
  console.log(`💬 Message: ${message || 'Default weather query'}`);
  console.log(`🔗 URL: ${url.toString()}\n`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Weather tool test failed:', error);
      return false;
    }

    console.log('✅ Weather tool request successful!');
    console.log(`🤖 Model: ${response.headers.get('X-Test-Model')}`);
    console.log(
      `🔧 Available Tools: ${response.headers.get('X-Available-Tools')}`,
    );
    console.log('\n📡 Streaming response:');
    console.log('═'.repeat(60));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let toolCallsDetected = false;
    let weatherDataReceived = false;
    let accumulatedResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'content':
                process.stdout.write(data.data);
                accumulatedResponse += data.data;
                break;

              case 'tool_call':
                toolCallsDetected = true;
                console.log(`\n🔧 [TOOL CALL] ${data.data.name}`);
                console.log(`📋 Arguments: ${data.data.arguments}`);
                break;

              case 'tool_result':
                console.log(`\n📊 [TOOL RESULT] ID: ${data.data.tool_call_id}`);
                try {
                  const result = JSON.parse(data.data.content);
                  if (result.current?.temperature_2m) {
                    weatherDataReceived = true;
                    console.log(
                      `🌡️  Temperature: ${result.current.temperature_2m}°C`,
                    );
                    console.log(`⏰ Time: ${result.current.time}`);
                  }
                } catch (e) {
                  console.log(
                    `📄 Result: ${data.data.content?.substring(0, 100)}...`,
                  );
                }
                break;

              case 'finish':
                console.log('\n✅ Conversation finished');
                break;

              case 'error':
                console.error(`\n❌ Error: ${data.data.error}`);
                break;
            }
          } catch (e) {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 Test Summary:');
    console.log(`   Tool calls detected: ${toolCallsDetected ? '✅' : '❌'}`);
    console.log(
      `   Weather data received: ${weatherDataReceived ? '✅' : '❌'}`,
    );
    console.log(`   Response length: ${accumulatedResponse.length} characters`);

    if (toolCallsDetected && weatherDataReceived) {
      console.log('\n🎉 Weather tool test PASSED! 🌟');
      return true;
    } else {
      console.log('\n⚠️  Weather tool test incomplete - check logs above');
      return false;
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
    return false;
  }
}

async function testPostMethod(message, latitude, longitude) {
  const url = `${baseUrl}/api/test-openrouter-tools`;

  console.log(`\n🧪 Testing POST method for weather tool`);
  console.log(`🔗 URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message || 'Can you check the weather for me?',
        latitude: Number.parseFloat(latitude || '40.7128'),
        longitude: Number.parseFloat(longitude || '-74.0060'),
        tools: ['getWeather'],
        model: 'chat-model',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ POST weather tool test failed:', error);
      return false;
    }

    console.log('✅ POST weather tool request successful!');
    console.log('\n📡 Streaming response:');
    console.log('─'.repeat(50));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content') {
              process.stdout.write(data.data);
            } else if (data.type === 'tool_call') {
              console.log(`\n🔧 [TOOL] ${data.data.name}`);
            } else if (data.type === 'finish') {
              console.log('\n');
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    console.log('─'.repeat(50));
    console.log(`✅ POST test completed!`);
    return true;
  } catch (error) {
    console.error('❌ POST network error:', error.message);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const message = args[0];
  const latitude = args[1];
  const longitude = args[2];

  console.log('🌤️  OpenRouter Weather Tool Test');
  console.log('='.repeat(60));

  // Check server health
  try {
    const healthCheck = await fetch(`${baseUrl}/api/health`);
    if (!healthCheck.ok) {
      throw new Error('Health check failed');
    }
    console.log('✅ Development server is running');
  } catch (error) {
    console.error('❌ Development server not accessible at', baseUrl);
    console.error('💡 Make sure to run: npm run dev');
    process.exit(1);
  }

  console.log('\n1️⃣ Testing GET method with tool calling...');
  const getSuccess = await testWeatherTool(message, latitude, longitude);

  if (getSuccess) {
    console.log('\n2️⃣ Testing POST method...');
    const postSuccess = await testPostMethod(message, latitude, longitude);

    if (postSuccess) {
      console.log('\n🎊 All weather tool tests passed! 🎊');
      console.log('\n✨ Your OpenAI tool system is working correctly!');
    } else {
      console.log('\n⚠️  GET test passed but POST test failed.');
    }
  } else {
    console.log('\n❌ Weather tool test failed. Check the logs above.');
  }

  console.log('\n📋 Prerequisites checklist:');
  console.log('□ OPENROUTER_API_KEY environment variable is set');
  console.log('□ Development server is running (npm run dev)');
  console.log('□ OpenRouter account has sufficient credits');
  console.log('□ Network connection allows API calls');

  console.log('\n🧪 Manual test URLs:');
  console.log(
    `   GET: ${baseUrl}/api/test-openrouter-tools?message=weather&lat=40.7128&lon=-74.0060`,
  );
  console.log(`   Basic: ${baseUrl}/api/test-openrouter`);
}

main().catch(console.error);
