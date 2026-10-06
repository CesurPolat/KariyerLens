import { useLayoutEffect, useRef } from "react";
import { useJobChat } from "./use-job-chat.js";
import styles from "./chat.css?inline";

const suggestions = ["İlanı özetle", "Aranan yetkinlikler neler?", "Mülakata nasıl hazırlanabilirim?"];

export function ChatCard({ jobId }: { jobId: string }) {
  const { messages, pending, status, input, submit, clear, openSettings } = useJobChat(jobId);
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages, pending]);

  return <>
    <style>{styles}</style>
    <section aria-label="KariyerLens Asistan">
      <header><h2>✦ KariyerLens Asistan</h2><p>Bu ilan hakkında sorular sor, başvuruna hazırlan.</p></header>
      <nav><button id="clear" type="button" onClick={() => clear()}>Sohbeti temizle</button>
        <button id="settings" type="button" onClick={openSettings}>Ayarlar</button></nav>
      <div id="messages" ref={list} role="log" aria-live="polite" aria-label="Sohbet mesajları" aria-busy={pending}>
        {messages.map((message, index) => <div key={index} className={`message ${message.role}`}>
          <strong>{message.role === "user" ? "Sen" : "KariyerLens"}</strong>{message.content}
        </div>)}
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
  </>;
}
