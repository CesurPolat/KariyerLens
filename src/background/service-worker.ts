import { handleDashboard, analyzeDashboard, dashboardFailure } from "../dashboard/service.js";
import { jobIdFromUrl } from "../dashboard/data.js";
import { clearMemory, getMemoryJob, getMemoryStatus, hashMemorySession, listMemoryJobs, memoryJobContext, memoryRevision, rememberJob, setMemoryEnabled, withResumeMemory } from "../features/memory/chat-memory.js";
import { pruneJobVisitHistory, recordJobVisit } from "../features/application-history/job-visit-history.js";
import { getJob, validateJobId } from "../shared/kariyer/kariyer-api.js";
import { buildContext, chatWithJob, validateMessages } from "../features/chat/chat-api.js";
import type { ChatStreamOptions } from "../features/chat/chat-api.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
import type { ChatSettings, CompanyStatsResult, ExtensionMessage, JobResult, JobSuccess } from "../shared/types.js";
import { z } from "zod";
import { callKariyerTool, KARIYER_TOOLS } from "../shared/kariyer/kariyer-tools.js";
import { getKariyerCredentials, observeKariyerSession, kariyerSessionReady } from "../shared/kariyer/kariyer-session.js";

observeKariyerSession();

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, JobSuccess>();
const chatSizeSchema = z.object({ width: z.number().finite().positive().max(10000), height: z.number().finite().positive().max(10000) }).strict();
let sizeWrites: Promise<unknown> = Promise.resolve();

const storageReady = Promise.all([chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }), kariyerSessionReady()]);
storageReady.catch(() => {});
void storageReady.then(() => pruneJobVisitHistory()).catch(() => {});

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

const isOptionsSender = (sender: chrome.runtime.MessageSender) => Boolean(sender.url?.startsWith("chrome-extension://")) && sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL("src/options/options.html");

