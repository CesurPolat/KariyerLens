// Import individual modules because the classic content script preserves unused declarations.
import Activity from "lucide-react/dist/esm/icons/activity.mjs";
import Clock from "lucide-react/dist/esm/icons/clock.mjs";
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days.mjs";
import Eye from "lucide-react/dist/esm/icons/eye.mjs";
import FileText from "lucide-react/dist/esm/icons/file-text.mjs";
import History from "lucide-react/dist/esm/icons/history.mjs";
import Sparkles from "lucide-react/dist/esm/icons/sparkles.mjs";
import TriangleAlert from "lucide-react/dist/esm/icons/triangle-alert.mjs";
import type { Job } from "../../shared/types.js";
import { getApplicationInsight, getHiringActivity } from "../job-insights.js";
import styles from "./job-summary.css?inline";

type HiringActivity = ReturnType<typeof getHiringActivity>;
const point = (value: number, radius: number) => {
  const angle = Math.PI * (1 - value / 100);
  return [140 + radius * Math.cos(angle), 130 - radius * Math.sin(angle)];
};

function HiringGauge({ activity }: { activity: HiringActivity }) {
  const tip = activity.score === null ? null : point(activity.score, 77);
  return <div className="gauge-panel">
    <div className="gauge-header"><strong className="eyebrow"><Activity size={14} aria-hidden="true" />İŞE ALIM HAREKETLİLİĞİ</strong>
      <strong className="activity-label" title={activity.score === null ? activity.copy : "İlanın yaşı, başvuruların son incelenme zamanı ve başvuru sayısından hesaplanan 0–100 arası hareketlilik puanı. İşe alınma olasılığını göstermez."} style={{ color: activity.color }}>{activity.label}{activity.score !== null && ` · ${activity.score}/100`}</strong></div>
    <div className="gauge-content">
      {activity.score !== null && <svg viewBox="0 0 280 165" role="img" aria-label={`${activity.label}: ${activity.score}/100`}>
        {([[0, 35, "#dc2626"], [35, 65, "#f59e0b"], [65, 100, "#10b981"]] as const).map(([start, end, color]) => {
          const a = point(start, 106), b = point(end, 106);
          return <path key={start} d={`M ${a.join(" ")} A 106 106 0 0 1 ${b.join(" ")}`} fill="none" stroke={color} strokeWidth={14} opacity={activity.score === null ? 0.25 : 0.85} />;
        })}
        {Array.from({ length: 11 }, (_, index) => index * 10).map(value => {
          const a = point(value, 84), b = point(value, 93);
          return <line key={value} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#64748b" strokeWidth={2} />;
        })}
        {tip && <line x1={140} y1={130} x2={tip[0]} y2={tip[1]} stroke="#0f172a" strokeWidth={4} strokeLinecap="round" />}
        <circle cx={140} cy={130} r={8} fill={activity.color} stroke="#0f172a" strokeWidth={3} />
        <text x={35} y={157} fill="#94a3b8" textAnchor="middle" fontSize={10}>DÜŞÜK</text>
        <text x={245} y={157} fill="#94a3b8" textAnchor="middle" fontSize={10}>YÜKSEK</text>
      </svg>}
      <div className="gauge-details"><p>{activity.copy}</p>{activity.score !== null && <p className="note">İlanın yaşı, son başvuru incelemesi ve başvuru sayısına dayalı tahmindir; işe alım garantisi değildir.</p>}</div>
    </div>
  </div>;
}

