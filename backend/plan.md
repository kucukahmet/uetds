
## 1. Amaç

  
Bu doküman, web ve mobil uygulamalardan kullanılacak, tarifesiz yolcu/transfer operasyonlarını hızlıca UETDS sistemine bildirebilen bir backend API tasarımını açıklar.

Sistem, kullanıcıların UETDS SOAP servisleriyle doğrudan uğraşmadan hızlı şekilde sefer, araç, personel ve yolcu bilgisi girebilmesini sağlar. Backend tarafında kendi authentication/token sistemi bulunur; UETDS entegrasyonu ise adapter katmanında saklanır.

## 2. Resmi bağlam


UETDS sistemine veri gönderimi iki yolla yapılır: e-Devlet üzerinden manuel giriş veya web servis entegrasyonu. Web servis entegrasyonu için taşıyıcı firmanın e-Devlet veya bölge müdürlüğü üzerinden servis yetkilendirmesi yapması gerekir.


Tarifesiz Yolcu için test ve canlı servisler ayrı endpointlerdir:
  
- Test WSDL: `https://servis.turkiye.gov.tr/services/g2g/kdgm/test/uetdsarizi?wsdl`
- Canlı WSDL: `https://servis.turkiye.gov.tr/services/g2g/kdgm/uetdsarizi?wsdl`


Test edilen entegrasyonda raw SOAP POST ile `kullaniciKontrol` çağrısı başarılı dönmüştür. Response içinde `sonucKodu=0` ve `sonucMesaji=İŞLEM BAŞARILI` alınmıştır.


## 3. Ürün vizyonu

  Ürün, tarifesiz yolcu taşımacılığı yapan operasyon ekipleri için hızlı bildirim paneli sağlar.

Temel hedefler:

1. Transfer işi geldiğinde 30-60 saniye içinde UETDS bildirimi hazırlanabilmeli.
2. Web ve mobil aynı backend API'yi kullanmalı.
3. UETDS SOAP karmaşıklığı uygulamalardan gizlenmeli.
4. Araç, şoför, yolcu ve rota bilgileri tekrar kullanılabilir olmalı.
5. UETDS gönderimleri izlenebilir, tekrar denenebilir ve loglanabilir olmalı.
6. Canlı ortamda yanlışlıkla kayıt açmayı engelleyen güvenlik kontrolleri olmalı.
7. Girilmiş olan bir seferin dönüş modu olmalu (istanbul -> ankara) ilk kayır ise bunun aynı yolcular ile tam tersinde tek tıkla yapabilmeliyim.
8. DUplicate sefer alabilme
9. Search v.s. filan olmali



## 4. Kapsam


İlk MVP kapsamı:

- Kullanıcı girişi ve JWT/token sistemi
- Firma ayarları
- UETDS credential/env ayarları
- Araç kayıtları
- Personel/şoför kayıtları
- Yolcu kayıtları
- Hızlı sefer oluşturma
- UETDS sefer gönderimi
- Yolcu ekleme
- Personel ekleme
- Bildirim özeti sorgulama
- İptal/güncelleme için altyapı
- UETDS request/response logları

- Acente paneli
- Otel/havalimanı entegrasyonu
- Excel import
- WhatsApp/SMS bildirimleri
- Fiyatlandırma/fatura
- Mobil offline draft
- Çoklu firma/SaaS tenant yönetimi

## 5. Mimari
  
Önerilen katmanlar:

```text
Client Apps
- Web Admin Panel
- Mobile App
- Internal Operation Panel

  
Backend API

- Auth Module
- User/Role Module
- Vehicle Module
- Driver/Personnel Module
- Passenger Module
- Trip/Transfer Module
- UETDS Orchestration Module
- UETDS SOAP Adapter
- Audit/Log Module


Infrastructure

- PostgreSQL
- Redis Queue
- Worker
- Object Storage, opsiyonel (minio s3)
- Monitoring/Alerting
- Bruno api dosyaları
```

  
Backend framework için FastAPI veya Django REST Framework uygundur. Hızlı geliştirme ve otomatik OpenAPI için FastAPI önerilir; admin panel güçlü olacaksa Django da uygundur.

