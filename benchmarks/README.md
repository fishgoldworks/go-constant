# Repeatable runtime comparison

From the source repository, run:

```sh
npm run benchmark
```

The command compares this working tree with the supplied pre-optimisation
reference under `benchmarks/baseline`. It needs only Node.js, not npm dependencies.
The reference files are excluded from the installable npm package. To compare a
different compatible CommonJS library directory or entry file:

```sh
node scripts/benchmark.js /path/to/reference /path/to/results.json 3 9
node scripts/benchmark.js /path/to/reference/entry.cjs /path/to/results.json 3 9
```

The last two parameters are process pairs per case and timed samples per process.
Directory inputs honour `package.json`'s `main` and Node's `index.js` fallback,
including a `package/` directory beside a separate `package.json`. Explicit files
are loaded directly. The current working tree resolves to its root `index.js`.
Use `BENCH_CASES` (comma-separated case names) for an optional focused run.
Results include every sample, operation count, process medians, source hashes,
Node/V8/CPU identity, and flags. Relative changes are not confidence intervals.

The `libraries` records identify the supplied paths, resolved entries, entry
hashes and versions from metadata in the supplied directory (or the file's
containing directory). Ancestor metadata is excluded to avoid attributing the
current repository's version to an archived baseline. `sourceSHA256` hashes the CommonJS files each
successful worker actually loaded, including transitive dependencies. Its paths
are relative to the supplied directory, or the entry's directory for file inputs;
unloaded files are excluded. A variant with no completed workers has no loaded
source hashes. The historical `baseline` and `optimized` report keys are retained.

Each case/version runs in its own process. Execution order alternates. Workers
warm the tested call site four times, explicitly release and collect the prior
batch outside timing, allocate the result array outside timing, and retain every
result after timing. The 64-MiB semi-space limit is held equal in both versions to
reduce young-generation-GC boundary effects in retained-object comparisons. GC
triggered inside the measured loop remains part of its elapsed time. Verification
assertions, type/fixture setup (except define-type-2), and explicit GC are excluded.
Tracking constructors are recreated between samples to prevent cumulative registry
retention; they are not recreated per timed operation.

The final statistic is the median of per-process medians. The normal construction
cases use 80,000 operations per sample; type definition uses 10,000, snapshot-1000
uses 2,500, and reuse/property-read controls use 500,000. The snapshot case retains
2,500 independent arrays of 1,000 shared record references. It is not a deep-copy
benchmark. The property-read control is deliberately simple and compiler-foldable;
do not interpret it as a universal property-access latency measurement.

This measures warmed, synchronous throughput on one engine, not first-import
latency, peak memory, application throughput, latency percentiles, or all engines.
The benchmark is intentionally not a pass/fail timing gate in `npm run verify`.

By default each run writes results to a fresh operating-system temporary directory
and prints its path. Supply an explicit output path to retain a comparison.

Each worker is bounded to 90 seconds by default; `BENCH_TIMEOUT_MS` sets a positive
integer limit in milliseconds. A timeout is recorded with `status: "timeout"`
and the comparison's ratio is left `null`; other cases continue and the command
can finish successfully. Unexpected worker failures terminate the command with a
nonzero exit and retain the worker's diagnostics, variant, case, round and entry.
Any partial report is marked `failed`. The timeout limits each worker's execution
time; it does not impose a memory limit or define a performance pass/fail threshold. Run `node --test test/tooling/benchmark.test.js` to
check input resolution, report attribution and worker failure handling.
