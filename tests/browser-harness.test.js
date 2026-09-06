import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBrowserHarness} from './browser-harness.js';

test('only the known warning-level GPU readback notice is recorded separately from failures', async () => {
  const {recordRendererConsole} = await import('./browser-harness.js');
  assert.equal(typeof recordRendererConsole, 'function');
  const errors = [], driverNotices = [];
  const notice = '[.WebGL-0xabc123]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels';
  const repeated = `${notice} (this message will no longer repeat)`;
  const shader = 'WebGL shader compilation failed';
  const invalid = notice.replace('Performance', 'Error');
  const messages = [['warning', notice], ['warning', repeated], ['error', notice], ['warning', shader], ['error', invalid], ['warning', 'Unhandled rendering warning'], ['error', 'Application failure'], ['log', 'Renderer ready']];
  for (const [type, text] of messages) recordRendererConsole({type:() => type, text:() => text}, errors, driverNotices);
  assert.deepEqual(driverNotices, [notice, repeated]);
  assert.deepEqual(errors, [notice, shader, invalid, 'Unhandled rendering warning', 'Application failure']);
});

test('a real unresolved page.evaluate is bounded without disabling browser assertions', {timeout:30000}, async t => {
  const {chromium} = await import('@playwright/test');
  const owner = createBrowserHarness(t);
  const executablePath = [process.env.ORRERY_BROWSER, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync);
  const browser = await owner.launch(chromium, {executablePath, args:['--enable-unsafe-swiftshader']});
  const raw = await owner.run('browser.newPage', () => browser.newPage());
  assert.equal(await owner.page(raw).evaluate(() => 7), 7);
  const page = createBrowserHarness(t, {operationTimeout:100}).page(raw);
  await assert.rejects(page.evaluate(() => new Promise(() => {})), /page.evaluate.*100ms/);
  await owner.close();
  assert.equal(browser.isConnected(), false);
});

test('an operation deadline rejects with its name before the test timeout', {timeout:1000}, async t => {
  const harness = createBrowserHarness(t, {operationTimeout:25});
  await assert.rejects(harness.run('page.evaluate stuck', () => new Promise(() => {})), /page.evaluate stuck.*25ms/);
});

test('a stalled disposer cannot block another resource or its force cleanup', {timeout:1000}, async () => {
  // Isolate the deliberate cleanup failure from node:test's own after hook.
  const t = {signal:new AbortController().signal, after() {}, diagnostic() {}};
  const harness = createBrowserHarness(t, {cleanupTimeout:25});
  const closed = [];
  await harness.own('server', async () => ({}), () => {closed.push('server');});
  await harness.own('browser', async () => ({}), () => new Promise(() => {}), () => {closed.push('force');});
  await assert.rejects(harness.close(), /browser.*25ms/);
  assert.deepEqual(closed.sort(), ['force', 'server']);
});

for (const phase of ['inside buildStart', 'after buildStart']) for (const cancellation of ['abort', 'timeout']) {
  test(`real Vite startup ${cancellation} ${phase} reclaims a late listener and exits without an outer kill`, () => {
    const root = mkdtempSync(join(tmpdir(), 'orrery-vite-lifecycle-'));
    let result;
    try {
      result = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        import {createServer} from 'vite';
        import {setImmediate} from 'node:timers/promises';
        import {createBrowserHarness} from ${JSON.stringify(new URL('./browser-harness.js', import.meta.url).href)};
        const controller = new AbortController();
        const diagnostics = [];
        const harness = createBrowserHarness({signal:controller.signal, after() {}, diagnostic(message) {diagnostics.push(message);}}, {operationTimeout:${cancellation === 'timeout' ? 1000 : 5000}, cleanupTimeout:2000});
        let enter, release, server, listening;
        const entered = new Promise(resolve => {enter = resolve;});
        const gate = new Promise(resolve => {release = resolve;});
        const acquire = async options => {
          server = await createServer(options);
          const listen = server.listen.bind(server);
          server.listen = (...args) => (listening = listen(...args));
          ${phase === 'after buildStart' ? `
          const container = server.environments.client.pluginContainer;
          const buildStart = container.buildStart.bind(container);
          container.buildStart = async (...args) => {await buildStart(...args); enter(); await gate;};
          ` : ''}
          return server;
        };
        const options = {
          root:${JSON.stringify(root)}, configFile:false, publicDir:false, logLevel:'silent',
          server:{host:'127.0.0.1', port:0}, optimizeDeps:{noDiscovery:true, include:[]},
          plugins:[{name:'gated-startup', async buildStart() {${phase === 'inside buildStart' ? 'enter(); await gate;' : ''}}}]
        };
        const start = harness.vite(acquire, options);
        const rejected = assert.rejects(start, ${cancellation === 'timeout' ? '/Vite listen timed out after 1000ms/' : '/Vite listen: test aborted/'});
        await entered;
        ${cancellation === 'abort' ? 'controller.abort();' : ''}
        await rejected;
        const closing = harness.close();
        assert.equal(harness.close(), closing, 'concurrent close calls share teardown');
        // Watchers must close while buildStart is still blocked. Vite starts
        // its memoized HTTP cleanup before the gate releases and listen runs.
        while (!server.watcher.closed) await setImmediate();
        await setImmediate();
        ${phase === 'after buildStart' ? 'await server.close(); // The memoized Vite close has fully completed before listen resumes.' : ''}
        assert.equal(server.watcher.closed, true);
        assert.equal(server.httpServer.listening, false);
        release();
        await listening;
        await closing;
        await setImmediate();
        assert.equal(server.httpServer.listening, false, 'late Vite listener survived harness.close()');
        assert.equal(server.httpServer.address(), null);
        assert.equal(server.watcher.closed, true);
        assert.deepEqual(diagnostics, []);
        assert.equal(harness.close(), closing, 'repeated close remains idempotent');
        await harness.close();
        console.log('VITE_LATE_LISTENER_CLOSED');
      `], {encoding:'utf8', timeout:8000, killSignal:'SIGKILL', env:{...process.env, NODE_TEST_CONTEXT:''}});
    } finally {rmSync(root, {recursive:true, force:true});}
    assert.equal(result.error, undefined, `Vite leaked handles: ${result.error}\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /VITE_LATE_LISTENER_CLOSED/);
  });
}

// A subprocess is essential: a leaked listener keeps node --test alive even
// after it reports a failed test, which was the original Linux CI symptom.
test('Node test timeout closes owned listeners and exits nonzero without an outer kill', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import test from 'node:test';
    import {createServer} from 'node:http';
    import {createBrowserHarness} from ${JSON.stringify(new URL('./browser-harness.js', import.meta.url).href)};
    test('intentional timeout', {timeout:100}, async t => {
      const harness = createBrowserHarness(t);
      await harness.own('server', async () => {
        const server = createServer();
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        return server;
      }, server => new Promise(resolve => server.close(() => {console.log('SERVER_CLOSED'); resolve();})));
      try {await harness.run('never resolves', () => new Promise(() => {}));}
      finally {await harness.close();}
    });
  `], {encoding:'utf8', timeout:3000, killSignal:'SIGKILL', env:{...process.env, NODE_TEST_CONTEXT:''}});
  assert.equal(result.error, undefined, `test runner leaked handles: ${result.error}\n${result.stdout}`);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /SERVER_CLOSED/);
  assert.match(result.stdout, /intentional timeout/);
});
