# Kariyer.net API notları

Bu doküman KariyerLens entegrasyonundan ve birlikte inceleyeceğimiz isteklerden oluşturulur. Kariyer.net'in resmî API dokümantasyonu değildir. İlk bölüm mevcut kaynak koduna dayanır; bu çalışma sırasında canlı JSON yanıtı yeniden doğrulanmadı.

Her yeni endpoint için yöntem, adres, parametreler, oturum gereksinimi, anonimleştirilmiş yanıt örneği, alan açıklamaları ve gözlenen hatalar kaydedilecek. Doğrulanmayan noktalar açıkça belirtilecek.

## İlan detayı — `GET /job`

**Kaynak:** `src/background/kariyer-api.js` içindeki mevcut entegrasyon.

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
- `/jb/api/candidates/getcandidateinformationforcookie` için HTTP yöntemi, istek gereksinimleri ve durum kodlarının anlamları.
- `/search/savedsearches` için HTTP yöntemi, `size`/`from` sayfalama davranışı ve başarısız yanıt örnekleri.
- `/candidates/job_apply_status` için HTTP yöntemi, `jobApplyStatus`/`responseCode` kodları ve diğer başvuru durumlarının yanıtları.

Yeni kayıtlar gerçek istekte görülen URL ve alanlarla eklenecek; endpoint adları tahmin edilerek yazılmayacak. Paylaşılan örneklerden Cookie, Authorization, token ve kişisel veriler çıkarılmalıdır.
