import { z } from "zod";
import type { ChatSettings, Failure } from "../shared/types.js";
import { getJob } from "../shared/kariyer/kariyer-api.js";
import { callKariyerTool, KARIYER_TOOLS } from "../shared/kariyer/kariyer-tools.js";
import { getKariyerCredentials, kariyerSessionReady } from "../shared/kariyer/kariyer-session.js";
import { chatWithJob } from "../features/chat/chat-api.js";
import type { ChatStreamOptions } from "../features/chat/chat-api.js";
import { accountScope, transactDashboard } from "./store.js";
import { dashboardMessageSchema, analysisMessageSchema, discoveryJobSchema, statusLabels, DISCOVERY_PAGE_SIZE } from "./models.js";
import type { DashboardState, ResumeSummary, TrackedApplication, CvVariantSnapshot, ApplicationImportSummary } from "./models.js";
import { object, string, kariyerUrl, dateTime, normalizeApplication, mergeApplication, projectSearch, cvContent, projectAppliedJobs, newTrackedApplication } from "./data.js";

const CANDIDATE = "https://candidatewebapigw.kariyer.net", SEARCH = "https://candidatesearchapigateway.kariyer.net";
export class DashboardError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
function fail(code: string, message: string): never { throw new DashboardError(code, message); }
export function dashboardFailure(error: unknown): Failure {
  return { ok: false, code: error instanceof DashboardError ? error.code : "DASHBOARD_ERROR",
    message: error instanceof DashboardError ? error.message : error instanceof z.ZodError ? "Dashboard verisi geçersiz veya sürümü desteklenmiyor." : "Dashboard işlemi tamamlanamadı. Depolama alanını ve bağlantıyı kontrol edin." };
}
export async function resolveAccount(signal?: AbortSignal) {
  await kariyerSessionReady();
  const tokens: Record<string, string | undefined> = { [CANDIDATE]: getKariyerCredentials(CANDIDATE).bearer, [SEARCH]: getKariyerCredentials(SEARCH).bearer };
  const guard = () => {
    if (signal?.aborted) fail("CANCELLED", "İstek durduruldu.");
    for (const origin of [CANDIDATE, SEARCH]) if (getKariyerCredentials(origin).bearer !== tokens[origin]) fail("AUTH_REQUIRED", "Kariyer.net oturumu değişti. Yeniden bağlanın.");
  };
  if (!tokens[CANDIDATE]) fail("SESSION_NOT_CAPTURED", "Kariyer.net oturum bilgisi uzantıya henüz ulaşmadı. Hesabınız açık olsa bile uzantı ilk yüklendiğinde Kariyer.net profil sayfasını bir kez yenileyip Yeniden bağlan düğmesine basın.");
  const base = await callKariyerTool("get_candidate_base_info", {}, "", { bearer: tokens[CANDIDATE] }, fetch, signal, value => ({ id: object(value).id })); guard();
  if (!base.ok) throw new DashboardError(base.code, base.message);
  const candidateId = string(object(base.data).id, 16);
  if (!/^\d{1,16}$/.test(candidateId)) fail("INVALID_RESPONSE", "Aday hesabı doğrulanamadı.");
  const scope = await accountScope(candidateId); guard();
  const call = async (name: string, input: unknown, jobId = "", project?: (v: unknown) => unknown) => {
    guard(); const endpoint = KARIYER_TOOLS.find(e => e.name === name)!;
    if (endpoint.origin === SEARCH && !tokens[SEARCH]) fail("AUTH_REQUIRED", "İlan araması için Kariyer.net profilindeki Sana Uygun İlanlar bölümünü açıp yenileyin.");
    if (endpoint.origin === SEARCH && tokens[SEARCH] !== tokens[CANDIDATE]) {
      const identity = await callKariyerTool("get_candidate_base_info", {}, "", { bearer: tokens[SEARCH] }, fetch, signal, v => ({ id: object(v).id })); guard();
      if (!identity.ok || string(object(identity.data).id) !== candidateId) fail("AUTH_REQUIRED", "İlan araması oturumu aynı hesaba ait değil. Kariyer.net sayfasını yenileyin.");
    }
    const result = await callKariyerTool(name, input, jobId, { bearer: tokens[endpoint.origin] }, fetch, signal, project); guard();
    if (!result.ok) throw new DashboardError(result.code, result.message); return result;
  };
  const transaction = <T>(fn: (s: DashboardState) => T, save = true) => transactDashboard(scope, guard, fn, save);
  return { candidateId, scope, guard, call, transaction };
}
type Account = Awaited<ReturnType<typeof resolveAccount>>;
async function resumes(account: Account): Promise<ResumeSummary[]> {
  const all: ResumeSummary[] = [];
  for (let skip = 0; skip < 100; skip += 25) {
    const result = await account.call("get_resumes", { skip, size: 25 }, "", v => {
      const data = object(v); return { totalCount: data.totalCount, resumeList: Array.isArray(data.resumeList) ? data.resumeList.map(x => {
        const r = object(x); return { id: r.resumeId, name: r.resumeName, updatedAt: r.lastUpdateDate };
      }) : null };
    });
    const data = object(result.data);
    if (result.truncated || !Array.isArray(data.resumeList)) fail("INVALID_RESPONSE", "CV listesi eksik veya beklenen yapıda değil.");
    const page = data.resumeList.map(v => { const r = object(v); return { id: string(r.id, 512), name: string(r.name), updatedAt: string(r.updatedAt, 100) }; });
    if (page.some(r => !r.id)) fail("INVALID_RESPONSE", "CV kimliği eksik.");
    all.push(...page);
    if (page.length < 25 || all.length >= Number(data.totalCount)) break;
  }
  return [...new Map(all.map(r => [r.id, r])).values()];
}
async function snapshot(account: Account, resume: ResumeSummary, label: "A" | "B"): Promise<CvVariantSnapshot> {
  const result = await account.call("get_resume", { resumeId: resume.id }, "", cvContent);
  const content = object(result.data);
  if (!Object.keys(content).length) fail("INVALID_RESPONSE", "CV içeriği alınamadı; test oluşturulmadı.");
  return { id: crypto.randomUUID(), label, resumeId: resume.id, name: resume.name, content, truncated: result.truncated, fetchedAt: Date.now() };
}
const readState = (account: Account) => account.transaction(s => s, false);
const IMPORT_PAGE_SIZE = 12;
const appliedJobPageSchema = z.object({ total: z.number().int().nonnegative(), page: z.number().int().positive(), overflow: z.literal(false),
  items: z.array(z.object({ jobId: z.string().regex(/^\d{1,16}$/), title: z.string().max(500), companyName: z.string().max(500),
    jobUrl: z.string().max(2000), sponsored: z.boolean() }).strict()).max(50) }).strict();
