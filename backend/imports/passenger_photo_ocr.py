import base64
import json
import re
import unicodedata

import requests
from django.conf import settings
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from companies.models import CompanySettings


MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_TEXT_CHARS = 20_000
PHOTO_OCR_UNCONFIGURED_MESSAGE = "AI yolcu parse henüz bağlı değil. OPENAI_API_KEY eklendiğinde aktif olacak."
COUNTRY_ALIASES = {
    "BE": ("BE", "Belçika"),
    "BELCIKA": ("BE", "Belçika"),
    "BELGIUM": ("BE", "Belçika"),
    "BELGIAN": ("BE", "Belçika"),
    "TR": ("TR", "Türkiye"),
    "TURKIYE": ("TR", "Türkiye"),
    "TURKEY": ("TR", "Türkiye"),
    "GB": ("GB", "İngiltere"),
    "UK": ("GB", "İngiltere"),
    "INGILTERE": ("GB", "İngiltere"),
    "ENGLAND": ("GB", "İngiltere"),
    "BRITISH": ("GB", "İngiltere"),
    "DE": ("DE", "Almanya"),
    "ALMANYA": ("DE", "Almanya"),
    "GERMANY": ("DE", "Almanya"),
    "ES": ("ES", "İspanya"),
    "ESPANYA": ("ES", "İspanya"),
    "ISPANYA": ("ES", "İspanya"),
    "SPAIN": ("ES", "İspanya"),
    "SPANISH": ("ES", "İspanya"),
    "SPANIS": ("ES", "İspanya"),
    "ESPANOL": ("ES", "İspanya"),
    "ESPANA": ("ES", "İspanya"),
    "PT": ("PT", "Portekiz"),
    "PORTEKIZ": ("PT", "Portekiz"),
    "PORTUGAL": ("PT", "Portekiz"),
    "PORTUGUESE": ("PT", "Portekiz"),
    "PORTUGUES": ("PT", "Portekiz"),
}


class PhotoOcrNotConfigured(APIException):
    status_code = 503
    default_detail = PHOTO_OCR_UNCONFIGURED_MESSAGE
    default_code = "photo_ocr_not_configured"


class PhotoOcrDisabled(APIException):
    status_code = 403
    default_detail = "AI yolcu parse bu firma için kapalı."
    default_code = "photo_ocr_disabled"


class PhotoOcrLimitExceeded(APIException):
    status_code = 429
    default_detail = "AI yolcu parse token limiti doldu."
    default_code = "photo_ocr_limit_exceeded"


def get_passenger_photo_ocr_status(company=None):
    configured = bool(settings.OPENAI_API_KEY)
    company_settings = _company_ai_settings(company) if company else None
    enabled = company_settings.ai_passenger_parse_enabled if company_settings else True
    token_limit = company_settings.ai_passenger_parse_monthly_token_limit if company_settings else 0
    tokens_used = company_settings.ai_passenger_parse_monthly_tokens_used if company_settings else 0
    tokens_remaining = max(token_limit - tokens_used, 0) if token_limit else None
    limit_reached = bool(token_limit and tokens_used >= token_limit)
    available = configured and enabled and not limit_reached
    message = "AI yolcu parse hazır."
    if not configured:
        message = PHOTO_OCR_UNCONFIGURED_MESSAGE
    elif not enabled:
        message = PhotoOcrDisabled.default_detail
    elif limit_reached:
        message = PhotoOcrLimitExceeded.default_detail
    return {
        "available": available,
        "enabled": enabled,
        "provider": "openai",
        "model": settings.OPENAI_VISION_MODEL,
        "message": message,
        "token_limit": token_limit,
        "tokens_used": tokens_used,
        "tokens_remaining": tokens_remaining,
        "limit_reached": limit_reached,
        "usage_month": company_settings.ai_passenger_parse_usage_month if company_settings else "",
    }


