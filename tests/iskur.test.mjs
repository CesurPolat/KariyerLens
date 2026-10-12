import test from "node:test";
import assert from "node:assert/strict";
import { initialPage, searchPage, detailPage } from "./fixtures/iskur-pages.mjs";
import { readIskurForm, iskurSearchBody, parseIskurSearch, parseIskurJob, iskurDate, searchIskur, getIskurJob, resetIskurSessionForms } from "../src/shared/iskur/iskur-api.ts";
import { emptyDashboard, dashboardSchema, dashboardMessageSchema } from "../src/dashboard/models.ts";
import { jobKey, jobReferenceFromUrl } from "../src/shared/job-provider.ts";
import { newTrackedApplication } from "../src/dashboard/data.ts";

const html = body => new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
test("providers default to both and empty/duplicate selections are rejected", () => {
  const prefs = emptyDashboard().preferences;
  assert.deepEqual(prefs.providers, ["kariyer", "iskur"]);
  for (const providers of [[], ["iskur", "iskur"], ["other"]]) assert.equal(dashboardMessageSchema.safeParse({ action: "search", preferences: { ...prefs, providers }, page: 1 }).success, false);
});
test("v1 migration preserves records, preferences and first sighting timestamps", () => {
  const legacy = emptyDashboard(); legacy.version = 1; delete legacy.iskurDiscovery;
  delete legacy.preferences.providers; delete legacy.preferences.iskur;
  legacy.applications = [newTrackedApplication({ jobId: "123", title: "React", companyName: "AŞ", jobUrl: "" })];
  delete legacy.applications[0].provider; legacy.applications[0].notes = "notlar";
  legacy.discovery.seen = { "123": 100 };
  legacy.discovery.jobs = [{ id: "123", title: "React", companyName: "AŞ", jobUrl: "", location: "", workModel: "", publishedAt: "", firstSeenAt: 100 }];
  legacy.discovery.total = 100;
  delete legacy.discovery.hasNext; delete legacy.discovery.totalKnown; delete legacy.discovery.error; delete legacy.discovery.appliedPreferences;
  const result = dashboardSchema.parse(legacy);
  assert.equal(result.version, 2); assert.equal(result.applications[0].provider, "kariyer"); assert.equal(result.applications[0].notes, "notlar");
  assert.equal(result.discovery.seen["kariyer:123"], 100); assert.equal(result.discovery.jobs[0].firstSeenAt, 100); assert.equal(result.discovery.hasNext, true);
  assert.equal(result.iskurDiscovery.fetchedAt, null); assert.equal(legacy.version, 1);
  assert.deepEqual(dashboardSchema.parse(result), result);
});
test("form keeps decoded hidden values and only successful controls; filters use observed names", () => {
  const prefs = { ...emptyDashboard().preferences, keyword: "İş & C++", iskur: { province: "48", employmentType: "2", sector: "kamuRadio" } };
  const body = iskurSearchBody(initialPage, prefs);
  assert.equal(body.get("__VIEWSTATE"), "initial&+=");
  assert.equal(new URLSearchParams(body.toString()).get("__VIEWSTATE"), "initial&+=");
  assert.match(body.toString(), /^__EVENTTARGET=ctl04%24ctlAcikIsPageCommand%24CommandItem_Search&__EVENTARGUMENT=&__LASTFOCUS=&__VIEWSTATE=/);
  assert.equal(body.get("ctl04$ctlArananMetin2"), "İş & C++"); assert.equal(body.get("ctl04$ctlIl"), "48");
  assert.equal(body.get("ctl04$ctlCalismaSekli"), "2"); assert.equal(body.get("ctl04$IsyeriTuruRadios"), "kamuRadio");
  assert.equal(body.get("ctl04$ctlIlanTarihi"), "3"); assert.equal(body.get("checked"), "on");
  for (const field of ["unchecked", "disabled", "save"]) assert.equal(body.has(field), false);
  assert.equal(iskurSearchBody(initialPage, { ...prefs, includeOlder: true }).get("ctl04$ctlIlanTarihi"), "1");
  assert.throws(() => iskurSearchBody(initialPage, { ...prefs, iskur: { ...prefs.iskur, province: "999" } }), /il filtresi/);
  assert.equal(readIskurForm(initialPage).provinces.length, 2);
});
test("observed rows parse popup identifiers and keep publication separate from closing date", () => {
  const result = parseIskurSearch(searchPage(), 1, 200);
  assert.equal(result.jobs[0].id, "00000000123"); assert.equal(result.jobs[0].companyName, "");
  assert.equal(result.jobs[0].title, "Yazılım Mühendisi"); assert.equal(result.jobs[0].publishedAt, ""); assert.equal(result.jobs[0].firstSeenAt, 200);
  assert.equal(result.total, 25); assert.equal(result.hasNext, true); assert.equal(result.commands.find(c => c.jump).target, "ctl04$ctlDataPagerDetay$btnChangeCurrentPage");
  assert.equal(parseIskurSearch(searchPage(1, undefined, { empty: true }), 1).jobs.length, 0);
  for (const invalid of ["<html>Giriş</html>", initialPage, searchPage().replace("PopupJobDetails", "unknownPopup")]) assert.throws(() => parseIskurSearch(invalid, 1));
  assert.throws(() => parseIskurSearch(searchPage(2), 1), /sayfa numarası/);
});
test("pagination reuses latest state, restores earlier pages, and isolates account sessions", async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    assert.equal(options.method, "POST"); assert.equal(options.redirect, "error");
    const body = options.body ? new URLSearchParams(options.body) : null; requests.push(body);
    if (!body?.has("__EVENTTARGET")) { assert.equal(options.body, "__LASTFOCUS="); return html(initialPage); }
    if (body.get("__EVENTTARGET").endsWith("CommandItem_Search")) { assert.ok(["initial&+=", "page-2&+="].includes(body.get("__VIEWSTATE"))); return html(searchPage()); }
    assert.equal(body.get("__VIEWSTATE"), "page-1&+="); assert.equal(body.get("ctl04$ctlDataPagerDetay$txtCurrentPage"), "2");
    return html(searchPage(2, "00000000456", { next: false }));
  };
  const prefs = emptyDashboard().preferences;
  await searchIskur(prefs, 1, "account-a", undefined, fetcher);
  const second = await searchIskur(prefs, 2, "account-a", undefined, fetcher);
  assert.equal(second.jobs[0].id, "00000000456"); assert.equal(second.hasNext, false); assert.equal(requests.length, 3);
  await searchIskur(prefs, 1, "account-a", undefined, fetcher); assert.equal(requests.length, 4);
  await searchIskur(prefs, 2, "account-b", undefined, fetcher); assert.equal(requests.length, 7);
});
test("detail supports guest fields, checks identity and preserves paragraphs without executing script", () => {
  const job = parseIskurJob(detailPage(), "00000000123");
  assert.equal(job.title, "Yazılım Mühendisi"); assert.equal(job.publishedAt, "2026-10-09"); assert.equal(job.closingDate, "2026-11-07");
  assert.equal(job.location, "İSTANBUL\nKADIKÖY"); assert.match(job.qualifications, /Takım çalışması\nTest yazımı/); assert.doesNotMatch(job.qualifications, /never execute|<script>/);
  const guest = parseIskurJob(detailPage(undefined, { guest: true }), "00000000123");
  assert.equal(guest.companyName, ""); assert.equal(guest.isActive, undefined); assert.equal(guest.publishedAt, "");
  assert.throws(() => parseIskurJob(detailPage("00000000999"), "00000000123"), /kimliği/);
  assert.equal(iskurDate("31.2.2026"), ""); assert.equal(iskurDate("7.11.2026"), "2026-11-07");
});
test("request failures and unrecognized detail never appear as an empty success", async () => {
  const prefs = emptyDashboard().preferences;
  for (const status of [403, 429, 500]) await assert.rejects(searchIskur(prefs, 1, "error-" + status, undefined, async () => new Response("bad", { status })));
  assert.equal((await getIskurJob("00000000123", undefined, async () => html("Giriş"))).ok, false);
  assert.equal((await getIskurJob("../bad", undefined, async () => { throw new Error("must not fetch"); })).code, "INVALID_JOB_ID");
});
test("references retain leading zeroes and reject foreign hosts and credentials", () => {
  const iskur = jobReferenceFromUrl("https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=00000000123");
  assert.deepEqual(iskur, { provider: "iskur", jobId: "00000000123" });
  assert.notEqual(jobKey(iskur), jobKey({ provider: "kariyer", jobId: iskur.jobId }));
  for (const url of ["https://evil.test/Istihdam/AcikIsIlanDetay.aspx?uiID=123", "https://user:pass@esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=123", "http://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=123"]) assert.equal(jobReferenceFromUrl(url), null);
});

