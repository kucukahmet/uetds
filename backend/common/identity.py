import re


def is_valid_turkish_identity_no(value):
    text = str(value or "").strip()
    if not re.fullmatch(r"\d{11}", text) or text[0] == "0":
        return False
    digits = [int(char) for char in text]
    tenth_digit = ((sum(digits[0:9:2]) * 7) - sum(digits[1:8:2])) % 10
    eleventh_digit = sum(digits[:10]) % 10
    return digits[9] == tenth_digit and digits[10] == eleventh_digit