## 6. Ortam ayrımı

UETDS tarafında test ve canlı ayrımı kesin yapılmalı.

```env

UETDS_ENV=test
UETDS_TEST_URL=https://servis.turkiye.gov.tr/services/g2g/kdgm/test/uetdsarizi
UETDS_LIVE_URL=https://servis.turkiye.gov.tr/services/g2g/kdgm/uetdsarizi

```

Canlı ortamda `seferEkle`, `yolcuEkle`, `personelEkle` gibi kayıt oluşturan işlemler için ekstra onay/guard kullanılmalı.

Örnek guard:

```text

if UETDS_ENV == "live" and operation in WRITE_OPERATIONS:
require user role: uetds_live_submitter
require explicit confirmation flag: confirm_live_submission=true

```

  

## 7. Authentication ve authorization

  
Backend kendi token sistemini kullanır.

  
Önerilen auth:
- Access token: JWT, uzun ömürlü, örn. 7 gün
- Refresh token: DB'de saklanır, rotation yapılır
- API token: mobil/web dışı sistem entegrasyonu için opsiyonel

Roller:
- `super_admin`: sistem yöneticisi
- `company_admin`: firma ayarları ve kullanıcı yönetimi
- `operation_manager`: sefer oluşturma/güncelleme/onay
- `dispatcher`: günlük operasyon ve UETDS gönderimi
- `driver`: sadece kendi seferlerini görme
- `viewer`: salt okuma

Önemli permissionlar:
- `trip:create`
- `trip:update`
- `trip:submit_uetds`
- `trip:cancel_uetds`
- `vehicle:manage`
- `driver:manage`
- `settings:uetds_manage`
- `logs:view`
## 8. Ana veri modelleri

  

### Company
  

```json

{

"id": "uuid",
"name": "Örnek Turizm Ltd. Şti.",
"tax_no": "string",
"unet_no": "string",
"status": "active",
"created_at": "datetime"
}

```

  

### UETDSCredential

  

```json

{

"id": "uuid",

"company_id": "uuid",

"environment": "test|live",

"username": "encrypted_string",

"password": "encrypted_string",

"endpoint_url": "string",

"is_active": true,

"last_verified_at": "datetime"

}

```

  

Not: Şifreler düz metin saklanmamalı. Secret manager veya uygulama seviyesinde encryption kullanılmalı.

  

### Vehicle

  

```json

{

"id": "uuid",

"company_id": "uuid",

"plate": "34ABC123",

"brand": "Mercedes",

"model": "Sprinter",

"seat_capacity": 16,

"status": "active|passive",

"uetds_last_checked_at": "datetime",

"uetds_status": "unknown|valid|invalid"

}

```

  

UETDS tarafında tüm araçları listeleme methodu görünmediği için araç envanteri sistem içinde tutulmalı; UETDS’ye plaka bazlı kontrol yapılmalıdır.

  

### Personnel / Driver

  

```json

{

"id": "uuid",

"company_id": "uuid",

"type": "driver|guide|assistant",

"first_name": "string",

"last_name": "string",

"identity_no": "string",

"phone": "string",

"status": "active"

}

```

  

### Passenger

  

```json

{

"id": "uuid",

"company_id": "uuid",

"first_name": "string",

"last_name": "string",

"identity_type": "tc|passport|foreign_id|unknown",

"identity_no": "string|null",

"nationality": "TR",

"phone": "string|null"

}

```

  

### Trip

  

```json

{

"id": "uuid",
"company_id": "uuid",
"status": "draft|ready|submitted|failed|cancelled",
"vehicle_id": "uuid",
"driver_id": "uuid",
"departure_at": "datetime",
"arrival_estimated_at": "datetime|null",
"departure_city": "string",
"departure_district": "string",
"departure_address": "string",
"arrival_city": "string",
"arrival_district": "string",
"arrival_address": "string",
"route_note": "string|null",
"passenger_count": 3,
"uetds_reference_no": "long|null",
"created_by": "uuid"
}

```

  

