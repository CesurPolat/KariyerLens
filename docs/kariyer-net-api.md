# Kariyer.net API notları

Bu doküman KariyerLens entegrasyonundan ve birlikte inceleyeceğimiz isteklerden oluşturulur. Kariyer.net'in resmî API dokümantasyonu değildir. İlk bölüm mevcut kaynak koduna dayanır; bu çalışma sırasında canlı JSON yanıtı yeniden doğrulanmadı.

Her yeni endpoint için yöntem, adres, parametreler, oturum gereksinimi, anonimleştirilmiş yanıt örneği, alan açıklamaları ve gözlenen hatalar kaydedilecek. Doğrulanmayan noktalar açıkça belirtilecek.

## KariyerLens sohbet araçları

Bu dokümandaki URL'si bilinen 19 ek endpoint `src/shared/kariyer/kariyer-tools.ts` üzerinden sohbet ajanına bağlandı. Mevcut `get_current_job` ve `get_current_company_stats` ile toplam 21 tool sunulur. Aşağıdaki endpoint kayıtlarında geçen “henüz entegre edilmedi” ifadeleri kayıtların oluşturulduğu tarihe aittir; güncel kod durumu bu bölümdedir. Canlı API uyumluluğu bu entegrasyon sırasında doğrulanmadı.

| Tool | Endpoint |
| --- | --- |
| `get_candidate_base_info` | `/candidates/base-info` |
| `get_candidate_profile_summary` | `/jb/api/candidates/getcandidateinformationforcookie` |
| `get_saved_searches` | `/search/savedsearches` |
| `get_current_job_apply_status` | `/candidates/job_apply_status` |
| `get_job_recommendations` | `POST /Job/job-detail-recommendations` |
| `get_salary_by_position` | `/candidates/get-salary-by-position` |
| `get_current_job_application_detail` | `/get-job-application-detail` |
| `search_companies` | `/Search/company` |
| `autocomplete_search` | `POST /Search/autocomplete` |
| `get_search_suggestions` | `GET /jb/api/search/autocomplete` |
| `search_jobs` | `POST /search` |
| `get_related_searches` | `POST /Search/relatedsearch` |
| `get_resumes` | `/jb/api/candidates/resumes` |
| `get_resume` | `GET /jb/api/candidates/resume` |
| `get_resume_views` | `GET /jb/api/candidates/resumes/view` |
| `get_cover_letters` | `GET /coverletters` |
| `get_followed_companies` | `GET /Search/my-followed-companies` |
| `get_candidate_files` | `GET /jb/api/common/get-file-list` |
| `get_restricted_companies` | `GET /Search/my-ambargoed-companies` |

Yöntemi paylaşılmamış endpointlerde GET varsayılır; tool açıklaması ve `methodAssumed` sonucu bunu belirtir. URL'si bilinmeyen belge türleri listesi eklenmedi. Parametre sınırları uzantının yerel sınırlarıdır; API'nin kabul ettiği sınırlar olarak yorumlanmamalıdır. Açık ilana bağlı araçlar ilan kimliğini service worker'dan alır. Tool'lar başvuru yapmaz, kayıt veya tercih değiştirmez. İlan araması `dontAddLog: true` gönderir; bu bayrağın sunucu davranışı ayrıca doğrulanmalıdır.

`webRequest` ve Kariyer.net host izni, sitenin kendi isteklerinde gönderdiği Bearer ve maaş `ApiKey` başlıklarını gözlemlemek için kullanılır. Yalnız Kariyer.net kaynaklı sekme istekleri izlenir. Başlıklar hedef API origin’i bazında bellekte ve içerik betiklerine kapalı chrome.storage.session alanında tutulur. Worker yeniden başladığında geçici oturum geri yüklenir; 30 dakika yeni kimlik doğrulama başlığı gözlenmezse yeniden yakalanması gerekir. Tarayıcı kapanması veya uzantının yeniden yüklenmesi geçici oturumu temizler. Diske veya model sağlayıcısına yazılmazlar. Uzantıyı yeniden yükledikten sonra Kariyer.net oturumunu açıp ilgili profil/ilan/maaş sayfasını yenilemek gerekir. Başlık yoksa kimlik doğrulama gerektiren tool `AUTH_REQUIRED` döndürür. Token yenileme veya erişim korumasını aşma uygulanmaz.

Başarı sarmalayıcıları (`data`, `result`, `header/body`, doğrudan JSON) ayrıştırılır. Oturum alanları ve şifrelenmiş kimlikler model çıktısından çıkarılır, URL query/hash bölümleri kaldırılır. CV listesinde `encryptedId`, detay çağrısı için `resumeId` adıyla korunur; bu kimlik oturum başlığı değildir. Yanıtlar derinlik, alan, dizi ve metin bütçesiyle sınırlandırılır; eksilen veri için `truncated` döner. Kişisel profil, CV, ön yazı ve başvuru bilgileri kullanıcı bunları sorduğunda alınır ve sohbet için seçili model sağlayıcısına tool sonucu olarak gönderilir. CV listesi tam özgeçmiş içeriği değildir; `get_resume` seçili CV'nin detayını getirir. CHAT_MAX_TOOL_CALLS varsayılan olarak Infinity değerindedir (sınırsız); sayı verilirse sohbet başına tool çağrısı sınırı uygulanır. Agent işlem adımı sayısı sınırlandırılmaz; iptal ve süre sınırları uygulanır. 120 saniye yeni akış verisi veya işlem ilerlemesi alınmazsa istek durdurulur; model/araç adımları ve araç sonuçları bekleme sayacını yeniler. Akış sürse bile toplam süre en fazla 10 dakikadır. Kariyer.net tool isteklerinin ayrı 15 saniyelik sınırı korunur.

## İlan detayı — `GET /job`

**Kaynak:** `src/shared/kariyer/kariyer-api.ts` içindeki mevcut entegrasyon.

```http
GET https://candidatesearchapigateway.kariyer.net/job?jobId=<JOB_ID>
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

## Cookie için aday bilgileri — `/jb/api/candidates/getcandidateinformationforcookie`

**Kaynak:** Kullanıcının paylaştığı URL, JSON yanıtı ve Bearer token bilgisi. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatewebapigw.kariyer.net/jb/api/candidates/getcandidateinformationforcookie`

```http
Authorization: Bearer <TOKEN>
```

HTTP yöntemi paylaşılmadı. Paylaşılan URL'de query parametresi yoktur; istek gövdesi, ek başlıklar ve cookie gereksinimi doğrulanmadı. Endpoint adındaki `forcookie` ifadesi, yanıtın tarayıcı cookie'sine yazıldığını tek başına doğrulamaz.

### Anonimleştirilmiş yanıt örneği

Aday kimliği ve profil değerleri örnek değerlerle değiştirilmiş, şifrelenmiş özgeçmiş kimliği çıkarılmıştır. Sayısal aday kimliği yer tutucuyla gösterildiğinden bu örnekte string olarak yazılmıştır; paylaşılan yanıtta `loginId` sayıdır.

```json
{
  "version": "1.0",
  "statusCode": 200,
  "result": {
    "loginId": "<CANDIDATE_ID>",
    "lastJobTitle": "Örnek pozisyon",
    "lastJobTitleSegmentCode": "B3",
    "livingDistrictName": "Örnek ilçe",
    "workStatus": 1,
    "gender": false,
    "livingCityName": "Örnek şehir",
    "yearOfBirth": 1990,
    "universityName": "Örnek üniversite",
    "universityDepartmanName": "Örnek bölüm",
    "defaultResumeStatus": 1,
    "educationStatus": "O",
    "educationLevel": "U",
    "isResumeHeaderUpdated": true,
    "defaultResumeEncrpyt": "<REDACTED>",
    "occupancyRatio": "100",
    "militaryService": "T",
    "militaryServiceStatus": "no",
    "totalExperienceYear": 2,
    "totalExperienceMonth": 6
  }
}
```

### Yanıtta gözlenen alanlar

Açıklamalar alan adları ve paylaşılan örneğe dayanır. Alanların zorunluluğu ve kod değerlerinin anlamları doğrulanmadı. `universityDepartmanName` ve `defaultResumeEncrpyt` yazımları paylaşılan yanıtla aynıdır.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `version` | String; yanıt sürümü, örnekte `"1.0"` |
| `statusCode` | Sayı; gövdedeki durum kodu, örnekte `200`; HTTP durum kodu ayrıca paylaşılmadı |
| `result` | Nesne; aday bilgilerini taşıyan payload |
| `result.loginId` | Sayı; aday/oturum kimliği olarak yorumlandı |
| `result.lastJobTitle` | String; son iş/pozisyon başlığı |
| `result.lastJobTitleSegmentCode` | String; pozisyon segment kodu, örnekte `"B3"` |
| `result.livingDistrictName`, `result.livingCityName` | String; yaşanılan ilçe ve şehir |
| `result.workStatus` | Sayı; çalışma durumu kodu |
| `result.gender` | Boolean; cinsiyet alanı, boolean değerlerin anlamı doğrulanmadı |
| `result.yearOfBirth` | Sayı; doğum yılı |
| `result.universityName`, `result.universityDepartmanName` | String; üniversite ve bölüm |
| `result.defaultResumeStatus` | Sayı; varsayılan özgeçmiş durum kodu |
| `result.educationStatus`, `result.educationLevel` | String; eğitim durumu ve seviyesi kodları, örnekte `"O"` ve `"U"` |
| `result.isResumeHeaderUpdated` | Boolean; özgeçmiş başlığının güncellenme durumuyla ilgili bayrak |
| `result.defaultResumeEncrpyt` | String; şifrelenmiş varsayılan özgeçmiş kimliği olarak yorumlandı |
| `result.occupancyRatio` | String; profil doluluk oranı olarak yorumlandı |
| `result.militaryService`, `result.militaryServiceStatus` | String; askerlik alanları, örnekte `"T"` ve `"no"`; kod anlamları doğrulanmadı |
| `result.totalExperienceYear`, `result.totalExperienceMonth` | Sayı; toplam deneyimin yıl ve ay bileşenleri olarak yorumlandı |

Bu endpoint'in sayısal `statusCode: 200` sarmalayıcısı, `/job` kodunun beklediği `statusCode: "Success"` biçiminden farklıdır. Entegrasyon yapılırken bu yanıt için ayrı durum kontrolü gerekir. Başarısız yanıtlar, token süresi ve rate-limit davranışı paylaşılmadı.

## Kaydedilmiş aramalar — `/search/savedsearches`

