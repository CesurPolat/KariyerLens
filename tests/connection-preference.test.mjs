import test from "node:test";
import assert from "node:assert/strict";
import { loadAutoConnectPreference, saveAutoConnectPreference } from "../src/dashboard/connection-preference.ts";

test("automatic connection defaults off and accepts only a saved boolean true", async () => {
  for (const value of [undefined, false, "true", 1, null, true]) {
    globalThis.chrome = { storage: { local: { async get(key) {
      assert.equal(key, "dashboardAutoConnectEnabled"); return { [key]: value };
    } } } };
    assert.equal(await loadAutoConnectPreference(), value === true);
  }
});

test("enabling and disabling survive a later preference read", async () => {
  const stored = {};
  globalThis.chrome = { storage: { local: {
    async get(key) { return { [key]: stored[key] }; },
    async set(value) { Object.assign(stored, value); },
  } } };
  await saveAutoConnectPreference(true); assert.equal(await loadAutoConnectPreference(), true);
  await saveAutoConnectPreference(false); assert.equal(await loadAutoConnectPreference(), false);
  assert.deepEqual(stored, { dashboardAutoConnectEnabled: false });
});

test("storage failures propagate so the UI cannot claim the preference was saved", async () => {
  globalThis.chrome = { storage: { local: {
    async get() { throw new Error("Unavailable"); }, async set() { throw new Error("Full"); },
  } } };
  await assert.rejects(loadAutoConnectPreference(), /Unavailable/);
  await assert.rejects(saveAutoConnectPreference(true), /Full/);
});
