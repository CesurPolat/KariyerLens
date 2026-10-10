import test from "node:test";
import assert from "node:assert/strict";
import { dashboardSchema, emptyDashboard, dashboardMessageSchema } from "../src/dashboard/models.ts";
import { dateTime, isNewJob, jobIdFromUrl, normalizeApplication, mergeApplication, experimentMetrics, variantSuggestion, cvContent, newTrackedApplication, projectSearch, projectResumeViews } from "../src/dashboard/data.ts";
import { accountScope, transactDashboard } from "../src/dashboard/store.ts";
import { handleDashboard, analyzeDashboard } from "../src/dashboard/service.ts";
import { captureKariyerSession } from "../src/shared/kariyer/kariyer-session.ts";

const db = {};
let currentId = "101", token = "Bearer account-one", cvVersion = "SQL", apiMode = "ok", applied = true, searchCalls = 0, providerCalls = 0, changeDuringBase = false;
let providerBody;
let importMode = "ok", detailMode = "ok";
let viewsMode = "ok";
const importJob = id => ({ id, title: "İçe aktarılan " + id, companyName: "İçe aktarma AŞ", jobUrl: "/is-ilani/ilan-" + id });
const candidate = "https://candidatewebapigw.kariyer.net", search = "https://candidatesearchapigateway.kariyer.net";
globalThis.chrome = { storage: { local: { async get(key) { return key === "chatSettings" ? { chatSettings: { provider: "openai", providers: { openai: { apiKey: "test-secret", model: "test" } } } } : structuredClone({ [key]: db[key] }); }, async set(value) { Object.assign(db, structuredClone(value)); } } } };
function capture(value = token) { token = value; for (const origin of [candidate, search]) captureKariyerSession({ tabId: 1, initiator: "https://www.kariyer.net", url: origin + "/request", requestHeaders: [{ name: "Authorization", value }] }); }
capture();
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  if (url.hostname === "api.openai.com") { providerCalls++; providerBody = JSON.parse(options.body); return Response.json({ choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "CV karşılaştırması hazır." } }] }); }
  if (url.pathname === "/candidates/base-info") { if (changeDuringBase) { changeDuringBase = false; capture("Bearer changed"); } return Response.json({ id: Number(currentId), name: "Private Name", cookieValue: "private-cookie" }); }
  if (url.pathname === "/job") return Response.json({ jobGeneralInformation: { id: url.searchParams.get("jobId"), title: "Frontend geliştirici", jobUrl: "/is-ilani/frontend-123", qualifications: "<p>React SQL</p>", isActive: true }, jobCompanyInformation: { companyName: "Örnek AŞ" } });
  if (url.pathname === "/candidates/job_apply_status") {
    if (apiMode === "401") return new Response("Denied", { status: 401 });
    if (apiMode === "429") return new Response("Limit", { status: 429 });
    if (apiMode === "timeout") throw new DOMException("timeout", "TimeoutError");
    if (apiMode === "invalid") return Response.json({ unknown: true });
    return Response.json({ header: { isSuccess: true }, body: { isCandidateAppliedJob: applied } });
  }
  if (url.pathname === "/get-job-application-detail" && detailMode === "401") return new Response("Denied", { status: 401 });
  if (url.pathname === "/get-job-application-detail" && detailMode === "429") return new Response("Limit", { status: 429 });
  if (url.pathname === "/get-job-application-detail" && detailMode === "missing") return Response.json({ applicationDetail: {} });
  if (url.pathname === "/get-job-application-detail") return Response.json({ applicationDetail: { jobId: url.searchParams.get("jobId"), cvId: "cv+A=", cvName: "CV A", appliedDate: "2026-10-01 12:00:00 GMT+03:00" }, applicationInteractions: [
    { interactionStatus: 1, interactionDate: "2026-10-02T12:00:00", interactionStatusText: "Özgeçmişin Görüntülendi" },
    { interactionStatus: 1, interactionDate: "2026-10-03T12:00:00", interactionStatusText: "Özgeçmişin Görüntülendi" },
    { interactionStatus: 99, interactionDate: "2026-10-04T12:00:00", interactionStatusText: "Bilinmeyen durum" },
  ] });
  if (url.pathname === "/jb/api/candidates/resumes") return Response.json({ statusCode: 200, result: { resumeList: [{ encryptedId: "cv+A=", resumeName: "CV A", lastUpdateDate: "2026-10-01" }, { encryptedId: "cv-B", resumeName: "CV B" }], totalCount: 2 } });
  if (url.pathname === "/jb/api/candidates/resumes/view") {
    assert.equal(url.searchParams.get("skip"), "0"); assert.equal(url.searchParams.get("size"), "8");
    assert.equal(url.searchParams.get("ClientType"), "1");
    if (viewsMode === "switch") capture("Bearer views-switch");
    if (viewsMode === "400" || viewsMode === "429") return new Response("error", { status: Number(viewsMode) });
    if (viewsMode === "invalid") return Response.json({ result: [{ resumeId: "cv+A=", resumeViewList: [{}] }] });
    return Response.json({ result: [{ resumeId: "cv+A=", totalCount: 1, resumeViewList: [
      { resumeName: "CV A", jobId: 123, jobName: "Frontend", companyName: "Örnek", viewDateTime: "2026-10-02T12:00:00", viewCount: 2 }
    ] }] });
  }
  if (url.pathname === "/jb/api/candidates/resume" && apiMode === "cv-empty") return Response.json({ result: {} });
  if (url.pathname === "/jb/api/candidates/resume") return Response.json({ statusCode: 200, result: { title: url.searchParams.get("resumeId"), summary: cvVersion, contactInformation: { email: "private@test" }, name: "Private Name" } });
  if (url.pathname === "/search") {
    const body = JSON.parse(options.body);
    if (body.jobProperties?.includes("5")) {
      assert.equal(body.memberId, Number(currentId)); assert.equal(body.dontShowAppliedJobs, false);
      assert.equal(body.size, 12); assert.equal(body.isSearchFromProfilePage, true);
      if (importMode === "401") return new Response("Denied", { status: 401 });
      if (importMode === "429") return new Response("Limit", { status: 429 });
      if (importMode === "timeout") throw new DOMException("timeout", "TimeoutError");
      if (importMode === "invalid") return Response.json({ data: { jobs: {} } });
      if (importMode === "switch") { capture("Bearer switched-during-import"); }
      const items = importMode === "empty" ? [] : body.currentPage === 1 || importMode === "repeat"
        ? [123, ...Array.from({ length: 11 }, (_, i) => 700 + i)].map(importJob)
        : [711, 712].map(importJob);
      items.push({ ...importJob(999), isSponsored: true });
      return Response.json({ data: { totalJobCount: 15, totalJobCountWithOutSponsored: importMode === "empty" ? 0 : 14,
        currentPage: importMode === "wrong-page" ? 99 : body.currentPage, jobs: { items } } });
    }
    assert.equal(body.size, 50); assert.equal(body.calculateHiddenJobCount, true);
    assert.equal(body.dontShowAppliedJobs, false);
    assert.equal(body.url, "___kw=" + (body.keyword || "") + "___opj=1" + (apiMode === "search-all-dates" ? "" : "___date=7g") + "___cp=" + body.currentPage);
    if (apiMode === "search-paged" || apiMode === "search-all-dates") return Response.json({ data: { totalJobCount: 177, totalJobCountWithOutSponsored: 174, currentPage: body.currentPage, jobs: { items: [
      ...[1, 2, 3].map(id => ({ ...importJob(id), isSponsored: true })),
      ...Array.from({ length: 50 }, (_, i) => ({ ...importJob(body.currentPage * 1000 + i), postingDate: "2026-10-09", jobDateStatus: "New" }))
    ] } } });
    searchCalls++; if (apiMode === "search-invalid") return Response.json({ data: { jobs: {} } });
    const today = new Date().toISOString();
    return Response.json({ statusCode: "Success", data: { totalJobCount: 3, currentPage: 1, jobs: { items: [
      { id: 123, title: "Frontend", companyName: "Örnek", jobUrl: "/is-ilani/frontend-123", publishDate: today, workModel: "Hybrid" },
      { id: 124, title: "Backend", jobUrl: "/is-ilani/backend-124" },
      { id: 125, title: "Eski ilan", jobUrl: "/is-ilani/eski-125", publishDate: "2020-01-01" },
    ] }, filters: { workModels: { items: [{ id: "2", name: "Hibrit" }] }, cities: { items: [{ id: "34", name: "İstanbul Avrupa" }] } } } });
  }
  assert.fail("Unexpected URL " + url);
};
const invoke = input => handleDashboard(input);
const patch = app => ({ status: app.status, appliedAt: "2026-10-01", notes: app.notes, followUpAt: app.followUpAt, variantId: app.variantId, responded: app.responded, manualEvents: app.manualEvents });

