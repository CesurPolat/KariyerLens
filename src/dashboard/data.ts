import type { CvVariantSnapshot, DiscoveryJob, TrackedApplication } from "./models.js";

export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const string = (v: unknown, max = 4000): string => typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "";
export function kariyerUrl(value: unknown): string {
  try { const url = new URL(string(value, 2000), "https://www.kariyer.net");
    return url.protocol === "https:" && /^(?:[\w-]+\.)*kariyer\.net$/i.test(url.hostname) && !url.username && !url.password
      ? url.origin + url.pathname : "";
  } catch { return ""; }
}
export function jobIdFromUrl(value: string): string | null {
  try { const url = new URL(value); if (!kariyerUrl(value) || !/^\/is-ilani\//.test(url.pathname)) return null;
    return url.pathname.match(/-(\d{1,16})\/?$/)?.[1] ?? null;
  } catch { return null; }
}
/** Undated timestamps from Kariyer.net are interpreted in its Turkish locale. */
export function dateTime(value: string): number | null {
  const input = value.trim();
  if (!input) return null;
  const day = input.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const calendar = new Date(day + "T00:00:00Z");
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) return null;
  let iso = input;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) iso += "T00:00:00+03:00";
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(input)) iso = input.replace(" ", "T") + "+03:00";
  else if (/ GMT[+-]\d{2}:\d{2}$/.test(input)) iso = input.replace(" ", "T").replace(" GMT", "");
  else if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(input)) return null;
  const n = Date.parse(iso); return Number.isFinite(n) ? n : null;
}
export function isNewJob(job: DiscoveryJob, now = Date.now()): boolean {
  const published = dateTime(job.publishedAt); return published !== null && published <= now && published >= now - 7 * 86400000;
}
export function normalizeApplication(status: unknown, detail: unknown, now: number): TrackedApplication["api"] {
  const s = object(status), d = object(object(detail).applicationDetail);
  if (typeof s.isCandidateAppliedJob !== "boolean") throw new Error("Başvuru durumu beklenen yapıda değil.");
  const rawEvents = object(detail).applicationInteractions;
  if (s.isCandidateAppliedJob && (!d.jobId || !Array.isArray(rawEvents))) throw new Error("Başvuru detayları beklenen yapıda değil.");
  const events = Array.isArray(rawEvents) ? rawEvents.map((v) => { const e = object(v);
    return { id: string(e.interactionStatus, 30) + ":" + string(e.interactionDate, 100),
      text: string(e.interactionStatusText) || "Bilinmeyen etkileşim (" + string(e.interactionStatus, 30) + ")",
      at: string(e.interactionDate, 100), viewed: Number(e.interactionStatus) === 1, source: "api" as const };
  }).slice(0, 100) : [];
  return { applied: s.isCandidateAppliedJob, appliedAt: string(d.appliedDate, 100), cvId: string(d.cvId, 512), cvName: string(d.cvName), events, fetchedAt: now, error: "" };
}
export function mergeApplication(old: TrackedApplication, api: TrackedApplication["api"]): TrackedApplication {
  // No refresh can downgrade the local pipeline or replace user-entered fields.
  const events = [...new Map([...old.api.events, ...api.events].map(e => [e.id, e])).values()].slice(-100);
  return { ...old, status: !old.statusManual && api.applied === true ? "applied" : old.status,
    appliedAt: old.appliedAt || api.appliedAt, api: { ...api, events } };
}
export function variantSuggestion(app: TrackedApplication, variants: CvVariantSnapshot[]): string | null {
  if (!app.api.cvId) return null;
  const matches = variants.filter(v => v.resumeId === app.api.cvId);
  // A mutable remote CV id does not prove which frozen version was submitted.
  return matches.length === 1 ? matches[0].id : null;
}
export function experimentMetrics(apps: TrackedApplication[], variantId: string, from = "", to = "") {
  const start = dateTime(from), end = dateTime(to);
  const samples = apps.filter(a => {
    const at = dateTime(a.appliedAt || a.api.appliedAt);
    return a.variantId === variantId && at !== null && (a.status !== "saved" || a.api.applied === true)
      && (start === null || at >= start) && (end === null || at < end + 86400000);
  });
  const n = samples.length;
  const count = (predicate: (a: TrackedApplication) => boolean) => {
    const value = samples.filter(predicate).length; return { count: value, rate: n ? value / n : null };
  };
  return { applications: n, viewed: count(a => [...a.api.events, ...a.manualEvents].some(e => e.viewed)),
    responded: count(a => a.responded), interviewed: count(a => a.interviewed), offered: count(a => a.offered) };
}
/** Extract before the generic tool budget: filters and unused fields must not truncate job cards. */
export function projectSearch(value: unknown): unknown {
  const data = object(value), jobs = object(data.jobs), filters = object(data.filters);
  const options = (group: unknown) => {
    const items = object(group).items;
    return Array.isArray(items) ? items.slice(0, 200).map(v => { const o = object(v); return { id: string(o.id ?? o.code ?? o.value, 30), name: string(o.name ?? o.text ?? o.title, 200) }; }).filter(o => o.id && o.name) : [];
  };
  const location = object(filters.location);
  return { total: Number(data.totalJobCount) || 0, currentPage: Number(data.currentPage ?? jobs.currentPage) || 1,
    items: Array.isArray(jobs.items) ? jobs.items.slice(0, 12).map(v => { const j = object(v);
      return { id: string(j.id, 16), title: string(j.title, 500), companyName: string(j.companyName, 500), jobUrl: kariyerUrl(j.jobUrl),
        location: string(j.locationText, 300), workModel: string(j.workModelText ?? j.workModel, 100), publishedAt: string(j.publishDate ?? j.publishedAt, 100) };
    }) : null,
    options: { cities: options(filters.cities ?? location.cities ?? filters.locations), workModels: options(filters.workModels) } };
}
export function cvContent(value: unknown): Record<string, unknown> {
  const data = object(value);
  const sections = ["title", "summary", "generalResumeInformation", "jobExperienceInformation", "educationInformation", "foreignLanguageInformation",
    "computerSkillsInformation", "certificateInformation", "examInformation", "qualificationsInformation", "seminarAndCourseInfomation",
    "scholarshipsAndProjectsInformation", "projectsInformation"];
  const clean = (v: unknown, personal = false): unknown => {
    if (Array.isArray(v)) return v.map(x => clean(x, personal));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(object(v))
      .filter(([k]) => !/surname|email|phone|address|birth|gender|photo|military|identity|contact|reference|token|cookie|password/i.test(k) && !(personal && /^(?:name|firstName|lastName)$/i.test(k)))
      .map(([k, x]) => [k, clean(x, personal)]));
    return v;
  };
  return Object.fromEntries(sections.filter(k => data[k] !== undefined).map(k => [k, clean(data[k], k === "generalResumeInformation")]));
}

