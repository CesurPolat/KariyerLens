import test from "node:test";
import assert from "node:assert/strict";
import { chatWithJob, validateMessages, plainText, buildContext, CHAT_TIMEOUT_MS } from "../src/features/chat/chat-api.ts";
import { KARIYER_TOOLS } from "../src/shared/kariyer/kariyer-tools.ts";
const history = [{ role: "user", content: "İlanı özetle" }];
const settings = (provider = "openai") => ({ provider, providers: { [provider]: { apiKey: "test-key", model: "test-model" } } });
const job = { id: "123", title: "ERP Uzmanı", companyName: "Örnek", qualifications: "<p>SQL &amp; ERP</p><script>evil()</script>", education: ["Üniversite"], applicationCount: "200", secret: "not included" };

test("general chat uses candidate tools without loading or exposing an active job", async () => {
  let modelCalls = 0, candidateCalls = 0;
  const result = await chatWithJob({}, [{ role: "user", content: "CV’lerimi incele" }], settings(), async (_, options) => {
    const body = JSON.parse(options.body);
    assert.match(JSON.stringify(body.messages[0].content), /Genel sohbet: açık ilan yok/);
    const names = body.tools.map(item => item.function.name);
    for (const endpoint of KARIYER_TOOLS.filter(item => item.currentJob)) assert.ok(!names.includes(endpoint.name));
    assert.ok(!names.includes("get_current_job"));
    assert.ok(!names.includes("get_current_company_stats"));
    assert.ok(names.includes("search_jobs"));
    if (++modelCalls === 1) return toolReply("get_resumes", "general-cv");
    assert.equal(JSON.parse(body.messages.at(-1).content).data.resumeList[0].resumeId, "cv-one");
    return textReply("CV bulundu.");
  }, {
    hasCurrentJob: false,
    loadJob: async () => assert.fail("general chat must not load a job"),
    loadCompany: async () => assert.fail("general chat must not load company stats"),
    callKariyerTool: async name => {
      assert.equal(name, "get_resumes"); candidateCalls++;
      return { ok: true, data: { resumeList: [{ resumeId: "cv-one" }] }, truncated: false, methodAssumed: false };
    },
  });
  assert.deepEqual(result, { ok: true, reply: "CV bulundu." });
  assert.equal(candidateCalls, 1);
});