test("dashboard validates messages and Kariyer.net job URLs", () => {
  for (const value of ["https://evil.test/is-ilani/test-123", "https://kariyer.net.evil.test/is-ilani/test-123", "https://user:pass@kariyer.net/is-ilani/test-123", "https://www.kariyer.net/firma-profil/foo-123"]) assert.equal(jobIdFromUrl(value), null);
  assert.equal(jobIdFromUrl("https://www.kariyer.net/is-ilani/test-123?x=1"), "123");
  assert.equal(dashboardMessageSchema.safeParse({ action: "track", jobId: "bad" }).success, false);
  assert.equal(dashboardMessageSchema.safeParse({ action: "get", candidateId: "another" }).success, false);
});
test("reads do not search; duplicate tracking and account partition survive token refresh", async () => {
  const first = await invoke({ action: "get" }); assert.equal(first.data.applications.length, 0); assert.equal(searchCalls, 0);
  await invoke({ action: "track", jobId: "123" }); const repeated = await invoke({ action: "track", jobId: "123" });
  assert.equal(repeated.data.applications.length, 1); assert.match(repeated.notice, /zaten/);
  capture("Bearer renewed"); assert.equal((await invoke({ action: "get" })).data.applications.length, 1);
  const originalScope = await accountScope(currentId);
  currentId = "202"; capture("Bearer other");
  await assert.rejects(handleDashboard({ action: "track", jobId: "123" }, originalScope, true), /Dashboard hesabı değişti/); assert.equal((await invoke({ action: "get" })).data.applications.length, 0);
  currentId = "101"; capture("Bearer original"); assert.equal((await invoke({ action: "get" })).data.applications.length, 1);
  assert.equal(Object.keys(db).filter(k => k.includes("kariyerLensDashboard")).length, 1);
  assert.doesNotMatch(JSON.stringify(db), /Bearer|private-cookie|Private Name/);
});
test("refresh retains manual pipeline, notes and unique view measurements", async () => {
  let state = (await invoke({ action: "refresh" })).data;
  assert.equal(state.applications[0].status, "applied");
  state = (await invoke({ action: "update", jobId: "123", patch: { ...patch(state.applications[0]), status: "interview", notes: "Notum", responded: true } })).data;
  assert.equal(state.applications[0].interviewed, true);
  state = (await invoke({ action: "refresh" })).data;
  assert.equal(state.applications[0].status, "interview"); assert.equal(state.applications[0].notes, "Notum");
  assert.equal(state.applications[0].api.events.length, 3); assert.equal(state.applications[0].api.events[2].viewed, false);
  assert.equal(state.applications[0].api.events[2].text, "Bilinmeyen durum");
  const onlyView = mergeApplication({ ...state.applications[0], status: "saved", statusManual: false }, normalizeApplication({ isCandidateAppliedJob: true }, { applicationDetail: { jobId: "123" }, applicationInteractions: [{ interactionStatus: 1 }] }, Date.now()));
  assert.equal(onlyView.status, "applied");
});
test("API failures preserve successful data and update error state", async () => {
  const old = (await invoke({ action: "get" })).data.applications[0];
  for (const mode of ["401", "429", "timeout", "invalid"]) {
    apiMode = mode; const next = (await invoke({ action: "refresh" })).data.applications[0];
    assert.deepEqual(next.api.events, old.api.events); assert.equal(next.api.fetchedAt, old.api.fetchedAt); assert.ok(next.api.error);
    assert.equal(next.notes, "Notum"); assert.equal(next.status, "interview");
  }
  apiMode = "ok";
});
test("two distinct CVs are snapshotted and later modifications do not alter them", async () => {
  await assert.rejects(invoke({ action: "createExperiment", name: "test", resumeA: "cv+A=", resumeB: "cv+A=" }), /iki farklı/);
  let state = (await invoke({ action: "createExperiment", name: "Test", resumeA: "cv+A=", resumeB: "cv-B" })).data;
  assert.equal(state.experiments[0].variants[0].content.summary, "SQL");
  cvVersion = "React changed"; state = (await invoke({ action: "get" })).data;
  assert.equal(state.experiments[0].variants[0].content.summary, "SQL");
  const variants = state.experiments[0].variants;
  assert.equal(variantSuggestion(state.applications[0], variants), variants[0].id);
  assert.equal(variantSuggestion({ ...state.applications[0], api: { ...state.applications[0].api, cvId: "unknown", cvName: "CV A" } }, variants), null);
  assert.equal(variantSuggestion(state.applications[0], [...variants, { ...variants[0], id: "duplicate" }]), null);
  await invoke({ action: "update", jobId: "123", patch: { ...patch(state.applications[0]), variantId: variants[0].id } });
  assert.doesNotMatch(JSON.stringify(db), /private@test|Private Name/);
});
test("A/B denominators exclude unassigned and undated samples; views counted per application", async () => {
  const state = (await invoke({ action: "get" })).data, variantId = state.experiments[0].variants[0].id;
  const sample = state.applications[0];
  const m = experimentMetrics([sample, { ...sample, variantId: "" }, { ...sample, appliedAt: "", api: { ...sample.api, appliedAt: "" } }], variantId);
  assert.equal(experimentMetrics([{ ...sample, status: "saved", api: { ...sample.api, applied: true } }], variantId).applications, 1);
  assert.equal(m.applications, 1); assert.equal(m.viewed.count, 1); assert.equal(m.viewed.rate, 1); assert.equal(m.interviewed.count, 1);
  assert.equal(experimentMetrics([sample], variantId, "2026-10-05", "2026-10-06").applications, 0);
  assert.equal(experimentMetrics([], variantId).viewed.rate, null);
});
test("manual discovery distinguishes publication from first sighting and keeps previous results on invalid responses", async () => {
  const preferences = emptyDashboard().preferences;
  let state = (await invoke({ action: "search", preferences, page: 1 })).data;
  assert.equal(searchCalls, 1); assert.equal(state.discovery.jobs.length, 3); assert.equal(state.discovery.options.workModels[0].id, "2");
  assert.equal(isNewJob(state.discovery.jobs[0]), true); assert.equal(isNewJob(state.discovery.jobs[1]), false); assert.equal(isNewJob(state.discovery.jobs[2]), false);
  const firstSeen = state.discovery.jobs[0].firstSeenAt;
  state = (await invoke({ action: "search", preferences: { ...preferences, cities: ["34"], workModels: ["2"] }, page: 1 })).data;
  assert.equal(state.discovery.jobs[0].firstSeenAt, firstSeen);
  await assert.rejects(invoke({ action: "search", preferences: { ...preferences, cities: ["invented"] }, page: 1 }), /Filtre/);
  apiMode = "search-invalid";
  await assert.rejects(invoke({ action: "search", preferences, page: 1 }), /önceki sonuçlar/);
  assert.deepEqual((await invoke({ action: "get" })).data.discovery, state.discovery); apiMode = "ok";
});
test("session switches and cancelled requests never expose the prior account", async () => {
  changeDuringBase = true;
  await assert.rejects(invoke({ action: "get" }), /oturumu değişti/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(analyzeDashboard({ scope: await accountScope(currentId), jobId: "123", resumeId: "cv+A=" }, { signal: controller.signal, onProgress() {} }), /durduruldu/);
});
test("AI analysis uses frozen CVs, no tool access, and shares provider configuration", async () => {
  const state = (await invoke({ action: "get" })).data, experiment = state.experiments[0];
  const events = [];
  const result = await analyzeDashboard({ scope: await accountScope(currentId), jobId: "123", experimentId: experiment.id }, { enabled: false, onProgress: e => events.push(e) });
  assert.equal(result.ok, true); assert.equal(providerCalls, 1);
  const prompt = JSON.stringify(providerBody.messages);
  assert.match(prompt, /SQL/); assert.doesNotMatch(prompt, /React changed|private@test|private-cookie|Private Name|Bearer/);
  assert.equal(providerBody.tools?.length ?? 0, 0); assert.ok(events.some(e => e.type === "status"));
});
test("storage validates version and guard before reads/writes", async () => {
  const scope = await accountScope("303"); const key = "kariyerLensDashboard:" + scope;
  db[key] = { version: 2 }; await assert.rejects(transactDashboard(scope, () => {}, s => s, false));
  delete db[key]; await assert.rejects(transactDashboard(scope, () => { throw new Error("changed"); }, s => s), /changed/);
  assert.equal(db[key], undefined); assert.equal(dashboardSchema.safeParse(emptyDashboard()).success, true);
  assert.equal(dateTime("not-a-date"), null); assert.equal(dateTime("2026-02-30"), null);
  assert.deepEqual(cvContent({ summary: "SQL", name: "person", contactInformation: { email: "x" } }), { summary: "SQL" });
});

test("empty CV responses leave experiments unchanged and truncated snapshots are explicitly marked", async () => {
  const before = (await invoke({ action: "get" })).data.experiments.length;
  apiMode = "cv-empty";
  await assert.rejects(invoke({ action: "createExperiment", name: "Empty", resumeA: "cv+A=", resumeB: "cv-B" }), /CV içeriği/);
  assert.equal((await invoke({ action: "get" })).data.experiments.length, before);
  apiMode = "ok"; cvVersion = "x".repeat(8000);
  const state = (await invoke({ action: "createExperiment", name: "Large", resumeA: "cv+A=", resumeB: "cv-B" })).data;
  assert.equal(state.experiments[0].variants[0].truncated, true);
  assert.equal(state.experiments[0].variants[0].content.summary.length, 4000);
});
test("reordered application interactions do not create duplicate history", () => {
  const existing = emptyDashboard();
  const events = [{ interactionStatus: 1, interactionDate: "2026-10-01", interactionStatusText: "View" }, { interactionStatus: 3, interactionDate: "2026-10-02", interactionStatusText: "Sent" }];
  const base = normalizeApplication({ isCandidateAppliedJob: true }, { applicationDetail: { jobId: "123" }, applicationInteractions: events }, Date.now());
  const reversed = normalizeApplication({ isCandidateAppliedJob: true }, { applicationDetail: { jobId: "123" }, applicationInteractions: [...events].reverse() }, Date.now());
  const app = { api: base, status: "saved", statusManual: false, appliedAt: "" };
  assert.equal(mergeApplication(app, reversed).api.events.length, 2);
});

test("manual import paginates, excludes sponsored jobs, deduplicates and preserves manual fields and CV assignment", async () => {
  const before = (await invoke({ action: "get" })).data.applications.find(a => a.jobId === "123");
  const scope = await accountScope(currentId);
  const first = await handleDashboard({ action: "importApplications", page: 1, seenJobIds: [] }, scope, true);
  assert.equal(first.importSummary.added, 11); assert.equal(first.importSummary.updated, 1);
  assert.equal(first.importSummary.nextPage, 2);
  const second = await invoke({ action: "importApplications", page: 2, seenJobIds: first.importSummary.jobIds });
  assert.equal(second.importSummary.added, 2); assert.equal(second.importSummary.nextPage, null);
  assert.equal(second.data.applications.length, 14);
  assert.equal(second.data.applications.some(a => a.jobId === "999"), false);
  const existing = second.data.applications.find(a => a.jobId === "123");
  for (const key of ["notes", "status", "statusManual", "variantId", "appliedAt", "manualEvents", "responded", "interviewed"]) assert.deepEqual(existing[key], before[key]);
  const added = second.data.applications.find(a => a.jobId === "700");
  assert.equal(added.status, "applied"); assert.equal(added.api.cvId, "cv+A=");
  assert.equal(added.api.events.filter(e => e.viewed).length, 2);
  assert.ok(added.api.appliedAt); assert.equal(added.variantId, "");
  const repeat = await invoke({ action: "importApplications", page: 1, seenJobIds: [] });
  assert.equal(repeat.importSummary.added, 0); assert.equal(repeat.data.applications.length, 14);
});
test("import empty, malformed and failed pages retain successful records", async () => {
  const before = (await invoke({ action: "get" })).data;
  try {
    importMode = "empty";
    const empty = await invoke({ action: "importApplications" });
    assert.equal(empty.importSummary.total, 0); assert.equal(empty.importSummary.nextPage, null);
    for (const mode of ["invalid", "wrong-page", "401", "429", "timeout", "switch"]) {
      importMode = mode;
      await assert.rejects(invoke({ action: "importApplications" }), mode);
      assert.deepEqual((await invoke({ action: "get" })).data, before);
    }
  } finally { importMode = "ok"; }
});
test("import detail failures preserve API snapshots and never invent dates or CV matches", async () => {
  const before = (await invoke({ action: "get" })).data.applications.find(a => a.jobId === "123");
  try {
    detailMode = "missing";
    const missing = await invoke({ action: "importApplications" });
    const old = missing.data.applications.find(a => a.jobId === "123");
    assert.deepEqual(old.api.events, before.api.events); assert.equal(old.api.fetchedAt, before.api.fetchedAt);
    assert.equal(missing.importSummary.detailErrors, 12); assert.ok(old.api.error);
    currentId = "909"; capture("Bearer import-isolated");
    const fresh = await invoke({ action: "importApplications" });
    const app = fresh.data.applications[0];
    assert.equal(app.api.applied, true); assert.equal(app.status, "applied");
    assert.equal(app.appliedAt, ""); assert.equal(app.api.appliedAt, ""); assert.equal(app.api.cvId, "");
    detailMode = "401";
    const unchanged = (await invoke({ action: "get" })).data;
    await assert.rejects(invoke({ action: "importApplications" }));
    assert.deepEqual((await invoke({ action: "get" })).data, unchanged);
    detailMode = "429";
    const limited = await invoke({ action: "importApplications" });
    assert.equal(limited.importSummary.nextPage, null); assert.match(limited.importSummary.warning, /sınır/);
    await assert.rejects(handleDashboard({ action: "importApplications" }, await accountScope("101"), true), /hesabı değişti/);
  } finally { currentId = "101"; capture("Bearer import-restored"); detailMode = "ok"; }
});
test("import stops repeated API pages and respects the 500 record limit without eviction", async () => {
  try {
    importMode = "repeat";
    const first = await invoke({ action: "importApplications" });
    const repeated = await invoke({ action: "importApplications", page: 2, seenJobIds: first.importSummary.jobIds });
    assert.equal(repeated.importSummary.added, 0); assert.equal(repeated.importSummary.nextPage, null);
    assert.match(repeated.importSummary.warning, /tekrar/);
    importMode = "ok"; currentId = "910"; capture("Bearer full-import");
    const scope = await accountScope(currentId);
    await transactDashboard(scope, () => {}, state => {
      const source = newTrackedApplication({ jobId: "10000", title: "Kayıt", companyName: "", jobUrl: "" });
      state.applications = Array.from({ length: 499 }, (_, i) => ({ ...structuredClone(source), jobId: String(10000 + i) }));
    });
    const full = await invoke({ action: "importApplications" });
    assert.equal(full.data.applications.length, 500); assert.equal(full.importSummary.added, 1);
    assert.equal(full.importSummary.nextPage, null); assert.match(full.importSummary.warning, /500/);
    assert.ok(full.data.applications.some(a => a.jobId === "10498"));
  } finally { importMode = "ok"; currentId = "101"; capture("Bearer import-restored"); }
});

test("missing captured session is distinguished from rejected login and personal state stays inaccessible", async () => {
  const clock = Date.now;
  const expired = clock() + 31 * 60 * 1000;
  try {
    Date.now = () => expired;
    await assert.rejects(invoke({ action: "get" }), error => {
      assert.equal(error.code, "SESSION_NOT_CAPTURED");
      assert.match(error.message, /henüz ulaşmadı/);
      return true;
    });
  } finally { Date.now = clock; capture("Bearer restored-after-expiry"); }
});

test("discovery keeps all 50 normal results after sponsored extras and reads only confirmed publication dates", () => {
  const jobs = [...[1, 2, 3].map(id => ({ ...importJob(id), isSponsored: true })),
    ...Array.from({ length: 50 }, (_, i) => ({ ...importJob(1000 + i), postingDate: "2026-10-09", jobDateStatus: i ? "New" : "Updated" }))];
  const projected = projectSearch({ totalJobCount: 177, totalJobCountWithOutSponsored: 174, currentPage: 1, jobs: { items: jobs } });
  assert.equal(projected.items.length, 50); assert.equal(projected.total, 174);
  assert.equal(projected.items[0].id, "1000"); assert.equal(projected.items[49].id, "1049");
  assert.equal(projected.items[0].publishedAt, ""); // An update date cannot be called a publication date.
  assert.equal(projected.items[1].publishedAt, "2026-10-09");
});
test("discovery sends the observed URL filter and returns later pages without cutting the 50 result page", async () => {
  try {
    apiMode = "search-paged";
    const preferences = { ...emptyDashboard().preferences, keyword: "yazılım" };
    const first = await invoke({ action: "search", preferences, page: 1 });
    assert.equal(first.data.discovery.jobs.length, 50); assert.equal(first.data.discovery.total, 174);
    const second = await invoke({ action: "search", preferences, page: 2 });
    assert.equal(second.data.discovery.currentPage, 2); assert.equal(second.data.discovery.jobs.length, 50);
    assert.equal(second.data.discovery.jobs[0].id, "2000");
    assert.ok(second.data.discovery.jobs.every(j => !first.data.discovery.jobs.some(old => old.id === j.id)));
  } finally { apiMode = "ok"; }
});

test("including older jobs removes the API date restriction and stays selected on subsequent pages", async () => {
  try {
    apiMode = "search-all-dates";
    const preferences = { ...emptyDashboard().preferences, keyword: "yazılım", includeOlder: true };
    const first = await invoke({ action: "search", preferences, page: 1 });
    assert.equal(first.data.preferences.includeOlder, true); assert.match(first.notice, /Tüm tarihler/);
    const second = await invoke({ action: "search", preferences: first.data.preferences, page: 2 });
    assert.equal(second.data.preferences.includeOlder, true); assert.equal(second.data.discovery.currentPage, 2);
  } finally { apiMode = "ok"; }
});
test("previously saved discovery preferences default to the existing seven-day search", () => {
  const legacy = emptyDashboard(); delete legacy.preferences.includeOlder;
  assert.equal(dashboardSchema.parse(legacy).preferences.includeOlder, false);
});

test("legacy dashboards default CV view state without losing existing data", () => {
  const legacy = emptyDashboard(); delete legacy.resumeViews;
  const parsed = dashboardSchema.parse(legacy);
  assert.deepEqual(parsed.resumeViews, { records: [], fetchedAt: null, partial: true, error: "" });
  assert.deepEqual(parsed.applications, legacy.applications);
});

test("CV identity automatically groups existing applications per test and overrides conflicting manual choices", () => {
  const sample = newTrackedApplication({ jobId: "123", title: "Test", companyName: "", jobUrl: "" }, Date.now());
  Object.assign(sample, { status: "applied", appliedAt: "2026-10-01", variantId: "manual-B" });
  Object.assign(sample.api, { applied: true, cvId: "cv-A", cvName: "Same name" });
  const apps = [sample, { ...sample, jobId: "124", api: { ...sample.api, cvId: "unknown" } },
    { ...sample, jobId: "125", appliedAt: "" }];
  assert.equal(experimentMetrics(apps, "test-one-A", "", "", "cv-A").applications, 1);
  assert.equal(experimentMetrics(apps, "test-two-A", "", "", "cv-A").applications, 1);
  assert.equal(experimentMetrics(apps, "manual-B", "", "", "cv-B").applications, 0);
  assert.equal(sample.variantId, "manual-B");
  assert.equal(experimentMetrics([{ ...sample, api: { ...sample.api, cvId: "" } }], "manual-B", "", "", "cv-B").applications, 1);
  assert.equal(experimentMetrics(apps, "test-one-A", "2026-10-02", "", "cv-A").applications, 0);
});

test("CV views separate CV and job identities, deduplicate rate sources, and keep aggregate counts separate", () => {
  const sample = newTrackedApplication({ jobId: "123", title: "Test", companyName: "", jobUrl: "" }, Date.now());
  Object.assign(sample, { status: "applied", appliedAt: "2026-10-01" });
  Object.assign(sample.api, { applied: true, cvId: "cv-A" });
  const row = { resumeId: "cv-A", resumeName: "Same name", jobId: "123", jobName: "Test", companyName: "Test", viewedAt: "2026-10-02", viewCount: 3 };
  const views = [row, { ...row, jobId: "999", viewCount: 2 }, { ...row, resumeId: "cv-B", viewCount: 7 }];
  let metrics = experimentMetrics([sample], "A", "", "", "cv-A", views);
  assert.equal(metrics.viewed.count, 1); assert.equal(metrics.totalViews, 5);
  sample.api.events = [{ id: "view", text: "View", at: "2026-10-02", viewed: true, source: "api" }];
  metrics = experimentMetrics([sample], "A", "", "", "cv-A", views);
  assert.equal(metrics.viewed.rate, 1); assert.equal(metrics.viewed.count, 1);
  assert.equal(experimentMetrics([{ ...sample, api: { ...sample.api, events: [] } }], "A", "", "", "cv-A", views.slice(1)).viewed.count, 0);
  assert.equal(experimentMetrics([sample], "A", "", "2026-10-01", "cv-A", views).totalViews, 0);
});

test("CV view projection bounds records, preserves counts, and rejects malformed records", () => {
  const row = { resumeName: "CV", jobId: 123, jobName: "Job", companyName: "Company", viewDateTime: "2026-10-02T12:00:00", viewCount: 2 };
  const projected = projectResumeViews([{ resumeId: "cv", resumeViewList: [row, row, ...Array.from({ length: 120 }, (_, i) => ({ ...row, jobId: 200 + i }))] }]);
  assert.equal(projected.records.length, 100); assert.equal(projected.partial, true);
  assert.equal(projected.records[0].viewCount, 2);
  for (const raw of [{}, [{ resumeId: "cv" }], [{ resumeId: "cv", resumeViewList: [{ ...row, viewCount: -1 }] }],
    [{ resumeId: "cv", resumeViewList: [{ ...row, viewDateTime: "invalid" }] }]]) assert.throws(() => projectResumeViews(raw));
});

test("refresh saves CV views, preserves successful cache on failures, and isolates accounts", async () => {
  viewsMode = "ok";
  const good = (await invoke({ action: "refresh" })).data.resumeViews;
  assert.equal(good.records.length, 1); assert.equal(good.records[0].resumeId, "cv+A="); assert.ok(good.fetchedAt);
  for (const mode of ["400", "invalid", "429"]) {
    viewsMode = mode;
    const next = (await invoke({ action: "refresh" })).data.resumeViews;
    assert.deepEqual(next.records, good.records); assert.equal(next.fetchedAt, good.fetchedAt); assert.ok(next.error);
  }
  viewsMode = "switch";
  await assert.rejects(invoke({ action: "refresh" }), /oturumu değişti/);
  viewsMode = "ok";
  const prior = currentId; currentId = "90909"; capture("Bearer view-account");
  assert.equal((await invoke({ action: "get" })).data.resumeViews.records.length, 0);
  currentId = prior; capture("Bearer view-account-restored");
  assert.deepEqual((await invoke({ action: "get" })).data.resumeViews.records, good.records);
});
