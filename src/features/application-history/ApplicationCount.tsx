import { useLayoutEffect, useId, useRef, useState } from "react";
import type { JobVisitHistory, JobVisitMeasurement } from "../../shared/types.js";
import { parseExactApplicationCount } from "../../shared/application-count.js";
import styles from "./application-count.css?inline";

const formatNumber = (value: number) => new Intl.NumberFormat("tr-TR").format(value);
const formatTime = (value: number) => new Intl.DateTimeFormat("tr-TR", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Istanbul",
}).format(value);
const shortTime = (value: number) => new Intl.DateTimeFormat("tr-TR", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul",
}).format(value);

function VisitChart({ measurements }: { measurements: JobVisitMeasurement[] }) {
  const [selected, setSelected] = useState(measurements.length - 1);
  const first = measurements[0], last = measurements.at(-1)!;
  const counts = measurements.map(point => point.count);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const axisStep = Math.max(1, 10 ** Math.floor(Math.log10(Math.max(2, maxCount - minCount))));
  const axisMin = Math.max(0, Math.floor(minCount / axisStep) * axisStep - (minCount === maxCount ? axisStep : 0));
  const axisMax = Math.max(axisMin + 2 * axisStep, Math.ceil(maxCount / axisStep) * axisStep);
  const axisRange = axisMax - axisMin;
  const ticks = [axisMin, Math.round((axisMin + axisMax) / 2), axisMax];
  const maxTime = last.timestamp - first.timestamp;
  const points = measurements.map(point => ({
    ...point,
    x: maxTime > 0 ? 58 + (point.timestamp - first.timestamp) / maxTime * 354 : 235,
    y: 174 - (point.count - axisMin) / axisRange * 144,
  }));
  const active = measurements[selected] || last;
  return <>
    <svg viewBox="0 0 440 230" role="group" aria-label="Ziyaret zamanına göre başvuru sayısı">
      {ticks.map(value => <g key={value}>
        <line x1="58" x2="412" y1={174 - (value - axisMin) / axisRange * 144} y2={174 - (value - axisMin) / axisRange * 144} className="grid" />
        <text x="50" y={178 - (value - axisMin) / axisRange * 144} textAnchor="end">{formatNumber(value)}</text>
      </g>)}
      <text x="58" y="17">Başvuru sayısı</text>
      <text x="58" y="195">{shortTime(first.timestamp)}</text>
      {maxTime > 0 && <text x="412" y="195" textAnchor="end">{shortTime(last.timestamp)}</text>}
      <text x="235" y="220" textAnchor="middle">Ziyaret zamanı · Türkiye saati</text>
      <polyline points={points.map(point => point.x + "," + point.y).join(" ")} fill="none" stroke="#7c3aed" strokeWidth="2" />
      {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={selected === index ? 6 : 4}
        className="point" tabIndex={0} role="img" aria-label={formatTime(point.timestamp) + ": " + formatNumber(point.count) + " başvuru"}
        onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)}>
        <title>{formatTime(point.timestamp)}: {formatNumber(point.count)} başvuru</title>
      </circle>)}
    </svg>
    <p className="selected" aria-live="polite">{formatTime(active.timestamp)} · <strong>{formatNumber(active.count)} başvuru</strong></p>
  </>;
}

export function ApplicationCount({ applicationCount, history }: { applicationCount: string; history: JobVisitHistory }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ left: 8, top: 8, width: 460 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const count = parseExactApplicationCount(applicationCount);
  const previous = history.status === "unchanged" ? history.measurements.at(-1)
    : history.status === "saved" ? history.measurements.at(-2) : undefined;
  const delta = count !== null && previous ? count - previous.count : null;
  const comparison = delta === null ? null : delta === 0 ? "Değişmedi" : "Son bakışından beri " + (delta > 0 ? "+" : "−") + formatNumber(Math.abs(delta));
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const width = Math.min(460, viewportWidth - 16);
      if (panel.current) panel.current.style.width = width + "px";
      const height = panel.current?.getBoundingClientRect().height || 380;
      const below = rect.bottom + 8;
      const preferred = below + height <= viewportHeight - 8 ? below : rect.top - height - 8;
      const top = Math.max(8, Math.min(preferred, viewportHeight - height - 8));
      setPlacement({ left: Math.max(8, Math.min(rect.left, viewportWidth - width - 8)), top, width });
    };
    position();
    panel.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const path = event.composedPath();
      // Closed Shadow DOM hides inner nodes from document listeners.
      const shadowHost = (trigger.current?.getRootNode() as ShadowRoot).host;
      if (!path.includes(shadowHost)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  return <><style>{styles}</style>
    <button ref={trigger} className="count-button" type="button" aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog"
      onClick={event => { event.stopPropagation(); setOpen(!open); }}>
      <span><strong>{count === null ? applicationCount : formatNumber(count)}</strong> başvuru <span aria-hidden="true">▾</span></span>
      {delta !== null && <span className="comparison" title={comparison ?? undefined}>{delta === 0 ? "Değişmedi" : (delta > 0 ? "+" : "−") + formatNumber(Math.abs(delta))}</span>}
    </button>
    {open && <div ref={panel} id={panelId} className="history-panel" role="dialog" aria-modal="false" aria-label="Başvuru geçmişi" tabIndex={-1}
      style={{ left: placement.left, top: placement.top, width: placement.width }} onClick={event => event.stopPropagation()}>
      <div className="panel-header"><div><span className="brand">KariyerLens</span><h2>Başvuru geçmişi</h2></div><button type="button" className="close" onClick={close} aria-label="Geçmişi kapat">×</button></div>
      {comparison && <p className="delta">{comparison}</p>}
      {history.status === "unavailable" && <p className="notice" role="status">Ziyaret geçmişi kaydedilemedi. Güncel başvuru sayısı gösteriliyor.</p>}
      {history.status === "invalid-count" && <p className="notice">Kesin başvuru sayısı alınamadığı için bu ziyaret grafiğe eklenmedi.</p>}
      {history.measurements.length > 0 ? <VisitChart measurements={history.measurements} /> : <p>Henüz kaydedilmiş ölçüm yok.</p>}
      {history.measurements.length === 1 && <p className="note">Karşılaştırma için bu ilanı tekrar ziyaret et. Sayı değiştiğinde yeni ölçüm eklenir.</p>}
      <p className="note">Yalnız bu tarayıcıda kaydedilen ziyaretler gösterilir. Çizgi gözlemleri bağlar; aradaki başvuru sayıları bilinmez.</p>
    </div>}
  </>;
}
