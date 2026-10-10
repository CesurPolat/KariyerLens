<p align="center">
  <img src="assets/kariyerlens-banner.png" alt="KariyerLens — iş ilanlarına daha yakından bak" width="100%" />
</p>

# 🔎 KariyerLens

**İş ilanlarına daha yakından bak.**

KariyerLens, **Kariyer.net ilanlarında başvuru verilerini ve alım hareketliliğini** sayfanın içinde gösteren bir Chrome uzantısıdır. Toplam başvuru sayısını, başvuru yoğunluğunu ve şirketin son inceleme zamanını bir araya getirerek ilanı değerlendirmenize yardımcı olur.

> Proje şu anda **Manifest V3 tabanlı bir prototiptir**. Yukarıdaki tanıtım görseli temsili bir arayüz ve örnek veriler içerir.

## ✨ Özellikler

- **👥 Toplam başvuru sayısı:** API'den alınan başvuru sayısını ilanın mevcut başvuru alanında gösterir.
- **📊 Başvuru yoğunluğu:** Toplam başvuruyu ilanın açık kaldığı gün sayısına bölerek günlük başvuru ortalamasını hesaplar.
- **⏱️ Son inceleme zamanı:** Şirketin başvuruları en son ne zaman incelediğini gösterir.
- **🎯 Alım devir saati:** Son inceleme zamanı ve başvuru hızına göre alım hareketliliğini ibreli bir göstergeyle tahmin eder. Veri yetersizse bunu belirtir.
- **📅 Gerçek yayın tarihi:** İlan sayfasında yayın tarihi gizlenmiş olsa bile API'de mevcutsa bu tarihi gösterir.
- **🗓️ İlan bilgileri:** Yayın ve son başvuru tarihlerini, yayınlanma süresini ve API'deki sürüm değerini bilgi bloğunda sunar.
- **🏷️ Pozisyon etiketi:** Pozisyon adını sayfanın mevcut özellik listesine ekler.
- **🏢 Şirket istatistikleri:** Sağdaki şirket kartında takipçi ve açık iş ilanı sayılarını gösterir. Açık ilan sayısına tıklayarak şirketin ilanlarını açabilirsiniz.
- **💬 KariyerLens Asistan:** Yapay zekâ ile ilanın sağ sütununda ilanı özetler, aranan yetkinlikleri açıklar ve mülakata hazırlanmaya yardımcı olur.
- **🧠 İlan ve CV hafızası:** Sohbette incelenen son ve sık ilanları hatırlar; CV’yi ilgili sorularda 24 saat boyunca yerel hafızadan kullanır.
- **⚡ Sayfa içinde kullanım:** Ayrı bir panel açmadan çalışır; başarılı API yanıtlarını beş dakika boyunca bellekte önbelleğe alır.

Alım hareketliliği **tahmini bir göstergedir**; şirketin kesin işe alım niyetini veya başvurunuzun sonucunu göstermez. Güncelleme sayısı için kullanılan `versionId`, API'nin sürüm değeridir.

## 📥 Kurulum

Kurulum için Node.js 22.12 veya üzeri gerekir. TypeScript kaynakları Vite ile derlenir ve oluşan `dist/` klasörü Chrome'a paketlenmemiş uzantı olarak yüklenir.

```bash
git clone https://github.com/CesurPolat/KariyerLens.git
cd KariyerLens
npm ci
npm run build
```

1. Chrome'da `chrome://extensions/` adresini açın.
2. Sağ üstteki **Geliştirici modu** seçeneğini etkinleştirin.
3. **Paketlenmemiş öğe yükle** düğmesine tıklayın.
4. Projenin içindeki **dist klasörünü** seçin.
5. Bir Kariyer.net ilan sayfasını açın veya yenileyin.