**Kaynak:** Kullanıcının paylaştığı URL, JSON dosyası ve Bearer token bilgisi. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatesearchapigateway.kariyer.net/search/savedsearches?size=25&from=0`

```http
Authorization: Bearer <TOKEN>
```

HTTP yöntemi paylaşılmadı. İstek gövdesi, ek başlıklar ve cookie gereksinimi doğrulanmadı.

| Query parametresi | Paylaşılan değer / açıklama |
| --- | --- |
| `size` | `25`; istenen kayıt sayısı olarak yorumlandı, izin verilen sınırlar bilinmiyor |
| `from` | `0`; başlangıç ofseti olarak yorumlandı, sayfalama davranışı doğrulanmadı |

### Anonimleştirilmiş ve kısaltılmış yanıt örneği

Paylaşılan yanıtta `totalCount: 4` ve dört kayıt bulunuyor. Aşağıdaki örnek tek kayda indirgenmiş, arama metinleri, konum, tarih ve kimlikler değiştirilmiştir. Sayısal `logId` ve `searchRequest.savedSearchId` alanları anonimleştirme için string yer tutucuyla gösterilir. Uzun filtre seçenek listeleri ve bazı `searchRequest` alanları örnekten çıkarılmıştır.

```json
{
  "statusCode": "Success",
  "status": "Success",
  "data": {
    "totalCount": 1,
    "savedSearchLogItems": [
      {
        "searchRequest": {
          "keyword": null,
          "keywordPosition": "örnek pozisyon",
          "currentPage": 1,
          "size": 0,
          "sizeMode": "UseRequestValue",
          "positions": [],
          "workExperience": {
            "type": "All",
            "minValue": 0,
            "maxValue": 0
          },
          "location": {
            "country": "None",
            "cities": [],
            "districts": []
          },
          "sortType": "SmartSort",
          "sortDirection": "Descending",
          "savedSearchId": "<SAVED_SEARCH_ID>",
          "token": null
        },
        "isReporter": true,
        "logId": "<SEARCH_LOG_ID>",
        "id": "<RECORD_ID>",
        "selectedFilterCount": 0,
        "keywordText": "örnek pozisyon",
        "locationText": "Örnek şehir",
        "title": "Örnek arama",
        "creationDate": "2024-01-01T12:00:00+03:00",
        "selectedFilterItems": {
          "workModels": {
            "items": [
              {
                "name": "Hibrit",
                "value": "2",
                "count": 0,
                "isSelected": false
              }
            ]
          }
        },
        "jobCount": 0,
        "firmImages": [],
        "jobCountDescription": "0"
      }
    ]
  },
  "message": null,
  "error": null
}
```

### Yanıtta gözlenen alanlar

Alan açıklamaları paylaşılan örnek ve alan adlarından yorumlanmıştır; zorunlulukları doğrulanmadı.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `statusCode`, `status` | String; örnekte her ikisi de `"Success"` |
| `data.totalCount` | Sayı; toplam kaydedilmiş arama sayısı olarak yorumlandı |
| `data.savedSearchLogItems` | Dizi; kaydedilmiş arama kayıtları |
| `savedSearchLogItems[].searchRequest` | Nesne; kaydedilmiş aramanın filtre ve sıralama bilgileri; ayrı bir arama endpoint'inin istek sözleşmesi olarak doğrulanmadı |
| `savedSearchLogItems[].isReporter` | Boolean; bildirim/raporlama bayrağı olarak yorumlandı, kesin anlamı bilinmiyor |
| `savedSearchLogItems[].logId`, `searchRequest.savedSearchId` | Sayı; arama kaydı kimlikleri |
| `savedSearchLogItems[].id` | String; kayıt kimliği |
| `savedSearchLogItems[].selectedFilterCount` | Sayı; seçili filtre sayısı olarak yorumlandı |
| `savedSearchLogItems[].keywordText`, `.locationText`, `.title` | String; arama anahtar kelimesi, konum ve başlık metinleri |
| `savedSearchLogItems[].creationDate` | String; saat dilimi ofseti içeren tarih |
| `savedSearchLogItems[].selectedFilterItems` | Nesne; filtre seçenekleri ve seçim durumları |
| `savedSearchLogItems[].jobCount` | Sayı; aramayla ilişkili ilan sayısı olarak yorumlandı |
| `savedSearchLogItems[].firmImages` | Dizi; paylaşılan kayıtlarda boş, eleman yapısı bilinmiyor |
| `savedSearchLogItems[].jobCountDescription` | String; ilan sayısının metin gösterimi olarak yorumlandı |
| `message`, `error` | Paylaşılan yanıtta null; hata durumundaki türleri bilinmiyor |

`searchRequest` içinde anahtar kelime/şirket alanları; `date`, `sectors`, `positionLevels`, `departments`, `workTypes`, `educationLevels`, `positions`, `companyProperties`, `jobProperties`, `language`, `workModels` filtre dizileri; `workExperience`, `location`, `cityListDetail` konum/deneyim yapıları bulunuyor. Ayrıca sıralama, ilan/şirket dahil etme ve hariç tutma alanları, kimlikler ve çeşitli boolean/null bayraklar var. Bu nesnedeki `size: 0`, endpoint URL'sindeki `size=25` parametresinden ayrı bir alandır. `searchRequest.token` paylaşılan yanıtta null; Authorization token'ının kaynağı olduğu doğrulanmadı.

`selectedFilterItems` içinde `companySectors`, `positionLevels`, `departments`, `workAreas`, `workTypes`, `educationLevels`, `companyProperties`, `jobProperties`, `positions`, `jobLanguages`, `handicappedStatus`, `dates`, `workExperience`, `locations`, `searchCustomFilter` ve `workModels` grupları gözlendi. Seçeneklerde `name` ve `value` string, `count` sayı, `isSelected` boolean olarak görülüyor. `locations` ülke/şehir/ilçe listeleri içeriyor. Nesne ayrıca sıralama ve diğer seçim bayraklarını da taşıyor. Seçili olmayan seçenekler de döndüğünden bu yapı yalnız seçili filtrelerden oluşmuyor.

Başarısız yanıtlar, HTTP durum kodu, token süresi ve rate-limit davranışı paylaşılmadı. Yanıt ilan detay nesnesi içermediğinden mevcut `/job` ayrıştırıcısı bu endpoint için kullanılamaz.

## İlana başvuru durumu — `/candidates/job_apply_status`

**Kaynak:** Kullanıcının paylaştığı URL, JSON yanıtı ve Bearer token bilgisi. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatewebapigw.kariyer.net/candidates/job_apply_status?jobId=<JOB_ID>`

```http
Authorization: Bearer <TOKEN>
```

HTTP yöntemi paylaşılmadı. İstek gövdesi, ek başlıklar ve cookie gereksinimi doğrulanmadı.

| Query parametresi | Açıklama |
| --- | --- |
| `jobId` | İlan kimliği; gerçek değer dokümana kaydedilmez. API'nin kabul ettiği biçim ve sınırlar doğrulanmadı. |

### Anonimleştirilmiş yanıt örneği

İstek takip kimliği, sunucu adı ve başvuru kimliği yer tutucuyla değiştirilmiştir. `jobApplicationId` paylaşılan yanıtta sayıdır; anonimleştirme için örnekte string gösterilir. Başvuru durumu değerleri paylaşılan örnekle aynıdır.

```json
{
  "header": {
    "globalId": "<REQUEST_ID>",
    "isSuccess": true,
    "message": null,
    "responseCode": 0,
    "hostDateTime": "0001-01-01 00:00:00 GMT+01:56",
    "languageId": null,
    "machineName": "<SERVER_NAME>"
  },
  "body": {
    "message": "Bu ilana daha önce başvuru yaptınız.",
    "jobApplyStatus": 1,
    "canApplyJob": false,
    "isCandidateDisable": false,
    "isCandidateAppliedJob": true,
    "isCandidateFollowedJob": true,
    "isDisableJob": false,
    "isDisasterJob": false,
    "isRequiredEvent": false,
    "isUnCompleted": false,
    "isEmbargoedCompany": false,
    "jobComplainInformation": {
      "rate": 0,
      "jobComplainWarningMessage": null,
      "isJobComplainExist": false
    },
    "jobApplicationId": "<JOB_APPLICATION_ID>"
  }
}
```

### Yanıtta gözlenen alanlar

Alan açıklamaları paylaşılan örnek ve alan adlarından yorumlanmıştır; zorunlulukları ve diğer durum değerleri doğrulanmadı.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `header.globalId` | String; istek takip kimliği olarak yorumlandı |
| `header.isSuccess` | Boolean; yanıtın başarı bayrağı |
| `header.message` | Örnekte null; diğer durumlarda türü bilinmiyor |
| `header.responseCode` | Sayı; örnekte `0`, kod sözleşmesi doğrulanmadı |
| `header.hostDateTime` | String; örnekte `0001-01-01 00:00:00 GMT+01:56`; gerçek işlem zamanı olarak kabul edilmemeli |
| `header.languageId` | Örnekte null; diğer değerleri bilinmiyor |
| `header.machineName` | String; yanıtı üreten sunucunun adı olarak yorumlandı |
| `body.message` | String; kullanıcıya gösterilecek durum açıklaması |
| `body.jobApplyStatus` | Sayı; örnekte `1` daha önce başvurulmuş durumla birlikte dönüyor; diğer kodlar bilinmiyor |
| `body.canApplyJob` | Boolean; adayın ilana başvurabilme bayrağı |
| `body.isCandidateAppliedJob` | Boolean; adayın ilana daha önce başvurup başvurmadığı |
| `body.isCandidateFollowedJob` | Boolean; adayın ilanı takip edip etmediği olarak yorumlandı |
| `body.isCandidateDisable`, `body.isDisableJob` | Boolean; aday/ilan için engellilikle veya devre dışı olma durumuyla ilişkili olabilir; kesin anlamı doğrulanmadı |
| `body.isDisasterJob` | Boolean; afet ilanı bayrağı olarak yorumlandı |
| `body.isRequiredEvent` | Boolean; gerekli etkinlik/olay bayrağı, kullanım koşulu bilinmiyor |
| `body.isUnCompleted` | Boolean; tamamlanmamış durum bayrağı, neyin tamamlanmadığı bilinmiyor |
| `body.isEmbargoedCompany` | Boolean; şirket kısıtlaması bayrağı olarak yorumlandı |
| `body.jobComplainInformation.rate` | Sayı; şikâyetle ilgili oran/değer, ölçeği bilinmiyor |
| `body.jobComplainInformation.jobComplainWarningMessage` | Örnekte null; şikâyet uyarısı olarak yorumlandı |
| `body.jobComplainInformation.isJobComplainExist` | Boolean; ilan şikâyeti varlığı olarak yorumlandı |
| `body.jobApplicationId` | Sayı; başvuru kimliği |

Bu yanıt `header`/`body` sarmalayıcısı kullanır; mevcut `/job` ayrıştırıcısıyla uyumlu değildir. Paylaşılan örnekte istek başarılı (`header.isSuccess: true`) olsa da adayın yeniden başvurması mümkün değil (`body.canApplyJob: false`). İstek başarısı ve başvuru uygunluğu ayrı değerlendirilmelidir. HTTP durum kodu, başarısız yanıtlar, token süresi ve rate-limit davranışı paylaşılmadı.

## İlan detay önerileri — `POST /Job/job-detail-recommendations`

**Kaynak:** Kullanıcının paylaştığı cURL komutu ve ardından gönderdiği JSON yanıt dosyası. `--data-raw` kullanıldığı ve yöntem ayrıca değiştirilmediği için komut POST isteği oluşturur. Canlı istek bu çalışma sırasında yapılmadı. Endpoint henüz uzantının çalışma koduna entegre edilmedi.

URL'deki büyük/küçük harfler paylaşılan komutla aynıdır.

```http
POST https://candidatesearchapigateway.kariyer.net/Job/job-detail-recommendations
Accept: application/json, text/plain, */*
Accept-Language: tr-TR
Authorization: Bearer <TOKEN>
Content-Type: application/json;charset=UTF-8
ClientType: 1

{"jobId":"<JOB_ID>"}
```

| Gövde alanı | Gözlenen tür / açıklama |
| --- | --- |
| `jobId` | String; önerilerin istendiği ilan kimliği. Gerçek değer kaydedilmez; API'nin kabul ettiği sınırlar doğrulanmadı. |

### Paylaşılan istekteki diğer başlıklar

Aşağıdaki başlıklar komutta gözlendi; endpoint için hangilerinin zorunlu olduğu doğrulanmadı. Token, oturum/cihaz değerleri, hash ve koruma cookie'leri dokümana kaydedilmez.

| Başlıklar | Gözlem |
| --- | --- |
| `SessionId`, `deviceId` | Komutta aynı değer gönderilmiş; oturum/cihaz tanımlayıcıları olarak yorumlandı |
| `X-Hash` | Hash değeri gönderilmiş; üretim yöntemi ve gerekliliği bilinmiyor |
| `x-px-cookies` | Koruma cookie değerleri taşınıyor; değerler çıkarıldı |
| `Origin`, `Referer` | Sırasıyla `https://www.kariyer.net` ve `https://www.kariyer.net/` |
| `Cache-Control`, `Pragma` | Her ikisi de `no-cache` |
| `Connection` | `keep-alive` |
| `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site` | Sırasıyla `empty`, `cors`, `same-site` |
| `Sec-GPC` | `1` |
| `User-Agent`, `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform` | Tarayıcı/platform bilgileri; komutta Windows ve Chromium/Brave, mobil bayrağı `?0` |

Yukarıdaki HTTP örneği hassas değerleri çıkarılmış bir dokümantasyon örneğidir; tüm gerekli başlıkları içerdiği veya tek başına çalışacağı doğrulanmadı. HTTP durum kodları, başarısız yanıtlar ve rate-limit davranışı bilinmiyor.

### Anonimleştirilmiş ve kısaltılmış yanıt örneği

Paylaşılan yanıtta üç ilan ve `jobDetailsRecommendationListType: 1` bulunuyor. Aşağıdaki örnek tek ilana indirgenmiştir. Gerçek ilan/şirket/pozisyon kimlikleri, bağlantılar, başlıklar, konum ve tarihler yer tutucu veya örnek değerlerle değiştirilmiştir. Sayısal kimlikler anonimleştirme amacıyla string gösterilir; bazı alanlar örnekten çıkarılmıştır.