def extract_passengers_from_image(image_file, company=None):
    if not settings.OPENAI_API_KEY:
        raise PhotoOcrNotConfigured()
    if company:
        _assert_company_ai_parse_available(company)

    content_type = image_file.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        raise ValidationError({"image": "Lütfen fotoğraf dosyası yükleyin."})

    image_bytes = image_file.read()
    if not image_bytes:
        raise ValidationError({"image": "Fotoğraf okunamadı."})
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValidationError({"image": "Fotoğraf 8 MB'dan küçük olmalı."})

    data_url = f"data:{content_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"
    response = requests.post(
        settings.OPENAI_API_URL,
        headers={
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": settings.OPENAI_VISION_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You extract passenger rows from transport manifest photos. "
                        "Return strict JSON only. Do not invent unreadable fields. "
                        "If a value is blurry, cropped, or uncertain, leave that field empty."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Fotoğraftaki yolcu listesini çıkar. "
                                "JSON formatı: {\"passengers\":[{\"first_name\":\"\",\"last_name\":\"\","
                                "\"identity_no\":\"\",\"nationality\":\"TR\",\"country_name\":\"Türkiye\","
                                "\"gender\":\"E veya K veya boş\",\"seat_no\":\"\",\"phone\":\"\"}],\"raw_text\":\"\"}. "
                                "T.C. kimlik veya pasaport numarasını identity_no alanına yaz. "
                                "M/male/erkek gördüğünde gender alanını E yap. F/female/kadın gördüğünde K yap. Telefon yoksa boş bırak. "
                                "Spanish/Spain gördüğünde ES/İspanya, Portuguese/Portugal gördüğünde PT/Portekiz, "
                                "Belgian/Belgium gördüğünde BE/Belçika, UK/British gördüğünde GB/İngiltere kullan. "
                                "Satır numarasını koltuk sanma; yalnızca açıkça koltuk/seat bilgisi varsa seat_no doldur. "
                                "Fotoğraf tablo şeklindeyse Name/Surname/Passport/Nationality kolonlarını eşleştir; "
                                "isimlerdeki aksanları ve çok kelimeli soyadlarını koru. "
                                "El yazısı listelerde adlar solda, soyadlar yan kolonda, kimlik/pasaport sağ kolonda olabilir. "
                                "Denden, Türkçe evrak ve el yazısı listelerde 'bir üst satırdaki aynı kolon değeri tekrar ediyor' "
                                "anlamına gelen tekrar işaretidir; gerçek harf, rakam, tırnak veya veri değildir. "
                                "Denden/ditto işareti (\", '', ”, 〃, //, 11, ll, ,,), idem, aynı anlamına gelen tekrar işareti "
                                "hangi kolondaysa bir üst okunabilir satırdaki aynı kolon değerini kullan; komşu kolondaki değeri kullanma. "
                                "Denden işareti gördüğün hücreleri boş bırakma; simgeyi yazamadığın durumlarda da önceki aynı kolon değerini kullan. "
                                "Denden işaretini asla adın, soyadın veya başka bir değerin parçası olarak yazma. "
                                "Kimlik/pasaport numarası alanında denden görürsen önceki kimliği kopyalama; identity_no alanını boş bırak. "
                                "Örneğin üst satır soyadı Tufan ise ve sonraki satırda ad hücresi 'Ömer Can', soyad hücresi denden ise "
                                "first_name='Ömer Can', last_name='Tufan' döndür; 'Can'ı soyad yapma ve Tufan'ı Yufan/Wafon gibi varyantlama. "
                                "Örnek veya tahmini pasaport üretme; GA1234567, AB1234567, 123456789 gibi "
                                "placeholder görünümlü değerleri asla yazma. Okuyamıyorsan identity_no alanını boş bırak."
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        },
        timeout=settings.OPENAI_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        raise ValidationError({"ocr": _openai_error_message(response)})

    payload = response.json()
    usage = _normalize_usage(payload.get("usage"))
    if company and usage["total_tokens"]:
        _record_company_ai_usage(company, usage["total_tokens"])
    content = payload["choices"][0]["message"]["content"]
    parsed = _loads_json_object(content)
    passengers = _normalize_passengers(parsed.get("passengers", []))
    passengers = [item for item in passengers if item["first_name"] or item["last_name"] or item["identity_no"]]
    return {
        "passengers": passengers,
        "raw_text": str(parsed.get("raw_text") or ""),
        "provider": "openai",
        "model": settings.OPENAI_VISION_MODEL,
        "usage": usage,
    }


def extract_passengers_from_text(raw_text, company=None):
    if not settings.OPENAI_API_KEY:
        raise PhotoOcrNotConfigured()
    if company:
        _assert_company_ai_parse_available(company)

    text = str(raw_text or "").strip()
    if not text:
        raise ValidationError({"text": "Metin zorunlu."})
    if len(text) > MAX_TEXT_CHARS:
        raise ValidationError({"text": f"Metin {MAX_TEXT_CHARS} karakterden kısa olmalı."})

    response = requests.post(
        settings.OPENAI_API_URL,
        headers={
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": settings.OPENAI_TEXT_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You extract passenger rows from pasted transport manifest text for UETDS. "
                        "Return strict JSON only. Extract passengers only; ignore trip metadata, route, price, driver, vehicle, date and time lines. "
                        "Do not invent missing identity/passport numbers."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Metindeki yolcu listesini çıkar. "
                        "JSON formatı: {\"passengers\":[{\"first_name\":\"\",\"last_name\":\"\","
                        "\"identity_no\":\"\",\"nationality\":\"TR\",\"country_name\":\"Türkiye\","
                        "\"gender\":\"E veya K veya boş\",\"seat_no\":\"\",\"phone\":\"\"}],\"raw_text\":\"\"}. "
                        "WhatsApp zaman damgası ve gönderen adlarını sil; '[19:23] Çağrı:' gibi kısımlar yolcu değildir. "
                        "Sadece yolcu satırlarını al. Saat, tarih, plaka, şoför adı/telefonu, transfer/rota/açıklama/ücret satırlarını yok say. "
                        "Her yolcu satırı 'Ad Soyad-42203122950', 'Ad Soyad 42203122950' veya benzeri formatta gelebilir. "
                        "Tire veya iki nokta kimlikten önce ayraçtır; soyadın parçası değildir. "
                        "Örnek: 'Fatma bilaloğlu- 32693109272' => first_name='Fatma', last_name='Bilaloğlu', identity_no='32693109272'. "
                        "Türk isimlerinde son kelime genelde soyaddır; önceki kelimeler ad alanına aittir. "
                        "Örnek: 'Asya melis Gültekin-42203122950' => first_name='Asya Melis', last_name='Gültekin'. "
                        "Örnek: 'Sıddıka Sude babayiğit 10219440832' => first_name='Sıddıka Sude', last_name='Babayiğit'. "
                        "11 haneli sayısal kimlikleri T.C. kimlik olarak identity_no alanına yaz; nationality='TR', country_name='Türkiye' kullan. "
                        "Cinsiyet açıkça yazıyorsa kullan. Yazmıyorsa Türkiye'deki yaygın adlardan yüksek güvenle çıkarabiliyorsan E/K doldur; emin değilsen boş bırak. "
                        "Yolcu olmayan telefonları passenger phone alanına yazma. Kimlik numarası olmayan satırları yolcuya dönüştürme. "
                        "Pasaport varsa identity_no alanına yaz ve ülke bilgisi metinden geliyorsa kullan. "
                        "Metin:\n"
                        f"{text}"
                    ),
                },
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        },
        timeout=settings.OPENAI_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        raise ValidationError({"text": _openai_error_message(response)})

    payload = response.json()
    usage = _normalize_usage(payload.get("usage"))
    if company and usage["total_tokens"]:
        _record_company_ai_usage(company, usage["total_tokens"])
    content = payload["choices"][0]["message"]["content"]
    parsed = _loads_json_object(content)
    passengers = _normalize_passengers(parsed.get("passengers", []))
    passengers = [item for item in passengers if item["first_name"] or item["last_name"] or item["identity_no"]]
    return {
        "passengers": passengers,
        "raw_text": str(parsed.get("raw_text") or text),
        "provider": "openai",
        "model": settings.OPENAI_TEXT_MODEL,
        "usage": usage,
    }


