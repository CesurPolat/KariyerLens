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
- **🗓️ İlan bilgileri:** Yayın ve son başvuru tarihlerini, yayınlanma süresini ve API'deki sürüm değerini bilgi bloğunda sunar.
- **🏷️ Pozisyon etiketi:** Pozisyon adını sayfanın mevcut özellik listesine ekler.
- **⚡ Sayfa içinde kullanım:** Ayrı bir panel açmadan çalışır; başarılı API yanıtlarını beş dakika boyunca bellekte önbelleğe alır.

Alım hareketliliği **tahmini bir göstergedir**; şirketin kesin işe alım niyetini veya başvurunuzun sonucunu göstermez. Güncelleme sayısı için kullanılan `versionId`, API'nin sürüm değeridir.

## 📥 Kurulum

Şu an kurulum, kaynak kodu Chrome'a paketlenmemiş uzantı olarak yükleyerek yapılır.

```bash
git clone https://github.com/CesurPolat/KariyerLens.git
cd KariyerLens
```

1. Chrome'da `chrome://extensions/` adresini açın.
2. Sağ üstteki **Geliştirici modu** seçeneğini etkinleştirin.
3. **Paketlenmemiş öğe yükle** düğmesine tıklayın.
4. `manifest.json` dosyasının bulunduğu **KariyerLens klasörünü** seçin.
5. Bir Kariyer.net ilan sayfasını açın veya yenileyin.

**npm kurulumu veya derleme adımı gerekmez.** Dosyalarda değişiklik yaptıktan sonra uzantı kartındaki yenile düğmesine basın ve ilan sayfasını yenileyin.

## 🚀 Nasıl çalışır?

1. İçerik betiği, ilan URL'sinden sayısal `jobId` değerini algılar.
2. Arka plan service worker'ı, Kariyer.net API'sinden ilan verilerini ister.
3. API yanıtı sade bir veri modeline dönüştürülür ve başarılı yanıtlar beş dakika önbellekte tutulur.
4. Başvuru sayısı mevcut alana yazılır; ek bilgiler `.job-features` bloğunun hemen altında gösterilir.

Uzantı, sayfanın mevcut tarih alanını değiştirmez. Ek bilgi bloğu için kendi DOM öğelerini oluşturur.

## 🔐 Veri ve erişim

İlan verileri `candidatesearchapigateway.kariyer.net` adresinden alınır. API istekleri mevcut oturumun kimlik bilgilerini içerir; erişim için normal Kariyer.net oturumunuzun ve API yetkisinin uygun olması gerekir. Projeye ait ayrı bir sunucuya veri gönderilmez.

401/403, 404, istek sınırı, CAPTCHA/bot koruması veya geçersiz yanıt durumunda ilgili istekten gelen veriler sayfaya uygulanmaz. Uzantı CAPTCHA veya PerimeterX korumasını atlatmaya çalışmaz.

Manifest, Kariyer.net sayfalarında içerik betiği çalıştırma, Kariyer.net API'sine erişim ve `storage` izni tanımlar. Mevcut API önbelleği kalıcı depolama yerine service worker belleğinde tutulur.

## 🛠️ Teknoloji

| Bileşen | Teknoloji |
| --- | --- |
| Platform | Chrome Extension · Manifest V3 |
| Dil | JavaScript · ES Modules |
| Arka plan | Chrome Service Worker |
| Sayfa entegrasyonu | Content Script · DOM · SVG gösterge |
| Veri kaynağı | Kariyer.net API · Fetch API |
| Önbellek | Bellek içi `Map` · 5 dakika |

## 📁 Proje yapısı

```text
KariyerLens/
├── manifest.json
├── assets/
│   ├── kariyerlens-banner.png
│   └── icons/
├── src/
│   ├── background/
│   │   ├── kariyer-api.js        # API isteği ve veri normalizasyonu
│   │   └── service-worker.js    # Mesajlaşma ve önbellek
│   ├── content/
│   │   └── content-script.js    # Sayfa entegrasyonu ve göstergeler
│   └── shared/
│       └── messages.js         # Ortak mesaj türleri
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
