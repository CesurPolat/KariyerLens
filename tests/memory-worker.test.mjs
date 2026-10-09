import test from "node:test";
import assert from "node:assert/strict";
let listener, capture;
const storage = { chatSettings: { providers: { openai: { apiKey: "provider-secret", model: "test" } } } };
const optionsUrl = "chrome-extension://extension-test/src/options/options.html";
globalThis.chrome = {
  runtime: { id: "extension-test", getURL: p => "chrome-extension://extension-test/" + p,
    onMessage: { addListener(fn) { listener = fn; } }, onConnect: { addListener() {} } },
  action: { onClicked: { addListener() {} } },
  webRequest: { onBeforeSendHeaders: { addListener(fn) { capture = fn; } } },
  storage: { local: { async setAccessLevel() {}, async get(key) { return structuredClone({ [key]: storage[key] }); },
    async set(value) { Object.assign(storage, structuredClone(value)); } } },
};
let cvFetches = 0, mode = "summary";
const bodies = [];
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  if (url.pathname === "/job") return Response.json({ jobGeneralInformation: {
    id: url.searchParams.get("jobId"), title: "ERP", qualifications: "<p>SQL</p><script>bad()</script>" }, jobIstatistics: { totalApplication: 20 } });
  if (url.pathname === "/jb/api/candidates/resumes") { cvFetches++; return Response.json({ result: { resumeList: [{ encryptedId: "cv-one", resumeName: "CV" }] } }); }
  if (url.pathname === "/jb/api/candidates/resume") { cvFetches++; return Response.json({ result: { summary: "CV-PRIVATE-SQL", token: "session-secret" } }); }
  const body = JSON.parse(options.body); bodies.push(body);
  let name, args = {};
  if (mode === "cv") {
    if (!body.messages.some(m => m.role === "tool")) name = "get_resumes";
    else if (!body.messages.some(m => m.role === "tool" && JSON.parse(m.content).data?.summary)) { name = "get_resume"; args = { resumeId: "cv-one" }; }
  }
  if (mode === "current" && !body.messages.some(m => m.role === "tool")) name = "get_current_job";
  if (mode === "memory" && !body.messages.some(m => m.role === "tool")) { name = "get_memory_job"; args = { jobId: "123" }; }
  return Response.json({ choices: [{ index: 0, finish_reason: name ? "tool_calls" : "stop", message: name ? {
    role: "assistant", content: null, tool_calls: [{ id: "call-" + bodies.length, type: "function", function: { name, arguments: JSON.stringify(args) } }],
  } : { role: "assistant", content: "Yanıt" } }] });
};
await import("../dist/src/background/service-worker.js");
const sender = { id: "extension-test", tab: { id: 1 }, url: "https://www.kariyer.net/is-ilani/test-123" };
const optionsSender = { id: "extension-test", url: optionsUrl };
const dispatch = (message, from = sender) => new Promise(resolve => { assert.equal(listener(message, from, resolve), true); });
const ask = (jobId = "123") => dispatch({ type: "CHAT_JOB", jobId, messages: [{ role: "user", content: mode === "cv" ? "CV'm ile karşılaştır" : "İlanı incele" }] });
const session = bearer => capture({ tabId: 1, initiator: "https://www.kariyer.net", url: "https://candidatewebapigw.kariyer.net/candidates/base-info",
  requestHeaders: [{ name: "Authorization", value: bearer }] });

test("ordinary visits do not persist memory; each chat counts once including current-job tool", async () => {
  await dispatch({ type: "GET_JOB", jobId: "123" });
  await dispatch({ type: "GET_JOB_VISIT", jobId: "123" });
  assert.equal((await dispatch({ type: "GET_MEMORY_STATUS" }, optionsSender)).data.jobCount, 0);
  mode = "current"; assert.equal((await ask()).ok, true);
  assert.equal(storage.chatMemory.jobs[0].views, 1);
  assert.equal(storage.chatMemory.jobs[0].data.qualifications, "SQL");
  mode = "summary"; await ask(); assert.equal(storage.chatMemory.jobs[0].views, 2);
});

test("CV tool results use persistent cache, never appear in ordinary provider context", async () => {
  session("Bearer session-secret"); mode = "cv";
  await ask(); assert.equal(cvFetches, 2);
  const start = bodies.length; await ask("456"); assert.equal(cvFetches, 2);
  assert.ok(bodies.slice(start).some(b => b.messages.some(m => m.role === "tool" && JSON.parse(m.content).cached === true)));
  mode = "summary"; await ask();
  assert.doesNotMatch(JSON.stringify(bodies.at(-1).messages), /CV-PRIVATE-SQL|session-secret|provider-secret/);
  assert.doesNotMatch(JSON.stringify(storage.chatMemory), /session-secret|provider-secret/);
  mode = "memory"; await ask("456");
  const historic = JSON.parse(bodies.at(-1).messages.find(m => m.role === "tool").content);
  assert.equal(historic.data.id, "123"); assert.equal(historic.data.historical, true);
  session("Bearer different-session"); mode = "cv"; await ask(); assert.equal(cvFetches, 4);
});

test("only options page manages memory; refresh and disabled state reach worker tools", async () => {
  assert.equal((await dispatch({ type: "CLEAR_MEMORY" })).code, "UNAUTHORIZED");
  assert.equal((await dispatch({ type: "CLEAR_MEMORY" }, { id: "extension-test", url: "chrome-extension://extension-test/other.html" })).code, "UNAUTHORIZED");
  assert.equal((await dispatch({ type: "SET_MEMORY_ENABLED", enabled: "yes" }, optionsSender)).code, "INVALID_ARGUMENTS");
  await dispatch({ type: "REFRESH_CV_MEMORY" }, optionsSender);
  const jobs = storage.chatMemory.jobs.length;
  assert.equal(storage.chatMemory.resumes.length, 0); assert.ok(jobs > 0);
  mode = "cv"; await ask(); assert.equal(cvFetches, 6);
  await dispatch({ type: "SET_MEMORY_ENABLED", enabled: false }, optionsSender);
  mode = "summary"; await ask("789"); assert.equal(storage.chatMemory.jobs.length, jobs);
  assert.doesNotMatch(JSON.stringify(bodies.at(-1).messages), /İlan hafızası/);
  mode = "cv"; await ask(); await ask(); assert.equal(cvFetches, 10);
  const cleared = await dispatch({ type: "CLEAR_MEMORY" }, optionsSender);
  assert.deepEqual(cleared.data, { enabled: false, jobCount: 0, cvCount: 0, cvFetchedAt: null });
});
