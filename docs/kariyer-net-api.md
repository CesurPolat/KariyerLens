# Kariyer.net API notları

Bu doküman KariyerLens entegrasyonundan ve birlikte inceleyeceğimiz isteklerden oluşturulur. Kariyer.net'in resmî API dokümantasyonu değildir. İlk bölüm mevcut kaynak koduna dayanır; bu çalışma sırasında canlı JSON yanıtı yeniden doğrulanmadı.

Her yeni endpoint için yöntem, adres, parametreler, oturum gereksinimi, anonimleştirilmiş yanıt örneği, alan açıklamaları ve gözlenen hatalar kaydedilecek. Doğrulanmayan noktalar açıkça belirtilecek.

## İlan detayı — `GET /job`

**Kaynak:** `src/background/kariyer-api.js` içindeki mevcut entegrasyon.

```http
GET https://candidatesearchapigateway.kariyer.net/job?jobId=4568166
Accept: application/json
```

| Parametre | Konum | Açıklama |
| --- | --- | --- |
| `jobId` | Query | İlan kimliği. KariyerLens 1–16 rakam kabul eder; bu sınır uzantının doğrulamasıdır. |

İstek gövdesi yoktur. Uzantı isteği `credentials: "include"` ile gönderir; tarayıcının izin verdiği mevcut oturum bilgileri kullanılır. Mevcut kod ayrı bir API anahtarı veya Authorization başlığı eklemez. Endpoint'in oturumsuz erişim koşulları ayrıca doğrulanmalıdır.

### Kodun okuduğu yanıt alanları

Entegrasyon, payload'u `raw.data ?? raw.result ?? raw` üzerinden seçer. Bunlar desteklenen ayrıştırma biçimleridir; her biçimin canlı API tarafından döndürüldüğü doğrulanmış değildir. `jobGeneralInformation` bir nesne olmalıdır. Diğer gruplar eksik olabilir.

| Payload alanı | KariyerLens alanı / anlamı |
| --- | --- |
| `jobGeneralInformation.id` | `id` — ilan kimliği; eksikse istenen `jobId` |
| `jobGeneralInformation.title` | `title` — ilan başlığı |
| `jobGeneralInformation.jobUrl` | `jobUrl` — ilan bağlantısı |
| `jobGeneralInformation.squareLogoUrl` / `logoUrlFullPath` | `logoUrl` — ilk mevcut logo adresi |
| `jobGeneralInformation.locationText` | `location` — konum |
| `jobGeneralInformation.publishDate` | `publishedAt` — yayın tarihi |
| `jobGeneralInformation.jobDateText` | `jobDateText` — tarih açıklaması |
| `jobGeneralInformation.lastModifyDate` | `lastModifiedAt` — son değişiklik tarihi |
| `jobGeneralInformation.jobDateStatus` | `jobDateStatus` — tarih durumu |
| `jobGeneralInformation.closingDate` | `closingDate` — son başvuru tarihi |
| `jobGeneralInformation.versionId` | `updateCount` — API sürüm değeri; değişiklik adedi olduğu doğrulanmadı |
| `jobGeneralInformation.jobApplicationViewDayWithText` | `applicationReviewText` — başvuruların son incelenme açıklaması |
| `jobGeneralInformation.qualifications` | `qualifications` — ilan açıklaması; HTML içerebilir |
| `jobGeneralInformation.isActive` | `isActive` — yalnız `true` değeri etkin kabul edilir |
| `jobGeneralInformation.isEasyApply` | `isEasyApply` — yalnız `true` değeri kolay başvuru kabul edilir |
| `jobCompanyInformation.companyName` | `companyName` — şirket adı |
| `jobCompanyInformation.companyUrl` | `companyUrl` — şirket bağlantısı |
| `jobPositionInformation.workTypeText` | `employmentType` — çalışma türü |
| `jobPositionInformation.workModel` | `workModel` — çalışma modeli |
| `jobPositionInformation.positionName` | `position` — pozisyon adı |
| `jobPositionInformation.sectors[].name` | `sector[]` — sektör adları |
| `jobPositionInformation.workAreas[].name` | `workAreas[]` — çalışma alanları |
| `jobCandidateCriteria.experienceText` | `experience` — deneyim şartı |
| `jobCandidateCriteria.educationLevelText[]` | `education[]` — eğitim şartları |
| `jobCandidateCriteria.languageText[]` | `languages[]` — dil şartları |
| `jobIstatistics.totalApplication` | `applicationCount` — toplam başvuru |