async function importApplications(account: Account, pageNumber: number, seenJobIds: string[]): Promise<ApplicationImportSummary> {
  const result = await account.call("search_jobs", { memberId: Number(account.candidateId), jobProperties: ["5"],
    isSearchFromProfilePage: true, dontShowAppliedJobs: false, currentPage: pageNumber, size: IMPORT_PAGE_SIZE }, "", projectAppliedJobs);
  const parsed = appliedJobPageSchema.safeParse(result.data);
  if (result.truncated || !parsed.success || parsed.data.page !== pageNumber)
    fail("INVALID_RESPONSE", "Başvuru listesi eksik veya beklenen yapıda değil; mevcut kayıtlar korundu.");
  const page = parsed.data;
  const jobs = [...new Map(page.items.filter(j => !j.sponsored).map(j => [j.jobId, j])).values()];
  const ids = jobs.map(j => j.jobId);
  const summary: ApplicationImportSummary = { added: 0, updated: 0, total: page.total, page: pageNumber, nextPage: null, jobIds: ids, detailErrors: 0, warning: "" };
  if (!jobs.length) {
    if (page.total > 0) summary.warning = "API bu sayfada başvuru kaydı döndürmedi; içe aktarma burada durdu.";
    return summary;
  }
  if (ids.every(id => seenJobIds.includes(id))) { summary.warning = "API aynı başvuru sayfasını tekrar döndürdü; tekrarları eklemeden duruldu."; return summary; }
  const snapshots: { job: typeof jobs[number]; api: TrackedApplication["api"] | null; error: string }[] = [];
  let rateLimited = false;
  for (const job of jobs) {
    let api: TrackedApplication["api"] | null = null, error = "";
    try {
      if (rateLimited) fail("RATE_LIMITED", "İstek sınırı nedeniyle başvuru detayı alınamadı. Başvuruları yenile ile daha sonra deneyin.");
      const detail = await account.call("get_current_job_application_detail", {}, job.jobId, value => {
        const d = object(object(value).applicationDetail);
        return { applicationDetail: { jobId: d.jobId, appliedDate: d.appliedDate, cvId: d.cvId, cvName: d.cvName }, applicationInteractions: object(value).applicationInteractions };
      });
      if (detail.truncated || string(object(object(detail.data).applicationDetail).jobId) !== job.jobId)
        fail("INVALID_RESPONSE", "Başvuru detayı eksik; liste kaydı içe aktarıldı, önceki detaylar korundu.");
      api = normalizeApplication({ isCandidateAppliedJob: true }, detail.data, Date.now());
    } catch (cause) {
      account.guard(); const failure = dashboardFailure(cause);
      if (failure.code === "AUTH_REQUIRED") throw cause;
      if (failure.code === "RATE_LIMITED") { rateLimited = true; summary.warning = "İstek sınırına ulaşıldı; alınan sayfa kaydedildi. Kalan başvurular için daha sonra tekrar içe aktarın."; }
      error = failure.message; summary.detailErrors++;
    }
    snapshots.push({ job, api, error });
  }
  await account.transaction(state => {
    for (const snapshot of snapshots) {
      const index = state.applications.findIndex(a => a.jobId === snapshot.job.jobId);
      if (index < 0 && state.applications.length >= 500) { summary.warning = "500 takip kaydı sınırına ulaşıldı. Yeni kayıtlar için listede yer açın."; continue; }
      const old = index < 0 ? newTrackedApplication({ jobId: snapshot.job.jobId, title: snapshot.job.title || "İlan başlığı bulunamadı",
        companyName: snapshot.job.companyName, jobUrl: snapshot.job.jobUrl }) : state.applications[index];
      // Missing details cannot clear an older successful API snapshot or invent an application date.
      const api = snapshot.api ?? { ...old.api, applied: true, error: snapshot.error };
      const next = mergeApplication(old, api);
      if (index < 0) { state.applications.push(next); summary.added++; }
      else { state.applications[index] = next; summary.updated++; }
    }
    if (!rateLimited && !summary.warning && pageNumber * IMPORT_PAGE_SIZE < page.total && state.applications.length < 500) summary.nextPage = pageNumber + 1;
    if (!summary.warning && state.applications.length >= 500 && pageNumber * IMPORT_PAGE_SIZE < page.total)
      summary.warning = "500 takip kaydı sınırına ulaşıldı; içe aktarma burada durdu.";
  });
  return summary;
}

