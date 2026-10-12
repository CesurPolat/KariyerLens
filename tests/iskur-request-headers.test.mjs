import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { ensureIskurOriginRemoved, iskurOriginRule } from "../src/shared/iskur/iskur-request-headers.ts";
import { getIskurJob } from "../src/shared/iskur/iskur-api.ts";
import { detailPage } from "./fixtures/iskur-pages.mjs";
const original = globalThis.chrome;
afterEach(() => { globalThis.chrome = original; });

test("Origin removal only matches this extension's POST fetches to the two İŞKUR endpoints", () => {
  const id = "a".repeat(32), rule = iskurOriginRule(id);
  assert.deepEqual(rule.action.requestHeaders, [{ header: "origin", operation: "remove" }]);
  assert.deepEqual(rule.condition.initiatorDomains, [id]); assert.deepEqual(rule.condition.requestMethods, ["post"]);
  assert.deepEqual(rule.condition.resourceTypes, ["xmlhttprequest"]);
  const pattern = new RegExp(rule.condition.regexFilter, "i");
  for (const suffix of ["Ara.aspx", "Detay.aspx?uiID=000123"]) assert.ok(pattern.test("https://esube.iskur.gov.tr/Istihdam/AcikIsIlan" + suffix));
  for (const url of ["https://esube.iskur.gov.tr.evil.test/Istihdam/AcikIsIlanAra.aspx", "https://www.kariyer.net/Istihdam/AcikIsIlanAra.aspx", "https://esube.iskur.gov.tr/Istihdam/AcikIsIlanAra.aspx/extra", "https://esube.iskur.gov.tr/Istihdam/Apply.aspx"]) assert.equal(pattern.test(url), false);
});
test("concurrent requests await one rule installation before fetching", async () => {
  let finish, updates = 0, fetches = 0;
  globalThis.chrome = { runtime: { id: "a".repeat(32) }, declarativeNetRequest: { updateSessionRules(options) {
    updates++; assert.deepEqual(options.removeRuleIds, [options.addRules[0].id]);
    return new Promise(resolve => { finish = resolve; });
  } } };
  const fetcher = async () => { fetches++; return new Response(detailPage(), { headers: { "content-type": "text/html" } }); };
  const first = getIskurJob("00000000123", undefined, fetcher), second = getIskurJob("00000000123", undefined, fetcher);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(updates, 1); assert.equal(fetches, 0);
  finish(); assert.equal((await first).ok, true); assert.equal((await second).ok, true); assert.equal(fetches, 2);
  await ensureIskurOriginRemoved(); assert.equal(updates, 1);
});
test("failed or missing header permissions prevent fetching and allow a later explicit retry", async () => {
  let updates = 0, fetches = 0;
  globalThis.chrome = { runtime: { id: "a".repeat(32) }, declarativeNetRequest: { async updateSessionRules() { updates++; throw new Error("permission denied"); } } };
  const fetcher = async () => { fetches++; throw new Error("must not fetch"); };
  assert.equal((await getIskurJob("00000000123", undefined, fetcher)).code, "ISKUR_HEADER_RULE_FAILED");
  assert.equal(fetches, 0); assert.equal(updates, 1);
  await getIskurJob("00000000123", undefined, fetcher); assert.equal(updates, 2); assert.equal(fetches, 0);
  delete globalThis.chrome.declarativeNetRequest;
  assert.equal((await getIskurJob("00000000123", undefined, fetcher)).code, "ISKUR_HEADER_RULE_FAILED"); assert.equal(fetches, 0);
});
