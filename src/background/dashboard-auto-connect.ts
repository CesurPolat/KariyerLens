import { getKariyerCredentials, onKariyerBearerCaptured } from "../shared/kariyer/kariyer-session.js";
import type { AutoConnectEvent, DashboardReply } from "../dashboard/ui-types.js";

const CANDIDATE = "https://candidatewebapigw.kariyer.net";
const WAIT_MS = 120_000;

/** The caller must authenticate the dashboard sender before attaching this port. */
export function attachDashboardAutoConnect(port: chrome.runtime.Port, verify: (signal: AbortSignal) => Promise<DashboardReply>) {
  const controller = new AbortController();
  let started = false, closed = false, verifying = false, queued = false, awaitingApplied = false;
  let queuedBearer: string | undefined;
  let ownedTabId: number | undefined;
  let creating = false;
  const earlyCaptures = new Map<number, string>();
  const checkedBearers = new Set<string>();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};

  function cleanup() {
    if (closed) return;
    closed = true;
    controller.abort();
    clearTimeout(timeout);
    unsubscribe();
    chrome.tabs.onRemoved.removeListener(onRemoved);
    earlyCaptures.clear();
    checkedBearers.clear();
  }
  function post(event: AutoConnectEvent) {
    if (closed) return;
    try { port.postMessage(event); } catch { cleanup(); }
  }
  function fail(code: string, message: string) {
    post({ type: "done", result: { ok: false, code, message } });
    cleanup();
  }
  function onRemoved(tabId: number) {
    if (tabId === ownedTabId || tabId === port.sender?.tab?.id) fail("CANCELLED", "Otomatik bağlantı sekmesi kapatıldı. Yeniden deneyin.");
  }

  async function check(initial = false, expectedBearer?: string) {
    if (closed || awaitingApplied) return;
    const bearer = initial ? getKariyerCredentials(CANDIDATE).bearer : expectedBearer;
    // Repeated requests carrying the same rejected session cannot schedule another verification.
    if (bearer && checkedBearers.has(bearer)) return;
    if (verifying) { queued = true; queuedBearer = expectedBearer; return; }
    // A different site tab must not replace the account this attempt is verifying.
    if (!initial && expectedBearer !== getKariyerCredentials(CANDIDATE).bearer) return;
    if (!initial && bearer) checkedBearers.add(bearer);
    verifying = true;
    try {
      const result = await verify(controller.signal);
      if (closed) return;
      if (!initial && expectedBearer !== getKariyerCredentials(CANDIDATE).bearer) {
        if (bearer) checkedBearers.delete(bearer);
        return;
      }
      if (result.ok) {
        awaitingApplied = true;
        post({ type: "connected", result });
        return;
      }
      if (!["AUTH_REQUIRED", "SESSION_NOT_CAPTURED"].includes(result.code)) {
        fail(result.code, result.message); return;
      }
      if (initial) {
        creating = true;
        const tab = await chrome.tabs.create({ url: "https://www.kariyer.net/", active: true });
        creating = false;
        if (closed) return;
        if (tab.id === undefined) throw new Error("Missing tab ID");
        ownedTabId = tab.id;
        queued = earlyCaptures.has(tab.id);
        queuedBearer = earlyCaptures.get(tab.id);
        earlyCaptures.clear();
      }
      post({ type: "status", text: "Bağlantı bekleniyor… Gerekirse Kariyer.net’te giriş yapıp profil sayfana geç." });
    } catch {
      if (!closed) fail("CONNECTION_ERROR", "Otomatik bağlantı kurulamadı. Kariyer.net sekmesini kontrol edip yeniden deneyin.");
    } finally {
      verifying = false;
      if (queued && !closed && !awaitingApplied) { queued = false; void check(false, queuedBearer); }
    }
  }

  async function complete() {
    if (closed || !awaitingApplied) return;
    // Stop observation before closing the tab, so onRemoved cannot turn success into cancellation.
    cleanup();
    let tabCloseFailed = false;
    if (ownedTabId !== undefined) {
      try {
        const tab = await chrome.tabs.get(ownedTabId);
        if (/^https:\/\/(?:[\w-]+\.)*kariyer\.net\//i.test(tab.url ?? "")) await chrome.tabs.remove(ownedTabId);
      } catch { tabCloseFailed = true; }
    }
    try {
      const dashboardId = port.sender?.tab?.id;
      if (dashboardId !== undefined) {
        const dashboard = await chrome.tabs.update(dashboardId, { active: true });
        if (dashboard?.windowId !== undefined) await chrome.windows.update(dashboard.windowId, { focused: true });
      }
    } catch { /* The dashboard may have been closed after applying the result. */ }
    try {
      const event: AutoConnectEvent = { type: "done", result: { ok: true }, ...(tabCloseFailed ? { notice: "Bağlantı kuruldu. Kariyer.net sekmesini elle kapatabilirsin." } : {}) };
      port.postMessage(event);
    } catch { /* A disconnected dashboard needs no further notification. */ }
  }

  port.onDisconnect.addListener(cleanup);
  port.onMessage.addListener(message => {
    if (closed) return;
    if (message?.type === "cancel") { fail("CANCELLED", "Otomatik bağlantı iptal edildi."); return; }
    if (message?.type === "applied") { void complete(); return; }
    if (message?.type !== "start" || started) return;
    started = true;
    chrome.tabs.onRemoved.addListener(onRemoved);
    unsubscribe = onKariyerBearerCaptured(({ tabId, origin }) => {
      if (origin !== CANDIDATE || closed || awaitingApplied) return;
      const bearer = getKariyerCredentials(CANDIDATE).bearer;
      if (!bearer) return;
      if (creating) earlyCaptures.set(tabId, bearer);
      else if (tabId === ownedTabId) void check(false, bearer);
    });
    timeout = setTimeout(() => fail("CONNECTION_TIMEOUT", "Bağlantı 120 saniye içinde kurulamadı. Kariyer.net’te giriş yapıp profil sayfanı açarak yeniden deneyin."), WAIT_MS);
    post({ type: "status", text: "Hesabın doğrulanıyor…" });
    void check(true);
  });
}