Kaynakları değiştirdikten sonra `npm run build` çalıştırın, uzantı kartındaki yenile düğmesine basın ve ilan sayfasını yenileyin. `npm run dev`, önce tip kontrolü ve temiz build yapar, ardından Vite build izleme modunu başlatır. Kaynak, HTML/CSS, manifest ve kullanılan ikon değişikliklerinde `dist/` çıktısı yenilenir; Chrome'da uzantıyı yine elle yenilemeniz gerekir. İzleme sırasında tip kontrolü için `npm run typecheck` kullanın.

Uzantı geliştirmesinde Vite dev server yerine `vite build --watch` kullanılır; Chrome, Manifest V3 betiklerini yerel `dist/` dosyalarından yükler. `vite.config.ts` içinde ayarlar sayfası, service worker ve üç içerik betiği için ayrı build ortamları tanımlanır. Ayarlar sayfasının HTML/CSS/JS bağlantılarını Vite işler; içerik betikleri klasik script biçiminde üretilir. Manifest ve kullanılan ikonlar küçük bir Vite plugin'iyle çıktıya eklenir. İzleme sırasında bir ortamın yeniden derlenmesi diğer ortamların dosyalarını silmez.

Sohbet kartı, ilan özeti/SVG gösterge ve ayarlar sayfası React + TSX component'leriyle çizilir. İçerik betikleri kartların yerini ve sayfa gezinmesini takip eder; React, kartların içeriğini ve sohbet/ayar durumlarını yönetir. Sohbet ve ilan özeti kapalı Shadow DOM içinde kendi CSS'leriyle çalışır. Sayfa yeniden çizilince kartlar yeniden yerleştirilir; ilan değişince sohbet sıfırlanır ve eski istek yanıtları uygulanmaz. Son başvuru inceleme bilgisi ilan özetindeki tarih etiketlerinin yanında tek kez gösterilir.

## 🚀 Nasıl çalışır?

### Kariyer dashboard’u

Uzantı simgesi **Başvurularım**, **CV A/B Testi** ve **Bana Uygun İlanlar** bölümlerini içeren tam sayfa dashboard’u açar; açık dashboard sekmesi varsa yeniden kullanılır. Önce Kariyer.net’te oturum açıp profil sayfanızı yenileyin, ardından dashboard’da **Yeniden bağlan** düğmesine basın. İlan araması için Kariyer.net profilindeki “Sana Uygun İlanlar” bölümünün oturum başlığının da gözlemlenmesi gerekebilir.