/** Applied-job search can contain sponsored extras; only normal filtered results are imported. */
export function projectAppliedJobs(value: unknown): unknown {
  const data = object(value), jobs = object(data.jobs);
  return { total: data.totalJobCountWithOutSponsored ?? data.totalJobCount,
    page: data.currentPage ?? jobs.currentPage,
    overflow: Array.isArray(jobs.items) && jobs.items.length > 50,
    items: Array.isArray(jobs.items) ? jobs.items.slice(0, 50).map(value => {
      const job = object(value);
      return { jobId: string(job.id, 30), title: string(job.title, 500), companyName: string(job.companyName, 500),
        jobUrl: kariyerUrl(job.jobUrl), sponsored: job.isSponsored === true || job.isRealSponsored === true };
    }) : null };
}
export function newTrackedApplication(job: { jobId: string; title: string; companyName: string; jobUrl: string }, now = Date.now()): TrackedApplication {
  return { ...job, jobUrl: job.jobUrl || "https://www.kariyer.net/is-ilani/ilan-" + job.jobId, createdAt: now,
    status: "saved", statusManual: false, appliedAt: "", notes: "", followUpAt: "", variantId: "", responded: false, interviewed: false, offered: false,
    manualEvents: [], api: { applied: null, appliedAt: "", cvId: "", cvName: "", events: [], fetchedAt: null, error: "" } };
}
