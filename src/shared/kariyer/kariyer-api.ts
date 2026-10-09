import type { Failure, Job, JobResult } from "../types.js";

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const API_ORIGIN = "https://candidatesearchapigateway.kariyer.net";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Only a numeric job id is accepted so extension messages cannot turn this
 * service worker into a generic cross-origin request proxy.
 */
export function validateJobId(value: unknown): string | null {
  const jobId = String(value ?? "").trim();
  return /^\d{1,16}$/.test(jobId) ? jobId : null;
}

function error(code: string, message: string, status?: number): Failure {
  return { ok: false, code, message, ...(status ? { status } : {}) };
}

export function normalizeJob(raw: unknown, jobId: string): Job | null {
  const envelope = record(raw);
  const payload = record(envelope.data ?? envelope.result ?? raw);
  if (!payload.jobGeneralInformation || typeof payload.jobGeneralInformation !== "object" || Array.isArray(payload.jobGeneralInformation)) {
    return null;
  }
  const general = record(payload.jobGeneralInformation);
  const position = record(payload.jobPositionInformation);
  const criteria = record(payload.jobCandidateCriteria);
  const company = record(payload.jobCompanyInformation);
  const statistics = record(payload.jobIstatistics);

  const asText = (value: unknown): string | undefined => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
    return undefined;
  };
  const list = (values: unknown): string[] => Array.isArray(values)
    ? values.map(asText).filter((value): value is string => value !== undefined)
    : [];
  const names = (values: unknown) => Array.isArray(values) ? values.map((item: unknown) => record(item).name) : [];

  return {
    id: asText(general.id) ?? jobId,
    title: asText(general.title) ?? "İlan başlığı bulunamadı",
    jobUrl: asText(general.jobUrl),
    companyName: asText(company?.companyName),
    companyUrl: asText(company?.companyUrl),
    logoUrl: asText(general.squareLogoUrl) ?? asText(general.logoUrlFullPath),
    location: asText(general.locationText),
    employmentType: asText(position?.workTypeText),
    workModel: asText(position?.workModel),
    position: asText(position?.positionName),
    sector: list(names(position.sectors)),
    workAreas: list(names(position.workAreas)),
    publishedAt: asText(general.publishDate),
    jobDateText: asText(general.jobDateText),
    lastModifiedAt: asText(general.lastModifyDate),
    jobDateStatus: asText(general.jobDateStatus),
    closingDate: asText(general.closingDate),
    updateCount: asText(general.versionId),
    applicationReviewText: asText(general.jobApplicationViewDayWithText),
    qualifications: asText(general.qualifications),
    applicationCount: asText(statistics?.totalApplication),
    experience: asText(criteria?.experienceText),
    education: list(criteria?.educationLevelText),
    languages: list(criteria?.languageText),
    isActive: general.isActive === true,
    isEasyApply: general.isEasyApply === true,
  };
}

export async function getJob(jobIdInput: unknown, signal?: AbortSignal): Promise<JobResult> {
  const jobId = validateJobId(jobIdInput);
  if (!jobId) return error("INVALID_JOB_ID", "Geçerli bir sayısal jobId girin.");

  const url = new URL("/job", API_ORIGIN);
  url.searchParams.set("jobId", jobId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    if (response.status === 401 || response.status === 403) {
      const isBotPage = /perimeterx|captcha|access to this page has been denied/i.test(body);
      return error(
        isBotPage ? "BOT_PROTECTION" : "AUTH_REQUIRED",
        isBotPage
          ? "Kariyer.net isteği doğrulama korumasına takıldı. Tarayıcıda normal oturum açıp yeniden deneyin."
          : "Bu ilan verisi için Kariyer.net oturumu veya yetkisi gerekli.",
        response.status,
      );
    }
    if (response.status === 404) return error("NOT_FOUND", "İlan bulunamadı.", 404);
    if (response.status === 429) return error("RATE_LIMITED", "Çok fazla istek gönderildi. Birkaç dakika sonra deneyin.", 429);
    if (!response.ok) return error("HTTP_ERROR", `İstek başarısız oldu (${response.status}).`, response.status);
    if (!contentType.includes("application/json")) {
      return error("INVALID_RESPONSE", "Sunucu JSON yerine beklenmeyen bir yanıt döndürdü.");
    }

    let raw: Record<string, unknown>;
    try {
      raw = record(JSON.parse(body));
    } catch {
      return error("INVALID_RESPONSE", "Sunucudan geçerli JSON alınamadı.");
    }
    if (raw?.statusCode && raw.statusCode !== "Success") {
      return error("API_ERROR", typeof raw.message === "string" && raw.message ? raw.message : "Kariyer.net isteği başarısız oldu.");
    }
    const data = normalizeJob(raw, jobId);
    if (!data) return error("INVALID_RESPONSE", "İlan verisi beklenen yapıda değil.");
    return { ok: true, data, fetchedAt: Date.now() };
  } catch (cause) {
    if (signal?.aborted) return error("CANCELLED", "İstek durduruldu.");
    if (cause instanceof Error && cause.name === "AbortError") return error("TIMEOUT", "İstek zaman aşımına uğradı.");
    return error("NETWORK_ERROR", "Ağ isteği tamamlanamadı.");
  } finally {
    clearTimeout(timer);
  }
}
