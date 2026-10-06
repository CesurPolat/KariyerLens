// Isolated test page: no real Chrome APIs, credentials or provider requests.
let currentJob = "123";
let lastRequestedJobId = "";
function findJobId() { return currentJob; }
function loadCurrentJob() {}
const requests = [];
const makeEvent = () => {
  const listeners = new Set();
  return { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn), emit: (event) => [...listeners].forEach((fn) => fn(event)) };
};
window.chrome = { runtime: { connect: () => {
  const port = { onMessage: makeEvent(), onDisconnect: makeEvent(), closed: false,
    disconnect() { if (!this.closed) { this.closed = true; this.onDisconnect.emit(); } },
    postMessage(message) { requests.push({ message, port: this, progress: (event) => this.onMessage.emit(event), resolve: (result) => this.onMessage.emit({ type: "done", result }) }); },
  };
  return port;
}, sendMessage: (message) => {
  if (message.type === "OPEN_OPTIONS") return Promise.resolve({ ok: true });
  return new Promise((resolve) => requests.push({ message, resolve }));
} } };
let shadow;
const originalAttach = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (options) { shadow = originalAttach.call(this, options); return shadow; };
const pause = () => new Promise((resolve) => setTimeout(resolve, 30));
const results = document.querySelector("#results");
const fixture = document.querySelector("#fixture");
const lines = [];
function check(condition, label) { if (!condition) throw new Error(label); lines.push("✓ " + label); results.textContent = lines.join("\n"); }
const host = () => document.querySelector('[data-kariyer-lens-chat="true"]');
async function run() {
  await pause(); check(!!host() && host().parentElement === document.body, "Sohbet ilan sayfasında sütun beklemeden eklenir");
  const launcher = shadow.querySelector("#chat-launcher");
  check(shadow.querySelector("section").hidden && launcher.getAttribute("aria-expanded") === "false", "İlk açılışta yalnız baloncuk görünür");
  check(getComputedStyle(host()).position === "fixed", "Baloncuk ekrana sabitlenir");
  launcher.click(); await pause();
  check(!shadow.querySelector("section").hidden && shadow.activeElement === shadow.querySelector("textarea"), "Baloncuk paneli açar ve mesaj alanına odaklanır");
  let column = document.createElement("div"); column.className = "job-detail-right-column"; fixture.append(column);
  await pause(); check(!!host(), "Sohbet şirket kartından bağımsızdır");
  const companyCard = document.createElement("div"); companyCard.className = "job-detail-company-card"; column.append(companyCard);
  await pause(); check(host()?.parentElement === document.body, "Panel sayfa akışına yerleşmez");
  const input = shadow.querySelector("textarea");
  input.value = "**SQL** deneyimi gerekli mi?";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
  check(requests.length === 0, "Shift+Enter göndermez");
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await pause();
  check(requests.length === 1 && input.disabled, "Enter gönderir ve beklerken gönderim kapanır");
  check(!!shadow.querySelector(".thinking"), "Yanıt beklerken hareketli durum göstergesi görünür");
  requests[0].progress({ type: "status", text: "Şirket bilgileri inceleniyor…" }); await pause();
  check(shadow.querySelector(".thinking").textContent.includes("Şirket bilgileri"), "Tool çalışırken işlem durumu görünür");
  requests[0].progress({ type: "text", content: "## SQL" }); await new Promise((resolve) => setTimeout(resolve, 60));
  check(shadow.querySelector(".assistant h2")?.textContent === "SQL" && input.disabled, "Yanıt bitmeden gelen tokenlar Markdown olarak görünür");
  requests[0].progress({ type: "text", content: "## SQL yetkinlikleri\n\n**SQL**" }); await new Promise((resolve) => setTimeout(resolve, 60));
  check(shadow.querySelectorAll(".assistant").length === 1 && shadow.querySelector(".assistant strong:not(.message-author)")?.textContent === "SQL", "Yeni parçalar tek asistan mesajını günceller");
  check(Object.keys(requests[0].message).sort().join() === "jobId,messages,type", "Mesaj sözleşmesinde anahtar bulunmaz");
  requests[0].resolve({ ok: true, reply: "## SQL yetkinlikleri\n\n**SQL** ve *ERP* önemli.\n\n- Sorgu yazma\n- Analiz\n\n[İlan](https://www.kariyer.net/)\n\n```sql\nSELECT very_long_column_name_that_should_scroll_in_a_small_chat_panel FROM job_applications;\n```\n\n| Yetkinlik | Durum |\n| --- | --- |\n| SQL | Gerekli |\n\n<script>alert(1)</script>\n\n[Riskli](javascript:alert%281%29)\n\n![Logo](https://evil.test/tracker.png)" }); await pause();
  const markdown = shadow.querySelector(".assistant .markdown");
  check(!shadow.querySelector(".thinking") && requests[0].port.closed && shadow.querySelectorAll(".assistant").length === 1, "Tamamlanan akış bağlantıyı kapatır ve yanıtı yinelemez");
  check(markdown.querySelector("h2")?.textContent === "SQL yetkinlikleri" && markdown.querySelector("strong")?.textContent === "SQL" && markdown.querySelector("li"), "Asistan Markdown başlık, kalın metin ve listeleri render eder");
  check(markdown.querySelector("pre code") && markdown.querySelector(".markdown-table table"), "Kod bloğu ve GFM tablo render edilir");
  check(markdown.querySelector("a")?.target === "_blank" && markdown.querySelector("a")?.rel.includes("noopener"), "Markdown bağlantısı güvenli yeni sekme açar");
  check(!markdown.querySelector("script,img") && !markdown.querySelector('a[href^="javascript:"]'), "HTML, tehlikeli URL ve uzak görsel yüklenmez");
  check(shadow.querySelector(".user").textContent.includes("**SQL**") && !shadow.querySelector(".user .markdown"), "Kullanıcı mesajı düz metin kalır");
  check(shadow.querySelector("section").scrollWidth <= shadow.querySelector("section").clientWidth, "Uzun kod paneli yatay taşırmaz");
  shadow.querySelector("#close-chat").click(); await pause();
  check(shadow.querySelector("section").hidden && shadow.activeElement === launcher, "Kapat paneli gizler ve odağı baloncuğa döndürür");
  launcher.click(); await pause();
  check(shadow.querySelector("#messages").textContent.includes("SQL"), "Kapatıp açınca sohbet korunur");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await pause();
  check(shadow.querySelector("section").hidden, "Escape paneli kapatır");
  launcher.click(); await pause();
  const sameHost = host(); column.remove(); column = document.createElement("div"); column.className = "job-detail-right-column"; fixture.append(column);
  column.append(companyCard);
  await pause(); check(host() === sameHost && shadow.querySelector("#messages").textContent.includes("SQL"), "Yeniden oluşturulan sütunda sohbet korunur");
  column.append(document.createElement("div")); await pause(); check(document.querySelectorAll('[data-kariyer-lens-chat="true"]').length === 1, "Yinelenen kart oluşturulmaz");
  input.value = "Yeni soru"; shadow.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  currentJob = "456"; fixture.append(document.createElement("span")); await pause();
  check(requests[1].port.closed, "İlan değişince devam eden akış iptal edilir");
  requests[1].resolve({ ok: true, reply: "ESKİ YANIT" }); await pause();
  check(!shadow.querySelector("#messages").textContent && !input.disabled, "İlan değişince sohbet sıfırlanır ve eski yanıt atılır");
  check(shadow.querySelector("section").hidden, "İlan değişince panel kapanır");
  launcher.click(); await pause();
  input.value = "Tekrar denenecek soru"; shadow.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  requests[2].resolve({ ok: false, message: "Kota doldu" }); await pause();
  check(input.value === "Tekrar denenecek soru" && shadow.querySelector("#status").textContent === "Kota doldu", "Hata gösterilir ve soru taslağa geri döner");
  input.value = "Bekleyen soru"; shadow.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  shadow.querySelector("#clear").click(); requests[3].resolve({ ok: true, reply: "TEMİZLENEN YANIT" }); await pause();
  check(requests[3].port.closed, "Temizle devam eden bağlantıyı kapatır");
  check(!shadow.querySelector("#messages").textContent && !input.disabled, "Temizle eski isteğin yanıtını geçersiz kılar");
  input.value = "Kesilen yanıt"; shadow.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); await pause();
  requests[4].progress({ type: "text", content: "**Kısmi yanıt**" }); await new Promise((resolve) => setTimeout(resolve, 60));
  requests[4].port.disconnect(); await pause();
  check(shadow.querySelector(".assistant").textContent.includes("Kısmi yanıt") && !input.disabled && input.value === "Kesilen yanıt" && shadow.querySelector("#status").textContent.includes("yarıda kesildi"), "Kesilen akış kısmi yanıtı korur ve yeniden denemeye izin verir");
  shadow.querySelector("#clear").click(); await pause();
  const panel = shadow.querySelector("section").getBoundingClientRect();
  check(panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= innerHeight, "Panel ekran sınırları içinde kalır");
  check(shadow.querySelector("section").scrollWidth <= panel.width, "Panelde yatay taşma yok");
  currentJob = ""; fixture.append(document.createElement("span")); await pause(); check(!host(), "İlan dışına çıkınca kart kaldırılır");
  currentJob = "789"; fixture.append(document.createElement("span")); await pause();
  check(!!host(), "İlana dönünce kart yeniden eklenir");
  check(host().shadowRoot === null, "Shadow DOM kapalıdır");
  results.textContent += "\nTüm tarayıcı testleri geçti.";
}
addEventListener("load", () => run().catch((error) => { results.textContent += "\nBAŞARISIZ: " + error.message; }));
