import test from "node:test";
import assert from "node:assert/strict";
import { attachDashboardAutoConnect } from "../src/background/dashboard-auto-connect.ts";
import { captureKariyerSession } from "../src/shared/kariyer/kariyer-session.ts";

const candidate = "https://candidatewebapigw.kariyer.net";
const auth = { ok: false, code: "SESSION_NOT_CAPTURED", message: "Missing session" };
const connected = { ok: true, scope: "a".repeat(64), data: { applications: [] } };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 100 && !predicate(); i++) await tick(); assert.ok(predicate()); }
function emitter() {
 const listeners = new Set();
 return { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); }, emit(value) { for (const fn of [...listeners]) fn(value); }, get size() { return listeners.size; } };
}
function capture(tabId = 20, headers = [{ name: "Authorization", value: "Bearer test-session" }], origin = candidate, initiator = "https://www.kariyer.net") {
 captureKariyerSession({ tabId, url: origin + "/request", initiator, requestHeaders: headers });
}
function setup(responses = [auth, connected], overrides = {}) {
 const events = [], created = [], removed = [], activated = [], focused = [], signals = [];
 const onRemoved = emitter(), onMessage = emitter(), onDisconnect = emitter();
 let calls = 0;
 globalThis.chrome = {
  tabs: { onRemoved,
   async create(options) { created.push(options); return { id: 20 }; },
   async get(id) { return { id, url: "https://www.kariyer.net/", windowId: 5 }; },
   async remove(id) { removed.push(id); onRemoved.emit(id); },
   async update(id, options) { activated.push({ id, options }); return { id, windowId: 5 }; },
   ...overrides,
  },
  windows: { async update(id, options) { focused.push({ id, options }); } },
 };
 const port = { sender: { tab: { id: 3 } }, onMessage, onDisconnect, postMessage(event) { events.push(event); } };
 attachDashboardAutoConnect(port, async signal => {
  signals.push(signal);
  const response = responses[Math.min(calls++, responses.length - 1)];
  return typeof response === "function" ? response(signal) : response;
 });
 return { events, created, removed, activated, focused, signals, onRemoved, send: value => onMessage.emit(value), disconnect: () => onDisconnect.emit(), get calls() { return calls; } };
}

test("an existing valid session connects without creating a tab and waits for the UI acknowledgement", async () => {
 const h = setup([connected]); h.send({ type: "start" });
 await until(() => h.events.some(e => e.type === "connected"));
 assert.equal(h.created.length, 0); assert.equal(h.activated.length, 0);
 h.send({ type: "applied" }); await until(() => h.events.some(e => e.type === "done"));
 assert.equal(h.removed.length, 0);
 assert.deepEqual(h.activated, [{ id: 3, options: { active: true } }]);
 assert.deepEqual(h.focused, [{ id: 5, options: { focused: true } }]);
 assert.equal(h.onRemoved.size, 0);
});

test("only a candidate Bearer from the owned tab triggers verification and closing", async () => {
 const h = setup(); h.send({ type: "start" }); h.send({ type: "start" });
 await until(() => h.created.length === 1); await tick();
 assert.deepEqual(h.created, [{ url: "https://www.kariyer.net/", active: true }]);
 capture(1); capture(20, [{ name: "ApiKey", value: "key" }]);
 capture(20, undefined, "https://candidatesearchapigateway.kariyer.net");
 capture(20, undefined, candidate, "https://evil.test");
 await tick(); assert.equal(h.calls, 1);
 capture(); await until(() => h.events.some(e => e.type === "connected"));
 assert.equal(h.removed.length, 0);
 assert.doesNotMatch(JSON.stringify(h.events), /Bearer|test-session|ApiKey/);
 h.send({ type: "applied" }); await until(() => h.events.some(e => e.type === "done"));
 assert.deepEqual(h.removed, [20]); assert.equal(h.onRemoved.size, 0);
});

test("failed account verification ignores repeated rejected tokens and retries only a new token", async () => {
 const h = setup([auth, { ok: false, code: "AUTH_REQUIRED", message: "Invalid session" }, connected]);
 h.send({ type: "start" }); await until(() => h.created.length); await tick();
 capture(); await until(() => h.calls === 2); await tick();
 assert.equal(h.removed.length, 0); assert.ok(!h.events.some(e => e.type === "connected"));
 for (let i = 0; i < 50; i++) capture();
 await tick(); assert.equal(h.calls, 2);
 capture(20, [{ name: "Authorization", value: "Bearer refreshed-session" }]);
 await until(() => h.events.some(e => e.type === "connected"));
 h.disconnect(); assert.equal(h.removed.length, 0);
});

