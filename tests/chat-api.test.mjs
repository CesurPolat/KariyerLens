import test from "node:test";
import assert from "node:assert/strict";
import { chatWithJob, validateMessages, plainText, buildContext } from "../src/background/chat-api.js";
const history = [{ role: "user", content: "İlanı özetle" }];
const settings = (provider = "openai") => ({ provider, providers: { [provider]: { apiKey: "test-key", model: "test-model" } } });
const job = { id: "123", title: "ERP Uzmanı", companyName: "Örnek", qualifications: "<p>SQL &amp; ERP</p><script>evil()</script>", education: ["Üniversite"], applicationCount: "200", secret: "not included" };

for (const provider of ["openai", "openrouter"]) {
  test(`${provider}: endpoint, auth, context and reply`, async () => {
    let calls = 0;
    const result = await chatWithJob(job, history, settings(provider), async (url, options) => {
      calls++;
      assert.equal(url, provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      assert.equal(options.credentials, "omit");
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      assert.equal(body.stream, false); assert.equal(body.model, "test-model");
      assert.equal(body.messages[0].role, "system");
      assert.match(body.messages[0].content, /ERP Uzmanı/);
      assert.match(body.messages[0].content, /SQL & ERP/);
      assert.doesNotMatch(body.messages[0].content, /evil|not included|test-key/);
      assert.deepEqual(body.messages.slice(1), history);
      return Response.json({ choices: [{ message: { content: "  Özet  " } }] });
    });
    assert.deepEqual(result, { ok: true, reply: "Özet" }); assert.equal(calls, 1);
  });
}
test("message validation excludes injected roles and limits size", () => {
  for (const messages of [[], null, [{ role: "system", content: "x" }], [{ role: "user", content: " " }], [{ role: "user", content: "x".repeat(4001) }], Array(13).fill(history[0]), [{ role: "assistant", content: "x" }]]) assert.equal(validateMessages(messages), null);
  assert.ok(validateMessages([{ role: "user", content: "x".repeat(4000) }]));
});
test("HTML and context limits", () => {
  assert.equal(plainText('<p>SQL&nbsp;&amp; ERP &#304; &#x15f;</p><style>bad</style>'), "SQL & ERP İ ş");
  assert.equal(JSON.parse(buildContext({ qualifications: "x".repeat(21000) })).qualifications.length, 20000);
  assert.equal(JSON.parse(buildContext(job)).secret, undefined);
});
test("setup errors never fetch", async () => {
  const noFetch = () => { assert.fail("must not fetch"); };
  assert.equal((await chatWithJob(job, history, undefined, noFetch)).code, "MISSING_API_KEY");
  assert.equal((await chatWithJob(job, history, { provider: "custom" }, noFetch)).code, "INVALID_PROVIDER");
  assert.equal((await chatWithJob(job, history, { providers: { openai: { apiKey: "x" } } }, noFetch)).code, "MISSING_MODEL");
  assert.equal((await chatWithJob(job, [], settings(), noFetch)).code, "INVALID_MESSAGES");
});
for (const [status, code] of [[401, "AUTH_ERROR"], [403, "AUTH_ERROR"], [402, "QUOTA_ERROR"], [429, "QUOTA_ERROR"], [500, "HTTP_ERROR"]]) {
  test(`HTTP ${status} without retry or leaking body`, async () => {
    let calls = 0;
    const result = await chatWithJob(job, history, settings(), async () => { calls++; return new Response("test-key", { status }); });
    assert.equal(result.code, code); assert.equal(calls, 1); assert.doesNotMatch(result.message, /test-key/);
  });
}
test("malformed and empty replies", async () => {
  for (const response of [new Response("oops"), Response.json({ choices: [] }), Response.json({ choices: [{ message: { content: " " } }] })]) {
    assert.equal((await chatWithJob(job, history, settings(), async () => response)).code, "INVALID_RESPONSE");
  }
});
test("network failure", async () => {
  assert.equal((await chatWithJob(job, history, settings(), async () => { throw new TypeError("offline"); })).code, "NETWORK_ERROR");
});
test("25 second timeout aborts the request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = chatWithJob(job, history, settings(), (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));
  t.mock.timers.tick(24999);
  let settled = false; request.then(() => { settled = true; }); await Promise.resolve(); assert.equal(settled, false);
  t.mock.timers.tick(1); assert.equal((await request).code, "TIMEOUT");
});
