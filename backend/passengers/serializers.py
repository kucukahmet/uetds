import re

from rest_framework import serializers

from common.identity import is_valid_turkish_identity_no
from passengers.models import Passenger


NAME_PATTERN = re.compile(r"^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû\s'-]+$")


class PassengerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Passenger
        fields = [
            "id",
            "first_name",
            "last_name",
            "identity_type",
            "identity_no",
            "nationality",
            "country_name",
            "gender",
            "phone",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_first_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Ad zorunlu.")
        if not NAME_PATTERN.fullmatch(value):
            raise serializers.ValidationError("Ad sadece harf içermeli.")
        return value

    def validate_last_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Soyad zorunlu.")
        if not NAME_PATTERN.fullmatch(value):
            raise serializers.ValidationError("Soyad sadece harf içermeli.")
        return value

    def validate_identity_no(self, value):
        return (value or "").strip().upper()

    def validate_nationality(self, value):
        value = (value or "").strip().upper()
        if not re.fullmatch(r"[A-Z]{2,3}", value):
            raise serializers.ValidationError("Ülke kodu 2 veya 3 harf olmalı.")
        return value

    def validate_gender(self, value):
        normalized = (value or "").strip().lower()
        if not normalized:
            raise serializers.ValidationError("Cinsiyet seçilmeli.")
        if normalized in {"k", "kadın", "kadin", "f", "female"}:
            return "K"
        if normalized in {"e", "erkek", "m", "male"}:
            return "E"
        raise serializers.ValidationError("Cinsiyet Kadın veya Erkek olmalı.")

    def validate_phone(self, value):
        value = (value or "").strip()
        if value and not re.fullmatch(r"\d{10,15}", value):
            raise serializers.ValidationError("Telefon 10-15 haneli sayı olmalı.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        identity_type = attrs.get("identity_type") or getattr(self.instance, "identity_type", Passenger.IdentityType.UNKNOWN)
        identity_no = attrs.get("identity_no") or getattr(self.instance, "identity_no", "") or ""

        if identity_type == Passenger.IdentityType.TC:
            if not re.fullmatch(r"\d{11}", identity_no):
                raise serializers.ValidationError({"identity_no": "T.C. Kimlik 11 haneli sayı olmalı."})
            if not is_valid_turkish_identity_no(identity_no):
                raise serializers.ValidationError({"identity_no": "T.C. Kimlik numarası geçersiz."})
        elif identity_type != Passenger.IdentityType.UNKNOWN:
            if not re.fullmatch(r"[A-Z0-9]{3,32}", identity_no):
                raise serializers.ValidationError({"identity_no": "Kimlik/Pasaport 3-32 haneli harf ve sayı olmalı."})

        return attrs
