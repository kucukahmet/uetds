import base64
import json
import re
import unicodedata

import requests
from django.conf import settings
from rest_framework.exceptions import APIException, ValidationError


MAX_IMAGE_BYTES = 8 * 1024 * 1024
PHOTO_OCR_UNCONFIGURED_MESSAGE = "Foto/OCR henüz bağlı değil. OPENAI_API_KEY eklendiğinde aktif olacak."
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


def get_passenger_photo_ocr_status():
    configured = bool(settings.OPENAI_API_KEY)
    return {
        "available": configured,
        "provider": "openai",
        "model": settings.OPENAI_VISION_MODEL,
        "message": "Foto/OCR hazır." if configured else PHOTO_OCR_UNCONFIGURED_MESSAGE,
    }


def extract_passengers_from_image(image_file):
    if not settings.OPENAI_API_KEY:
        raise PhotoOcrNotConfigured()

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
                        "Return strict JSON only. Do not invent unreadable fields."
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
                                "isimlerdeki aksanları ve çok kelimeli soyadlarını koru."
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
    content = payload["choices"][0]["message"]["content"]
    parsed = _loads_json_object(content)
    passengers = [_normalize_passenger(item) for item in parsed.get("passengers", [])]
    passengers = [item for item in passengers if item["first_name"] or item["last_name"] or item["identity_no"]]
    return {"passengers": passengers, "raw_text": str(parsed.get("raw_text") or ""), "provider": "openai", "model": settings.OPENAI_VISION_MODEL}


def _normalize_passenger(item):
    identity_no = _clean_identity(item.get("identity_no", ""))
    nationality, country_name = _country(item.get("nationality", ""), item.get("country_name", ""))
    return {
        "first_name": _title_name(item.get("first_name", "")),
        "last_name": _title_name(item.get("last_name", "")),
        "identity_type": "tc" if re.fullmatch(r"\d{11}", identity_no) else "passport" if identity_no else "unknown",
        "identity_no": identity_no,
        "nationality": nationality,
        "country_name": country_name,
        "gender": _gender(item.get("gender", "")),
        "seat_no": _digits(item.get("seat_no", ""), max_length=3),
        "phone": _phone(item.get("phone", "")),
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
    text = str(value or "").replace(" ", "").strip()
    return re.sub(r"\.0+$", "", text).upper()


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
    return " ".join(_title_part(part) for part in text.split(" ") if part)


def _title_part(value):
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