`jobIstatistics` yazımı mevcut kodla aynıdır. Metin alanları dolu string veya sayıdan elde edilir; sayılar string'e çevrilir. Dizi alanlarının elemanları da aynı şekilde dönüştürülür. Tarihlerin ham biçimleri ve alanların API tarafındaki zorunluluğu için gerçek yanıt örneği bekleniyor.

### KariyerLens'in hata eşlemesi

Aşağıdaki kodlar uzantının ürettiği kodlardır; Kariyer.net'in hata sözleşmesi değildir.

| Durum | Uzantı kodu |
| --- | --- |
| Geçersiz ilan kimliği | `INVALID_JOB_ID` |
| HTTP 401/403 | `AUTH_REQUIRED`; gövdede CAPTCHA/PerimeterX işareti varsa `BOT_PROTECTION` |
| HTTP 404 | `NOT_FOUND` |
| HTTP 429 | `RATE_LIMITED` |
| Diğer başarısız HTTP durumları | `HTTP_ERROR` |
| JSON olmayan, ayrıştırılamayan veya beklenen ilan yapısını taşımayan yanıt | `INVALID_RESPONSE` |
| Üst düzey `statusCode` dolu ve `"Success"` dışında | `API_ERROR` |
| 15 saniyede tamamlanmayan istek | `TIMEOUT` |
| Ağ hatası | `NETWORK_ERROR` |

Uzantı başarılı ilan yanıtlarını 5 dakika bellekte önbelleğe alır. Bu süre API'nin sunucu önbellek veya rate-limit politikasını belirtmez.

## Aday temel bilgileri — `/candidates/base-info`