```json
{
  "statusCode": "Success",
  "status": "Success",
  "data": {
    "resultJobList": [
      {
        "id": "<JOB_ID>",
        "title": "Örnek pozisyon",
        "companyName": "Örnek şirket",
        "jobUrl": "/is-ilani/<JOB_SLUG>",
        "companyUrl": "/firma-profil/<COMPANY_SLUG>",
        "logoUrl": "",
        "fullPathLogoUrl": "<LOGO_URL>",
        "squareLogoUrl": "<SQUARE_LOGO_URL>",
        "locationText": "Örnek şehir",
        "companyId": "<COMPANY_ID>",
        "profileId": "<PROFILE_ID>",
        "workType": "FullTime",
        "workTypeText": "Tam Zamanlı",
        "workModel": "OnSite",
        "jobDateText": "7 gün",
        "jobDateStatus": "Updated",
        "postingDate": "2024-01-01",
        "showTime": "2024-01-01T12:00",
        "memberJobStatus": "Default",
        "isFavorite": false,
        "isEasyApply": false,
        "isSponsored": false,
        "isRealSponsored": false,
        "positionId": "<POSITION_ID>",
        "positionName": "Örnek pozisyon",
        "sectors": [{"code": "<SECTOR_CODE>", "name": "Örnek sektör"}],
        "locations": [{
          "countryId": "<COUNTRY_ID>",
          "countryName": "Örnek ülke",
          "cityId": "<CITY_ID>",
          "cityName": "Örnek şehir",
          "jobTownLocationList": [{"townId": "<TOWN_ID>", "townName": "Örnek ilçe"}]
        }],
        "appliedDetail": null,
        "algorithmName": null,
        "jobRecommendationModel": null,
        "chips": [],
        "versionId": 2,
        "isRedirect": true,
        "redirectedInformation": {
          "isRedirected": true,
          "redirectedJobUrl": "<EXTERNAL_JOB_URL>",
          "redirectionCount": 0,
          "isCrawledJob": false
        }
      }
    ],
    "jobDetailsRecommendationListType": 1
  },
  "message": null,
  "error": null
}
```

### Yanıtta gözlenen alanlar

Aşağıdaki ilan alanları `data.resultJobList[]` altındadır. Açıklamalar alan adları ve paylaşılan örnekten yorumlanmıştır; zorunlulukları ve diğer olası değerleri doğrulanmadı.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| Üst düzey `statusCode`, `status` | String; her ikisi de `"Success"` |
| Üst düzey `message`, `error` | Örnekte null; hata durumundaki türler bilinmiyor |
| `data.resultJobList` | Dizi; önerilen ilanlar, paylaşılan yanıtta üç eleman |
| `data.jobDetailsRecommendationListType` | Sayı; örnekte `1`, liste türü kodunun anlamı bilinmiyor |
| `id`, `companyId`, `profileId`, `positionId` | Sayı; ilan, şirket, şirket profili ve pozisyon kimlikleri |
| `title`, `companyName`, `positionName`, `jobCode` | String; başlık, şirket, pozisyon ve ilan kodu |
| `jobUrl`, `companyUrl` | String; örnekte göreli Kariyer.net yolları |
| `logoUrl`, `fullPathLogoUrl`, `squareLogoUrl` | String; logo adresleri, `logoUrl` boş olabilir |
| `locationText`, `allLocations` | String; konum açıklamaları |
| `workType`, `workTypeText`, `workModel` | String; çalışma türü kodu/metni ve modeli, örnekte `FullTime`, `Tam Zamanlı`, `OnSite` |
| `jobDateText`, `jobDateStatus` | String; tarih açıklaması ve durumu, örnekte `7 gün` ve `Updated` |
| `postingDate`, `showTime` | String; örnekte `YYYY-MM-DD` ve `YYYY-MM-DDTHH:mm`; saat dilimi belirtilmemiş |
| `memberJobStatus`, `isFavorite` | String / boolean; adayın ilanla ilişkili durumu ve favori bayrağı |
| `isSponsored`, `isRealSponsored`, `sponsoredScore`, `calculatedFromScore` | Boolean / boolean / sayı / boolean; sponsorluk ve skor alanları, hesaplama anlamları doğrulanmadı |
| `humanReward`, `hasVideo`, `hasIso` | Boolean; ödül/video/ISO ile ilişkili olabilecek bayraklar, kesin anlamları doğrulanmadı |
| `isHandicapped`, `isDisaster`, `isEasyApply` | Boolean; engelli ilanı, afet ve kolay başvuru bayrakları olarak yorumlandı |
| `confidential`, `onlyPublishedOnKariyerNet` | Boolean; gizlilik ve yalnız Kariyer.net'te yayınlanma bayrakları olarak yorumlandı |
| `isLogoSelected`, `positionLevel` | Sayı; logo seçimi ve pozisyon seviyesi kodları, anlamları doğrulanmadı |
| `sectors[]` | Nesne; string `code` ve `name` alanları |
| `locations[]` | Nesne; string ülke/şehir kimlikleri ve adları; `jobTownLocationList[]` içinde string `townId`/`townName` |
| `appliedDetail`, `algorithmName`, `jobRecommendationModel`, `memberJobInteractionDate` | Paylaşılan yanıtta null; dolu değerlerin yapısı bilinmiyor |
| `chips` | Dizi; örnekte boş, eleman yapısı bilinmiyor |
| `versionId` | Sayı; sürüm değeri olarak yorumlandı, değişiklik adedi olduğu doğrulanmadı |
| `isRedirect`, `isSimilarPosition` | Boolean; yönlendirme ve benzer pozisyon bayrakları olarak yorumlandı |
| `redirectedInformation` | Nesne veya null; yönlendirme bilgileri |
| `redirectedInformation.isRedirected`, `.isCrawledJob` | Boolean; yönlendirme ve taranmış ilan bayrakları |
| `redirectedInformation.redirectedJobUrl` | String; harici ilan bağlantısı |
| `redirectedInformation.redirectionCount` | Sayı; yönlendirme sayısı olarak yorumlandı |

Yanıt `data.resultJobList` üzerinden ayrıştırılmalıdır; mevcut `/job` kodunun beklediği `jobGeneralInformation` nesnesi bulunmuyor. `algorithmName` ve `jobRecommendationModel` null olduğundan öneri algoritması bu örnekten belirlenemez.

## Pozisyona göre maaş — `/candidates/get-salary-by-position`

**Kaynak:** Kullanıcının paylaştığı URL, JSON yanıtı ve `ApiKey` başlığı gereksinimi. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatewebapigw.kariyer.net/candidates/get-salary-by-position?positionId=<POSITION_ID>`

```http
ApiKey: <API_KEY>
```

HTTP yöntemi paylaşılmadı. İstek gövdesi, ek başlıklar, Bearer token veya cookie gereksinimi doğrulanmadı. API anahtarının değeri paylaşılmadı; edinilme yöntemi bilinmiyor.

| Query parametresi | Açıklama |
| --- | --- |
| `positionId` | Pozisyon kimliği; paylaşılan örnekte yanıtın `body.positionCode` alanıyla eşleşiyor. API'nin kabul ettiği biçim ve sınırlar doğrulanmadı. |

### Anonimleştirilmiş yanıt örneği

İstek takip kimliği ve sunucu adı çıkarılmış, pozisyon kimliği ve metinleri yer tutucuyla değiştirilmiştir. Maaş ve toplam sayı değerleri paylaşılan örnekle aynıdır; güncel maaş bilgisi olarak ayrıca doğrulanmadı.

```json
{
  "header": {
    "globalId": "<REQUEST_ID>",
    "isSuccess": true,
    "message": null,
    "responseCode": 0,
    "hostDateTime": "0001-01-01 00:00:00 GMT+01:56",
    "languageId": null,
    "machineName": "<SERVER_NAME>"
  },
  "body": {
    "isSuccess": true,
    "positionCode": "<POSITION_ID>",
    "positionName": "Örnek pozisyon",
    "positionUrl": "pozisyonlar/<POSITION_SLUG>/maas",
    "minimumSalary": 71000.0,
    "maximumSalary": 130000.0,
    "totalCount": 5173,
    "isConfidential": false,
    "isSalaryExist": true
  }
}
```

### Yanıtta gözlenen alanlar

Alan açıklamaları paylaşılan örnek ve alan adlarından yorumlanmıştır; zorunlulukları ve diğer olası değerleri doğrulanmadı.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `header.globalId` | String; istek takip kimliği olarak yorumlandı |
| `header.isSuccess` | Boolean; üst düzey başarı bayrağı |
| `header.message`, `header.languageId` | Örnekte null; diğer değerlerin türleri bilinmiyor |
| `header.responseCode` | Sayı; örnekte `0`, kod sözleşmesi doğrulanmadı |
| `header.hostDateTime` | String; örnekte `0001-01-01 00:00:00 GMT+01:56`; gerçek işlem zamanı olarak kabul edilmemeli |
| `header.machineName` | String; yanıtı üreten sunucunun adı olarak yorumlandı |
| `body.isSuccess` | Boolean; gövdeye ait başarı bayrağı |
| `body.positionCode` | String; pozisyon kodu |
| `body.positionName` | String; pozisyon adı |
| `body.positionUrl` | String; maaş sayfasının göreli yolu, başında `/` bulunmuyor |
| `body.minimumSalary`, `body.maximumSalary` | Sayı; minimum ve maksimum maaş değerleri olarak yorumlandı |
| `body.totalCount` | Sayı; maaş verisine katkı sağlayan kayıt/kişi sayısı olabilir, kesin kapsamı bilinmiyor |
| `body.isConfidential` | Boolean; gizlilik bayrağı olarak yorumlandı |
| `body.isSalaryExist` | Boolean; maaş verisinin varlığı bayrağı |

Yanıt para birimi, aylık/yıllık dönem, net/brüt ayrımı, veri tarihi veya hesaplama yöntemini belirtmiyor; bu bilgiler varsayılmamalıdır. `header.isSuccess`, `body.isSuccess` ve `body.isSalaryExist` ayrı alanlardır; başarısızlık veya veri bulunmaması durumundaki kombinasyonları henüz gözlenmedi. Yanıt `header`/`body` sarmalayıcısı kullanır ve mevcut `/job` ayrıştırıcısıyla uyumlu değildir. HTTP durum kodu, başarısız yanıtlar, API anahtarının kapsamı ve rate-limit davranışı paylaşılmadı.

## Başvuru detayı — `/get-job-application-detail`

**Kaynak:** Kullanıcının paylaştığı URL, JSON yanıtı ve Bearer token bilgisi. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatewebapigw.kariyer.net/get-job-application-detail?jobId=<JOB_ID>&isRedirectedJob=false`

```http
Authorization: Bearer <TOKEN>
```

HTTP yöntemi paylaşılmadı. İstek gövdesi, ek başlıklar ve cookie gereksinimi doğrulanmadı.

| Query parametresi | Açıklama |
| --- | --- |
| `jobId` | İlan kimliği; gerçek değer dokümana kaydedilmez. Kabul edilen biçim ve sınırlar bilinmiyor. |
| `isRedirectedJob` | Paylaşılan URL'de `false`; yönlendirilmiş ilan olup olmadığını belirten parametre olarak yorumlandı. `true` durumundaki davranış doğrulanmadı. |

### Anonimleştirilmiş yanıt örneği

Sayısal kimlikler string yer tutucuyla gösterilmiştir. CV adı/kimliği, ön yazı, şirket/pozisyon bilgileri, logo adresi ve başvuru/etkileşim tarihleri değiştirilmiştir. Yanıt doğrudan `applicationDetail` ve `applicationInteractions` alanlarını içeriyor; paylaşılan örnekte başarı sarmalayıcısı bulunmuyor.

```json
{
  "applicationDetail": {
    "applicationId": "<APPLICATION_ID>",
    "jobId": "<JOB_ID>",
    "applicationDeleteCount": 0,
    "appliedDate": "2024-01-01 12:00:00 GMT+03:00",
    "isArchived": false,
    "jobAppliedProcess": 1,
    "applicationCanBeDeletedLastTime": false,
    "isDeleted": false,
    "cvName": "Örnek CV",
    "cvId": "<REDACTED>",
    "isFormEditable": false,
    "coverLetter": "<p>Örnek ön yazı.</p>",
    "totalFormCount": 7,
    "messageTitle": null,
    "messageContent": null,
    "messageId": null,
    "messageType": 0,
    "jobPositionName": "Örnek pozisyon",
    "companyName": "Örnek şirket",
    "logoUrl": "<LOGO_URL>",
    "companyId": "<COMPANY_ID>",
    "positionId": "<POSITION_ID>"
  },
  "applicationInteractions": [
    {
      "interactionStatus": 3,
      "interactionStatusText": "Başvurun 01.01.2024 tarihinde iletildi.",
      "interactionDate": "2024-01-01 12:00:00 GMT+03:00"
    },
    {
      "interactionStatus": 1,
      "interactionStatusText": "Özgeçmişin Görüntülendi",
      "interactionDate": "2024-01-02 15:00:00 GMT+03:00"
    }
  ]
}
```

### Yanıtta gözlenen alanlar

