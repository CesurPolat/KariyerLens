// Load the real Vite options bundle with fake extension storage only.
const pause = () => new Promise(resolve => setTimeout(resolve, 50));
const results = document.querySelector("#results");
const failureMode = new URL(location.href).searchParams.has("storage-failure");
let trusted = false, writes = [], denyWrite = false;
window.chrome = { storage: { local: {
  async setAccessLevel(value) {
    if (failureMode) throw new Error("denied");
    trusted = value.accessLevel === "TRUSTED_CONTEXTS";
  },
  async get() {
    if (!trusted) throw new Error("Storage must be trusted first");
    return { chatSettings: { provider: "openai", providers: { openai: { apiKey: "test-openai-key", model: "test-model" }, openrouter: { apiKey: "test-router-key", model: "test/router" } } } };
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
  for (let attempt = 0; attempt < 40 && !document.querySelector("#api-key"); attempt++) await pause();
  await pause();
  const key = document.querySelector("#api-key"), model = document.querySelector("#model");
  if (failureMode) {
    check(key.disabled && document.querySelector("#status").textContent.includes("yüklenemedi"), "Depolama erişimi reddedilince form kapalı kalır");
    check(!writes.length, "Depolama hatasında ayarlar yazılmaz");
    results.textContent += "\nTüm ayarlar hata testleri geçti."; return;
  }
  check(trusted && !key.disabled && key.value === "test-openai-key", "Yalnız güvenilir depolama erişiminden sonra ayarlar yüklenir");
  changeInput(key, "draft-openai-key"); await pause();
  select("openrouter"); await pause();
  check(key.value === "test-router-key" && model.value === "test/router", "Sağlayıcı değiştirilince kendi ayarları gösterilir");
  select("openai"); await pause();
  check(key.value === "draft-openai-key", "Sağlayıcılar arasında kaydedilmemiş taslak korunur");
  changeInput(model, " new-model "); await pause(); submit(); await pause();
  check(writes.at(-1).chatSettings.providers.openai.model === "new-model" && writes.at(-1).chatSettings.providers.openrouter.apiKey === "test-router-key", "Kaydet alanları temizler ve diğer sağlayıcıyı korur");
  denyWrite = true; changeInput(model, "retry-model"); await pause(); submit(); await pause();
  check(document.querySelector("#status").textContent.includes("kaydedilemedi") && model.value === "retry-model" && !key.disabled, "Kaydet hatasında taslak korunur ve yeniden denenebilir");
  denyWrite = false; document.querySelector("#delete").click(); await pause();
  check(!key.value && !writes.at(-1).chatSettings.providers.openai.apiKey && writes.at(-1).chatSettings.providers.openrouter.apiKey === "test-router-key", "Sil yalnız seçili sağlayıcının anahtarını kaldırır");
  check(!document.body.textContent.includes("test-router-key") && key.type === "password", "Anahtarlar görünür metne yazılmaz");
  results.textContent += "\nTüm ayarlar testleri geçti.";
}
run().catch(error => { results.textContent += "\nBAŞARISIZ: " + error.message; });