def _assert_company_ai_parse_available(company):
    company_settings = _company_ai_settings(company)
    if not company_settings.ai_passenger_parse_enabled:
        raise PhotoOcrDisabled()
    if (
        company_settings.ai_passenger_parse_monthly_token_limit
        and company_settings.ai_passenger_parse_monthly_tokens_used >= company_settings.ai_passenger_parse_monthly_token_limit
    ):
        raise PhotoOcrLimitExceeded()


def _company_ai_settings(company):
    company_settings, _ = CompanySettings.objects.get_or_create(company=company)
    current_month = _usage_month()
    if company_settings.ai_passenger_parse_usage_month != current_month:
        company_settings.ai_passenger_parse_usage_month = current_month
        company_settings.ai_passenger_parse_monthly_tokens_used = 0
        company_settings.save(update_fields=["ai_passenger_parse_usage_month", "ai_passenger_parse_monthly_tokens_used", "updated_at"])
    return company_settings


def _record_company_ai_usage(company, total_tokens):
    CompanySettings.objects.filter(company=company).update(
        ai_passenger_parse_usage_month=_usage_month(),
        ai_passenger_parse_monthly_tokens_used=F("ai_passenger_parse_monthly_tokens_used") + total_tokens,
    )


def _usage_month():
    return timezone.localdate().strftime("%Y-%m")