Alan açıklamaları paylaşılan örnek ve alan adlarından yorumlanmıştır; zorunlulukları ve diğer olası değerleri doğrulanmadı.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `applicationDetail` | Nesne; başvuru bilgileri |
| `applicationDetail.applicationId`, `.jobId`, `.companyId`, `.positionId` | Sayı; başvuru, ilan, şirket ve pozisyon kimlikleri |
| `applicationDetail.applicationDeleteCount` | Sayı; başvuru silme sayısı olarak yorumlandı |
| `applicationDetail.appliedDate` | String; başvuru tarihi, örnekte `YYYY-MM-DD HH:mm:ss GMT+03:00` |
| `applicationDetail.isArchived`, `.isDeleted` | Boolean; arşivlenme ve silinme bayrakları |
| `applicationDetail.jobAppliedProcess` | Sayı; başvuru süreç kodu, örnekte `1`; anlamı doğrulanmadı |
| `applicationDetail.applicationCanBeDeletedLastTime` | Boolean; son silme hakkı/koşuluyla ilişkili olabilir; kesin anlamı doğrulanmadı |
| `applicationDetail.cvName`, `.cvId` | String; başvuruyla ilişkili CV adı ve kodlanmış kimliği |
| `applicationDetail.isFormEditable` | Boolean; başvuru formunun düzenlenebilme bayrağı |
| `applicationDetail.coverLetter` | String; HTML içeren ön yazı |
| `applicationDetail.totalFormCount` | Sayı; form sayısı olarak yorumlandı; neyi saydığı doğrulanmadı |
| `applicationDetail.messageTitle`, `.messageContent`, `.messageId` | Örnekte null; dolu değerlerin türleri bilinmiyor |
| `applicationDetail.messageType` | Sayı; mesaj türü kodu, örnekte `0`; anlamı bilinmiyor |
| `applicationDetail.jobPositionName`, `.companyName`, `.logoUrl` | String; pozisyon adı, şirket adı ve logo adresi |
| `applicationInteractions` | Dizi; başvuru etkileşim kayıtları |
| `applicationInteractions[].interactionStatus` | Sayı; örnekte `3` başvurunun iletilmesi, `1` özgeçmişin görüntülenmesi metinleriyle birlikte dönüyor; diğer kodlar bilinmiyor |
| `applicationInteractions[].interactionStatusText` | String; etkileşimin kullanıcıya yönelik açıklaması |
| `applicationInteractions[].interactionDate` | String; etkileşim tarihi, örnekte `YYYY-MM-DD HH:mm:ss GMT+03:00` |

Etkileşimlerin sıralama garantisi ve birden fazla görüntülemenin nasıl temsil edildiği doğrulanmadı. Özgeçmişin görüntülenmesi, mülakat veya kabul anlamına gelmez. `coverLetter` HTML içerdiğinden arayüzde gösterilecekse güvenli metin veya temizlenmiş HTML olarak işlenmelidir. Yanıt mevcut `/job` ayrıştırıcısıyla uyumlu değildir. Başvuru bulunmaması, yönlendirilmiş ilanlar, başarısız yanıtlar, HTTP durum kodları ve rate-limit davranışı henüz gözlenmedi.

## Şirket arama — `/Search/company`

**Kaynak:** Kullanıcının paylaştığı URL ve JSON yanıt dosyası. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatesearchapigateway.kariyer.net/Search/company?Size=50&Type=Company&Keyword=test`

URL yolu ve query parametrelerinin büyük/küçük harfleri paylaşılan örnekle aynıdır. HTTP yöntemi, kimlik doğrulama başlıkları, cookie gereksinimi ve istek gövdesi paylaşılmadı. Önceki endpoint'lerdeki Bearer gereksinimi bu endpoint için doğrulanmış kabul edilmez.

| Query parametresi | Paylaşılan değer / açıklama |
| --- | --- |
| `Size` | `50`; istenen sonuç sayısı olarak yorumlandı, izin verilen sınırlar bilinmiyor |
| `Type` | `Company`; arama türü olarak yorumlandı, diğer kabul edilen değerler bilinmiyor |
| `Keyword` | `test`; arama metni; eşleşme ve sıralama kuralları doğrulanmadı |

### Anonimleştirilmiş ve kısaltılmış yanıt örneği

Paylaşılan yanıtta `data` doğrudan 50 şirket kaydından oluşan bir dizidir. Örnek tek kayda indirgenmiş; şirket kimlikleri, adı, bağlantıları ve sektör kimliği yer tutucuyla değiştirilmiştir. `profileId` paylaşılan yanıtta sayıdır; örnekte anonimleştirme amacıyla string gösterilir.

```json
{
  "statusCode": "Success",
  "status": "Success",
  "data": [
    {
      "id": "<SEARCH_RESULT_ID>",
      "name": "Örnek şirket",
      "companyId": "<COMPANY_ID>",
      "profileId": "<PROFILE_ID>",
      "occurrence": 4,
      "type": "Company",
      "logo": "<LOGO_URL>",
      "sectors": [{"id": "<SECTOR_ID>", "name": null}],
      "companyUrl": "/firma-profil/<COMPANY_SLUG>",
      "isFollowed": false,
      "isAmbargoed": false
    }
  ],
  "message": null,
  "error": null
}
```

### Yanıtta gözlenen alanlar

Alan açıklamaları paylaşılan örnek ve alan adlarından yorumlanmıştır; zorunlulukları ve diğer olası değerleri doğrulanmadı. `isAmbargoed` yazımı paylaşılan yanıtla aynıdır.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `statusCode`, `status` | String; her ikisi de `"Success"` |
| `data` | Dizi; şirket arama sonuçları, örnekte 50 kayıt |
| `data[].id` | String; arama sonucu kimliği, örnekte `C` önekiyle şirket kimliğini içeriyor |
| `data[].name` | String; şirket adı |
| `data[].companyId` | String; şirket kimliği |
| `data[].profileId` | Sayı; şirket profil kimliği, `0` değeri de gözlendi |
| `data[].occurrence` | Sayı; şirketin açık ilan sayısı. Kullanıcının açıklamasıyla belirlendi; canlı istekle ayrıca doğrulanmadı. |
| `data[].type` | String; örnekte `"Company"` |
| `data[].logo` | String; şirket logo adresi |
| `data[].sectors` | Dizi; elemanlarda string `id`, örnekte null `name` |
| `data[].companyUrl` | String; göreli şirket profil yolu |
| `data[].isFollowed` | Boolean; şirketin takip edilmesiyle ilgili bayrak olarak yorumlandı |
| `data[].isAmbargoed` | Boolean; şirket kısıtlamasıyla ilgili bayrak olarak yorumlandı |
| `message`, `error` | Örnekte null; hata durumundaki türleri bilinmiyor |

Paylaşılan yanıtta toplam sonuç sayısı veya sayfalama metadatası bulunmuyor. `Size=50` ile 50 kayıt dönmesi, toplam eşleşmenin 50 olduğunu göstermez. Yanıt mevcut `/job` ayrıştırıcısıyla uyumlu değildir. HTTP durum kodu, başarısız/boş yanıtlar ve rate-limit davranışı paylaşılmadı.

## Arama otomatik tamamlama — `POST /Search/autocomplete`

**Kaynak:** Kullanıcının paylaştığı URL, istek gövdesi ve JSON yanıtı. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatesearchapigateway.kariyer.net/Search/autocomplete`

HTTP yöntemi kullanıcının sonraki açıklamasıyla POST olarak belirlendi. Başlıklar paylaşılmadı; kimlik doğrulama ve cookie gereksinimleri bilinmiyor.

### İstek gövdesi

Paylaşılan `keyword` değeri `yaz^ l` şeklindedir; `^` ve bölünemez boşluğun kopyalama kaynaklı olup olmadığı bilinmiyor. Aşağıda bu boşluk JSON'un `\u00a0` kaçışıyla gösterilmiştir; değer düzeltilerek varsayılmamıştır.

```json
{"category":"All","keyword":"yaz^\u00a0l","size":5,"sourceType":"AutoComplete"}
```

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `category` | String; örnekte `All`, diğer kategoriler bilinmiyor |
| `keyword` | String; otomatik tamamlama için arama metni |
| `size` | Sayı; örnekte `5`; şirket ve pozisyon gruplarının her birinde beş sonuç dönüyor. Genel sınırlar doğrulanmadı. |
| `sourceType` | String; örnekte `AutoComplete`, diğer değerler bilinmiyor |

### Anonimleştirilmiş ve kısaltılmış yanıt örneği

Paylaşılan yanıtta beş şirket ve beş pozisyon bulunuyor. Örnek her gruptan tek kayda indirgenmiş; kimlikler ve adlar değiştirilmiştir. Pozisyon `id` ve şirket `profileId` alanları gerçekte sayıdır; yer tutucular için string gösterilir. Şirket `id` alanı gerçekte de string'dir.

```json
{
  "statusCode": "Success",
  "status": "Success",
  "data": {
    "companies": [{
      "id": "<COMPANY_ID>",
      "profileId": "<PROFILE_ID>",
      "name": "Örnek şirket",
      "occurrence": 2,
      "searchType": "Fuzzy",
      "type": "Company",
      "companyVisible": "Evergreen",
      "companyVisibleDescription": "Evergreen"
    }],
    "positions": [{
      "id": "<POSITION_ID>",
      "turkishName": "Örnek pozisyon",
      "englishName": "Example Position",
      "occurrence": 0,
      "searchType": "Fuzzy",
      "type": "Position"
    }]
  },
  "message": null,
  "error": null
}
```

### Yanıtta gözlenen alanlar

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `statusCode`, `status` | String; her ikisi de `Success` |
| `data.companies`, `data.positions` | Dizi; şirket ve pozisyon önerileri |
| `data.companies[].id`, `.profileId`, `.name` | String / sayı / string; şirket kimliği, profil kimliği ve adı; `profileId: 0` gözlendi |
| `data.companies[].occurrence` | Sayı; `/Search/company` için açıklanan açık ilan sayısıyla aynı alan adı kullanılıyor; bu endpoint'teki anlamı ayrıca doğrulanmadı |
| `data.companies[].searchType`, `.type` | String; örnekte `Fuzzy` ve `Company` |
| `data.companies[].companyVisible`, `.companyVisibleDescription` | String; örnekte `Evergreen` veya `Default`; görünürlük değerlerinin anlamı bilinmiyor |
| `data.positions[].id` | Sayı; pozisyon kimliği |
| `data.positions[].turkishName`, `.englishName` | String; Türkçe ve İngilizce pozisyon adları |
| `data.positions[].occurrence` | Sayı; pozisyonla ilişkili ilan sayısı olabilir; kesin anlamı doğrulanmadı |
| `data.positions[].searchType`, `.type` | String; örnekte `Fuzzy` ve `Position` |
| `message`, `error` | Örnekte null; hata durumundaki türleri bilinmiyor |

`Fuzzy` değeri gözlendi; eşleşme algoritması ve sıralama kuralları bilinmiyor. Alanların zorunluluğu, boş sonuç davranışı, HTTP durum kodları ve rate-limit davranışı doğrulanmadı. Yanıt mevcut `/job` ayrıştırıcısıyla uyumlu değildir.

## Arama önerileri — `GET /jb/api/search/autocomplete`

**Kaynak:** Kullanıcının paylaştığı URL, GET yöntemi ve JSON yanıt dosyası. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

```http
GET https://candidatewebapigw.kariyer.net/jb/api/search/autocomplete?category=All&keyword=yaz%C4%B1l%C4%B1m&size=10&sourceType=DidYouMean
```

İstek başlıkları paylaşılmadı; kimlik doğrulama ve cookie gereksinimleri bilinmiyor. İstek gövdesi paylaşılmadı.

| Query parametresi | Paylaşılan değer / açıklama |
| --- | --- |
| `category` | `All`; arama kategorisi, diğer değerler bilinmiyor |
| `keyword` | URL kodlaması çözüldüğünde `yazılım` |
| `size` | `10`; paylaşılan yanıtta her kategoride on sonuç bulunuyor; genel sınırlar doğrulanmadı |
| `sourceType` | `DidYouMean`; kaynak türü, diğer değerler ve davranış farkları bilinmiyor |

### Anonimleştirilmiş ve kısaltılmış yanıt örneği

Yanıtta `Firma Adı` ve `Pozisyon` kategorileri bulunuyor. Her kategori on kayıt içeriyor; aşağıdaki örnekte birer kayıt gösterilmiştir. Kimlikler ve adlar değiştirilmiş, sayısal `profileId` anonimleştirme için string yer tutucuyla gösterilmiştir. `id` ve `count` paylaşılan yanıtta da string'dir.

```json
{
  "version": "1.0",
  "statusCode": 200,
  "result": {
    "autoCompleteItems": [
      {
        "autoCompleteLists": [{
          "id": "<COMPANY_ID>",
          "name": "Örnek şirket",
          "image": "",
          "count": "33",
          "searchType": "ExactMatch",
          "profileId": "<PROFILE_ID>",
          "type": 1
        }],
        "category": "Firma Adı"
      },
      {
        "autoCompleteLists": [{
          "id": "<POSITION_ID>",
          "name": "Örnek pozisyon",
          "image": "",
          "count": "13",
          "searchType": "ExactMatch",
          "profileId": 0,
          "type": 3
        }],
        "category": "Pozisyon"
      }
    ]
  }
}
```

