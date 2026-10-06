import { z } from "zod";
import type { Failure } from "../shared/types.js";

const SEARCH = "https://candidatesearchapigateway.kariyer.net";
const CANDIDATE = "https://candidatewebapigw.kariyer.net";
const id = z.string().regex(/^\d{1,16}$/);
const keyword = z.string().trim().min(1).max(200);
const size = z.number().int().min(1).max(50);
const offset = z.number().int().min(0).max(10000);
const empty = z.object({}).strict();
const page = (key: string, count: number) => z.object({ [key]: offset.default(0), size: size.default(count) }).strict();
const codes = z.array(z.string().min(1).max(30)).max(50).optional();
const searchSchema = z.object({
  keyword: keyword.optional(), currentPage: z.number().int().min(1).max(1000).default(1), size: size.default(12),
  memberId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  workModels: codes, jobProperties: codes, sectors: codes, positionLevels: codes, departments: codes,
  workTypes: codes, educationLevels: codes, positions: codes, companyProperties: codes, date: codes, language: codes,
  handicappedStatus: z.string().max(30).optional(), dontShowAppliedJobs: z.boolean().optional(),
  dontShowInspectedJobs: z.boolean().optional(), isEasyApply: z.boolean().optional(),
  workExperience: z.object({ type: z.number().int() }).strict().optional(),
  location: z.object({ cities: codes, districts: codes }).strict().optional(),
  calculateHiddenJobCount: z.boolean().optional(), isSearchFromProfilePage: z.boolean().optional(),
}).strict();

interface Endpoint {
  name: string; description: string; origin: string; path: string;
  schema: z.ZodObject; method?: "POST"; auth?: "bearer" | "apiKey"; assumedGet?: boolean;
  fixed?: Record<string, string | number | boolean>; currentJob?: boolean;
}

/** Fixed endpoints only: neither the model nor a content script can supply a URL or credentials. */
export const KARIYER_TOOLS: Endpoint[] = [
  { name: "get_candidate_base_info", description: "Oturum açmış adayın temel profil bilgilerini getirir.", origin: CANDIDATE, path: "/candidates/base-info", schema: empty, auth: "bearer", assumedGet: true },
  { name: "get_candidate_profile_summary", description: "Adayın deneyim, eğitim ve profil doluluk özetini getirir.", origin: CANDIDATE, path: "/jb/api/candidates/getcandidateinformationforcookie", schema: empty, auth: "bearer", assumedGet: true },
  { name: "get_saved_searches", description: "Adayın kaydedilmiş aramalarını listeler.", origin: SEARCH, path: "/search/savedsearches", schema: page("from", 25), auth: "bearer", assumedGet: true },
  { name: "get_current_job_apply_status", description: "Açık ilana daha önce başvurulup başvurulmadığını ve başvuru uygunluğunu getirir; başvuru yapmaz.", origin: CANDIDATE, path: "/candidates/job_apply_status", schema: empty, auth: "bearer", currentJob: true, assumedGet: true },
  { name: "get_job_recommendations", description: "Açık ilana benzer ilan önerilerini getirir.", origin: SEARCH, path: "/Job/job-detail-recommendations", schema: empty, auth: "bearer", currentJob: true, method: "POST" },
  { name: "get_salary_by_position", description: "Pozisyon kimliği için maaş verisini getirir. Para birimi ve dönem belgede doğrulanmamıştır.", origin: CANDIDATE, path: "/candidates/get-salary-by-position", schema: z.object({ positionId: id }).strict(), auth: "apiKey", assumedGet: true },
  { name: "get_current_job_application_detail", description: "Açık ilana ait aday başvurusunun detayını ve etkileşim geçmişini getirir.", origin: CANDIDATE, path: "/get-job-application-detail", schema: empty, auth: "bearer", currentJob: true, fixed: { isRedirectedJob: false }, assumedGet: true },
  { name: "search_companies", description: "Şirket adıyla şirket arar.", origin: SEARCH, path: "/Search/company", schema: z.object({ Keyword: keyword, Size: size.default(50) }).strict(), fixed: { Type: "Company" }, assumedGet: true },
  { name: "autocomplete_search", description: "Arama metni için şirket ve pozisyon otomatik tamamlama sonuçlarını getirir.", origin: SEARCH, path: "/Search/autocomplete", schema: z.object({ keyword, size: size.default(5) }).strict(), method: "POST", fixed: { category: "All", sourceType: "AutoComplete" } },
  { name: "get_search_suggestions", description: "Arama metni için alternatif şirket ve pozisyon önerileri getirir.", origin: CANDIDATE, path: "/jb/api/search/autocomplete", schema: z.object({ keyword, size: size.default(10) }).strict(), fixed: { category: "All", sourceType: "DidYouMean" } },
  { name: "search_jobs", description: "Anahtar kelime ve belgelenmiş filtre kodlarıyla ilan arar. Kodları tahmin etme; arama filtrelerinden veya kullanıcıdan edin. Kişisel filtreler için memberId aday profilinden alınır.", origin: SEARCH, path: "/search", schema: searchSchema, method: "POST", fixed: { dontAddLog: true } },
  { name: "get_related_searches", description: "Anahtar kelimeyle ilgili arama terimlerini getirir.", origin: SEARCH, path: "/Search/relatedsearch", schema: z.object({ keyword }).strict(), method: "POST" },
  { name: "get_resumes", description: "Adayın özgeçmişlerini listeler; tam CV içeriğini getirmez.", origin: CANDIDATE, path: "/jb/api/candidates/resumes", schema: page("skip", 8), auth: "bearer", assumedGet: true },
  { name: "get_resume_views", description: "Aday özgeçmişlerinin şirketler tarafından görüntülenme kayıtlarını listeler.", origin: CANDIDATE, path: "/jb/api/candidates/resumes/view", schema: page("skip", 8), auth: "bearer", fixed: { ClientType: 1 } },
  { name: "get_cover_letters", description: "Adayın kayıtlı ön yazılarını listeler.", origin: CANDIDATE, path: "/coverletters", schema: page("index", 10), auth: "bearer" },
  { name: "get_followed_companies", description: "Adayın takip ettiği şirketleri listeler.", origin: SEARCH, path: "/Search/my-followed-companies", schema: empty, auth: "bearer" },
  { name: "get_candidate_files", description: "Adayın yüklenmiş dosyalarının listesini getirir; dosya indirmez.", origin: CANDIDATE, path: "/jb/api/common/get-file-list", schema: empty, auth: "bearer" },
  { name: "get_restricted_companies", description: "Adayın kısıtlanan şirketler listesini getirir; kısıtları değiştirmez.", origin: SEARCH, path: "/Search/my-ambargoed-companies", schema: empty, auth: "bearer" },
];