test("İŞKUR rejection pages stop the request chain even with HTTP 200 and preserve the request id", async () => {
  const blocked = "<html><p>Yapılmaya çalışılan istek reddedildi.</p><p>Istek ID'si: 13182690877907394133</p><a>[Go Back]</a></html>";
  const prefs = emptyDashboard().preferences;
  for (const status of [200, 403]) {
    let calls = 0;
    await assert.rejects(searchIskur(prefs, 1, "blocked-" + status, undefined, async () => {
      calls++; return new Response(blocked, { status, headers: { "content-type": "text/html" } });
    }), error => error.code === "ISKUR_REQUEST_REJECTED" && error.message.includes("13182690877907394133"));
    assert.equal(calls, 1, "a rejected initial POST must not be followed by another POST");
  }
  let calls = 0;
  await assert.rejects(searchIskur(prefs, 2, "blocked-post", undefined, async () => {
    calls++; return html(calls === 1 ? initialPage : blocked);
  }), error => error.code === "ISKUR_REQUEST_REJECTED");
  assert.equal(calls, 2, "a rejected search POST must not be followed by paging or retry");
  const detail = await getIskurJob("00000000123", undefined, async () => html(blocked));
  assert.equal(detail.code, "ISKUR_REQUEST_REJECTED");
});

