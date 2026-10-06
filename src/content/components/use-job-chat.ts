import { useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage, ChatResult, ChatStreamEvent } from "../../shared/types.js";
import { MESSAGE_TYPES } from "../../shared/messages.js";

export const INITIAL_STATUS = "Mesajların, ilan bilgileri ve araçlarla alınan şirket bilgileri seçtiğin yapay zekâ sağlayıcısına gönderilir. İlk kullanımda Ayarlar’ı aç.";

export function useJobChat(jobId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState({ text: INITIAL_STATUS, error: false });
  const input = useRef<HTMLTextAreaElement>(null);
  const history = useRef<ChatMessage[]>([]);
  const busy = useRef(false);
  const generation = useRef(0);
  const focusRequested = useRef(false);
  const connection = useRef<chrome.runtime.Port | null>(null);

  function clear(text = "Sohbet temizlendi.") {
    generation.current++;
    connection.current?.disconnect(); connection.current = null;
    history.current = [];
    busy.current = false;
    if (input.current) input.current.value = "";
    setMessages([]);
    setPending(false);
    setStatus({ text, error: false });
  }

  useLayoutEffect(() => {
    clear(INITIAL_STATUS);
    return () => { generation.current++; connection.current?.disconnect(); connection.current = null; };
  }, [jobId]);

  useLayoutEffect(() => {
    if (!pending && focusRequested.current) {
      input.current?.focus();
      focusRequested.current = false;
    }
  }, [pending]);

  async function submit(value: string) {
    const text = value.trim();
    if (!text || busy.current || !jobId || findJobId() !== jobId) return;
    if (text.length > 4000) {
      setStatus({ text: "En fazla 4.000 karakter yazabilirsiniz.", error: true });
      return;
    }
    const requestGeneration = generation.current;
    const isCurrent = () => generation.current === requestGeneration && findJobId() === jobId;
    busy.current = true;
    history.current = [...history.current, { role: "user", content: text }];
    setMessages(history.current);
    setPending(true);
    setStatus({ text: "Yanıt hazırlanıyor…", error: false });
    if (input.current) input.current.value = "";
    let partial = "";

    function restoreDraft(message: string) {
      const failed = history.current;
      history.current = history.current.slice(0, -1);
      setMessages(partial ? [...failed, { role: "assistant", content: partial }] : history.current);
      if (input.current) input.current.value = text;
      setStatus({ text: partial ? "Yanıt yarıda kesildi. " + message : message, error: true });
    }

    try {
      const response = await new Promise<ChatResult>((resolve) => {
        const port = chrome.runtime.connect({ name: MESSAGE_TYPES.CHAT_STREAM });
        connection.current = port;
        let finished = false;
        let repaint: ReturnType<typeof setTimeout> | undefined;
        const renderPartial = () => {
          repaint = undefined;
          if (isCurrent()) setMessages(partial ? [...history.current, { role: "assistant", content: partial }] : history.current);
        };
        const finish = (result: ChatResult) => {
          if (finished) return;
          finished = true; clearTimeout(repaint);
          port.onMessage.removeListener(onMessage);
          port.onDisconnect.removeListener(onDisconnect);
          if (connection.current === port) connection.current = null;
          port.disconnect(); resolve(result);
        };
        const onMessage = (event: ChatStreamEvent) => {
          if (!isCurrent() || finished) return;
          if (event.type === "done") finish(event.result);
          else if (event.type === "status") setStatus({ text: event.text, error: false });
          else if (event.type === "text") {
            partial = event.content;
            if (partial) setStatus({ text: "Yanıt yazılıyor…", error: false });
            if (repaint === undefined) repaint = setTimeout(renderPartial, 40);
          }
        };
        const onDisconnect = () => {
          void chrome.runtime.lastError;
          finish({ ok: false, code: "CONNECTION_CLOSED", message: "Bağlantı kesildi. Yeniden deneyin." });
        };
        port.onMessage.addListener(onMessage);
        port.onDisconnect.addListener(onDisconnect);
        try {
          port.postMessage({ type: "CHAT_JOB", jobId,
            messages: history.current.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
          });
        } catch { finish({ ok: false, code: "CONNECTION_CLOSED", message: "Bağlantı kurulamadı. Yeniden deneyin." }); }
      });
      if (!isCurrent()) return;
      if (!response?.ok) restoreDraft(response?.message || "Yanıt alınamadı. Yeniden deneyin.");
      else {
        history.current = [...history.current, { role: "assistant", content: response.reply }];
        setMessages(history.current);
        setStatus({ text: "Yanıtlar yapay zekâ tarafından üretilir; önemli bilgileri ilanla karşılaştır.", error: false });
      }
    } catch {
      if (isCurrent()) restoreDraft("Uzantıyla bağlantı kurulamadı. Sayfayı yenileyip deneyin.");
    } finally {
      if (isCurrent()) {
        busy.current = false;
        focusRequested.current = true;
        setPending(false);
      }
    }
  }

  async function openSettings() {
    try { await chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }); }
    catch { setStatus({ text: "Ayarlar açılamadı. Uzantı simgesinden ayarları açabilirsiniz.", error: true }); }
  }

  return { messages, pending, status, input, submit, clear, openSettings };
}
