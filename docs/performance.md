# Historical performance measurements — 20 September 2026

For current contributor procedures, see the [development guide](../CONTRIBUTING.md); the measurements and reproduction commands below describe the recorded snapshot.

Date: 20 September 2026. The 2.0.0 development snapshot measured below was unpublished. Its baseline was the supplied `go-constant-2.0.0-tests-expanded.zip`; the retained reference source and measurements below preserve the comparison. These optimisations made no public API or declaration changes.

## Changes retained

1. The built-in [`Constant(value, name)`](API.md#constantvalue-name) now uses a fixed-schema constructor.
   This removes generic normaliser dispatch and its temporary `[value, name]`
   array. Name conversion still completes before defining either field;
   descriptors, subclass behaviour, single-argument reuse, and extensibility stay
   unchanged.
2. [`newType()`](migration.md#rename-the-record-type-factory) defines its two known constructor metadata properties separately
   instead of building/enumerating a descriptor map. Generic instance construction,
   validators, options validation, field order, and snapshot copying are unchanged.

## Full comparison

These are measurements on one shared Linux x64 environment, not universal
guarantees. Values below are the median of three fresh-process medians; each
process has nine timed samples. Thus each case has 27 samples per version.
All per-sample data and source SHA-256 values are retained in
[the original measurement data](performance-history/benchmarks-final.json).

| Case | Before (ns/op) | After (ns/op) | Elapsed-time reduction |
| --- | ---: | ---: | ---: |
| `constant-factory` | 314.52 | 283.01 | +10.0% |
| `constant-new` | 327.32 | 289.78 | +11.5% |
| `constant-null-name` | 369.51 | 303.88 | +17.8% |
| `constant-reuse` | 14.78 | 14.20 | +3.9% |
| `fields-0` | 16.62 | 16.08 | +3.2% |
| `fields-1` | 159.65 | 156.97 | +1.7% |
| `fields-2` | 292.46 | 293.73 | -0.4% |
| `fields-2-new` | 271.87 | 276.49 | -1.7% |
| `fields-4` | 565.12 | 559.17 | +1.1% |
| `fields-8` | 1191.54 | 1225.49 | -2.8% |
| `fields-16` | 2382.03 | 2340.48 | +1.7% |
| `validate-2` | 319.81 | 312.36 | +2.3% |
| `normalize-2` | 308.97 | 311.01 | -0.7% |
| `normalize-object-4` | 622.71 | 617.78 | +0.8% |
| `tracked-2` | 315.67 | 310.64 | +1.6% |
| `define-type-2` | 835.39 | 636.86 | +23.8% |
| `snapshot-1000` | 1048.98 | 1074.80 | -2.5% |
| `property-read` | 0.43 | 0.40 | +7.0% |

Positive percentages mean less elapsed time; negative values mean this run
measured a slowdown. Do not interpret unrelated small differences as optimisations.
The property-read control is compiler-foldable and is not a universal read-latency
measurement. Construction rows include allocations and result-array writes.

### Variation and follow-up

An earlier controlled run showed a 13.2% one-field slowdown despite unchanged
instance-initialisation code. A separately recorded follow-up used **five process
pairs with eleven samples each**:
before **151.83 ns/op**, after **151.29 ns/op**
(0.36% less time, effectively unchanged in this experiment).
Both preliminary results remain available in [the preliminary run](performance-history/benchmarks-pre-metadata.json) and
[the follow-up](performance-history/one-field-repeat.json); the follow-up does not erase the initial result.
The final table above was regenerated from the final source after a cold method-
metadata correction for minifier compatibility; source hashes identify the measured runtime. Later tooling rebuilds are not these historical measurements.
The per-process medians overlap, and these local measurements do not establish
a repeatable one-field regression or improvement. Small changes in snapshots,
reuse, and generic construction are not claimed as gains.

Early exploratory default-heap runs were strongly influenced by GC boundaries
for large retained batches. The final comparison uses the same 64-MiB semi-space
limit for both versions and retains **all** returned objects until after timing.
Only the significant comparison and follow-up data are retained; disposable exploratory logs were removed.

## Environment and measurement method

- Node.js **v22.16.0**, V8 **12.4.254.21-node.26**, `linux x64`.
- Host CPU identification: **AMD EPYC 9V74 80-Core Processor**; shared container, not a dedicated benchmark machine.
- Four warmup batches per process. Before each timed sample the previous batch is
  released and an explicit full GC runs outside the measured interval.
- Result arrays and fixture/type setup are excluded, except that type creation is
  intentionally timed in `define-type-2`. GC occurring inside the loop is included.
- The tracked-type fixture is refreshed between samples to prevent registry
  accumulation from biasing later samples.
- Baseline/optimised execution alternates between process pairs. The same worker,
  flags, operation counts and verification assertions are used in both versions.
- No production memory-usage percentage, first-import latency, other-engine result,
  statistical confidence interval, or end-to-end application speedup is claimed.

## Trade-offs and rejected candidates

In that historical build, the minified bundle grew from **3,914 to 4,570 bytes**. With the same gzip settings,
it grows from **1,506 to 1,592 bytes**: **86 additional compressed bytes**.
That is the cost of keeping the small specialised wrapper alongside the generic
constructor. The same-runtime benchmark improvement should not be described as a
bundle-size optimisation.

Descriptor reuse, bulk definition, rest-argument rewrites, unrolling and forwarding
constructors were measured in disposable candidates and not retained. Some were
slower; bulk definitions also alter getter/partial-initialisation ordering.
No `eval`/`new Function`, live snapshot cache, shared mutable descriptor, relaxed
validation, or blanket freezing was introduced.

## Reproduce

The source repository includes the original three runtime reference files and a comparison
runner. Neither the baseline nor benchmark code is shipped in the npm tarball.

```sh
npm run benchmark
# Or select a compatible pre-optimisation source directory:
node scripts/benchmark.js /path/to/reference results.json 3 9
```

See [the benchmark guide](../benchmarks/README.md) for counts, controls, and limitations. Benchmarks are not
brittle timing gates in `npm run verify`.


These historical Linux results explain the retained fast path. They are not
current Windows timings, bundle sizes, or a cross-engine performance guarantee.
