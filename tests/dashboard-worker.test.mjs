import test from "node:test";
import assert from "node:assert/strict";
let listener, connect, onClick, capture, scope;
const db = {}, requests = []; let tabs = [], activated, created, focused;
const extensionId = "extension-dashboard", dashboardUrl = "chrome-extension://" + extensionId + "/src/dashboard/dashboard.html";
globalThis.chrome = {
 runtime: { id: extensionId, getURL: path => "chrome-extension://" + extensionId + "/" + path, onMessage: { addListener(fn) { listener = fn; } }, onConnect: { addListener(fn) { connect = fn; } }, async openOptionsPage() {} },
 action: { onClicked: { addListener(fn) { onClick = fn; } } },
 webRequest: { onBeforeSendHeaders: { addListener(fn) { capture = fn; } } },
 storage: { local: { async setAccessLevel() {}, async get(key) { return structuredClone(key === "chatSettings" ? { chatSettings: { provider: "openai", providers: { openai: { apiKey: "private-key", model: "test" } } } } : { [key]: db[key] }); }, async set(value) { Object.assign(db, structuredClone(value)); } } },
 tabs: { async query() { return tabs; }, async update(id, options) { activated = { id, options }; }, async create(options) { created = options; } },
 windows: { async update(id, options) { focused = { id, options }; } },
};
globalThis.fetch = async (input, options) => {
 const url = new URL(String(input)); requests.push(url.pathname);
 if (url.pathname === "/candidates/base-info") return Response.json({ id: 101 });
 if (url.pathname === "/job") return Response.json({ jobGeneralInformation: { id: url.searchParams.get("jobId"), title: "React", qualifications: "React SQL" } });
 if (url.pathname === "/jb/api/candidates/resumes") return Response.json({ result: { resumeList: [{ encryptedId: "cv-A", resumeName: "CV A" }], totalCount: 1 } });
 if (url.pathname === "/jb/api/candidates/resume") return Response.json({ result: { summary: "React" } });
 if (url.hostname === "api.openai.com") {
  assert.equal(JSON.parse(options.body).tools?.length ?? 0, 0);
  return new Response(new ReadableStream({ start(controller) {
   const chunk = delta => new TextEncoder().encode("data: " + JSON.stringify({ id: "analysis", choices: [{ index: 0, delta, finish_reason: null }] }) + "\n\n");
   controller.enqueue(chunk({ role: "assistant", content: "React uyumlu" }));
   options.signal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
  } }), { headers: { "Content-Type": "text/event-stream" } });
 }
 assert.fail("Unexpected " + url);
};
await import("../dist/src/background/service-worker.js");
for (const origin of ["https://candidatewebapigw.kariyer.net", "https://candidatesearchapigateway.kariyer.net"]) capture({ tabId: 1, initiator: "https://www.kariyer.net", url: origin + "/request", requestHeaders: [{ name: "Authorization", value: "Bearer session" }] });
const dashboardSender = { id: extensionId, tab: { id: 3 }, url: dashboardUrl };
const jobSender = { id: extensionId, tab: { id: 1 }, url: "https://www.kariyer.net/is-ilani/test-123" };
const dispatch = (message, sender = dashboardSender) => new Promise(resolve => listener(message, sender, resolve));
function emitter() { const listeners = new Set(); return { addListener(fn) { listeners.add(fn); }, emit(v) { for (const fn of listeners) fn(v); } }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(fn) { for (let i = 0; i < 100 && !fn(); i++) await tick(); assert.ok(fn()); }
function port(sender) {
 const events = [], onMessage = emitter(), onDisconnect = emitter(); let closed = false;
 const instance = { name: "DASHBOARD_ANALYSIS", sender, onMessage, onDisconnect, postMessage(e) { events.push(e); }, disconnect() { closed = true; onDisconnect.emit(); } };
 connect(instance); return { instance, events, send: x => onMessage.emit(x), get closed() { return closed; } };
}
test("only the exact extension dashboard page may read personal state", async () => {
 for (const sender of [jobSender, { ...dashboardSender, url: "chrome-extension://" + extensionId + "/src/options/options.html" }, { ...dashboardSender, url: "https://evil.test" }]) assert.equal((await dispatch({ type: "DASHBOARD", payload: { action: "get" } }, sender)).code, "UNAUTHORIZED");
 const result = await dispatch({ type: "DASHBOARD", payload: { action: "get" } }); scope = result.scope; assert.equal(result.ok, true);
 assert.equal(requests.filter(x => x === "/candidates/base-info").length, 1);
});
test("dashboard writes require the verified account scope", async () => {
 assert.equal((await dispatch({ type: "DASHBOARD", payload: { action: "track", jobId: "123" } })).code, "AUTH_REQUIRED");
 assert.equal((await dispatch({ type: "DASHBOARD", scope: "0".repeat(64), payload: { action: "track", jobId: "123" } })).code, "AUTH_REQUIRED");
});
test("content scripts track only their current job and receive no dashboard state", async () => {
 assert.equal((await dispatch({ type: "TRACK_JOB", jobId: "124" }, jobSender)).code, "INVALID_ARGUMENTS");
 const result = await dispatch({ type: "TRACK_JOB", jobId: "123" }, jobSender);
 assert.equal(result.ok, true); assert.equal(result.data, undefined); assert.equal(result.resumes, undefined);
 assert.equal((await dispatch({ type: "DASHBOARD", payload: { action: "get" } })).data.applications.length, 1);
});
test("toolbar opens a dashboard and reuses its existing tab", async () => {
 onClick(); await until(() => created); assert.deepEqual(created, { url: dashboardUrl });
 tabs = [{ id: 8, windowId: 2, url: dashboardUrl }]; onClick(); await until(() => activated);
 assert.deepEqual(activated, { id: 8, options: { active: true } }); assert.deepEqual(focused, { id: 2, options: { focused: true } });
});
test("analysis ports reject content scripts and malformed input", async () => {
 assert.equal(port(jobSender).closed, true); assert.equal(port({ ...dashboardSender, id: "foreign" }).closed, true);
 const c = port(dashboardSender); c.send({ jobId: "bad", resumeId: "cv-A" }); await until(() => c.events.some(e => e.type === "done"));
 assert.equal(c.events.at(-1).result.code, "INVALID_ARGUMENTS"); c.instance.disconnect();
});
test("disconnect cancels streamed dashboard analysis and sends no late results", async () => {
 const c = port(dashboardSender); c.send({ scope, jobId: "123", resumeId: "cv-A" });
 await until(() => c.events.some(e => e.type === "text" && e.content));
 const count = c.events.length; c.instance.disconnect(); await tick(); await tick(); assert.equal(c.events.length, count);
 assert.doesNotMatch(JSON.stringify(c.events), /private-key|Bearer/);
});
