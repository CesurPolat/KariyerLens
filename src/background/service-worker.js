import { getJob, validateJobId } from "./kariyer-api.js";
import { chatWithJob, validateMessages } from "./chat-api.js";
import { MESSAGE_TYPES } from "../shared/messages.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
storageReady.catch(() => {});

async function loadJob(jobId) {
  const cached = cache.get(jobId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ...cached, cached: true };
  }

  const result = await getJob(jobId);
  if (result.ok) cache.set(jobId, result);
  return result;
}

async function handleMessage(message) {
  if (message.type === MESSAGE_TYPES.OPEN_OPTIONS) {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  const jobId = validateJobId(message.jobId);
  if (!jobId) return { ok: false, code: "INVALID_JOB_ID", message: "Geçerli bir ilan bulunamadı." };
  if (message.type === MESSAGE_TYPES.GET_JOB) return loadJob(jobId);
  if (!validateMessages(message.messages)) return { ok: false, code: "INVALID_MESSAGES", message: "Mesajlar geçersiz veya çok uzun." };
  await storageReady;
  const { chatSettings } = await chrome.storage.local.get("chatSettings");
  const provider = chatSettings?.provider || "openai";
  if (!["openai", "openrouter"].includes(provider) || !chatSettings?.providers?.[provider]?.apiKey?.trim() || !chatSettings?.providers?.[provider]?.model?.trim()) return chatWithJob({}, message.messages, chatSettings);
  const job = await loadJob(jobId);
  if (!job.ok) return job;
  return chatWithJob(job.data, message.messages, chatSettings);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !Object.values(MESSAGE_TYPES).includes(message?.type)) return;
  if (sender.tab && !/^https:\/\/(?:[\w-]+\.)*kariyer\.net\//i.test(sender.url || "")) return;
  handleMessage(message).then(sendResponse).catch(() => sendResponse({ ok: false, code: "INTERNAL_ERROR", message: "İstek tamamlanamadı. Uzantıyı yeniden yükleyip deneyin." }));
  return true;
});

chrome.action.onClicked.addListener(() => { chrome.runtime.openOptionsPage().catch(() => {}); });
