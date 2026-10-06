import { useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage, ChatResult } from "../../shared/types.js";

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

  function clear(text = "Sohbet temizlendi.") {
    generation.current++;
    history.current = [];
    busy.current = false;
    if (input.current) input.current.value = "";
    setMessages([]);
    setPending(false);
    setStatus({ text, error: false });
  }

  useLayoutEffect(() => {
    clear(INITIAL_STATUS);
    return () => { generation.current++; };
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

    function restoreDraft(message: string) {
      history.current = history.current.slice(0, -1);
      setMessages(history.current);
      if (input.current) input.current.value = text;
      setStatus({ text: message, error: true });
    }

    try {
      const response: ChatResult = await chrome.runtime.sendMessage({
        type: "CHAT_JOB", jobId,
        messages: history.current.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
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
