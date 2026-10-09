import test from "node:test";
import assert from "node:assert/strict";

const candidate = "https://candidatewebapigw.kariyer.net";
const search = "https://candidatesearchapigateway.kariyer.net";
const key = "kariyerLensApiSession";
let saved = {}, access = [], writes = 0, delayRead;
globalThis.chrome = { storage: { session: {
  async setAccessLevel(value) { access.push(value); },
  async get() { const copy = structuredClone(saved); if (delayRead) await delayRead; return copy; },
  async set(value) { writes++; Object.assign(saved, structuredClone(value)); }
} } };
let serial = 0;
const cold = () => import("../src/shared/kariyer/kariyer-session.ts?worker=" + ++serial);
const request = (bearer, origin = candidate) => ({ tabId: 1, initiator: "https://www.kariyer.net", url: origin + "/request",
  requestHeaders: [{ name: "Authorization", value: bearer }] });
const flush = () => new Promise(resolve => setImmediate(resolve));

test("captured credentials survive a cold worker without exposing session storage to content scripts", async () => {
  const first = await cold(); await first.kariyerSessionReady();
  first.captureKariyerSession(request("Bearer candidate-one"));
  first.captureKariyerSession(request("Bearer search-one", search));
  await flush();
  assert.ok(writes >= 1);
  const second = await cold(); await second.kariyerSessionReady();
  assert.deepEqual(second.getKariyerCredentials(candidate), { bearer: "Bearer candidate-one" });
  assert.deepEqual(second.getKariyerCredentials(search), { bearer: "Bearer search-one" });
  assert.ok(access.every(value => value.accessLevel === "TRUSTED_CONTEXTS"));
});
test("hydration cannot overwrite a newer captured token", async () => {
  let release;
  delayRead = new Promise(resolve => { release = resolve; });
  const worker = await cold(); const ready = worker.kariyerSessionReady();
  await flush();
  worker.captureKariyerSession(request("Bearer newer"));
  release(); await ready; delayRead = undefined; await flush();
  assert.equal(worker.getKariyerCredentials(candidate).bearer, "Bearer newer");
  assert.equal(saved[key][candidate].credentials.bearer, "Bearer newer");
});
test("expired, future and malformed stored credentials are not restored; browser session clearing removes them", async () => {
  for (const value of [
    { capturedAt: Date.now() - 31 * 60 * 1000, credentials: { bearer: "Bearer expired" } },
    { capturedAt: Date.now() + 60000, credentials: { bearer: "Bearer future" } },
    { capturedAt: Date.now(), credentials: { bearer: "invalid" } },
  ]) {
    saved = { [key]: { [candidate]: value } };
    const worker = await cold(); await worker.kariyerSessionReady();
    assert.deepEqual(worker.getKariyerCredentials(candidate), {});
  }
  saved = {};
  const worker = await cold(); await worker.kariyerSessionReady();
  assert.deepEqual(worker.getKariyerCredentials(candidate), {});
});
test("storage failures leave live session observation working", async () => {
  const storage = chrome.storage.session;
  chrome.storage.session = { async setAccessLevel() { throw new Error("Unavailable"); }, async set() { throw new Error("Unavailable"); } };
  try {
    const worker = await cold(); await worker.kariyerSessionReady();
    worker.captureKariyerSession(request("Bearer live")); await flush();
    assert.equal(worker.getKariyerCredentials(candidate).bearer, "Bearer live");
  } finally { chrome.storage.session = storage; }
});