### TripPassenger

  

```json

{

"id": "uuid",

"trip_id": "uuid",

"passenger_id": "uuid",

"seat_no": "string|null",

"uetds_passenger_reference_no": "long|null",

"status": "active|cancelled|not_arrived"

}

```

  

### UETDSOperationLog

  

```json

{

"id": "uuid",

"company_id": "uuid",

"trip_id": "uuid|null",

"operation": "kullaniciKontrol|seferEkle|personelEkle|yolcuEkleCoklu|bildirimOzeti|seferIptal",

"environment": "test|live",

"http_status": 200,

"uetds_sonuc_kodu": "0",

"uetds_sonuc_mesaji": "İŞLEM BAŞARILI",

"request_xml": "masked_text",

"response_xml": "text",

"correlation_id": "string|null",

"created_at": "datetime"

}

```

  

## 9. Backend API tasarımı


Tüm endpointler `/api/v1` altında olmalı.

### Auth

#### POST `/api/v1/auth/login`


Request:

  

```json

{

"email": "ops@example.com",

"password": "secret"

}

```

  

Response:

  

```json

{

"access_token": "jwt",

"refresh_token": "token",

"token_type": "Bearer",

"expires_in": 1800,

"user": {

"id": "uuid",

"name": "Operasyon Kullanıcısı",

"roles": ["dispatcher"]

}

}

```

  

#### POST `/api/v1/auth/refresh`

  

Yeni access token üretir.

  

#### POST `/api/v1/auth/logout`

  

Refresh token iptal eder.

  

---

  

### UETDS settings

  

#### GET `/api/v1/uetds/status`

  

Firma için UETDS test/canlı durumunu döner.

  

Response:

  

```json

{

"test": {

"configured": true,

"last_verified_at": "2026-06-05T20:39:08Z",

"last_result": "success"

},

"live": {

"configured": true,

"last_verified_at": null,

"last_result": null

}

}

```

  

#### POST `/api/v1/uetds/credentials`

  

UETDS credential kaydeder.

  

Request:

  

```json

{

"environment": "test",

"username": "string",

"password": "string"

}

```

  

#### POST `/api/v1/uetds/verify`

  

`kullaniciKontrol` çağırır. Veri oluşturmaz.

  

Request:

  

```json

{

"environment": "test"

}

```

  

Response:

  

```json

{

"success": true,

"sonuc_kodu": "0",

"sonuc_mesaji": "İŞLEM BAŞARILI",

"unet_no": "string",

"firma_unvan": "string"

}

```

  

#### GET `/api/v1/uetds/ip-list`

  

`ipListele` çağrısı için wrapper. Veri oluşturmaz.

  

---

  

### Vehicles

  

#### GET `/api/v1/vehicles`

  

Araç listesini döner. Bu liste lokal DB’den gelir.

  

Query:

  

```text

?search=34ABC&status=active&page=1&page_size=20

```

  

#### POST `/api/v1/vehicles`

  

Araç ekler.

  

```json

{

"plate": "34ABC123",

"brand": "Mercedes",

"model": "Sprinter",

"seat_capacity": 16

}

```

  

#### POST `/api/v1/vehicles/{id}/uetds-check`

  

Plaka bazlı UETDS kontrolü yapar. Önerilen alt çağrılar:

  

- `yetkiBelgesiKontrol`

- `aracMuayeneSorgula`

  

Response:

  

```json

{

"vehicle_id": "uuid",

"plate": "34ABC123",

"valid": true,

"checks": [

{

"operation": "yetkiBelgesiKontrol",

"success": true,

"message": "İŞLEM BAŞARILI"

}

]

}

```

  

---

  

### Personnel

  

#### GET `/api/v1/personnel`

  

Şoför/personel listesi.

  

#### POST `/api/v1/personnel`

  

Personel ekler.

  

```json

{

"type": "driver",

"first_name": "Ahmet",

"last_name": "Yılmaz",

"identity_no": "11111111111",

"phone": "+905xxxxxxxxx"

}

```

  