export async function handleDashboard(input: unknown, expectedScope?: unknown, requireScope = false) {
  const parsed = dashboardMessageSchema.safeParse(input);
  if (!parsed.success) fail("INVALID_ARGUMENTS", "Dashboard isteği geçersiz.");
  const request = parsed.data, account = await resolveAccount();
  if ((requireScope && request.action !== "get") || expectedScope !== undefined) {
    if (typeof expectedScope !== "string" || expectedScope !== account.scope) fail("AUTH_REQUIRED", "Dashboard hesabı değişti. Yeniden bağlanıp işlemi tekrar başlatın.");
  }
  let notice = "";
  let importSummary: ApplicationImportSummary | undefined;
  if (request.action === "resumes") return { ok: true as const, resumes: await resumes(account), notice: "", scope: account.scope };
  if (request.action === "track") {
    const job = await getJob(request.jobId); account.guard(); if (!job.ok) throw new DashboardError(job.code, job.message);
    if (job.data.id !== request.jobId) fail("INVALID_RESPONSE", "İlan kimliği eşleşmedi.");
    await account.transaction(s => {
      if (s.applications.some(a => a.jobId === request.jobId)) { notice = "Bu ilan zaten takip listende."; return; }
      const now = Date.now();
      s.applications.unshift({ jobId: request.jobId, title: job.data.title.slice(0, 4000), companyName: string(job.data.companyName),
        jobUrl: kariyerUrl(job.data.jobUrl) || "https://www.kariyer.net/is-ilani/ilan-" + request.jobId,
        createdAt: now, status: "saved", statusManual: false, appliedAt: "", notes: "", followUpAt: "", variantId: "", responded: false, interviewed: false, offered: false,
        manualEvents: [], api: { applied: null, appliedAt: "", cvId: "", cvName: "", events: [], fetchedAt: null, error: "" } });
    });
  }
  if (request.action === "update") await account.transaction(s => {
    const app = s.applications.find(a => a.jobId === request.jobId); if (!app) fail("NOT_FOUND", "Takip kaydı bulunamadı.");
    const patch = request.patch;
    if (patch.variantId && !s.experiments.some(e => e.variants.some(v => v.id === patch.variantId))) fail("INVALID_ARGUMENTS", "CV sürümü bulunamadı.");
    if ([patch.appliedAt, patch.followUpAt].some(v => v && dateTime(v) === null)) fail("INVALID_ARGUMENTS", "Tarih geçersiz.");
    const changedStatus = app.status !== patch.status;
    if (patch.manualEvents.some(e => !e.text.trim() || dateTime(e.at) === null)) fail("INVALID_ARGUMENTS", "Manuel etkileşim açıklaması veya tarihi geçersiz.");
    Object.assign(app, patch);
    if (changedStatus) app.statusManual = true;
    if (patch.status !== "saved" && !app.appliedAt) app.appliedAt = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
    if (patch.status === "interview" || patch.status === "offer") app.interviewed = true;
    if (patch.status === "offer") app.offered = true;
    if (changedStatus && app.manualEvents.length >= 100) app.manualEvents.shift();
    if (changedStatus) app.manualEvents.push({ id: crypto.randomUUID(), text: "Süreç: " + statusLabels[patch.status], at: new Date().toISOString(), viewed: false, source: "manual" });
  });
  if (request.action === "remove") await account.transaction(s => { s.applications = s.applications.filter(a => a.jobId !== request.jobId); });
  if (request.action === "createExperiment") {
    if (request.resumeA === request.resumeB) fail("INVALID_ARGUMENTS", "A ve B için iki farklı CV seçin.");
    const list = await resumes(account), a = list.find(r => r.id === request.resumeA), b = list.find(r => r.id === request.resumeB);
    if (!a || !b) fail("NOT_FOUND", "Seçilen CV hesapta bulunamadı.");
    const variants: [CvVariantSnapshot, CvVariantSnapshot] = [await snapshot(account, a, "A"), await snapshot(account, b, "B")];
    await account.transaction(s => { s.experiments.unshift({ id: crypto.randomUUID(), name: request.name, createdAt: Date.now(), variants }); });
  }
  if (request.action === "importApplications") {
    importSummary = await importApplications(account, request.page, request.seenJobIds);
    notice = importSummary.added + " yeni başvuru eklendi, " + importSummary.updated + " mevcut kayıt güncellendi.";
    if (!importSummary.total) notice = "Kariyer.net’te içe aktarılacak başvuru bulunamadı.";
    if (importSummary.detailErrors) notice += " " + importSummary.detailErrors + " başvurunun detayı alınamadı; Başvuruları yenile ile tekrar deneyebilirsiniz.";
    if (importSummary.warning) notice += " " + importSummary.warning;
  }
  if (request.action === "refresh") {
    const state = await readState(account); let errors = 0;
    for (const app of state.applications) {
      try {
        const status = await account.call("get_current_job_apply_status", {}, app.jobId, v => ({ isCandidateAppliedJob: object(v).isCandidateAppliedJob }));
        const applied = object(status.data).isCandidateAppliedJob;
        const detail = applied === true ? await account.call("get_current_job_application_detail", {}, app.jobId, v => {
          const d = object(object(v).applicationDetail); return { applicationDetail: { jobId: d.jobId, appliedDate: d.appliedDate, cvId: d.cvId, cvName: d.cvName },
            applicationInteractions: object(v).applicationInteractions };
        }) : { data: {}, truncated: false };
        if (status.truncated || detail.truncated) fail("INVALID_RESPONSE", "Başvuru yanıtı eksik; önceki veriler korundu.");
        if (applied === true && string(object(object(detail.data).applicationDetail).jobId) !== app.jobId) fail("INVALID_RESPONSE", "Başvuru ilan kimliği eşleşmedi.");
        const api = normalizeApplication(status.data, detail.data, Date.now());
        await account.transaction(s => { const index = s.applications.findIndex(a => a.jobId === app.jobId);
          if (index >= 0) s.applications[index] = mergeApplication(s.applications[index], api); });
      } catch (error) {
        account.guard(); errors++;
        const failure = dashboardFailure(error);
        await account.transaction(s => { const current = s.applications.find(a => a.jobId === app.jobId); if (current) current.api.error = failure.message; });
        if (["AUTH_REQUIRED", "RATE_LIMITED"].includes(failure.code)) { notice = failure.message; break; }
      }
    }
    if (!notice) notice = errors ? errors + " kayıt güncellenemedi; önceki verileri korundu." : "Başvuru bilgileri güncellendi.";
  }
  if (request.action === "search") {
    const old = await readState(account), prefs = request.preferences;
    for (const [values, choices] of [[prefs.cities, old.discovery.options.cities], [prefs.workModels, old.discovery.options.workModels]] as const)
      if (values.some(id => !choices.some(o => o.id === id))) fail("INVALID_ARGUMENTS", "Filtre seçenekleri güncel değil. Önce filtresiz yenileyin.");
    const result = await account.call("search_jobs", { memberId: Number(account.candidateId), jobProperties: ["1"],
      calculateHiddenJobCount: true, dontShowAppliedJobs: false, size: DISCOVERY_PAGE_SIZE, currentPage: request.page,
      url: "___kw=" + prefs.keyword.replaceAll("___", " ") + "___opj=1" + (prefs.includeOlder ? "" : "___date=7g") + "___cp=" + request.page, ...(prefs.keyword ? { keyword: prefs.keyword } : {}),
      ...(prefs.cities.length ? { location: { cities: prefs.cities } } : {}), ...(prefs.workModels.length ? { workModels: prefs.workModels } : {}) }, "", projectSearch);
    const data = object(result.data), now = Date.now();
    if (result.truncated || !Array.isArray(data.items)) fail("INVALID_RESPONSE", "İlan araması eksik veya beklenen yapıda değil; önceki sonuçlar korundu.");
    const jobs = data.items.map(v => discoveryJobSchema.parse({ ...object(v), firstSeenAt: now }));
    await account.transaction(s => {
      const seen = { ...s.discovery.seen }; for (const j of jobs) { j.firstSeenAt = seen[j.id] ?? now; seen[j.id] = j.firstSeenAt; }
      const boundedSeen = Object.fromEntries(Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 2000));
      s.preferences = prefs;
      s.discovery = { jobs: [...new Map(jobs.map(j => [j.id, j])).values()], seen: boundedSeen, fetchedAt: now,
        currentPage: request.page, total: Math.max(0, Number(data.total) || 0), options: data.options as DashboardState["discovery"]["options"] };
    });
    notice = (prefs.includeOlder ? "Tüm tarihlerdeki ilanlar güncellendi." : "Son 7 gün filtresiyle ilanlar güncellendi.") + " Her sayfada en fazla 50 ilan gösterilir; diğer sonuçlar için Sonraki düğmesini kullanın.";
  }
  account.guard(); return { ok: true as const, data: await readState(account), notice, scope: account.scope, ...(importSummary ? { importSummary } : {}) };
}
export async function analyzeDashboard(input: unknown, streaming: ChatStreamOptions) {
  const parsed = analysisMessageSchema.safeParse(input);
  if (!parsed.success) fail("INVALID_ARGUMENTS", "Analiz isteği geçersiz.");
  const request = parsed.data, account = await resolveAccount(streaming.signal), state = await readState(account);
  if (request.scope !== account.scope) fail("AUTH_REQUIRED", "Dashboard hesabı değişti. Yeniden bağlanıp analizi tekrar başlatın.");
  let variants: CvVariantSnapshot[];
  if (request.experimentId) {
    const experiment = state.experiments.find(e => e.id === request.experimentId);
    if (!experiment) fail("NOT_FOUND", "CV testi bulunamadı."); variants = experiment.variants;
  } else {
    const resume = (await resumes(account)).find(r => r.id === request.resumeId);
    if (!resume) fail("NOT_FOUND", "Seçili CV hesapta bulunamadı."); variants = [await snapshot(account, resume, "A")];
  }
  const result = await getJob(request.jobId, streaming.signal); account.guard();
  if (!result.ok) return result;
  if (result.data.id !== request.jobId) fail("INVALID_RESPONSE", "İlan kimliği eşleşmedi.");
  const { chatSettings } = await chrome.storage.local.get<{ chatSettings?: ChatSettings }>("chatSettings"); account.guard();
  const reply = await chatWithJob(result.data, [{ role: "user", content: variants.length === 2
    ? "Sabit A ve B CV sürümlerini bu ilan için karşılaştır: uygunluk gerekçeleri, eksik bilgiler ve her sürüm için iyileştirme önerileri ver. Sayısal puan veya kazanan verme."
    : "Seçtiğim CV'nin bu ilana uygunluğunu gerekçeleriyle değerlendir. Eksik bilgiler ve iyileştirme önerileri ver. Sayısal puan verme." }], chatSettings, fetch, undefined,
    { ...streaming, onProgress: event => { account.guard(); streaming.onProgress(event); }, fixedContext: JSON.stringify(variants.map(v => ({ label: v.label, name: v.name, fetchedAt: v.fetchedAt, truncated: v.truncated, content: v.content }))) });
  account.guard(); return reply;
}