**Kaynak:** Kullanıcının paylaştığı URL, yanıt örneği ve `Authorization: Bearer` bilgisi. Canlı istek bu çalışma sırasında yapılmadı. Bu endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatewebapigw.kariyer.net/candidates/base-info`

Paylaşılan kimlik doğrulama başlığı:

```http
Authorization: Bearer <TOKEN>
```

HTTP yöntemi paylaşılmadı; `GET` olduğu henüz doğrulanmadı. Paylaşılan URL'de query parametresi yoktur. İstek gövdesi, ek başlıklar, cookie gereksinimi ve token'ın edinilme/yenilenme yöntemi bilinmiyor. Bearer token değeri dokümana kaydedilmez.

### Anonimleştirilmiş yanıt örneği

Paylaşılan JSON doğrudan bir aday nesnesidir; üst düzey bir `data` veya `statusCode` sarmalayıcısı görünmüyor. Kimlik, iletişim, doğum tarihi, konum ve tarih değerleri örnek değerlerle değiştirilmiştir. `resumeId`, imzalı fotoğraf URL'si ve `cookieValue` çıkarılmıştır; yer tutucular API'de kullanılabilir değerler değildir.

```json
{
  "id": 10000000,
  "resumeId": "<REDACTED>",
  "name": "Örnek",
  "surname": "Aday",
  "eMail": "aday@example.com",
  "candidateImageUrl": "<REDACTED>",
  "unreadMessageCount": 0,
  "mobileAppNotificationSettings": {
    "notificationInfo": false,
    "notificationInterview": false,
    "notificationSuitableAds": true,
    "notificationCvViewed": false
  },
  "personalDataProtectionBoardStatus": 1,
  "cookieValue": "<REDACTED>",
  "unreadNotificationCount": 0,
  "totalJobCount": 0,
  "canEasyApply": true,
  "isEarthquakeVictim": false,
  "hasImage": true,
  "photoStatus": 1,
  "photoStatusMessage": null,
  "occupancyRatio": "100",
  "phoneGsmApproveStatus": 1,
  "emailApproveStatus": 1,
  "showResumeInspectInfo": false,
  "creationDate": "2024-01-01 12:00:00 GMT+03:00",
  "phoneGsm": "<REDACTED>",
  "phoneGsmCode": "90",
  "location": {
    "countryId": 65,
    "countryName": "Türkiye",
    "cityId": 34,
    "cityName": "İstanbul",
    "districtId": 0,
    "districtName": "Örnek ilçe"
  },
  "isRegistrationCompleted": true,
  "isShowPhotoStatusMessage": false,
  "birthDate": "19900101"
}
```

### Yanıtta gözlenen alanlar

Alan açıklamaları adlarından ve paylaşılan örnekten yorumlanmıştır; API'nin resmî sözleşmesi değildir. Alanların zorunluluğu ve diğer olası değerleri doğrulanmadı.

| Alanlar | Gözlenen tür / açıklama |
| --- | --- |
| `id`, `resumeId` | Sayı / string; aday ve özgeçmiş kimlikleri |
| `name`, `surname`, `eMail` | String; ad, soyad ve e-posta |
| `candidateImageUrl`, `hasImage` | String / boolean; fotoğraf adresi ve fotoğraf varlığı |
| `unreadMessageCount`, `unreadNotificationCount` | Sayı; okunmamış mesaj ve bildirim sayıları |
| `mobileAppNotificationSettings.*` | Boolean; bilgi, mülakat, uygun ilan ve CV görüntüleme bildirim tercihleri |
| `personalDataProtectionBoardStatus` | Sayı; durum kodlarının anlamı doğrulanmadı |
| `cookieValue` | String; oturumla ilişkili olabilecek değer, kullanım amacı doğrulanmadı |
| `totalJobCount` | Sayı; hangi ilan kümesinin sayıldığı doğrulanmadı |
| `canEasyApply`, `isEarthquakeVictim` | Boolean; kolay başvuru ve depremzede durumuyla ilgili alanlar |
| `photoStatus`, `photoStatusMessage`, `isShowPhotoStatusMessage` | Sayı / örnekte null / boolean; fotoğraf durum kodu, mesajı ve gösterim bayrağı |
| `occupancyRatio` | String; profil doluluk oranı olarak yorumlandı, örnekte `"100"` |
| `phoneGsmApproveStatus`, `emailApproveStatus` | Sayı; telefon ve e-posta onay durumları, kod anlamları doğrulanmadı |
| `showResumeInspectInfo` | Boolean; özgeçmiş inceleme bilgisi gösterimiyle ilgili bayrak |
| `creationDate` | String; örnekte `YYYY-MM-DD HH:mm:ss GMT+03:00` biçiminde |
| `phoneGsm`, `phoneGsmCode` | String; telefon ve ülke arama kodu |
| `location` | Nesne; ülke, şehir ve ilçe için sayısal `*Id` ve string `*Name` alanları |
| `isRegistrationCompleted` | Boolean; kayıt tamamlanma durumu |
| `birthDate` | String; örnekte `YYYYMMDD` biçiminde |

Başarısız yanıt, HTTP durum kodu, token süresi ve rate-limit davranışı paylaşılmadı. `/job` entegrasyonundaki hata eşlemesi bu endpoint için doğrulanmış değildir.

## Şirket sayıları için mevcut veri kaynakları

Şu anda bu sayılar için doğrulanmış bir JSON endpoint'i kullanılmıyor:

- **Takipçi:** İlan sayfasındaki “Şirket Hakkında” bölümünün DOM'undan okunur. Eksikse şirket profilindeki görünür takipçi metni kullanılır.
- **Açık ilan:** `https://www.kariyer.net/firma-profil/{profil-slug}` HTML sayfasındaki `Tümünü Gör (N)` bağlantısından okunur. Bağlantı `/is-ilanlari?fpi={profil-kimliği}&…` listesine gider.

Profil HTML isteği aynı kaynak üzerinden yapılır. Bu bölüm sayfa entegrasyonunu anlatır; `fpi` parametresi bir JSON API sözleşmesi olarak kabul edilmemelidir.

## Sonraki doğrulamalar

- `/job` için oturum bilgileri ve kişisel veriler çıkarılmış gerçek JSON yanıtı.
- Şirket detayı ve açık ilan sayısı için varsa JSON endpoint'leri.
- İlan arama endpoint'i ve sayfalama/filtre parametreleri.
- `/candidates/base-info` için HTTP yöntemi, istek gereksinimleri ve başarısız yanıt örnekleri.

Yeni kayıtlar gerçek istekte görülen URL ve alanlarla eklenecek; endpoint adları tahmin edilerek yazılmayacak. Paylaşılan örneklerden Cookie, Authorization, token ve kişisel veriler çıkarılmalıdır.