#### POST `/api/v1/personnel/{id}/uetds-check`

  

`meslekiYeterlilikSorgula` gibi personel kontrol işlemlerini çağırabilir.

  

---

  

### Passengers

  

#### GET `/api/v1/passengers`

  

Yolcu arama/listesi.

  

#### POST `/api/v1/passengers`

  

Yolcu ekler.

  

```json

{

"first_name": "Ayşe",

"last_name": "Demir",

"identity_type": "tc",

"identity_no": "22222222222",

"nationality": "TR",

"phone": "+905xxxxxxxxx"

}

```

  

---

  

### Trips / Transfers

  

#### POST `/api/v1/trips/quick-create`

  

Hızlı sefer girişi için ana endpoint. Web ve mobil uygulama en çok bunu kullanır.

  

Request:

  

```json

{

"departure_at": "2026-06-06T10:30:00+03:00",

"vehicle": {

"plate": "34ABC123"

},

"driver": {

"identity_no": "11111111111"

},

"route": {

"from": {

"city": "İstanbul",

"district": "Bakırköy",

"address": "İstanbul Havalimanı"

},

"to": {

"city": "İstanbul",

"district": "Beşiktaş",

"address": "Otel adı / açık adres"

}

},

"passengers": [

{

"first_name": "Ayşe",

"last_name": "Demir",

"identity_type": "tc",

"identity_no": "22222222222",

"nationality": "TR"

}

],

"submit_to_uetds": false

}

```

  

Response:

  

```json

{

"trip_id": "uuid",

"status": "draft",

"validation": {

"ready_for_uetds": true,

"missing_fields": []

}

}

```

  

Not: `submit_to_uetds=false` default olmalı. Kullanıcı önce draft oluşturur, sonra tek butonla UETDS’ye gönderir.

  

#### POST `/api/v1/trips/{id}/submit-uetds`

  

UETDS’ye gönderim yapar.

  

Request:

  

```json

{

"environment": "test",

"confirm_live_submission": false,

"idempotency_key": "uuid-or-client-generated-key"

}

```

  

Backend akışı:

  

1. Trip validation

2. Araç/personel/yolcu alan kontrolü

3. `seferEkle`

4. UETDS referans no kaydı

5. `personelEkle`

6. `yolcuEkleCoklu`

7. `bildirimOzeti`

8. Trip status = `submitted`

  

Response:

  

```json

{

"trip_id": "uuid",

"status": "submitted",

"uetds_reference_no": 123456789,

"operations": [

{

"operation": "seferEkle",

"success": true,

"sonuc_kodu": "0",

"sonuc_mesaji": "İŞLEM BAŞARILI"

},

{

"operation": "yolcuEkleCoklu",

"success": true

}

]

}

```

  

#### GET `/api/v1/trips/{id}`

  

Sefer detayını döner.

  

#### GET `/api/v1/trips`

  

Seferleri listeler.

  

Query örnekleri:

  

```text

?status=draft

?status=submitted

?date_from=2026-06-01&date_to=2026-06-30

?vehicle_plate=34ABC123

?passenger_name=ayse

```

  

#### POST `/api/v1/trips/{id}/sync-summary`

  

`bildirimOzeti` çağırır, UETDS tarafındaki son durumu DB’ye yazar.

  

#### POST `/api/v1/trips/{id}/cancel-uetds`

  

`seferIptal` çağırır. Canlıda ekstra yetki ister.

  

Request:

  

```json

{

"reason": "Müşteri iptal etti",

"confirm_live_submission": true

}

```

  

---

  

### UETDS operation logs

  

#### GET `/api/v1/uetds/logs`

  

UETDS request/response geçmişini listeler.

  

Query:

  

```text

?trip_id=uuid&operation=seferEkle&success=false

```

  

#### GET `/api/v1/uetds/logs/{id}`

  

Tek log detayını döner. Hassas veriler maskelenmiş olmalı.

  

## 10. Hızlı giriş deneyimi

  

Tarifesiz iş geldiğinde kullanıcı minimum alanla giriş yapabilmeli.


