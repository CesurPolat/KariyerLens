import { useState } from "react";
import { ArrowUpRight, BriefcaseBusiness, ChevronRight, Eye, FlaskConical, LayoutDashboard, RefreshCw, Search, Settings, Sparkles } from "lucide-react";
import type { DashboardPage } from "./ui-types.js";
import { useDashboard } from "./hooks/useDashboard.js";
import { Applications } from "./pages/Applications.js";
import { Experiments } from "./pages/Experiments.js";
import { Discovery } from "./pages/Discovery.js";
import { AnalysisPanel } from "./components/AnalysisPanel.js";

const labels: Record<DashboardPage, string> = { applications: "Başvurularım", experiments: "CV A/B Testi", discovery: "Bana Uygun İlanlar" };

export function DashboardApp() {
  const [page, setPage] = useState<DashboardPage>("applications");
  const { state, busy, loading, notice, error, cvList, act, reconnect, analysis, cancelAnalysis, analyze, resetAnalysis } = useDashboard();
  const apps = state?.applications ?? [];
  const stats = [
    { label: "Takip edilen ilan", value: apps.length, icon: BriefcaseBusiness, tone: "purple" },
    { label: "Başvuru", value: apps.filter(a => a.status !== "saved" || a.api.applied).length, icon: ArrowUpRight, tone: "blue" },
    { label: "CV görüntülenen", value: apps.filter(a => [...a.api.events, ...a.manualEvents].some(e => e.viewed) || state?.resumeViews.records.some(v => v.resumeId === a.api.cvId && v.jobId === a.jobId && v.viewCount > 0)).length, icon: Eye, tone: "orange" },
    { label: "Mülakat", value: apps.filter(a => a.interviewed).length, icon: Sparkles, tone: "green" },
  ];
  return <div className="dashboard-shell">
    <aside className="sidebar"><a className="brand" href="#" onClick={e => { e.preventDefault(); setPage("applications"); }}><span className="brand-icon"><Search size={23} /></span><span>KariyerLens<small>KARİYER ÇALIŞMA ALANIN</small></span></a>
      <div className="nav-caption">ÇALIŞMA ALANI</div><nav aria-label="Ana gezinme">{([ ["applications", BriefcaseBusiness], ["experiments", FlaskConical], ["discovery", Sparkles] ] as const).map(([id, Icon]) => <button key={id} className={page === id ? "nav-item active" : "nav-item"} onClick={() => setPage(id)} aria-current={page === id ? "page" : undefined}><Icon size={19} />{labels[id]}{page === id && <ChevronRight size={16} />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="local-note"><span className="local-dot" /><div>Bu tarayıcıda saklanır<small>Başvuruların ve CV testlerin yerel.</small></div></div><button className="nav-item" onClick={() => { void chrome.runtime.openOptionsPage(); }}><Settings size={19} />Ayarlar</button><a className="nav-item" href="https://www.kariyer.net" target="_blank" rel="noopener noreferrer"><ArrowUpRight size={19} />Kariyer.net’i aç</a></div>
    </aside>
    <main><header className="topbar"><span><LayoutDashboard size={16} /> Dashboard <ChevronRight size={14} /> {labels[page]}</span><button className="quiet" disabled={busy} onClick={() => { reconnect(); }}><RefreshCw size={15} />Yeniden bağlan</button></header>
      <div className="main-content"><div className="page-heading"><div><span className="eyebrow">KARİYERİNİ BİR ADIM İLERİ TAŞI</span><h1>{labels[page]}</h1><p>{page === "applications" ? "Her başvurunun hikâyesini tek yerde takip et." : page === "experiments" ? "İki CV, gerçek başvurular ve daha bilinçli kararlar." : "Profiline göre önerilen işler arasından yeni fırsatları keşfet."}</p></div><span className="account-status"><span className="local-dot" />{state ? "Hesap doğrulandı" : "Bağlantı bekleniyor"}</span></div>
      {error && <div className="alert error" role="alert">{error.message}{(error.code === "AUTH_REQUIRED" || error.code === "SESSION_NOT_CAPTURED") && <a href="https://www.kariyer.net" target="_blank" rel="noopener noreferrer">Kariyer.net’i aç <ArrowUpRight size={14} /></a>}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}
      {loading && <div className="empty panel" role="status"><RefreshCw className="spin" /><h2>Hesabın doğrulanıyor</h2><p>Yerel kayıtların doğru hesabın altında açılacak.</p></div>}
      {!loading && !state && <div className="empty panel"><Search size={36} /><h2>Çalışma alanına bağlan</h2><p>Kariyer.net’te oturum aç, profil sayfanı yenile ve buradan yeniden bağlan.</p><button className="primary" disabled={busy} onClick={() => { void act({ action: "get" }); }}>Yeniden bağlan</button></div>}
      {state && <><section className="stats" aria-label="Başvuru özeti">{stats.map(s => <div className="stat-card" key={s.label}><span className={"stat-icon " + s.tone}><s.icon size={20} /></span><strong>{s.value}</strong><span>{s.label}</span></div>)}</section>
        {page === "applications" && <Applications state={state} busy={busy} act={act} />}
        {page === "experiments" && <Experiments state={state} resumes={cvList} busy={busy} act={act} analyze={analyze} analysisPending={analysis.pending} />}
        {page === "discovery" && <Discovery state={state} resumes={cvList} busy={busy} act={act} analyze={analyze} analysisPending={analysis.pending} />}
        <AnalysisPanel analysis={analysis} cancelAnalysis={cancelAnalysis} close={resetAnalysis} />
      </>}
      <footer>KariyerLens · Başvuruların için daha net bir bakış.</footer></div>
    </main>
  </div>;
}
