import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowUpRight, BriefcaseBusiness, ChevronRight, Eye, FlaskConical, LayoutDashboard, Link, ListFilter, Plus, RefreshCw, Search, Settings, Sparkles, Trash2, X } from "lucide-react";
import { MESSAGE_TYPES } from "../shared/messages.js";
import type { ChatResult, ChatStreamEvent, Failure } from "../shared/types.js";
import { MarkdownMessage } from "../features/chat/components/MarkdownMessage.js";
import { applicationStatuses, statusLabels } from "./models.js";
import type { ApplicationImportSummary, DashboardRequest, DashboardState, ResumeSummary, TrackedApplication, JobDiscoveryPreferences, } from "./models.js";
import { dateTime, experimentMetrics, isNewJob, jobIdFromUrl, variantSuggestion } from "./data.js";

type Page = "applications" | "experiments" | "discovery";
type Reply = { ok: true; data?: DashboardState; resumes?: ResumeSummary[]; notice?: string; scope?: string; importSummary?: ApplicationImportSummary } | Failure;
type Act = (request: DashboardRequest) => Promise<Reply>;
const labels: Record<Page, string> = { applications: "Başvurularım", experiments: "CV A/B Testi", discovery: "Bana Uygun İlanlar" };
const dateLabel = (value: string | number | null) => {
  const n = typeof value === "number" ? value : value ? dateTime(value) : null;
  return n === null ? "—" : new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(n);
};
const inputDate = (value: string) => { const n = dateTime(value); return n === null ? "" : new Date(n).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }); };
const percent = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 1 }).format(value);

