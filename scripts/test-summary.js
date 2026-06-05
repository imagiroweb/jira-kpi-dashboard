#!/usr/bin/env node
/**
 * Lance les tests backend (Jest) et frontend (Vitest), affiche la sortie habituelle,
 * puis imprime un tableau récapitulatif à la fin.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-kpi-test-'));

const useColor = process.stdout.isTTY;
const c = {
  reset: useColor ? '\x1b[0m' : '',
  bold: useColor ? '\x1b[1m' : '',
  green: useColor ? '\x1b[32m' : '',
  red: useColor ? '\x1b[31m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  cyan: useColor ? '\x1b[36m' : '',
  dim: useColor ? '\x1b[2m' : '',
};

/** @typedef {{ label: string, prefix: string, buildArgs: (jsonPath: string) => string[] }} TestPackage */

/** @type {TestPackage[]} */
const PACKAGES = [
  {
    label: 'backend',
    prefix: 'backend',
    buildArgs: (jsonPath) => ['run', 'test', '--prefix', 'backend', '--', '--json', `--outputFile=${jsonPath}`],
  },
  {
    label: 'frontend',
    prefix: 'frontend',
    buildArgs: (jsonPath) => [
      'run',
      'test',
      '--prefix',
      'frontend',
      '--',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${jsonPath}`,
    ],
  },
];

/**
 * @param {string} text
 * @returns {number}
 */
function countWarnings(text) {
  const nodeWarnings = text.match(/\(node:\d+\)\s+(?:\[DEP\d+\]\s+)?(?:Deprecation)?Warning:/gi);
  const vitestWarns = text.match(/^\s*(?:WARN|warn(?:ing)?)\b.*$/gim);
  return (nodeWarnings?.length ?? 0) + (vitestWarns?.length ?? 0);
}

/**
 * @param {string} filePath
 * @returns {{ passed: number, failed: number, skipped: number, total: number, errors: number, success: boolean, durationMs: number | null } | null}
 */
function parseJsonReport(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const passed = raw.numPassedTests ?? 0;
    const failed = raw.numFailedTests ?? 0;
    const skipped = (raw.numPendingTests ?? 0) + (raw.numTodoTests ?? 0);
    const runtimeErrors = raw.numRuntimeErrorTestSuites ?? 0;
    const total = raw.numTotalTests ?? passed + failed + skipped;
    const success = raw.success === true && failed === 0 && runtimeErrors === 0;

    let durationMs = null;
    if (Array.isArray(raw.testResults) && raw.testResults.length > 0) {
      const starts = raw.testResults.map((r) => r.startTime).filter((v) => typeof v === 'number');
      const ends = raw.testResults.map((r) => r.endTime).filter((v) => typeof v === 'number');
      if (starts.length && ends.length) {
        durationMs = Math.max(...ends) - Math.min(...starts);
      }
    }

    return {
      passed,
      failed,
      skipped,
      total,
      errors: failed + runtimeErrors,
      success,
      durationMs,
    };
  } catch {
    return null;
  }
}

/**
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<{ exitCode: number, elapsedMs: number, output: string }>}
 */
function runCommand(cmd, args, cwd) {
  return new Promise((resolve) => {
    const start = Date.now();
    let output = '';

    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(chunk);
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        elapsedMs: Date.now() - start,
        output,
      });
    });

    child.on('error', () => {
      resolve({
        exitCode: 1,
        elapsedMs: Date.now() - start,
        output,
      });
    });
  });
}

/**
 * @typedef {{ label: string, passed: number, failed: number, skipped: number, errors: number, warnings: number, timeMs: number, status: string, ok: boolean }} Row
 */

/**
 * @param {Row[]} rows
 */
function printSummaryTable(rows) {
  const headers = ['Package', 'Passed', 'Failed', 'Skipped', 'Errors', 'Warnings', 'Time', 'Status'];

  const data = rows.map((row) => [
    row.label,
    String(row.passed),
    String(row.failed),
    String(row.skipped),
    String(row.errors),
    String(row.warnings),
    formatDuration(row.timeMs),
    row.status,
  ]);

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...data.map((row) => row[index].length)),
  );

  const pad = (value, width, alignRight = false) =>
    alignRight ? value.padStart(width) : value.padEnd(width);

  const hLine = (left, mid, right) =>
    `${left}${widths.map((w) => '─'.repeat(w + 2)).join(mid)}${right}`;

  const headerLine = headers
    .map((header, index) => ` ${pad(header, widths[index], index > 0 && index < 7)} `)
    .join('│');

  console.log('');
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}${c.cyan}  RÉCAPITULATIF DES TESTS${c.reset}`);
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════════════${c.reset}`);
  console.log(hLine('┌', '┬', '┐'));
  console.log(`│${headerLine}│`);
  console.log(hLine('├', '┼', '┤'));

  for (const row of data) {
    const isTotal = row[0] === 'TOTAL';
    const status = row[7];
    const statusColor =
      status === 'OK' ? c.green : status === 'ÉCHEC' ? c.red : c.yellow;
    const line = row
      .map((cell, index) => {
        if (index === 7) {
          return ` ${statusColor}${pad(cell, widths[index])}${c.reset} `;
        }
        if (isTotal) {
          return ` ${c.bold}${pad(cell, widths[index], index > 0 && index < 7)}${c.reset} `;
        }
        return ` ${pad(cell, widths[index], index > 0 && index < 7)} `;
      })
      .join('│');
    console.log(`│${line}│`);
  }

  console.log(hLine('└', '┴', '┘'));
  console.log('');
}

async function main() {
  /** @type {Row[]} */
  const rows = [];
  let globalExitCode = 0;

  for (const pkg of PACKAGES) {
    const jsonPath = path.join(TMP_DIR, `${pkg.label}.json`);
    const args = pkg.buildArgs(jsonPath);

    console.log(`${c.bold}${c.cyan}▶ Tests ${pkg.label}${c.reset}\n`);

    const result = await runCommand('npm', args, ROOT);
    const parsed = parseJsonReport(jsonPath);
    const warnings = countWarnings(result.output);

    const passed = parsed?.passed ?? 0;
    const failed = parsed?.failed ?? 0;
    const skipped = parsed?.skipped ?? 0;
    const errors = parsed?.errors ?? (result.exitCode !== 0 ? 1 : 0);
    const timeMs = result.elapsedMs;
    const ok = result.exitCode === 0 && (parsed?.success ?? result.exitCode === 0);

    if (!ok) {
      globalExitCode = 1;
    }

    rows.push({
      label: pkg.label,
      passed: typeof passed === 'number' ? passed : 0,
      failed: typeof failed === 'number' ? failed : 0,
      skipped,
      errors: typeof errors === 'number' ? errors : 0,
      warnings,
      timeMs: typeof timeMs === 'number' ? timeMs : result.elapsedMs,
      status: ok ? 'OK' : 'ÉCHEC',
      ok,
    });

    console.log('');
  }

  const total = rows.reduce(
    (acc, row) => ({
      passed: acc.passed + row.passed,
      failed: acc.failed + row.failed,
      skipped: acc.skipped + row.skipped,
      errors: acc.errors + row.errors,
      warnings: acc.warnings + row.warnings,
      timeMs: acc.timeMs + row.timeMs,
    }),
    { passed: 0, failed: 0, skipped: 0, errors: 0, warnings: 0, timeMs: 0 },
  );

  rows.push({
    label: 'TOTAL',
    ...total,
    status: globalExitCode === 0 ? 'OK' : 'ÉCHEC',
    ok: globalExitCode === 0,
  });

  printSummaryTable(rows);

  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // Nettoyage best-effort
  }

  process.exit(globalExitCode);
}

main().catch((error) => {
  console.error(`${c.red}Erreur lors de l'exécution des tests : ${error.message}${c.reset}`);
  process.exit(1);
});
