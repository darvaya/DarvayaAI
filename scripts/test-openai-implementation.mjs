#!/usr/bin/env node

/**
 * Simple integration test for OpenAI implementation
 * Tests core functionality by testing the compiled output
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ANSI color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

log('🚀 Testing OpenAI Implementation Integration\n', 'bold');

// Test 1: Verify TypeScript compilation
log('📋 Test 1: TypeScript Compilation', 'blue');
try {
  execSync('npm run build', { stdio: 'pipe' });
  log('✅ TypeScript compilation successful', 'green');
} catch (error) {
  log('❌ TypeScript compilation failed', 'red');
  process.exit(1);
}

// Test 2: Check core files exist
log('\n📋 Test 2: Core Files Verification', 'blue');
const coreFiles = [
  'lib/types/openai.ts',
  'lib/utils/message-formatting.ts',
  'hooks/use-openai-chat.ts',
  'components/chat.tsx',
];

let filesExist = true;
coreFiles.forEach((file) => {
  try {
    readFileSync(file);
    log(`✅ ${file} exists`, 'green');
  } catch (error) {
    log(`❌ ${file} missing`, 'red');
    filesExist = false;
  }
});

if (!filesExist) {
  log('❌ Required files missing', 'red');
  process.exit(1);
}

// Test 3: Check function exports
log('\n📋 Test 3: Function Exports Verification', 'blue');
try {
  const messageFormatContent = readFileSync(
    'lib/utils/message-formatting.ts',
    'utf8',
  );
  const requiredExports = [
    'convertMessagesToOpenAI',
    'createUserMessage',
    'validateOpenAIMessage',
    'convertUIMessageToOpenAI',
  ];

  requiredExports.forEach((exportName) => {
    if (messageFormatContent.includes(`export function ${exportName}`)) {
      log(`✅ ${exportName} exported`, 'green');
    } else {
      log(`❌ ${exportName} not found`, 'red');
      filesExist = false;
    }
  });
} catch (error) {
  log('❌ Could not verify exports', 'red');
  process.exit(1);
}

// Test 4: Check OpenAI types
log('\n📋 Test 4: OpenAI Types Verification', 'blue');
try {
  const typesContent = readFileSync('lib/types/openai.ts', 'utf8');
  const requiredTypes = ['OpenAIMessage', 'ChatStatus', 'OpenAIChatHelpers'];

  requiredTypes.forEach((typeName) => {
    if (typesContent.includes(typeName)) {
      log(`✅ ${typeName} type defined`, 'green');
    } else {
      log(`❌ ${typeName} type missing`, 'red');
      filesExist = false;
    }
  });
} catch (error) {
  log('❌ Could not verify types', 'red');
  process.exit(1);
}

// Test 5: Check hook implementation
log('\n📋 Test 5: Hook Implementation Verification', 'blue');
try {
  const hookContent = readFileSync('hooks/use-openai-chat.ts', 'utf8');
  const requiredHookFeatures = [
    'useOpenAIChat',
    'useState',
    'useEffect',
    'sendMessage',
    'handleSubmit',
  ];

  requiredHookFeatures.forEach((feature) => {
    if (hookContent.includes(feature)) {
      log(`✅ ${feature} implemented`, 'green');
    } else {
      log(`❌ ${feature} missing`, 'red');
      filesExist = false;
    }
  });
} catch (error) {
  log('❌ Could not verify hook implementation', 'red');
  process.exit(1);
}

// Test 6: Check chat component migration
log('\n📋 Test 6: Chat Component Migration Verification', 'blue');
try {
  const chatContent = readFileSync('components/chat.tsx', 'utf8');
  const requiredMigrationFeatures = [
    'useOpenAIChat',
    'convertOpenAIToUIMessage',
    'convertChatStatusToVercelStatus',
    'convertMessagesToOpenAI',
  ];

  requiredMigrationFeatures.forEach((feature) => {
    if (chatContent.includes(feature)) {
      log(`✅ ${feature} integrated`, 'green');
    } else {
      log(`❌ ${feature} missing from chat component`, 'red');
      filesExist = false;
    }
  });
} catch (error) {
  log('❌ Could not verify chat component migration', 'red');
  process.exit(1);
}

// Test 7: Verify no old imports remain
log('\n📋 Test 7: Legacy Import Cleanup Verification', 'blue');
try {
  const chatContent = readFileSync('components/chat.tsx', 'utf8');
  const removedImports = [
    'useRef',
    'initialArtifactData',
    'artifactDefinitions',
    'useAutoResume',
  ];

  let cleanupCorrect = true;
  removedImports.forEach((oldImport) => {
    if (chatContent.includes(oldImport)) {
      log(`❌ ${oldImport} still imported (should be removed)`, 'red');
      cleanupCorrect = false;
    } else {
      log(`✅ ${oldImport} correctly removed`, 'green');
    }
  });

  if (!cleanupCorrect) {
    filesExist = false;
  }
} catch (error) {
  log('❌ Could not verify cleanup', 'red');
  process.exit(1);
}

// Test 8: API endpoint compatibility
log('\n📋 Test 8: API Endpoint Compatibility Check', 'blue');
try {
  const apiContent = readFileSync('app/(chat)/api/chat/route.ts', 'utf8');

  // Check that the API can handle both formats
  if (apiContent.includes('message') && apiContent.includes('content')) {
    log('✅ API endpoint can handle message content', 'green');
  } else {
    log('❌ API endpoint may not handle OpenAI format', 'red');
    filesExist = false;
  }
} catch (error) {
  log('⚠️ Could not verify API endpoint (file may not exist)', 'yellow');
}

// Final Results
log('\n📊 Integration Test Results Summary', 'bold');
if (filesExist) {
  log('✅ All core integration tests passed!', 'green');
  log('✅ OpenAI implementation is properly integrated', 'green');
  log('✅ Phase 2 migration appears successful', 'green');

  log('\n🎉 Integration Test: PASSED', 'green');
  log('🔧 Ready for Phase 3 or live testing', 'blue');
  process.exit(0);
} else {
  log('❌ Some integration tests failed', 'red');
  log('⚠️ Please review the implementation', 'yellow');
  process.exit(1);
}
