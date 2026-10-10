import type { DashboardState, ResumeView } from "../models.js";
import { dateTime } from "../data.js";
import { dateLabel } from "../format.js";

export function ResumeViews({ state, records }: { state: DashboardState; records: ResumeView[] }) {
  const cache = state.resumeViews;
  return <section aria-label="CV görüntülenme kayıtları"><h3>CV görüntülenme kayıtları</h3>
    <p className="hint">{cache.fetchedAt ? "Son güncelleme: " + dateLabel(cache.fetchedAt) + ". " : "Kayıtları almak için Başvuruları yenile düğmesini kullan. "}{cache.partial && "İlk API yanıtındaki en fazla 100 kayıt gösterilir; tüm görüntülenme geçmişini kapsamayabilir."}</p>
    {cache.error && <p className="field-error">{cache.error} Önceki başarılı kayıtlar korunur.</p>}
    {records.length ? <div className="table-wrap"><table className="application-table resume-view-table"><thead><tr><th>CV</th><th>Şirket</th><th>İlan</th><th>Görüntülenme tarihi</th><th>Sayı</th></tr></thead><tbody>{[...records].sort((a, b) => (dateTime(b.viewedAt) ?? 0) - (dateTime(a.viewedAt) ?? 0)).map((v, i) => <tr key={i}><td>{v.resumeName || state.experiments.flatMap(e => e.variants).find(cv => cv.resumeId === v.resumeId)?.name || "Adı alınamadı"}</td><td>{v.companyName || "—"}</td><td>{v.jobName || "—"}</td><td>{dateLabel(v.viewedAt)}</td><td>{v.viewCount}</td></tr>)}</tbody></table></div> : <p className="muted">{cache.fetchedAt ? "Alınan yanıtta bu seçime ait görüntülenme kaydı yok." : "Henüz görüntülenme kaydı alınmadı."}</p>}
  </section>;
}
