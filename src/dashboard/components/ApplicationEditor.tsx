import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowUpRight, Plus, Trash2, X } from "lucide-react";
import { applicationStatuses, statusLabels } from "../models.js";
import type { DashboardState, TrackedApplication } from "../models.js";
import type { Act } from "../ui-types.js";
import { dateTime, variantSuggestion } from "../data.js";
import { dateLabel, inputDate } from "../format.js";
import { ResumeViews } from "./ResumeViews.js";

export function ApplicationEditor({ app, state, busy, act, close }: { app: TrackedApplication; state: DashboardState; busy: boolean; act: Act; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const [patch, setPatch] = useState({ status: app.status, appliedAt: inputDate(app.appliedAt || app.api.appliedAt), notes: app.notes, followUpAt: app.followUpAt, variantId: app.variantId, responded: app.responded, manualEvents: app.manualEvents });
  const [eventText, setEventText] = useState(""), [eventDate, setEventDate] = useState(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })), [eventViewed, setEventViewed] = useState(false);
  const allVariants = state.experiments.flatMap(e => e.variants), suggestion = variantSuggestion(app, allVariants), suggested = allVariants.find(v => v.id === suggestion);
  const manualVariant = allVariants.find(v => v.id === patch.variantId);
  const conflict = Boolean(app.api.cvId && manualVariant && manualVariant.resumeId !== app.api.cvId);
  async function save(e: FormEvent) { e.preventDefault(); await act({ action: "update", jobId: app.jobId, patch }); }
  const events = [...app.api.events, ...patch.manualEvents].sort((a, b) => (dateTime(b.at) ?? 0) - (dateTime(a.at) ?? 0));
  return <dialog ref={dialog} className="application-dialog" aria-label={"Başvuru detayı · " + app.title} onCancel={close}><section className="panel detail-panel"><div className="section-heading"><div><span className="eyebrow">BAŞVURU DETAYI</span><h2>{app.title}</h2><p>{app.companyName}</p></div><button className="quiet" aria-label="Detayı kapat" onClick={close}><X size={18} /></button></div>
    <form onSubmit={save}><fieldset disabled={busy}><div className="form-grid"><label>Süreç durumu<select value={patch.status} onChange={e => setPatch({ ...patch, status: e.target.value as TrackedApplication["status"] })}>{applicationStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label><label>Başvuru tarihi<input type="date" value={patch.appliedAt} onChange={e => setPatch({ ...patch, appliedAt: e.target.value })} /></label><label>Manuel CV ataması (API bilgisi yoksa)<select value={patch.variantId} onChange={e => setPatch({ ...patch, variantId: e.target.value })}><option value="">Atanmadı</option>{state.experiments.map(e => <optgroup key={e.id} label={e.name}>{e.variants.map(v => <option key={v.id} value={v.id}>{v.label} · {v.name}</option>)}</optgroup>)}</select></label><label>Takip tarihi<input type="date" value={patch.followUpAt} onChange={e => setPatch({ ...patch, followUpAt: e.target.value })} /></label></div>
    {suggested && !patch.variantId && <p className="hint">API’deki CV kimliği {suggested.label} · {suggested.name} ile eşleşiyor; A/B hesabına otomatik dahil edilir. Manuel olarak da kaydet: <button type="button" className="text-button" onClick={() => setPatch({ ...patch, variantId: suggested.id })}>Bu sürümü seç</button></p>}
    {conflict && <p className="field-error">Manuel CV ataması Kariyer.net’teki CV ile farklı. A/B hesaplarında Kariyer.net CV kimliği esas alınır; manuel seçimin korunur.</p>}
    <label className="checkbox-label"><input type="checkbox" checked={patch.responded} onChange={e => setPatch({ ...patch, responded: e.target.checked })} />İşverenden dönüş aldım</label><label>Notlar<textarea rows={3} maxLength={4000} placeholder="Görüşme notları, iletişim veya sonraki adım…" value={patch.notes} onChange={e => setPatch({ ...patch, notes: e.target.value })} /></label>
    <div className="api-summary"><span>API başvuru bilgisi: <strong>{app.api.applied === null ? "Henüz alınmadı" : app.api.applied ? "Başvuruldu" : "Başvuru bulunamadı"}</strong></span><span>CV: {app.api.cvName || "—"}</span><span>Son güncelleme: {dateLabel(app.api.fetchedAt)}</span></div>
    <ResumeViews state={state} records={state.resumeViews.records.filter(v => v.jobId === app.jobId)} />
    <h3>Etkileşim geçmişi</h3>{events.length ? <ul className="event-list">{events.map(e => <li key={e.source + e.id}><span className="event-copy">{e.source === "manual" ? <div className="manual-event-edit"><input aria-label="Manuel etkileşim açıklaması" value={e.text} maxLength={4000} onChange={change => setPatch({ ...patch, manualEvents: patch.manualEvents.map(item => item.id === e.id ? { ...item, text: change.target.value } : item) })} /><input aria-label="Manuel etkileşim tarihi" type="date" value={inputDate(e.at)} onChange={change => setPatch({ ...patch, manualEvents: patch.manualEvents.map(item => item.id === e.id ? { ...item, at: change.target.value } : item) })} /><label className="checkbox-label"><input type="checkbox" checked={e.viewed} onChange={change => setPatch({ ...patch, manualEvents: patch.manualEvents.map(item => item.id === e.id ? { ...item, viewed: change.target.checked } : item) })} />Görüntülenme</label></div> : <strong>{e.text}</strong>}<small>{dateLabel(e.at)} · {e.source === "api" ? "Kariyer.net" : "Manuel"}{e.viewed ? " · CV görüntülendi" : ""}</small></span>{e.source === "manual" && <button type="button" className="quiet" aria-label="Manuel etkileşimi sil" onClick={() => setPatch({ ...patch, manualEvents: patch.manualEvents.filter(x => x.id !== e.id) })}><Trash2 size={15} /></button>}</li>)}</ul> : <p className="muted">Henüz etkileşim yok.</p>}
    <div className="event-input"><input aria-label="Etkileşim açıklaması" placeholder="Etkileşim ekle…" value={eventText} maxLength={4000} onChange={e => setEventText(e.target.value)} /><input aria-label="Etkileşim tarihi" type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} /><label className="checkbox-label"><input type="checkbox" checked={eventViewed} onChange={e => setEventViewed(e.target.checked)} />Görüntülenme</label><button type="button" className="secondary" disabled={!eventText.trim() || !eventDate || patch.manualEvents.length >= 99} onClick={() => { setPatch({ ...patch, manualEvents: [...patch.manualEvents, { id: crypto.randomUUID(), text: eventText.trim(), at: eventDate, viewed: eventViewed, source: "manual" }] }); setEventText(""); setEventViewed(false); }}><Plus size={15} />Ekle</button></div>
    <div className="form-actions"><button className="primary">Kaydet</button><a className="secondary" href={app.jobUrl} target="_blank" rel="noopener noreferrer">İlanı aç <ArrowUpRight size={15} /></a><button type="button" className="danger-button" onClick={async () => { const result = await act({ action: "remove", jobId: app.jobId }); if (result.ok) close(); }}><Trash2 size={15} />Takipten kaldır</button></div>
    </fieldset></form>
  </section></dialog>;
}
