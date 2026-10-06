import type { Job } from "../shared/types.js";
interface ApplicationInsight { applicationsPerDay: number; openDays: number }

export function formatPublishedAt(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "short",
  }).format(date);
}

export function shortDate(value?: string) {
  const match = value?.match(/^(\d{1,2})\s+(\S+)/);
  if (!match) return value || "—";
  const months: Record<string, string> = {
    Ocak: "Oca", Şubat: "Şub", Mart: "Mar", Nisan: "Nis",
    Mayıs: "May", Haziran: "Haz", Temmuz: "Tem", Ağustos: "Ağu",
    Eylül: "Eyl", Ekim: "Eki", Kasım: "Kas", Aralık: "Ara",
  };
  return `${match[1]} ${months[match[2]] || match[2].slice(0, 3)}`;
}

function parseApplicationCount(value: unknown) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("tr-TR").format(value);
}

export function getApplicationInsight(data: Job): ApplicationInsight | null {
  const applicationCount = parseApplicationCount(data.applicationCount);
  const publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
  if (applicationCount === null || !publishedAt || Number.isNaN(publishedAt.getTime())) {
    return null;
  }

  const openDays = Math.max(
    1,
    Math.ceil((Date.now() - publishedAt.getTime()) / 86_400_000),
  );
  const applicationsPerDay = applicationCount / openDays;
  return {
    applicationsPerDay,
    openDays,
  };
}

function getPublishedScore(openDays: number) {
  return openDays <= 1 ? 70
    : openDays <= 3 ? 60
      : openDays <= 7 ? 55
        : openDays <= 14 ? 45
          : openDays <= 30 ? 30
            : openDays <= 60 ? 15
              : 5;
}

export function getHiringActivity(data: Job, insight: ApplicationInsight | null) {
  const review = String(data.applicationReviewText || "").toLocaleLowerCase("tr-TR");
  const applicationCount = parseApplicationCount(data.applicationCount) ?? 0;
  let reviewDays: number | null = null;
  if (/bugün|az önce|saat|dakika/.test(review)) reviewDays = 0;
  else if (/dün/.test(review)) reviewDays = 1;
  else {
    const duration = review.match(/(\d+)\s*(gün|hafta|ay)/);
    if (duration) reviewDays = Number(duration[1]) * ({ gün: 1, hafta: 7, ay: 30 }[duration[2] as "gün" | "hafta" | "ay"]);
  }
  if (/henüz|incelenmedi|incelemedi/.test(review)) reviewDays = Infinity;
  if (reviewDays === null || !insight) {
    return { score: null, label: "Devir bilgisi yetersiz", copy: "Şirketin son başvuru inceleme zamanı bilinmiyor.", color: "#94a3b8" };
  }
  // PublishedAt is the primary signal. Review recency only supports the estimate;
  // a recent review cannot make an old, high-volume listing look highly active.
  const publishedScore = getPublishedScore(insight.openDays);
  const reviewScore = reviewDays <= 1 ? 25 : reviewDays <= 3 ? 20 : reviewDays <= 7 ? 12 : reviewDays <= 14 ? 6 : 0;
  const reviewIsStale = reviewDays > 7;
  const reviewFollowUpCopy = "İşveren Kariyer.net başvurularını aktif takip etmiyor olabilir; doğrudan iletişime geçmek daha mantıklı olabilir.";
  const competitionPenalty = applicationCount >= 1500 ? 5 : applicationCount >= 750 ? 2 : 0;
  const competitionWarning = applicationCount >= 1500
    ? "Başvuru sayısı çok yüksek; bu ilanda rekabet yoğun olabilir."
    : applicationCount >= 750
      ? "Başvuru sayısı yüksek; rekabet artmış olabilir."
      : "";
  const withCompetitionWarning = (copy: string) => competitionWarning ? `${copy} ${competitionWarning}` : copy;
  const likelyPoolListing = insight.openDays > 60 && applicationCount >= 1500;
  const poolRiskPenalty = likelyPoolListing ? 10 : 0;
  const score = Math.max(0, Math.min(100, Math.round(publishedScore + reviewScore - poolRiskPenalty - competitionPenalty)));
  if (likelyPoolListing) {
    return {
      score: Math.min(score, 34),
      label: "Çok düşük devir",
      color: "#dc2626",
      copy: withCompetitionWarning("Alım sinyali çok zayıf. İlanın aday havuzu toplama olasılığı yüksek; başvurmadan önce dikkatli değerlendirin."),
    };
  }
  return score <= 34
    ? { score, label: "Çok düşük devir", color: "#dc2626", copy: withCompetitionWarning(reviewIsStale ? reviewFollowUpCopy : "Alım sinyali çok zayıf. İlanın aday havuzu toplama olasılığı yüksek; başvurmadan önce dikkatli değerlendirin.") }
    : score < 50
      ? { score, label: "Düşük devir", color: "#f59e0b", copy: withCompetitionWarning(reviewIsStale ? reviewFollowUpCopy : "Alım hareketliliği düşük görünüyor; süreç yavaş ilerliyor olabilir.") }
      : score < 65
        ? { score, label: "Orta devir", color: "#8b5cf6", copy: withCompetitionWarning("Başvurular aralıklı inceleniyor; alım süreci yavaş ilerliyor olabilir.") }
        : { score, label: "Yüksek devir", color: "#10b981", copy: withCompetitionWarning("Başvurular yakın zamanda incelenmiş. Alım süreci hareketli görünüyor.") };
}

