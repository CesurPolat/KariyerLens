import test from "node:test";
import assert from "node:assert/strict";
import { callKariyerTool, KARIYER_TOOLS } from "../src/shared/kariyer/kariyer-tools.ts";
import { captureKariyerSession, getKariyerCredentials } from "../src/shared/kariyer/kariyer-session.ts";

const candidate = "https://candidatewebapigw.kariyer.net";
const search = "https://candidatesearchapigateway.kariyer.net";
const credentials = { bearer: "Bearer session-secret", apiKey: "salary-secret" };

test("every documented endpoint has a fixed origin, method and usable schema", async () => {
  assert.equal(KARIYER_TOOLS.length, 19);
  assert.equal(new Set(KARIYER_TOOLS.map(item => item.name)).size, 19);
  for (const endpoint of KARIYER_TOOLS) {
    const input = endpoint.name === "get_salary_by_position" ? { positionId: "1327" }
      : endpoint.name === "get_resume" ? { resumeId: "example+id/==!e!" }
      : endpoint.name === "search_companies" ? { Keyword: "Örnek" }
      : ["autocomplete_search", "get_search_suggestions", "get_related_searches"].includes(endpoint.name) ? { keyword: "yazılım" } : {};
    let requests = 0;
    const result = await callKariyerTool(endpoint.name, input, "123", credentials, async (url, options) => {
      requests++;
      assert.equal(url.origin, endpoint.origin);
      assert.equal(url.pathname, endpoint.path);
      assert.equal(options.method, endpoint.method ?? "GET");
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "include");
      const params = endpoint.method ? JSON.parse(options.body) : Object.fromEntries(url.searchParams);
      if (endpoint.currentJob) assert.equal(params.jobId, "123");
      if (endpoint.name === "search_jobs") assert.equal(params.dontAddLog, true);
      if (endpoint.auth === "bearer") assert.equal(options.headers.Authorization, credentials.bearer);
      if (endpoint.auth === "apiKey") assert.equal(options.headers.ApiKey, credentials.apiKey);
      return Response.json({ statusCode: "Success", data: { items: [] } });
    });
    assert.equal(result.ok, true, endpoint.name);
    assert.equal(requests, 1);
    assert.equal(result.methodAssumed, Boolean(endpoint.assumedGet));
  }
});

test("unknown tools, injected parameters and missing credentials never fetch", async () => {
  const noFetch = () => assert.fail("unexpected network request");
  for (const [name, input, code] of [
    ["arbitrary_url", {}, "UNKNOWN_TOOL"],
    ["search_jobs", { url: "https://evil.test" }, "INVALID_ARGUMENTS"],
    ["get_current_job_apply_status", { jobId: "456" }, "INVALID_ARGUMENTS"],
    ["get_saved_searches", { size: 51 }, "INVALID_ARGUMENTS"],
    ["get_salary_by_position", { positionId: "../x" }, "INVALID_ARGUMENTS"],
    ["get_resumes", {}, "AUTH_REQUIRED"],
    ["get_resume", {}, "INVALID_ARGUMENTS"],
    ["get_resume", { resumeId: "id&other=value" }, "INVALID_ARGUMENTS"],
    ["get_resume", { resumeId: "example==!e!" }, "AUTH_REQUIRED"],
  ]) assert.equal((await callKariyerTool(name, input, "123", {}, noFetch)).code, code);
});

test("resume list identifiers support a bearer GET detail request without losing special characters", async () => {
  const resumeId = "example+id/==!e!";
  const list = await callKariyerTool("get_resumes", {}, "123", credentials, async () => Response.json({
    statusCode: 200, result: { resumeList: [{ encryptedId: resumeId, resumeName: "Örnek CV", token: "secret" }] },
  }));
  assert.deepEqual(list.data.resumeList, [{ resumeName: "Örnek CV", resumeId }]);
  const result = await callKariyerTool("get_resume", { resumeId: list.data.resumeList[0].resumeId }, "123", credentials, async (url, options) => {
    assert.equal(url.origin, candidate);
    assert.equal(url.pathname, "/jb/api/candidates/resume");
    assert.equal(url.searchParams.get("resumeId"), resumeId);
    assert.match(url.search, /%2B/);
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Authorization, credentials.bearer);
    return Response.json({ version: "1.0", statusCode: 200, result: { resumeId, summary: "Örnek özet", token: "secret" } });
  });
  assert.equal(result.ok, true);
  assert.equal(result.methodAssumed, false);
  assert.deepEqual(result.data, { resumeId, summary: "Örnek özet" });
});

