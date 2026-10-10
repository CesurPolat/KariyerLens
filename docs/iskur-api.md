# İŞKUR API gözlem notları

Bu doküman, kullanıcının paylaştığı ağ istekleri ve yanıtlarından hazırlanır; İŞKUR'un resmî API dokümantasyonu değildir. Aşağıdaki istek canlı olarak yeniden çalıştırılmadı. KariyerLens entegrasyonu henüz eklenmedi.

İlgili ekran: https://esube.iskur.gov.tr/Istihdam/AcikIsIlanAra.aspx

## İlçe seçenekleri — AjaxPro parametre listesi

**Kaynak:** 10 Ekim 2026 tarihinde kullanıcının bir filtre değişikliğinden sonra paylaştığı URL, istek gövdesi ve yanıt.

**Adres:**

```text
https://esube.iskur.gov.tr/ajaxpro/Iskur.Shared.Web.Controls.General.ListBoxes.IskurAjaxParameterComboBox,Iskur.Shared.ashx
```

**Gözlenen işlev:** Gövdedeki `value: "48"` için BODRUM, DALAMAN, DATÇA ve diğer ilçe seçenekleri dönüyor. Bu örnek il seçimi sonrası ilçe listesinin yüklenmesi olarak yorumlanır. Endpoint'in diğer filtre tablolarını destekleyip desteklemediği doğrulanmadı.

### İstek

HTTP yöntemi, Content-Type, AjaxPro yöntem seçimi başlığı (varsa), çerezler ve diğer başlıklar paylaşılmadı. Tekrar çalıştırılabilir bir istek örneği için bunların Network panelinden doğrulanması gerekiyor.

```json
{
  "tableName": "PRMILCE",
  "referanceColumn": "ILKAYITNO",
  "value": "48",
  "dataTextField": "ACIKLAMA",
  "dataTextFieldSecondary": ""
}
```

| Alan | Gözlenen değer | Örnekten çıkarılan anlam |
| --- | --- | --- |
| `tableName` | `PRMILCE` | İlçe seçeneklerinin kaynak tablosu. |
| `referanceColumn` | `ILKAYITNO` | Seçilen ile göre eşleştirme alanı. Yazım gönderilen gövdeyle aynıdır. |
| `value` | `"48"` | Üst filtre kimliği; bu örnekte dönen ilçelerin `ILKAYITNO` değeri 48. İstekte string. |
| `dataTextField` | `ACIKLAMA` | Seçenekte gösterilecek ilçe adı alanı. |
| `dataTextFieldSecondary` | `""` | İkincil metin alanı boş; dolu değerlerdeki davranış bilinmiyor. |

Alanların zorunluluğu, kabul edilen diğer değerler ve sunucu doğrulama kuralları bilinmiyor.

### Paylaşılan yanıt

Yanıt standart JSON değil, `Ajax.Web.DataTable` oluşturma ifadesi içeriyor. Kullanıcının paylaştığı kesit aşağıdaki gibidir; sondaki `/*` korunmuştur. Bunun tam HTTP gövdesi olup olmadığı bilinmiyor.

```javascript
new Ajax.Web.DataTable([["KAYITNO","System.Decimal"],["KOD","System.Int16"],["ACIKLAMA","System.String"],["ILKAYITNO","System.Decimal"]],[[96,1197,"BODRUM",48],[635,1742,"DALAMAN",48],[164,1266,"DATÇA",48],[229,1331,"FETHİYE",48],[851,1958,"KAVAKLIDERE",48],[381,1488,"KÖYCEĞİZ",48],[410,1517,"MARMARİS",48],[1373,2089,"MENTEŞE",48],[421,1528,"MİLAS",48],[724,1831,"ORTACA",48],[1375,3025,"SEYDİKEMER",48],[588,1695,"ULA",48],[612,1719,"YATAĞAN",48]]);/*
```

İlk dizi sütun adlarını ve sunucu tiplerini, ikinci dizi bu sütun sırasındaki satırları içeriyor. Paylaşılan örnekte 13 satır bulunuyor.

