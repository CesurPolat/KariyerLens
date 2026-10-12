// Minimal fixtures matching the public WebForms markup observed on 12 October 2026.
// State tokens, companies and descriptions below are synthetic.
export function form(state = "initial") {
  return `<input type="hidden" name="__VIEWSTATE" value="${state}&amp;+=" />
    <input type="hidden" name="__EVENTVALIDATION" value="validation-${state}" />
    <input name="ctl04$ctlArananMetin2" value="" />
    <select name="ctl04$ctlIl"><option value="">Tümü</option><option value="34">İSTANBUL</option><option value="48">MUĞLA</option></select>
    <select name="ctl04$ctlIlce"><option value="">Tümü</option></select>
    <input type="radio" name="ctl04$IsyeriTuruRadios" value="ozelSektorRadio" checked />
    <input type="radio" name="ctl04$IsyeriTuruRadios" value="kamuRadio" />
    <input type="checkbox" name="unchecked" /><input type="checkbox" name="checked" checked />
    <input disabled name="disabled" value="skip" /><input type="submit" name="save" value="Kaydet" />
    <select name="ctl04$ctlCalismaSekli"><option value="">Tümü</option><option value="1">Tam Zamanlı</option><option value="2">Kısmi Zamanlı</option></select>
    <select name="ctl04$ctlIlanTarihi"><option value="1">Tümü</option><option value="3">Son 1 Hafta</option></select>`;
}
export const initialPage = `<form id="form1">${form()}</form>`;
export function row(id, title = "Yazılım Mühendisi", hidden = true) {
  return `<tr><td><a id="ctl04_ctlGridAcikIslerListeDetail_ctl02_flag_${id}" onclick="PopupJobDetails('${id}','Özel','0');return false;" href="javascript:__doPostBack('unused','')"><b>${title}</b></a>
    <span id="ctl04_ctlGridAcikIslerListeDetail_ctl02_ctlIsverenDL">${hidden ? "İşyeri adını görmek için Sisteme Üye Girişi yapmanız gerekmektedir." : "Örnek AŞ"}</span>
    <span id="ctl04_ctlGridAcikIslerListeDetail_ctl02_ctlCalismaSekliDL">Tam Zamanlı</span></td>
    <td><span id="ctl04_ctlGridAcikIslerListeDetail_ctl02_ctlCalismaYeriDL">Çalışma Yeri: İSTANBUL / KADIKÖY</span></td>
    <td><span id="ctl04_ctlGridAcikIslerListeDetail_ctl02_ctlSonBasvuruTarihi">7.11.2026</span></td></tr>`;
}
export function searchPage(page = 1, id = "00000000123", { empty = false, next = true, title = "Yazılım Mühendisi" } = {}) {
  return `<form id="form1">${form("page-" + page)}
    <table id="ctl04_ctlGridAcikIslerListeDetail"><tr><th></th><th></th><th>Sırala</th></tr>${empty ? '<tr><td>Aradığınız kriterlere uygun kayıt bulunamadı.</td></tr>' : row(id, title)}</table>
    <span id="ctl04_ctlDataPagerDetay"></span><span class="DataPagerInformation">
    ${!empty && next ? '<a id="ctl04_ctlDataPagerDetay_btnNext" href="javascript:__doPostBack(&#39;ctl04$ctlDataPagerDetay$btnNext&#39;,&#39;&#39;)">Sonraki Sayfa &gt;</a>' : ''}
    ${!empty ? '<a id="ctl04_ctlDataPagerDetay_btnChangeCurrentPage" href="javascript:__doPostBack(&#39;ctl04$ctlDataPagerDetay$btnChangeCurrentPage&#39;,&#39;&#39;)">Sayfaya Git</a>' : ''}
    <input id="ctl04_ctlDataPagerDetay_txtCurrentPage" name="ctl04$ctlDataPagerDetay$txtCurrentPage" value="${page}" /> - Toplam Kayıt: ${empty ? 0 : 25}</span></form>`;
}
export function detailPage(id = "00000000123", { guest = false } = {}) {
  const field = (name, value) => `<span id="ctl01_ctlIsIlanBilgileri_${name}">${value}</span>`;
  return `<form id="${guest ? "formTemp" : "form1"}" action="./AcikIsIlanDetay.aspx?uiID=${id}">
    ${guest ? '<p>İlan detaylarını görmek ve iş başvurusu yapmak için sisteme giriş yapınız.</p>' : `<h1>İş İlan No (${id})</h1>`}
    ${guest ? '' : field("ctlOrtIsverenUnvan", "Örnek AŞ")}
    ${field("repeaterMeslek_ctl02_ctlMeslekLabel", "Yazılım Mühendisi")}
    ${field("ctlGenelSartlar", "<p>React &amp; TypeScript bilgisi.</p><ul><li>Takım çalışması</li><li>Test yazımı</li></ul><script>throw 'never execute'</script>")}
    ${field("ctlGenelSartlar2", "<p>SQL bilgisi</p>")}
    ${guest ? '' : field("ctlResmiGazete", "Yayınlanma Tarihi: 9.10.2026") + field("ctlSonBasvuruTarihi", "7.11.2026") + field("ctlCalismaAdresi", "İSTANBUL<br>KADIKÖY")}
    ${field("ctlCalismaSekli", "Tam Zamanlı")}${field("ctlOgrenimAsgari", "Lisans")}
  </form>`;
}
