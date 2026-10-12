import { useState } from "react";
import { ArrowUpRight, ListFilter, LogIn, Plus, RefreshCw, Sparkles } from "lucide-react";
import type { DashboardState, ResumeSummary, JobDiscoveryPreferences } from "../models.js";
import type { Act, Analyze } from "../ui-types.js";
import { dateTime, isNewJob } from "../data.js";
import { dateLabel } from "../format.js";
import { initialSharedFilters, sharedProvinceOptions, employmentKey } from "../discovery-filters.js";
import { jobKey, jobProviders, jobUrlFor, providerLabels } from "../../shared/job-provider.js";
import type { JobProvider } from "../../shared/job-provider.js";

interface Props { state: DashboardState; resumes: ResumeSummary[]; busy: boolean; act: Act; analyze: Analyze; analysisPending: boolean; openIskur: () => Promise<void> }
export function Discovery({ state, resumes, busy, act, analyze, analysisPending, openIskur }: Props) {
  const [prefs, setPrefs] = useState<JobDiscoveryPreferences>(() => ({ ...state.preferences, filters: initialSharedFilters(state.preferences, state.discovery.options, state.iskurDiscovery.options) }));
  const common = prefs.filters!;
  const provinces = sharedProvinceOptions(state.discovery.options, state.iskurDiscovery.options, prefs.providers);
  const supportsEmployment = (value: "full-time" | "part-time") => !prefs.providers.includes("kariyer") || state.discovery.options.workTypes.some(o => employmentKey(o.name) === value);
  return <><section className="panel"><div className="section-heading"><div><h2>Yeni fırsatları bul</h2><p>Seçtiğin kaynaklarda ilan ara · CV seçimin ayrıntılı AI analizinde kullanılır.</p></div></div>
    <form onSubmit={e => { e.preventDefault(); if (prefs.providers.length) void act({ action: "search", preferences: prefs, page: 1 }); }}>
      <fieldset disabled={busy}>
        <fieldset className="provider-choices"><legend>İlan kaynakları</legend>{jobProviders.map(provider => <label className="checkbox-label" key={provider}><input type="checkbox" checked={prefs.providers.includes(provider)} onChange={e => setPrefs({ ...prefs, providers: e.target.checked ? [...prefs.providers, provider] : prefs.providers.filter(p => p !== provider) })} />{providerLabels[provider]}</label>)}</fieldset>
        {!prefs.providers.length && <p className="field-error" role="alert">Arama için en az bir kaynak seç.</p>}
        <div className="search-query"><label>Hedef pozisyon<input value={prefs.keyword} maxLength={200} placeholder="Örn. Frontend geliştirici" onChange={e => setPrefs({ ...prefs, keyword: e.target.value })} /></label><button className="primary" disabled={!prefs.providers.length}><RefreshCw size={16} className={busy ? "spin" : ""} />Yenile</button></div>
        <fieldset className="shared-search-filters"><legend>Arama filtreleri</legend><div className="shared-filter-grid">
          <label>İl<select aria-label="İl" value={common.province} onChange={e => setPrefs({ ...prefs, filters: { ...common, province: e.target.value } })}><option value="">Tüm iller</option>{provinces.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label>Çalışma şekli<select aria-label="Çalışma şekli" value={common.employmentType} onChange={e => setPrefs({ ...prefs, filters: { ...common, employmentType: e.target.value as typeof common.employmentType } })}><option value="">Tüm çalışma şekilleri</option><option value="full-time" disabled={!supportsEmployment("full-time")}>Tam Zamanlı</option><option value="part-time" disabled={!supportsEmployment("part-time")}>Kısmi Zamanlı</option></select></label>
          {prefs.providers.includes("kariyer") && <label>Çalışma modeli <small>Kariyer.net</small><select value={prefs.workModels[0] || ""} onChange={e => setPrefs({ ...prefs, workModels: e.target.value ? [e.target.value] : [] })}><option value="">Tüm modeller</option>{state.discovery.options.workModels.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
          {prefs.providers.includes("iskur") && <label>İşyeri türü <small>İŞKUR</small><select value={prefs.iskur.sector} onChange={e => setPrefs({ ...prefs, iskur: { ...prefs.iskur, sector: e.target.value as JobDiscoveryPreferences["iskur"]["sector"] } })}><option value="ozelSektorRadio">Özel sektör</option><option value="kamuRadio">Kamu</option></select></label>}
        </div></fieldset>
        <label className="checkbox-label"><input type="checkbox" checked={prefs.includeOlder} onChange={e => setPrefs({ ...prefs, includeOlder: e.target.checked })} />Daha eski ilanları da göster</label><p className="muted">Seçildiğinde 7 günlük sınır kaldırılır. Filtreleri uygulamak için Yenile’ye bas.</p>
      </fieldset>
    </form>
    {prefs.providers.includes("iskur") && <section className="iskur-login" aria-label="İŞKUR girişi"><div><h3>İŞKUR hesabıyla devam et</h3><p>Açılan resmi sayfada İş Arayan Girişi’ni seçip aynı tarayıcıda giriş yap. Sonra buraya dönerek Yenile’ye bas; ilanlar ve analizler açık oturumunu kullanır.</p></div><button className="secondary" disabled={busy} onClick={() => { void openIskur(); }}><LogIn size={16} />İŞKUR’a giriş yap</button></section>}
    {!state.discovery.fetchedAt && !state.iskurDiscovery.fetchedAt && <p className="hint">İlk yenilemede kaynakların konum seçenekleri yüklenir. Arama yalnız sen yenilediğinde çalışır.</p>}
    <div className="cv-choice"><label>Uyum analizinde kullanılacak CV<select value={prefs.resumeId} onChange={e => setPrefs({ ...prefs, resumeId: e.target.value })}><option value="">CV seç</option>{resumes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><button className="secondary" disabled={busy} onClick={() => { void act({ action: "resumes" }); }}>CV’leri getir</button><p>Analiz et’e bastığında CV ve ilan seçtiğin AI sağlayıcısına gönderilir.</p></div>
  </section>
  {state.preferences.providers.map(provider => <ProviderResults key={provider} provider={provider} state={state} busy={busy} act={act} analyze={analyze} analysisPending={analysisPending} resumeId={prefs.resumeId} openIskur={openIskur} />)}
  </>;
}

function ProviderResults({ provider, state, busy, act, analyze, analysisPending, resumeId, openIskur }: Omit<Props, "resumes"> & { provider: JobProvider; resumeId: string }) {
  const [category, setCategory] = useState("all");
  const source = provider === "kariyer" ? state.discovery : state.iskurDiscovery;
  const categoryOf = (job: typeof source.jobs[number]) => isNewJob(job) ? "new" : dateTime(job.publishedAt) === null ? "unknown" : "older";
  const labels: Record<string, string> = { new: "Son 7 gün", unknown: "Tarih bilinmiyor", older: "Diğer ilan" };
  const visible = source.jobs.filter(j => category === "all" || categoryOf(j) === category);
  const paginate = (page: number) => { void act({ action: "search", provider, preferences: source.appliedPreferences ?? state.preferences, page }); };
  return <section className="panel discovery-results" aria-label={providerLabels[provider] + " sonuçları"}>
    <div className="section-heading"><div><h2>{providerLabels[provider]} ilanları <span className="count-badge">{source.jobs.length}</span></h2><p>{source.appliedPreferences?.includeOlder ? "Tüm tarihler" : "Son 7 gün arama filtresi"} · Son yenileme: {dateLabel(source.fetchedAt)}</p></div><label className="select-field"><ListFilter size={16} /><select aria-label={providerLabels[provider] + " yayın tarihi filtresi"} value={category} onChange={e => setCategory(e.target.value)}><option value="all">Tüm ilanlar</option><option value="new">Son 7 günde yayımlananlar</option><option value="unknown">Yayın tarihi bilinmeyenler</option><option value="older">Diğer ilanlar</option></select></label></div>
    {source.error && <div className="alert error" role="alert">{source.error} {source.fetchedAt ? "Önceki sonuçlar gösteriliyor." : ""}{provider === "iskur" && <button className="quiet" disabled={busy} onClick={() => { void openIskur(); }}><LogIn size={13} />İŞKUR’a giriş yap</button>}</div>}
    {provider === "iskur" && <p className="hint">İŞKUR misafir erişiminde şirket adı ve bazı detaylar gizli olabilir. Yayın tarihi doğrulanamayan ilanlar “Tarih bilinmiyor” olarak gösterilir. Başvuru süreci manuel takip edilir.</p>}
    {!source.jobs.length ? <div className="empty"><Sparkles size={30} /><h3>{source.fetchedAt ? "Bu filtrelerle ilan bulunamadı" : "İlanları getirmek için Yenile’ye bas"}</h3></div> : <>
      <div className="table-wrap"><table className="application-table discovery-table"><thead><tr><th>Pozisyon / Şirket</th><th>Konum</th><th>{provider === "iskur" ? "Çalışma şekli" : "Çalışma modeli"}</th><th>Yayın tarihi</th><th>İlk görüldü</th><th>İşlemler</th></tr></thead><tbody>{visible.map(j => {
        const tracked = state.applications.some(a => jobKey(a) === jobKey(j));
        return <tr key={jobKey(j)}><td><a className="job-title" href={j.jobUrl || jobUrlFor(provider, j.id)} target="_blank" rel="noopener noreferrer">{j.title} <ArrowUpRight size={13} /></a><span className="company-name">{j.companyName || "Şirket bilgisi mevcut değil"}</span></td><td>{j.location || "—"}</td><td>{j.workModel || "—"}</td><td>{dateLabel(j.publishedAt)}<small className={categoryOf(j) === "new" ? "new-badge" : "muted"}>{labels[categoryOf(j)]}</small></td><td>{dateLabel(j.firstSeenAt)}</td><td><div className="table-row-actions"><button className="secondary" disabled={busy || tracked} onClick={() => { void act({ action: "track", provider, jobId: j.id }); }}><Plus size={14} />{tracked ? "Takipte" : "Takibe ekle"}</button><button className="text-button" disabled={busy || analysisPending || !resumeId} onClick={() => analyze(j.id, { provider, resumeId }, "CV uyum analizi · " + j.title)}><Sparkles size={14} />Uyumu analiz et</button></div></td></tr>;
      })}</tbody></table></div>
      {!visible.length && <p className="empty-copy muted">Bu sayfada seçtiğin tarih grubunda ilan yok.</p>}
    </>}
    {source.fetchedAt && <div className="pagination"><button className="secondary" disabled={busy || source.currentPage <= 1} onClick={() => paginate(source.currentPage - 1)}>Önceki</button><span>Sayfa {source.currentPage}{source.totalKnown ? " · " + source.total + " ilan" : " · bu sayfada " + source.jobs.length + " ilan"}</span><button className="secondary" disabled={busy || !source.hasNext} onClick={() => paginate(source.currentPage + 1)}>Sonraki</button></div>}
  </section>;
}
