#!/usr/bin/env node

/**
 * Phase 3 Management Script
 * Control and monitor Gemini Flash Lite rollout
 */

const { config } = require('dotenv');
config({ path: '.env.local' });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function printBanner() {
  console.log(colorize('🚀 GEMINI FLASH LITE - PHASE 3 MANAGER', 'cyan'));
  console.log(colorize('═══════════════════════════════════════', 'cyan'));
  console.log('');
}

function printHelp() {
  console.log(colorize('Available Commands:', 'bright'));
  console.log('');
  console.log(
    colorize('📊 status', 'green') +
      '              - View current rollout status',
  );
  console.log(
    colorize('📈 report', 'green') +
      '              - Get detailed performance report',
  );
  console.log(
    colorize('🔧 set-traffic <percent>', 'yellow') +
      ' - Set traffic percentage (0-100)',
  );
  console.log(
    colorize('⚡ enable', 'green') +
      '               - Enable Gemini Flash Lite routing',
  );
  console.log(
    colorize('⏸️  disable', 'red') +
      '              - Disable Gemini Flash Lite routing',
  );
  console.log(
    colorize('🧪 force-gemini', 'blue') +
      '          - Force all requests to Gemini Flash Lite',
  );
  console.log(
    colorize('🔄 reset', 'yellow') +
      '               - Reset to default configuration',
  );
  console.log(
    colorize('📋 schedule', 'cyan') +
      '             - Show recommended rollout schedule',
  );
  console.log('');
  console.log(colorize('Examples:', 'bright'));
  console.log('  node scripts/phase3-manager.js status');
  console.log('  node scripts/phase3-manager.js set-traffic 15');
  console.log('  node scripts/phase3-manager.js report');
}

