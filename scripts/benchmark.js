'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { resolveLibrary } = require('./load-library');
const root = path.resolve(__dirname, '..');
const baseline = process.argv[2] || path.join(root, 'benchmarks/baseline');

if (baseline === '--help') {
  console.log('Usage: node scripts/benchmark.js [baseline-directory-or-file] [output.json] [rounds=3] [samples=9]');
  process.exit(0);
}

const rounds = Number(process.argv[4] || 3),
  samples = Number(process.argv[5] || 9);

if (!Number.isSafeInteger(rounds) || rounds < 1 || !Number.isSafeInteger(samples) || samples < 1) {
  throw Error('rounds and samples must be positive integers');
}

const timeoutMs = Number(process.env.BENCH_TIMEOUT_MS || 90000);

if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw Error('BENCH_TIMEOUT_MS must be a positive integer');
const libraries = { baseline: resolveLibrary(baseline), optimized: resolveLibrary(root) };

for (const library of Object.values(libraries)) {
  library.entrySHA256 = createHash('sha256').update(fs.readFileSync(library.entry)).digest('hex');
}

const cases = [
  'constant-factory',
  'constant-new',
  'constant-null-name',
  'constant-reuse',
  'fields-0',
  'fields-1',
  'fields-2',
  'fields-2-new',
  'fields-4',
  'fields-8',
  'fields-16',
  'validate-2',
  'normalize-2',
  'normalize-object-4',
  'tracked-2',
  'define-type-2',
  'snapshot-1000',
  'property-read'
];
const selected = process.env.BENCH_CASES ? process.env.BENCH_CASES.split(',').map((name) => name.trim()) : cases;

for (const name of selected) if (!cases.includes(name)) throw Error('Unknown benchmark: ' + name);
const output = path.resolve(
  process.argv[3] || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-benchmark-')), 'results.json')
);

console.log('Benchmark results: ' + output);
const median = (values) => {
  const v = [...values].sort((a, b) => a - b);

  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

const result = {
  status: 'running',
  libraries,
  sourceSHA256: { baseline: null, optimized: null },
  date: new Date().toISOString(),
  node: process.version,
  v8: process.versions.v8,
  cpu: os.cpus()[0]?.model,
  platform: `${os.platform()} ${os.arch()}`,
  rounds,
  samplesPerProcess: samples,
  timeoutMs,
  workerFlags: ['--expose-gc', '--max-semi-space-size=64'],
  runs: [],
  summary: []
};

function writeReport() {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
}

function runWorker(variant, name, count, round) {
  const library = libraries[variant];
  const child = spawnSync(
    process.execPath,
    [
      ...result.workerFlags,
      path.join(__dirname, 'benchmark-worker.js'),
      library.input,
      name,
      String(count),
      String(samples)
    ],
    {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024
    }
  );
  const context = `${variant} ${name} round ${round + 1} (${library.entry})`;
  const diagnostic = [child.stderr, child.stdout].filter(Boolean).join('\n').trim();

  if (child.error?.code === 'ETIMEDOUT') {
    console.error(`${context} timed out after ${timeoutMs} ms${diagnostic ? '\n' + diagnostic : ''}`);

    return { variant, round, case: name, count, samples, status: 'timeout', timeoutMs, diagnostic };
  }

  if (child.error || child.status !== 0) {
    const reason = child.error
      ? child.error.message
      : child.signal
        ? 'signal ' + child.signal
        : 'exit status ' + child.status;

    throw Error(`${context} failed: ${reason}${diagnostic ? '\n' + diagnostic : ''}`);
  }

  let measurement;

  try {
    measurement = JSON.parse(child.stdout);
  } catch (error) {
    throw Error(`${context} returned invalid JSON: ${error.message}${diagnostic ? '\n' + diagnostic : ''}`, {
      cause: error
    });
  }

  const { sourceSHA256, ...timing } = measurement;

  result.sourceSHA256[variant] = { ...result.sourceSHA256[variant], ...sourceSHA256 };

  return { variant, round, status: 'ok', ...timing };
}

try {
  for (const name of selected) {
    const count =
      name === 'snapshot-1000'
        ? 2500
        : name === 'define-type-2'
          ? 10000
          : ['constant-reuse', 'property-read'].includes(name)
            ? 500000
            : 80000;

    for (let round = 0; round < rounds; round++) {
      for (const variant of round % 2 ? ['optimized', 'baseline'] : ['baseline', 'optimized']) {
        result.runs.push(runWorker(variant, name, count, round));
      }
    }

    const summarise = (variant) => {
      const runs = result.runs.filter((run) => run.case === name && run.variant === variant);

      return runs.some((run) => run.status === 'timeout') ? null : median(runs.map((run) => run.medianNs));
    };

    const before = summarise('baseline'),
      after = summarise('optimized');
    const complete = before !== null && after !== null;

    result.summary.push({
      case: name,
      count,
      status: complete ? 'ok' : 'timeout',
      baselineNs: before,
      optimizedNs: after,
      speedup: complete ? before / after : null,
      timeReductionPercent: complete ? (1 - after / before) * 100 : null
    });
    console.log(
      complete
        ? `${name.padEnd(22)} ${before.toFixed(2).padStart(9)} -> ${after.toFixed(2).padStart(9)} ns/op ${(before / after).toFixed(3)}x`
        : `${name.padEnd(22)} comparison unavailable: worker timeout`
    );
    writeReport();
  }

  result.status = result.runs.some((run) => run.status === 'timeout') ? 'timeout' : 'complete';
  writeReport();
} catch (error) {
  result.status = 'failed';
  result.error = error.message;
  writeReport();
  throw error;
}
