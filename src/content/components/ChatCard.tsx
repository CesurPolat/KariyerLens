import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useJobChat } from "./use-job-chat.js";
import { MarkdownMessage } from "./MarkdownMessage.js";
import styles from "./chat.css?inline";

const suggestions = ["İlanı özetle", "Aranan yetkinlikler neler?", "Mülakata nasıl hazırlanabilirim?"];

export function ChatCard({ jobId }: { jobId: string }) {
  const { messages, pending, status, input, submit, clear, openSettings } = useJobChat(jobId);
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
    <section id="chat-panel" role="dialog" aria-label="KariyerLens Asistan" hidden={!open}>
      <header><div><h2>✦ KariyerLens Asistan</h2><p>Bu ilan hakkında sorular sor, başvuruna hazırlan.</p></div>
        <button id="close-chat" ref={closeButton} type="button" aria-label="Sohbeti kapat" onClick={close}>×</button></header>
      <nav><button id="clear" type="button" onClick={() => clear()}>Sohbeti temizle</button>
        <button id="settings" type="button" onClick={openSettings}>Ayarlar</button></nav>
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
        <textarea ref={input} maxLength={4000} aria-label="Mesajınız" placeholder="İlan hakkında bir soru sor…" required disabled={pending}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault(); void submit(event.currentTarget.value);
            }
          }} />
        <div className="footer"><span>Enter: gönder · Shift+Enter: yeni satır</span>
          <button id="send" type="submit" disabled={pending}>Gönder</button></div>
      </form>
      <div id="status" role="status" className={status.error ? "error" : ""}>{status.text}</div>
    </section>
    <button id="chat-launcher" ref={launcher} type="button" aria-label={open ? "Sohbeti kapat" : "KariyerLens sohbetini aç"}
      aria-expanded={open} aria-controls="chat-panel" title={open ? "Sohbeti kapat" : "KariyerLens Asistan"}
      onClick={() => open ? close() : setOpen(true)}>
      {open ? <span aria-hidden="true">×</span> : <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 1 1 19 0Z" />
        <path d="M7 10h10M7 14h6" />
      </svg>}
    </button>
  </>;
}