test("cancellation aborts in-flight verification and ignores its late success", async () => {
 let resolve;
 const h = setup([auth, () => new Promise(done => { resolve = done; })]);
 h.send({ type: "start" }); await until(() => h.created.length); await tick();
 capture(); await until(() => resolve);
 h.send({ type: "cancel" }); resolve(connected); await tick();
 assert.equal(h.events.at(-1).result.code, "CANCELLED");
 assert.equal(h.signals.at(-1).aborted, true); assert.equal(h.removed.length, 0);
 capture(); await tick(); assert.equal(h.calls, 2); assert.equal(h.onRemoved.size, 0);
});

test("another tab changing the account during verification cannot complete the owned attempt", async () => {
 let resolve;
 const h = setup([auth, () => new Promise(done => { resolve = done; }), connected]);
 h.send({ type: "start" }); await until(() => h.created.length); await tick();
 capture(); await until(() => resolve);
 capture(1, [{ name: "Authorization", value: "Bearer another-account" }]);
 resolve(connected); await tick();
 assert.ok(!h.events.some(e => e.type === "connected")); assert.equal(h.removed.length, 0);
 capture(); await until(() => h.events.some(e => e.type === "connected")); h.disconnect();
});

test("queued verification is serialized and never substitutes a later token from another tab", async () => {
 let resolve;
 const h = setup([auth, () => new Promise(done => { resolve = done; }), connected]);
 h.send({ type: "start" }); await until(() => h.created.length); await tick();
 capture(); await until(() => resolve);
 capture(20, [{ name: "Authorization", value: "Bearer owned-refresh" }]);
 capture(1, [{ name: "Authorization", value: "Bearer other-refresh" }]);
 resolve(auth); await tick();
 assert.equal(h.calls, 2); assert.ok(!h.events.some(e => e.type === "connected"));
 capture(); await until(() => h.events.some(e => e.type === "connected")); h.disconnect();
});

test("disconnect and manual tab closure release listeners without closing another tab", async () => {
 for (const mode of ["disconnect", "owned", "dashboard"]) {
  const h = setup(); h.send({ type: "start" }); await until(() => h.created.length); await tick();
  if (mode === "disconnect") h.disconnect(); else h.onRemoved.emit(mode === "owned" ? 20 : 3);
  capture(); await tick(); assert.equal(h.calls, 1); assert.equal(h.removed.length, 0); assert.equal(h.onRemoved.size, 0);
 }
});

test("timeout stops observation and leaves the tab open", async t => {
 t.mock.timers.enable({ apis: ["setTimeout"] });
 const h = setup(); h.send({ type: "start" }); await until(() => h.created.length); await tick();
 t.mock.timers.tick(120_000);
 assert.equal(h.events.at(-1).result.code, "CONNECTION_TIMEOUT");
 capture(); await tick(); assert.equal(h.calls, 1); assert.equal(h.removed.length, 0); assert.equal(h.onRemoved.size, 0);
});

test("requests captured during tab creation are not missed", async () => {
 const h = setup([auth, connected], { async create() { capture(); return { id: 20 }; } });
 h.send({ type: "start" }); await until(() => h.events.some(e => e.type === "connected"));
 assert.equal(h.calls, 2); h.disconnect();
});

test("cancellation during tab creation leaves the eventual tab open", async () => {
 let resolve;
 const h = setup([auth], { create: () => new Promise(done => { resolve = done; }) });
 h.send({ type: "start" }); await until(() => resolve); h.send({ type: "cancel" });
 resolve({ id: 20 }); await tick(); capture(); await tick();
 assert.equal(h.calls, 1); assert.equal(h.removed.length, 0);
});

test("non-auth errors and tab creation failures end the attempt without deletion", async () => {
 for (const make of [() => setup([{ ok: false, code: "NETWORK_ERROR", message: "Offline" }]), () => setup([auth], { async create() { throw new Error("Failed"); } })]) {
  const h = make();
  h.send({ type: "start" }); await until(() => h.events.some(e => e.type === "done"));
  assert.equal(h.events.at(-1).result.ok, false); assert.equal(h.removed.length, 0);
 }
});

test("a tab navigated away from Kariyer.net is not closed", async () => {
 const h = setup([auth, connected], { async get() { return { id: 20, url: "https://example.com/" }; } });
 h.send({ type: "start" }); await until(() => h.created.length); await tick(); capture();
 await until(() => h.events.some(e => e.type === "connected")); h.send({ type: "applied" });
 await until(() => h.events.some(e => e.type === "done")); assert.equal(h.removed.length, 0);
});
