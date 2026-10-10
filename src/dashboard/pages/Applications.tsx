import { useState } from "react";
import type { FormEvent } from "react";
import { BriefcaseBusiness, ChevronRight, Eye, Link, ListFilter, Plus, RefreshCw, Search } from "lucide-react";
import type { DashboardState } from "../models.js";
import { applicationStatuses, statusLabels } from "../models.js";
import type { Act } from "../ui-types.js";
import { dateTime, jobIdFromUrl } from "../data.js";
import { dateLabel } from "../format.js";
import { ApplicationEditor } from "../components/ApplicationEditor.js";
import { ResumeViews } from "../components/ResumeViews.js";

export function Applications({ state, busy, act }: { state: DashboardState; busy: boolean; act: Act }) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState(""), [url, setUrl] = useState(""), [selected, setSelected] = useState("");
  const [linkError, setLinkError] = useState("");
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const list = state.applications.filter(a => (!filter || a.status === filter) && (a.title + " " + a.companyName).toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")))
    .sort((a, b) => {
      const first = dateTime(a.appliedAt || a.api.appliedAt), second = dateTime(b.appliedAt || b.api.appliedAt);
      if (first === null) return second === null ? 0 : 1;
      if (second === null) return -1;
      return second - first;
    });
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize)), currentPage = Math.min(page, pageCount);
  const visible = list.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const current = state.applications.find(a => a.jobId === selected);
  const variants = state.experiments.flatMap(e => e.variants);
  async function add(e: FormEvent) { e.preventDefault(); const jobId = jobIdFromUrl(url); if (!jobId) { setLinkError("Geçerli bir Kariyer.net ilan bağlantısı gir."); return; }
    setLinkError(""); const result = await act({ action: "track", jobId }); if (result.ok) { setUrl(""); setSelected(jobId); } }
  const recent = state.applications.flatMap(a => [...a.api.events, ...a.manualEvents].map(e => ({ ...e, jobId: a.jobId, title: a.title })))
    .sort((a, b) => (dateTime(b.at) ?? 0) - (dateTime(a.at) ?? 0)).slice(0, 5);
  return <><section className="panel"><div className="section-heading"><div><h2>Başvuru listesi <span className="count-badge">{state.applications.length}</span></h2><p>Başvuru tarihine göre en yeniden eskiye · Tarihi olmayanlar en sonda.</p></div><div className="application-actions"><button className="primary" disabled={busy} onClick={() => { void act({ action: "importApplications", page: 1, seenJobIds: [] }); }}><Plus size={16} />Başvurularımı içe aktar</button><button className="secondary" disabled={busy} onClick={() => { void act({ action: "refresh" }); }}><RefreshCw size={16} className={busy ? "spin" : ""} />Başvuruları yenile</button></div></div>
    <form className="add-link" onSubmit={add}><Link size={17} /><label className="sr-only" htmlFor="job-url">Kariyer.net ilan bağlantısı</label><input id="job-url" type="url" placeholder="Kariyer.net ilan bağlantısını yapıştır…" value={url} onChange={e => setUrl(e.target.value)} required /><button className="primary" disabled={busy}><Plus size={16} />Takibe ekle</button></form>{linkError && <p className="field-error" role="alert">{linkError}</p>}
    <div className="filters"><label className="search-field"><Search size={17} /><input aria-label="Başlık veya şirket ara" placeholder="Pozisyon veya şirket ara" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><label className="select-field"><ListFilter size={16} /><select aria-label="Başvuru durumu" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="">Tüm durumlar</option>{applicationStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label></div>
    {!list.length ? <div className="empty"><BriefcaseBusiness size={32} /><h3>{state.applications.length ? "Eşleşen başvuru bulunamadı" : "Başvurularını içe aktar veya ilan ekle"}</h3><p>Kariyer.net’teki mevcut başvuruların için Başvurularımı içe aktar düğmesini kullan. Yeni bir ilanı bağlantısıyla da takibe ekleyebilirsin.</p></div> : <div className="table-wrap"><table className="application-table"><thead><tr><th>Pozisyon / Şirket</th><th>Durum</th><th aria-sort="descending">Başvuru tarihi ↓</th><th>Kullanılan CV</th><th>Görüntülenme</th><th>Takip</th></tr></thead><tbody>{visible.map(a => <tr key={a.jobId} className={selected === a.jobId ? "selected-row" : ""}><td><button className="job-title" onClick={() => setSelected(a.jobId)}>{a.title}</button><span className="company-name">{a.companyName || "Şirket belirtilmemiş"}</span>{a.api.error && <span className="field-error">{a.api.error}</span>}</td><td><span className={"status-badge status-" + a.status}>{statusLabels[a.status]}</span></td><td>{dateLabel(a.appliedAt || a.api.appliedAt)}</td><td>{a.api.cvName || (a.api.cvId ? "CV adı alınamadı" : variants.find(v => v.id === a.variantId)?.name || "—")}</td><td>{([...a.api.events, ...a.manualEvents].some(e => e.viewed) || state.resumeViews.records.some(v => v.resumeId === a.api.cvId && v.jobId === a.jobId && v.viewCount > 0)) ? <span className="viewed-label"><Eye size={13} />Görüntülendi</span> : "—"}</td><td><button className="quiet" onClick={() => setSelected(a.jobId)}>Detay <ChevronRight size={14} /></button>{a.followUpAt && <small>{dateLabel(a.followUpAt)}</small>}</td></tr>)}</tbody></table></div>}
    {list.length > 0 && <div className="table-pagination"><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, list.length)} / {list.length} başvuru</span><label>Sayfada<select aria-label="Sayfadaki başvuru sayısı" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}</select></label><div><button className="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Önceki</button><span>{currentPage} / {pageCount}</span><button className="secondary" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Sonraki</button></div></div>}
  </section>
  <section className="panel"><ResumeViews state={state} records={state.resumeViews.records} /></section>
  {current && <ApplicationEditor key={JSON.stringify(current)} app={current} state={state} busy={busy} act={act} close={() => setSelected("")} />}
  <section className="panel"><div className="section-heading"><div><h2>Son hareketler</h2><p>Başvuru bilgileri ve eklediğin süreç notları.</p></div></div>{recent.length ? <div className="timeline">{recent.map((e, i) => <div className="timeline-item" key={e.jobId + e.id + i}><span className="timeline-dot" /><div><strong>{e.text.startsWith("Süreç: ") ? "Süreç: " + (statusLabels[e.text.slice(7) as keyof typeof statusLabels] || e.text.slice(7)) : e.text}</strong><button className="text-button" onClick={() => setSelected(e.jobId)}>{e.title}</button></div><time>{dateLabel(e.at)}</time></div>)}</div> : <p className="muted empty-copy">Henüz bir hareket yok. Başvurularını yenilediğinde veya süreç bilgisi eklediğinde burada görünür.</p>}</section>
  </>;
}
