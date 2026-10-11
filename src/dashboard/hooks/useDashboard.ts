import { useEffect, useRef, useState } from "react";
import { MESSAGE_TYPES } from "../../shared/messages.js";
import type { Failure } from "../../shared/types.js";
import type { DashboardState, ResumeSummary } from "../models.js";
import type { Act, AutoConnectEvent, DashboardReply } from "../ui-types.js";
import { useDashboardAnalysis } from "./useDashboardAnalysis.js";
import { loadAutoConnectPreference, saveAutoConnectPreference } from "../connection-preference.js";

export function useDashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(""), [error, setError] = useState<Failure | null>(null);
  const [cvList, setCvList] = useState<ResumeSummary[]>([]);
  const [connecting, setConnecting] = useState(false), [connectionStatus, setConnectionStatus] = useState("");
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(false), [savingPreference, setSavingPreference] = useState(false);
  const autoConnectEnabledRef = useRef(false), automaticPaused = useRef(false), preferenceWriting = useRef(false);
  const autoConnection = useRef<{ port: chrome.runtime.Port; heartbeat?: ReturnType<typeof setInterval> } | null>(null);
  const verifiedScope = useRef<string | null>(null);
  const mounted = useRef(true), mutationRunning = useRef(false);
  const resetAccount = () => { verifiedScope.current = null; setState(null); setCvList([]); resetAnalysis(); };
  const { analysis, cancelAnalysis, analyze, resetAnalysis } = useDashboardAnalysis({ verifiedScope, onError: setError, onAuthFailure: () => {
    resetAccount();
    if (autoConnectEnabledRef.current && !automaticPaused.current && !preferenceWriting.current) openKariyer();
  } });
  function applyReply(result: Extract<DashboardReply, { ok: true }>) {
    automaticPaused.current = false;
    if (result.scope) verifiedScope.current = result.scope;
    if (result.data) setState(result.data);
    if (result.resumes) setCvList(result.resumes);
  }
  function stopAutoConnect() {
    const current = autoConnection.current;
    autoConnection.current = null;
    clearInterval(current?.heartbeat);
    current?.port.disconnect();
    mutationRunning.current = false;
    if (mounted.current) { setConnecting(false); setBusy(false); setLoading(false); setConnectionStatus(""); }
  }
  function cancelAutoConnect() {
    if (!autoConnection.current) return;
    automaticPaused.current = true;
    stopAutoConnect();
    setError({ ok: false, code: "CANCELLED", message: "Otomatik bağlantı iptal edildi. Kariyer.net sekmesi açık bırakıldı." });
  }
  async function toggleAutoConnect() {
    if (mutationRunning.current || preferenceWriting.current) return;
    preferenceWriting.current = true; setSavingPreference(true);
    const enabled = !autoConnectEnabledRef.current;
    try {
      await saveAutoConnectPreference(enabled);
      if (!mounted.current) return;
      autoConnectEnabledRef.current = enabled; setAutoConnectEnabled(enabled);
      automaticPaused.current = false;
      if (enabled) openKariyer();
      else setNotice("Otomatik bağlantı kapatıldı.");
    } catch {
      if (mounted.current) setError({ ok: false, code: "PREFERENCE_ERROR", message: "Otomatik bağlantı tercihi kaydedilemedi. Yeniden deneyin veya Kariyer.net’i aç düğmesini kullanın." });
    } finally {
      preferenceWriting.current = false;
      if (mounted.current) setSavingPreference(false);
    }
  }
  function openKariyer() {
    if (mutationRunning.current) return;
    automaticPaused.current = false;
    mutationRunning.current = true;
    resetAccount(); setError(null); setNotice(""); setBusy(true); setLoading(false); setConnecting(true); setConnectionStatus("Hesabın doğrulanıyor…");
    try {
      const port = chrome.runtime.connect({ name: MESSAGE_TYPES.DASHBOARD_AUTO_CONNECT });
      const current = { port, heartbeat: undefined as ReturnType<typeof setInterval> | undefined };
      autoConnection.current = current;
      const disconnected = () => {
        if (autoConnection.current !== current) return;
        automaticPaused.current = true;
        stopAutoConnect();
        if (mounted.current) setError({ ok: false, code: "CONNECTION_ERROR", message: "Otomatik bağlantı kesildi. Yeniden deneyin." });
      };
      port.onDisconnect.addListener(disconnected);
      port.onMessage.addListener((event: AutoConnectEvent) => {
        if (!mounted.current || autoConnection.current !== current) return;
        if (event.type === "status") setConnectionStatus(event.text);
        if (event.type === "connected") {
          applyReply(event.result); setError(null);
          try { port.postMessage({ type: "applied" }); } catch { disconnected(); }
        }
        if (event.type === "done") {
          stopAutoConnect();
          if (event.result.ok) { setError(null); setNotice(event.notice || "Kariyer.net bağlantısı kuruldu."); }
          else { automaticPaused.current = true; setError(event.result); }
        }
      });
      // Port traffic keeps the MV3 worker alive while waiting for interactive login.
      current.heartbeat = setInterval(() => {
        try { port.postMessage({ type: "ping" }); } catch { disconnected(); }
      }, 20_000);
      port.postMessage({ type: "start" });
    } catch {
      automaticPaused.current = true;
      stopAutoConnect();
      setError({ ok: false, code: "CONNECTION_ERROR", message: "Otomatik bağlantı başlatılamadı. Uzantıyı yeniden yükleyip deneyin." });
    }
  }
  const act: Act = async request => {
    if (mutationRunning.current || preferenceWriting.current) return { ok: false, code: "BUSY", message: "Devam eden işlemin bitmesini bekleyin." };
    let needsConnection = false;
    mutationRunning.current = true;
    setBusy(true); setError(null); setNotice("");
    try {
      const scope = verifiedScope.current;
      let nextRequest = request;
      let added = 0, updated = 0, detailErrors = 0;
      const seen = new Set<string>();
      const counts = () => added + " yeni başvuru eklendi, " + updated + " mevcut kayıt güncellendi.";
      while (true) {
        const result: DashboardReply = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.DASHBOARD, payload: nextRequest, ...(request.action === "get" ? {} : { scope }) });
        if (!mounted.current) return result;
        if (!result || !result.ok) {
          const failure = result && !result.ok ? result : { ok: false as const, code: "CONNECTION_ERROR", message: "Extension bağlantısı kurulamadı. Uzantıyı yeniden yükleyin." };
          setError(failure);
          if (request.action === "importApplications" && (added || updated)) setNotice(counts() + " İçe aktarma tamamlanamadı; alınan kayıtlar korundu.");
          if (failure.code === "AUTH_REQUIRED" || failure.code === "SESSION_NOT_CAPTURED") { resetAccount(); needsConnection = true; }
          return failure;
        }
        if (request.action !== "get" && (verifiedScope.current !== scope || result.scope !== scope)) {
          const failure = { ok: false as const, code: "AUTH_REQUIRED", message: "Dashboard hesabı değişti. Yeniden bağlanıp tekrar deneyin." };
          setError(failure); resetAccount(); needsConnection = true; return failure;
        }
        applyReply(result);
        if (request.action === "resetExperiments") resetAnalysis();
        if (request.action !== "importApplications") { setNotice(result.notice || ""); return result; }
        const summary = result.importSummary;
        if (!summary) throw new Error("Import response missing");
        added += summary.added; updated += summary.updated; detailErrors += summary.detailErrors;
        summary.jobIds.forEach(id => seen.add(id));
        if (summary.nextPage === null) {
          setNotice((summary.total ? counts() : "Kariyer.net’te içe aktarılacak başvuru bulunamadı.") +
            (detailErrors ? " " + detailErrors + " başvurunun detayı alınamadı; Başvuruları yenile ile tekrar deneyin." : "") +
            (summary.warning ? " " + summary.warning : ""));
          return result;
        }
        setNotice("Başvurular içe aktarılıyor… " + counts());
        nextRequest = { action: "importApplications", page: summary.nextPage, seenJobIds: [...seen] };
      }
    } catch {
      const failure = { ok: false as const, code: "CONNECTION_ERROR", message: "Extension bağlantısı kesildi. Uzantıyı yeniden yükleyip deneyin." };
      setError(failure); if (request.action === "get") resetAccount(); return failure;
    } finally {
      mutationRunning.current = false;
      if (mounted.current) {
        setBusy(false); setLoading(false);
        if (needsConnection && autoConnectEnabledRef.current && !automaticPaused.current) openKariyer();
      }
    }
  };
  useEffect(() => {
    mounted.current = true;
    let active = true, preferenceReady = false;
    void (async () => {
      let enabled = false;
      try { enabled = await loadAutoConnectPreference(); } catch { /* Manual connection remains available if storage is unavailable. */ }
      if (!active) return;
      autoConnectEnabledRef.current = enabled; setAutoConnectEnabled(enabled); preferenceReady = true;
      void act({ action: "get" });
    })();
    const reconnect = () => { if (preferenceReady && document.visibilityState === "visible" && !mutationRunning.current && !preferenceWriting.current) { resetAccount(); setLoading(true); void act({ action: "get" }); } };
    document.addEventListener("visibilitychange", reconnect);
    return () => { active = false; mounted.current = false; document.removeEventListener("visibilitychange", reconnect); if (autoConnection.current) stopAutoConnect(); };
  }, []);
  function reconnect() { if (mutationRunning.current || preferenceWriting.current) return; automaticPaused.current = false; resetAccount(); setLoading(true); void act({ action: "get" }); }
  return { state, busy: busy || savingPreference, loading, notice, error, cvList, act, reconnect, connecting, connectionStatus, autoConnectEnabled, toggleAutoConnect, openKariyer, cancelAutoConnect, analysis, cancelAnalysis, analyze, resetAnalysis };
}
