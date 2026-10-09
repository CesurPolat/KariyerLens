import { MESSAGE_TYPES } from "../shared/messages.js";
import type { MemoryStatus } from "../features/memory/chat-memory.js";
import { useEffect, useState } from "react";
import { KeyRound, Save, Sparkles, Trash2 } from "lucide-react";
import type { ChatSettings, Provider, ProviderSettings } from "../shared/types.js";

const modelOptions: Record<Provider, { id: string; name: string }[]> = {
  openai: [{ id: "gpt-4.1-mini", name: "GPT-4.1 mini" }, { id: "gpt-4.1", name: "GPT-4.1" }],
  openrouter: [{ id: "openai/gpt-4.1-mini", name: "OpenAI · GPT-4.1 mini" }, { id: "google/gemini-2.5-flash", name: "Google · Gemini 2.5 Flash" }],
  cesurpolat: [],
};

type Configs = Record<Provider, ProviderSettings>;
const selectProvider = (value: unknown): Provider => value === "openrouter" || value === "cesurpolat" ? value : "openai";

export function OptionsApp() {
  const [provider, setProvider] = useState<Provider>("openai");
  const [configs, setConfigs] = useState<Configs>({ openai: {}, openrouter: {}, cesurpolat: {} });
  const [customModels, setCustomModels] = useState<Record<Provider, boolean>>({ openai: false, openrouter: false, cesurpolat: false });
  const [memory, setMemory] = useState<MemoryStatus | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState("");
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
        try {
          const result = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_MEMORY_STATUS });
          if (active) { if (result?.ok) setMemory(result.data); else setMemoryStatus("Hafıza bilgileri alınamadı."); }
        } catch { if (active) setMemoryStatus("Hafıza bilgileri alınamadı."); }
      } catch { if (active) setStatus("Ayarlar yüklenemedi. Uzantıyı yeniden yükleyip deneyin."); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const config = configs[provider];
  const isFree = provider === "cesurpolat";
  const models = modelOptions[provider];
  const isCustomModel = customModels[provider] || Boolean(config.model && !models.some(model => model.id === config.model));
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

  async function manageMemory(type: string, enabled?: boolean) {
    if (memoryBusy) return;
    setMemoryBusy(true);
    try {
      const result = await chrome.runtime.sendMessage({ type, ...(enabled === undefined ? {} : { enabled }) });
      if (!result?.ok) throw new Error("memory unavailable");
      setMemory(result.data);
      setMemoryStatus(type === MESSAGE_TYPES.REFRESH_CV_MEMORY ? "CV hafızası sıfırlandı. Sonraki ilgili sorunda güncel CV alınacak."
        : type === MESSAGE_TYPES.CLEAR_MEMORY ? "İlan ve CV hafızası temizlendi."
        : enabled ? "Hafıza açıldı." : "Hafıza kapatıldı. Kayıtlar kullanılmayacak veya güncellenmeyecek.");
    } catch { setMemoryStatus("Hafıza işlemi tamamlanamadı. Yeniden dene."); }
    finally { setMemoryBusy(false); }
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
      <label htmlFor="model-select">Model</label>
      <select id="model-select" value={isCustomModel ? "custom" : config.model || ""} required disabled={disabled}
        onChange={event => {
          const custom = event.target.value === "custom";
          setCustomModels(previous => ({ ...previous, [provider]: custom }));
          if (!custom) update("model", event.target.value); else setStatus("");
        }}>
        <option value="" disabled>Model seç</option>
        {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
        <option value="custom">Özel model · Kimliğini elle gir</option>
      </select>
      {isCustomModel && <><label htmlFor="model">Özel model kimliği</label>
        <input id="model" type="text" autoComplete="off" spellCheck={false} required maxLength={200} disabled={disabled}
          placeholder={provider === "openai" ? "Modelin tam kimliği" : "sağlayıcı/model"}
          value={config.model || ""} onChange={event => update("model", event.target.value)} /></>}
      <p id="model-hint">{provider === "openai" ? "Listeden seç veya Özel model ile hesabında erişebildiğin modelin tam kimliğini gir." : "Listeden seç veya Özel model ile sağlayıcı/model biçimindeki kimliği gir."}</p>
      <p>Anahtar yalnız bu bilgisayarda uzantının yerel depolamasında saklanır; şifreli bir kasa değildir. Kariyer.net sayfasına veya sohbet kartına aktarılmaz. Sohbet geçmişi sayfa yenilenince silinir.</p>
      </>}
      <div className="actions"><button type="submit" disabled={disabled}><Save size={18} aria-hidden="true" />{saving ? "Kaydediliyor…" : "Kaydet"}</button>
        {!isFree && <button id="delete" type="button" disabled={disabled} onClick={() => void persist(true)}><Trash2 size={18} aria-hidden="true" />Bu sağlayıcının anahtarını sil</button>}</div>
    </form>
    <section className="memory-settings" aria-labelledby="memory-title">
      <h2 id="memory-title">İlan ve CV hafızası</h2>
      <p>Asistanla sohbet ettiğin ilanlar ve ihtiyaç anında alınan CV bilgileri bu cihazda saklanır. İlgili sorularda hafızadaki bilgiler seçtiğin yapay zekâ sağlayıcısına gönderilir. CV kayıtları 24 saat geçerlidir. Sohbeti temizlemek hafızayı silmez.</p>
      <label className="memory-toggle"><input type="checkbox" checked={memory?.enabled ?? true} disabled={!memory || memoryBusy}
        onChange={event => void manageMemory(MESSAGE_TYPES.SET_MEMORY_ENABLED, event.target.checked)} />Hafızayı kullan</label>
      {memory && <p>{memory.jobCount} ilan · {memory.cvCount} CV kaydı<br />
        Son CV kaydı: {memory.cvFetchedAt === null ? "Henüz yok" : new Date(memory.cvFetchedAt).toLocaleString("tr-TR")}</p>}
      <div className="actions">
        <button type="button" disabled={!memory || memoryBusy} onClick={() => void manageMemory(MESSAGE_TYPES.REFRESH_CV_MEMORY)}>CV hafızasını yenile</button>
        <button type="button" disabled={!memory || memoryBusy} onClick={() => void manageMemory(MESSAGE_TYPES.CLEAR_MEMORY)}><Trash2 size={18} aria-hidden="true" />Hafızayı temizle</button>
      </div>
      <p role="status" aria-live="polite">{memoryStatus}</p>
    </section>
    <p id="status" role="status" aria-live="polite">{status}</p>
  </main>;
}
