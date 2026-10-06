import type { ChatSettings, Provider, ProviderSettings } from "../shared/types.js";

const provider = document.querySelector<HTMLSelectElement>("#provider")!;
const key = document.querySelector<HTMLInputElement>("#api-key")!;
const model = document.querySelector<HTMLInputElement>("#model")!;
const status = document.querySelector<HTMLElement>("#status")!;
const form = document.querySelector<HTMLFormElement>("form")!;
const deleteButton = document.querySelector<HTMLButtonElement>("#delete")!;
let settings: { provider: Provider; providers: Record<Provider, ProviderSettings> } = { provider: "openai", providers: { openai: {}, openrouter: {} } };
let selected: Provider = "openai";
function draft() { settings.providers[selected] = { apiKey: key.value.trim(), model: model.value.trim() }; }
function render() {
  key.value = settings.providers[selected]?.apiKey || "";
  model.value = settings.providers[selected]?.model || "";
  document.querySelector<HTMLElement>("#model-hint")!.textContent = selected === "openai"
    ? "OpenAI hesabında erişebildiğin modelin tam kimliğini gir."
    : "OpenRouter model kimliğini sağlayıcı/model biçiminde gir.";
}
provider.addEventListener("change", () => { draft(); selected = provider.value === "openrouter" ? "openrouter" : "openai"; render(); status.textContent = ""; });
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
form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input,select,button").forEach((element) => { element.disabled = true; });
try {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const { chatSettings } = await chrome.storage.local.get<{ chatSettings?: ChatSettings }>("chatSettings");
  if (chatSettings) {
    settings = { provider: chatSettings.provider === "openrouter" ? "openrouter" : "openai", providers: { openai: chatSettings.providers?.openai || {}, openrouter: chatSettings.providers?.openrouter || {} } };
  }
  selected = settings.provider; provider.value = selected; render();
  form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input,select,button").forEach((element) => { element.disabled = false; });
} catch { status.textContent = "Ayarlar yüklenemedi. Uzantıyı yeniden yükleyip deneyin."; }
