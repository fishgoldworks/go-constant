'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { before, after, test } = require('node:test');
const { chromium, firefox, webkit } = require('playwright');
const spec = require('./distribution-contract');
const directory = process.env.BROWSER_PACKAGE || path.resolve(__dirname, '../../package');
const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
const filenames = [metadata.name + '.js', metadata.name + '.min.js', ...(spec.aliases || [])];
const fixtures = (spec.fixtures || []).map((name) => fs.readFileSync(path.join(__dirname, name), 'utf8')).join('\n');
const contract = '(function ' + spec.check.toString() + ')(Api);\n' + fixtures + '\n' + (spec.extra || '');
const sources = new Map(filenames.map((name) => [name, fs.readFileSync(path.join(directory, 'dist', name), 'utf8')]));
const examples = new Map();
let server, address, exampleBundleUrl;

before(async () => {
  const cdnPrefix = 'https://cdn.jsdelivr.net/npm/' + metadata.name + '@' + metadata.version + '/';

  exampleBundleUrl = cdnPrefix + 'dist/' + metadata.name + '.min.js';
  const readme = fs.readFileSync(path.join(directory, 'README.md'), 'utf8');
  const htmlExamples = [...readme.matchAll(/```html\r?\n([\s\S]*?)```/g)];

  assert.equal(htmlExamples.length, 1, 'README must have one maintained script-tag example');
  const example =
    /<!-- browser-distribution-example -->\s*(?:<!-- prettier-ignore -->\s*)?```html\r?\n([\s\S]*?)```/.exec(readme);

  assert.ok(example, 'Packaged README needs its runnable standalone example');
  const scriptSources = [
    ...example[1].matchAll(/<script\b[^>]*\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi)
  ].map((match) => match[1] ?? match[2] ?? match[3]);

  assert.deepEqual(scriptSources, [exampleBundleUrl], 'README example must load the exact candidate browser bundle');
  consoleResults(example[1]);
  const wrongOutput = example[1].replace(/console\.log\([^\r\n]*\);/, 'console.log("wrong result");');

  assert.notEqual(wrongOutput, example[1], 'The printed-result regression must change the example');
  const wrongExpectation = example[1].replace(
    /(console\.log\([^\r\n]*\);?\s*\/\/ => )([^\r\n]+)/,
    '$1"wrong expected result"'
  );

  assert.notEqual(wrongExpectation, example[1], 'The output-annotation regression must change the example');
  examples.set('/example', example[1]);
  examples.set('/example-wrong-output', wrongOutput);
  examples.set('/example-wrong-expectation', wrongExpectation);
  server = http.createServer((request, response) => {
    const prefix = '/node_modules/' + metadata.name + '/';
    const relative = request.url.startsWith(prefix) ? request.url.slice(prefix.length) : request.url.slice(1);

    if (relative.startsWith('dist/') && sources.has(relative.slice(5))) {
      response.setHeader('content-type', 'text/javascript');
      response.end(sources.get(relative.slice(5)));
    } else if (examples.has(request.url)) {
      response.setHeader('content-type', 'text/html');
      response.end('<!doctype html><html><body>' + examples.get(request.url) + '</body></html>');
    } else if (request.url === '/') {
      response.setHeader('content-type', 'text/html');
      response.end('<!doctype html><html><body></body></html>');
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  address = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

function consoleResults(example) {
  const expected = [...example.matchAll(/^\s*console\.log\([^\r\n]*\);?\s*\/\/ => (.+)$/gm)].map((match) => [
    JSON.parse(match[1])
  ]);

  assert.ok(expected.length, 'README example needs an annotated console result');

  return expected;
}

async function checkReadmeExample(page, endpoint) {
  const errors = [];
  const output = [];
  const expectedOutput = consoleResults(examples.get(endpoint));

  // Fulfil only this candidate's exact URL, including before its first publication.
  await page.route(
    (requestUrl) => requestUrl.href === exampleBundleUrl,
    (route) => route.fulfill({ body: sources.get(metadata.name + '.min.js'), contentType: 'text/javascript' })
  );
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'log') output.push(Promise.all(message.args().map((argument) => argument.jsonValue())));
  });
  await page.goto(address + endpoint);
  assert.deepEqual(errors, []);
  assert.deepEqual(await Promise.all(output), expectedOutput, 'README console output must match the documented result');
}

for (const filename of filenames) {
  test(filename + ': loader contracts and source maps', () => {
    const source = sources.get(filename);

    assert.match(source, /Copyright/i);
    assert.match(source, /MIT/);

    for (const mode of ['commonjs', 'amd', 'global', 'worker']) {
      let exported;
      const context = { URL, URLSearchParams };

      if (mode === 'commonjs') {
        context.module = { exports: {} };
        context.exports = context.module.exports;
      }

      if (mode === 'amd') {
        context.define = (dependencies, factory) => {
          assert.equal(dependencies.length, 0);

          exported = factory();
        };

        context.define.amd = {};
      }

      if (mode === 'worker') {
        context.globalThis = undefined;
        context.self = context;
      }

      vm.runInNewContext(source, context, { filename, timeout: 5000 });
      spec.check(mode === 'commonjs' ? context.module.exports : mode === 'amd' ? exported : context[spec.global]);
    }

    if (!spec.aliases?.includes(filename)) {
      assert.ok(source.includes('sourceMappingURL=' + filename + '.map'));

      const map = JSON.parse(fs.readFileSync(path.join(directory, 'dist', filename + '.map')));

      assert.equal(map.version, 3);
      assert.equal(map.file, filename);
      assert.ok(map.mappings.length > 0);
      assert.ok(map.sources.length > 0);
      assert.equal(map.sources.length, map.sourcesContent.length);
      assert.ok(map.sourcesContent.every((source) => typeof source === 'string' && source.length > 0));
    }
  });
}

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(name + ': standalone bundles, workers and README example', async (t) => {
    const browser = await engine.launch();

    t.diagnostic(name + ' ' + browser.version());
    try {
      for (const filename of filenames)
        await t.test(filename, async () => {
          const page = await browser.newPage();

          try {
            await page.goto(address);
            await page.evaluate(() => {
              globalThis.originalURL = URL;
              globalThis.browserSentinel = 'keep';
              globalThis.originalConstant = function HostConstant() {};

              globalThis.Constant = globalThis.originalConstant;
            });
            await page.addScriptTag({ url: address + '/dist/' + filename });

            assert.equal(await page.evaluate('URL === originalURL && browserSentinel === "keep"'), true);
            assert.equal(await page.evaluate('Constant === originalConstant'), true);

            await page.evaluate(
              '(async()=>{const Api=' + spec.global + ';' + contract + ';' + (spec.pageExtra || '') + '})()'
            );
            const code =
              sources.get(filename) +
              '\n(async()=>{const Api=' +
              spec.global +
              ';' +
              contract +
              ';postMessage({ok:true});})().catch(error=>postMessage({error:String(error.stack||error)}));';

            assert.equal(
              await page.evaluate(async (code) => {
                const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
                const worker = new Worker(url);

                try {
                  return await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(Error('Worker timeout')), 10000);

                    worker.onmessage = ({ data }) => {
                      clearTimeout(timer);
                      data.error ? reject(Error(data.error)) : resolve(data.ok);
                    };

                    worker.onerror = (event) => {
                      clearTimeout(timer);
                      reject(Error(event.message));
                    };
                  });
                } finally {
                  worker.terminate();
                  URL.revokeObjectURL(url);
                }
              }, code),
              true
            );
          } finally {
            await page.close();
          }
        });

      await t.test('documented script-tag example', async () => {
        const page = await browser.newPage();

        try {
          await checkReadmeExample(page, '/example');
        } finally {
          await page.close();
        }
      });

      await t.test('README check rejects a changed printed result', async () => {
        const page = await browser.newPage();

        try {
          await assert.rejects(
            checkReadmeExample(page, '/example-wrong-output'),
            /README console output must match the documented result/
          );
        } finally {
          await page.close();
        }
      });

      await t.test('README check rejects a changed output annotation', async () => {
        const page = await browser.newPage();

        try {
          await assert.rejects(
            checkReadmeExample(page, '/example-wrong-expectation'),
            /README console output must match the documented result/
          );
        } finally {
          await page.close();
        }
      });
    } finally {
      await browser.close();
    }
  });
}