- **Başvurularım:** Dashboard’a ilan bağlantısı girerek takibe ekleyin veya mevcut başvurularınızı içe aktarın. Başvurular sıkı tablo düzeninde 10/25/50 satırlık sayfalara ayrılır; arama veya durum filtresi sayfalamayı sıfırlar. Satırın Detay düğmesi, listeyi yerinde tutan yan paneli açar. Durum, başvuru tarihi, takip tarihi, notlar, dönüş bilgisi ve manuel etkileşimleri düzenleyebilirsiniz. **Başvuruları yenile**, takip edilen ilanların API bilgilerini ve CV görüntülenmelerinin ilk sayfasını (`skip=0&size=8&ClientType=1`) alır. Listede kullanılan CV adı, detayda CV/şirket/ilan bazında görüntülenme tarihleri ve sayıları gösterilir. İlk yanıttan en fazla 100 kayıt saklanır; tüm geçmişi kapsadığı varsayılmaz. Hatalarda önceki başarılı kayıtlar korunur. CV görüntülenmesi görüşme olarak yorumlanmaz; manuel süreç durumu ve notlar yenilemede korunur. **Başvurularımı içe aktar**, Kariyer.net’in “Başvurduğum İlanlar” filtresini sayfa sayfa okuyup mevcut başvuruları ekler. İşlem yalnız düğmeyle başlar; aynı ilan tekrar eklenmez, notlar ve CV sürümü seçimleri korunur. Detayı alınamayan kayıtlarda tarih/CV tahmin edilmez; hata gösterilir ve daha sonra yenilenebilir. İstek sınırı veya 500 kayıt sınırında işlem durur; alınan kayıtlar korunur.
- **CV A/B Testi:** **CV’leri getir** ile iki farklı Kariyer.net CV’sini seçip test oluşturun. İçerikler o tarihte sabitlenir; CV’yi sonradan değiştirmeniz eski testi değiştirmez. Başvurular her testte API CV kimliğiyle A/B’ye otomatik eşleşir; CV adına göre eşleştirme yapılmaz. API kimliği yoksa mevcut manuel atama kullanılır; çelişen manuel atama korunur ve API kimliği esas alınır. Tarih aralığında başvuru tarihi bulunan kayıtlar görüntülenme, dönüş, mülakat ve teklif oranlarına girer. Başvuru etkileşimleri ve aynı CV/ilan görüntülenme kayıtları oran için birlikte değerlendirilir; aynı başvuru bir kez sayılır. Alınan CV görüntülenmelerinin toplam sayısı ayrıca gösterilir. İstatistikler CV kimliğine dayanır; başvuru günündeki CV içeriğinin AI için kaydedilen kopyayla aynı olduğu doğrulanmaz. Karşılaştırma gözlemseldir; kazanan CV belirlenmez.
- **Bana Uygun İlanlar:** İlanlar yalnız **Yenile** veya sayfalama düğmesine bastığınızda alınır. İlk yenileme API’nin filtre seçeneklerini getirir. Arama, son 7 gün filtresi ve Sana Uygun İlanlar seçeneğiyle sayfa başına 50 normal sonuç getirir; sponsorlu ek sonuçlar dışlanır. **Daha eski ilanları da göster** seçeneğiyle 7 günlük sınırı kaldırıp tüm tarihlerde arayabilirsiniz; seçim **Yenile** ile uygulanır ve sonraki sayfalarda korunur. Başvurulan ilanlar bu aramada gizlenmez. İlanlar tek tabloda gösterilir; yayın tarihi filtresiyle son 7 gün içinde yayımlananları, tarihi bilinmeyenleri ve diğer ilanları seçebilirsiniz; ilk görülme tarihi yayın tarihi değildir. Öneriler Kariyer.net profilinize dayanır. Seçtiğiniz CV yalnız **Uyumu analiz et** işleminde kullanılır.

**A/B analiz et** ve **Uyumu analiz et**, ilgili ilanı ve seçilen/sabit CV içeriklerini mevcut AI sağlayıcınıza gönderir. Analiz otomatik başlamaz; **Durdur** düğmesi isteği iptal eder. CV içeriği API bütçesi nedeniyle kısaltıldıysa test kartında belirtilir. Dashboard analizlerinde başka profil/CV araçları çağrılmaz.

Dashboard kayıtları `chrome.storage.local` içinde, doğrulanmış aday kimliğinin hash’i altında ayrı tutulur. Token yenilenmesi kayıtları değiştirmez; hesap değiştiğinde önceki hesabın kayıtları gösterilmez ve açık ekranın eski hesaba ait işlemleri reddedilir. Token diske yazılmaz; içerik betiklerine kapalı, bellekte çalışan geçici oturum alanında tutulur. Arka plan worker’ı durup yeniden başladığında geri yüklenir; tarayıcı/uzantı yeniden başlatıldığında veya 30 dakikalık süre dolduğunda Kariyer.net sayfasından yeniden yakalanması gerekir. Dashboard, sohbet hafızasından bağımsızdır; **Hafızayı temizle** dashboard kayıtlarını silmez. Depolama bütçesi hesap başına 3 MiB, takip sınırı 500 ilan ve test sınırı 20’dir; sınıra ulaşılırsa mevcut kayıtlar korunur.

Kariyer.net API’lerinin canlı uyumluluğu bu dashboard değişikliğinde doğrulanamadı: tarayıcı aracının URL politikası extension sayfasına erişimi engelledi. API ve arayüz senaryoları taklit yanıtlarla doğrulandı.

### Asistan kurulumu

