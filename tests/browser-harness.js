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
export function createBrowserHarness(t, {operationTimeout = 30000, cleanupTimeout = 5000, diagnostics = false} = {}) {
  const resources = [], active = new Set();
  let closing, phase, renderer;
  const stamp = label => ({label, start:new Date().toISOString(), clock:performance.now()});
  const elapsed = ({clock, ...entry}) => ({...entry, end:new Date().toISOString(), elapsedMs:Math.round(performance.now() - clock)});
  const report = event => {
    // Diagnostics must never prevent resource teardown or replace an error.
    if (diagnostics) {try {t.diagnostic(`[browser-timing] ${JSON.stringify(event)}`);} catch {}}
  };
  const endPhase = () => {
    if (phase) report({event:'phase-end', ...elapsed(phase)});
    phase = undefined;
  };
  const startPhase = label => {
    if (!diagnostics) return;
    endPhase();
    phase = stamp(label);
    report({event:'phase-start', label, start:phase.start});
  };
  const timed = (label, operation) => {
    if (!diagnostics) return operation();
    const entry = {...stamp(label), phase:phase?.label};
    active.add(entry);
    // Track every bounded operation, but log only failures and phase boundaries,
    // not every mouse move/render. Phase timings include all awaited work.
    return operation().catch(error => {
      report({event:'operation-error', ...elapsed(entry), message:error.message});
      throw error;
    }).finally(() => active.delete(entry));
  };
  async function dispose({label, resource, release, force}) {
    try {await deadline(`${label} cleanup`, () => release(resource), cleanupTimeout);}
    catch (error) {
      if (force) await deadline(`${label} force cleanup`, () => force(resource), cleanupTimeout);
      throw error; // A failed teardown is never a passing test.
    }
  }
  const close = () => closing ??= (async () => {
    startPhase('cleanup');
    try {
      const results = await Promise.allSettled(resources.reverse().map(dispose));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    } finally {endPhase();}
  })();
  const onAbort = () => {
    report({event:'abort', phase:phase?.label, ...(phase ? elapsed(phase) : {}), active:[...active].map(elapsed)});
    void close().catch(error => t.diagnostic(error.message));
  };
  t.signal.addEventListener('abort', onAbort, {once:true});
  t.after(async () => {try {await close();} finally {t.signal.removeEventListener('abort', onAbort);}});
  const harness = {
    phase: startPhase,
    run(label, operation) {
      t.signal.throwIfAborted();
      return timed(label, () => deadline(label, operation, operationTimeout, t.signal));
    },
    captureRenderer(page, selector) {
      if (!diagnostics) return;
      // Query the fixture's existing context, not a separate probe canvas.
      return renderer ??= page.evaluate(selector => {
        const canvas = document.querySelector(selector);
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        if (!gl) return {available:false};
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          available:true, version:gl.getParameter(gl.VERSION),
          vendor:gl.getParameter(gl.VENDOR), renderer:gl.getParameter(gl.RENDERER),
          unmaskedVendor:debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
          unmaskedRenderer:debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null
        };
      }, selector).then(info => {report({event:'renderer', ...info}); return info;});
    },
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
