import { getJob, validateJobId } from "./kariyer-api.js";
import { chatWithJob, validateMessages } from "./chat-api.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
import type { ChatSettings, CompanyStatsResult, ExtensionMessage, JobResult, JobSuccess } from "../shared/types.js";
import { z } from "zod";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, JobSuccess>();

const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
storageReady.catch(() => {});

async function loadJob(jobId: string): Promise<JobResult> {
  const cached = cache.get(jobId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ...cached, cached: true };
  }

  const result = await getJob(jobId);
  if (result.ok) cache.set(jobId, result);
  return result;
}

const companyResultSchema = z.object({
  ok: z.literal(true),
  data: z.object({ companyName: z.string().max(500).nullable(), profileUrl: z.string().max(2000).nullable(),
    followers: z.string().max(100).nullable(), openJobs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    jobsUrl: z.string().max(2000).nullable() }).strict(),
}).strict();

async function loadCompany(jobId: string, sender: chrome.runtime.MessageSender): Promise<CompanyStatsResult> {
  const unavailable: CompanyStatsResult = { ok: false, code: "COMPANY_UNAVAILABLE", message: "Şirket bilgileri alınamadı. İlan sayfasını açık tutup yeniden deneyin." };
  if (sender.tab?.id === undefined) return unavailable;
  try {
    const result: unknown = await chrome.tabs.sendMessage(sender.tab.id, { type: MESSAGE_TYPES.GET_CURRENT_COMPANY_STATS, jobId },
      { frameId: sender.frameId ?? 0, ...(sender.documentId ? { documentId: sender.documentId } : {}) });
    const parsed = companyResultSchema.safeParse(result);
    if (!parsed.success) {
      const code = result && typeof result === "object" && "code" in result ? result.code : undefined;
      if (code === "JOB_CHANGED") return { ok: false, code, message: "Açık ilan değişti. Yeni ilanda yeniden deneyin." };
      if (code === "COMPANY_PROFILE_ERROR") return { ok: false, code, message: "Şirket profili yüklenemedi." };
      return unavailable;
    }
    const origin = new URL(sender.url!).origin;
    for (const [field, path] of [["profileUrl", /^\/firma-profil\/[^/]+\/?$/], ["jobsUrl", /^\/is-ilanlari$/]] as const) {
      const value = parsed.data.data[field];
      if (value && (new URL(value).origin !== origin || !path.test(new URL(value).pathname))) return unavailable;
    }
    return parsed.data;
  } catch { return unavailable; }
}

async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender) {
  if (message.type === MESSAGE_TYPES.OPEN_OPTIONS) {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  const jobId = validateJobId(message.jobId);
  if (!jobId) return { ok: false, code: "INVALID_JOB_ID", message: "Geçerli bir ilan bulunamadı." };
  if (message.type === MESSAGE_TYPES.GET_JOB) return loadJob(jobId);
  if (!validateMessages(message.messages)) return { ok: false, code: "INVALID_MESSAGES", message: "Mesajlar geçersiz veya çok uzun." };
  await storageReady;
  const { chatSettings } = await chrome.storage.local.get<{ chatSettings?: ChatSettings }>("chatSettings");
  return chatWithJob({}, message.messages, chatSettings, fetch, {
    loadJob: () => loadJob(jobId), loadCompany: () => loadCompany(jobId, sender),
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || ![MESSAGE_TYPES.GET_JOB, MESSAGE_TYPES.CHAT_JOB, MESSAGE_TYPES.OPEN_OPTIONS].includes(message?.type)) return;
  if (sender.tab && !/^https:\/\/(?:[\w-]+\.)*kariyer\.net\//i.test(sender.url || "")) return;
  handleMessage(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false, code: "INTERNAL_ERROR", message: "İstek tamamlanamadı. Uzantıyı yeniden yükleyip deneyin." }));
  return true;
});

chrome.action.onClicked.addListener(() => { chrome.runtime.openOptionsPage().catch(() => {}); });