### Yanıtta gözlenen alanlar

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `version` | String; örnekte `1.0` |
| `statusCode` | Sayı; gövdede `200`; HTTP durum kodu ayrıca paylaşılmadı |
| `result.autoCompleteItems` | Dizi; kategori grupları |
| `autoCompleteItems[].category` | String; örnekte `Firma Adı` ve `Pozisyon` |
| `autoCompleteItems[].autoCompleteLists` | Dizi; kategoriye ait öneriler |
| `autoCompleteLists[].id`, `.name` | String; sonuç kimliği ve adı |
| `autoCompleteLists[].image` | String; örnekte boş, dolu değer yapısı doğrulanmadı |
| `autoCompleteLists[].count` | String; sonuçla ilişkili sayı; açık ilan sayısı olduğu bu endpoint için doğrulanmadı |
| `autoCompleteLists[].searchType` | String; örnekte `ExactMatch`; eşleşme kuralları bilinmiyor |
| `autoCompleteLists[].profileId` | Sayı; profil kimliği, `0` da gözlendi |
| `autoCompleteLists[].type` | Sayı; firma grubunda `1` ve `2`, pozisyon grubunda `3` gözlendi; kodların kesin anlamları doğrulanmadı |

Bu GET endpoint'i, önceki `POST /Search/autocomplete` endpoint'inden farklı bir host, parametre aktarımı ve yanıt yapısı kullanır. POST yanıtındaki `data.companies`/`data.positions` yerine burada `result.autoCompleteItems[].autoCompleteLists` vardır; tür kodları sayısaldır ve `count` string'dir. Paylaşılan örneklerde `sourceType` ve anahtar kelime de farklı olduğundan sonuç farkları yalnız endpoint farkına bağlanamaz. Sayısal `statusCode: 200` mevcut `/job` kodunun beklediği `Success` string'iyle uyumlu değildir. Başarısız/boş yanıtlar, alan zorunlulukları, HTTP durumları ve rate-limit davranışı bilinmiyor.

## İlan arama — `POST /search`

**Kaynak:** Kullanıcının paylaştığı URL, POST yöntemi, istek gövdesi ve JSON yanıt dosyası. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatesearchapigateway.kariyer.net/search`

Kullanıcının profil sayfası araması için paylaştığı kimlik doğrulama başlığı:

```http
Authorization: Bearer <TOKEN>
```

Ek başlıklar ve cookie gereksinimi doğrulanmadı; önceki arama örneklerinin başlıkları paylaşılmamıştı.

### Anonimleştirilmiş istek gövdesi

`memberId` paylaşılan istekte sayıdır; gerçek aday kimliği yerine string yer tutucu kullanılmıştır.

```json
{"memberId":"<MEMBER_ID>","currentPage":1,"size":50,"keyword":"yazılım","calculateHiddenJobCount":true}
```

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `memberId` | Sayı; üye kimliği. Zorunluluğu ve kimlik doğrulamayla ilişkisi doğrulanmadı. |
| `currentPage` | Sayı; istenen sayfa, örnekte `1`; diğer sayfaların davranışı doğrulanmadı |
| `size` | Sayı; istenen sayfa boyutu, örnekte `50`; sınırlar bilinmiyor |
| `keyword` | String; arama metni, örnekte `yazılım` |
| `calculateHiddenJobCount` | Boolean; gizli ilan sayısının hesaplanmasını isteyen bayrak olarak yorumlandı |

### Çok sayıda filtre seçilerek oluşturulan istek

**Kaynak:** Kullanıcının arayüzde çok sayıda seçenek işaretleyerek paylaştığı ikinci `/search` gövdesi. Kullanıcı sektör ve eğitim gibi listelerde tüm seçenekleri seçmediğini belirtti; aşağıdaki kodlar eksiksiz seçenek kataloğu değildir. Bu isteğin yanıtı henüz paylaşılmadı; aşağıdaki yanıt örneği önceki, yalnız anahtar kelime içeren isteğe aittir.

`memberId` anonimleştirilmiştir. Filtre kodları, aday/ilan kimliği değil seçenek değerleri olduklarından paylaşılan biçimleriyle korunmuştur.

```json
{
  "memberId": "<MEMBER_ID>",
  "currentPage": 1,
  "size": 50,
  "keyword": "yazılım",
  "workModels": ["0", "1", "2"],
  "jobProperties": ["1", "2", "3", "4", "5"],
  "sectors": ["001000000", "002000000", "040000000"],
  "positionLevels": ["1", "2", "3"],
  "departments": ["1", "2", "3"],
  "workTypes": ["1", "2", "4", "5"],
  "educationLevels": ["DM", "DO", "MM", "MO"],
  "positions": ["1327", "1603", "1351"],
  "companyProperties": ["1", "2"],
  "date": ["4", "7"],
  "language": ["1", "2"],
  "handicappedStatus": "30",
  "dontShowAppliedJobs": true,
  "dontShowInspectedJobs": true,
  "isEasyApply": true,
  "workExperience": {"type": 1},
  "location": {
    "cities": ["998", "34", "82"],
    "districts": ["5785", "434", "437"]
  },
  "calculateHiddenJobCount": true
}
```

| Ek alan | Gözlenen tür / açıklama |
| --- | --- |
| `workModels` | String dizisi; önceki filtre yanıtında `0` = İş Yerinde, `1` = Uzaktan / Remote, `2` = Hibrit olarak gözlendi |
| `jobProperties`, `companyProperties` | String dizisi; ilan ve şirket özellik kodları |
| `sectors`, `positionLevels`, `departments` | String dizisi; sektör, pozisyon seviyesi ve departman kodları |
| `workTypes`, `educationLevels`, `positions` | String dizisi; çalışma türü, eğitim seviyesi ve pozisyon kodları |
| `date`, `language` | String dizisi; tarih ve dil filtre kodları; sayısal görünen kodlar gün sayısı veya dil adı olarak varsayılmamalı |
| `handicappedStatus` | String; örnekte `30`; engellilik filtresi kodunun anlamı doğrulanmadı |
| `dontShowAppliedJobs` | Boolean; başvurulmuş ilanları gizleme bayrağı olarak yorumlandı |
| `dontShowInspectedJobs` | Boolean; incelenmiş ilanları gizleme bayrağı olarak yorumlandı |
| `isEasyApply` | Boolean; kolay başvuru filtresi olarak yorumlandı |
| `workExperience.type` | Sayı; örnekte `1`; deneyim filtresi kodunun anlamı bilinmiyor. Kaydedilmiş arama yanıtında görülen string `All` ile aynı türde değildir. |
| `location.cities`, `location.districts` | String dizisi; şehir ve ilçe seçenek kimlikleri; özel konum seçeneklerinin anlamları doğrulanmadı |

#### İstanbul konum kodları

Kullanıcının konum seçeneklerine ilişkin açıklaması:

| `location.cities` kodu | Anlam / doğrulama durumu |
| --- | --- |
| `34` | İstanbul Avrupa yakası; önceki arama yanıtında `İstanbul(Avr.)` etiketiyle de gözlendi |
| `82` | İstanbul Asya yakası; önceki arama yanıtında `İstanbul(Asya)` etiketiyle de gözlendi |
| `998` | Tüm İstanbul; kullanıcının açıklamasıyla netleştirildi |

Alan adları ve türleri bu istek gövdesinde gözlenmiştir. Kod/ad eşleştirmeleri için yanıtın `filters` seçenekleri kullanılabilir; eşleştirme görülmeden kod anlamı tahmin edilmemelidir. Aynı filtre içindeki seçeneklerin ve farklı filtrelerin AND/OR birleşme kuralları, boş dizi ile alanın gönderilmemesi arasındaki fark ve tüm seçeneklerin seçilmesinin filtreyi kaldırıp kaldırmadığı doğrulanmadı.

### Anonimleştirilmiş ve kısaltılmış yanıt örneği

Paylaşılan yanıtta `jobs.items` içinde 53 ilan bulunuyor; üçünde `isSponsored: true`. Toplam sayılar `1139` ve sponsorlar hariç `1136` olarak dönüyor. `size: 50` ile 53 sonuç gözlenmesi, bu örnekte sponsorların ek sonuçlar olarak döndüğünü düşündürüyor; bu davranışın genel garantisi doğrulanmadı.

Aşağıda tek ilan ve yanıt alanlarının bir bölümü gösterilmiştir. Gerçek kimlikler, şirket/pozisyon adları ve bağlantılar değiştirilmiştir. Sayısal kimlikler yer tutucu için string gösterilir. Toplam sayılar paylaşılan yanıttan korunmuştur; kısaltılmış `items` dizisinin uzunluğunu temsil etmez.

```json
{
  "statusCode": "Success",
  "status": "Success",
  "data": {
    "totalJobCount": 1139,
    "totalJobCountWithOutSponsored": 1136,
    "title": "İş İlanları - Güncel İş Fırsatları",
    "jobs": {
      "items": [{
        "id": "<JOB_ID>",
        "title": "Örnek pozisyon",
        "companyName": "Örnek şirket",
        "jobUrl": "/is-ilani/<JOB_SLUG>",
        "companyUrl": "/firma-profil/<COMPANY_SLUG>",
        "companyId": "<COMPANY_ID>",
        "profileId": "<PROFILE_ID>",
        "locationText": "Örnek şehir",
        "workType": "FullTime",
        "workTypeText": "Tam Zamanlı",
        "workModel": "OnSite",
        "isSponsored": true,
        "isRealSponsored": true,
        "isEasyApply": true,
        "memberJobStatus": "Default",
        "sectors": [],
        "locations": [],
        "chips": [],
        "appliedDetail": null,
        "redirectedInformation": null
      }],
      "companyItems": [],
      "companyProfileItems": [],
      "currentPage": 1
    },
    "jobSortType": "SmartSort",
    "searchUrl": "/is-ilanlari#&kw=yazılım",
    "locationText": "",
    "blueCollarJobs": {"items": [], "total": 0},
    "isSearched": true,
    "currentPage": 1,
    "hiddenJobCount": 0,
    "moduleTitleInfo": {"title": "Öne Çıkan İlanlar", "subText": ""},
    "isRecommendationFromJobPreferences": false
  },
  "message": null,
  "error": null
}
```

### Yanıtta gözlenen alanlar

Alan açıklamaları paylaşılan örnek ve alan adlarından yorumlanmıştır; zorunlulukları doğrulanmadı.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `statusCode`, `status` | String; her ikisi de `Success` |
| `data.breadCrumb.items[]` | Nesne; string `text` ve `url` alanlarıyla gezinme bağlantıları |
| `data.totalJobCount`, `data.totalJobCountWithOutSponsored` | Sayı; toplam ilan ve sponsorlar hariç toplam olarak yorumlandı; `WithOut` yazımı yanıtla aynıdır |
| `data.title` | String; sonuç sayfasının başlığı |
| `data.jobs.items` | Dizi; ilan sonuçları |
| `data.jobs.companyItems`, `.companyProfileItems` | Dizi; örnekte boş, eleman yapıları bilinmiyor |
| `data.currentPage`, `data.jobs.currentPage` | Sayı; her ikisi de örnekte `1` |
| `data.filters` | Nesne; filtre seçenekleri, sayıları, konum ve sıralama bilgileri |
| `data.jobSortType` | String; örnekte `SmartSort` |
| `data.jobSeo` | Nesne; arama başlıkları, meta açıklamalar, canonical/önceki/sonraki sayfa bağlantıları ve içerik alanları |
| `data.searchUrl`, `data.locationText` | String; arama sayfası yolu ve konum açıklaması; konum örnekte boş |
| `data.blueCollarJobs` | Nesne; `items` dizisi ve sayısal `total`, örnekte boş dizi ve `0` |
| `data.isSearched` | Boolean; arama yapılma bayrağı olarak yorumlandı |
| `data.noScriptUrls` | Nesne; `noScriptUrlResponse`, `text`, `noScriptUrlLinks` alanlarıyla alternatif bağlantı bilgileri |
| `data.suggestions` | Dizi; filtre önerileri; örnekte konum önerisi bulunuyor |
| `data.hiddenJobCount` | Sayı; gizli ilan sayısı olarak yorumlandı, örnekte `0`; gizleme koşulları bilinmiyor |
| `data.moduleTitleInfo` | Nesne; string `title` ve `subText` |
| `data.isRecommendationFromJobPreferences` | Boolean; iş tercihlerinden öneri üretimiyle ilgili bayrak olarak yorumlandı |
| `message`, `error` | Örnekte null; hata durumundaki türler bilinmiyor |

`jobs.items[]` ilan alanları, yukarıdaki ilan detay önerileri bölümünde belgelenen başlık, şirket, logo, konum, çalışma modeli, tarihler, aday etkileşimi, sponsorluk, sektör, pozisyon ve yönlendirme alanlarını da içeriyor. Bu arama örneğinde `jobRecommendationModel` null veya string olarak gözlendi; öneri endpoint'i örneğinde yalnız null görülmüştü. `sectors`, `locations` ve `chips` dizi olarak döner; boş olabilir. `redirectedInformation` bu örnekte null'dır.

`filters` içinde sektör, pozisyon seviyesi, departman, çalışma alanı/türü/modeli, eğitim, şirket/ilan özellikleri, pozisyon, dil, engellilik, tarih, deneyim ve konum grupları ile sıralama alanları bulunuyor. `suggestions[]` içinde `title`, `suggestionType`, `suggestionSubType`, gösterim kurallarını taşıyan `rules` ve `items` alanları var; öneri elemanlarında `id`, `name`, `count`, `filterType`, `title`, `url` görülüyor. Bu yanıt alanları tek başına ek istek filtrelerinin kabul edildiğini doğrulamaz.

Yanıt `data.jobs.items` üzerinden ayrıştırılmalıdır; mevcut `/job` ayrıştırıcısıyla uyumlu değildir. Arama eşleşme kuralları, sayfalama garantileri, başlıksız/oturumsuz erişim, başarısız/boş yanıtlar, HTTP durumları ve rate-limit davranışı doğrulanmadı.

### Profil sayfasından “Sana Uygun İlanlar” araması

**Kaynak:** Kullanıcının aynı `POST /search` endpoint'i için paylaştığı Bearer token bilgisi, yeni gövde ve ayrı JSON yanıt dosyası. `memberId` anonimleştirilmiştir; paylaşılan istekte sayıdır.

```json
{
  "jobProperties": ["1"],
  "currentPage": 1,
  "memberId": "<MEMBER_ID>",
  "isSearchFromProfilePage": true,
  "size": 12,
  "dontShowAppliedJobs": true,
  "dontAddLog": true
}
```

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `jobProperties` | String dizisi; bu yanıttaki `filters.jobProperties.items` içinde `1` = `Sana Uygun İlanlar` seçili olarak dönüyor |
| `isSearchFromProfilePage` | Boolean; profil sayfasından arama bayrağı olarak yorumlandı |
| `dontShowAppliedJobs` | Boolean; başvurulmuş ilanları gizleme bayrağı olarak yorumlandı |
| `dontAddLog` | Boolean; arama kaydı eklememe bayrağı olarak yorumlandı; sunucudaki kayıt davranışı ayrıca doğrulanmadı |
| `currentPage`, `size`, `memberId` | Sayı; sayfa, istenen sonuç sayısı ve üye kimliği |

Bu gövdede `keyword` yoktur. Yanıt yine yukarıda belgelenen `data.jobs.items` ve filtre/meta alanlarını kullanır. Kimlik veya şirket bilgisi içermeyen yanıt özeti:

| Yanıt alanı / ölçüm | Gözlenen değer |
| --- | --- |
| `statusCode`, `status` | `Success` |
| `data.totalJobCount`, `data.totalJobCountWithOutSponsored` | Her ikisi de `177` |
| `data.jobs.items` uzunluğu | `12` |
| `isSponsored: true` olan ilan sayısı | `0` |
| `data.currentPage`, `data.jobs.currentPage` | Her ikisi de `1` |
| `data.jobSortType` | `SmartSort` |
| `data.hiddenJobCount` | `0` |
| `data.isSearched` | `false` |
| `data.isRecommendationFromJobPreferences` | `false` |
| `message`, `error` | null |

İlan sonuçları bulunmasına rağmen `isSearched: false` dönüyor; bu bayrak tek başına boş sonuç veya başarısız istek göstergesi olarak kullanılmamalıdır. `Sana Uygun İlanlar` filtresi seçiliyken `isRecommendationFromJobPreferences: false` gözlendiğinden bu iki alan eşdeğer kabul edilmemelidir.

Bu yanıtın `filters.jobProperties.items` seçenekleri:

| Kod | Etiket |
| --- | --- |
| `1` | Sana Uygun İlanlar |
| `2` | Kaydettiğin İlanlar |
| `3` | Takip Ettiğin Şirketin İlanları |
| `4` | İncelediğin İlanlar |
| `5` | Başvurduğum İlanlar |

Bu kod/ad eşleştirmeleri paylaşılan yanıtta doğrudan gözlendi. Bu örneğin toplamları önceki anahtar kelimeli veya çok filtreli aramanın sonucu değildir.

## İlgili aramalar — `POST /Search/relatedsearch`

**Kaynak:** Kullanıcının paylaştığı URL, POST yöntemi, istek gövdesi ve JSON yanıtı. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatesearchapigateway.kariyer.net/Search/relatedsearch`

