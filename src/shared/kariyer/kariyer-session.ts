import type { KariyerCredentials } from "./kariyer-tools.js";

const origins = ["https://candidatewebapigw.kariyer.net", "https://candidatesearchapigateway.kariyer.net"];
const SESSION_KEY = "kariyerLensApiSession";
const SESSION_TTL = 30 * 60 * 1000;
const sessions = new Map<string, { credentials: KariyerCredentials; capturedAt: number }>();

let ready: Promise<void> | undefined;
let writes: Promise<void> = Promise.resolve();
const sessionStorage = () => typeof chrome === "undefined" ? undefined : chrome.storage?.session;

/** Session storage survives worker suspension, stays in RAM and is hidden from content scripts. */
export function kariyerSessionReady(): Promise<void> {
  if (!ready) ready = (async () => {
    const storage = sessionStorage();
    if (!storage) return;
    await storage.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    const stored = (await storage.get(SESSION_KEY))[SESSION_KEY];
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return;
    for (const origin of origins) {
      if (sessions.has(origin)) continue; // Requests observed during hydration are newer.
      const value = (stored as Record<string, { capturedAt?: unknown; credentials?: { bearer?: unknown; apiKey?: unknown } }>)[origin];
      if (!value || typeof value !== "object" || typeof value.capturedAt !== "number" || !Number.isFinite(value.capturedAt) ||
        value.capturedAt > Date.now() || Date.now() - value.capturedAt > SESSION_TTL) continue;
      const credentials: KariyerCredentials = {};
      if (typeof value.credentials?.bearer === "string" && /^Bearer \S+$/i.test(value.credentials.bearer)) credentials.bearer = value.credentials.bearer;
      if (typeof value.credentials?.apiKey === "string" && value.credentials.apiKey) credentials.apiKey = value.credentials.apiKey;
      if (credentials.bearer || credentials.apiKey) sessions.set(origin, { credentials, capturedAt: value.capturedAt });
    }
  })().catch(() => {}); // Live observation still works when session storage is unavailable.
  return ready;
}
function persistSessions(): void {
  const storage = sessionStorage();
  if (!storage) return;
  writes = writes.then(async () => {
    await kariyerSessionReady();
    const current = Object.fromEntries([...sessions].filter(([, value]) => Date.now() - value.capturedAt <= SESSION_TTL));
    await storage.set({ [SESSION_KEY]: current });
  }).catch(() => {});
}

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
  if (captured) { sessions.set(origin, { credentials, capturedAt: Date.now() }); persistSessions(); }
}

export function getKariyerCredentials(origin: string): KariyerCredentials {
  const session = sessions.get(origin);
  if (!session || Date.now() - session.capturedAt > SESSION_TTL) { if (sessions.delete(origin)) persistSessions(); return {}; }
  return { ...session.credentials };
}

export function observeKariyerSession(): void {
  void kariyerSessionReady();
  chrome.webRequest?.onBeforeSendHeaders.addListener(captureKariyerSession,
    { urls: origins.map(origin => origin + "/*") }, ["requestHeaders", "extraHeaders"]);
}