| Sıra | Alan | Bildirilen tip | Örnek | Anlam |
| --- | --- | --- | --- | --- |
| 0 | `KAYITNO` | `System.Decimal` | `96` | İlçe kayıt kimliği. Sonradan paylaşılan HTML'de ilçe seçeneklerinin `value` alanı olarak doğrulandı. |
| 1 | `KOD` | `System.Int16` | `1197` | İlçe kodu; kullanım amacı doğrulanmadı. |
| 2 | `ACIKLAMA` | `System.String` | `BODRUM` | Görünen ilçe adı. |
| 3 | `ILKAYITNO` | `System.Decimal` | `48` | Bağlı il kayıt kimliği. |

### KariyerLens için önerilen dönüşüm

Aşağıdaki nesne bir entegrasyon önerisidir; sunucunun doğrudan döndürdüğü JSON değildir:

```json
{
  "districtRecordId": 96,
  "districtCode": 1197,
  "name": "BODRUM",
  "provinceRecordId": 48
}
```

`KAYITNO` ile `KOD` birbirinin yerine kullanılmamalı. Paylaşılan HTML'de BODRUM seçeneğinin değeri `96`; ilçe select alanı `KAYITNO` kullanıyor. Tarayıcının gerçek POST gövdesindeki ilçe alanı henüz paylaşılmadı.

Yanıt `response.json()` ile doğrudan okunamaz. Bir entegrasyon yapılırsa metin olarak alınmalı, doğrulanmış DataTable biçiminin dizi argümanları çalıştırılmadan ayrıştırılmalı ve sütun/satır yapısı kontrol edilmeli. `eval` veya `new Function` kullanılmamalı. Genel AjaxPro yanıt biçimleri ve hata yanıtları henüz gözlemlenmediğinden bu kesit tek başına genel bir ayrıştırıcı sözleşmesi oluşturmaz.

### Tamamlanması gereken gözlemler

