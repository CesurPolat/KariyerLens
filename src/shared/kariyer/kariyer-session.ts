import type { KariyerCredentials } from "./kariyer-tools.js";

const origins = ["https://candidatewebapigw.kariyer.net", "https://candidatesearchapigateway.kariyer.net"];
const sessions = new Map<string, { credentials: KariyerCredentials; capturedAt: number }>();

/** Observe the site's own requests. Credentials stay in worker memory and never enter tool arguments. */
export function captureKariyerSession(details: chrome.webRequest.OnBeforeSendHeadersDetails): undefined {
  if (details.tabId < 0 || !details.initiator || !/^https:\/\/(?:[\w-]+\.)*kariyer\.net$/i.test(details.initiator)) return;
  const origin = new URL(details.url).origin;
  if (!origins.includes(origin)) return;
  const credentials: KariyerCredentials = { ...getKariyerCredentials(origin) };
  let captured = false;
  for (const header of details.requestHeaders ?? []) {
    if (header.name.toLowerCase() === "authorization" && /^Bearer \S+$/i.test(header.value ?? "")) { credentials.bearer = header.value; captured = true; }
    if (header.name.toLowerCase() === "apikey" && header.value) { credentials.apiKey = header.value; captured = true; }
  }
  if (captured) sessions.set(origin, { credentials, capturedAt: Date.now() });
}

export function getKariyerCredentials(origin: string): KariyerCredentials {
  const session = sessions.get(origin);
  if (!session || Date.now() - session.capturedAt > 30 * 60 * 1000) { sessions.delete(origin); return {}; }
  return { ...session.credentials };
}

export function observeKariyerSession(): void {
  chrome.webRequest?.onBeforeSendHeaders.addListener(captureKariyerSession,
    { urls: origins.map(origin => origin + "/*") }, ["requestHeaders", "extraHeaders"]);
}