async function makeRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.API_TOKEN || ''}`,
        ...options.headers,
      },
    });

    if (options.expectText) {
      return await response.text();
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error(
        colorize('❌ Cannot connect to server. Is the app running?', 'red'),
      );
      console.error(colorize(`   Expected server at: ${BASE_URL}`, 'yellow'));
    } else {
      console.error(colorize(`❌ Request failed: ${error.message}`, 'red'));
    }
    process.exit(1);
  }
}

async function getStatus() {
  console.log(colorize('📊 Fetching rollout status...', 'blue'));
  console.log('');

  const data = await makeRequest('/api/gemini-rollout-status');

  const { rolloutConfig, metrics, evaluation, status } = data;

  console.log(colorize('🔧 ROLLOUT CONFIGURATION:', 'bright'));
  console.log(
    `   Enabled: ${rolloutConfig.enabled ? colorize('✅ YES', 'green') : colorize('❌ NO', 'red')}`,
  );
  console.log(
    `   Traffic: ${colorize(rolloutConfig.trafficPercentage + '%', 'cyan')}`,
  );
  console.log(`   Affected: ${rolloutConfig.estimatedUsersAffected}`);
  console.log('');

  console.log(colorize('📈 PERFORMANCE METRICS (24h):', 'bright'));
  console.log(
    `   Total Requests: ${colorize(metrics.totalRequests.toString(), 'cyan')}`,
  );
  console.log(
    `   Gemini Requests: ${colorize(metrics.geminiFlashLiteRequests.toString(), 'cyan')} (${metrics.trafficPercentage.toFixed(1)}%)`,
  );
  console.log(
    `   Avg Latency - Gemini: ${colorize(metrics.averageLatency.geminiFlashLite.toFixed(1) + 'ms', 'cyan')}`,
  );
  console.log(
    `   Avg Latency - Baseline: ${colorize(metrics.averageLatency.baseline.toFixed(1) + 'ms', 'cyan')}`,
  );
  console.log(
    `   Improvement: ${
      metrics.averageLatency.improvement >= 0
        ? colorize(
            `+${metrics.averageLatency.improvement.toFixed(1)}%`,
            'green',
          )
        : colorize(`${metrics.averageLatency.improvement.toFixed(1)}%`, 'red')
    }`,
  );
  console.log('');

  console.log(colorize('💰 COST ANALYSIS:', 'bright'));
  console.log(
    `   Total Saved: ${colorize('$' + metrics.costSavings.totalSaved.toFixed(4), 'green')}`,
  );
  console.log(
    `   Percentage: ${colorize(metrics.costSavings.percentageSaved.toFixed(1) + '%', 'green')}`,
  );
  console.log('');

  console.log(colorize('✅ SUCCESS CRITERIA:', 'bright'));
  const criteria = evaluation.criteriaEvaluation;
  console.log(
    `   Latency: ${criteria.latency.pass ? colorize('✅ PASS', 'green') : colorize('❌ FAIL', 'red')} (${criteria.latency.value.toFixed(1)}%)`,
  );
  console.log(
    `   Cost: ${criteria.cost.pass ? colorize('✅ PASS', 'green') : colorize('❌ FAIL', 'red')} (${criteria.cost.value.toFixed(1)}%)`,
  );
  console.log(
    `   Stability: ${criteria.stability.pass ? colorize('✅ PASS', 'green') : colorize('❌ FAIL', 'red')} (${criteria.stability.value.toFixed(1)}%)`,
  );
  console.log('');

  console.log(colorize('🎯 RECOMMENDATION:', 'bright'));
  console.log(`   ${evaluation.recommendation}`);
  console.log(
    `   Status: ${status === 'PROCEED' ? colorize('🟢 PROCEED', 'green') : colorize('🟡 REVIEW NEEDED', 'yellow')}`,
  );
}

async function getReport() {
  console.log(colorize('📈 Generating detailed report...', 'blue'));
  console.log('');

  const report = await makeRequest('/api/gemini-rollout-status?format=report', {
    expectText: true,
  });
  console.log(report);
}

async function setTrafficPercentage(percentage) {
  const percent = Number.parseInt(percentage);

  if (isNaN(percent) || percent < 0 || percent > 100) {
    console.error(colorize('❌ Invalid percentage. Must be 0-100.', 'red'));
    process.exit(1);
  }

  console.log(colorize(`🔧 Setting traffic to ${percent}%...`, 'blue'));

  const result = await makeRequest('/api/gemini-rollout-status', {
    method: 'POST',
    body: JSON.stringify({ trafficPercentage: percent }),
  });

  console.log(colorize('✅ Traffic percentage updated!', 'green'));
  console.log(`   New config: ${percent}% traffic to Gemini Flash Lite`);
  console.log(`   Updated by: ${result.updatedBy}`);
}

async function enableRollout() {
  console.log(colorize('⚡ Enabling Gemini Flash Lite rollout...', 'blue'));

  await makeRequest('/api/gemini-rollout-status', {
    method: 'POST',
    body: JSON.stringify({ geminiFlashLiteEnabled: true }),
  });

  console.log(colorize('✅ Gemini Flash Lite rollout enabled!', 'green'));
}

async function disableRollout() {
  console.log(colorize('⏸️ Disabling Gemini Flash Lite rollout...', 'yellow'));

  await makeRequest('/api/gemini-rollout-status', {
    method: 'POST',
    body: JSON.stringify({ geminiFlashLiteEnabled: false }),
  });

  console.log(colorize('⏸️ Gemini Flash Lite rollout disabled.', 'yellow'));
  console.log(colorize('   All traffic now uses baseline models.', 'yellow'));
}

async function forceGemini() {
  console.log(
    colorize('🧪 Forcing all requests to Gemini Flash Lite...', 'blue'),
  );

  await makeRequest('/api/gemini-rollout-status', {
    method: 'POST',
    body: JSON.stringify({
      forceModel: 'gemini-flash-lite',
      geminiFlashLiteEnabled: true,
    }),
  });

  console.log(
    colorize('🧪 All requests now forced to Gemini Flash Lite!', 'blue'),
  );
  console.log(
    colorize(
      '   WARNING: This bypasses traffic percentage controls.',
      'yellow',
    ),
  );
}

async function resetConfig() {
  console.log(colorize('🔄 Resetting to default configuration...', 'blue'));

  await makeRequest('/api/gemini-rollout-status', {
    method: 'POST',
    body: JSON.stringify({
      geminiFlashLiteEnabled: true,
      trafficPercentage: 5,
      forceModel: null,
    }),
  });

  console.log(colorize('🔄 Configuration reset to defaults:', 'green'));
  console.log('   - Enabled: true');
  console.log('   - Traffic: 5%');
  console.log('   - Force model: disabled');
}

function showSchedule() {
  console.log(colorize('📋 RECOMMENDED ROLLOUT SCHEDULE:', 'bright'));
  console.log('');

  const schedule = [
    {
      phase: 'Week 1',
      traffic: 5,
      description: 'Initial rollout - monitor closely',
    },
    {
      phase: 'Week 2',
      traffic: 15,
      description: 'Expand if metrics are positive',
    },
    { phase: 'Week 3', traffic: 35, description: 'Broader rollout if stable' },
    {
      phase: 'Week 4',
      traffic: 100,
      description: 'Full rollout if successful',
    },
  ];

  schedule.forEach(({ phase, traffic, description }) => {
    console.log(colorize(`${phase}:`, 'cyan') + ` ${traffic}% traffic`);
    console.log(`   ${description}`);
    console.log('');
  });

  console.log(colorize('💡 Management commands for each phase:', 'bright'));
  console.log('   node scripts/phase3-manager.js set-traffic 5   # Week 1');
  console.log('   node scripts/phase3-manager.js set-traffic 15  # Week 2');
  console.log('   node scripts/phase3-manager.js set-traffic 35  # Week 3');
  console.log('   node scripts/phase3-manager.js set-traffic 100 # Week 4');
}

async function main() {
  printBanner();

  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'status':
      await getStatus();
      break;

    case 'report':
      await getReport();
      break;

    case 'set-traffic':
      if (!arg) {
        console.error(
          colorize('❌ Please specify traffic percentage (0-100)', 'red'),
        );
        process.exit(1);
      }
      await setTrafficPercentage(arg);
      break;

    case 'enable':
      await enableRollout();
      break;

    case 'disable':
      await disableRollout();
      break;

    case 'force-gemini':
      await forceGemini();
      break;

    case 'reset':
      await resetConfig();
      break;

    case 'schedule':
      showSchedule();
      break;

    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      break;
  }
}

main().catch(console.error);
