'use strict';

// One library/case per process, so alternate implementations do not share JIT feedback.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { loadLibrary, hashSources } = require('./load-library');
const library = loadLibrary(process.argv[2]);
const Constant = library.api;
const name = process.argv[3];
const count = Number(process.argv[4] || 80000);
const samples = Number(process.argv[5] || 9);

assert.ok(Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(samples) && samples > 0);
const { run, consume, setup } = require('../benchmarks/cases')(Constant, name, count);
const keep = (results) => {
  globalThis.benchmarkSink = results;
};

// Warm the exact call site. Warmup work and explicit GCs are outside measured time.
function loop(out) {
  for (let i = 0; i < out.length; i++) out[i] = run(i);
}

for (let i = 0; i < 4; i++) {
  setup();
  const out = new Array(Math.min(count, 12000));

  loop(out);
  keep(out);
}

const measurements = [];

for (let sample = 0; sample < samples; sample++) {
  globalThis.benchmarkSink = null;
  setup();
  global.gc?.();
  const out = new Array(count);
  const start = performance.now();

  loop(out);
  const elapsed = performance.now() - start;

  consume(out);
  keep(out);
  measurements.push((elapsed * 1e6) / count);
}

const sorted = [...measurements].sort((a, b) => a - b);
const median =
  sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

console.log(
  JSON.stringify({
    case: name,
    count,
    samples,
    medianNs: median,
    samplesNs: measurements,
    sourceSHA256: hashSources(library)
  })
);
