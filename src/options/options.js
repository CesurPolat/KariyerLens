const provider = document.querySelector("#provider");
const key = document.querySelector("#api-key");
const model = document.querySelector("#model");
const status = document.querySelector("#status");
const form = document.querySelector("form");
const deleteButton = document.querySelector("#delete");
let settings = { provider: "openai", providers: { openai: {}, openrouter: {} } };
let selected = "openai";
function draft() { settings.providers[selected] = { apiKey: key.value.trim(), model: model.value.trim() }; }
function render() {
  key.value = settings.providers[selected]?.apiKey || "";
  model.value = settings.providers[selected]?.model || "";
  document.querySelector("#model-hint").textContent = selected === "openai"
    ? "OpenAI hesabında erişebildiğin modelin tam kimliğini gir."
    : "OpenRouter model kimliğini sağlayıcı/model biçiminde gir.";
}
provider.addEventListener("change", () => { draft(); selected = provider.value; render(); status.textContent = ""; });
async function persist() {
  settings.provider = selected;
  await chrome.storage.local.set({ chatSettings: settings });
}
form.addEventListener("submit", async (event) => {
  event.preventDefault(); draft();
  if (!key.value.trim() || !model.value.trim()) { status.textContent = "API anahtarı ve model kimliği gerekli."; return; }
  try { await persist(); status.textContent = "Ayarlar kaydedildi. İlan sayfasından sohbet edebilirsin."; }
  catch { status.textContent = "Ayarlar kaydedilemedi. Yeniden dene."; }
});
deleteButton.addEventListener("click", async () => {
  settings.providers[selected] = { model: model.value.trim() }; render();
  try { await persist(); status.textContent = "Bu sağlayıcının API anahtarı silindi."; }
  catch { status.textContent = "Anahtar silinemedi. Yeniden dene."; }
});
form.querySelectorAll("input,select,button").forEach((element) => { element.disabled = true; });
try {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const { chatSettings } = await chrome.storage.local.get("chatSettings");
  if (chatSettings) {
    settings = { provider: ["openai", "openrouter"].includes(chatSettings.provider) ? chatSettings.provider : "openai", providers: { openai: chatSettings.providers?.openai || {}, openrouter: chatSettings.providers?.openrouter || {} } };
  }
  selected = settings.provider; provider.value = selected; render();
  form.querySelectorAll("input,select,button").forEach((element) => { element.disabled = false; });
} catch { status.textContent = "Ayarlar yüklenemedi. Uzantıyı yeniden yükleyip deneyin."; }