1. Değişikliklerden sonra `chrome://extensions/` üzerinden uzantıyı yeniden yükleyin, ardından ilan sayfasını yenileyin.
2. Uzantı simgesine tıklayıp dashboard’daki **Ayarlar** düğmesini veya sohbet kartındaki **Ayarlar** düğmesini kullanın.
3. **OpenAI**, **OpenRouter** veya **KariyerLens Free** seçin. OpenAI ve OpenRouter için kendi API anahtarınızı ve erişebildiğiniz modelin tam kimliğini girip **Kaydet** düğmesine basın. OpenRouter kimlikleri `sağlayıcı/model` biçimindedir. KariyerLens Free seçildiğinde anahtar ve model alanları gizlenir; yalnız Kaydet’e basın. Hizmet `https://llm.cesurpolat.dev/v1/chat/completions` adresini kullanır, anahtar gönderilmez ve modeli hizmet seçer.
4. Kariyer.net’in herhangi bir sayfasında sağ alttaki sohbet baloncuğuna tıklayıp sorunuzu gönderin. İlan detayında başlıkta ilan kimliği gösterilir ve mevcut ilan araçları kullanılır. Diğer sayfalarda **Genel sohbet** açılır; ilan arama, CV ve aday araçları kullanılabilir. Genel sohbet sayfanın içeriğini otomatik okumaz. Panel sayfayı kaydırırken ekranda kalır; × veya Escape ile kapanır. Kapatıp açınca sohbet korunur; ilan değişince veya ilan/genel sohbet arasında geçince temizlenir ve bekleyen istek iptal edilir. Sayfa yenilendiğinde geçmiş silinir. Enter gönderir; Shift+Enter yeni satır açar.

Her sağlayıcının anahtarı ve modeli ayrı saklanır. Anahtarı ayarlardaki silme düğmesiyle kaldırabilirsiniz. OpenAI ve OpenRouter için anahtar ve model girilmeden AI isteği gönderilmez; KariyerLens Free bu alanları gerektirmez. Ayrı bir sunucu gerekmez. Sohbet, background service worker içinde LangChain agent kullanır; seçtiğiniz model **tool calling** desteklemelidir.

Asistan soruya göre iki parametresiz araç kullanabilir: `get_current_job` açık ilanın detaylarını ve başvuru verilerini, `get_current_company_stats` ise açık ilanın şirket adı, profil adresi, takipçi bilgisi, açık ilan sayısı ve ilan listesi adresini getirir. Şirket kaynağı bir JSON API değil, mevcut aynı kaynaklı profil sayfasıdır. Gösterge ve araç aynı beş dakikalık önbelleği ve devam eden isteği paylaşır. Araçlara başka ilan kimliği veya URL verilemez; eksik şirket alanları `null` döner. Her sohbet isteği yeni agent ile çalışır; araç çağrılarına sayı sınırı uygulanmaz, iptal ve zaman aşımı sınırları geçerlidir. Araç mesaj geçmişi kalıcı saklanmaz.

Streaming'i koddan açıp kapatmak için `src/features/chat/chat-api.ts` içindeki `CHAT_STREAMING_ENABLED` sabitini değiştirin: `true` canlı yazdırır, `false` yanıtı tek seferde gösterir ve sağlayıcı isteğinde `stream: false` kullanır. Bekleme ve tool durum göstergeleri iki modda da çalışır. Değişiklikten sonra `npm run build` çalıştırıp uzantıyı ve ilan sayfasını yenileyin.

Sohbet geçmişi yalnız açık sayfanın belleğinde tutulur; ilan değişince, temizleme düğmesine basınca veya sayfa yenilenince silinir. İsteklere son 12 mesaj eklenir. Mesajlar en fazla 4.000 karakter, ilan açıklaması en fazla 20.000 karakterdir. Yanıtlar sağlayıcıdan geldikçe parça parça Markdown olarak gösterilir: başlıklar, kalın/italik metin, listeler, alıntılar, kod blokları ve GFM tabloları desteklenir. Kullanıcı mesajları düz metin kalır. Ham HTML çalıştırılmaz; görseller yalnız açıklama metniyle gösterilir ve web bağlantıları yeni sekmede açılır. Hatalı istekler otomatik tekrarlanmaz; sorunuz yeniden gönderebilmeniz için yazı alanına geri konur. İlk metin gelene kadar hareketli durum göstergesi görünür; ilan ve şirket araçları çalışırken işlem durumu güncellenir. Sohbeti temizlemek veya ilan değiştirmek devam eden akışı iptal eder. Kesilen akışın kısmi yanıtı görünür kalır, fakat sonraki istek geçmişine eklenmez; soru tekrar göndermek için taslağa döner. 120 saniye yeni yanıt veya işlem sonucu gelmezse istek durdurulur; toplam süre sınırı 10 dakikadır.

