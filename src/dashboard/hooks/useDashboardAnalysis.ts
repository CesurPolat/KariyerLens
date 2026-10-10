import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { MESSAGE_TYPES } from "../../shared/messages.js";
import type { ChatResult, ChatStreamEvent, Failure } from "../../shared/types.js";

export function useDashboardAnalysis({ verifiedScope, onError: setError, onAuthFailure: resetAccount }: {
  verifiedScope: RefObject<string | null>; onError: (failure: Failure | null) => void; onAuthFailure: () => void;
}) {
  const [analysis, setAnalysis] = useState({ title: "", content: "", status: "", pending: false });
  const analysisPort = useRef<chrome.runtime.Port | null>(null);
  const activeGeneration = useRef(0);
  function resetAnalysis() {
    activeGeneration.current++; analysisPort.current?.disconnect(); analysisPort.current = null;
    setAnalysis({ title: "", content: "", status: "", pending: false });
  }
  useEffect(() => () => { activeGeneration.current++; analysisPort.current?.disconnect(); }, []);
  function cancelAnalysis() { activeGeneration.current++; analysisPort.current?.disconnect(); analysisPort.current = null; setAnalysis(a => ({ ...a, pending: false, status: "Analiz durduruldu." })); }
  function analyze(jobId: string, choice: { experimentId?: string; resumeId?: string }, title: string) {
    cancelAnalysis(); const generation = ++activeGeneration.current; setError(null);
    setAnalysis({ title, content: "", pending: true, status: "İlan ve CV bilgileri alınıyor…" });
    let done = false;
    try {
      const port = chrome.runtime.connect({ name: MESSAGE_TYPES.DASHBOARD_ANALYSIS }); analysisPort.current = port;
      port.onMessage.addListener((event: ChatStreamEvent) => {
        if (generation !== activeGeneration.current) return;
        if (event.type === "text") setAnalysis(a => ({ ...a, content: event.content }));
        else if (event.type === "status") setAnalysis(a => ({ ...a, status: event.text }));
        else { done = true;
          const result: ChatResult = event.result;
          if (result.ok) setAnalysis({ title, content: result.reply, pending: false, status: "Analiz tamamlandı." });
          else { setError(result); setAnalysis(a => ({ ...a, pending: false, status: result.message })); if (result.code === "AUTH_REQUIRED" || result.code === "SESSION_NOT_CAPTURED") resetAccount(); }
          analysisPort.current = null; port.disconnect();
        }
      });
      port.onDisconnect.addListener(() => {
        if (!done && generation === activeGeneration.current) { setAnalysis(a => ({ ...a, pending: false, status: "Analiz bağlantısı kesildi. Yeniden deneyin." })); analysisPort.current = null; }
      });
      port.postMessage({ jobId, ...choice, scope: verifiedScope.current });
    } catch { setAnalysis(a => ({ ...a, pending: false, status: "Analiz başlatılamadı. Uzantıyı yeniden yükleyin." })); }
  }
  return { analysis, cancelAnalysis, analyze, resetAnalysis };
}
