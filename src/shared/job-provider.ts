export const jobProviders = ["kariyer", "iskur"] as const;
export type JobProvider = typeof jobProviders[number];
export interface JobReference { provider: JobProvider; jobId: string }
export const providerLabels: Record<JobProvider, string> = { kariyer: "Kariyer.net", iskur: "İŞKUR" };
export const jobKey = (job: { provider?: JobProvider; jobId?: string; id?: string }) => `${job.provider ?? "kariyer"}:${job.jobId ?? job.id}`;
export function jobReferenceFromUrl(value: string): JobReference | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (/^(?:[\w-]+\.)*kariyer\.net$/i.test(url.hostname) && /^\/is-ilani\//.test(url.pathname)) {
      const id = url.pathname.match(/-(\d{1,16})\/?$/)?.[1];
      return id ? { provider: "kariyer", jobId: id } : null;
    }
    const id = url.searchParams.get("uiID");
    return url.hostname === "esube.iskur.gov.tr" && url.pathname.toLowerCase() === "/istihdam/acikisilandetay.aspx" && id && /^\d{1,16}$/.test(id)
      ? { provider: "iskur", jobId: id } : null;
  } catch { return null; }
}
export function jobUrlFor(provider: JobProvider, id: string): string {
  return provider === "iskur" ? `https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=${encodeURIComponent(id)}`
    : `https://www.kariyer.net/is-ilani/ilan-${id}`;
}