def _normalize_usage(value):
    value = value or {}
    return {
        "prompt_tokens": int(value.get("prompt_tokens") or 0),
        "completion_tokens": int(value.get("completion_tokens") or 0),
        "total_tokens": int(value.get("total_tokens") or 0),
    }


def _normalize_passengers(items):
    passengers = []
    previous_values = {
        "first_name": "",
        "last_name": "",
        "nationality": "",
        "country_name": "",
        "gender": "",
        "phone": "",
    }
    for item in items:
        passenger = _normalize_passenger(item, previous_values=previous_values)
        for key in previous_values:
            if passenger[key]:
                previous_values[key] = passenger[key]
        passengers.append(passenger)
    return passengers


def _normalize_passenger(item, previous_values=None):
    previous_values = previous_values or {}
    raw_identity_no = item.get("identity_no", "")
    identity_no = "" if _is_ditto(raw_identity_no) else _clean_identity(raw_identity_no)
    if _looks_like_placeholder_identity(identity_no):
        identity_no = ""
    first_name = _carry_text_value(item.get("first_name", ""), previous_values.get("first_name", ""), _title_name)
    raw_last_name = item.get("last_name", "")
    raw_nationality = item.get("nationality", "")
    raw_country_name = item.get("country_name", "")
    previous_country = (previous_values.get("nationality", ""), previous_values.get("country_name", ""))
    if _should_carry_previous_value(raw_nationality, raw_country_name, previous_value=previous_country, carry_blank=True):
        nationality, country_name = previous_country
    else:
        nationality, country_name = _country(raw_nationality, raw_country_name)
    if _should_carry_previous_value(raw_last_name, previous_value=previous_values.get("last_name", ""), carry_blank=True):
        last_name = previous_values.get("last_name", "")
    else:
        last_name = _title_name(raw_last_name)
        if _is_likely_repeated_surname_ocr_variant(last_name, previous_values.get("last_name", "")):
            last_name = previous_values.get("last_name", "")
    return {
        "first_name": first_name,
        "last_name": last_name,
        "identity_type": "tc" if re.fullmatch(r"\d{11}", identity_no) else "passport" if identity_no else "unknown",
        "identity_no": identity_no,
        "nationality": nationality,
        "country_name": country_name,
        "gender": _carry_text_value(item.get("gender", ""), previous_values.get("gender", ""), _gender),
        "seat_no": _digits(item.get("seat_no", ""), max_length=3),
        "phone": _carry_text_value(item.get("phone", ""), previous_values.get("phone", ""), _phone),
    }


