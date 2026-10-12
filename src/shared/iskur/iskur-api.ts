import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import type { Job, JobResult } from "../types.js";
import { jobUrlFor, jobReferenceFromUrl } from "../job-provider.js";
import { ensureIskurOriginRemoved } from "./iskur-request-headers.js";
import type { JobDiscoveryPreferences, DiscoveryJob } from "../../dashboard/models.js";

const ORIGIN = "https://esube.iskur.gov.tr";
const SEARCH_URL = ORIGIN + "/Istihdam/AcikIsIlanAra.aspx";
export const ISKUR_LOGIN_URL = SEARCH_URL;
const SEARCH_TARGET = "ctl04$ctlAcikIsPageCommand$CommandItem_Search";
type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Option = { id: string; name: string };
export class IskurError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
function fail(code: string, message: string): never { throw new IskurError(code, message); }
const children = (node: Node): Node[] => "childNodes" in node ? node.childNodes : [];
const attr = (node: Node, name: string) => "attrs" in node ? node.attrs.find(a => a.name === name)?.value ?? "" : "";
const hasAttr = (node: Node, name: string) => "attrs" in node && node.attrs.some(a => a.name === name);
function elements(node: Node, predicate: (element: Element) => boolean): Element[] {
  return children(node).flatMap(child => "tagName" in child ? [...(predicate(child) ? [child] : []), ...elements(child, predicate)] : []);
}
const byId = (node: Node, id: string) => elements(node, n => attr(n, "id") === id)[0];
const byName = (node: Node, name: string) => elements(node, n => attr(n, "name") === name)[0];
export function iskurText(node: Node | undefined): string {
  if (!node) return "";
  if (node.nodeName === "#text") return "value" in node ? node.value : "";
  if (["script", "style", "noscript"].includes(node.nodeName)) return "";
  if (node.nodeName === "br") return "\n";
  const value = children(node).map(iskurText).join("");
  return value + (["p", "div", "li", "tr"].includes(node.nodeName) ? "\n" : "");
}
const text = (node: Node | undefined) => iskurText(node).replace(/[\t \u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const compact = (node: Node | undefined) => text(node).replace(/\s+/g, " ");
const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
export function iskurDate(value: string): string {
  const match = value.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (!match) return "";
  const iso = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const time = new Date(iso + "T00:00:00Z");
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === iso ? iso : "";
}
function document(html: string): Node {
  if (!html || html.length > 4_000_000) fail("INVALID_RESPONSE", "İŞKUR yanıtı boş veya çok büyük.");
  return parse(html);
}
export function readIskurForm(html: string) {
  const root = document(html), form = byId(root, "form1");
  if (!form || !byName(form, "ctl04$ctlArananMetin2")) fail("ISKUR_AUTH_REQUIRED", "İŞKUR arama formu alınamadı. İŞKUR sayfasını açıp oturum veya doğrulama durumunu kontrol edin.");
  const body = new URLSearchParams();
  for (const control of elements(form, n => ["input", "select", "textarea"].includes(n.tagName))) {
    const name = attr(control, "name"), type = attr(control, "type").toLowerCase();
    if (!name || hasAttr(control, "disabled") || ["submit", "button", "image", "reset", "file"].includes(type)) continue;
    if (["checkbox", "radio"].includes(type) && !hasAttr(control, "checked")) continue;
    if (control.tagName === "select") {
      const options = elements(control, n => n.tagName === "option" && !hasAttr(n, "disabled"));
      const selected = options.filter(n => hasAttr(n, "selected"));
      for (const option of selected.length ? selected : options.slice(0, 1)) body.append(name, hasAttr(option, "value") ? attr(option, "value") : compact(option));
    } else body.append(name, control.tagName === "textarea" ? text(control) : hasAttr(control, "value") ? attr(control, "value") : ["checkbox", "radio"].includes(type) ? "on" : "");
  }
  if (!body.get("__VIEWSTATE")) fail("INVALID_RESPONSE", "İŞKUR formunun durum alanları eksik.");
  const options: Option[] = elements(byName(form, "ctl04$ctlIl") ?? form, n => n.tagName === "option")
    .map(n => ({ id: attr(n, "value"), name: compact(n) })).filter(n => /^\d{1,4}$/.test(n.id) && n.name);
  return { root, body, provinces: options };
}
export function iskurSearchBody(html: string, preferences: JobDiscoveryPreferences): URLSearchParams {
  const { body: formBody, provinces } = readIskurForm(html);
  if (preferences.iskur.province && !provinces.some(o => o.id === preferences.iskur.province)) fail("INVALID_ARGUMENTS", "İŞKUR il filtresi geçersiz veya güncel değil.");
  const body = new URLSearchParams({ __EVENTTARGET: SEARCH_TARGET, __EVENTARGUMENT: "", __LASTFOCUS: "" });
  for (const [name, value] of formBody) if (!["__EVENTTARGET", "__EVENTARGUMENT", "__LASTFOCUS"].includes(name)) body.append(name, value);
  body.set("ctl04$ctlArananMetin2", preferences.keyword);
  body.set("ctl04$ctlIl", preferences.iskur.province);
  body.set("ctl04$ctlIlce", "");
  body.set("ctl04$ctlCalismaSekli", preferences.iskur.employmentType);
  body.set("ctl04$IsyeriTuruRadios", preferences.iskur.sector);
  body.set("ctl04$ctlIlanTarihi", preferences.includeOlder ? "1" : "3");
  return body;
}
type PageCommand = { page: number | null; next: boolean; jump: boolean; target: string; argument: string };
export interface IskurPage {
  jobs: DiscoveryJob[]; total: number; totalKnown: boolean; hasNext: boolean;
  provinces: Option[]; commands: PageCommand[];
}
export function parseIskurSearch(html: string, page: number, now = Date.now()): IskurPage {
  const { root, provinces } = readIskurForm(html);
  const grid = byId(root, "ctl04_ctlGridAcikIslerListeDetail");
  if (!grid) fail("INVALID_RESPONSE", "İŞKUR ilan tablosu bulunamadı; önceki sonuçlar korundu.");
  const rows = elements(grid, n => n.tagName === "tr");
  const header = rows.find(row => elements(row, n => n.tagName === "th").length > 0) ?? rows[0];
  const headers = header ? elements(header, n => n.tagName === "th" || n.tagName === "td").map(n => normalize(compact(n))) : [];
  const jobs: DiscoveryJob[] = [];
  for (const row of rows) {
    const links = elements(row, n => n.tagName === "a" || Boolean(attr(n, "onclick")));
    let reference: ReturnType<typeof jobReferenceFromUrl> = null;
    let link: Element | undefined;
    for (const candidate of links) {
      const source = attr(candidate, "href") + " " + attr(candidate, "onclick");
      const popup = source.match(/PopupJobDetails\(\s*['"](\d{1,16})['"]/);
      if (popup) { reference = { provider: "iskur", jobId: popup[1] }; link = candidate; break; }
      const match = source.match(/(?:https:\/\/esube\.iskur\.gov\.tr)?(?:\/Istihdam\/|\.\/)?AcikIsIlanDetay\.aspx\?uiID=\d{1,16}/i);
      if (!match) continue;
      const url = new URL(match[0], SEARCH_URL).href;
      reference = jobReferenceFromUrl(url);
      if (reference) { link = candidate; break; }
    }
    if (!reference || !link) continue;
    const cells = elements(row, n => n.tagName === "td");
    const field = (...names: string[]) => {
      const index = headers.findIndex(h => names.some(name => h === name || h.includes(name)));
      return index >= 0 ? compact(cells[index]) : "";
    };
    const rowField = (suffix: string) => compact(elements(row, n => attr(n, "id").endsWith("_" + suffix))[0]);
    const title = field("meslek", "pozisyon") || compact(link);
    if (!title || /^\d+$/.test(title)) fail("INVALID_RESPONSE", "İŞKUR ilan başlığı ayrıştırılamadı.");
    const company = rowField("ctlIsverenDL") || field("isyeriunvani", "isveren", "firma", "isyeri");
    jobs.push({ id: reference.jobId, provider: "iskur", title: title.slice(0, 4000),
      companyName: /üye girişi|sisteme.*giriş/i.test(company) ? "" : company.slice(0, 4000),
      location: (rowField("ctlCalismaYeriDL") || field("calismayeri", "ililce", "il")).slice(0, 4000), workModel: rowField("ctlCalismaSekliDL") || field("calismasekli"),
      publishedAt: iskurDate(field("yayinlanmatarihi", "ilantarihi")), jobUrl: jobUrlFor("iskur", reference.jobId), firstSeenAt: now });
  }
  const empty = /aradığınız kriterlere uygun kayıt bulunamadı/i.test(compact(grid));
  if (!jobs.length && !empty) fail("INVALID_RESPONSE", "İŞKUR sonuç yapısı tanınmadı; önceki sonuçlar korundu.");
  if (jobs.length > 200) fail("INVALID_RESPONSE", "İŞKUR sayfasındaki ilan sayısı desteklenen sınırı aştı.");
  const currentPage = byId(root, "ctl04_ctlDataPagerDetay_txtCurrentPage");
  if (currentPage && Number(attr(currentPage, "value")) !== page) fail("INVALID_RESPONSE", "İŞKUR sayfa numarası eşleşmedi; önceki sonuçlar korundu.");
  const commands: PageCommand[] = [];
  for (const link of elements(root, n => n.tagName === "a" && attr(n, "id").startsWith("ctl04_ctlDataPagerDetay_") && !hasAttr(n, "disabled") && attr(n, "aria-disabled") !== "true" && !/aspNetDisabled/.test(attr(n, "class")))) {
    const match = (attr(link, "href") + " " + attr(link, "onclick")).match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
    if (!match || !match[1].startsWith("ctl04$")) continue;
    const label = compact(link), hint = normalize(label + " " + attr(link, "title") + " " + attr(link, "aria-label"));
    commands.push({ page: /^\d+$/.test(label) ? Number(label) : null, next: /sonraki|ileri|next/.test(hint) || label === ">" || label === "›", jump: attr(link, "id").endsWith("_btnChangeCurrentPage"), target: match[1], argument: match[2] });
  }
  const totalMatch = compact(root).match(/toplam\s*(?:kayıt|ilan)\s*:?\s*([\d.]+)/i);
  return { jobs: [...new Map(jobs.map(j => [j.id, j])).values()], total: empty ? 0 : totalMatch ? Number(totalMatch[1].replaceAll(".", "")) : jobs.length,
    totalKnown: empty || Boolean(totalMatch), hasNext: commands.some(c => c.next || (c.page !== null && c.page > page)), provinces, commands };
}

interface Session { html: string; page: number; touched: number; scope: string }
// Hidden fields remain transient; each account/filter combination has its own form state.
const sessions = new Map<string, Session>();
export function resetIskurSessionForms(): void { sessions.clear(); }
async function request(url: string, body = new URLSearchParams({ __LASTFOCUS: "" }), signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<string> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25_000);
  try {
    try { await ensureIskurOriginRemoved(); }
    catch { fail("ISKUR_HEADER_RULE_FAILED", "İŞKUR Origin başlığı kaldırma kuralı kurulamadı. Uzantıyı yeniden yükleyin."); }
    const response = await fetcher(url, { method: "POST", credentials: "include", referrer: "", referrerPolicy: "no-referrer",
      headers: { Accept: "text/html", "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(), redirect: "error", signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal });
    const responseBody = await response.text();
    // Rejection pages can arrive with HTTP 200; stop before any further POST or paging.
    if (/reddedildi|rejected/i.test(responseBody)) {
      const rejection = compact(document(responseBody));
      if (normalize(rejection).includes("yapilmayacalisilanistekreddedildi")) {
        const requestId = rejection.match(/(?:İstek|Istek)\s*ID(?:['’]si)?\s*:\s*(\d{1,32})/i)?.[1];
        sessions.clear();
        fail("ISKUR_REQUEST_REJECTED", "İŞKUR bu isteği reddetti. Otomatik tekrar denenmedi; İŞKUR sayfasını tarayıcıda kontrol edin." + (requestId ? ` İstek ID'si: ${requestId}` : ""));
      }
    }
    if (response.status === 401 || response.status === 403) fail("ISKUR_AUTH_REQUIRED", "İŞKUR oturumu veya doğrulaması gerekiyor. İŞKUR sayfasını tarayıcıda açın.");
    if (response.status === 429) fail("RATE_LIMITED", "İŞKUR istek sınırına ulaşıldı. Bir süre sonra tekrar deneyin.");
    if (response.status === 404) fail("NOT_FOUND", "İŞKUR ilanı bulunamadı.");
    if (!response.ok) fail("HTTP_ERROR", `İŞKUR isteği başarısız (${response.status}).`);
    if (response.url && (new URL(response.url).origin !== ORIGIN || /(?:login|giris|uyegirisi)/i.test(new URL(response.url).pathname))) fail("ISKUR_AUTH_REQUIRED", "İŞKUR isteği giriş sayfasına yönlendirildi.");
    if (!(response.headers.get("content-type") ?? "").includes("text/html")) fail("INVALID_RESPONSE", "İŞKUR beklenen HTML yanıtını döndürmedi.");
    return responseBody;
  } catch (error) {
    if (error instanceof IskurError) {
      if (["ISKUR_AUTH_REQUIRED", "HTTP_ERROR"].includes(error.code)) sessions.clear();
      throw error;
    }
    throw new IskurError(signal?.aborted ? "CANCELLED" : controller.signal.aborted ? "TIMEOUT" : "CONNECTION_ERROR", signal?.aborted ? "İŞKUR isteği durduruldu." : "İŞKUR bağlantısı tamamlanamadı. Tekrar deneyin.");
  } finally { clearTimeout(timer); }
}
export async function searchIskur(preferences: JobDiscoveryPreferences, page: number, scope: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<IskurPage> {
  const key = JSON.stringify([scope, preferences.keyword, preferences.includeOlder, preferences.iskur]);
  let session = sessions.get(key);
  if (!session || page === 1 || Date.now() - session.touched > 10 * 60_000) {
    const latest = [...sessions.values()].reverse().find(s => s.scope === scope && Date.now() - s.touched <= 10 * 60_000);
    const initial = latest?.html ?? await request(SEARCH_URL, undefined, signal, fetcher);
    const html = await request(SEARCH_URL, iskurSearchBody(initial, preferences), signal, fetcher);
    session = { html, page: 1, touched: Date.now(), scope };
  }
  let result = parseIskurSearch(session.html, session.page);
  let hops = 0;
  while (session.page !== page) {
    if (++hops > 20) fail("INVALID_ARGUMENTS", "İŞKUR oturumu yenilendi. İlk sayfadan tekrar başlayın.");
    const direction = page > session.page ? 1 : -1;
    const command = result.commands.find(c => c.jump) ?? result.commands.find(c => c.page === page) ?? result.commands.find(c => c.page === session!.page + direction)
      ?? result.commands.find(c => direction > 0 ? c.next : c.target.endsWith("$btnPrev"));
    if (!command) fail("INVALID_ARGUMENTS", "İŞKUR sonraki sayfa bağlantısı bulunamadı. Aramayı yenileyin.");
    const body = readIskurForm(session.html).body;
    body.set("__EVENTTARGET", command.target); body.set("__EVENTARGUMENT", command.argument); body.set("__LASTFOCUS", "");
    if (command.jump) body.set("ctl04$ctlDataPagerDetay$txtCurrentPage", String(page));
    const html = await request(SEARCH_URL, body, signal, fetcher);
    const nextPage: number = command.jump ? page : command.page ?? session.page + direction;
    const next = parseIskurSearch(html, nextPage);
    if (JSON.stringify(next.jobs.map(j => j.id)) === JSON.stringify(result.jobs.map(j => j.id))) fail("INVALID_RESPONSE", "İŞKUR aynı sayfayı tekrar döndürdü; önceki sonuçlar korundu.");
    session = { html, page: nextPage, touched: Date.now(), scope }; result = next;
  }
  sessions.delete(key); sessions.set(key, session);
  while (sessions.size > 8) sessions.delete(sessions.keys().next().value!);
  return result;
}

export function parseIskurJob(html: string, id: string): Job {
  const root = document(html), prefix = "ctl01_ctlIsIlanBilgileri_";
  const field = (suffix: string) => text(byId(root, prefix + suffix));
  const professions = elements(root, n => /repeaterMeslek_.*_ctlMeslekLabel$/.test(attr(n, "id"))).map(compact).filter(Boolean);
  const companyName = field("ctlOrtIsverenUnvan");
  const title = professions.join(" / ");
  if (!title || !byId(root, prefix + "ctlGenelSartlar")) fail("ISKUR_DETAIL_UNAVAILABLE", "İŞKUR ilan detayı okunamadı. İlan kaldırılmış olabilir veya oturum gerektirebilir.");
  const match = compact(root).match(/İş İlan No\s*\((\d{1,16})\)/i);
  const form = elements(root, n => n.tagName === "form")[0];
  const formId = form ? jobReferenceFromUrl(new URL(attr(form, "action"), jobUrlFor("iskur", id)).href)?.jobId : undefined;
  if ((match && match[1] !== id) || (formId && formId !== id) || (!match && formId !== id)) fail("INVALID_RESPONSE", "İŞKUR ilan kimliği eşleşmedi.");
  const publishedAt = iskurDate(field("ctlResmiGazete")), closingDate = iskurDate(field("ctlSonBasvuruTarihi"));
  const education = [field("ctlOgrenimAsgari"), field("ctlOgrenimAzami")].filter(Boolean);
  return { id, provider: "iskur", title, companyName, jobUrl: jobUrlFor("iskur", id), location: field("ctlCalismaAdresi"),
    employmentType: field("ctlCalismaSekli"), sector: [], workAreas: [], education, languages: [], publishedAt, closingDate,
    qualifications: [field("ctlGenelSartlar"), field("ctlOzelSartlarText"), field("ctlGenelSartlarManuel"), field("ctlGenelSartlar2")].filter(Boolean).join("\n\n"),
    applicationCount: field("ctlBasvuruSayisi") || undefined,
    ...(closingDate ? { isActive: closingDate >= new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }) } : {}), isEasyApply: false };
}
export async function getIskurJob(id: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<JobResult> {
  if (!/^\d{1,16}$/.test(id)) return { ok: false, code: "INVALID_JOB_ID", message: "İŞKUR ilan numarası geçersiz." };
  try { return { ok: true, data: parseIskurJob(await request(jobUrlFor("iskur", id), undefined, signal, fetcher), id), fetchedAt: Date.now() }; }
  catch (error) { return { ok: false, code: error instanceof IskurError ? error.code : "INVALID_RESPONSE", message: error instanceof IskurError ? error.message : "İŞKUR ilan detayı ayrıştırılamadı." }; }
}
