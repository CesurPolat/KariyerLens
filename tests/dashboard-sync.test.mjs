import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const source = stripTypeScriptTypes(await readFile(new URL("../src/dashboard/hooks/useDashboard.ts", import.meta.url), "utf8"));
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 100 && !predicate(); i++) await tick();
  assert.ok(predicate());
}
async function harness(reply, enabled = false) {
  const slots = [], effects = [], listeners = new Map(), timers = new Set(), calls = [];
  const ports = [];
  function emitter() { const handlers = new Set(); return { addListener: fn => handlers.add(fn), emit: value => { for (const fn of handlers) fn(value); } }; }
  let index = 0, now = 1_000_000;
  const react = {
    useRef(value) { const i = index++; return slots[i] ??= { current: value }; },
    useState(value) { const i = index++; if (!(i in slots)) slots[i] = value;
      return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useEffect(fn) { index++; if (!effects.length) effects.push(fn); },
  };
  const scope = "a".repeat(64);
  const document = { visibilityState: "visible", addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const context = vm.createContext({ document, Date: { now: () => now },
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
    chrome: { runtime: { connect() {
      const onMessage = emitter(), onDisconnect = emitter(), messages = [];
      const port = { onMessage, onDisconnect, messages, postMessage: m => messages.push(m), disconnect() { onDisconnect.emit(); } };
      ports.push(port); return port;
    }, async sendMessage(message) {
      calls.push(message);
      if (reply) { const custom = await reply(message, calls); if (custom) return custom; }
      return { ok: true, scope, data: { applications: [] }, ...(message.payload.action === "importApplications" ? {
        importSummary: { added: 1, updated: 0, total: 2, nextPage: message.payload.page === 1 ? 2 : null, jobIds: [String(message.payload.page)], detailErrors: 0, warning: "" },
      } : {}) };
    } } },
  });
  const dependencies = {
    react,
    "../../shared/messages.js": { MESSAGE_TYPES: { DASHBOARD: "DASHBOARD" } },
    "./useDashboardAnalysis.js": { useDashboardAnalysis: () => ({ analysis: {}, resetAnalysis() {}, cancelAnalysis() {}, analyze() {} }) },
    "../connection-preference.js": { loadAutoConnectPreference: async () => enabled, saveAutoConnectPreference: async () => {} },
  };
  const module = new vm.SourceTextModule(source, { context });
  await module.link(name => {
    const values = dependencies[name]; assert.ok(values, name);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  const render = () => { index = 0; return module.namespace.useDashboard(); };
  render(); const cleanup = effects[0]();
  return { calls, ports, scope, render, cleanup, document,
    visibility(value) { document.visibilityState = value; listeners.get("visibilitychange")?.(); },
    advance(ms) { now += ms; for (const fn of timers) fn(); },
    get timerCount() { return timers.size; },
  };
}

test("opening dashboard, switching tabs and elapsed time never trigger bulk API requests", async () => {
  const h = await harness();
  try {
    await until(() => h.calls.length === 1 && !h.render().loading);
    assert.equal(h.calls[0].payload.action, "get");
    for (let i = 0; i < 50; i++) { h.visibility("hidden"); h.visibility("visible"); h.advance(300_000); }
    await tick();
    assert.equal(h.calls.length, 1);
    assert.equal(h.timerCount, 0);
    await h.render().act({ action: "importApplications", page: 1, seenJobIds: [] });
    assert.deepEqual(h.calls.map(c => c.payload.action), ["get", "importApplications", "importApplications"]);
    assert.ok(h.calls.slice(1).every(c => c.scope === h.scope));
  } finally { h.cleanup(); }
});

test("successful auto connection cannot restart import/auth/reconnect loop", async () => {
  const h = await harness(message => ({ ok: false, code: message.payload.action === "get" ? "SESSION_NOT_CAPTURED" : "AUTH_REQUIRED", message: "Oturum gerekli" }), true);
  try {
    await until(() => h.ports.length === 1);
    h.ports[0].onMessage.emit({ type: "connected", result: { ok: true, scope: h.scope, data: { applications: [] } } });
    h.ports[0].onMessage.emit({ type: "done", result: { ok: true } });
    await tick();
    assert.equal(h.calls.length, 1);
    await h.render().act({ action: "importApplications", page: 1, seenJobIds: [] });
    for (let i = 0; i < 50; i++) { h.visibility("visible"); h.advance(300_000); }
    await tick();
    assert.equal(h.ports.length, 1);
    assert.equal(h.calls.length, 2);
    await h.render().act({ action: "get" });
    assert.equal(h.ports.length, 1);
  } finally { h.cleanup(); }
});

test("access denial and rate limiting never start automatic reconnection", async () => {
  for (const code of ["ACCESS_DENIED", "RATE_LIMITED"]) {
    const h = await harness(() => ({ ok: false, code, message: "İstek durduruldu" }), true);
    try {
      await until(() => !h.render().loading);
      for (let i = 0; i < 10; i++) { h.visibility("visible"); h.advance(300_000); }
      await tick();
      assert.equal(h.calls.length, 1);
      assert.equal(h.ports.length, 0);
      assert.equal(h.render().error.code, code);
    } finally { h.cleanup(); }
  }
});

