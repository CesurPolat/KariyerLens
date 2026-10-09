// Load the real Vite options bundle with fake extension storage only.
const pause = () => new Promise(resolve => setTimeout(resolve, 50));
const results = document.querySelector("#results");
const failureMode = new URL(location.href).searchParams.has("storage-failure");
const savedProxy = new URL(location.href).searchParams.has("saved-proxy");
let trusted = false, writes = [], denyWrite = false;
let memory = { enabled: true, jobCount: 3, cvCount: 1, cvFetchedAt: Date.now() };
const memoryCalls = [];
window.chrome = { runtime: { async sendMessage(message) {
  memoryCalls.push(message);
  if (denyWrite) throw new Error("denied");
  if (message.type === "SET_MEMORY_ENABLED") memory.enabled = message.enabled;
  if (message.type === "REFRESH_CV_MEMORY") { memory.cvCount = 0; memory.cvFetchedAt = null; }
  if (message.type === "CLEAR_MEMORY") { memory.jobCount = 0; memory.cvCount = 0; memory.cvFetchedAt = null; }
  return { ok: true, data: structuredClone(memory) };
} }, storage: { local: {
  async setAccessLevel(value) {
    if (failureMode) throw new Error("denied");
    trusted = value.accessLevel === "TRUSTED_CONTEXTS";
  },
  async get() {
    if (!trusted) throw new Error("Storage must be trusted first");
    return { chatSettings: { provider: savedProxy ? "cesurpolat" : "openai", providers: { openai: { apiKey: "test-openai-key", model: "test-model" }, openrouter: { apiKey: "test-router-key", model: "test/router" } } } };
  },
  async set(value) { if (denyWrite) throw new Error("denied"); writes.push(structuredClone(value)); },
} } };
function check(condition, text) { if (!condition) throw new Error(text); results.textContent += "\n✓ " + text; }
function changeInput(element, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
function select(value) { const element = document.querySelector("#provider"); element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); }
function submit() { document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }
async function run() {
  const pageUrl = new URL("../dist/src/options/options.html", import.meta.url);
  const html = new DOMParser().parseFromString(await (await fetch(pageUrl)).text(), "text/html");
  for (const link of html.querySelectorAll('link[rel="stylesheet"]')) {
    const style = document.createElement("link"); style.rel = "stylesheet"; style.href = new URL(link.getAttribute("href"), pageUrl); document.head.append(style);
  }
  await import(new URL(html.querySelector('script[type="module"]').getAttribute("src"), pageUrl).href);
  for (let attempt = 0; attempt < 40 && !document.querySelector("#provider"); attempt++) await pause();
  await pause();
  if (failureMode) {
    const key = document.querySelector("#api-key");
    check(key.disabled && document.querySelector("#status").textContent.includes("yüklenemedi"), "Depolama erişimi reddedilince form kapalı kalır");
    check(!writes.length, "Depolama hatasında ayarlar yazılmaz");
    results.textContent += "\nTüm ayarlar hata testleri geçti."; return;
  }
  if (savedProxy) {
    check(document.querySelector("#provider").value === "cesurpolat" && !!document.querySelector("#proxy-hint"), "Depolamadaki proxy seçimi açılışta geri yüklenir");
    select("openai"); await pause();
  }
  let key = document.querySelector("#api-key"), model = document.querySelector("#model");
  check(trusted && !key.disabled && key.value === "test-openai-key", "Yalnız güvenilir depolama erişiminden sonra ayarlar yüklenir");
  changeInput(key, "draft-openai-key"); await pause();
  select("openrouter"); await pause();
  check(key.value === "test-router-key" && model.value === "test/router", "Sağlayıcı değiştirilince kendi ayarları gösterilir");
  select("openai"); await pause();
  check(key.value === "draft-openai-key", "Sağlayıcılar arasında kaydedilmemiş taslak korunur");
  changeInput(model, " new-model "); await pause(); submit(); await pause();
  check(writes.at(-1).chatSettings.providers.openai.model === "new-model" && writes.at(-1).chatSettings.providers.openrouter.apiKey === "test-router-key", "Kaydet alanları temizler ve diğer sağlayıcıyı korur");
  check(document.querySelector("#model-select").value === "custom" && model.value === "new-model", "Kayıtlı özel model korunur");
  const modelSelect = document.querySelector("#model-select");
  modelSelect.value = "gpt-4.1-mini"; modelSelect.dispatchEvent(new Event("change", { bubbles: true })); await pause();
  check(!document.querySelector("#model"), "Hazır model seçilince elle giriş alanı kapanır");
  submit(); await pause();
  check(writes.at(-1).chatSettings.providers.openai.model === "gpt-4.1-mini", "Hazır modelin gerçek kimliği kaydedilir");
  modelSelect.value = "custom"; modelSelect.dispatchEvent(new Event("change", { bubbles: true })); await pause();
  model = document.querySelector("#model");
  check(model && !model.disabled, "Özel model seçilince kimlik girişi açılır");
  denyWrite = true; changeInput(model, "retry-model"); await pause(); submit(); await pause();
  check(document.querySelector("#status").textContent.includes("kaydedilemedi") && model.value === "retry-model" && !key.disabled, "Kaydet hatasında taslak korunur ve yeniden denenebilir");
  denyWrite = false; document.querySelector("#delete").click(); await pause();
  check(!key.value && !writes.at(-1).chatSettings.providers.openai.apiKey && writes.at(-1).chatSettings.providers.openrouter.apiKey === "test-router-key", "Sil yalnız seçili sağlayıcının anahtarını kaldırır");
  check(!document.body.textContent.includes("test-router-key") && key.type === "password", "Anahtarlar görünür metne yazılmaz");
  select("cesurpolat"); await pause();
  check(!document.querySelector("#api-key,#model,#model-hint,#delete") && document.querySelector("#proxy-hint"), "Free seçilince anahtar, model ve silme alanları kaldırılır");
  submit(); await pause();
  check(writes.at(-1).chatSettings.provider === "cesurpolat" && Object.keys(writes.at(-1).chatSettings.providers.cesurpolat).length === 0, "Free boş anahtar ve model ile kaydedilir");
  select("openrouter"); await pause(); key = document.querySelector("#api-key"); model = document.querySelector("#model");
  check(key.value === "test-router-key" && model.value === "test/router" && document.querySelector("#delete"), "Diğer sağlayıcıya dönünce alanlar ve kayıtlı ayarlar geri gelir");
  select("cesurpolat"); await pause();
  check(!document.querySelector("#api-key,#model") && writes.at(-1).chatSettings.providers.openrouter.apiKey === "test-router-key", "Free seçimi diğer sağlayıcıların anahtarını korur");
  const toggle = document.querySelector('.memory-toggle input');
  check(toggle.checked && !toggle.disabled && document.querySelector('.memory-settings').textContent.includes('3 ilan'), "Hafıza durumu worker üzerinden yüklenir");
  toggle.click(); await pause();
  check(!toggle.checked && memoryCalls.at(-1).type === 'SET_MEMORY_ENABLED', "Hafıza kapatma worker'a iletilir");
  const buttons = document.querySelectorAll('.memory-settings button');
  buttons[0].click(); await pause();
  check(memory.cvCount === 0 && memory.jobCount === 3, "CV yenileme ilanları korur");
  denyWrite = true; buttons[1].click(); await pause();
  check(document.querySelector('.memory-settings [role=status]').textContent.includes('tamamlanamadı') && !buttons[1].disabled, "Hafıza hatasında kontrol tekrar kullanılabilir");
  denyWrite = false; buttons[1].click(); await pause();
  check(memory.jobCount === 0 && document.querySelector('.memory-settings').textContent.includes('0 ilan'), "Hafıza temizlenince kayıt sayıları güncellenir");
  results.textContent += "\nTüm ayarlar testleri geçti.";
}
run().catch(error => { results.textContent += "\nBAŞARISIZ: " + error.message; });