URL'deki büyük/küçük harfler paylaşılan örnekle aynıdır. Başlıklar paylaşılmadı; kimlik doğrulama ve cookie gereksinimleri bilinmiyor.

### İstek gövdesi

```json
{"keyword":"yazılım"}
```

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `keyword` | String; ilgili aramaların istendiği arama metni. Zorunluluğu ve uzunluk sınırları doğrulanmadı. |

### Paylaşılan yanıt örneği

Örnek kişisel bilgi veya ilan/aday kimliği içermediğinden paylaşılan değerler korunmuştur.

```json
{
  "statusCode": "Success",
  "status": "Success",
  "data": {
    "relatedSearch": [
      "bilgisayar mühendisi",
      "asp.net",
      "it",
      "yazılım destek",
      "junior software developer"
    ]
  },
  "message": null,
  "error": null
}
```

### Yanıtta gözlenen alanlar

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `statusCode`, `status` | String; her ikisi de `Success` |
| `data.relatedSearch` | String dizisi; ilgili arama ifadeleri, örnekte beş sonuç |
| `message`, `error` | Örnekte null; hata durumundaki türleri bilinmiyor |

Sonuçlar şirket/pozisyon kimliği veya ilan sayısı içermiyor. Öneri algoritması, sıralama kuralları ve sonuç sayısının her zaman beş olup olmadığı doğrulanmadı. Alanların zorunluluğu, boş/başarısız yanıtlar, HTTP durum kodları ve rate-limit davranışı bilinmiyor. Yanıt mevcut `/job` ayrıştırıcısıyla uyumlu değildir.

## Özgeçmiş listesi — `/jb/api/candidates/resumes`

**Kaynak:** Kullanıcının paylaştığı URL, JSON yanıtı ve Bearer token bilgisi. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

**Adres:** `https://candidatewebapigw.kariyer.net/jb/api/candidates/resumes?skip=0&size=8`

```http
Authorization: Bearer <TOKEN>
```

HTTP yöntemi paylaşılmadı. İstek gövdesi, ek başlıklar ve cookie gereksinimi doğrulanmadı.

| Query parametresi | Paylaşılan değer / açıklama |
| --- | --- |
| `skip` | `0`; atlanacak kayıt sayısı olarak yorumlandı; sayfalama davranışı doğrulanmadı |
| `size` | `8`; istenen kayıt sayısı olarak yorumlandı; kabul edilen sınırlar bilinmiyor |

### Anonimleştirilmiş ve kısaltılmış yanıt örneği

Paylaşılan yanıtta iki özgeçmiş ve `totalCount: 2` bulunuyor. Aşağıda tek kayıt gösterilmiştir; toplam sayı örnek için `1` yapılmıştır. CV adı, şifrelenmiş kimliği, tarihler ve görüntülenme sayıları değiştirilmiştir.

```json
{
  "version": "1.0",
  "statusCode": 200,
  "result": {
    "resumeList": [{
      "encryptedId": "<REDACTED>",
      "resumeName": "Örnek CV",
      "lastUpdateDate": "2024-01-02T12:00:00",
      "creationDate": "2024-01-01T00:00:00",
      "publicResumeUrl": "",
      "status": 1,
      "language": 1,
      "isExecutive": false,
      "totalViewCount": 0,
      "totalViewedCompanies": 0,
      "missingFields": [],
      "missingFieldsTooltipMessage": "",
      "missingFieldItems": [],
      "missingAreas": [],
      "defaultCv": 1,
      "occupancyRatio": "100",
      "isSharedUriAccess": false,
      "isCompanyAccess": true,
      "statusDescription": "Tüm kariyer.net firmaları",
      "hasReverseContact": false,
      "reverseContactType": [],
      "isAnonymized": false
    }],
    "totalCount": 1
  }
}
```

### Yanıtta gözlenen alanlar

CV alanları `result.resumeList[]` altındadır. Açıklamalar alan adları ve paylaşılan örneğe dayanır; zorunlulukları ve kodların diğer değerleri doğrulanmadı.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `version` | String; örnekte `1.0` |
| `statusCode` | Sayı; gövdede `200`; HTTP durum kodu ayrıca paylaşılmadı |
| `result.resumeList`, `result.totalCount` | Dizi / sayı; özgeçmişler ve toplam kayıt sayısı olarak yorumlandı |
| `encryptedId`, `resumeName` | String; kodlanmış/şifrelenmiş özgeçmiş kimliği ve adı |
| `lastUpdateDate`, `creationDate` | String; son güncelleme ve oluşturulma tarihleri; örnekte `YYYY-MM-DDTHH:mm:ss`, saat dilimi belirtilmemiş |
| `publicResumeUrl` | String; herkese açık CV bağlantısı olarak yorumlandı, örnekte boş |
| `status`, `language` | Sayı; durum ve dil kodları, örnekte her ikisi de `1`; kod anlamları doğrulanmadı |
| `isExecutive` | Boolean; yönetici özgeçmişi bayrağı olarak yorumlandı |
| `totalViewCount`, `totalViewedCompanies` | Sayı; toplam görüntülenme ve görüntüleyen şirket sayıları olarak yorumlandı; tekrarların sayılma kuralları bilinmiyor |
| `missingFields`, `missingFieldItems`, `missingAreas` | Dizi; eksik alan/bölüm bilgileri olarak yorumlandı, örnekte boş; eleman yapıları bilinmiyor |
| `missingFieldsTooltipMessage` | String; eksik alan açıklaması olarak yorumlandı, örnekte boş |
| `defaultCv` | Sayı; varsayılan CV göstergesi olarak yorumlandı; paylaşılan iki kayıtta `1` ve `0` gözlendi |
| `occupancyRatio` | String; profil/CV doluluk oranı olarak yorumlandı, örnekte `100` |
| `isSharedUriAccess`, `isCompanyAccess` | Boolean; paylaşım bağlantısı ve şirket erişimi bayrakları olarak yorumlandı |
| `statusDescription` | String; erişim/durum açıklaması, örnekte `Tüm kariyer.net firmaları` |
| `hasReverseContact`, `reverseContactType` | Boolean / dizi; ters iletişim özelliğiyle ilişkili alanlar; kesin anlamları ve dizi eleman türü bilinmiyor |
| `isAnonymized` | Boolean; CV'nin anonimleştirilme bayrağı olarak yorumlandı |

Yanıt `result.resumeList` üzerinden ayrıştırılmalıdır. Sayısal `statusCode: 200` ve özgeçmiş listesi mevcut `/job` ayrıştırıcısıyla uyumlu değildir. Sayfalama garantileri, boş/başarısız yanıtlar, HTTP durumları ve rate-limit davranışı doğrulanmadı.

## Özgeçmiş detayı — `GET /jb/api/candidates/resume`

**Kaynak:** Kullanıcının paylaştığı URL, GET/Bearer bilgisi ve JSON yanıtı. Canlı istek yeniden çalıştırılmadı.

```http
GET https://candidatewebapigw.kariyer.net/jb/api/candidates/resume?resumeId=<URL_ENCODED_RESUME_ID>
Authorization: Bearer <SESSION_TOKEN>
```

`resumeId` zorunlu string parametredir; özgeçmiş listesindeki `encryptedId` değerinden alınır. `get_resumes` bu değeri `resumeId` adıyla döndürür. Kimlik URL'ye `URLSearchParams` ile eklenir; `+`, `/`, `=` gibi karakterler kodlanır. Gerçek aday kimliği kaynak koda sabitlenmez. Tool şeması 1–512 karakter ve kimlikte kullanılan harf, sayı, `+`, `/`, `=`, `_`, `!`, `-` karakterlerini kabul eder; bunlar yerel doğrulama sınırlarıdır.

Anonimleştirilmiş, kısaltılmış yanıt örneği:

```json
{
  "version": "1.0",
  "statusCode": 200,
  "result": {
    "resumeId": "<REDACTED>",
    "name": "Örnek",
    "surname": "Aday",
    "title": "Örnek CV",
    "email": "aday@example.com",
    "summary": "Örnek özgeçmiş özeti"
  }
}
```

Detay `result` altındadır. Paylaşılan örnekte iletişim ve konum alanları; `generalResumeInformation`, `contactInformation`, `jobExperienceInformation`, `educationInformation`, `foreignLanguageInformation`, `computerSkillsInformation`, `certificateInformation`, `examInformation`, `qualificationsInformation`, `seminarAndCourseInfomation`, `scholarshipsAndProjectsInformation`, `referencesInformation`, `projectsInformation` ve diğer CV bölümleri bulunur. Alanların zorunluluğu ve tüm kod değerleri doğrulanmadı. Büyük CV yanıtları mevcut tool bütçesiyle kısaltılabilir; bu durumda `truncated: true` döner.

