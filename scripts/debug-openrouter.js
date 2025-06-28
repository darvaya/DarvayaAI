#!/usr/bin/env node

/**
 * Debug OpenRouter Connection
 */

const { config } = require('dotenv');
config({ path: '.env.local' });

async function debugOpenRouter() {
  console.log('🔍 OPENROUTER DEBUG TEST');
  console.log('========================');

  // Check environment
  const apiKey = process.env.OPENROUTER_API_KEY;
  console.log('API Key found:', apiKey ? 'YES' : 'NO');
  console.log('API Key length:', apiKey ? apiKey.length : 0);
  console.log(
    'API Key starts with:',
    apiKey ? `${apiKey.substring(0, 10)}...` : 'N/A',
  );
  console.log('');

  // Test basic fetch to OpenRouter
  console.log('🧪 Testing basic OpenRouter connection...');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'AI Chatbot Debug Test',
      },
    });

    console.log('Response status:', response.status);
    console.log(
      'Response headers:',
      Object.fromEntries(response.headers.entries()),
    );

    if (response.ok) {
      const data = await response.json();
      console.log('✅ OpenRouter connection successful!');
      console.log('Available models:', data.data?.length || 0);

      // Check if Gemini Flash Lite is available
      const geminiModel = data.data?.find(
        (m) => m.id === 'google/gemini-2.0-flash-lite-001',
      );
      console.log('Gemini Flash Lite available:', geminiModel ? 'YES' : 'NO');

      if (geminiModel) {
        console.log('Model details:', {
          id: geminiModel.id,
          name: geminiModel.name,
          pricing: geminiModel.pricing,
        });
      }
    } else {
      const errorText = await response.text();
      console.error('❌ OpenRouter request failed:');
      console.error('Status:', response.status);
      console.error('Error:', errorText);
    }
  } catch (error) {
    console.error('❌ Connection error:', error.message);
  }

  console.log('');
  console.log('🔧 Next steps:');
  console.log('1. Verify API key is valid at https://openrouter.ai');
  console.log('2. Check if account has credits');
  console.log('3. Ensure model access permissions');
}

debugOpenRouter();