Web/mobil hızlı form alanları:

1. Tarih/saat
2. Araç/plaka
3. Şoför
4. Kalkış noktası
5. Varış noktası
6. Yolcu sayısı
7. Yolcu bilgileri
8. Not
9. UETDS’ye gönder butonu

  
Hızlandırıcı özellikler:
- Son kullanılan araçları öner
- Son kullanılan şoförleri öner
- Sık kullanılan lokasyonlar
- Havalimanı/otel hazır lokasyonları (belki, google api?)
- Plaka yazınca araç otomatik gelsin
- Şoför adı/TC ile arama
- Yolcu pasaport/TC opsiyonlu giriş
- Eksik alanları canlı validation ile göster
- Draft auto-save
- Tek tıkla “test ortamına gönder”
- Canlı gönderimde ekstra onay modalı
- önceden yapılmıs bir seferin geri dmüş butonu olduğu zaman tam tersini alabilmeli


## 11. UETDS adapter tasarımı

  

UETDS SOAP servisleri backend içinde adapter ile soyutlanmalı.

  

```python

class UetdsAriziClient:

def kullanici_kontrol(self): ...

def ip_listele(self): ...

def yetki_belgesi_kontrol(self, plate: str): ...

def arac_muayene_sorgula(self, plate: str): ...

def sefer_ekle(self, trip): ...

def personel_ekle(self, trip, personnel): ...

def yolcu_ekle_coklu(self, trip, passengers): ...

def bildirim_ozeti(self, uetds_reference_no): ...

def sefer_iptal(self, uetds_reference_no, reason: str): ...

```

  

Başlangıçta raw SOAP + requests kullanılabilir. Testte raw SOAP ile başarı alındığı için MVP’de bu yaklaşım daha kontrollüdür.

  

## 12. Idempotency

  

Mobil/web tarafı aynı isteği iki kez gönderebilir. Bu yüzden `submit-uetds` endpoint’i idempotent olmalı.

  

Kurallar:

  

- Client `idempotency_key` gönderir.

- Aynı trip + aynı idempotency key daha önce başarılıysa yeniden UETDS’ye gitmez.

- Aynı trip zaten `submitted` ve `uetds_reference_no` varsa tekrar `seferEkle` yapılmaz.

- Retry gerekiyorsa kaldığı adımdan devam eder.

  

Örnek:

  

```text

seferEkle başarılı, yolcuEkleCoklu başarısız

→ tekrar denemede seferEkle yapılmaz

→ mevcut uetds_reference_no ile yolcuEkleCoklu tekrar denenir

```

  

## 13. State machine

  

Trip statusları:

  

```text

draft

ready

submitting

submitted

partial_failed

failed

cancel_requested

cancelled

```

  

UETDS operasyon statusları:

  

```text

pending

processing

success

failed

retrying

skipped

```

  

## 14. Queue/worker önerisi

  

UETDS çağrıları senkron veya asenkron yapılabilir.

  

MVP için iki seçenek:

  

### Senkron

  

Kullanıcı “Gönder” der, backend UETDS’ye gider ve sonucu bekler.

  

Artı: Basit.

  

Eksi: Mobilde timeout/hata deneyimi kötü olabilir.

  

### Asenkron

  

`submit-uetds` çağrısı job oluşturur, worker UETDS’ye gönderir.

  

Response:

  

```json

{

"trip_id": "uuid",

"job_id": "uuid",

"status": "submitting"

}

```

  

Mobil/web `/jobs/{id}` veya websocket ile sonucu takip eder.

  

Öneri: İlk prototipte senkron başla, ama veri modelini asenkrona uygun tasarla.

  

## 15. Hata yönetimi

  

Standart backend hata formatı:

  

```json

{

"success": false,

"error_code": "UETDS_AUTH_FAILED",

"message": "UETDS kullanıcı adı veya şifre hatalı.",

"details": {

"uetds_sonuc_kodu": "...",

"uetds_sonuc_mesaji": "..."

}

}

```

  