export function JobSummary({ job }: { job: Job }) {
  const activity = getHiringActivity(job, getApplicationInsight(job));
  const reviewText = job.applicationReviewText?.replace(/\*\*/g, "").trim();
  const externalApplication = /kariyer\s*\.\s*net\s+dışında/i.test(reviewText || "");
  let reviewLabel = reviewText
    ?.replace(/^Şirket başvuruları\s+/i, "")
    .replace(/\s+inceledi\.?$/, "")
    .trim()
    .replace(/^./u, letter => letter.toLocaleUpperCase("tr-TR"));
  const published = job.publishedAt ? new Date(job.publishedAt) : null;
  const publishedLabel = published && !Number.isNaN(published.getTime())
    ? new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }).format(published)
    : job.publishedAt || "—";
  const reviewDuration = reviewText?.match(/(\d+)\s*\+?\s*(gün|hafta|ay)\s+önce/i);
  const reviewDays = reviewDuration
    ? Number(reviewDuration[1]) * ({ gün: 1, hafta: 7, ay: 30 }[reviewDuration[2].toLocaleLowerCase("tr-TR") as "gün" | "hafta" | "ay"])
    : null;
  const listingAgeDays = published && !Number.isNaN(published.getTime())
    ? Math.ceil((Date.now() - published.getTime()) / 86_400_000)
    : null;
  const reviewPredatesListing = reviewDays !== null && listingAgeDays !== null && listingAgeDays >= 0 && reviewDays > listingAgeDays;
  if (reviewPredatesListing) reviewLabel = "İncelenmedi";
  else if (/henüz|incelenmedi|incelemedi/i.test(reviewText || "")) reviewLabel = "İncelenmedi";
  const months: Record<string, string> = { Ocak: "Oca", Şubat: "Şub", Mart: "Mar", Nisan: "Nis", Mayıs: "May", Haziran: "Haz", Temmuz: "Tem", Ağustos: "Ağu", Eylül: "Eyl", Ekim: "Eki", Kasım: "Kas", Aralık: "Ara" };
  const closingLabel = job.closingDate?.replace(/(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)/g, month => months[month]) || "—";
  const dateText = job.jobDateText?.match(/^(.*?)\s+(yayınlandı|yayımlandı|güncellendi)\.?$/i);
  const isUpdated = dateText?.[2].toLocaleLowerCase("tr-TR") === "güncellendi";
  const details = [
    { icon: CalendarDays, label: "Yayın tarihi", value: publishedLabel, tone: "purple", emphasis: false, tooltip: job.publishedAt ? "İlanın Kariyer.net tarafından bildirilen yayın tarihi." : "Bu ilan için yayın tarihi paylaşılmamış." },
    { icon: Clock, label: "Kapanış Tarihi", value: closingLabel, tone: "orange", emphasis: false, tooltip: job.closingDate ? "İlanda belirtilen son başvuru tarihi. İlan daha erken kapanabilir." : "Bu ilan için son başvuru tarihi paylaşılmamış." },
    ...(job.updateCount ? [{ icon: FileText, label: "İlan sürümü", value: job.updateCount, tone: "blue", emphasis: false, tooltip: "Kariyer.net'in ilan için bildirdiği sürüm numarası. İçerikte kaç değişiklik yapıldığını göstermez." }] : []),
    ...(job.jobDateText ? [{ icon: isUpdated ? History : CalendarDays, label: dateText ? isUpdated ? "Son güncelleme" : "Yayın zamanı" : "İlan zamanı", value: dateText?.[1] || job.jobDateText, tone: "green", emphasis: false, tooltip: "Kariyer.net'in ilanın yayınlanması veya son güncellenmesi için gösterdiği süre. Başvuruların incelendiği zamanı belirtmez." }] : []),
    ...(reviewLabel && !externalApplication ? [{ icon: Eye, label: reviewPredatesListing || reviewLabel === "İncelenmedi" ? "İnceleme durumu" : "Son inceleme", value: reviewLabel, tone: "purple", emphasis: false, tooltip: reviewPredatesListing ? `${job.applicationReviewText} Bildirilen inceleme zamanı ilanın yayın tarihinden önceye denk geliyor; bu ilan için henüz bir başvuru incelemesi görünmüyor.` : `${job.applicationReviewText} Şirketin bu ilana gelen başvuruları en son ne zaman incelediğini belirtir; sizin başvurunuzun incelendiği anlamına gelmez.` }] : []),
  ];
  return <><style>{styles}</style>
    <section aria-label="KariyerLens ilan özeti">
      <header><span className="brand"><Sparkles size={16} aria-hidden="true" /> KariyerLens</span><h2>İlan özeti</h2></header>
      <p className="intro">İlan tarihleri ve başvuru inceleme durumu</p>
      <div className="chips" tabIndex={0} role="region" aria-label="İlan bilgileri">
        {details.map((detail, index) => <div key={index} title={detail.tooltip} aria-description={detail.tooltip} tabIndex={0} className={`chip tone-${detail.tone}${detail.icon === Eye ? " chip-review" : ""}${detail.emphasis ? " value-first" : ""}`}>
          <span className="chip-icon"><detail.icon size={24} strokeWidth={2} aria-hidden="true" /></span>
          <div className="chip-copy">{detail.emphasis
            ? <><strong className="chip-value">{detail.value}</strong><span className="chip-label">{detail.label}</span></>
            : <><span className="chip-label">{detail.label}</span><strong className="chip-value">{detail.value}</strong></>}
          </div>
        </div>)}
      </div>
      {externalApplication && <div className="application-warning" role="note" aria-label="Başvuru süreci uyarısı">
        <TriangleAlert size={18} aria-hidden="true" />
        <span>{reviewText}</span>
      </div>}
      <HiringGauge activity={activity} />
    </section>
  </>;
}
