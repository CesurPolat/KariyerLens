// Only mock job data is used; no Kariyer.net or provider request is made.
const summaryShadows = new WeakMap();
const summaryAttach = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (options) {
  const shadow = summaryAttach.call(this, options);
  summaryShadows.set(this, shadow);
  return shadow;
};
let summaryApiCalls = 0;
const summaryJob = id => ({ id, title: "Örnek ilan", publishedAt: new Date().toISOString(), closingDate: "28 Ekim", jobDateText: "2 saat önce güncellendi", updateCount: "1", applicationReviewText: "Şirket başvuruları 4 gün önce inceledi.", applicationCount: "200", position: "ERP Uzmanı", sector: [], workAreas: [], education: [], languages: [], isActive: true, isEasyApply: false });
window.chrome = { runtime: { sendMessage: async ({ jobId }) => {
  summaryApiCalls++;
  const data = summaryJob(jobId);
  if (jobId === "456") { data.applicationCount = undefined; data.applicationReviewText = "Şirket başvuruları 15+ gün önce inceledi."; }
  return { ok: true, data, fetchedAt: Date.now() };
} } };
const summaryPause = () => new Promise(resolve => setTimeout(resolve, 80));
const summaryResults = document.querySelector("#results");
const summaryFixture = document.querySelector("#summary-fixture");
function summaryCheck(condition, text) { if (!condition) throw new Error(text); summaryResults.textContent += "\n✓ " + text; }
const summaryHost = () => summaryFixture.querySelector('[data-kariyer-lens-date-info="true"]');
async function runSummary() {
  if (new URL(location.href).searchParams.get("jobId") !== "123") history.replaceState({}, "", "?jobId=123");
  await summaryPause();
  let host = summaryHost(), shadow = summaryShadows.get(host);
  summaryCheck(!!shadow?.querySelector("section"), "İlan özeti React ile kapalı Shadow DOM içinde çizilir");
  summaryCheck(host.previousElementSibling.className === "job-features", "Özet doğru konuma yerleşir");
  summaryCheck(shadow.querySelector(".chips").textContent.includes("Şirket başvuruları 4 gün önce inceledi."), "Son inceleme bilgisi tarih etiketlerinin yanındadır");
  summaryCheck((shadow.textContent.match(/Şirket başvuruları 4 gün önce inceledi\./g) || []).length === 1 && !document.querySelector('.job-application-view-day'), "Eski inceleme satırı eklenmez; metin yalnız bir kez gösterilir");
  summaryCheck(document.querySelector('[data-test="job-application-count"]').textContent.includes("200") && document.querySelector('[data-test="job-application-count"] span').textContent === "başvuru", "Mevcut başvuru alanı ve etiketi korunur");
  summaryCheck(shadow.querySelector("svg")?.getAttribute("role") === "img", "SVG gösterge erişilebilir biçimde çizilir");
  summaryCheck(shadow.querySelector(".chips").textContent.includes("Yayın:") && shadow.querySelector(".chips").textContent.includes("1 güncelleme"), "Tarih ve güncelleme etiketleri açık yazılır");
  summaryFixture.style.width = "240px";
  await summaryPause();
  summaryCheck(shadow.querySelector("section").scrollWidth <= 240, "İlan özeti dar sütunda taşmaz");
  summaryFixture.style.width = "600px";
  summaryFixture.querySelector('.job-features').remove();
  await summaryPause();
  summaryCheck(!summaryHost(), "Hedef alan kaldırılınca React kökü temizlenir");
  const anchor = document.createElement("div"); anchor.className = "job-features"; summaryFixture.prepend(anchor);
  await summaryPause();
  summaryCheck(!!summaryHost(), "Hedef alan yeniden oluşturulunca kart geri gelir");
  history.replaceState({}, "", "?jobId=456");
  await summaryPause();
  summaryCheck(summaryFixture.querySelectorAll('[data-kariyer-lens-date-info="true"]').length === 1, "İlan değişince kart yinelenmez");
  shadow = summaryShadows.get(summaryHost());
  summaryCheck(!shadow.querySelector("svg") && shadow.querySelector(".activity-label").textContent === "Veri yetersiz", "Veri eksikse boş gösterge yerine tek durum etiketi gösterilir");
  summaryCheck(shadow.querySelector(".gauge-details").textContent.includes("başvuru sayısı") && !shadow.querySelector(".gauge-details").textContent.includes("inceleme zamanı"), "Bilinen 15+ gün inceleme bilgisi eksik sayılmaz");
  history.replaceState({}, "", "/tests/job-summary.html");
  await summaryPause();
  summaryCheck(!summaryHost(), "İlan dışına çıkınca eski özet kaldırılır");
  summaryCheck(summaryApiCalls === 2, "DOM yeniden çiziminde fazladan API isteği yapılmaz");
  summaryResults.textContent += "\nTüm ilan özeti testleri geçti.";
}
addEventListener("load", () => runSummary().catch(error => { summaryResults.textContent += "\nBAŞARISIZ: " + error.message; }));