Bearer başlığı mevcut oturum yakalama mekanizmasından alınır. Eksik/geçersiz oturum `AUTH_REQUIRED` döndürür. Boş/başarısız API yanıtları ve rate-limit davranışı canlı olarak doğrulanmadı.

## Özgeçmiş görüntülenmeleri — `GET /jb/api/candidates/resumes/view`

**Kaynak:** Kullanıcının paylaştığı URL, GET yöntemi, Bearer token bilgisi ve JSON yanıt dosyası. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

```http
GET https://candidatewebapigw.kariyer.net/jb/api/candidates/resumes/view?skip=0&size=8&ClientType=1
Authorization: Bearer <TOKEN>
```

Ek başlıklar ve cookie gereksinimi doğrulanmadı. İstek gövdesi paylaşılmadı. `ClientType` bu örnekte query parametresidir; başlık olarak paylaşılmamıştır.

| Query parametresi | Paylaşılan değer / açıklama |
| --- | --- |
| `skip` | `0`; atlanacak kayıt sayısı olarak yorumlandı; hangi listeye uygulandığı doğrulanmadı |
| `size` | `8`; istenen kayıt sayısı olarak yorumlandı; CV gruplarına mı görüntülenme kayıtlarına mı uygulandığı bilinmiyor |
| `ClientType` | `1`; istemci türü kodu; diğer değerler ve anlamları bilinmiyor |

### Anonimleştirilmiş ve kısaltılmış yanıt örneği

Yanıtın `result` alanı iki CV grubu içeren bir dizidir. İlk grupta `totalCount: 5` ve beş görüntülenme kaydı, ikinci grupta `totalCount: 3` ve üç kayıt bulunuyor. Kayıtların `viewCount` toplamları sırasıyla altı ve dörttür; `totalCount` toplam görüntülenme sayısıyla aynı değildir.

Aşağıdaki örnek tek CV ve tek kayda indirgenmiş, `totalCount` örnek için `1` yapılmıştır. CV/şirket/ilan kimlikleri, adlar, bağlantılar ve tarihler anonimleştirilmiştir. Sayısal kimlikler yer tutucu için string gösterilir.

```json
{
  "version": "1.0",
  "statusCode": 200,
  "result": [{
    "totalCount": 1,
    "resumeId": "<REDACTED>",
    "resumeViewList": [{
      "companyId": "<REDACTED>",
      "companyName": "Örnek şirket",
      "companyUrl": "firma-profil/<COMPANY_SLUG>",
      "clientJobRefNo": "<REDACTED>",
      "jobName": "Örnek pozisyon",
      "jobUrl": "/is-ilani/<JOB_SLUG>",
      "jobActive": false,
      "viewDate": "02 Ocak 2024",
      "viewLogo": "",
      "viewForAvt": false,
      "viewCount": 1,
      "jobId": "<JOB_ID>",
      "companyIdDecrypted": "<COMPANY_ID>",
      "companyProfileId": "<PROFILE_ID>",
      "resumeName": "Örnek CV",
      "viewDateTime": "2024-01-02T15:00:00.183"
    }]
  }]
}
```

### Yanıtta gözlenen alanlar

Görüntülenme alanları `result[].resumeViewList[]` altındadır. Açıklamalar alan adları ve paylaşılan örneğe dayanır; zorunlulukları doğrulanmadı.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `version`, `statusCode` | String / sayı; örnekte `1.0` ve `200`; HTTP durum kodu ayrıca paylaşılmadı |
| `result` | Dizi; CV bazında görüntülenme grupları |
| `result[].totalCount` | Sayı; CV grubundaki toplam kayıt sayısı olarak yorumlandı; tekil şirket sayısı olduğu doğrulanmadı |
| `result[].resumeId` | String; kodlanmış/şifrelenmiş CV kimliği |
| `result[].resumeViewList` | Dizi; görüntülenme kayıtları |
| `companyId`, `clientJobRefNo` | String; kodlanmış/şifrelenmiş şirket kimliği ve ilan referansı olarak yorumlandı |
| `companyName`, `jobName`, `resumeName` | String; şirket, ilan/pozisyon ve CV adları |
| `companyUrl`, `jobUrl` | String; göreli bağlantılar; şirket yolunda başlangıç `/` yok, ilan yolunda var |
| `jobActive` | Boolean; ilan etkinliği bayrağı olarak yorumlandı |
| `viewDate` | String; Türkçe görüntülenme tarihi açıklaması |
| `viewDateTime` | String; örnekte kesirli saniye içeren tarih/saat; saat dilimi belirtilmemiş |
| `viewLogo` | String; şirket logo adresi olarak yorumlandı; boş olabilir |
| `viewForAvt` | Boolean; kullanım amacı doğrulanmadı |
| `viewCount` | Sayı; kayıtla ilişkili görüntülenme sayısı; `1` ve `2` gözlendi |
| `jobId`, `companyIdDecrypted`, `companyProfileId` | Sayı; ilan, açık şirket ve profil kimlikleri |

Gruplama ve tekrar görüntülemeleri birleştirme kuralları, sıralama garantisi ve sayfalama kapsamı doğrulanmadı. Özgeçmiş görüntülenmesi mülakat veya kabul anlamına gelmez. Bu endpoint'in `result` dizisi, özgeçmiş listesi endpoint'indeki `result.resumeList` nesnesinden farklıdır ve mevcut `/job` ayrıştırıcısıyla uyumlu değildir. Boş/başarısız yanıtlar, HTTP durumları ve rate-limit davranışı bilinmiyor.

## Ön yazı listesi — `GET /coverletters`

**Kaynak:** Kullanıcının paylaştığı URL, GET yöntemi, Bearer token bilgisi ve JSON yanıtı. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

```http
GET https://candidatewebapigw.kariyer.net/coverletters?index=0&size=10
Authorization: Bearer <TOKEN>
```

Ek başlıklar ve cookie gereksinimi doğrulanmadı. İstek gövdesi paylaşılmadı.

| Query parametresi | Paylaşılan değer / açıklama |
| --- | --- |
| `index` | `0`; sayfa indeksi olarak yorumlandı; yanıtta `pageIndex: 0` ve `indexFrom: 0` gözlendi |
| `size` | `10`; sayfa boyutu olarak yorumlandı; yanıtta `pageSize: 10` gözlendi; kabul edilen sınırlar bilinmiyor |

### Anonimleştirilmiş ve kısaltılmış yanıt örneği

Paylaşılan yanıtta on ön yazı, `totalCount: 10` ve `totalPages: 1` bulunuyor. Aşağıdaki örnek tek kayda indirgenmiş, `totalCount` örnek için `1` yapılmıştır. İstek takip kimliği, sunucu adı, ön yazı kimliği, adı, içeriği ve tarihleri değiştirilmiştir. Ön yazı `id` alanı paylaşılan yanıtta sayıdır; yer tutucu için string gösterilir.

```json
{
  "header": {
    "globalId": "<REQUEST_ID>",
    "isSuccess": true,
    "message": null,
    "responseCode": 0,
    "hostDateTime": "0001-01-01T00:00:00",
    "languageId": null,
    "machineName": "<SERVER_NAME>"
  },
  "body": {
    "pageIndex": 0,
    "pageSize": 10,
    "totalCount": 1,
    "totalPages": 1,
    "indexFrom": 0,
    "items": [{
      "id": "<COVER_LETTER_ID>",
      "name": "Örnek ön yazı",
      "content": "Merhaba, örnek başvuru metni.",
      "createDate": "2024-01-01T12:00:00",
      "lastModifyDate": "2024-01-02T12:00:00"
    }],
    "hasPreviousPage": false,
    "hasNextPage": false
  }
}
```

### Yanıtta gözlenen alanlar

Alan açıklamaları paylaşılan örnek ve alan adlarından yorumlanmıştır; zorunlulukları ve diğer olası değerleri doğrulanmadı.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `header.globalId` | String; istek takip kimliği olarak yorumlandı |
| `header.isSuccess` | Boolean; yanıtın başarı bayrağı |
| `header.message`, `header.languageId` | Örnekte null; diğer değerlerin türleri bilinmiyor |
| `header.responseCode` | Sayı; örnekte `0`, kod sözleşmesi doğrulanmadı |
| `header.hostDateTime` | String; örnekte `0001-01-01T00:00:00`; gerçek işlem zamanı olarak kabul edilmemeli |
| `header.machineName` | String; yanıtı üreten sunucunun adı olarak yorumlandı |
| `body.pageIndex`, `body.pageSize` | Sayı; sayfa indeksi ve boyutu |
| `body.totalCount`, `body.totalPages` | Sayı; toplam ön yazı ve sayfa sayıları olarak yorumlandı |
| `body.indexFrom` | Sayı; indeks başlangıcı olarak yorumlandı, örnekte `0` |
| `body.items` | Dizi; ön yazı kayıtları |
| `body.items[].id`, `.name` | Sayı / string; ön yazı kimliği ve adı |
| `body.items[].content` | String; ön yazı içeriği veya liste özeti; tam metin olduğu doğrulanmadı |
| `body.items[].createDate`, `.lastModifyDate` | String; oluşturulma ve son değişiklik tarihleri, örnekte `YYYY-MM-DDTHH:mm:ss`; saat dilimi belirtilmemiş |
| `body.hasPreviousPage`, `body.hasNextPage` | Boolean; önceki/sonraki sayfa varlığı |

Paylaşılan `content` değerleri cümle veya kelime ortasında bitiyor; liste endpoint'i kısaltılmış içerik döndürüyor olabilir. Bunlar tam ön yazı olarak kabul edilmemelidir; kesme kuralı ve tam metnin alınacağı endpoint henüz doğrulanmadı. Yanıt `body.items` üzerinden ayrıştırılmalıdır ve mevcut `/job` ayrıştırıcısıyla uyumlu değildir. Sayfalama davranışı, boş/başarısız yanıtlar, HTTP durumları ve rate-limit davranışı bilinmiyor.

## Takip edilen şirketler — `GET /Search/my-followed-companies`

**Kaynak:** Kullanıcının paylaştığı URL, GET yöntemi, Bearer token bilgisi ve JSON yanıt dosyası. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi.

```http
GET https://candidatesearchapigateway.kariyer.net/Search/my-followed-companies
Authorization: Bearer <TOKEN>
```

Paylaşılan URL'de query parametresi yoktur. İstek gövdesi paylaşılmadı; ek başlıklar ve cookie gereksinimi doğrulanmadı.

### Anonimleştirilmiş ve kısaltılmış yanıt örneği

Paylaşılan `data` dizisinde altı şirket bulunuyor. Aşağıda tek kayıt gösterilmiştir; şirket adı, kimlikleri, logo/profil bağlantıları ve sektör bilgileri değiştirilmiştir. `profileId` paylaşılan yanıtta sayıdır; yer tutucu için string gösterilir. `id` paylaşılan tüm kayıtlarda null'dır.

```json
{
  "statusCode": "Success",
  "status": "Success",
  "data": [{
    "id": null,
    "name": "Örnek şirket",
    "companyId": "<COMPANY_ID>",
    "profileId": "<PROFILE_ID>",
    "occurrence": 0,
    "type": "Company",
    "logo": "<LOGO_URL>",
    "sectors": [{"id": "<SECTOR_ID>", "name": "Örnek sektör"}],
    "companyUrl": "/firma-profil/<COMPANY_SLUG>",
    "isFollowed": true,
    "isAmbargoed": false
  }],
  "message": null,
  "error": null
}
```

### Yanıtta gözlenen alanlar

Alan açıklamaları paylaşılan örnek ve alan adlarından yorumlanmıştır; zorunlulukları doğrulanmadı. `isAmbargoed` yazımı yanıtla aynıdır.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `statusCode`, `status` | String; örnekte `Success` |
| `data` | Dizi; takip edilen şirketler |
| `data[].id` | Örnekte null; şirket kimliği olarak kullanılmamalı |
| `data[].name`, `.companyId` | String; şirket adı ve kimliği |
| `data[].profileId` | Sayı; şirket profil kimliği |
| `data[].occurrence` | Sayı; `/Search/company` için açıklanan açık ilan sayısıyla aynı alan adı kullanılıyor; bu endpoint'teki anlamı ayrıca doğrulanmadı |
| `data[].type` | String; örnekte `Company` |
| `data[].logo`, `.companyUrl` | String; logo adresi ve göreli şirket profil yolu |
| `data[].sectors` | Dizi; string `id` ve `name` içeren sektör nesneleri |
| `data[].isFollowed` | Boolean; takip durumu |
| `data[].isAmbargoed` | Boolean; şirket kısıtlamasıyla ilgili bayrak olarak yorumlandı |
| `message`, `error` | Örnekte null; hata durumundaki türleri bilinmiyor |

