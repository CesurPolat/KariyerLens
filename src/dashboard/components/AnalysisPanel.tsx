import { RefreshCw, X } from "lucide-react";
import { MarkdownMessage } from "../../features/chat/components/MarkdownMessage.js";
import type { useDashboardAnalysis } from "../hooks/useDashboardAnalysis.js";

export function AnalysisPanel({ analysis, cancelAnalysis, close }: {
  analysis: ReturnType<typeof useDashboardAnalysis>["analysis"]; cancelAnalysis: () => void; close: () => void;
}) {
  return analysis.title ? <section className="panel analysis-panel"><div className="section-heading"><div><span className="eyebrow">KARİYERLENS ASİSTAN</span><h2>{analysis.title}</h2></div>{analysis.pending ? <button className="secondary" onClick={cancelAnalysis}><X size={15} />Durdur</button> : <button className="quiet" aria-label="Analizi kapat" onClick={() => close()}><X size={18} /></button>}</div><p className="muted" role="status">{analysis.pending && <RefreshCw size={14} className="spin" />} {analysis.status}</p>{analysis.content && <MarkdownMessage content={analysis.content} />}</section> : null;
}
