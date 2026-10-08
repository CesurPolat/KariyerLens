import test from "node:test";
import assert from "node:assert/strict";
import { parseExactApplicationCount } from "../src/shared/application-count.ts";
import { recordJobVisit, JOB_VISIT_STORAGE_KEY } from "../src/background/job-visit-history.ts";
let stored = {}, failGet = false, failSet = false;
let listener, apiCalls = 0, apiCount = 200, apiFailure = false;
globalThis.chrome = {
  runtime: { id: "visit-test", onMessage: { addListener(fn) { listener = fn; } }, onConnect: { addListener() {} } },
  action: { onClicked: { addListener() {} } },
  storage: { local: {
    async setAccessLevel() {},
    async get(key) { if (failGet) throw Error("read"); return { [key]: structuredClone(stored[key]) }; },
    async set(values) { if (failSet) throw Error("write"); await new Promise(resolve => setImmediate(resolve)); Object.assign(stored, structuredClone(values)); },
  } },
};
globalThis.fetch = async () => {
  apiCalls++;
  if (apiFailure) return new Response("", { status: 500 });
  return Response.json({ jobGeneralInformation: { id: "123", title: "İlan" }, jobIstatistics: { totalApplication: apiCount } });
};
await import("../dist/src/background/service-worker.js");
const sender = { id: "visit-test", tab: { id: 1 }, url: "https://www.kariyer.net/is-ilani/test-123" };
const dispatch = type => new Promise(resolve => assert.equal(listener({ type, jobId: "123" }, sender, resolve), true));

test("exact count parser accepts zero and grouped integers, rejects approximate or malformed values", () => {
  for (const [input, expected] of [["0", 0], ["145", 145], ["1.234",1234], ["1,234",1234], ["12 345",12345], [" 42 ",42]]) assert.equal(parseExactApplicationCount(input), expected);
  for (const input of [undefined, "", "100+", "1.2K", "1,5", "yaklaşık 200", "-1", "200 başvuru", "1.23.456", "9007199254740992"]) assert.equal(parseExactApplicationCount(input), null);
});

test("only count changes persist, including increases, decreases and zero", async () => {
  stored = {};
  for (const [index, count] of ["120", "120", "145", "100", "0"].entries()) {
    const result = await recordJobVisit("123", count, 1000 + index);
    assert.equal(result.status, index === 1 ? "unchanged" : "saved");
    assert.equal(result.measurements.length, [1, 1, 2, 3, 4][index]);
    if (index === 1) assert.equal(result.measurements.at(-1).timestamp, 1000);
    assert.equal(result.measurements.at(-1).count, Number(count));
  }
  const result = await recordJobVisit("123", "100+", 2000);
  assert.equal(result.status, "invalid-count"); assert.equal(result.measurements.length, 4);
});

test("storage failures preserve available history and the write queue recovers", async () => {
  failSet = true;
  const result = await recordJobVisit("123", "10", 3000);
  assert.equal(result.status, "unavailable"); assert.equal(result.measurements.length, 4);
  failSet = false; failGet = true;
  assert.deepEqual(await recordJobVisit("123", "10", 3000), { measurements: [], status: "unavailable" });
  failGet = false;
  assert.equal((await recordJobVisit("123", "10", 3000)).status, "saved");
});

test("concurrent tabs cannot lose writes, and each job has an independent timeline", async () => {
  stored = {};
  await Promise.all(Array.from({ length: 20 }, (_, i) => recordJobVisit(i % 2 ? "123" : "456", String(i), 4000 + i)));
  assert.equal(stored[JOB_VISIT_STORAGE_KEY]["123"].length, 10);
  assert.equal(stored[JOB_VISIT_STORAGE_KEY]["456"].length, 10);
});

test("concurrent identical counts produce one point; returning to an earlier count still records a change", async () => {
  stored = {};
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => recordJobVisit("123", "120", 4500 + i)));
  assert.equal(results.filter(result => result.status === "saved").length, 1);
  assert.equal(stored[JOB_VISIT_STORAGE_KEY]["123"].length, 1);
  await recordJobVisit("123", "145", 4600);
  await recordJobVisit("123", "120", 4700);
  assert.deepEqual(stored[JOB_VISIT_STORAGE_KEY]["123"].map(point => point.count), [120, 145, 120]);
});

test("retention keeps the latest 200 visits and 200 jobs", async () => {
  stored = {};
  await Promise.all(Array.from({ length: 205 }, (_, i) => recordJobVisit("123", String(i), 5000 + i)));
  const visits = stored[JOB_VISIT_STORAGE_KEY]["123"];
  assert.equal(visits.length, 200); assert.equal(visits[0].count, 5);
  await Promise.all(Array.from({ length: 201 }, (_, i) => recordJobVisit(String(i + 1000), "1", 10000 + i)));
  assert.equal(Object.keys(stored[JOB_VISIT_STORAGE_KEY]).length, 200);
  assert.equal(stored[JOB_VISIT_STORAGE_KEY]["123"], undefined);
  assert.equal(stored[JOB_VISIT_STORAGE_KEY]["1000"], undefined);
});

test("visit requests bypass the cache, ordinary requests do not record, and fresh results update the cache", async () => {
  stored = {}; apiCalls = 0;
  await dispatch("GET_JOB"); await dispatch("GET_JOB");
  assert.equal(apiCalls, 1); assert.equal(stored[JOB_VISIT_STORAGE_KEY], undefined);
  const first = await dispatch("GET_JOB_VISIT");
  apiCount = 225;
  const second = await dispatch("GET_JOB_VISIT");
  assert.equal(apiCalls, 3); assert.equal(first.history.measurements.length, 1);
  assert.deepEqual(second.history.measurements.map(point => point.count), [200,225]);
  const cached = await dispatch("GET_JOB");
  assert.equal(cached.cached, true); assert.equal(cached.data.applicationCount, "225");
  assert.equal(stored[JOB_VISIT_STORAGE_KEY]["123"].length, 2);
});

test("API failure creates no measurement; storage failure keeps fresh job success", async () => {
  apiFailure = true;
  assert.equal((await dispatch("GET_JOB_VISIT")).ok, false);
  assert.equal(stored[JOB_VISIT_STORAGE_KEY]["123"].length, 2);
  apiFailure = false; apiCount = 226; failSet = true;
  const response = await dispatch("GET_JOB_VISIT");
  assert.equal(response.ok, true); assert.equal(response.data.applicationCount, "226");
  assert.equal(response.history.status, "unavailable"); failSet = false;
});