Şirket kayıtları `/Search/company` yanıtına benzer; burada `id` null olduğundan kimlik için `companyId`/`profileId` alanları değerlendirilmelidir. Paylaşılan yanıtta toplam sayı veya sayfalama metadatası bulunmuyor; altı kayıt dönmesi tüm kayıtların tek istekte döneceğini garanti etmez. Yanıt mevcut `/job` ayrıştırıcısıyla uyumlu değildir. Boş/başarısız yanıtlar, HTTP durumları ve rate-limit davranışı bilinmiyor.

## Belge türleri — endpoint bilgisi bekleniyor

**Kaynak:** Kullanıcının paylaştığı JSON yanıtı. Alan değerleri belge türleri listesine işaret ediyor; URL, HTTP yöntemi ve kimlik doğrulama bilgileri henüz paylaşılmadı. Endpoint adı tahmin edilmemiştir. Canlı istek yapılmadı; çalışma koduna entegrasyon yoktur.

### Paylaşılan yanıt örneği

Kimlikler belge türü seçenek kodlarıdır; kişisel bilgi içermediğinden değerler korunmuştur.

```json
{
  "version": "1.0",
  "statusCode": 200,
  "result": [
    {"id": 1, "name": "Özgeçmiş"},
    {"id": 2, "name": "Eğitim Belgesi"},
    {"id": 3, "name": "Sunum"},
    {"id": 4, "name": "Proje/Çalışma"},
    {"id": 5, "name": "Başarı/Onur Belgesi"},
    {"id": 6, "name": "Makale"},
    {"id": 9, "name": "Portfolyo"},
    {"id": 7, "name": "Diğer"}
  ]
}
```

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `version` | String; örnekte `1.0` |
| `statusCode` | Sayı; gövdede `200`; HTTP durum kodu ayrıca paylaşılmadı |
| `result` | Dizi; sekiz belge türü seçeneği |
| `result[].id` | Sayı; belge türü kodu |
| `result[].name` | String; belge türü etiketi |

`8` kodu paylaşılan listede bulunmuyor; eksik kodlar veya ek türler varsayılmamalıdır. Bu liste dosya yükleme yöntemi, kabul edilen uzantılar veya boyut sınırları hakkında bilgi vermiyor. Alan zorunlulukları ve boş/başarısız yanıtlar bilinmiyor.

## Aday dosya listesi — `GET /jb/api/common/get-file-list`

**Kaynak:** Kullanıcının paylaştığı URL, GET yöntemi, Bearer token bilgisi ve JSON yanıtı. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi. Bu yanıt yüklenmiş dosyaları listeler; önceki belge türleri seçenek listesinden farklıdır.

```http
GET https://candidatewebapigw.kariyer.net/jb/api/common/get-file-list
Authorization: Bearer <TOKEN>
```

Paylaşılan URL'de query parametresi yoktur. İstek gövdesi paylaşılmadı; ek başlıklar ve cookie gereksinimi doğrulanmadı.

### Anonimleştirilmiş yanıt örneği

Dosya/aday kimlikleri, dosya adı, tarihler, imzalı dosya bağlantısı ve ayrıştırılmış CV kimliği değiştirilmiştir. Sayısal kimlikler yer tutucu için string gösterilir. `fileType` bir seçenek kodudur; korunmuştur.

```json
{
  "version": "1.0",
  "statusCode": 200,
  "result": [{
    "id": "<FILE_ID>",
    "candidateId": "<CANDIDATE_ID>",
    "name": "Ornek_CV.pdf",
    "fileSize": 65012.0,
    "fileType": 1,
    "fileTypeName": "Özgeçmiş",
    "relatedCvs": [],
    "creationDate": "2024-01-01T12:00:00.307",
    "lastModifyDate": "2024-01-01T12:00:15.203",
    "path": "<REDACTED_SIGNED_FILE_URL>",
    "parsedCv": "<REDACTED>"
  }]
}
```

### Yanıtta gözlenen alanlar

Alan açıklamaları paylaşılan örnek ve alan adlarından yorumlanmıştır; zorunlulukları doğrulanmadı.

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `version`, `statusCode` | String / sayı; örnekte `1.0` ve `200`; HTTP durum kodu ayrıca paylaşılmadı |
| `result` | Dizi; adayın yüklenmiş dosyaları, örnekte bir kayıt |
| `result[].id`, `.candidateId` | Sayı; dosya ve aday kimlikleri |
| `result[].name` | String; uzantıyı içeren dosya adı |
| `result[].fileSize` | Sayı; dosya boyutu, örnekte `65012.0`; birimi doğrulanmadı |
| `result[].fileType`, `.fileTypeName` | Sayı / string; dosya türü kodu ve etiketi; örnekte `1` = `Özgeçmiş`, önceki belge türleri listesiyle eşleşiyor |
| `result[].relatedCvs` | Dizi; ilişkili CV'ler olarak yorumlandı; örnekte boş, eleman yapısı bilinmiyor |
| `result[].creationDate`, `.lastModifyDate` | String; oluşturulma ve son değişiklik tarihleri, kesirli saniye içeriyor; saat dilimi belirtilmemiş |
| `result[].path` | String; `filesec` query değeri içeren imzalı/korumalı dosya bağlantısı olarak yorumlandı; geçerlilik süresi bilinmiyor |
| `result[].parsedCv` | String; kodlanmış/şifrelenmiş ayrıştırılmış CV referansı olarak yorumlandı; kesin kullanım amacı doğrulanmadı |

Yanıt `result` dizisi üzerinden ayrıştırılmalıdır; mevcut `/job` ayrıştırıcısıyla uyumlu değildir. Dosya yükleme/silme işlemleri, indirme erişim koşulları, sonuç sınırları, boş/başarısız yanıtlar, HTTP durumları ve rate-limit davranışı bu örnekten doğrulanmadı. Önceki belge türleri listesinin URL'si hâlâ paylaşılmamıştır.

## Kısıtlanan şirketler — `GET /Search/my-ambargoed-companies`

**Kaynak:** Kullanıcının paylaştığı URL, GET yöntemi, Bearer token bilgisi ve JSON yanıtı. Endpoint adı kısıtlanan/engellenen şirketler listesine işaret ediyor; kesin ürün anlamı doğrulanmadı. Canlı istek yapılmadı; endpoint henüz uzantının çalışma koduna entegre edilmedi. `ambargoed` yazımı paylaşılan URL ile aynıdır.

```http
GET https://candidatesearchapigateway.kariyer.net/Search/my-ambargoed-companies
Authorization: Bearer <TOKEN>
```

Paylaşılan URL'de query parametresi yoktur. İstek gövdesi paylaşılmadı; ek başlıklar ve cookie gereksinimi doğrulanmadı.

### Paylaşılan yanıt örneği

```json
{
  "statusCode": "Success",
  "status": "Success",
  "data": [],
  "message": null,
  "error": null
}
```

| Alan | Gözlenen tür / açıklama |
| --- | --- |
| `statusCode`, `status` | String; her ikisi de `Success` |
| `data` | Dizi; örnekte boş, eleman yapısı bilinmiyor |
| `message`, `error` | Örnekte null; hata durumundaki türleri bilinmiyor |

Bu örnekte başarılı yanıt boş liste içeriyor; boş liste tek başına hata olarak değerlendirilmemelidir. Dolu kayıtların `/Search/my-followed-companies` veya `/Search/company` yapısıyla aynı olduğu varsayılmamalıdır. Kısıtlamanın ilan görünürlüğüne/başvuruya etkisi, sonuç sınırları, başarısız yanıtlar, HTTP durumları ve rate-limit davranışı bilinmiyor. Yanıt mevcut `/job` ayrıştırıcısıyla uyumlu değildir.

## Şirket sayıları için mevcut veri kaynakları

Uzantının çalışma kodunda bu sayılar için henüz bir JSON endpoint'i kullanılmıyor. Kullanıcının açıklamasına göre `/Search/company` yanıtındaki `data[].occurrence` şirketin açık ilan sayısını verir; bu kaynak henüz çalışma koduna entegre edilmedi.

- **Takipçi:** İlan sayfasındaki “Şirket Hakkında” bölümünün DOM'undan okunur. Eksikse şirket profilindeki görünür takipçi metni kullanılır.
- **Açık ilan:** `https://www.kariyer.net/firma-profil/{profil-slug}` HTML sayfasındaki `Tümünü Gör (N)` bağlantısından okunur. Bağlantı `/is-ilanlari?fpi={profil-kimliği}&…` listesine gider.

Profil HTML isteği aynı kaynak üzerinden yapılır. Bu bölüm sayfa entegrasyonunu anlatır; `fpi` parametresi bir JSON API sözleşmesi olarak kabul edilmemelidir.

## Sonraki doğrulamalar

- `/job` için oturum bilgileri ve kişisel veriler çıkarılmış gerçek JSON yanıtı.
- Şirket detayı ve açık ilan sayısı için varsa JSON endpoint'leri.
- `POST /search` için kimlik doğrulama, sayfalama/sponsor sonuç davranışı, filtre kod/ad eşleştirmeleri ve filtrelerin birleşme kuralları.
- `/candidates/base-info` için HTTP yöntemi, istek gereksinimleri ve başarısız yanıt örnekleri.
- `/jb/api/candidates/getcandidateinformationforcookie` için HTTP yöntemi, istek gereksinimleri ve durum kodlarının anlamları.
- `/search/savedsearches` için HTTP yöntemi, `size`/`from` sayfalama davranışı ve başarısız yanıt örnekleri.
- `/candidates/job_apply_status` için HTTP yöntemi, `jobApplyStatus`/`responseCode` kodları ve diğer başvuru durumlarının yanıtları.
- `POST /Job/job-detail-recommendations` için gerekli başlıklar, liste türü kodları ve başarısız yanıtların doğrulanması.
- `/candidates/get-salary-by-position` için HTTP yöntemi, `ApiKey` gereksinimleri, maaş birimi/dönemi ve başarısız veya verisiz yanıtlar.
- `/get-job-application-detail` için HTTP yöntemi, yönlendirilmiş ilan/başvuru bulunmaması durumları ve süreç/etkileşim kodları.
- `/Search/company` için HTTP yöntemi, kimlik doğrulama ve sonuç sınırı/sayfalama davranışı.
- `POST /Search/autocomplete` için başlıklar, özgün `keyword` değeri, `occurrence` anlamları ve sonuç sınırları.
- `GET /jb/api/search/autocomplete` için başlıklar, `type`/`count` anlamları, kategori ve sonuç sınırları.
- `POST /Search/relatedsearch` için başlıklar, sonuç sınırları ve boş/başarısız yanıtlar.
- `/jb/api/candidates/resumes` için HTTP yöntemi, sayfalama, durum/dil kodları ve boş/başarısız yanıtlar.
- `GET /jb/api/candidates/resumes/view` için sayfalama kapsamı, görüntülenme gruplama kuralları ve boş/başarısız yanıtlar.
- `GET /coverletters` için sayfalama, içerik kısaltma davranışı, tam metin kaynağı ve boş/başarısız yanıtlar.
- `GET /Search/my-followed-companies` için sonuç sınırları, `occurrence` anlamı ve boş/başarısız yanıtlar.
- Belge türleri yanıtının URL'si, HTTP yöntemi ve kimlik doğrulama gereksinimleri.
- `GET /jb/api/common/get-file-list` için dosya boyutu birimi, ilişkili CV yapısı, indirme erişimi ve boş/başarısız yanıtlar.
- `GET /Search/my-ambargoed-companies` için dolu kayıt yapısı, kısıtlama anlamı ve başarısız yanıtlar.

Yeni kayıtlar gerçek istekte görülen URL ve alanlarla eklenecek; endpoint adları tahmin edilerek yazılmayacak. Paylaşılan örneklerden Cookie, Authorization, token ve kişisel veriler çıkarılmalıdır.

### Dashboard başvuru içe aktarma

Kullanıcının başlattığı içe aktarma, belgelenmiş Başvurduğum İlanlar filtresi ile POST /search çağırır: memberId doğrulanmış aday kimliği, jobProperties: ["5"], isSearchFromProfilePage: true, dontShowAppliedJobs: false, currentPage: 1..N, size: 12. Sayfalama totalJobCountWithOutSponsored (yoksa totalJobCount) ve currentPage ile doğrulanır. Sponsorlu ek sonuçlar dışlanır. appliedDetail dolu biçimi doğrulanmadığından tarih/CV bilgisi buradan çıkarılmaz; her ilan için get-job-application-detail kullanılır. Mevcut manuel kayıt alanları korunur. Bu akış taklit yanıtlarla test edilmiştir; oturumlu canlı API uyumluluğu ayrıca doğrulanmalıdır.
