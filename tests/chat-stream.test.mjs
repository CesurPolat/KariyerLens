import test from "node:test";
import assert from "node:assert/strict";
import { chatWithJob } from "../src/background/chat-api.ts";

const job = { id: "123", title: "SQL Uzmanı", sector: [], workAreas: [], education: [], languages: [], isActive: true, isEasyApply: false };
const history = [{ role: "user", content: "Özetle" }];
const settings = (provider) => ({ provider, providers: { [provider]: { apiKey: "test-key", model: "test-model" } } });
const encoder = new TextEncoder();
const chunk = (delta, finish_reason = null) => ({ id: "completion-1", object: "chat.completion.chunk", model: "test-model", choices: [{ index: 0, delta, finish_reason }] });
let streamId = 0;
function sse() {
  const id = "completion-" + ++streamId;
  let controller;
  const body = new ReadableStream({ start(value) { controller = value; } });
  return {
    response: new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
    write: (value) => controller.enqueue(encoder.encode("data: " + JSON.stringify({ ...value, id }) + "\n\n")),
    finish(reason = "stop") { this.write(chunk({}, reason)); controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); },
    error: (error) => controller.error(error),
  };
}

for (const provider of ["openai", "openrouter"]) {
  test(`${provider}: disabled streaming requests JSON while retaining progress`, async () => {
    const events = [];
    const result = await chatWithJob(job, history, settings(provider), async (_, options) => {
      assert.equal(JSON.parse(options.body).stream, false);
      return Response.json({ choices: [{ index: 0, message: { role: "assistant", content: "SQL gerekli." }, finish_reason: "stop" }] });
    }, undefined, { enabled: false, onProgress: (event) => events.push(event) });
    assert.deepEqual(result, { ok: true, reply: "SQL gerekli." });
    assert.ok(events.some((event) => event.type === "status"));
    assert.equal(events.some((event) => event.type === "text"), false);
  });
  test(`${provider}: actual SSE text is visible before the response finishes`, async () => {
    const source = sse(), events = [];
    let first;
    const ready = new Promise((resolve) => { first = resolve; });
    const pending = chatWithJob(job, history, settings(provider), async (url, options) => {
      assert.equal(JSON.parse(options.body).stream, true);
      assert.equal(new Headers(options.headers).get("authorization"), "Bearer test-key");
      assert.equal(options.credentials, "omit");
      assert.equal(String(url), provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions");
      source.write(chunk({ role: "assistant", reasoning_content: "private reasoning" }));
      source.write(chunk({ content: "## SQL" }));
      return source.response;
    }, undefined, { onProgress: (event) => { events.push(event); if (event.type === "text" && event.content) first(); } });
    await ready;
    assert.equal(events.at(-1).content, "## SQL");
    let finished = false; pending.then(() => { finished = true; }); await Promise.resolve(); assert.equal(finished, false);
    source.write(chunk({ content: "\n\n**Gerekli**" })); source.finish();
    assert.deepEqual(await pending, { ok: true, reply: "## SQL\n\n**Gerekli**" });
    assert.equal(events.filter((event) => event.type === "text").at(-1).content, "## SQL\n\n**Gerekli**");
    assert.doesNotMatch(JSON.stringify(events), /test-key|private reasoning/);
  });
}

test("streamed tool calls show progress and final answer starts with fresh text", async () => {
  const events = []; let calls = 0, companyCalls = 0;
  const result = await chatWithJob(job, history, settings("openai"), async () => {
    const source = sse();
    if (++calls === 1) {
      source.write(chunk({ role: "assistant", content: "Şirketi kontrol edeceğim." }));
      source.write(chunk({ tool_calls: [{ index: 0, id: "tool-1", type: "function", function: { name: "get_current_company_stats", arguments: "{}" } }] }));
      source.finish("tool_calls");
    } else { source.write(chunk({ role: "assistant", content: "Üç açık ilan var." })); source.finish(); }
    return source.response;
  }, {
    loadJob: async () => ({ ok: true, data: job, fetchedAt: 0 }),
    loadCompany: async () => { companyCalls++; return { ok: true, data: { companyName: null, profileUrl: null, followers: null, openJobs: 3, jobsUrl: null } }; },
  }, { onProgress: (event) => events.push(event) });
  assert.deepEqual(result, { ok: true, reply: "Üç açık ilan var." });
  assert.equal(calls, 2); assert.equal(companyCalls, 1);
  assert.ok(events.some((event) => event.type === "status" && /Şirket/.test(event.text)));
  assert.equal(events.filter((event) => event.type === "text").at(-1).content, "Üç açık ilan var.");
});

test("stream interruption reports failure after delivering partial text", async () => {
  const source = sse(); let first;
  const ready = new Promise((resolve) => { first = resolve; });
  const pending = chatWithJob(job, history, settings("openai"), async () => {
    source.write(chunk({ role: "assistant", content: "Kısmi yanıt" })); return source.response;
  }, undefined, { onProgress: (event) => { if (event.type === "text" && event.content) first(); } });
  await ready; source.error(new TypeError("stream disconnected"));
  assert.equal((await pending).ok, false);
});

test("client disconnect aborts the provider stream", async () => {
  const source = sse(), controller = new AbortController(); let first, providerSignal;
  const ready = new Promise((resolve) => { first = resolve; });
  const pending = chatWithJob(job, history, settings("openai"), async (_, options) => {
    providerSignal = options.signal;
    providerSignal.addEventListener("abort", () => source.error(new DOMException("Aborted", "AbortError")));
    source.write(chunk({ role: "assistant", content: "Başlangıç" })); return source.response;
  }, undefined, { signal: controller.signal, onProgress: (event) => { if (event.type === "text" && event.content) first(); } });
  await ready; controller.abort();
  assert.equal((await pending).code, "CANCELLED"); assert.equal(providerSignal.aborted, true);
});
