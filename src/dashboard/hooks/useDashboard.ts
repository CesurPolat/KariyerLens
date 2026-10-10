import { useEffect, useRef, useState } from "react";
import { MESSAGE_TYPES } from "../../shared/messages.js";
import type { Failure } from "../../shared/types.js";
import type { DashboardState, ResumeSummary } from "../models.js";
import type { Act, DashboardReply } from "../ui-types.js";
import { useDashboardAnalysis } from "./useDashboardAnalysis.js";

export function useDashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(""), [error, setError] = useState<Failure | null>(null);
  const [cvList, setCvList] = useState<ResumeSummary[]>([]);
  const verifiedScope = useRef<string | null>(null);
  const mounted = useRef(true), mutationRunning = useRef(false);
  const resetAccount = () => { verifiedScope.current = null; setState(null); setCvList([]); resetAnalysis(); };
  const { analysis, cancelAnalysis, analyze, resetAnalysis } = useDashboardAnalysis({ verifiedScope, onError: setError, onAuthFailure: resetAccount });
  const act: Act = async request => {
    if (mutationRunning.current) return { ok: false, code: "BUSY", message: "Devam eden işlemin bitmesini bekleyin." };
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
          if (failure.code === "AUTH_REQUIRED" || failure.code === "SESSION_NOT_CAPTURED") resetAccount();
          return failure;
        }
        if (request.action !== "get" && (verifiedScope.current !== scope || result.scope !== scope)) {
          const failure = { ok: false as const, code: "AUTH_REQUIRED", message: "Dashboard hesabı değişti. Yeniden bağlanıp tekrar deneyin." };
          setError(failure); resetAccount(); return failure;
        }
        if (result.scope) verifiedScope.current = result.scope;
        if (result.data) setState(result.data);
        if (result.resumes) setCvList(result.resumes);
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
    } finally { mutationRunning.current = false; if (mounted.current) { setBusy(false); setLoading(false); } }
  };
  useEffect(() => {
    mounted.current = true; void act({ action: "get" });
    const reconnect = () => { if (document.visibilityState === "visible") { resetAccount(); setLoading(true); if (!mutationRunning.current) void act({ action: "get" }); } };
    document.addEventListener("visibilitychange", reconnect);
    return () => { mounted.current = false; document.removeEventListener("visibilitychange", reconnect); };
  }, []);
  function reconnect() { resetAccount(); setLoading(true); void act({ action: "get" }); }
  return { state, busy, loading, notice, error, cvList, act, reconnect, analysis, cancelAnalysis, analyze, resetAnalysis };
}