Örnek hata kodları:

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `UETDS_AUTH_FAILED`
- `UETDS_IP_NOT_ALLOWED`
- `UETDS_TIMEOUT`
- `UETDS_INVALID_RESPONSE`
- `TRIP_ALREADY_SUBMITTED`
- `LIVE_CONFIRMATION_REQUIRED`
- `MISSING_REQUIRED_FIELD`

  

## 16. Güvenlik

- UETDS kullanıcı adı/şifre encrypted saklanmalı.
- Loglarda şifre, TC, pasaport gibi hassas bilgiler maskelenmeli.
- Canlı gönderim yetkisi ayrı permission olmalı.
- IP whitelist ve outbound IP izlenmeli.
- Audit log tutulmalı.
- Rate limit olmalı.
- Refresh token rotation yapılmalı.
- Mobil uygulama için device/session yönetimi olmalı.
- KVKK kapsamında veri saklama/silme politikası olmalı.


## 17. OpenAPI taslak endpoint listesi

  

```text

POST /api/v1/auth/login

POST /api/v1/auth/refresh

POST /api/v1/auth/logout

GET /api/v1/me

  

GET /api/v1/uetds/status

POST /api/v1/uetds/credentials

POST /api/v1/uetds/verify

GET /api/v1/uetds/ip-list

GET /api/v1/uetds/logs

GET /api/v1/uetds/logs/{id}

  

GET /api/v1/vehicles

POST /api/v1/vehicles

GET /api/v1/vehicles/{id}

PATCH /api/v1/vehicles/{id}

POST /api/v1/vehicles/{id}/uetds-check

  

GET /api/v1/personnel

POST /api/v1/personnel

GET /api/v1/personnel/{id}

PATCH /api/v1/personnel/{id}

POST /api/v1/personnel/{id}/uetds-check

  

GET /api/v1/passengers

POST /api/v1/passengers

GET /api/v1/passengers/{id}

PATCH /api/v1/passengers/{id}

  

GET /api/v1/trips

POST /api/v1/trips/quick-create

GET /api/v1/trips/{id}

PATCH /api/v1/trips/{id}

POST /api/v1/trips/{id}/submit-uetds

POST /api/v1/trips/{id}/sync-summary

POST /api/v1/trips/{id}/cancel-uetds

```

  ## 18. Codex geliştirme sırası

Önerilen geliştirme planı:

1. Proje iskeleti

2. Auth/JWT sistemi

3. DB modelleri

4. Vehicle/personnel/passenger CRUD

5. Trip quick-create

6. UETDS raw SOAP client

7. `kullaniciKontrol` entegrasyonu

8. `ipListele` entegrasyonu

9. `seferEkle` payload mapping

10. `personelEkle`

11. `yolcuEkleCoklu`

12. `bildirimOzeti`

13. Operation logs

14. Retry/idempotency

15. OpenAPI dokümantasyonu

16. Web/mobile hızlı giriş ekranları

17.  Bruno api hazırlansın test için


## 19. Codex prompt önerisi

  

```text

Django tabanlı, PostgreSQL kullanan bir UETDS Tarifesiz Yolcu backend API geliştir.

JWT auth, role/permission sistemi, vehicle/personnel/passenger/trip modelleri ve UETDS raw SOAP adapter katmanı olsun.

İlk aşamada UETDS test endpointinde kullaniciKontrol ve ipListele methodlarını çalıştır.

Sonra quick-create trip endpointi ve submit-uetds orchestration endpointi ekle.

Canlı ortam için write operation guard, idempotency key, operation logs ve masked request/response logging zorunlu olsun.

OpenAPI endpointleri bu dokümandaki tasarıma uygun olsun.

```


## 20. Kritik kararlar

- UETDS SOAP detayları client uygulamalara asla açılmayacak.

- Web ve mobil yalnızca bizim REST/JSON API’mizi kullanacak.

- Araç listesi lokal DB’de tutulacak; UETDS’de tüm araçları listeleme varsayılmayacak.

- Canlı kayıt oluşturan işlemler ayrı permission ve confirmation ister.
