// This fixture never requests a real company profile or AI provider.
let currentJob = "123";
let lastRequestedJobId = "";
function findJobId() { return currentJob; }
function loadCurrentJob() {}
let companyListener;
window.chrome = { runtime: { id: "extension-test", onMessage: { addListener(fn) { companyListener = fn; } }, sendMessage: async () => ({ ok: true }) } };
const companyMessage = (jobId = currentJob) => new Promise((resolve) => companyListener({ type: "GET_CURRENT_COMPANY_STATS", jobId }, { id: "extension-test" }, resolve));
const requests = [];
window.fetch = (url, options) => new Promise((resolve, reject) => {
  requests.push({ url, options, resolve, reject });
  options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
});
const realNow = Date.now;
let timeOffset = 0;
Date.now = () => realNow() + timeOffset;
const nativeTimeout = window.setTimeout;
const profileTimers = [];
window.setTimeout = (callback, delay, ...args) => {
  if (delay === 15000) profileTimers.push(callback);
  return nativeTimeout(callback, delay, ...args);
};
const pause = () => new Promise((resolve) => nativeTimeout(resolve, 50));
const results = document.querySelector("#results");
const fixture = document.querySelector("#fixture");
const main = document.querySelector("#main");
const lines = [];
function check(condition, label) { if (!condition) throw new Error(label); lines.push("✓ " + label); results.textContent = lines.join("\n"); }
function makeCard(id) {
  const card = document.createElement("div"); card.className = "job-detail-company-card";
  card.innerHTML = `<div class="company-info-box"><a href="/firma-profil/company-${id}">Örnek şirket ${id}</a><button data-test="job-detail-company-card-follow-button">Takip Et</button></div>`;
  return card;
}
function nativeFollowers(id, count) {
  main.innerHTML = `<div data-test="job-detail-company-card-large-detail"><a href="/firma-profil/company-${id}">Şirket</a><span data-test="job-detail-company-card-large-statistic-item">${count} Takipçi</span></div>`;
}
function profile(id, count = 3, followers = "16.8b") {
  return new Response(`<html><span>${followers} takipçi</span><a href="/is-ilanlari?fpi=${id}&hc=T&scj=true">Tümünü Gör (${count})</a></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
const row = () => fixture.querySelector('[data-kariyer-lens-company-stats]');
const followers = () => row()?.querySelector('[data-kariyer-lens-followers]').textContent;
const jobs = () => row()?.querySelector('[data-kariyer-lens-open-jobs]');
async function run() {
  await pause(); check(!row() && requests.length === 0, "Kart yokken istek yapılmaz");
  let card = makeCard("111"); nativeFollowers("111", "16804"); fixture.append(card);
  await pause();
  check(followers() === "16.804 takipçi", "İlan sayfasındaki tam takipçi sayısı önceliklidir");
  check(jobs().textContent === "— açık iş ilanı" && !jobs().hasAttribute("href"), "Yüklenmeyen sayı sıfır gösterilmez");
  check(row().nextElementSibling.tagName === "BUTTON", "İstatistikler Takip Et düğmesinin üstündedir");
  check(requests.length === 1 && requests[0].url === location.origin + "/firma-profil/company-111", "Profil isteği aynı kaynaklıdır");
  const sharedRequest = companyMessage(); await pause();
  check(requests.length === 1, "Sohbet ve gösterge devam eden profil isteğini paylaşır");
  requests[0].resolve(profile("111")); await pause();
  const sharedResult = await sharedRequest;
  check(sharedResult.ok && sharedResult.data.openJobs === 3 && sharedResult.data.followers === "16.804 takipçi" && sharedResult.data.companyName === "Örnek şirket 111", "Mesaj köprüsü normalize şirket bilgisini döndürür");
  check((await companyMessage("999")).code === "JOB_CHANGED", "Başka ilan kimliği reddedilir");
  const unexpected = () => { throw new Error("Yetkisiz mesaj yanıtlandı"); };
  check(companyListener({ type: "GET_CURRENT_COMPANY_STATS", jobId: currentJob }, { id: "foreign" }, unexpected) === undefined, "Yabancı uzantı mesajı reddedilir");
  check(companyListener({ type: "GET_CURRENT_COMPANY_STATS", jobId: currentJob }, { id: "extension-test", tab: { id: 1 } }, unexpected) === undefined, "İçerik betiğinden gelen köprü mesajı reddedilir");
  check(jobs().textContent === "3 açık iş ilanı" && new URL(jobs().href).searchParams.get("fpi") === "111", "Açık ilan sayısı ve bağlantısı doğru şirkete aittir");
  check(followers() === "16.804 takipçi", "Kısaltılmış profil sayısı tam sayının üzerine yazılmaz");
  card.remove(); card = makeCard("111"); fixture.append(card); await pause();
  check(requests.length === 1 && jobs().textContent === "3 açık iş ilanı", "Yeniden oluşturulan kart önbelleği kullanır");
  fixture.append(document.createElement("span")); await pause();
  check(fixture.querySelectorAll('[data-kariyer-lens-company-stats]').length === 1, "İstatistik satırı yinelenmez");
  check(document.querySelector('[data-kariyer-lens-chat]')?.parentElement === document.body, "Yüzen sohbet şirket kartından bağımsız kalır");
  timeOffset = 300001; fixture.append(document.createElement("span")); await pause();
  check(requests.length === 2, "Beş dakika sonra profil yeniden istenir");
  requests[1].resolve(profile("111", 0, "0")); main.replaceChildren(); await pause();
  check(followers() === "0 takipçi" && jobs().textContent === "0 açık iş ilanı", "Gerçek sıfır değerleri korunur");
  card.remove(); card = makeCard("222"); fixture.append(card); currentJob = "456"; await pause();
  const stale = requests.at(-1);
  const staleTool = companyMessage();
  card.querySelector("a").href = "/firma-profil/company-333"; currentJob = "789"; await pause();
  check(stale.options.signal.aborted, "Şirket değişince önceki istek iptal edilir");
  check((await staleTool).code === "JOB_CHANGED", "Gezinme sırasında eski şirket tool sonucu kullanılmaz");
  stale.resolve(profile("222", 99)); requests.at(-1).resolve(profile("333", 7, "1.2b")); await pause();
  check(jobs().textContent === "7 açık iş ilanı" && followers() === "1.2b takipçi", "Eski yanıt uygulanmaz; kısaltılmış takipçi sayısı korunur");
  nativeFollowers("111", "99999"); await pause(); check(followers() === "1.2b takipçi", "Başka şirkete ait ana sayfa verisi kullanılmaz");
  card.querySelector("a").href = "/firma-profil/company-444"; await pause(); requests.at(-1).reject(new TypeError("offline")); await pause();
  const failedCount = requests.length;
  check(jobs().textContent === "— açık iş ilanı" && followers() === "— takipçi", "Ağ hatasında eksik değerler — gösterilir");
  const failedTool = companyMessage(); await pause(); requests.at(-1).reject(new TypeError("offline"));
  check((await failedTool).code === "COMPANY_PROFILE_ERROR", "Profil hatası yapılandırılmış tool hatasıdır");
  const afterToolFailure = requests.length;
  fixture.append(document.createElement("span")); await pause(); check(requests.length === afterToolFailure, "Hata sonrası DOM değişimleri istek yağmuruna yol açmaz");
  card.querySelector("a").href = "/firma-profil/company-555"; await pause();
  requests.at(-1).resolve(new Response('<span>8 takipçi</span><a href="/is-ilanlari?fpi=OTHER">Tümünü Gör (99)</a>', { headers: { "Content-Type": "text/html" } })); await pause();
  check(followers() === "8 takipçi" && jobs().textContent === "— açık iş ilanı", "İlgisiz ilan listesi sayısı kullanılmaz");
  card.querySelector("a").href = "/firma-profil/company-666"; await pause(); profileTimers.at(-1)(); await pause();
  check(requests.at(-1).options.signal.aborted && jobs().textContent === "— açık iş ilanı", "15 saniyelik zaman aşımı isteği iptal eder");
  card.querySelector("a").href = "/firma-profil/company-333"; await pause();
  fixture.style.width = "180px"; await pause();
  check(row().scrollWidth <= row().clientWidth && jobs().textContent === "7 açık iş ilanı", "Dar kartta bilgiler taşmadan sarılır");
  fixture.style.width = "380px";
  const beforeExternal = requests.length; card.querySelector("a").href = "https://example.com/firma-profil/company-111"; await pause();
  check(!row() && requests.length === beforeExternal, "Harici profil bağlantısına istek yapılmaz");
  const missing = await companyMessage();
  check(missing.ok && missing.data.profileUrl === null && missing.data.openJobs === null, "Geçerli profil yoksa bilinmeyen alanlar null döner");
  card.querySelector("a").href = "/firma-profil/company-333"; await pause();
  results.textContent += "\nTüm şirket kartı testleri geçti.";
}
addEventListener("load", () => run().catch((error) => { results.textContent += "\nBAŞARISIZ: " + error.message; }));