- Request Method, HTTP durum kodu ve istek/yanıt Content-Type değerleri.
- Varsa `X-AjaxPro-Method` başlığının tam değeri ve diğer gerekli başlıklar.
- Oturum gereksinimi: çerez olmadan aynı seçenekler alınabiliyor mu?
- Tam yanıt gövdesi ve boş liste/hata yanıtı örnekleri.
- Başka bir il seçildiğinde değişen parametreler.
- İlçe seçimi sonrasında gerçek POST gövdesindeki ilçe alanı (HTML'de seçenek değeri `KAYITNO` olarak doğrulandı).
- İlan arama, sayfalama ve ilan detay istekleri: bu endpoint yalnızca seçenek listesi örneğini belgeliyor.

## İlan arama — WebForms postback

**Kaynak:** Kullanıcının paylaştığı URL, kısmi URL-encoded istek gövdesi ve HTML dosyası. Canlı istek yapılmadı. HTML'nin aynı istekle eşleştiği bağımsız olarak doğrulanmadı.

HTML'deki form `method="post"`, `action="./AcikIsIlanAra.aspx"`, `id="form1"` içeriyor. Ara bağlantısı `__doPostBack('ctl04$ctlAcikIsPageCommand$CommandItem_Search','')` çağırıyor. Bu hedef, paylaşılan istek gövdesiyle eşleşiyor.

```http
POST https://esube.iskur.gov.tr/Istihdam/AcikIsIlanAra.aspx
```

Paylaşılan gövde URL-encoded form biçiminde. Gerçek Request Headers paylaşılmadığından Content-Type başlığı doğrudan doğrulanmadı; bu biçim için beklenen değer `application/x-www-form-urlencoded`.

### Postback alanları

| Alan | Gözlem / kullanım |
| --- | --- |
| `__EVENTTARGET` | Ara işlemi için `ctl04$ctlAcikIsPageCommand$CommandItem_Search`. Gövdede `$` karakterleri `%24` olarak kodlanmış. |
| `__EVENTARGUMENT` | Paylaşılan istekte boş. |
| `__LASTFOCUS` | Paylaşılan istekte boş. |
| `__VIEWSTATE` | Paylaşılan istek ve HTML'de var. Güncel sayfadan alınmalı; örnek değer dokümana kopyalanmadı. |
| `__VIEWSTATEGENERATOR` | HTML'de gizli alan olarak var; paylaşılan istek kesitinde yok. |
| `__VIEWSTATEENCRYPTED` | HTML'de gizli alan olarak var; paylaşılan istek kesitinde yok. |
| `__EVENTVALIDATION` | HTML'de gizli alan olarak var; paylaşılan istek kesitinde yok. |

Gönderilen kesit `__VIEWSTATE` alanında bitiyor; bütün form payload'u olarak kabul edilmemeli. Tek başına bu kesitten filtrelerin POST değerleri veya başarılı tekrar oynatma sözleşmesi çıkarılamaz.

Bir entegrasyon yapılırken ilk sayfa aynı oturum bağlamında alınmalı; güncel gizli alanlar ve formun gönderilebilir kontrolleri okunmalı, seçilen filtreler ve arama hedefi uygulanıp form kodlamasıyla POST edilmeli. Sonraki işlemlerde dönen sayfanın güncel gizli alanları kullanılmalı. Gizli alanlar sabitlenmemeli; DOM'dan alınan değerler ikinci kez URL-decode edilmemeli. Bu akış henüz canlı olarak denenmedi.

### HTML'de doğrulanan filtre adları

Form alan adı olarak `name` kullanılmalı; DOM `id` değerleri farklıdır. Aşağıdaki değerler HTML seçeneklerinden alınmıştır, sunucunun tüm kabul kurallarını belirtmez.

| Form alanı (`name`) | Anlam / gözlenen değerler |
| --- | --- |
| `ctl04$ctlArananMetin2` | Serbest arama metni. |
| `ctl04$IsyeriTuruRadios` | `ozelSektorRadio`: özel sektör; `kamuRadio`: kamu. Örnekte kamu seçili. |
| `ctl04$ctlIl` | İl kayıt kimliği. Örnekte `48`: MUĞLA seçili. |
| `ctl04$ctlIlce` | İlçe kayıt kimliği. Boş: tüm ilçeler; `96`: BODRUM. Örnekte boş seçili. |
| `ctl04$ulkeGeneliChk` | İkamet şartı gerektirmeyen ülke geneli ilanları dahil etme checkbox'ı. |
| `ctl04$tercihEdilenIkametChk` | İşverenin tercih ettiği ikamet illerini aramaya dahil etme checkbox'ı. |
| `ctl04$ctlMeslek$ctlMeslek_TextBox` | Görünen meslek metni. |
| `ctl04$ctlMeslek$ctlMeslek_HiddenField` | Meslek kontrolünün gizli alanı; anlamı ve dolu örneği bilinmiyor. |
| `ctl04$ctlMeslek$ctlMeslek_MeslekKayitNo` | Seçilen önerinin `PrmMeslekKayitNo` değerinin string karşılığı; HTML seçim koduyla doğrulandı. |
| `ctl04$ctlMeslek$ctlMeslek_MeslekUzmanlikKayitNo` | Seçilen önerinin dolu `PrmMeslekUzmanlikKayitNo` değerinin string karşılığı; null olduğunda boş kalır. HTML seçim koduyla doğrulandı. |
| `ctl04$ctlKisiselDurum` | İlan türü: boş = tümü; `10` = Engelli; `13` = Eski Hükümlü; `9` = Genel; `15` = TMY. |
| `ctl04$ctlCalismaPeryodu` | Boş = tümü; `2` = Daimi; `1` = Geçici. |
| `ctl04$ctlEngelli` | Engelli checkbox'ı; ilan türü filtresiyle ilişkisi doğrulanmadı. |
| `ctl04$ctlCalismaSekli` | Boş = tümü; `2` = Kısmi Zamanlı; `1` = Tam Zamanlı. |
| `ctl04$ctlCalismaYeri` | `1` = Yurtiçi; `0` = Yurtdışı; ayrıca boş seçenek mevcut. |
| `ctl04$ctlUlke` | Örnekte `8` = TÜRKİYE; kontrol disabled. |
| `ctl04$ctlIsgucuIstemiNo` | İlan numarası; HTML `maxlength="11"` içeriyor. Sunucu sınırı doğrulanmadı. |
| `ctl04$ctlIlanTarihi` | `1` = tümü; `2` = Son 24 Saat; `3` = Son 1 Hafta; `4` = Son 15 Gün. |
| `ctl04$ctlVardiya` | Vardiya checkbox'ı. |
| `ctl04$ctlIsyeriUnvan` | İşyeri ünvanı; HTML `maxlength="255"` içeriyor. |
| `ctl04$ctlOgrenimDurum` | Boş = tümü; `5` = Okur Yazar Olmayan; `6` = Okur Yazar; `8` = İlkokul; `4` = İlköğretim; `3` = Ortaöğretim; `7` = Önlisans; `1` = Lisans; `2` = Yüksek Lisans; `10` = Doktora. |

İşaretsiz checkbox'lar ve disabled kontroller normal HTML form gönderiminde yer almaz. Checkbox'larda açık `value` bulunmuyor; tarayıcı form gönderiminde işaretli checkbox için varsayılan değer `on` olur. Gerçek payload ve sunucunun beklediği değerler ayrıca doğrulanmalı. Kaydedilmiş aramalar ve Arama Kaydet kontrolleri bu tabloda kapsam dışında; özel kayıt kimlikleri dokümana alınmadı.

### İlçe kontrolüyle bağlantı

İl select'inin `onchange` çağrısında `PRMILCE`, `ILKAYITNO`, `ACIKLAMA`, `KAYITNO` ve `FetchDetails` değerleri bulunuyor. Böylece AjaxPro kontrolünün çağrılan yöntem adı HTML'de `FetchDetails` olarak gözleniyor. Bu yöntem adının hangi HTTP başlığıyla iletildiği henüz doğrulanmadı.

### Paylaşılan HTML sonucu

İlan sonuç alanının DOM kimliği:

```text
ctl04_ctlGridAcikIslerListeDetail
```

Bu alan bir HTML tablosu ve örnekte yalnızca şu mesajı içeriyor:

```text
Aradığınız kriterlere uygun kayıt bulunamadı.
```

Bu bir boş sonuç gözlemidir; HTTP hata kodu gözlemi değildir. Yanıt durum kodu paylaşılmadı. Sayfalama alanı `ctl04_ctlDataPagerDetay` örnekte boş. İlan satırlarının alanları, ilan detay bağlantıları ve sayfalama event target/argument değerleri bu dosyadan çıkarılamıyor.

### Sonraki gerekli örnek

En az bir ilan döndüren aramanın tam, temizlenmiş form payload'u ve sonuç HTML'si; mümkünse ikinci sonuç sayfasının postback gövdesi ve bir ilan detay isteği. Oturum çerezleri ve gizli durum alanlarının gerçek değerleri kalıcı dokümana yazılmamalı.

## Meslek ve uzmanlık önerileri — `/api/meslekuzmanlikapi/meslekuzmanlik/{term}`

**Kaynak:** Kullanıcının paylaştığı `/yaz` URL'si ve JSON yanıtı ile önceki HTML dosyasındaki autocomplete kodu. Canlı istek yeniden çalıştırılmadı.

```text
https://esube.iskur.gov.tr/api/meslekuzmanlikapi/meslekuzmanlik/yaz
```

### İstek ve ekran davranışı

| Özellik | Gözlem |
| --- | --- |
| Yöntem | HTML'deki `$.ajax` çağrısında `type`/`method` belirtilmiyor; jQuery'nin varsayılanı üzerinden GET beklenir. Network Request Method henüz paylaşılmadı. |
| Arama parametresi | Son path segmenti: `{term}`. Meslek kutusuna yazılan arama metninden oluşur; sabit bir değer veya meslek kimliği değildir. Örnekte `yaz`. |
| Gövde | HTML çağrısı `data` veya istek gövdesi tanımlamıyor. |
| Yanıt biçimi | HTML çağrısı `dataType: "json"` kullanıyor; paylaşılan gövde doğrudan JSON dizisi. HTTP Content-Type bilinmiyor. |
| Oturum | Mevcut sayfa kendi origin'ine çağrı yapıyor. Oturumsuz erişim ve gerekli çerez/başlıklar doğrulanmadı. |
| Minimum giriş | Autocomplete için `minLength: 3`; ekran kuralı, sunucu minimumu olduğu doğrulanmadı. |
| Bekleme | Autocomplete `delay: 500` ms; sunucu rate-limit kuralı değildir. |

Örneğin Meslek kutusuna `yaz` yazıldığında URL `/meslekuzmanlik/yaz` olur. `Yazılım` yazıldığında HTML'deki dönüşüme göre arama metni `yazılım` olur ve URL'nin son segmentinde kullanılır; bu ikinci örneğin canlı yanıtı henüz paylaşılmadı. Öneriden bir meslek seçildiğinde kullanılan kayıt kimliği ise yanıtın `PrmMeslekKayitNo` alanından alınır.

HTML'de `stripNonAlphaNumeric(request.term)` metni küçük harfe çeviriyor ve `[^A-z0-9şŞıİçÇöÖüÜĞğ,-/() ]` regex'ine uymayan karakterleri kaldırıyor; çıkan değer URL sonuna ekleniyor. Bu mevcut istemci davranışıdır, API'nin kabul ettiği tüm karakterlerin sözleşmesi değildir. Yeni istemcide kullanıcı girdisi path segmenti olarak kodlanmalı; özel karakterlerin sunucu davranışı ayrıca doğrulanmalı.

### Yanıt alanları

Paylaşılan JSON ayrıştırıldı ve 48 kayıt içerdiği doğrulandı. Sayfalama veya toplam kayıt sarmalayıcısı yok. Bu sayı genel sonuç sınırı olarak yorumlanmamalı.

| Alan | Gözlenen JSON tipi | Anlam |
| --- | --- | --- |
| `PrmMeslekKayitNo` | number | Meslek kayıt kimliği; örnekte `6440.0`. |
| `PrmMeslekUzmanlikKayitNo` | number veya null | Uzmanlık kayıt kimliği; genel mesleklerde null, uzmanlık seçeneklerinde dolu. |
| `Meslek` | string | Kullanıcıya gösterilen meslek/uzmanlık etiketi. |

Aşağıdaki dizi tam yanıttan seçilmiş üç kayıttır:

```json
[
  {
    "PrmMeslekKayitNo": 6440.0,
    "PrmMeslekUzmanlikKayitNo": null,
    "Meslek": "Yazılım Mühendisi"
  },
  {
    "PrmMeslekKayitNo": 4064.0,
    "PrmMeslekUzmanlikKayitNo": 80.0,
    "Meslek": "Satış Elemanı / Danışmanı - Beyaz Eşya Ürünleri Satış Elemanı"
  },
  {
    "PrmMeslekKayitNo": 4064.0,
    "PrmMeslekUzmanlikKayitNo": 83.0,
    "Meslek": "Satış Elemanı / Danışmanı - Beyaz Eşya Yedek Parça Satış Elemanı"
  }
]
```

`4064` meslek kimliği farklı uzmanlıklarda tekrar ediyor. Seçenekler yalnızca meslek kimliğine göre tekilleştirilmemeli; meslek ve uzmanlık kimliği birlikte korunmalı. Sayısal kimliklerde `.0` JSON gösterimidir; JavaScript'te `6440.0` sayısının `toString()` sonucu `"6440"` olur.

`yaz` yanıtında hem Yazılım hem Beyaz Eşya etiketleri var. Bu örnek kelime başlangıcıyla sınırlı olmayan eşleşmeye işaret eder; kesin eşleştirme, sıralama ve Türkçe harf kuralları doğrulanmadı.

### Meslek seçiminin form akışına etkisi

Önceki HTML seçim kodu şu eşlemeyi doğruluyor:

| JSON alanı | Form alanı |
| --- | --- |
| `Meslek` | `ctl04$ctlMeslek$ctlMeslek_TextBox` |
| `PrmMeslekKayitNo` | `ctl04$ctlMeslek$ctlMeslek_MeslekKayitNo` |
| `PrmMeslekUzmanlikKayitNo` | `ctl04$ctlMeslek$ctlMeslek_MeslekUzmanlikKayitNo` |

Seçim kodu önce metni ve iki kimlik alanını temizliyor, sonra seçilen önerinin etiketini ve dolu kimliklerini yazıyor. Uzmanlık null ise uzmanlık form alanı boş kalıyor. Ardından `CallServer()` üzerinden `__doPostBack('ctl04$ctlMeslek', '')` çağrılıyor. Bu meslek seçimi postback hedefi, Ara düğmesinin hedefinden farklıdır. Gerçek seçim POST gövdesi ve bu postback'in yanıtı henüz paylaşılmadı.

### Tamamlanması gereken gözlemler

- Network Request Method, HTTP durum kodu ve Response Content-Type.
- Oturumsuz erişim ve gerekli başlıklar.
- Boş sonuç, kısa/özel karakterli arama ve hata yanıtları.
- Meslek seçimi sonrasındaki POST gövdesi ve HTML yanıtı.

## İlan detayı — `/Istihdam/AcikIsIlanDetay.aspx?uiID={jobId}`

**Kaynak:** 11 Ekim 2026 tarihinde kullanıcının paylaştığı URL ve HTML dosyası. Canlı istek yapılmadı; HTTP yöntemi, durum kodu, başlıklar ve oturumsuz erişim doğrulanmadı. Sayfa açılışı için GET beklenir; HTML formunun POST yöntemi sayfa içindeki işlemlere aittir.

```text
https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=00009850586
```

| Parametre | Konum | Anlam |
| --- | --- | --- |
| `uiID` | Query | İlan kimliği. Örnekte `00009850586`; baştaki sıfırlar korunarak string olarak tutulmalı. Uzunluk ve kabul edilen biçimler için sunucu kuralları doğrulanmadı. |

Yanıt HTML'dir; JSON ilan detay endpoint'i bu örnekte gözlenmedi. HTML'deki sayfa başlığı `İş İlan No (00009850586)` ve form action'ındaki query parametresi paylaşılan kimlikle eşleşiyor.

### HTML alan eşlemesi

Aşağıdaki tekil alanların DOM kimlikleri `ctl01_ctlIsIlanBilgileri_` önekiyle başlıyor. Örneğin firma adı seçicisi `#ctl01_ctlIsIlanBilgileri_ctlOrtIsverenUnvan`. Bu önek ve alanlar yalnızca paylaşılan örnekte doğrulandı; başka ilanlarda değişebilecekleri dikkate alınmalı.

| DOM kimliği son eki | Önerilen alan | Örnekteki değer / açıklama |
| --- | --- | --- |
| `ctlOrtIsverenUnvan` | `companyName` | BAŞARANLAR İNŞAAT MALZEMELERİ TİCARET VE SANAYİ A.Ş. |
| `ctlBirim` | `agencyOffice` | DENİZLİ ÇALIŞMA VE İŞ KURUMU İL MÜDÜRLÜĞÜ |
| `ctlResmiGazete` | `publishedAt` | `Yayınlanma Tarihi: 9.10.2026` metni. Alan adına rağmen bu örnekte yayın tarihini gösteriyor. |
| `ctlSonBasvuruTarihi` | `closingDate` | `7.11.2026` |
| `ctlGoruntulenmeSayisi` | `viewCount` | `808`; bu HTML'nin alındığı andaki değer. |
| `ctlBasvuruSayisi` | `applicationCount` | `4`; bu HTML'nin alındığı andaki değer. |
| `ctlCalismaSekli` | `employmentType` | Tam Zamanlı |
| `ctlIsverenStatusu` | `employerStatus` | Özel |
| `ctlPozisyonSayisi` | `openPositionCount` | `1` |
| `ctlGenelSartlar` | `description` | İş tanımı; paragraf ve liste içeren HTML. |
| `ctlOzelSartlarText` | `specialConditions` | Örnekte boş. |
| `ctlGenelSartlarManuel` | `additionalConditions` | Örnekte boş. |
| `ctlGenelSartlar2` | `qualifications` | Nitelik ve Beceriler; örnekte `<p>..</p>` içeriyor. |
| `ctlOgrenimAsgari` | `educationMin` | Ortaöğretim (Lise ve Dengi) |
| `ctlOgrenimAzami` | `educationMax` | Örnekte boş. |
| `ctlCalismaAdresi` | `workAddress` | Açık adres, MERKEZEFENDİ, DENİZLİ / TÜRKİYE; `<br>` ayrımları var. |
| `ctlIrtibatAdiSoyadi` | `contactName` | İrtibat adı; örnek kişi bilgisi dokümana kopyalanmadı. |
| `ctlIrtibatUnvani` | `contactTitle` | Örnekte boş. |
| `ctlIrtibatTelefonNo` | `contactPhone` | Telefon metni; sayı olarak çevrilmemeli. Örnek numara kopyalanmadı. |
| `ctlIrtibatEposta` | `contactEmail` | Örnekte boş; iş tanımı metninde ayrıca e-posta bulunuyor. |

`ctlUcretveDigerBilgiler` bir bölüm başlığıdır; bu örnekte ücret tutarı gözlenmedi. Maaş bilgisi olarak kullanılmamalı. Gizli `mPaylasmaMetni` alanı ilan no, meslek, konum, çalışma şekli, pozisyon adedi ve son başvuru tarihini içeren paylaşım özetidir; ayrı bir API yanıtı değildir.

### Tekrarlanan alanlar

DOM kimliklerindeki repeater satır numaraları sabitlenmemeli. Alanlar ilgili repeater grubunda satır bazında okunmalı; boş şablon satırları gerçek şart kaydı sayılmamalı.

| Grup / kimlik son eki | Önerilen alan | Gözlem |
| --- | --- | --- |
| `repeaterMeslek_…_ctlMeslekLabel` | `professions[].name` | Bilgi İşlem Destek Sorumlusu |
| `repeaterMeslek_…_ctlMeslekDeneyimSuresiLabel` | `professions[].experienceYears` | Boş. |
| `repeaterMeslek_…_ctlMeslekDeneyimSuresiLabelAy` | `professions[].experienceMonths` | Boş. |
| `repeaterKisiselBilgiler_…_ctlCinsiyetLabel` | `personalRequirements[].gender` | Bir boş satır ve Erkek satırı var. |
| `repeaterKisiselBilgiler_…_ctlAsgariYasLabel` | `personalRequirements[].ageMin` | Erkek satırında `21`. |
| `repeaterKisiselBilgiler_…_ctlAzamiYasLabel` | `personalRequirements[].ageMaxText` | `- 30 (9.10.1996 - 7.11.2005 tarihleri arasında doğan kişiler)`; düz sayı değildir. |
| `ctlRepeaterIkametIlce_…_ctlIlceLabel` | `preferredResidenceDistricts[]` | 19 ilçe etiketi; çalışma adresindeki ilçeden ayrı tutulmalı. |

Deneyim tablosundaki alanlar boş olsa da iş tanımı metninde en az 1 yıl deneyim şartı yazıyor. Yapılandırılmış alan boşluğu `0 yıl` veya `deneyim aranmıyor` olarak yorumlanmamalı; açıklama metni ayrıca korunmalı.

### Önerilen normalize sonuç örneği

Bu JSON, HTML'den türetilen öneridir; İŞKUR'un döndürdüğü ham yanıt değildir. Yalnızca bazı alanları gösterir.

```json
{
  "id": "00009850586",
  "jobUrl": "https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=00009850586",
  "companyName": "BAŞARANLAR İNŞAAT MALZEMELERİ TİCARET VE SANAYİ A.Ş.",
  "publishedAt": "2026-10-09",
  "closingDate": "2026-11-07",
  "employmentType": "Tam Zamanlı",
  "employerStatus": "Özel",
  "openPositionCount": 1,
  "viewCount": 808,
  "applicationCount": 4,
  "professions": [
    {
      "name": "Bilgi İşlem Destek Sorumlusu",
      "experienceYears": null,
      "experienceMonths": null
    }
  ],
  "educationMin": "Ortaöğretim (Lise ve Dengi)",
  "educationMax": null
}
```

Tarihler gün.ay.yıl biçiminden açıkça ayrıştırılmalı; örneğin `7.11.2026` → `2026-11-07`. Bu tarih alanlarına saat veya UTC bilgisi eklenmemeli. Boş alanlar null olarak tutulabilir. Açıklamaların HTML'si çalıştırılmadan metne dönüştürülmeli veya gösterim için temizlenmeli; paragraf, liste ve adres satır ayrımları korunmalı.

### Sayfa içi işlemler

HTML formu `method="post"`, `action="./AcikIsIlanDetay.aspx?uiID=00009850586"` içeriyor. Başvur bağlantısının postback hedefi `ctl01$ctlBasvuruDetay$ctlPageCommand$CommandItem_Apply`; bir onay checkbox'ı ve onay iletişim kutusu da var. Bunlar yalnızca HTML gözlemidir; başvuru isteği gönderilmedi, POST payload'u ve sonucu doğrulanmadı. İlanı okuma ile başvuru gönderme farklı işlemlerdir.

### Tamamlanması gereken gözlemler

- Detay sayfasının Network Request Method, durum kodu ve Response Content-Type bilgileri.
- Oturum olmadan detay alanlarının görünürlüğü.
- Başka ilanlarda aynı alanların yapısı; birden fazla meslek, dolu deneyim ve ücret örnekleri.
- Geçersiz, süresi dolmuş veya kaldırılmış ilan kimliklerinin yanıtları.
