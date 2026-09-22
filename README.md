# KariyerLens

Kariyer.net ilan sayfasında otomatik çalışan, API'den aldığı başvuru sayısını sayfanın kendi arayüzüne yazan Manifest V3 Chrome uzantısı prototipi.

## Yükleme

1. Chrome'da `chrome://extensions` adresini açın.
2. Sağ üstten **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle** seçeneğiyle bu klasörü seçin.
4. Bir Kariyer.net ilan sayfasını yenileyin. Uzantı görünür bir panel açmaz.

## Davranış

- Uzantı ilan URL'sinden sayısal `jobId` algıladığında sabit Kariyer.net API adresine istek yollar.
- Başarılı yanıtlar beş dakika boyunca bellek içinde önbelleğe alınır.
- Başarılı yanıttaki `jobIstatistics.totalApplication` değeri, sayfadaki `[data-test="job-application-count"]` alanına yazılır.
- 401/403, CAPTCHA/bot koruması, 404, rate limit ve JSON şema hatalarında sayfanın mevcut görünümü değiştirilmez.
- PerimeterX/CAPTCHA gibi korumaları atlatmaya çalışmaz. Normal kullanıcı oturumunda API'nin izin vermesi gerekir.

## API yanıtı

Gerçek API şemasına göre `normalizeJob`, aşağıdaki alanları UI modeline çevirir:

- `data.jobGeneralInformation`: başlık, konum, yayın/son başvuru tarihi, nitelikler ve başvuru durumu
- `data.jobCompanyInformation`: şirket adı ve profil bilgisi
- `data.jobPositionInformation`: çalışma tipi/modeli, pozisyon, sektör ve çalışma alanları
- `data.jobCandidateCriteria`: deneyim, eğitim ve dil kriterleri
- `data.jobIstatistics`: toplam başvuru sayısı

`qualificationsWithHtml` kullanılmaz; ham HTML yerine güvenli düz metin olan `qualifications` ekrana yazılır.