### İlan ve CV hafızası

Hafıza varsayılan olarak açıktır ve yalnız asistanla sohbet ettiğiniz ilanları kaydeder. Her sohbet isteği inceleme sayısını bir kez artırır. Son ve sık incelenen ilanların kısa listesi sohbet bağlamına eklenir; detaylar `get_memory_job`, listeler `list_memory_jobs` aracıyla alınır. Bunlar alınma tarihi bulunan geçmiş görüntüleridir; açık ilanın güncel verisi ayrıca yüklenir. En fazla 100 ilan, 90 günlük geçmiş ve toplam 2 MiB hafıza tutulur.

CV listesi ve seçilen CV detayları ilk ilgili araç çağrısında alınır, temizlenmiş başarılı sonuçlar 24 saat saklanır. CV sıradan ilan özetlerinin başlangıç bağlamına eklenmez; CV karşılaştırması veya kişiselleştirilmiş başvuru hazırlığında araç üzerinden kullanılır. Kişisel kayıtlar gözlemlenen Kariyer.net bearer oturumunun SHA-256 hash’iyle ayrılır; token saklanmaz. Oturum bilinmiyorsa CV hafızası kullanılmaz; token değişince CV yeniden alınır.

Ayarlardaki **Hafızayı kullan** seçeneği okumayı ve yeni kayıtları kapatır; mevcut kayıtlar korunur. **CV hafızasını yenile** CV kayıtlarını sıfırlar ve sonraki ilgili soruda güncel veri alınır. **Hafızayı temizle** ilan ve CV kayıtlarını siler; API anahtarları ve başvuru sayısı geçmişi korunur. Sohbeti temizlemek bu kalıcı hafızayı silmez. Depolama hatalarında hafıza kullanılmadan mevcut ağ akışıyla devam edilir.

### İlan verileri

Şirket kartındaki takipçi sayısı öncelikle ilanın “Şirket Hakkında” bölümünden alınır. Açık ilan sayısı şirket profilindeki “Tümünü Gör” alanından okunur. Şirket profilleri aynı kaynak üzerinden istenir, beş dakika bellekte önbelleğe alınır ve istekler 15 saniyede zaman aşımına uğrar. Eksik bilgiler `—` ile gösterilir; sıfır kabul edilmez. Profilde kısaltılmış takipçi sayısı varsa aynı biçimde korunur. Yeni erişim izni veya API anahtarı gerekmez.

1. İçerik betiği, ilan URL'sinden sayısal `jobId` değerini algılar.
2. Arka plan service worker'ı, Kariyer.net API'sinden ilan verilerini ister.
3. API yanıtı sade bir veri modeline dönüştürülür ve başarılı yanıtlar beş dakika önbellekte tutulur.
4. Başvuru sayısı mevcut alana yazılır; ek bilgiler `.job-features` bloğunun hemen altında gösterilir.

Uzantı, sayfanın mevcut tarih alanını değiştirmez. Ek bilgi bloğu için kendi DOM öğelerini oluşturur.

## 🔐 Veri ve erişim

İlan verileri `candidatesearchapigateway.kariyer.net` adresinden alınır. API istekleri mevcut oturumun kimlik bilgilerini içerir; erişim için normal Kariyer.net oturumunuzun ve API yetkisinin uygun olması gerekir. Projeye ait ayrı bir sunucuya veri gönderilmez.

