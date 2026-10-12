import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initialPage, searchPage, detailPage } from "./fixtures/iskur-pages.mjs";
import { handleDashboard, analyzeDashboard } from "../src/dashboard/service.ts";
import { emptyDashboard } from "../src/dashboard/models.ts";
import { accountScope } from "../src/dashboard/store.ts";
import { captureKariyerSession } from "../src/shared/kariyer/kariyer-session.ts";

const db = {}, requests = [];
let mode = "ok", accountId = "98989", providerBody;
const html = body => new Response(body, { headers: { "content-type": "text/html" } });
globalThis.chrome = { storage: { local: {
  async get(key) { return key === "chatSettings" ? { chatSettings: { provider: "openai", providers: { openai: { apiKey: "test", model: "test" } } } } : structuredClone({ [key]: db[key] }); },
  async set(data) { Object.assign(db, structuredClone(data)); },
} } };
for (const origin of ["https://candidatewebapigw.kariyer.net", "https://candidatesearchapigateway.kariyer.net"]) captureKariyerSession({ tabId: 1, initiator: "https://www.kariyer.net", url: origin + "/request", requestHeaders: [{ name: "Authorization", value: "Bearer provider-test" }] });
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input)); requests.push({ url, options });
  if (url.hostname === "api.openai.com") { providerBody = JSON.parse(options.body); return Response.json({ choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Uyum analizi hazır." } }] }); }
  if (url.pathname === "/candidates/base-info") return Response.json({ id: Number(accountId) });
  if (url.hostname === "esube.iskur.gov.tr") {
    if (mode === "iskur-failure") return new Response("error", { status: 503 });
    if (url.pathname.endsWith("AcikIsIlanDetay.aspx")) return html(detailPage(url.searchParams.get("uiID")));
    if (!new URLSearchParams(options.body).has("__EVENTTARGET")) return html(initialPage);
    const body = new URLSearchParams(options.body);
    const page = body.get("__EVENTTARGET").endsWith("CommandItem_Search") ? 1 : Number(body.get("ctl04$ctlDataPagerDetay$txtCurrentPage"));
    return html(searchPage(page, page === 1 ? "00000000123" : "00000000456", { next: page === 1 }));
  }
  if (url.pathname === "/job") return Response.json({ jobGeneralInformation: { id: url.searchParams.get("jobId"), title: "Kariyer React", jobUrl: "/is-ilani/react-" + url.searchParams.get("jobId"), qualifications: "React" }, jobCompanyInformation: { companyName: "Kariyer Şirketi" } });
  if (url.pathname === "/search") {
    if (mode === "kariyer-failure") return new Response("error", { status: 503 });
    const body = JSON.parse(options.body);
    const imported = body.jobProperties.includes("5");
    return Response.json({ data: { currentPage: body.currentPage, totalJobCount: imported ? 1 : 100,
      jobs: { items: [{ id: imported ? "00000000123" : String(body.currentPage * 1000), title: "Kariyer React", jobUrl: "/is-ilani/react-1000", companyName: "AŞ" }] },
      filters: { cities: { items: [{ id: "34", name: "İstanbul" }] }, workModels: { items: [] }, workTypes: { items: [{ id: "full-code", name: "Tam Zamanlı" }, { id: "part-code", name: "Yarı Zamanlı" }] } } } });
  }
  if (url.pathname === "/jb/api/candidates/resumes/view") return Response.json([]);
  if (url.pathname === "/candidates/job_apply_status") return Response.json({ isCandidateAppliedJob: false });
  if (url.pathname === "/get-job-application-detail") return Response.json({ applicationDetail: { jobId: url.searchParams.get("jobId"), cvId: "cv-a", cvName: "CV A", appliedDate: "2026-10-01" }, applicationInteractions: [] });
  if (url.pathname === "/jb/api/candidates/resumes") return Response.json({ totalCount: 1, resumeList: [{ resumeId: "cv-a", resumeName: "CV A" }] });
  if (url.pathname === "/jb/api/candidates/resume") return Response.json({ result: { summary: "TypeScript SQL", contactInformation: { email: "private@example.test" } } });
  throw new Error("Unexpected request " + url.pathname);
};
beforeEach(() => { for (const key of Object.keys(db)) delete db[key]; requests.length = 0; mode = "ok"; providerBody = undefined; accountId = "98989"; });
const invoke = input => handleDashboard(input);
const searchCalls = host => requests.filter(r => r.url.hostname === host && (r.url.pathname === "/search" || r.url.pathname.endsWith("AcikIsIlanAra.aspx")));

test("only selected providers search; first seen and independent pages survive changes to draft filters", async () => {
  const preferences = emptyDashboard().preferences;
  const first = (await invoke({ action: "search", preferences: { ...preferences, providers: ["iskur"] }, page: 1 })).data;
  assert.equal(searchCalls("candidatesearchapigateway.kariyer.net").length, 0); assert.equal(first.iskurDiscovery.jobs.length, 1);
  assert.deepEqual(first.preferences.providers, ["iskur"]);
  const both = (await invoke({ action: "search", preferences, page: 1 })).data;
  assert.equal(both.iskurDiscovery.jobs[0].firstSeenAt, first.iskurDiscovery.jobs[0].firstSeenAt);
  const beforeKariyer = searchCalls("candidatesearchapigateway.kariyer.net").length;
  const second = (await invoke({ action: "search", provider: "iskur", preferences: { ...preferences, keyword: "unapplied draft" }, page: 2 })).data;
  assert.equal(second.iskurDiscovery.currentPage, 2); assert.equal(second.discovery.currentPage, 1);
  assert.equal(second.iskurDiscovery.appliedPreferences.keyword, ""); assert.equal(searchCalls("candidatesearchapigateway.kariyer.net").length, beforeKariyer);
  const nextKariyer = (await invoke({ action: "search", provider: "kariyer", preferences, page: 2 })).data;
  assert.equal(nextKariyer.discovery.currentPage, 2); assert.equal(nextKariyer.iskurDiscovery.currentPage, 2);
});
test("provider failures preserve old pages and do not block the successful provider", async () => {
  const preferences = emptyDashboard().preferences;
  const first = (await invoke({ action: "search", preferences, page: 1 })).data;
  mode = "iskur-failure";
  const partial = (await invoke({ action: "search", preferences: { ...preferences, keyword: "React" }, page: 1 })).data;
  assert.deepEqual(partial.iskurDiscovery.jobs, first.iskurDiscovery.jobs); assert.equal(partial.iskurDiscovery.fetchedAt, first.iskurDiscovery.fetchedAt);
  assert.match(partial.iskurDiscovery.error, /İŞKUR/); assert.equal(partial.discovery.error, ""); assert.equal(partial.discovery.appliedPreferences.keyword, "React");
  mode = "kariyer-failure";
  const opposite = (await invoke({ action: "search", preferences, page: 1 })).data;
  assert.match(opposite.discovery.error, /İstek|isteği|Sunucu/); assert.equal(opposite.iskurDiscovery.error, "");
  mode = "ok";
  const invalid = (await invoke({ action: "search", preferences: { ...preferences, cities: ["invented"] }, page: 1 })).data;
  assert.match(invalid.discovery.error, /Filtre/); assert.equal(invalid.iskurDiscovery.error, "");
});

test("one shared province and employment selection maps to each provider's own filter codes", async () => {
  const prefs = emptyDashboard().preferences;
  await invoke({ action: "search", preferences: prefs, page: 1 });
  requests.length = 0;
  const filters = { province: "istanbul", employmentType: "full-time" };
  const reply = await invoke({ action: "search", preferences: { ...prefs, filters }, page: 1 });
  assert.equal(reply.data.discovery.error, ""); assert.equal(reply.data.iskurDiscovery.error, "");
  const kariyer = JSON.parse(requests.find(r => r.url.pathname === "/search").options.body);
  assert.deepEqual(kariyer.location.cities, ["34"]); assert.deepEqual(kariyer.workTypes, ["full-code"]);
  const iskur = new URLSearchParams(requests.find(r => r.url.pathname.endsWith("AcikIsIlanAra.aspx") && r.options.body).options.body);
  assert.equal(iskur.get("ctl04$ctlIl"), "34"); assert.equal(iskur.get("ctl04$ctlCalismaSekli"), "1");
  assert.deepEqual(reply.data.preferences.filters, filters);
  assert.deepEqual(reply.data.discovery.appliedPreferences.filters, filters);
  const second = await invoke({ action: "search", provider: "kariyer", preferences: { ...prefs, filters: { province: "mugla", employmentType: "part-time" } }, page: 2 });
  assert.deepEqual(second.data.discovery.appliedPreferences.filters, filters);
  const pageRequest = JSON.parse(requests.filter(r => r.url.pathname === "/search").at(-1).options.body);
  assert.deepEqual(pageRequest.location.cities, ["34"]); assert.deepEqual(pageRequest.workTypes, ["full-code"]);
});
test("same numeric identifiers remain separate through tracking, editing, deletion and account changes", async () => {
  const jobId = "00000000123";
  await invoke({ action: "track", provider: "iskur", jobId }); await invoke({ action: "track", jobId });
  let state = (await invoke({ action: "track", provider: "iskur", jobId })).data;
  assert.equal(state.applications.length, 2);
  const iskur = state.applications.find(a => a.provider === "iskur");
  await invoke({ action: "update", provider: "iskur", jobId, patch: { status: "interview", appliedAt: "2026-10-10", notes: "İŞKUR notu", followUpAt: "", variantId: "", responded: true, manualEvents: [] } });
  state = (await invoke({ action: "get" })).data;
  assert.equal(state.applications.find(a => a.provider === "iskur").notes, "İŞKUR notu"); assert.equal(state.applications.find(a => a.provider === "kariyer").notes, "");
  await invoke({ action: "remove", jobId }); state = (await invoke({ action: "get" })).data;
  assert.equal(state.applications.length, 1); assert.equal(state.applications[0].provider, "iskur"); assert.equal(iskur.jobId, jobId);
  accountId = "98990"; assert.equal((await invoke({ action: "get" })).data.applications.length, 0);
});
test("Kariyer refresh and import never query or merge the matching İŞKUR record", async () => {
  const jobId = "00000000123";
  await invoke({ action: "track", provider: "iskur", jobId });
  const before = (await invoke({ action: "get" })).data.applications[0];
  const refreshed = (await invoke({ action: "refresh" })).data;
  assert.deepEqual(refreshed.applications[0], before);
  assert.equal(requests.filter(r => r.url.pathname === "/candidates/job_apply_status").length, 0);
  const imported = await invoke({ action: "importApplications", page: 1, seenJobIds: [] });
  assert.equal(imported.importSummary.added, 1); assert.equal(imported.data.applications.length, 2);
  assert.deepEqual(imported.data.applications.find(a => a.provider === "iskur"), before);
});
test("İŞKUR analysis loads its detail and selected Kariyer CV, exposing no tools or private contacts", async () => {
  const events = [];
  const result = await analyzeDashboard({ scope: await accountScope(accountId), provider: "iskur", jobId: "00000000123", resumeId: "cv-a" }, { enabled: false, onProgress: event => events.push(event) });
  assert.equal(result.ok, true); assert.equal(providerBody.tools?.length ?? 0, 0);
  const prompt = JSON.stringify(providerBody.messages);
  assert.match(prompt, /Yazılım Mühendisi/); assert.match(prompt, /TypeScript SQL/); assert.doesNotMatch(prompt, /private@example|never execute|Bearer/);
  assert.equal(requests.filter(r => r.url.pathname === "/job").length, 0); assert.ok(events.length > 0);
});
