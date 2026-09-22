import { getJob } from "./kariyer-api.js";
import { MESSAGE_TYPES } from "../shared/messages.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MESSAGE_TYPES.GET_JOB) return;

  const jobId = String(message.jobId ?? "").trim();
  const cached = cache.get(jobId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    sendResponse({ ...cached, cached: true });
    return;
  }

  getJob(jobId).then((result) => {
    if (result.ok) cache.set(jobId, result);
    sendResponse(result);
  });
  return true;
});
