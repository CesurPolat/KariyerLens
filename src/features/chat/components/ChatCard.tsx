import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize2, MessageSquareText, Send, Settings, Sparkles, Trash2, X } from "lucide-react";
import { useJobChat } from "../hooks/use-job-chat.js";
import { MarkdownMessage } from "./MarkdownMessage.js";
import { useChatResize } from "../hooks/use-chat-resize.js";
import styles from "./chat.css?inline";

const jobSuggestions = ["İlanı özetle", "Aranan yetkinlikler neler?", "Mülakata nasıl hazırlanabilirim?"];
const generalSuggestions = ["Bana uygun ilanları bul", "CV’mi nasıl geliştirebilirim?", "Mülakata nasıl hazırlanabilirim?"];

export function ChatCard({ jobId }: { jobId: string }) {
  const suggestions = jobId ? jobSuggestions : generalSuggestions;
  const { messages, pending, status, input, submit, clear, openSettings } = useJobChat(jobId);
  const { panel, size, resizeHandle } = useChatResize();
  const list = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => { setOpen(false); launcher.current?.focus(); };
  useLayoutEffect(() => { setOpen(false); }, [jobId]);
  useLayoutEffect(() => {
    if (open) (input.current?.disabled ? closeButton.current : input.current)?.focus();
    if (open && list.current) { followBottom.current = true; list.current.scrollTop = list.current.scrollHeight; }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open]);
  useLayoutEffect(() => {
    if (messages.at(-1)?.role === "user") followBottom.current = true;
    if (list.current && followBottom.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages, pending]);

  return <>
    <style>{styles}</style>
    <section id="chat-panel" ref={panel} style={size} role="dialog" aria-label="KariyerLens Asistan" hidden={!open}>
      <button id="resize-chat" type="button" aria-label="Sohbeti boyutlandır" aria-controls="chat-panel"
        title="Boyutlandırmak için sürükle veya ok tuşlarını kullan" {...resizeHandle}>
        <Maximize2 size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <header><div><h2><Sparkles size={20} aria-hidden="true" /> KariyerLens Asistan</h2><p>{jobId ? `İlan: ${jobId} · Başvuruna hazırlan.` : "Genel sohbet · İlan bul, CV’ni geliştir."}</p></div>
        <button id="close-chat" ref={closeButton} type="button" aria-label="Sohbeti kapat" onClick={close}><X size={20} aria-hidden="true" /></button></header>
      <nav><button id="clear" type="button" onClick={() => clear()}><Trash2 size={15} aria-hidden="true" />Sohbeti temizle</button>
        <button id="settings" type="button" onClick={openSettings}><Settings size={15} aria-hidden="true" />Ayarlar</button></nav>
      <div id="messages" ref={list} role="log" aria-live="polite" aria-label="Sohbet mesajları" aria-busy={pending}
        onScroll={event => { const element = event.currentTarget; followBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; }}>
        {messages.map((message, index) => <div key={index} className={`message ${message.role}`}>
          <strong className="message-author">{message.role === "user" ? "Sen" : "KariyerLens"}</strong>
          {message.role === "assistant" ? <MarkdownMessage content={message.content} /> : message.content}
        </div>)}
        {pending && <div className="thinking" aria-label={status.text}>
          <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span><span>{status.text}</span>
        </div>}
      </div>
      {!messages.length && <div id="suggestions">{suggestions.map(text =>
        <button key={text} type="button" disabled={pending} onClick={() => void submit(text)}>{text}</button>)}</div>}
      <form onSubmit={event => { event.preventDefault(); void submit(input.current?.value || ""); }}>
        <textarea ref={input} maxLength={4000} aria-label="Mesajınız" placeholder={jobId ? "İlan hakkında bir soru sor…" : "Kariyerin hakkında bir soru sor…"} required disabled={pending}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault(); void submit(event.currentTarget.value);
            }
          }} />
        <div className="footer"><span>Enter: gönder · Shift+Enter: yeni satır</span>
          <button id="send" type="submit" disabled={pending}><Send size={16} aria-hidden="true" />Gönder</button></div>
      </form>
      <div id="status" role="status" className={status.error ? "error" : ""}>{status.text}</div>
    </section>
    <button id="chat-launcher" ref={launcher} type="button" aria-label={open ? "Sohbeti kapat" : "KariyerLens sohbetini aç"}
      aria-expanded={open} aria-controls="chat-panel" title={open ? "Sohbeti kapat" : "KariyerLens Asistan"}
      onClick={() => open ? close() : setOpen(true)}>
      {open ? <X size={26} strokeWidth={1.8} aria-hidden="true" /> : <MessageSquareText size={26} strokeWidth={1.8} aria-hidden="true" />}
    </button>
  </>;
}