for (const provider of ["openai", "openrouter", "cesurpolat"]) {
  test(`${provider}: endpoint, auth, context and reply`, async () => {
    let calls = 0;
    const result = await chatWithJob(job, history, settings(provider), async (url, options) => {
      calls++;
      assert.equal(String(url), provider === "openai" ? "https://api.openai.com/v1/chat/completions" : provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://llm.cesurpolat.dev/v1/chat/completions");
      assert.equal(new Headers(options.headers).get("authorization"), provider === "cesurpolat" ? null : "Bearer test-key");
      assert.equal(options.credentials, "omit");
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      assert.equal(body.stream, false); assert.equal(body.model, provider === "cesurpolat" ? undefined : "test-model");
      assert.deepEqual(body.tools.map((tool) => tool.function.name), ["get_current_job", "get_current_company_stats", ...KARIYER_TOOLS.map(tool => tool.name)]);
      assert.equal(body.messages[0].role, "system");
      const context = JSON.stringify(body.messages[0].content);
      assert.match(context, /ERP Uzmanı/);
      assert.match(context, /SQL & ERP/);
      assert.doesNotMatch(context, /evil|not included|test-key/);
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
test("Free works with only a provider selection and sends no key or model", async () => {
  const result = await chatWithJob(job, history, { provider: "cesurpolat" }, async (_, options) => {
    assert.equal(new Headers(options.headers).get("authorization"), null);
    assert.equal(Object.hasOwn(JSON.parse(options.body), "model"), false);
    assert.doesNotMatch(options.body, /kariyerlens-free/);
    return Response.json({ choices: [{ index: 0, message: { role: "assistant", content: "Özet" }, finish_reason: "stop" }] });
  });
  assert.deepEqual(result, { ok: true, reply: "Özet" });
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
test("total chat timeout aborts the request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = chatWithJob(job, history, settings(), (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));
  t.mock.timers.tick(CHAT_TIMEOUT_MS - 1);
  let settled = false; request.then(() => { settled = true; }); await Promise.resolve(); assert.equal(settled, false);
  t.mock.timers.tick(1); assert.equal((await request).code, "TIMEOUT");
});

const toolReply = (name, id = "tool-1", args = {}) => Response.json({ choices: [{ index: 0, finish_reason: "tool_calls", message: {
  role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
} }] });
const textReply = (text = "Veriler alındı.") => Response.json({ choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: text } }] });
const company = { companyName: "Örnek", profileUrl: "https://www.kariyer.net/firma-profil/ornek-111", followers: "16804 takipçi", openJobs: 3, jobsUrl: "https://www.kariyer.net/is-ilanlari?fpi=111" };

test("documented Kariyer tools execute through the chat service with validated inputs and cancellation", async () => {
  let executed = 0, modelCalls = 0;
  const result = await chatWithJob(job, [{ role: "user", content: "Pozisyon 1327 maaşı?" }], settings(), async (_, options) => {
    if (++modelCalls === 1) return toolReply("get_salary_by_position", "salary-1", { positionId: "1327" });
    const body = JSON.parse(options.body);
    assert.equal(JSON.parse(body.messages.at(-1).content).data.minimumSalary, 71000);
    return textReply("Maaş verisi alındı.");
  }, {
    loadJob: async () => ({ ok: true, data: job, fetchedAt: Date.now() }),
    loadCompany: async () => ({ ok: true, data: company }),
    callKariyerTool: async (name, input, signal) => {
      executed++; assert.equal(name, "get_salary_by_position");
      assert.deepEqual(input, { positionId: "1327" }); assert.ok(signal instanceof AbortSignal);
      return { ok: true, data: { minimumSalary: 71000 }, truncated: false, methodAssumed: true };
    },
  });
  assert.equal(result.ok, true); assert.equal(executed, 1); assert.equal(modelCalls, 2);
});

for (const provider of ["openai", "openrouter", "cesurpolat"]) {
  test(`${provider}: model calls both tools then returns final text`, async () => {
    let modelCalls = 0, jobCalls = 0, companyCalls = 0;
    const result = await chatWithJob({}, history, settings(provider), async (_, options) => {
      const body = JSON.parse(options.body);
      modelCalls++;
      if (modelCalls === 1) return toolReply("get_current_job");
      if (modelCalls === 2) {
        const data = JSON.parse(body.messages.at(-1).content);
        assert.equal(body.messages.at(-1).role, "tool");
        assert.equal(data.data.qualifications, "SQL & ERP");
        assert.equal(data.data.secret, undefined);
        return toolReply("get_current_company_stats", "tool-2");
      }
      assert.deepEqual(JSON.parse(body.messages.at(-1).content), { ok: true, data: company });
      assert.doesNotMatch(JSON.stringify(body.messages), /test-key/);
      return textReply();
    }, { loadJob: async () => { jobCalls++; return { ok: true, data: job, fetchedAt: 0 }; },
      loadCompany: async () => { companyCalls++; return { ok: true, data: company }; } });
    assert.deepEqual(result, { ok: true, reply: "Veriler alındı." });
    assert.equal(modelCalls, 3); assert.equal(jobCalls, 2); assert.equal(companyCalls, 1);
  });
}

test("tool failures are data and request tools have no persistent memory", async () => {
  for (const code of ["JOB_CHANGED", "COMPANY_UNAVAILABLE", "COMPANY_PROFILE_ERROR"]) {
    let calls = 0;
    const result = await chatWithJob(job, history, settings(), async (_, options) => {
      if (++calls === 1) {
        assert.equal(JSON.parse(options.body).messages.length, 2);
        return toolReply("get_current_company_stats");
      }
      assert.equal(JSON.parse(JSON.parse(options.body).messages.at(-1).content).code, code);
      return textReply("Şirket bilgisi alınamadı.");
    }, { loadJob: async () => ({ ok: true, data: job, fetchedAt: 0 }), loadCompany: async () => ({ ok: false, code, message: "Alınamadı" }) });
    assert.equal(result.ok, true); assert.equal(calls, 2);
  }
});

test("parallel tool calls can exceed the former eight-call limit", async () => {
  let calls = 0, companyCalls = 0;
  const result = await chatWithJob(job, history, settings(), async () => {
    calls++;
    if (calls > 1) return textReply();
    return Response.json({ choices: [{ index: 0, message: { role: "assistant", content: null,
      tool_calls: Array.from({ length: 12 }, (_, i) => ({ id: "call-" + i, type: "function", function: { name: "get_current_company_stats", arguments: "{}" } })),
    }, finish_reason: "tool_calls" }] });
  }, { loadJob: async () => ({ ok: true, data: job, fetchedAt: 0 }),
    loadCompany: async () => { companyCalls++; return { ok: true, data: company }; } });
  assert.deepEqual(result, { ok: true, reply: "Veriler alındı." }); assert.equal(companyCalls, 12); assert.equal(calls, 2);
});

test("sequential tools can exceed the former call and graph step limits", async () => {
  let modelCalls = 0, toolCalls = 0;
  const result = await chatWithJob(job, history, settings(), async () => {
    modelCalls++;
    return modelCalls <= 40
      ? toolReply("get_current_company_stats", "round-" + modelCalls) : textReply("Analiz tamamlandı.");
  }, {
    loadJob: async () => ({ ok: true, data: job, fetchedAt: 0 }),
    loadCompany: async () => { toolCalls++; return { ok: true, data: company }; },
  });
  assert.deepEqual(result, { ok: true, reply: "Analiz tamamlandı." });
  assert.equal(toolCalls, 40);
  assert.equal(modelCalls, 41);
});

test("unsupported tool model errors do not leak provider bodies", async () => {
  const result = await chatWithJob(job, history, settings(), async () => Response.json({ error: { message: "test-key: tools unsupported", type: "invalid_request_error" } }, { status: 400 }));
  assert.equal(result.code, "TOOLS_UNSUPPORTED"); assert.doesNotMatch(result.message, /test-key/);
});

test("tool schema rejects model supplied URLs and job IDs", async () => {
  let calls = 0, companyCalls = 0;
  const result = await chatWithJob(job, history, settings(), async () => ++calls === 1
    ? toolReply("get_current_company_stats", "call-1", { url: "https://evil.test", jobId: "456" }) : textReply(), {
    loadJob: async () => ({ ok: true, data: job, fetchedAt: 0 }), loadCompany: async () => { companyCalls++; return { ok: true, data: company }; },
  });
  assert.equal(result.ok, true); assert.equal(companyCalls, 0);
});

test("total deadline includes data loading and prevents late model calls", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let release, modelCalls = 0;
  const result = chatWithJob({}, history, settings(), async () => { modelCalls++; return textReply(); }, {
    loadJob: () => new Promise((resolve) => { release = resolve; }), loadCompany: async () => ({ ok: true, data: company }),
  });
  t.mock.timers.tick(CHAT_TIMEOUT_MS);
  assert.equal((await result).code, "TIMEOUT");
  release({ ok: true, data: job, fetchedAt: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(modelCalls, 0);
});

test("deadline aborts an in-flight model fetch", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let ready, signal;
  const started = new Promise((resolve) => { ready = resolve; });
  const pending = chatWithJob(job, history, settings(), (_, options) => new Promise((_, reject) => {
    signal = options.signal; ready();
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  await started; t.mock.timers.tick(CHAT_TIMEOUT_MS);
  assert.equal((await pending).code, "TIMEOUT"); assert.equal(signal.aborted, true);
});

test("CV list and detail conversation can finish after the former 25-second deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let modelCalls = 0;
  const tools = [];
  const result = await chatWithJob(job, [{ role: "user", content: "CV'mi analiz et" }], settings(), async (_, options) => {
    t.mock.timers.tick(10_000);
    assert.equal(options.signal.aborted, false);
    if (++modelCalls === 1) return toolReply("get_resumes", "list");
    if (modelCalls === 2) return toolReply("get_resume", "detail", { resumeId: "example==!e!" });
    assert.equal(JSON.parse(JSON.parse(options.body).messages.at(-1).content).data.summary, "CV özeti");
    return textReply("CV analizi tamamlandı.");
  }, {
    loadJob: async () => ({ ok: true, data: job, fetchedAt: 0 }),
    loadCompany: async () => ({ ok: true, data: company }),
    callKariyerTool: async (name, input, signal) => {
      tools.push(name);
      t.mock.timers.tick(10_000);
      assert.equal(signal.aborted, false);
      if (name === "get_resume") assert.equal(input.resumeId, "example==!e!");
      return { ok: true, data: name === "get_resumes" ? { resumeList: [{ resumeId: "example==!e!" }] } : { summary: "CV özeti" }, truncated: false, methodAssumed: false };
    },
  });
  assert.deepEqual(result, { ok: true, reply: "CV analizi tamamlandı." });
  assert.deepEqual(tools, ["get_resumes", "get_resume"]);
  assert.equal(modelCalls, 3);
});
