import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";

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
