import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const dist = new URL("../dist/", import.meta.url);

test("built extension includes every manifest asset and local options resource", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", dist), "utf8"));
  const sourceManifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest, sourceManifest);
  const assets = [manifest.background.service_worker, manifest.options_ui.page,
    ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap(({ js }) => js)];
  for (const asset of assets) await access(new URL(asset, dist));
  const optionsPage = new URL(manifest.options_ui.page, dist);
  const html = await readFile(optionsPage, "utf8");
  for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.doesNotMatch(asset, /^https?:/);
    await access(new URL(asset, optionsPage));
  }
  for (const script of manifest.content_scripts.flatMap(({ js }) => js)) {
    // Content scripts must parse as classic scripts, without import/export syntax.
    new vm.Script(await readFile(new URL(script, dist), "utf8"), { filename: script });
  }
});

test("built content scripts retain shared navigation helpers", async () => {
  const scope = vm.createContext({
    location: { href: "https://www.kariyer.net/is-ilani/test-123" },
    URL, history: { pushState() {}, replaceState() {} },
    addEventListener() {}, queueMicrotask() {},
    chrome: { runtime: { sendMessage: async () => ({ ok: false }) } },
  });
  const source = await readFile(new URL("src/content/content-script.js", dist), "utf8");
  vm.runInContext(source, scope);
  assert.equal(vm.runInContext("findJobId()", scope), "123");
  assert.equal(vm.runInContext("typeof loadCurrentJob", scope), "function");
  assert.equal(vm.runInContext("lastRequestedJobId", scope), "123");
  vm.runInContext('lastRequestedJobId = ""', scope);
  assert.equal(vm.runInContext("lastRequestedJobId", scope), "");
});

test("MV3 background runs a tool conversation without Node globals or dynamic code", async () => {
  let listener, modelCalls = 0, bridgeCalls = 0;
  const sandbox = {
    URL, URLSearchParams, Headers, Request, Response, AbortController, AbortSignal, DOMException,
    TextEncoder, TextDecoder, ReadableStream, Blob, FormData, performance, crypto: webcrypto,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, structuredClone, console,
    chrome: {
      runtime: { id: "extension-test", onMessage: { addListener(fn) { listener = fn; } }, onConnect: { addListener() {} }, openOptionsPage: async () => {} },
      action: { onClicked: { addListener() {} } },
      storage: { local: { setAccessLevel: async () => {}, get: async () => ({ chatSettings: { providers: { openai: { apiKey: "test-key", model: "test-model" } } } }) } },
      tabs: { sendMessage: async () => { bridgeCalls++; return { ok: true, data: { companyName: null, profileUrl: null, followers: null, openJobs: null, jobsUrl: null } }; } },
    },
    fetch: async (url, options) => {
      if (String(url).includes("candidatesearchapigateway")) return Response.json({ jobGeneralInformation: { id: "123", title: "ERP" } });
      assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
      if (++modelCalls === 1) return Response.json({ choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: null,
        tool_calls: [{ id: "call-1", type: "function", function: { name: "get_current_company_stats", arguments: "{}" } }],
      } }] });
      assert.equal(JSON.parse(options.body).messages.at(-1).role, "tool");
      return Response.json({ choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Şirket bilgisi bulunamadı." } }] });
    },
  };
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const source = await readFile(new URL("src/background/service-worker.js", dist), "utf8");
  assert.doesNotMatch(source, /^import\s/m);
  const workerModule = new vm.SourceTextModule(source, { context });
  await workerModule.link(() => assert.fail("Background bundle must not import external modules"));
  await workerModule.evaluate();
  assert.equal(vm.runInContext("typeof process", context), "undefined");
  assert.equal(vm.runInContext("typeof Buffer", context), "undefined");
  const result = await new Promise((resolve) => listener({ type: "CHAT_JOB", jobId: "123", messages: [{ role: "user", content: "Şirket?" }] },
    { id: "extension-test", tab: { id: 1 }, frameId: 0, url: "https://www.kariyer.net/is-ilani/test-123" }, resolve));
  assert.equal(result.ok, true, JSON.stringify({ result, modelCalls, bridgeCalls })); assert.equal(result.reply, "Şirket bilgisi bulunamadı.");
  assert.equal(modelCalls, 2); assert.equal(bridgeCalls, 1);
});
