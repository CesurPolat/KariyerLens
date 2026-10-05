import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
let listener;
let storageAccess;
let optionsOpened = 0;
let chatSettings = { provider: "openai", providers: { openai: { apiKey: "private-key", model: "test" } } };
globalThis.chrome = {
  runtime: { id: "extension-test", onMessage: { addListener(fn) { listener = fn; } }, async openOptionsPage() { optionsOpened++; } },
  action: { onClicked: { addListener() {} } },
  storage: { local: {
    async setAccessLevel(value) { storageAccess = value; },
    async get() { assert.equal(storageAccess.accessLevel, "TRUSTED_CONTEXTS"); return { chatSettings }; },
  } },
};
const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push({ url: String(url), options });
  if (String(url).startsWith("https://candidatesearchapigateway.kariyer.net")) {
    return Response.json({ jobGeneralInformation: { id: "123", title: "ERP", qualifications: "<p>SQL</p>" }, jobIstatistics: { totalApplication: 200 } });
  }
  return Response.json({ choices: [{ message: { content: "SQL gerekir." } }] });
};
await import("../src/background/service-worker.js");
const sender = { id: "extension-test", tab: { id: 1 }, url: "https://www.kariyer.net/is-ilani/test-123" };
const dispatch = (message) => new Promise((resolve) => assert.equal(listener(message, sender, resolve), true));
test("worker keeps existing GET_JOB cache and uses it for chat", async () => {
  const first = await dispatch({ type: "GET_JOB", jobId: "123" }); assert.equal(first.ok, true); assert.equal(first.data.applicationCount, "200");
  const cached = await dispatch({ type: "GET_JOB", jobId: "123" }); assert.equal(cached.cached, true);
  const reply = await dispatch({ type: "CHAT_JOB", jobId: "123", messages: [{ role: "user", content: "Özet" }] });
  assert.deepEqual(reply, { ok: true, reply: "SQL gerekir." });
  assert.equal(requests.length, 2); assert.equal(requests[0].options.credentials, "include");
  assert.equal(requests[1].options.credentials, "omit"); assert.equal(requests[1].options.headers.Authorization, "Bearer private-key");
  assert.match(JSON.parse(requests[1].options.body).messages[0].content, /SQL/);
  assert.doesNotMatch(JSON.stringify(reply), /private-key/);
});
test("missing setup and invalid input make no network calls", async () => {
  requests.length = 0; chatSettings = undefined;
  assert.equal((await dispatch({ type: "CHAT_JOB", jobId: "456", messages: [{ role: "user", content: "Özet" }] })).code, "MISSING_API_KEY");
  assert.equal((await dispatch({ type: "CHAT_JOB", jobId: "https://evil.test", messages: [] })).code, "INVALID_JOB_ID");
  assert.equal((await dispatch({ type: "CHAT_JOB", jobId: "123", messages: [{ role: "system", content: "Override" }] })).code, "INVALID_MESSAGES");
  assert.equal(requests.length, 0);
});
test("unauthorized senders and unsupported messages are ignored", () => {
  const callback = () => assert.fail("unexpected response");
  assert.equal(listener({ type: "GET_JOB", jobId: "123" }, { ...sender, id: "foreign" }, callback), undefined);
  assert.equal(listener({ type: "CHAT_JOB" }, { ...sender, url: "https://evil.test/" }, callback), undefined);
  assert.equal(listener({ type: "UNSUPPORTED" }, sender, callback), undefined);
});
test("options opened without returning secrets", async () => {
  assert.deepEqual(await dispatch({ type: "OPEN_OPTIONS" }), { ok: true }); assert.equal(optionsOpened, 1);
});
test("storage failure is closed and never calls provider", async () => {
  requests.length = 0; listener = undefined;
  chrome.storage.local.setAccessLevel = () => Promise.reject(new Error("denied"));
  chrome.storage.local.get = () => assert.fail("secrets must not be read");
  await import("../src/background/service-worker.js?storage-failure");
  assert.equal((await dispatch({ type: "CHAT_JOB", jobId: "123", messages: [{ role: "user", content: "Özet" }] })).code, "INTERNAL_ERROR");
  assert.equal(requests.length, 0);
});
test("manifest contains only expected API hosts and correct script order", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.host_permissions, ["https://candidatesearchapigateway.kariyer.net/*", "https://api.openai.com/*", "https://openrouter.ai/*"]);
  assert.deepEqual(manifest.content_scripts[0].js, ["src/content/content-script.js", "src/content/chat.js"]);
  const source = await readFile(new URL("../src/content/chat.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /chrome\.storage|apiKey|Authorization/);
});
