import re


SENSITIVE_PATTERNS = [
    (re.compile(r"(<[^>]*(?:sifre|password|parola)[^>]*>)(.*?)(</[^>]+>)", re.I | re.S), r"\1***\3"),
    (re.compile(r"(<[^>]*(?:tcKimlikNo|kimlik|pasaport|telefon|phone)[^>]*>)(.*?)(</[^>]+>)", re.I | re.S), r"\1***\3"),
    (re.compile(r"\b\d{11}\b"), "***"),
    (re.compile(r"\+?90?\d{10}\b"), "***"),
]


def mask_sensitive(value):
    if not value:
        return ""
    masked = str(value)
    for pattern, replacement in SENSITIVE_PATTERNS:
        masked = pattern.sub(replacement, masked)
    return masked