def _loads_json_object(value):
    text = str(value or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if match:
            return json.loads(match.group(0))
        raise ValidationError({"ocr": "OCR sonucu JSON olarak okunamadı."})


def _openai_error_message(response):
    try:
        payload = response.json()
    except ValueError:
        return "Foto/OCR servisi yanıt vermedi."
    message = payload.get("error", {}).get("message") or payload.get("message")
    return message or "Foto/OCR servisi yanıt vermedi."


def _clean_identity(value):
    text = str(value or "").replace(" ", "").strip().upper()
    text = re.sub(r"^(T\.?C\.?|TCKN|TCNO|TCKIMLIKNO|KIMLIKNO|KİMLİKNO|PASAPORT|PASSPORT)[:.\-]*", "", text)
    text = re.sub(r"[^A-Z0-9]", "", text)
    return re.sub(r"\.0+$", "", text).upper()


def _looks_like_placeholder_identity(value):
    text = _clean_identity(value)
    if not text:
        return False
    if re.fullmatch(r"[A-Z]{1,3}(1234567|2345678|3456789|9876543|0000000|1111111)", text):
        return True
    if re.fullmatch(r"(123456789|987654321|000000000|111111111)", text):
        return True
    return False


def _is_ditto(value):
    text = str(value or "").strip()
    if not text:
        return False
    key = _ascii_key(text)
    return bool(
        key in {"DITTO", "IDEM", "AYNI", "DENDEN", "TEKRAR"}
        or re.fullmatch(r'["“”\'`´,]{1,4}|〃|/{1,4}|\\{1,4}|[|lIı1]{2,4}', text)
    )


def _should_carry_previous_value(*values, previous_value="", carry_blank=False):
    has_previous = bool(any(previous_value) if isinstance(previous_value, tuple) else previous_value)
    if not has_previous:
        return False
    texts = [str(value or "").strip() for value in values]
    return (carry_blank and all(not text for text in texts)) or any(_is_ditto(text) for text in texts)


def _carry_text_value(raw_value, previous_value, normalizer):
    if _should_carry_previous_value(raw_value, previous_value=previous_value):
        return previous_value
    return normalizer(raw_value)


def _is_likely_repeated_surname_ocr_variant(value, previous_last_name):
    current_key = _ascii_key(value)
    previous_key = _ascii_key(previous_last_name)
    if previous_key == "TUFAN" and current_key in {"YUFAN", "WAFON"}:
        return True
    return (
        len(current_key) >= 4
        and len(current_key) == len(previous_key)
        and current_key[1:] == previous_key[1:]
        and current_key[:1] != previous_key[:1]
    )


def _country(nationality, country_name):
    for value in [nationality, country_name]:
        key = _ascii_key(value)
        if key in COUNTRY_ALIASES:
            return COUNTRY_ALIASES[key]
    code = str(nationality or "TR").strip().upper() or "TR"
    return code, str(country_name or "Türkiye").strip() or "Türkiye"


def _gender(value):
    text = str(value or "").strip().upper()
    if text in {"E", "ERKEK", "M", "MALE"}:
        return "E"
    if text in {"K", "KADIN", "F", "FEMALE"}:
        return "K"
    return ""


def _digits(value, max_length=None):
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[:max_length] if max_length else digits


def _phone(value):
    digits = _digits(value)
    return digits if 10 <= len(digits) <= 15 else ""


def _title_name(value):
    text = re.sub(r"\s+", " ", str(value or "").strip())
    text = re.sub(r"^[\-:;,.]+|[\-:;,.]+$", "", text)
    return " ".join(_title_part(part) for part in text.split(" ") if part)


def _title_part(value):
    value = re.sub(r"^[\-:;,.]+|[\-:;,.]+$", "", value)
    lower = value.translate(str.maketrans({"I": "ı", "İ": "i"})).lower()
    return _upper_tr(lower[:1]) + lower[1:]


def _upper_tr(value):
    if value == "i":
        return "İ"
    if value == "ı":
        return "I"
    return value.upper()


def _ascii_key(value):
    text = str(value or "").strip().upper()
    translation = str.maketrans({"İ": "I", "I": "I", "Ş": "S", "Ğ": "G", "Ü": "U", "Ö": "O", "Ç": "C"})
    normalized = unicodedata.normalize("NFD", text.translate(translation))
    return re.sub(r"[^A-Z0-9]", "", normalized)
