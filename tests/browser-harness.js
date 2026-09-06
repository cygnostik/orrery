const readbackNotice = /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/i;

export function recordRendererConsole(message, errors, driverNotices) {
  const text = message.text(), type = message.type();
  // Screenshot readback is synchronous in software rendering. Keep its exact
  // driver notice visible without downgrading errors or unrelated warnings.
  if (type === 'warning' && readbackNotice.test(text)) driverNotices.push(text);
  else if (type === 'warning' || type === 'error') errors.push(text);
}

function deadline(label, operation, milliseconds, signal) {
  signal?.throwIfAborted();
  let timer, onAbort;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
    onAbort = () => reject(new Error(`${label}: test aborted`, {cause:signal.reason}));
    signal?.addEventListener('abort', onAbort, {once:true});
  });
  return Promise.race([Promise.resolve().then(operation), timeout]).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  });
}

async function closeVite(server) {
  server.httpServer?.closeAllConnections();
  try {await server.close();}
  finally {
    // Vite memoizes close(), even if listen() opens its socket afterward.
    if (server.httpServer?.listening) await new Promise((resolve, reject) => {
      server.httpServer.close(error => error ? reject(error) : resolve());
      server.httpServer.closeAllConnections();
    });
  }
}

// node:test timeouts abort t.signal; they do not unwind an in-flight callback.
export function createBrowserHarness(t, {operationTimeout = 30000, cleanupTimeout = 5000} = {}) {
  const resources = [];
  let closing;
  async function dispose({label, resource, release, force}) {
    try {await deadline(`${label} cleanup`, () => release(resource), cleanupTimeout);}
    catch (error) {
      if (force) await deadline(`${label} force cleanup`, () => force(resource), cleanupTimeout);
      throw error; // A failed teardown is never a passing test.
    }
  }
  const close = () => closing ??= (async () => {
    const results = await Promise.allSettled(resources.reverse().map(dispose));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  })();
  const onAbort = () => {void close().catch(error => t.diagnostic(error.message));};
  t.signal.addEventListener('abort', onAbort, {once:true});
  t.after(async () => {try {await close();} finally {t.signal.removeEventListener('abort', onAbort);}});
  const harness = {
    run: (label, operation) => deadline(label, operation, operationTimeout, t.signal),
    async own(label, acquire, release, force) {
      return harness.run(label, async () => {
        const resource = await acquire();
        const entry = {label, resource, release, force};
        // An acquisition can finish after the test has already been aborted.
        if (closing) {await dispose(entry); throw new Error(`${label}: harness already closed`);}
        resources.push(entry);
        return resource;
      });
    },
    async vite(createServer, options) {
      let startup;
      // Own watchers before listen starts; close them even if startup stalls.
      const server = await harness.own('Vite', () => createServer(options), async server => {
        await closeVite(server);
        if (startup) await startup;
      });
      return harness.run('Vite listen', () => {
        if (closing) throw new Error('Vite listen: harness already closed');
        startup = Promise.resolve().then(() => server.listen()).finally(async () => {
          // A deadline/abort only stops waiting. Reclaim the actual late effect,
          // including after the bounded initial cleanup has itself timed out.
          if (closing) await deadline('Vite late startup cleanup', () => closeVite(server), cleanupTimeout);
        });
        return startup;
      });
    },
    async launch(chromium, options) {
      // BrowserServer exposes an owned process-tree kill, unlike Browser.close.
      const server = await harness.own('Chromium', () => chromium.launchServer({...options, timeout:operationTimeout}), server => server.close(), server => server.kill());
      return harness.run('Chromium connect', () => chromium.connect(server.wsEndpoint(), {timeout:operationTimeout}));
    },
    page(page) {
      page.setDefaultTimeout(operationTimeout);
      page.setDefaultNavigationTimeout(operationTimeout);
      const methods = new Set(['evaluate', 'goto', 'route', 'screenshot', 'waitForFunction', 'setViewportSize']);
      const bound = (target, label, names) => new Proxy(target, {
        get(target, key) {
          const value = Reflect.get(target, key);
          if (typeof value !== 'function') return value;
          return (...args) => names.has(key) ? harness.run(`${label}.${key}`, () => value.apply(target, args)) : value.apply(target, args);
        }
      });
      const mouse = bound(page.mouse, 'page.mouse', new Set(['move', 'down', 'up', 'click']));
      const wrapped = bound(page, 'page', methods);
      return new Proxy(wrapped, {
        get(target, key) {
          if (key === 'mouse') return mouse;
          if (key === 'locator') return (...args) => bound(page.locator(...args), 'locator', new Set(['count']));
          return Reflect.get(target, key);
        }
      });
    },
    close
  };
  return harness;
}
