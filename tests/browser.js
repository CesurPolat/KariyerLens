// Isolated test page: no real Chrome APIs, credentials or provider requests.
let currentJob = "123";
let lastRequestedJobId = "";
function findJobId() { return currentJob; }
function loadCurrentJob() {}
const requests = [];
window.chrome = { runtime: { sendMessage: (message) => {
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
const host = () => fixture.querySelector('[data-kariyer-lens-chat="true"]');
async function run() {
  await pause(); check(!host(), "Sütun yokken kart eklenmez");
  let column = document.createElement("div"); column.className = "job-detail-right-column"; fixture.append(column);
  await pause(); check(!host(), "Şirket kartı oluşana kadar sohbet bekler");
  const companyCard = document.createElement("div"); companyCard.className = "job-detail-company-card"; column.append(companyCard);
  await pause(); check(host()?.previousElementSibling === companyCard, "Sohbet şirket kartının hemen altına eklenir");
  const input = shadow.querySelector("textarea");
  input.value = "SQL deneyimi gerekli mi?";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
  check(requests.length === 0, "Shift+Enter göndermez");
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await pause();
  check(requests.length === 1 && input.disabled, "Enter gönderir ve beklerken gönderim kapanır");
  check(Object.keys(requests[0].message).sort().join() === "jobId,messages,type", "Mesaj sözleşmesinde anahtar bulunmaz");
  requests[0].resolve({ ok: true, reply: "<b>SQL</b> önemli." }); await pause();
  check(shadow.querySelector("#messages").textContent.includes("<b>SQL</b>") && !shadow.querySelector("#messages b"), "Yanıt düz metindir");
  const sameHost = host(); column.remove(); column = document.createElement("div"); column.className = "job-detail-right-column"; fixture.append(column);
  column.append(companyCard);
  await pause(); check(host() === sameHost && shadow.querySelector("#messages").textContent.includes("SQL"), "Yeniden oluşturulan sütunda sohbet korunur");
  column.append(document.createElement("div")); await pause(); check(column.querySelectorAll('[data-kariyer-lens-chat="true"]').length === 1, "Yinelenen kart oluşturulmaz");
  input.value = "Yeni soru"; shadow.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  currentJob = "456"; fixture.append(document.createElement("span")); await pause();
  requests[1].resolve({ ok: true, reply: "ESKİ YANIT" }); await pause();
  check(!shadow.querySelector("#messages").textContent && !input.disabled, "İlan değişince sohbet sıfırlanır ve eski yanıt atılır");
  input.value = "Tekrar denenecek soru"; shadow.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  requests[2].resolve({ ok: false, message: "Kota doldu" }); await pause();
  check(input.value === "Tekrar denenecek soru" && shadow.querySelector("#status").textContent === "Kota doldu", "Hata gösterilir ve soru taslağa geri döner");
  input.value = "Bekleyen soru"; shadow.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  shadow.querySelector("#clear").click(); requests[3].resolve({ ok: true, reply: "TEMİZLENEN YANIT" }); await pause();
  check(!shadow.querySelector("#messages").textContent && !input.disabled, "Temizle eski isteğin yanıtını geçersiz kılar");
  fixture.style.width = "240px"; await pause();
  check(shadow.querySelector("section").getBoundingClientRect().width <= 240 && shadow.querySelector("section").scrollWidth <= 240, "240px sütunda yatay taşma yok");
  fixture.style.width = "320px";
  currentJob = ""; fixture.append(document.createElement("span")); await pause(); check(!host(), "İlan dışına çıkınca kart kaldırılır");
  currentJob = "789"; fixture.append(document.createElement("span")); await pause();
  check(!!host(), "İlana dönünce kart yeniden eklenir");
  check(host().shadowRoot === null, "Shadow DOM kapalıdır");
  results.textContent += "\nTüm tarayıcı testleri geçti.";
}
addEventListener("load", () => run().catch((error) => { results.textContent += "\nBAŞARISIZ: " + error.message; }));