export type KariyerToolResult = { ok: true; data: unknown; truncated: boolean; methodAssumed: boolean } | Failure;
export interface KariyerCredentials { bearer?: string; apiKey?: string }
const failure = (code: string, message: string): Failure => ({ ok: false, code, message });
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

// Never pass session values or signed download links to the model provider.
function sanitize(value: unknown, state: { remaining: number; characters: number; truncated: boolean }, depth = 0): unknown {
  if (state.remaining-- <= 0 || depth > 12) { state.truncated = true; return null; }
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) { try { const url = new URL(value); if (url.search || url.hash) return url.origin + url.pathname; } catch { return null; } }
    const length = Math.max(0, Math.min(4000, state.characters));
    if (value.length > length) state.truncated = true;
    const text = value.slice(0, length);
    state.characters -= text.length;
    return text;
  }
  if (Array.isArray(value)) { if (value.length > 50) state.truncated = true; return value.slice(0, 50).map(item => sanitize(item, state, depth + 1)); }
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !/token|authorization|cookie|password|apikey|secret|encrypt|encrpyt/i.test(key)).slice(0, 100).map(([key, item]) => [key, sanitize(item, state, depth + 1)]));
  return value;
}

export async function callKariyerTool(name: string, input: unknown, jobId: string, credentials: KariyerCredentials = {}, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<KariyerToolResult> {
  const endpoint = KARIYER_TOOLS.find(item => item.name === name);
  if (!endpoint) return failure("UNKNOWN_TOOL", "Bilinmeyen Kariyer.net aracı.");
  const parsed = endpoint.schema.safeParse(input);
  if (!parsed.success || (endpoint.currentJob && !id.safeParse(jobId).success)) return failure("INVALID_ARGUMENTS", "Araç parametreleri geçersiz.");
  if (endpoint.auth && !credentials[endpoint.auth]) return failure("AUTH_REQUIRED", "Kariyer.net hesabınızda oturum açıp ilgili sayfayı yenileyin. Gerekli oturum başlığı henüz alınamadı.");
  const url = new URL(endpoint.path, endpoint.origin);
  const params = { ...parsed.data, ...endpoint.fixed, ...(endpoint.currentJob ? { jobId } : {}) };
  const headers: Record<string, string> = { Accept: "application/json", ClientType: "1" };
  if (credentials.bearer) headers.Authorization = credentials.bearer;
  if (endpoint.auth === "apiKey") headers.ApiKey = credentials.apiKey!;
  if (endpoint.method) headers["Content-Type"] = "application/json;charset=UTF-8";
  else for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  try {
    const response = await fetcher(url, { method: endpoint.method ?? "GET", headers, credentials: "include",
      redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      ...(endpoint.method ? { body: JSON.stringify(params) } : {}) });
    if (response.status === 401 || response.status === 403) return failure("AUTH_REQUIRED", "Kariyer.net oturumu geçersiz veya istek erişim korumasına takıldı. Oturumunuzu yenileyin.");
    if (response.status === 429) return failure("RATE_LIMITED", "Kariyer.net istek sınırına ulaşıldı. Daha sonra deneyin.");
    if (!response.ok) return failure("HTTP_ERROR", `Kariyer.net isteği başarısız oldu (${response.status}).`);
    if (!(response.headers.get("content-type") ?? "").includes("json")) return failure("INVALID_RESPONSE", "Kariyer.net JSON yanıtı vermedi.");
    const raw: unknown = await response.json();
    if (raw === null || typeof raw !== "object") return failure("INVALID_RESPONSE", "Kariyer.net yanıtı beklenen yapıda değil.");
    const envelope = record(raw), header = record(envelope.header);
    if ((envelope.statusCode !== undefined && !["Success", 200, "200"].includes(envelope.statusCode as string | number)) || header.isSuccess === false || envelope.isSuccess === false || record(envelope.body).isSuccess === false)
      return failure("API_ERROR", "Kariyer.net işlemi başarısız olarak bildirdi.");
    const state = { remaining: 2000, characters: 30000, truncated: false };
    return { ok: true, data: sanitize(envelope.data ?? envelope.result ?? envelope.body ?? raw, state), truncated: state.truncated, methodAssumed: Boolean(endpoint.assumedGet) };
  } catch (error) {
    if (signal?.aborted) return failure("CANCELLED", "İstek durduruldu.");
    if (error instanceof Error && /TimeoutError|AbortError/.test(error.name)) return failure("TIMEOUT", "Kariyer.net isteği zaman aşımına uğradı.");
    return failure(error instanceof SyntaxError ? "INVALID_RESPONSE" : "NETWORK_ERROR", "Kariyer.net yanıtı alınamadı.");
  }
}