test("all response wrappers preserve data and distinguish API failure from application eligibility", async () => {
  for (const raw of [{ statusCode: "Success", data: { count: 1 } }, { statusCode: 200, result: { count: 1 } }, { header: { isSuccess: true }, body: { count: 1 } }, { count: 1 }]) {
    const result = await callKariyerTool("get_resumes", {}, "123", credentials, async () => Response.json(raw));
    assert.deepEqual(result.data, { count: 1 });
  }
  const result = await callKariyerTool("get_current_job_apply_status", {}, "123", credentials, async () => Response.json({ header: { isSuccess: true }, body: { canApplyJob: false } }));
  assert.equal(result.ok, true);
  assert.equal(result.data.canApplyJob, false);
  for (const raw of [{ statusCode: 500, message: "session-secret" }, { header: { isSuccess: false } }, { body: { isSuccess: false } }])
    assert.equal((await callKariyerTool("get_resumes", {}, "123", credentials, async () => Response.json(raw))).code, "API_ERROR");
});

test("session fields and signed links are removed; large responses indicate truncation", async () => {
  const raw = { cookieValue: "secret", nested: { token: "secret", encryptedId: "secret" }, link: "https://files.test/cv.pdf?signature=secret", items: Array(60).fill({ description: "x".repeat(5000) }) };
  const result = await callKariyerTool("get_candidate_files", {}, "123", credentials, async () => Response.json(raw));
  assert.equal(result.ok, true);
  assert.equal(result.truncated, true);
  assert.doesNotMatch(JSON.stringify(result), /secret|signature/);
  assert.equal(result.data.link, "https://files.test/cv.pdf");
  assert.ok(JSON.stringify(result).length < 35000);
});

test("HTTP, malformed JSON and network errors return safe failures", async () => {
  for (const [response, code] of [[new Response("secret", { status: 401 }), "AUTH_REQUIRED"], [new Response("secret", { status: 429 }), "RATE_LIMITED"], [new Response("secret", { status: 500 }), "HTTP_ERROR"], [new Response("<html>secret</html>"), "INVALID_RESPONSE"], [new Response("bad", { headers: { "Content-Type": "application/json" } }), "INVALID_RESPONSE"]]) {
    const result = await callKariyerTool("get_resumes", {}, "123", credentials, async () => response);
    assert.equal(result.code, code); assert.doesNotMatch(JSON.stringify(result), /secret/);
  }
  assert.equal((await callKariyerTool("get_resumes", {}, "123", credentials, async () => { throw Error("secret"); })).code, "NETWORK_ERROR");
});

test("session capture is restricted to site tabs and never shares credentials across origins", () => {
  const details = { tabId: 1, initiator: "https://www.kariyer.net", url: candidate + "/candidates/base-info", requestHeaders: [{ name: "Authorization", value: credentials.bearer }] };
  captureKariyerSession({ ...details, initiator: "https://evil.test" });
  captureKariyerSession({ ...details, tabId: -1 });
  assert.deepEqual(getKariyerCredentials(candidate), {});
  captureKariyerSession(details);
  assert.deepEqual(getKariyerCredentials(candidate), { bearer: credentials.bearer });
  assert.deepEqual(getKariyerCredentials(search), {});
  const returned = getKariyerCredentials(candidate); returned.bearer = "changed";
  assert.equal(getKariyerCredentials(candidate).bearer, credentials.bearer);
});