test("all İŞKUR requests are POST; fresh forms serve refresh, changed filters, backward paging and detail", async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options }); assert.equal(options.method, "POST"); assert.equal(options.redirect, "error");
    assert.equal(options.referrer, ""); assert.equal(options.referrerPolicy, "no-referrer");
    if (String(url).includes("AcikIsIlanDetay.aspx")) return html(detailPage());
    if (!new URLSearchParams(options.body).has("__EVENTTARGET")) { assert.equal(options.body, "__LASTFOCUS="); return html(initialPage); }
    const body = new URLSearchParams(options.body);
    const page = body.get("__EVENTTARGET").endsWith("CommandItem_Search") ? 1 : Number(body.get("ctl04$ctlDataPagerDetay$txtCurrentPage"));
    return html(searchPage(page, "0000000000" + page));
  };
  const prefs = emptyDashboard().preferences;
  await searchIskur(prefs, 1, "post-only", undefined, fetcher); assert.equal(requests.length, 2);
  await searchIskur(prefs, 1, "post-only", undefined, fetcher); assert.equal(requests.length, 3);
  const changed = { ...prefs, keyword: "yazılım" };
  await searchIskur(changed, 1, "post-only", undefined, fetcher); assert.equal(requests.length, 4);
  await searchIskur(changed, 2, "post-only", undefined, fetcher);
  await searchIskur(changed, 3, "post-only", undefined, fetcher);
  const previous = await searchIskur(changed, 2, "post-only", undefined, fetcher);
  assert.equal(requests.length, 7); assert.equal(previous.jobs[0].id, "00000000002");
  assert.equal(new URLSearchParams(requests.at(-1).options.body).get("__VIEWSTATE"), "page-3&+=");
  assert.equal((await getIskurJob("00000000123", undefined, fetcher)).ok, true);
  assert.equal(requests.length, 8); assert.equal(requests.at(-1).options.body, "__LASTFOCUS=");
});

test("opening login clears guest form state so the next search loads the current session's form", async () => {
  let initialCalls = 0;
  const fetcher = async (url, options) => {
    const body = new URLSearchParams(options.body);
    if (!body.has("__EVENTTARGET")) { initialCalls++; return html(initialPage); }
    return html(searchPage());
  };
  const prefs = emptyDashboard().preferences;
  await searchIskur(prefs, 1, "login-reset", undefined, fetcher);
  await searchIskur(prefs, 1, "login-reset", undefined, fetcher);
  assert.equal(initialCalls, 1);
  resetIskurSessionForms();
  await searchIskur(prefs, 1, "login-reset", undefined, fetcher);
  assert.equal(initialCalls, 2);
});
