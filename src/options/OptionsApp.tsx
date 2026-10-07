import { useEffect, useState } from "react";
import { KeyRound, Save, Sparkles, Trash2 } from "lucide-react";
import type { ChatSettings, Provider, ProviderSettings } from "../shared/types.js";

type Configs = Record<Provider, ProviderSettings>;
const selectProvider = (value: unknown): Provider => value === "openrouter" || value === "cesurpolat" ? value : "openai";

export function OptionsApp() {
  const [provider, setProvider] = useState<Provider>("openai");
  const [configs, setConfigs] = useState<Configs>({ openai: {}, openrouter: {}, cesurpolat: {} });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
        const { chatSettings } = await chrome.storage.local.get<{ chatSettings?: ChatSettings }>("chatSettings");
        if (!active) return;
        if (chatSettings) {
          setProvider(selectProvider(chatSettings.provider));
          setConfigs({ openai: chatSettings.providers?.openai || {}, openrouter: chatSettings.providers?.openrouter || {}, cesurpolat: chatSettings.providers?.cesurpolat || {} });
        }
        setReady(true);
      } catch { if (active) setStatus("Ayarlar yüklenemedi. Uzantıyı yeniden yükleyip deneyin."); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const config = configs[provider];
  const isFree = provider === "cesurpolat";
  const disabled = !ready || saving;
  function update(field: keyof ProviderSettings, value: string) {
    setConfigs(previous => ({ ...previous, [provider]: { ...previous[provider], [field]: value } }));
    setStatus("");
  }
  async function persist(removeKey = false) {
    if (disabled) return;
    const apiKey = config.apiKey?.trim() || "";
    const model = config.model?.trim() || "";
    if (!isFree && !removeKey && (!apiKey || !model)) { setStatus("API anahtarı ve model kimliği gerekli."); return; }
    const next = { ...configs, [provider]: isFree ? {} : removeKey ? { model } : { apiKey, model } };
    setSaving(true);
    try {
      await chrome.storage.local.set({ chatSettings: { provider, providers: next } });
      setConfigs(next);
      setStatus(removeKey ? "Bu sağlayıcının API anahtarı silindi." : "Ayarlar kaydedildi. İlan sayfasından sohbet edebilirsin.");
    } catch { setStatus(removeKey ? "Anahtar silinemedi. Yeniden dene." : "Ayarlar kaydedilemedi. Yeniden dene."); }
    finally { setSaving(false); }
  }

  return <main>
    <h1><Sparkles size={26} aria-hidden="true" /> KariyerLens Asistan</h1><p>Mesajların, ilan ve araçlarla alınan şirket bilgileri seçtiğin sağlayıcıya gönderilir. {isFree ? "KariyerLens Free için API anahtarı gerekmez." : "Kendi API anahtarını kullan; API kullanımı sağlayıcının tarifesine göre ücretlendirilebilir."}</p>
    <form id="settings" onSubmit={event => { event.preventDefault(); void persist(); }}>
      <label htmlFor="provider">Sağlayıcı</label>
      <select id="provider" value={provider} disabled={disabled} onChange={event => {
        setProvider(selectProvider(event.target.value)); setStatus("");
      }}><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="cesurpolat">KariyerLens Free</option></select>
      {isFree && <p id="proxy-hint">API anahtarı veya model girmene gerek yok. Mesajların, ilan ve şirket bilgileri KariyerLens Free hizmetine gönderilir.</p>}
      {!isFree && <>
      <label htmlFor="api-key"><KeyRound size={16} aria-hidden="true" />API anahtarı</label>
      <input id="api-key" type="password" autoComplete="off" spellCheck={false} required disabled={disabled}
        value={config.apiKey || ""} onChange={event => update("apiKey", event.target.value)} />
      <label htmlFor="model">Model kimliği</label>
      <input id="model" type="text" autoComplete="off" spellCheck={false} required maxLength={200} disabled={disabled}
        value={config.model || ""} onChange={event => update("model", event.target.value)} />
      <p id="model-hint">{provider === "openai" ? "OpenAI hesabında erişebildiğin modelin tam kimliğini gir." : "OpenRouter model kimliğini sağlayıcı/model biçiminde gir."}</p>
      <p>Anahtar yalnız bu bilgisayarda uzantının yerel depolamasında saklanır; şifreli bir kasa değildir. Kariyer.net sayfasına veya sohbet kartına aktarılmaz. Sohbet geçmişi sayfa yenilenince silinir.</p>
      </>}
      <div className="actions"><button type="submit" disabled={disabled}><Save size={18} aria-hidden="true" />{saving ? "Kaydediliyor…" : "Kaydet"}</button>
        {!isFree && <button id="delete" type="button" disabled={disabled} onClick={() => void persist(true)}><Trash2 size={18} aria-hidden="true" />Bu sağlayıcının anahtarını sil</button>}</div>
    </form><p id="status" role="status" aria-live="polite">{status}</p>
  </main>;
}
