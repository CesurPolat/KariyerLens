(() => {
  const host = document.createElement("div");
  host.dataset.kariyerLensChat = "true";
  host.style.cssText = "display:block;width:100%;min-width:0;margin-bottom:20px;";
  const root = host.attachShadow({ mode: "closed" });
  // This template is static. All messages are inserted with textContent.
  root.innerHTML = `
    <style>
      :host{font-family:Arial,sans-serif;color:#0f172a}*{box-sizing:border-box}
      section{width:100%;border:1px solid #e9d5ff;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 8px 24px #4c1d9510}
      header{padding:16px;background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff}h2{font-size:18px;margin:0 0 6px}p{font-size:12px;line-height:1.5;margin:0}
      nav{display:flex;flex-wrap:wrap;gap:8px;padding:12px 14px;border-bottom:1px solid #f1e8ff}
      button{font:inherit;font-size:12px;border:1px solid #ddd6fe;border-radius:7px;padding:8px 10px;background:#f5f3ff;color:#6d28d9;cursor:pointer}button:disabled{opacity:.55;cursor:default}button:focus-visible,textarea:focus-visible{outline:2px solid #8b5cf6;outline-offset:2px}
      #messages{padding:14px;max-height:360px;overflow:auto;min-height:100px;display:flex;flex-direction:column;gap:10px}
      .message{font-size:13px;line-height:1.55;padding:10px 12px;border-radius:9px;white-space:pre-wrap;overflow-wrap:anywhere;background:#f8fafc}.user{background:#f5f3ff;margin-left:20px}.assistant{margin-right:12px}.message strong{display:block;font-size:11px;margin-bottom:5px;color:#64748b}
      #suggestions{display:flex;flex-direction:column;gap:6px;padding:0 14px 12px}#suggestions button{text-align:left}
      form{padding:14px;border-top:1px solid #f1e8ff}textarea{display:block;width:100%;resize:vertical;min-height:76px;max-height:180px;font:inherit;font-size:13px;padding:10px;border:1px solid #ddd6fe;border-radius:8px;color:#0f172a;background:#fff}
      .footer{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px}.footer span{font-size:10px;color:#64748b}#send{color:#fff;background:#7c3aed;border-color:#7c3aed}
      #status{font-size:12px;line-height:1.5;color:#64748b;padding:0 14px 12px;overflow-wrap:anywhere}#status.error{color:#b91c1c}
    </style>
    <section aria-label="KariyerLens Asistan">
      <header><h2>✦ KariyerLens Asistan</h2><p>Bu ilan hakkında sorular sor, başvuruna hazırlan.</p></header>
      <nav><button id="clear" type="button">Sohbeti temizle</button><button id="settings" type="button">Ayarlar</button></nav>
      <div id="messages" role="log" aria-live="polite" aria-label="Sohbet mesajları"></div>
      <div id="suggestions"></div>
      <form><textarea maxlength="4000" aria-label="Mesajınız" placeholder="İlan hakkında bir soru sor…" required></textarea>
      <div class="footer"><span>Enter: gönder · Shift+Enter: yeni satır</span><button id="send" type="submit">Gönder</button></div></form>
      <div id="status" role="status">Mesajların ve ilan bilgileri seçtiğin yapay zekâ sağlayıcısına gönderilir. İlk kullanımda Ayarlar’ı aç.</div>
    </section>`;
  const list = root.querySelector("#messages");
  const input = root.querySelector("textarea");
  const send = root.querySelector("#send");
  const status = root.querySelector("#status");
  const suggestions = root.querySelector("#suggestions");
  let jobId = "";
  let generation = 0;
  let pending = false;
  let messages = [];

  function setStatus(text, error = false) {
    status.textContent = text;
    status.className = error ? "error" : "";
  }
  function render() {
    list.replaceChildren();
    for (const message of messages) {
      const bubble = document.createElement("div");
      bubble.className = `message ${message.role}`;
      const label = document.createElement("strong");
      label.textContent = message.role === "user" ? "Sen" : "KariyerLens";
      bubble.append(label, document.createTextNode(message.content));
      list.append(bubble);
    }
    suggestions.hidden = messages.length > 0;
    // A stylesheet display rule otherwise overrides the hidden attribute.
    suggestions.style.display = messages.length ? "none" : "flex";
    send.disabled = pending;
    input.disabled = pending;
    list.setAttribute("aria-busy", String(pending));
    suggestions.querySelectorAll("button").forEach((button) => { button.disabled = pending; });
    list.scrollTop = list.scrollHeight;
  }
  async function submit(text) {
    sync();
    text = text.trim();
    if (!text || pending || !jobId) return;
    if (text.length > 4000) { setStatus("En fazla 4.000 karakter yazabilirsiniz.", true); return; }
    const requestGeneration = generation;
    const requestJobId = jobId;
    // Retry restores the draft; unsuccessful turns are not added to history.
    messages.push({ role: "user", content: text });
    input.value = "";
    pending = true;
    render();
    setStatus("Yanıt hazırlanıyor…");
    try {
      const response = await chrome.runtime.sendMessage({ type: "CHAT_JOB", jobId, messages: messages.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })) });
      if (generation !== requestGeneration || findJobId() !== requestJobId) return;
      if (!response?.ok) {
        messages.pop();
        input.value = text;
        setStatus(response?.message || "Yanıt alınamadı. Yeniden deneyin.", true);
      } else {
        messages.push({ role: "assistant", content: response.reply });
        setStatus("Yanıtlar yapay zekâ tarafından üretilir; önemli bilgileri ilanla karşılaştır.");
      }
    } catch {
      if (generation !== requestGeneration || findJobId() !== requestJobId) return;
      messages.pop();
      input.value = text;
      setStatus("Uzantıyla bağlantı kurulamadı. Sayfayı yenileyip deneyin.", true);
    } finally {
      if (generation === requestGeneration) { pending = false; render(); input.focus(); }
    }
  }
  root.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); submit(input.value); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(input.value); }
  });
  root.querySelector("#clear").addEventListener("click", () => {
    generation++; messages = []; pending = false; input.value = ""; render(); setStatus("Sohbet temizlendi.");
  });
  root.querySelector("#settings").addEventListener("click", async () => {
    try { await chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }); }
    catch { setStatus("Ayarlar açılamadı. Uzantı simgesinden ayarları açabilirsiniz.", true); }
  });
  for (const text of ["İlanı özetle", "Aranan yetkinlikler neler?", "Mülakata nasıl hazırlanabilirim?"]) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = text;
    button.addEventListener("click", () => submit(text)); suggestions.append(button);
  }
  function sync() {
    const current = findJobId();
    if (jobId !== current) {
      jobId = current; generation++; messages = []; pending = false; input.value = ""; render();
      lastRequestedJobId = "";
      loadCurrentJob();
      setStatus("Mesajların ve ilan bilgileri seçtiğin yapay zekâ sağlayıcısına gönderilir. İlk kullanımda Ayarlar’ı aç.");
    }
    const column = jobId && document.querySelector(".job-detail-right-column");
    if (!column) { if (host.isConnected) host.remove(); return; }
    const companyCard = column.querySelector(".job-detail-company-card");
    if (!companyCard) { if (host.isConnected) host.remove(); return; }
    if (host.previousElementSibling !== companyCard) companyCard.insertAdjacentElement("afterend", host);
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; sync(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  addEventListener("popstate", sync);
  // Content-script history wrappers don't observe calls from the page's isolated world.
  setInterval(sync, 500);
  render(); sync();
})();