async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender, streaming?: ChatStreamOptions) {
  if (message.type === MESSAGE_TYPES.OPEN_OPTIONS) {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  if (new Set<string>([MESSAGE_TYPES.GET_MEMORY_STATUS, MESSAGE_TYPES.SET_MEMORY_ENABLED, MESSAGE_TYPES.CLEAR_MEMORY, MESSAGE_TYPES.REFRESH_CV_MEMORY]).has(message.type)) {
    // The extension options page may be opened in its own tab.
    if (!isOptionsSender(sender))
      return { ok: false, code: "UNAUTHORIZED", message: "Hafıza ayarlarına erişilemiyor." };
    await storageReady;
    if (message.type === MESSAGE_TYPES.SET_MEMORY_ENABLED) {
      if (typeof message.enabled !== "boolean") return { ok: false, code: "INVALID_ARGUMENTS", message: "Geçersiz hafıza ayarı." };
      await setMemoryEnabled(message.enabled);
    }
    if (message.type === MESSAGE_TYPES.CLEAR_MEMORY) await clearMemory();
    if (message.type === MESSAGE_TYPES.REFRESH_CV_MEMORY) await clearMemory(true);
    return { ok: true, data: await getMemoryStatus() };
  }
  if (message.type === MESSAGE_TYPES.GET_CHAT_SIZE || message.type === MESSAGE_TYPES.SET_CHAT_SIZE) {
    await storageReady;
    if (message.type === MESSAGE_TYPES.SET_CHAT_SIZE) {
      const parsed = chatSizeSchema.safeParse(message.size);
      if (!parsed.success) return { ok: false, code: "INVALID_ARGUMENTS", message: "Geçersiz sohbet boyutu." };
      const write = sizeWrites.then(() => chrome.storage.local.set({ chatPanelSize: parsed.data }));
      sizeWrites = write.catch(() => {});
      await write;
      return { ok: true };
    }
    await sizeWrites;
    const stored = await chrome.storage.local.get("chatPanelSize");
    const parsed = chatSizeSchema.safeParse(stored.chatPanelSize);
    return { ok: true, data: parsed.success ? parsed.data : null };
  }
  const jobId = validateJobId(message.jobId);
  const generalChat = message.type === MESSAGE_TYPES.CHAT_JOB && (message.jobId === "" || message.jobId === undefined);
  if (!jobId && !generalChat) return { ok: false, code: "INVALID_JOB_ID", message: "Geçerli bir ilan bulunamadı." };
  const currentJobId = jobId || "";
  if (message.type === MESSAGE_TYPES.GET_JOB) return loadJob(currentJobId);
  if (message.type === MESSAGE_TYPES.GET_JOB_VISIT) {
    const result = await getJob(currentJobId);
    if (!result.ok) return result;
    const existing = cache.get(currentJobId);
    if (!existing || existing.fetchedAt <= result.fetchedAt) cache.set(currentJobId, result);
    try { await storageReady; } catch {
      return { ...result, history: { measurements: [], status: "unavailable" } };
    }
    const history = await recordJobVisit(currentJobId, result.data.applicationCount, result.fetchedAt);
    return { ...result, history };
  }
  if (!validateMessages(message.messages)) return { ok: false, code: "INVALID_MESSAGES", message: "Mesajlar geçersiz veya çok uzun." };
  await storageReady;
  const { chatSettings } = await chrome.storage.local.get<{ chatSettings?: ChatSettings }>("chatSettings");
  const startedRevision = memoryRevision();
  let recorded = false;
  return chatWithJob({}, message.messages, chatSettings, fetch, {
    hasCurrentJob: !generalChat,
    loadJob: async () => {
      const result = await loadJob(currentJobId);
      if (result.ok && !streaming?.signal?.aborted) {
        const increment = !recorded;
        recorded = true;
        await rememberJob(JSON.parse(buildContext(result.data)), result.fetchedAt, increment, startedRevision);
      }
      return result;
    }, loadCompany: () => loadCompany(currentJobId, sender),
    memory: { context: memoryJobContext, list: listMemoryJobs, get: getMemoryJob },
    callKariyerTool: async (name, input, signal) => {
      const endpoint = KARIYER_TOOLS.find(item => item.name === name);
      const credentials = endpoint ? getKariyerCredentials(endpoint.origin) : {};
      const parsed = endpoint?.schema.safeParse(input);
      const load = async () => {
        const result = await callKariyerTool(name, input, currentJobId, credentials, fetch, signal);
        if (["get_resumes", "get_resume"].includes(name) && endpoint
          && getKariyerCredentials(endpoint.origin).bearer !== credentials.bearer)
          return { ok: false as const, code: "AUTH_REQUIRED", message: "Kariyer.net oturumu değişti. Yeniden deneyin." };
        return result;
      };
      if (!parsed?.success || !["get_resumes", "get_resume"].includes(name)) return load();
      const scope = await hashMemorySession(credentials.bearer);
      const result = await withResumeMemory(name, parsed.data, scope, load, signal);
      if (endpoint && getKariyerCredentials(endpoint.origin).bearer !== credentials.bearer)
        return { ok: false, code: "AUTH_REQUIRED", message: "Kariyer.net oturumu değişti. Yeniden deneyin." };
      return result;
    },
  }, streaming);
}

const dashboardUrl = () => chrome.runtime.getURL("src/dashboard/dashboard.html");
const isDashboardSender = (sender: chrome.runtime.MessageSender) => sender.id === chrome.runtime.id && sender.url === dashboardUrl();
export async function openDashboard() {
  const url = dashboardUrl();
  const existing = (await chrome.tabs.query({})).find(tab => tab.url === url);
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.tabs.create({ url });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === MESSAGE_TYPES.DASHBOARD || message?.type === MESSAGE_TYPES.TRACK_JOB || message?.type === MESSAGE_TYPES.OPEN_DASHBOARD) {
    const fromDashboard = isDashboardSender(sender);
    const fromJob = Boolean(sender.tab && jobIdFromUrl(sender.url ?? ""));
    if (!fromDashboard && !(fromJob && [MESSAGE_TYPES.TRACK_JOB, MESSAGE_TYPES.OPEN_DASHBOARD].includes(message.type))) {
      sendResponse({ ok: false, code: "UNAUTHORIZED", message: "Dashboard erişimi yetkisiz." }); return;
    }
    if (message.type === MESSAGE_TYPES.OPEN_DASHBOARD) {
      openDashboard().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false, code: "INTERNAL_ERROR", message: "Dashboard açılamadı." })); return true;
    }
    if (message.type === MESSAGE_TYPES.TRACK_JOB && (!fromJob || String(message.jobId) !== jobIdFromUrl(sender.url ?? ""))) {
      sendResponse({ ok: false, code: "INVALID_ARGUMENTS", message: "Açık ilan değişti." }); return;
    }
    storageReady.then(() => handleDashboard(message.type === MESSAGE_TYPES.TRACK_JOB ? { action: "track", jobId: message.jobId } : message.payload, fromDashboard ? message.scope : undefined, fromDashboard))
      .then(result => sendResponse(fromDashboard ? result : { ok: true, notice: result.notice }))
      .catch(error => sendResponse(dashboardFailure(error)));
    return true;
  }

  if (sender.id !== chrome.runtime.id || ![MESSAGE_TYPES.GET_JOB, MESSAGE_TYPES.GET_JOB_VISIT, MESSAGE_TYPES.CHAT_JOB, MESSAGE_TYPES.OPEN_OPTIONS, MESSAGE_TYPES.GET_MEMORY_STATUS, MESSAGE_TYPES.SET_MEMORY_ENABLED, MESSAGE_TYPES.CLEAR_MEMORY, MESSAGE_TYPES.REFRESH_CV_MEMORY, MESSAGE_TYPES.GET_CHAT_SIZE, MESSAGE_TYPES.SET_CHAT_SIZE].includes(message?.type)) return;
  if (sender.tab && !isOptionsSender(sender) && !/^https:\/\/(?:[\w-]+\.)*kariyer\.net\//i.test(sender.url || "")) return;
  handleMessage(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false, code: "INTERNAL_ERROR", message: "İstek tamamlanamadı. Uzantıyı yeniden yükleyip deneyin." }));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  const sender = port.sender;
  if (port.name === MESSAGE_TYPES.DASHBOARD_ANALYSIS) {
    if (!sender || !isDashboardSender(sender)) { port.disconnect(); return; }
    const controller = new AbortController(); let started = false, closed = false;
    port.onDisconnect.addListener(() => { closed = true; controller.abort(); });
    const post = (event: unknown) => { if (!closed) { try { port.postMessage(event); } catch { closed = true; controller.abort(); } } };
    port.onMessage.addListener(message => {
      if (started) return; started = true;
      storageReady.then(() => analyzeDashboard(message, { signal: controller.signal, onProgress: post }))
        .then(result => post({ type: "done", result })).catch(error => post({ type: "done", result: dashboardFailure(error) }));
    });
    return;
  }
  if (port.name !== MESSAGE_TYPES.CHAT_STREAM || sender?.id !== chrome.runtime.id || !sender.tab
    || !/^https:\/\/(?:[\w-]+\.)*kariyer\.net\//i.test(sender.url || "")) { port.disconnect(); return; }
  const controller = new AbortController();
  let started = false;
  let closed = false;
  port.onDisconnect.addListener(() => { closed = true; controller.abort(); });
  const post = (event: unknown) => {
    if (closed) return;
    try { port.postMessage(event); } catch { closed = true; controller.abort(); }
  };
  port.onMessage.addListener((message) => {
    if (started || message?.type !== MESSAGE_TYPES.CHAT_JOB) return;
    started = true;
    handleMessage(message, sender, { signal: controller.signal, onProgress: post })
      .then((result) => post({ type: "done", result }))
      .catch(() => post({ type: "done", result: { ok: false, code: "INTERNAL_ERROR", message: "İstek tamamlanamadı. Yeniden deneyin." } }));
  });
});

chrome.action.onClicked.addListener(() => { openDashboard().catch(() => {}); });