401/403, 404, istek sınırı, CAPTCHA/bot koruması veya geçersiz yanıt durumunda ilgili istekten gelen veriler sayfaya uygulanmaz. Uzantı CAPTCHA veya PerimeterX korumasını atlatmaya çalışmaz.

Manifest, Kariyer.net sayfalarında içerik betiği çalıştırma, Kariyer.net API'sine erişim ve `storage` izni tanımlar. Mevcut API önbelleği kalıcı depolama yerine service worker belleğinde tutulur.

Asistan kullanıldığında mesajlarınız, son sohbet mesajları ve ilanın başlığı, şirketi, açıklaması, aday kriterleri ve başvuru verileri seçtiğiniz **OpenAI** (`api.openai.com`) , **OpenRouter** (`openrouter.ai`) veya **KariyerLens Free** (`llm.cesurpolat.dev`) API'sine gönderilir. Şirket aracı çağrılırsa şirket adı, profil adresi, takipçi bilgisi, açık ilan sayısı ve ilan listesi adresi de gönderilir. Hafıza açıksa sohbet edilen ilanların kısa geçmiş listesi de gönderilir; geçmiş ilan detayları ve kişisel CV bilgileri yalnız ilgili araç kullanıldığında gönderilir. Kariyer.net oturum bilgileri AI isteğine eklenmez. İlan verileri kendiliğinden AI sağlayıcısına gönderilmez; gönderim sohbet mesajınızla başlar. API kullanımı sağlayıcının tarifesine göre ücretlendirilebilir; araç kullanımında bir soru için birden fazla model isteği yapılabilir.

API anahtarları `chrome.storage.local` içinde yalnız bu bilgisayarda saklanır; bu depolama şifreli bir kasa değildir. İçerik betiklerinin depolamaya erişimi kapatılır. Anahtarlar sayfa DOM'una, sohbet kartına veya kaynak koda yazılmaz; yalnız uzantı ayarları ve arka plan service worker'ı tarafından kullanılır. Manifest bu üç AI sağlayıcısına erişim izni içerir.

### Geliştirme doğrulaması

`npm test`, derleme ve paket yapısı kontrolleriyle birlikte taklit API ve service worker testlerini çalıştırır. `npm run typecheck`, strict TypeScript kontrolünü tek başına çalıştırır.
Tarayıcı senaryoları için `npm run test:browser` çalıştırıp `http://127.0.0.1:4173/tests/browser.html` adresini açın. Bu komut önce uzantıyı derler; tarayıcı senaryoları `dist/` içindeki gerçek çıktıları kullanır. Testler gerçek sağlayıcıya istek göndermez ve API anahtarı gerektirmez.
Şirket kartı senaryoları için aynı sunucuda `http://127.0.0.1:4173/tests/company-stats.html` adresini açın; profil yanıtları taklit edilir.
React ilan özeti senaryoları: `http://127.0.0.1:4173/tests/job-summary.html`. React ayarlar senaryoları: `http://127.0.0.1:4173/tests/options.html`; depolama erişim hatası için `?storage-failure` ekleyin. Dashboard testleri: `http://127.0.0.1:4173/tests/dashboard.html`; `?empty`, `?auth`, `?one-cv`, `?analysis-error` hata/boş senaryolarını, `?interactive` örnek verilerle serbest kullanımı açar. Sayfalama ve yan detay paneli testi: aynı adrese `?table` ekleyin. 390 piksel görünüm: `http://127.0.0.1:4173/tests/dashboard-mobile.html`. Dashboard testleri gerçek hesap, depolama veya AI sağlayıcısına erişmez.

Bu sayfalar derlenmiş uzantı kodunu, örnek ilan verilerini ve taklit Chrome depolamasını kullanır; gerçek API anahtarları okunmaz veya kaydedilmez.

## 🛠️ Teknoloji

Kullandığımız endpoint'lerin parametreleri, yanıt alanları ve doğrulama notları: [Kariyer.net API notları](docs/kariyer-net-api.md).