export function DashboardApp() {
  const [page, setPage] = useState<Page>("applications");
  const [state, setState] = useState<DashboardState | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(""), [error, setError] = useState<Failure | null>(null);
  const [cvList, setCvList] = useState<ResumeSummary[]>([]);
  const [analysis, setAnalysis] = useState({ title: "", content: "", status: "", pending: false });
  const analysisPort = useRef<chrome.runtime.Port | null>(null);
  const verifiedScope = useRef<string | null>(null);
  const activeGeneration = useRef(0), mounted = useRef(true), mutationRunning = useRef(false);
  const resetAccount = () => { verifiedScope.current = null; activeGeneration.current++; setState(null); setCvList([]); analysisPort.current?.disconnect(); analysisPort.current = null; setAnalysis({ title: "", content: "", status: "", pending: false }); };
  const act: Act = async request => {
    if (mutationRunning.current) return { ok: false, code: "BUSY", message: "Devam eden işlemin bitmesini bekleyin." };
    mutationRunning.current = true;
    setBusy(true); setError(null); setNotice("");
    try {
      const scope = verifiedScope.current;
      let nextRequest = request;
      let added = 0, updated = 0, detailErrors = 0;
      const seen = new Set<string>();
      const counts = () => added + " yeni başvuru eklendi, " + updated + " mevcut kayıt güncellendi.";
      while (true) {
        const result: Reply = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.DASHBOARD, payload: nextRequest, ...(request.action === "get" ? {} : { scope }) });
        if (!mounted.current) return result;
        if (!result || !result.ok) {
          const failure = result && !result.ok ? result : { ok: false as const, code: "CONNECTION_ERROR", message: "Extension bağlantısı kurulamadı. Uzantıyı yeniden yükleyin." };
          setError(failure);
          if (request.action === "importApplications" && (added || updated)) setNotice(counts() + " İçe aktarma tamamlanamadı; alınan kayıtlar korundu.");
          if (failure.code === "AUTH_REQUIRED" || failure.code === "SESSION_NOT_CAPTURED") resetAccount();
          return failure;
        }
        if (request.action !== "get" && (verifiedScope.current !== scope || result.scope !== scope)) {
          const failure = { ok: false as const, code: "AUTH_REQUIRED", message: "Dashboard hesabı değişti. Yeniden bağlanıp tekrar deneyin." };
          setError(failure); resetAccount(); return failure;
        }
        if (result.scope) verifiedScope.current = result.scope;
        if (result.data) setState(result.data);
        if (result.resumes) setCvList(result.resumes);
        if (request.action !== "importApplications") { setNotice(result.notice || ""); return result; }
        const summary = result.importSummary;
        if (!summary) throw new Error("Import response missing");
        added += summary.added; updated += summary.updated; detailErrors += summary.detailErrors;
        summary.jobIds.forEach(id => seen.add(id));
        if (summary.nextPage === null) {
          setNotice((summary.total ? counts() : "Kariyer.net’te içe aktarılacak başvuru bulunamadı.") +
            (detailErrors ? " " + detailErrors + " başvurunun detayı alınamadı; Başvuruları yenile ile tekrar deneyin." : "") +
            (summary.warning ? " " + summary.warning : ""));
          return result;
        }
        setNotice("Başvurular içe aktarılıyor… " + counts());
        nextRequest = { action: "importApplications", page: summary.nextPage, seenJobIds: [...seen] };
      }
    } catch {
      const failure = { ok: false as const, code: "CONNECTION_ERROR", message: "Extension bağlantısı kesildi. Uzantıyı yeniden yükleyip deneyin." };
      setError(failure); if (request.action === "get") resetAccount(); return failure;
    } finally { mutationRunning.current = false; if (mounted.current) { setBusy(false); setLoading(false); } }
  };
  useEffect(() => {
    mounted.current = true; void act({ action: "get" });
    const reconnect = () => { if (document.visibilityState === "visible") { resetAccount(); setLoading(true); if (!mutationRunning.current) void act({ action: "get" }); } };
    document.addEventListener("visibilitychange", reconnect);
    return () => { mounted.current = false; activeGeneration.current++; analysisPort.current?.disconnect(); document.removeEventListener("visibilitychange", reconnect); };
  }, []);
  function cancelAnalysis() { activeGeneration.current++; analysisPort.current?.disconnect(); analysisPort.current = null; setAnalysis(a => ({ ...a, pending: false, status: "Analiz durduruldu." })); }
  function analyze(jobId: string, choice: { experimentId?: string; resumeId?: string }, title: string) {
    cancelAnalysis(); const generation = ++activeGeneration.current; setError(null);
    setAnalysis({ title, content: "", pending: true, status: "İlan ve CV bilgileri alınıyor…" });
    let done = false;
    try {
      const port = chrome.runtime.connect({ name: MESSAGE_TYPES.DASHBOARD_ANALYSIS }); analysisPort.current = port;
      port.onMessage.addListener((event: ChatStreamEvent) => {
        if (generation !== activeGeneration.current) return;
        if (event.type === "text") setAnalysis(a => ({ ...a, content: event.content }));
        else if (event.type === "status") setAnalysis(a => ({ ...a, status: event.text }));
        else { done = true;
          const result: ChatResult = event.result;
          if (result.ok) setAnalysis({ title, content: result.reply, pending: false, status: "Analiz tamamlandı." });
          else { setError(result); setAnalysis(a => ({ ...a, pending: false, status: result.message })); if (result.code === "AUTH_REQUIRED" || result.code === "SESSION_NOT_CAPTURED") resetAccount(); }
          analysisPort.current = null; port.disconnect();
        }
      });
      port.onDisconnect.addListener(() => {
        if (!done && generation === activeGeneration.current) { setAnalysis(a => ({ ...a, pending: false, status: "Analiz bağlantısı kesildi. Yeniden deneyin." })); analysisPort.current = null; }
      });
      port.postMessage({ jobId, ...choice, scope: verifiedScope.current });
    } catch { setAnalysis(a => ({ ...a, pending: false, status: "Analiz başlatılamadı. Uzantıyı yeniden yükleyin." })); }
  }
  const apps = state?.applications ?? [];
  const stats = [
    { label: "Takip edilen ilan", value: apps.length, icon: BriefcaseBusiness, tone: "purple" },
    { label: "Başvuru", value: apps.filter(a => a.status !== "saved" || a.api.applied).length, icon: ArrowUpRight, tone: "blue" },
    { label: "CV görüntülenen", value: apps.filter(a => [...a.api.events, ...a.manualEvents].some(e => e.viewed)).length, icon: Eye, tone: "orange" },
    { label: "Mülakat", value: apps.filter(a => a.interviewed).length, icon: Sparkles, tone: "green" },
  ];
  return <div className="dashboard-shell">
    <aside className="sidebar"><a className="brand" href="#" onClick={e => { e.preventDefault(); setPage("applications"); }}><span className="brand-icon"><Search size={23} /></span><span>KariyerLens<small>KARİYER ÇALIŞMA ALANIN</small></span></a>
      <div className="nav-caption">ÇALIŞMA ALANI</div><nav aria-label="Ana gezinme">{([ ["applications", BriefcaseBusiness], ["experiments", FlaskConical], ["discovery", Sparkles] ] as const).map(([id, Icon]) => <button key={id} className={page === id ? "nav-item active" : "nav-item"} onClick={() => setPage(id)} aria-current={page === id ? "page" : undefined}><Icon size={19} />{labels[id]}{page === id && <ChevronRight size={16} />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="local-note"><span className="local-dot" /><div>Bu tarayıcıda saklanır<small>Başvuruların ve CV testlerin yerel.</small></div></div><button className="nav-item" onClick={() => { void chrome.runtime.openOptionsPage(); }}><Settings size={19} />Ayarlar</button><a className="nav-item" href="https://www.kariyer.net" target="_blank" rel="noopener noreferrer"><ArrowUpRight size={19} />Kariyer.net’i aç</a></div>
    </aside>
    <main><header className="topbar"><span><LayoutDashboard size={16} /> Dashboard <ChevronRight size={14} /> {labels[page]}</span><button className="quiet" disabled={busy} onClick={() => { resetAccount(); setLoading(true); void act({ action: "get" }); }}><RefreshCw size={15} />Yeniden bağlan</button></header>
      <div className="main-content"><div className="page-heading"><div><span className="eyebrow">KARİYERİNİ BİR ADIM İLERİ TAŞI</span><h1>{labels[page]}</h1><p>{page === "applications" ? "Her başvurunun hikâyesini tek yerde takip et." : page === "experiments" ? "İki CV, gerçek başvurular ve daha bilinçli kararlar." : "Profiline göre önerilen işler arasından yeni fırsatları keşfet."}</p></div><span className="account-status"><span className="local-dot" />{state ? "Hesap doğrulandı" : "Bağlantı bekleniyor"}</span></div>
      {error && <div className="alert error" role="alert">{error.message}{(error.code === "AUTH_REQUIRED" || error.code === "SESSION_NOT_CAPTURED") && <a href="https://www.kariyer.net" target="_blank" rel="noopener noreferrer">Kariyer.net’i aç <ArrowUpRight size={14} /></a>}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}
      {loading && <div className="empty panel" role="status"><RefreshCw className="spin" /><h2>Hesabın doğrulanıyor</h2><p>Yerel kayıtların doğru hesabın altında açılacak.</p></div>}
      {!loading && !state && <div className="empty panel"><Search size={36} /><h2>Çalışma alanına bağlan</h2><p>Kariyer.net’te oturum aç, profil sayfanı yenile ve buradan yeniden bağlan.</p><button className="primary" disabled={busy} onClick={() => { void act({ action: "get" }); }}>Yeniden bağlan</button></div>}
      {state && <><section className="stats" aria-label="Başvuru özeti">{stats.map(s => <div className="stat-card" key={s.label}><span className={"stat-icon " + s.tone}><s.icon size={20} /></span><strong>{s.value}</strong><span>{s.label}</span></div>)}</section>
        {page === "applications" && <Applications state={state} busy={busy} act={act} />}
        {page === "experiments" && <Experiments state={state} resumes={cvList} busy={busy} act={act} analyze={analyze} analysisPending={analysis.pending} />}
        {page === "discovery" && <Discovery state={state} resumes={cvList} busy={busy} act={act} analyze={analyze} analysisPending={analysis.pending} />}
        {analysis.title && <section className="panel analysis-panel"><div className="section-heading"><div><span className="eyebrow">KARİYERLENS ASİSTAN</span><h2>{analysis.title}</h2></div>{analysis.pending ? <button className="secondary" onClick={cancelAnalysis}><X size={15} />Durdur</button> : <button className="quiet" aria-label="Analizi kapat" onClick={() => setAnalysis({ title: "", content: "", status: "", pending: false })}><X size={18} /></button>}</div><p className="muted" role="status">{analysis.pending && <RefreshCw size={14} className="spin" />} {analysis.status}</p>{analysis.content && <MarkdownMessage content={analysis.content} />}</section>}
      </>}
      <footer>KariyerLens · Başvuruların için daha net bir bakış.</footer></div>
    </main>
  </div>;
}

function Applications({ state, busy, act }: { state: DashboardState; busy: boolean; act: Act }) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState(""), [url, setUrl] = useState(""), [selected, setSelected] = useState("");
  const [linkError, setLinkError] = useState("");
  const list = state.applications.filter(a => (!filter || a.status === filter) && (a.title + " " + a.companyName).toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  const current = state.applications.find(a => a.jobId === selected);
  const variants = state.experiments.flatMap(e => e.variants);
  async function add(e: FormEvent) { e.preventDefault(); const jobId = jobIdFromUrl(url); if (!jobId) { setLinkError("Geçerli bir Kariyer.net ilan bağlantısı gir."); return; }
    setLinkError(""); const result = await act({ action: "track", jobId }); if (result.ok) { setUrl(""); setSelected(jobId); } }
  const recent = state.applications.flatMap(a => [...a.api.events, ...a.manualEvents].map(e => ({ ...e, jobId: a.jobId, title: a.title })))
    .sort((a, b) => (dateTime(b.at) ?? 0) - (dateTime(a.at) ?? 0)).slice(0, 5);
  return <><section className="panel"><div className="section-heading"><div><h2>Başvuru listesi <span className="count-badge">{state.applications.length}</span></h2><p>Kaydet, başvur ve sürecin her adımını takip et.</p></div><div className="application-actions"><button className="primary" disabled={busy} onClick={() => { void act({ action: "importApplications", page: 1, seenJobIds: [] }); }}><Plus size={16} />Başvurularımı içe aktar</button><button className="secondary" disabled={busy || !state.applications.length} onClick={() => { void act({ action: "refresh" }); }}><RefreshCw size={16} className={busy ? "spin" : ""} />Başvuruları yenile</button></div></div>
    <form className="add-link" onSubmit={add}><Link size={17} /><label className="sr-only" htmlFor="job-url">Kariyer.net ilan bağlantısı</label><input id="job-url" type="url" placeholder="Kariyer.net ilan bağlantısını yapıştır…" value={url} onChange={e => setUrl(e.target.value)} required /><button className="primary" disabled={busy}><Plus size={16} />Takibe ekle</button></form>{linkError && <p className="field-error" role="alert">{linkError}</p>}
    <div className="filters"><label className="search-field"><Search size={17} /><input aria-label="Başlık veya şirket ara" placeholder="Pozisyon veya şirket ara" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="select-field"><ListFilter size={16} /><select aria-label="Başvuru durumu" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Tüm durumlar</option>{applicationStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label></div>
    {!list.length ? <div className="empty"><BriefcaseBusiness size={32} /><h3>{state.applications.length ? "Eşleşen başvuru bulunamadı" : "Başvurularını içe aktar veya ilan ekle"}</h3><p>Kariyer.net’teki mevcut başvuruların için Başvurularımı içe aktar düğmesini kullan. Yeni bir ilanı bağlantısıyla da takibe ekleyebilirsin.</p></div> : <div className="table-wrap"><table className="application-table"><thead><tr><th>Pozisyon / Şirket</th><th>Durum</th><th>Başvuru tarihi</th><th>CV sürümü</th><th>Takip</th></tr></thead><tbody>{list.map(a => <tr key={a.jobId} className={selected === a.jobId ? "selected-row" : ""}><td><button className="job-title" onClick={() => setSelected(a.jobId)}>{a.title}</button><span className="company-name">{a.companyName || "Şirket belirtilmemiş"}</span>{a.api.error && <span className="field-error">{a.api.error}</span>}</td><td><span className={"status-badge status-" + a.status}>{statusLabels[a.status]}</span></td><td>{dateLabel(a.appliedAt || a.api.appliedAt)}</td><td>{variants.find(v => v.id === a.variantId)?.label ?? "Atanmadı"}</td><td><button className="quiet" onClick={() => setSelected(a.jobId)}>Detay <ChevronRight size={14} /></button>{a.followUpAt && <small>{dateLabel(a.followUpAt)}</small>}</td></tr>)}</tbody></table></div>}
  </section>
  {current && <ApplicationEditor key={JSON.stringify(current)} app={current} state={state} busy={busy} act={act} close={() => setSelected("")} />}
  <section className="panel"><div className="section-heading"><div><h2>Son hareketler</h2><p>Başvuru bilgileri ve eklediğin süreç notları.</p></div></div>{recent.length ? <div className="timeline">{recent.map((e, i) => <div className="timeline-item" key={e.jobId + e.id + i}><span className="timeline-dot" /><div><strong>{e.text.startsWith("Süreç: ") ? "Süreç: " + (statusLabels[e.text.slice(7) as keyof typeof statusLabels] || e.text.slice(7)) : e.text}</strong><button className="text-button" onClick={() => setSelected(e.jobId)}>{e.title}</button></div><time>{dateLabel(e.at)}</time></div>)}</div> : <p className="muted empty-copy">Henüz bir hareket yok. Başvurularını yenilediğinde veya süreç bilgisi eklediğinde burada görünür.</p>}</section>
  </>;
}

function ApplicationEditor({ app, state, busy, act, close }: { app: TrackedApplication; state: DashboardState; busy: boolean; act: Act; close: () => void }) {
  const [patch, setPatch] = useState({ status: app.status, appliedAt: inputDate(app.appliedAt || app.api.appliedAt), notes: app.notes, followUpAt: app.followUpAt, variantId: app.variantId, responded: app.responded, manualEvents: app.manualEvents });
  const [eventText, setEventText] = useState(""), [eventDate, setEventDate] = useState(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })), [eventViewed, setEventViewed] = useState(false);
  const allVariants = state.experiments.flatMap(e => e.variants), suggestion = variantSuggestion(app, allVariants), suggested = allVariants.find(v => v.id === suggestion);
  async function save(e: FormEvent) { e.preventDefault(); await act({ action: "update", jobId: app.jobId, patch }); }
  const events = [...app.api.events, ...patch.manualEvents].sort((a, b) => (dateTime(b.at) ?? 0) - (dateTime(a.at) ?? 0));
  return <section className="panel detail-panel"><div className="section-heading"><div><span className="eyebrow">BAŞVURU DETAYI</span><h2>{app.title}</h2><p>{app.companyName}</p></div><button className="quiet" aria-label="Detayı kapat" onClick={close}><X size={18} /></button></div>
    <form onSubmit={save}><fieldset disabled={busy}><div className="form-grid"><label>Süreç durumu<select value={patch.status} onChange={e => setPatch({ ...patch, status: e.target.value as TrackedApplication["status"] })}>{applicationStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label><label>Başvuru tarihi<input type="date" value={patch.appliedAt} onChange={e => setPatch({ ...patch, appliedAt: e.target.value })} /></label><label>Kullanılan CV sürümü<select value={patch.variantId} onChange={e => setPatch({ ...patch, variantId: e.target.value })}><option value="">Atanmadı</option>{state.experiments.map(e => <optgroup key={e.id} label={e.name}>{e.variants.map(v => <option key={v.id} value={v.id}>{v.label} · {v.name}</option>)}</optgroup>)}</select></label><label>Takip tarihi<input type="date" value={patch.followUpAt} onChange={e => setPatch({ ...patch, followUpAt: e.target.value })} /></label></div>
    {suggested && !patch.variantId && <p className="hint">API’deki CV kimliği {suggested.label} · {suggested.name} ile eşleşiyor. Gönderdiğin sürüm buysa seç: <button type="button" className="text-button" onClick={() => setPatch({ ...patch, variantId: suggested.id })}>Bu sürümü seç</button></p>}
    <label className="checkbox-label"><input type="checkbox" checked={patch.responded} onChange={e => setPatch({ ...patch, responded: e.target.checked })} />İşverenden dönüş aldım</label><label>Notlar<textarea rows={3} maxLength={4000} placeholder="Görüşme notları, iletişim veya sonraki adım…" value={patch.notes} onChange={e => setPatch({ ...patch, notes: e.target.value })} /></label>
    <div className="api-summary"><span>API başvuru bilgisi: <strong>{app.api.applied === null ? "Henüz alınmadı" : app.api.applied ? "Başvuruldu" : "Başvuru bulunamadı"}</strong></span><span>CV: {app.api.cvName || "—"}</span><span>Son güncelleme: {dateLabel(app.api.fetchedAt)}</span></div>
    <h3>Etkileşim geçmişi</h3>{events.length ? <ul className="event-list">{events.map(e => <li key={e.source + e.id}><span className="event-copy">{e.source === "manual" ? <div className="manual-event-edit"><input aria-label="Manuel etkileşim açıklaması" value={e.text} maxLength={4000} onChange={change => setPatch({ ...patch, manualEvents: patch.manualEvents.map(item => item.id === e.id ? { ...item, text: change.target.value } : item) })} /><input aria-label="Manuel etkileşim tarihi" type="date" value={inputDate(e.at)} onChange={change => setPatch({ ...patch, manualEvents: patch.manualEvents.map(item => item.id === e.id ? { ...item, at: change.target.value } : item) })} /><label className="checkbox-label"><input type="checkbox" checked={e.viewed} onChange={change => setPatch({ ...patch, manualEvents: patch.manualEvents.map(item => item.id === e.id ? { ...item, viewed: change.target.checked } : item) })} />Görüntülenme</label></div> : <strong>{e.text}</strong>}<small>{dateLabel(e.at)} · {e.source === "api" ? "Kariyer.net" : "Manuel"}{e.viewed ? " · CV görüntülendi" : ""}</small></span>{e.source === "manual" && <button type="button" className="quiet" aria-label="Manuel etkileşimi sil" onClick={() => setPatch({ ...patch, manualEvents: patch.manualEvents.filter(x => x.id !== e.id) })}><Trash2 size={15} /></button>}</li>)}</ul> : <p className="muted">Henüz etkileşim yok.</p>}
    <div className="event-input"><input aria-label="Etkileşim açıklaması" placeholder="Etkileşim ekle…" value={eventText} maxLength={4000} onChange={e => setEventText(e.target.value)} /><input aria-label="Etkileşim tarihi" type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} /><label className="checkbox-label"><input type="checkbox" checked={eventViewed} onChange={e => setEventViewed(e.target.checked)} />Görüntülenme</label><button type="button" className="secondary" disabled={!eventText.trim() || !eventDate || patch.manualEvents.length >= 99} onClick={() => { setPatch({ ...patch, manualEvents: [...patch.manualEvents, { id: crypto.randomUUID(), text: eventText.trim(), at: eventDate, viewed: eventViewed, source: "manual" }] }); setEventText(""); setEventViewed(false); }}><Plus size={15} />Ekle</button></div>
    <div className="form-actions"><button className="primary">Kaydet</button><a className="secondary" href={app.jobUrl} target="_blank" rel="noopener noreferrer">İlanı aç <ArrowUpRight size={15} /></a><button type="button" className="danger-button" onClick={async () => { const result = await act({ action: "remove", jobId: app.jobId }); if (result.ok) close(); }}><Trash2 size={15} />Takipten kaldır</button></div>
    </fieldset></form>
  </section>;
}

type Analyze = (jobId: string, choice: { experimentId?: string; resumeId?: string }, title: string) => void;
function Experiments({ state, resumes, busy, act, analyze, analysisPending }: { state: DashboardState; resumes: ResumeSummary[]; busy: boolean; act: Act; analyze: Analyze; analysisPending: boolean }) {
  const [name, setName] = useState(""), [a, setA] = useState(""), [b, setB] = useState(""), [selected, setSelected] = useState(state.experiments[0]?.id || "");
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [jobUrl, setJobUrl] = useState(""), [job, setJob] = useState(""), [localError, setLocalError] = useState("");
  const experiment = state.experiments.find(e => e.id === selected) ?? state.experiments[0];
  async function create(e: FormEvent) { e.preventDefault(); const result = await act({ action: "createExperiment", name, resumeA: a, resumeB: b }); if (result.ok) { setName(""); setSelected(result.data?.experiments[0]?.id || ""); } }
  function compare(e: FormEvent) { e.preventDefault(); const id = job || jobIdFromUrl(jobUrl); if (!id || !experiment) { setLocalError("Analiz için bir ilan seç veya geçerli ilan bağlantısı gir."); return; } setLocalError(""); analyze(id, { experimentId: experiment.id }, "A/B CV karşılaştırması · " + experiment.name); }
  return <><section className="panel"><div className="section-heading"><div><h2>Yeni bir CV testi oluştur</h2><p>Kariyer.net hesabındaki iki farklı CV’nin mevcut içerikleri sabitlenir.</p></div><button className="secondary" disabled={busy} onClick={() => { void act({ action: "resumes" }); }}><RefreshCw size={16} />CV’leri getir</button></div>
    {resumes.length < 2 && <div className="hint">A/B testi için iki farklı Kariyer.net CV’si gerekiyor. CV’leri getirerek hesabındaki sürümleri seç.</div>}
    <form onSubmit={create}><fieldset disabled={busy || resumes.length < 2}><div className="test-create"><label>Test adı<input placeholder="Örn. Teknik detay vs. proje odaklı" value={name} maxLength={100} onChange={e => setName(e.target.value)} required /></label><label><span className="variant-label">A</span> CV sürümü<select value={a} onChange={e => setA(e.target.value)} required><option value="">CV seç</option>{resumes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label><span className="variant-label variant-b">B</span> CV sürümü<select value={b} onChange={e => setB(e.target.value)} required><option value="">CV seç</option>{resumes.map(r => <option key={r.id} value={r.id} disabled={r.id === a}>{r.name}</option>)}</select></label><button className="primary" disabled={!a || !b || a === b}><Plus size={16} />Test oluştur</button></div></fieldset></form>
  </section>
  {!experiment ? <section className="panel empty"><FlaskConical size={36} /><h2>CV’lerinin etkisini keşfet</h2><p>Bir test oluştur, başvurularını A/B sürümlerine bağla ve sonuçları burada karşılaştır.</p></section> : <section className="panel"><div className="section-heading"><div><h2>Gerçek başvuru sonuçları</h2><p>Gözlemsel karşılaştırma · Otomatik kazanan belirlenmez.</p></div><select aria-label="CV testi seç" value={experiment.id} onChange={e => setSelected(e.target.value)}>{state.experiments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div><div className="date-filters"><label>Başlangıç<input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label>Bitiş<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label></div>
    <div className="variant-cards">{experiment.variants.map(v => { const m = experimentMetrics(state.applications, v.id, from, to); return <article className="variant-card" key={v.id}><span className={"variant-label " + (v.label === "B" ? "variant-b" : "")}>{v.label}</span><h3>{v.name}</h3><p>İçerik sabitlendi: {dateLabel(v.fetchedAt)}</p>{v.truncated && <p className="field-error">CV içeriği kısaltılmış; AI analizi eksik bölümleri değerlendiremez.</p>}<strong className="sample-count">{m.applications}<small>ölçüme giren başvuru</small></strong><div className="metric-list">{([["Görüntülenme", m.viewed], ["Dönüş", m.responded], ["Mülakat", m.interviewed], ["Teklif", m.offered]] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{percent(value.rate)} <small>{value.count}/{m.applications}</small></strong><div className="metric-track"><span style={{ width: (value.rate ?? 0) * 100 + "%" }} /></div></div>)}</div></article>; })}</div>
    <p className="hint">Yalnız CV sürümü atanmış, başvuru tarihi bulunan başvurular sayılır. Her başvuru bir sonuç için bir kez sayılır; görüşme ve teklif geçmişi korunur. Dönüşü başvuru detayından işaretle.</p>
    <div className="analysis-setup"><h3><Sparkles size={18} />İlana göre A/B analizi</h3><p>Seçilen AI sağlayıcısı, test başında sabitlenen iki CV içeriğini kullanır.</p><form onSubmit={compare}><div className="form-grid"><label>Takip edilen ilan<select value={job} onChange={e => setJob(e.target.value)}><option value="">İlan seç</option>{state.applications.map(a => <option key={a.jobId} value={a.jobId}>{a.title} · {a.companyName}</option>)}</select></label><label>Veya ilan bağlantısı<input type="url" disabled={Boolean(job)} placeholder="https://www.kariyer.net/is-ilani/…" value={jobUrl} onChange={e => setJobUrl(e.target.value)} /></label></div>{localError && <p className="field-error" role="alert">{localError}</p>}<button className="primary" disabled={busy || analysisPending}><Sparkles size={16} />A/B analiz et</button></form></div>
  </section>}
  </>;
}

function Discovery({ state, resumes, busy, act, analyze, analysisPending }: { state: DashboardState; resumes: ResumeSummary[]; busy: boolean; act: Act; analyze: Analyze; analysisPending: boolean }) {
  const [prefs, setPrefs] = useState<JobDiscoveryPreferences>(state.preferences);
  const jobs = state.discovery.jobs, newJobs = jobs.filter(j => isNewJob(j)), unknown = jobs.filter(j => dateTime(j.publishedAt) === null), older = jobs.filter(j => dateTime(j.publishedAt) !== null && !isNewJob(j));
  const cards = (items: typeof jobs) => <div className="job-grid">{items.map(j => <article className="discovery-card" key={j.id}><div className="job-card-top"><span className="company-monogram">{(j.companyName || "K").slice(0, 1)}</span>{isNewJob(j) && <span className="new-badge">Yeni ilan</span>}</div><h3><a href={j.jobUrl || "https://www.kariyer.net/is-ilani/ilan-" + j.id} target="_blank" rel="noopener noreferrer">{j.title}<ArrowUpRight size={16} /></a></h3><p>{j.companyName || "Şirket belirtilmemiş"}</p><div className="job-tags"><span>{j.location || "Konum belirtilmemiş"}</span><span>{j.workModel || "Çalışma modeli belirtilmemiş"}</span></div><div className="job-dates"><span>Yayın: {dateLabel(j.publishedAt)}</span><span>İlk görüldü: {dateLabel(j.firstSeenAt)}</span></div><div className="job-card-actions"><button className="secondary" disabled={busy || state.applications.some(a => a.jobId === j.id)} onClick={() => { void act({ action: "track", jobId: j.id }); }}><Plus size={14} />{state.applications.some(a => a.jobId === j.id) ? "Takipte" : "Takibe ekle"}</button><button className="text-button" disabled={busy || analysisPending || !prefs.resumeId} onClick={() => analyze(j.id, { resumeId: prefs.resumeId }, "CV uyum analizi · " + j.title)}><Sparkles size={14} />Uyumu analiz et</button></div></article>)}</div>;
  return <><section className="panel"><div className="section-heading"><div><h2>Yeni fırsatları bul</h2><p>Kariyer.net profil önerileri · CV seçimin ayrıntılı AI analizinde kullanılır.</p></div><span className="muted">Son yenileme: {dateLabel(state.discovery.fetchedAt)}</span></div>
    <form onSubmit={e => { e.preventDefault(); void act({ action: "search", preferences: prefs, page: 1 }); }}><fieldset disabled={busy}><div className="discovery-filters"><label>Hedef pozisyon<input value={prefs.keyword} maxLength={200} placeholder="Örn. Frontend geliştirici" onChange={e => setPrefs({ ...prefs, keyword: e.target.value })} /></label><label>Konum<select value={prefs.cities[0] || ""} onChange={e => setPrefs({ ...prefs, cities: e.target.value ? [e.target.value] : [] })}><option value="">Tüm konumlar</option>{state.discovery.options.cities.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Çalışma modeli<select value={prefs.workModels[0] || ""} onChange={e => setPrefs({ ...prefs, workModels: e.target.value ? [e.target.value] : [] })}><option value="">Tüm modeller</option>{state.discovery.options.workModels.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label><button className="primary"><RefreshCw size={16} className={busy ? "spin" : ""} />Yenile</button></div></fieldset></form>
    {!state.discovery.fetchedAt && <p className="hint">İlk yenilemede API’nin konum ve çalışma modeli seçenekleri yüklenir. İlan araması yalnız sen yenilediğinde çalışır.</p>}
    <div className="cv-choice"><label>Uyum analizinde kullanılacak CV<select value={prefs.resumeId} onChange={e => setPrefs({ ...prefs, resumeId: e.target.value })}><option value="">CV seç</option>{resumes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><button className="secondary" disabled={busy} onClick={() => { void act({ action: "resumes" }); }}>CV’leri getir</button><p>Analiz et’e bastığında CV ve ilan seçtiğin AI sağlayıcısına gönderilir.</p></div>
  </section>
  {!jobs.length ? <section className="panel empty"><Sparkles size={36} /><h2>{state.discovery.fetchedAt ? "Bu filtrelerle ilan bulunamadı" : "Bir sonraki fırsatın burada"}</h2><p>Yenile’ye basarak profilin için önerilen ilanları getir.</p></section> : <>
    <section className="discovery-section"><div className="section-heading"><div><h2>Son 7 günde yayımlananlar <span className="count-badge">{newJobs.length}</span></h2><p>Bu sayfadaki sonuçların yayın tarihine göre.</p></div></div>{newJobs.length ? cards(newJobs) : <p className="panel empty-copy muted">Bu sonuç sayfasında son 7 gün içinde yayımlanmış ilan yok.</p>}</section>
    {unknown.length > 0 && <section className="discovery-section"><h2>Yayın tarihi bilinmeyenler <span className="count-badge">{unknown.length}</span></h2><p className="muted">Bu ilanların ne zaman açıldığı doğrulanamıyor.</p>{cards(unknown)}</section>}
    {older.length > 0 && <section className="discovery-section"><h2>Diğer önerilen ilanlar <span className="count-badge">{older.length}</span></h2>{cards(older)}</section>}
    <div className="pagination"><button className="secondary" disabled={busy || state.discovery.currentPage <= 1} onClick={() => { void act({ action: "search", preferences: prefs, page: state.discovery.currentPage - 1 }); }}>Önceki</button><span>Sayfa {state.discovery.currentPage} · {state.discovery.total} önerilen ilan</span><button className="secondary" disabled={busy || state.discovery.currentPage * 12 >= state.discovery.total} onClick={() => { void act({ action: "search", preferences: prefs, page: state.discovery.currentPage + 1 }); }}>Sonraki</button></div>
  </>}
  </>;
}
