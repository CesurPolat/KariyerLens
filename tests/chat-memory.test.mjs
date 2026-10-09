import test from "node:test";
import assert from "node:assert/strict";
import * as memory from "../src/features/memory/chat-memory.ts";
import { callKariyerTool } from "../src/shared/kariyer/kariyer-tools.ts";
let stored = {};
let broken = false;
globalThis.chrome = { storage: { local: {
  async get(key) { if (broken) throw Error("storage"); return structuredClone({ [key]: stored[key] }); },
  async set(value) { if (broken) throw Error("storage"); Object.assign(stored, structuredClone(value)); },
} } };
const ok = data => ({ ok: true, data, truncated: false, methodAssumed: false });
const scope = await memory.hashMemorySession("Bearer secret-session");
test.beforeEach(async () => { broken = false; await memory.clearMemory(); await memory.setMemoryEnabled(true); });

test("CV cache survives a worker module restart, separates sessions, parameters and CVs", async () => {
  let calls = 0;
  const load = async () => { calls++; return ok({ summary: "SQL deneyimi" }); };
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, load);
  const restarted = await import("../src/features/memory/chat-memory.ts?restart");
  const cached = await restarted.withResumeMemory("get_resume", { resumeId: "one" }, scope, load);
  assert.equal(cached.cached, true); assert.equal(calls, 1);
  await memory.withResumeMemory("get_resume", { resumeId: "two" }, scope, load);
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, await memory.hashMemorySession("Bearer other"), load);
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, null, load);
  assert.equal(calls, 4);
  const encoded = JSON.stringify(stored);
  assert.doesNotMatch(encoded, /secret-session|Bearer other/);
  await memory.withResumeMemory("get_resumes", { size: 8, skip: 0 }, scope, load);
  await memory.withResumeMemory("get_resumes", { skip: 0, size: 8 }, scope, load);
  assert.equal(calls, 5);
});

test("24-hour expiry and manual refresh fetch again; failures do not revive stale CV", async t => {
  const start = Date.now();
  t.mock.method(Date, "now", () => start);
  let calls = 0;
  const load = async () => { calls++; return ok({ summary: "CV" }); };
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, load);
  t.mock.method(Date, "now", () => start + memory.CV_TTL_MS - 1);
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, load);
  assert.equal(calls, 1);
  t.mock.method(Date, "now", () => start + memory.CV_TTL_MS);
  const failed = await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope,
    async () => ({ ok: false, code: "HTTP_ERROR", message: "failed" }));
  assert.equal(failed.ok, false); assert.equal((await memory.getMemoryStatus()).cvCount, 0);
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, load);
  await memory.clearMemory(true);
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, load);
  assert.equal(calls, 3);
});

test("concurrent writes preserve jobs, list order and unique context", async t => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  await Promise.all(Array.from({ length: 20 }, (_, i) => memory.rememberJob({ id: String(i + 1), title: "İlan " + i }, now, true)));
  now++;
  await memory.rememberJob({ id: "1", title: "Sık" }, now, true);
  now++;
  await memory.rememberJob({ id: "2", title: "Son" }, now, true);
  await memory.rememberJob({ id: "1", title: "Sık" }, now, true);
  await memory.rememberJob({ id: "2", title: "Son" }, now, false);
  assert.equal((await memory.getMemoryStatus()).jobCount, 20);
  assert.equal((await memory.listMemoryJobs("frequent", 10)).data[0].id, "1");
  assert.equal((await memory.getMemoryJob("2")).data.views, 2);
  const context = JSON.parse(await memory.memoryJobContext());
  assert.equal(context.length, new Set(context.map(j => j.id)).size);
  assert.ok(context.length <= 10);
  assert.equal((await memory.getMemoryJob("1")).data.historical, true);
  now += memory.JOB_MAX_AGE_MS + 1;
  assert.equal((await memory.getMemoryStatus()).jobCount, 0);
});

test("100-job and UTF-8 byte limits evict jobs before CVs", async () => {
  const now = Date.now();
  await Promise.all(Array.from({ length: 110 }, (_, i) => memory.rememberJob({ id: String(i + 1), title: "İlan" }, now, true)));
  assert.equal((await memory.getMemoryStatus()).jobCount, 100);
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, async () => ok({ summary: "CV" }));
  await memory.rememberJob({ id: "999", qualifications: "ş".repeat(memory.MEMORY_MAX_BYTES) }, now, true);
  assert.ok(new TextEncoder().encode(JSON.stringify(stored[memory.MEMORY_STORAGE_KEY])).byteLength <= memory.MEMORY_MAX_BYTES);
  assert.equal((await memory.getMemoryStatus()).cvCount, 1);
});

test("clear and refresh prevent in-flight CV requests from repopulating memory", async () => {
  let release; const loading = new Promise(resolve => { release = resolve; });
  let started; const ready = new Promise(resolve => { started = resolve; });
  const request = memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, () => { started(); return loading; });
  await ready; await memory.clearMemory(true); release(ok({ summary: "late" })); await request;
  assert.equal((await memory.getMemoryStatus()).cvCount, 0);
  const revision = memory.memoryRevision(); await memory.clearMemory();
  await memory.rememberJob({ id: "1" }, Date.now(), true, revision);
  assert.equal((await memory.getMemoryStatus()).jobCount, 0);
});

test("disabled memory and failed storage fall back to network without losing chat", async () => {
  await memory.rememberJob({ id: "1" }, Date.now(), true);
  await memory.setMemoryEnabled(false);
  await memory.rememberJob({ id: "2" }, Date.now(), true);
  assert.equal((await memory.getMemoryStatus()).jobCount, 1);
  assert.equal(await memory.memoryJobContext(), "");
  assert.equal((await memory.getMemoryJob("1")).code, "MEMORY_DISABLED");
  let calls = 0; const load = async () => { calls++; return ok({ summary: "CV" }); };
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, load);
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, load);
  assert.equal(calls, 2); assert.equal((await memory.getMemoryStatus()).cvCount, 0);
  broken = true;
  assert.equal((await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, load)).ok, true);
  assert.equal(await memory.memoryJobContext(), "");
});

test("only sanitized API results persist; errors never become memory", async () => {
  const load = () => callKariyerTool("get_resume", { resumeId: "one" }, "123", { bearer: "Bearer session-token" }, async () => Response.json({
    result: { summary: "Deneyim", token: "secret", apiKey: "secret", nested: { password: "secret" }, link: "https://files.test/cv?signature=secret" },
  }));
  await memory.withResumeMemory("get_resume", { resumeId: "one" }, scope, load);
  assert.doesNotMatch(JSON.stringify(stored), /secret|signature|session-token/);
  await memory.withResumeMemory("get_resume", { resumeId: "bad" }, scope, async () => ({ ok: false, code: "AUTH_REQUIRED", message: "no" }));
  assert.equal((await memory.getMemoryStatus()).cvCount, 1);
  assert.equal((await memory.hashMemorySession(undefined)), null);
});
