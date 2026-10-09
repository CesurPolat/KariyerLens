// Exercises the actual built React dashboard with disposable, in-memory fixtures.
// No real accounts, Chrome storage or provider requests are used.
const pause = () => new Promise(resolve => setTimeout(resolve, 30));
const params = new URL(location.href).searchParams;
const results = document.getElementById("results"), calls = [];
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const empty = { version: 1, applications: [], experiments: [], preferences: { keyword: "", cities: [], workModels: [], resumeId: "" }, discovery: { jobs: [], seen: {}, fetchedAt: null, currentPage: 1, total: 0, options: { cities: [], workModels: [] } } };
const variant = (label, name) => ({ id: "variant-" + label, label, name, resumeId: "cv-" + label, content: { summary: "React TypeScript SQL" }, fetchedAt: Date.now(), truncated: false });
const example = (id, title, companyName, status) => ({ jobId: id, title, companyName, jobUrl: "https://www.kariyer.net/is-ilani/test-" + id, createdAt: Date.now(), status, statusManual: true, appliedAt: today, notes: "", followUpAt: "", variantId: "variant-A", responded: false, interviewed: status === "interview", offered: false, manualEvents: [], api: { applied: status !== "saved", appliedAt: today, cvId: "cv-A", cvName: "Teknik CV", events: [], fetchedAt: Date.now(), error: "" } });
const state = structuredClone(empty);
if (!params.has("empty") && !params.has("auth")) {
  state.applications = [example("123", "Frontend Geliştirici", "Nova Teknoloji", "interview"), example("124", "Yazılım Mühendisi", "Atlas Digital", "applied"), example("125", "React Geliştirici", "Pixel Studio", "saved")];
  state.applications[0].api.events = [{ id: "view", at: today, text: "Özgeçmişin Görüntülendi", viewed: true, source: "api" }];
  state.experiments = [{ id: "test-1", name: "Teknik detay vs. proje odaklı", createdAt: Date.now(), variants: [variant("A", "Teknik CV"), variant("B", "Proje Odaklı CV")] }];
}
if (params.has("table")) state.applications.push(...Array.from({ length: 20 }, (_, i) => example(String(800 + i), "Pozisyon " + i, "Şirket " + i, "applied")));
const resumes = [{ id: "cv-A", name: "Teknik CV", updatedAt: today }, { id: "cv-B", name: "Proje Odaklı CV", updatedAt: today }];
function events() { const handlers = new Set(); return { addListener(fn) { handlers.add(fn); }, emit(value) { for (const fn of handlers) fn(value); } }; }
window.chrome = { runtime: {
  async openOptionsPage() { calls.push({ type: "OPEN_OPTIONS" }); },
  async sendMessage(message) {
    calls.push(message);
    if (params.has("auth")) return { ok: false, code: "AUTH_REQUIRED", message: "Kariyer.net hesabınızda oturum açıp profil sayfasını yenileyin." };
    const request = message.payload;
    if (request.action === "importApplications") {
      const jobIds = request.page === 1 ? ["601", "602"] : ["603"];
      let added = 0;
      for (const id of jobIds) if (!state.applications.some(a => a.jobId === id)) { state.applications.push(example(id, "İçe aktarılan " + id, "İçe aktarma AŞ", "applied")); added++; }
      return { ok: true, scope: "a".repeat(64), data: structuredClone(state), importSummary: {
        added, updated: jobIds.length - added, total: 3, page: request.page, nextPage: request.page === 1 ? 2 : null,
        jobIds, detailErrors: 0, warning: ""
      } };
    }
    if (request.action === "resumes") return { ok: true, scope: "a".repeat(64), resumes: params.has("one-cv") ? resumes.slice(0, 1) : resumes };
    if (request.action === "update") Object.assign(state.applications.find(a => a.jobId === request.jobId), request.patch);
    if (request.action === "remove") state.applications = state.applications.filter(a => a.jobId !== request.jobId);
    if (request.action === "track" && !state.applications.some(a => a.jobId === request.jobId)) state.applications.push(example(request.jobId, "Yeni ilan", "Örnek şirket", "saved"));
    if (request.action === "createExperiment") state.experiments.unshift({ id: "test-new", name: request.name, createdAt: Date.now(), variants: [variant("A", "Teknik CV"), variant("B", "Proje Odaklı CV")] });
    if (request.action === "search") {
      state.preferences = request.preferences;
      state.discovery = { jobs: [
        { id: "321", title: "Senior Frontend Developer", companyName: "Lumos Teknoloji", jobUrl: "https://www.kariyer.net/is-ilani/test-321", location: "İstanbul", workModel: "Hibrit", publishedAt: today, firstSeenAt: Date.now() },
        { id: "322", title: "Full Stack Developer", companyName: "Orbit Labs", jobUrl: "https://www.kariyer.net/is-ilani/test-322", location: "Türkiye", workModel: "Uzaktan", publishedAt: "", firstSeenAt: Date.now() },
        { id: "323", title: "React Developer", companyName: "North Studio", jobUrl: "https://www.kariyer.net/is-ilani/test-323", location: "İstanbul", workModel: "İş yerinde", publishedAt: "2024-01-01", firstSeenAt: Date.now() },
      ], seen: {}, currentPage: 1, total: 3, fetchedAt: Date.now(), options: { cities: [{ id: "34", name: "İstanbul Avrupa" }], workModels: [{ id: "2", name: "Hibrit" }] } };
    }
    return { ok: true, scope: "a".repeat(64), data: structuredClone(state) };
  },
  connect() {
    const onMessage = events(), onDisconnect = events(); let closed = false;
    return { onMessage, onDisconnect, postMessage() { if (params.has("analysis-error")) { setTimeout(() => !closed && onMessage.emit({ type: "done", result: { ok: false, code: "NETWORK_ERROR", message: "Örnek AI bağlantı hatası." } }), 40); return; }
      onMessage.emit({ type: "status", text: "Sabit CV içerikleri inceleniyor…" });
      setTimeout(() => { if (!closed) onMessage.emit({ type: "text", content: "## Uygunluk\nReact deneyimin ilanla örtüşüyor." }); }, 100);
      setTimeout(() => { if (!closed) onMessage.emit({ type: "done", result: { ok: true, reply: "## Uygunluk\nReact deneyimin ilanla örtüşüyor.\n\n### Geliştirme önerisi\nProjelerinin sonuçlarını somutlaştır." } }); }, 1200);
    }, disconnect() { closed = true; onDisconnect.emit(); } };
  },
} };
function check(value, label) { if (!value) throw new Error(label); results.textContent += "\n✓ " + label; }
function button(label) { return [...document.querySelectorAll("button")].find(e => e.textContent.trim() === label); }
function input(element, value) { Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }
async function until(predicate) { for (let i = 0; i < 100 && !predicate(); i++) await pause(); if (!predicate()) throw new Error("Arayüz beklenen duruma ulaşmadı."); }
async function run() {
  const url = new URL("../dist/src/dashboard/dashboard.html", import.meta.url);
  const page = new DOMParser().parseFromString(await (await fetch(url)).text(), "text/html");
  for (const link of page.querySelectorAll('link[rel="stylesheet"]')) { const style = document.createElement("link"); style.rel = "stylesheet"; style.href = new URL(link.getAttribute("href"), url); document.head.append(style); }
  await import(new URL(page.querySelector('script[type="module"]').getAttribute("src"), url).href);
  await until(() => document.querySelector(".stats") || document.querySelector(".alert.error"));
  check(!calls.some(c => c.payload?.action === "search"), "Açılışta ilan araması yapılmaz");
  if (params.has("interactive")) { results.textContent = "Örnek veriler · Gerçek hesaba, depolamaya veya AI sağlayıcısına erişilmez."; return; }
  if (params.has("auth")) { check(!document.querySelector(".stats"), "Oturum yokken kişisel kayıtlar gösterilmez"); check(document.querySelector('[role="alert"]'), "Oturum hatası görünür"); return; }
  if (params.has("table")) {
    check(document.querySelectorAll(".application-table tbody tr").length === 10, "Uzun liste ilk sayfada 10 satır gösterir");
    button("Sonraki").click(); await pause();
    check(document.querySelectorAll(".application-table tbody tr").length === 10 && document.querySelector(".table-pagination").textContent.includes("11–20"), "İkinci sayfaya geçilir");
    button("Sonraki").click(); await pause();
    check(document.querySelectorAll(".application-table tbody tr").length === 3 && button("Sonraki").disabled, "Son sayfa kalan kayıtları gösterir");
    input(document.querySelector('[aria-label="Başlık veya şirket ara"]'), "Frontend"); await pause();
    check(document.querySelectorAll(".application-table tbody tr").length === 1 && document.querySelector(".table-pagination").textContent.includes("1–1"), "Arama sayfalamayı sıfırlar");
    button("Detay").click(); await pause();
    check(document.querySelector("dialog:modal") && document.querySelector(".detail-panel"), "Detay sayfayı uzatmadan yan panelde açılır");
    document.querySelector('[aria-label="Detayı kapat"]').click(); await pause();
    check(!document.querySelector("dialog"), "Detay paneli kapanır ve tablo kalır");
    results.textContent += "\nTüm dashboard tarayıcı testleri geçti."; return;
  }
  if (params.has("empty")) {
    check(document.body.textContent.includes("Başvurularını içe aktar veya ilan ekle"), "İlk kullanım boş durumu görünür");
    check(!button("Başvurularımı içe aktar").disabled, "Boş listede içe aktarma kullanılabilir");
    button("Başvurularımı içe aktar").click();
    await until(() => state.applications.length === 3 && !button("Başvurularımı içe aktar").disabled);
    check(document.querySelectorAll(".application-table tbody tr").length === 3, "Mevcut başvurular boş listeye aktarılır");
    results.textContent += "\nTüm dashboard tarayıcı testleri geçti."; return;
  }
  check(document.querySelectorAll(".application-table tbody tr").length === 3, "Başvuru listesi çizilir");
  input(document.querySelector('[aria-label="Başlık veya şirket ara"]'), "Atlas"); await pause();
  check(document.querySelectorAll(".application-table tbody tr").length === 1, "Şirket araması filtreler");
  input(document.querySelector('[aria-label="Başlık veya şirket ara"]'), ""); await pause(); button("Detay").click(); await pause();
  input(document.querySelector(".detail-panel textarea"), "Görüşme notu"); document.querySelector(".detail-panel form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await pause();
  check(state.applications[0].notes === "Görüşme notu", "Başvuru notları kaydedilir");
  input(document.querySelector('[aria-label="Etkileşim açıklaması"]'), "Telefon görüşmesi"); await pause(); button("Ekle").click(); await pause();
  input(document.querySelector('[aria-label="Manuel etkileşim açıklaması"]'), "Teknik görüşme"); await pause();
  document.querySelector(".detail-panel form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await pause();
  check(state.applications[0].manualEvents[0].text === "Teknik görüşme", "Manuel etkileşimler eklenir ve düzenlenir");
  document.querySelector('[aria-label="Detayı kapat"]').click(); await pause();
  button("Başvurularımı içe aktar").click();
  await until(() => calls.filter(c => c.payload?.action === "importApplications").length === 2 && !button("Başvurularımı içe aktar").disabled);
  check(document.querySelectorAll(".application-table tbody tr").length === 6, "İçe aktarma tüm sayfaları getirir");
  check(calls.filter(c => c.payload?.action === "importApplications")[1].payload.seenJobIds.length === 2, "Sayfalar arasında görülen ilanlar aktarılır");
  button("Başvurularımı içe aktar").click();
  await until(() => calls.filter(c => c.payload?.action === "importApplications").length === 4 && !button("Başvurularımı içe aktar").disabled);
  check(document.querySelectorAll(".application-table tbody tr").length === 6 && state.applications[0].notes === "Görüşme notu", "Tekrar içe aktarma kayıtları çoğaltmaz ve notları korur");
  button("CV A/B Testi").click(); await pause(); button("CV’leri getir").click(); await pause();
  check(document.querySelectorAll(".variant-card").length === 2, "A ve B ölçümleri ayrı gösterilir");
  if (params.has("one-cv")) check(document.querySelector(".test-create button").disabled, "Tek CV ile A/B oluşturma kapalıdır");
  else {
    input(document.querySelector(".test-create input"), "Arayüz CV testi");
    const selectors = document.querySelectorAll(".test-create select");
    selectors[0].value = "cv-A"; selectors[0].dispatchEvent(new Event("change", { bubbles: true })); await pause();
    selectors[1].value = "cv-B"; selectors[1].dispatchEvent(new Event("change", { bubbles: true })); await pause();
    document.querySelector(".test-create").closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await pause();
    check(state.experiments[0].name === "Arayüz CV testi", "İki CV ile yeni test oluşturulur");
  }
  button("Bana Uygun İlanlar").click(); await pause(); check(!calls.some(c => c.payload?.action === "search"), "İlan bölümüne geçiş arama başlatmaz");
  button("Yenile").click(); await pause(); check(document.querySelectorAll(".discovery-table tbody tr").length === 3, "İlanlar tek tabloda çizilir");
  check(document.body.textContent.includes("Yayın tarihi bilinmeyenler"), "Tarihi bilinmeyen ilanlar ayrılır");
  check(document.body.textContent.includes("Diğer önerilen ilanlar"), "Eski ilanlar yeni diye gösterilmez");
  const dateFilter = document.querySelector('[aria-label="İlan yayın tarihi filtresi"]');
  dateFilter.value = "unknown"; dateFilter.dispatchEvent(new Event("change", { bubbles: true })); await pause();
  check(document.querySelectorAll(".discovery-table tbody tr").length === 1 && document.querySelector(".discovery-table").textContent.includes("Full Stack"), "Tabloda yayın tarihi grubu filtrelenir");
  dateFilter.value = "all"; dateFilter.dispatchEvent(new Event("change", { bubbles: true })); await pause();
  const searchCount = calls.filter(c => c.payload?.action === "search").length;
  document.querySelector(".discovery-filters").closest("form").querySelector('input[type="checkbox"]').click(); await pause();
  check(calls.filter(c => c.payload?.action === "search").length === searchCount, "Tarih seçimi kendiliğinden arama başlatmaz");
  button("Yenile").click(); await pause();
  check(state.preferences.includeOlder === true && document.querySelector(".discovery-results").textContent.includes("Tüm tarihler"), "Eski ilanları dahil et seçimi yenilemede uygulanır");
  button("CV’leri getir").click(); await pause(); const select = document.querySelector(".cv-choice select"); select.value = "cv-A"; select.dispatchEvent(new Event("change", { bubbles: true })); await pause();
  button("Uyumu analiz et").click(); await pause(); button("Durdur").click(); await pause(); check(document.querySelector(".analysis-panel").textContent.includes("Analiz durduruldu.") && !button("Durdur"), "AI analizi durdurulabilir");
  button("Uyumu analiz et").click(); await until(() => document.querySelector(".analysis-panel")?.textContent.includes(params.has("analysis-error") ? "Örnek AI bağlantı hatası" : "Analiz tamamlandı"));
  check(document.querySelector(".analysis-panel"), "AI sonucu veya hatası görünür");
  results.textContent += "\nTüm dashboard tarayıcı testleri geçti.";
}
run().catch(error => { results.textContent += "\n✗ " + error.stack; });