| Bileşen | Teknoloji |
| --- | --- |
| Platform | Chrome Extension · Manifest V3 |
| Dil | TypeScript · strict tip kontrolü |
| Arayüz | React · TSX component'leri · CSS |
| Derleme | npm · Vite · yerel JavaScript çıktısı |
| Arka plan | Chrome Service Worker |
| Sayfa entegrasyonu | Content Script · DOM · SVG gösterge |
| Veri kaynağı | Kariyer.net API · Fetch API |
| Önbellek | Bellek içi `Map` · 5 dakika |

## 📁 Proje yapısı

```text
KariyerLens/
├── manifest.json
├── package.json               # npm komutları ve bağımlılıklar
├── tsconfig.json              # Strict TypeScript yapılandırması
├── tsconfig.node.json         # Vite yapılandırmasının tip kontrolü
├── vite.config.ts             # Uzantı build ortamları ve statik dosyalar
├── dist/                      # Chrome'a yüklenecek çıktı (Git'e eklenmez)
├── assets/
│   ├── kariyerlens-banner.png
│   └── icons/
├── src/
│   ├── background/
│   │   ├── chat-api.ts           # OpenAI / OpenRouter istekleri
│   │   ├── kariyer-api.ts        # API isteği ve veri normalizasyonu
│   │   └── service-worker.ts    # Mesajlaşma ve önbellek
│   ├── content/
│   │   ├── chat.ts              # Shadow DOM sohbet kartı
│   │   ├── company-stats.ts     # Şirket takipçisi ve açık ilan sayısı
│   │   ├── content-script.ts   # Sayfa entegrasyonu ve göstergeler
│   │   ├── components/         # ChatCard, JobSummary, sohbet hook'u ve CSS
│   │   ├── job-insights.ts     # Tarih biçimleme ve alım hareketliliği hesabı
│   │   ├── mount-job-summary.ts # İlan özeti React kökünün yaşam döngüsü
│   │   └── globals.d.ts        # İçerik betiklerinin ortak gezinme fonksiyonları
│   ├── options/                # React OptionsApp ve ayarlar sayfası
│   └── shared/
│       ├── messages.ts         # Ortak mesaj türleri
│       └── types.ts            # İlan, sohbet, ayarlar ve sonuç tipleri
└── README.md
```

## 🔌 Yol haritası


- [ ] Chrome Web Store üzerinden dağıtım
- [ ] Farklı ilan türleri ve eksik veri senaryoları için daha geniş doğrulama
- [ ] Alım hareketliliği hesaplamasının kullanıcıya daha ayrıntılı açıklanması

## 🤝 Katkı ve destek

Hata bildirimleri ve pull request'ler için [GitHub deposunu](https://github.com/CesurPolat/KariyerLens) kullanabilirsiniz. Büyük değişiklikler için önce bir issue açarak önerinizi paylaşın. Hata bildirirken ilan URL'sini ve sorunu yeniden üretme adımlarını ekleyin; kişisel bilgilerinizi ve oturum verilerinizi paylaşmayın.

Projeyi faydalı bulduysanız GitHub'da yıldız verebilirsiniz ⭐

KariyerLens bağımsız bir projedir; Kariyer.net'in resmi uzantısı değildir.

## Kaynak yapısı

`src/features/` özelliklerin arayüzünü ve iş mantığını birlikte tutar: `chat` (bileşenler, hook’lar, sohbet API’si), `application-history` (sayaç, grafik, yerel geçmiş), `job-summary` (özet ve hareketlilik hesabı), `company` (profil ve şirket istatistikleri), `memory` (yerel ilan ve CV hafızası). Her özelliğin sayfaya yerleştirme kodu kendi `mount.ts` dosyasındadır.

`src/content/` ve `src/background/service-worker.ts` uzantının giriş noktalarıdır. `src/shared/` ortak tipleri, mesajları, sayı ayrıştırmayı ve `kariyer/` altında Kariyer.net API/oturum erişimini içerir. `src/options/` ayarlar sayfasını barındırır. Giriş ve derleme çıktı yolları korunur.
