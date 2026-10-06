import type { Job } from "../../shared/types.js";
import { formatPublishedAt, shortDate, getApplicationInsight, getHiringActivity } from "../job-insights.js";
import styles from "./job-summary.css?inline";

type Activity = ReturnType<typeof getHiringActivity>;
const point = (value: number, radius: number) => {
  const angle = Math.PI * (1 - value / 100);
  return [140 + radius * Math.cos(angle), 130 - radius * Math.sin(angle)];
};

function HiringGauge({ activity }: { activity: Activity }) {
  const tip = activity.score === null ? null : point(activity.score, 77);
  return <div className="gauge-panel">
    <div className="gauge-header"><strong className="eyebrow">İŞE ALIM HAREKETLİLİĞİ</strong>
      <strong className="activity-label" style={{ color: activity.color }}>{activity.label}{activity.score !== null && ` · ${activity.score}/100`}</strong></div>
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
  const details = [`Yayın: ${formatPublishedAt(job.publishedAt)}`, `Son başvuru: ${shortDate(job.closingDate)}`,
    ...(job.jobDateText ? [job.jobDateText] : []), ...(job.updateCount ? [`${job.updateCount} güncelleme`] : []),
    ...(job.applicationReviewText ? [job.applicationReviewText] : [])];
  return <><style>{styles}</style>
    <section aria-label="KariyerLens ilan özeti">
      <header><span className="brand">✦ KariyerLens</span><h2>İlan özeti</h2></header>
      <p className="intro">Başvurmadan önce ilanın tarihlerini ve şirketin başvuru inceleme durumunu değerlendirin.</p>
      <div className="chips">{details.map((detail, index) => <span key={index} className={`chip tone-${index % 4}`}>{detail}</span>)}</div>
      <HiringGauge activity={activity} />
    </section>
  </>;
}
