import re

from rest_framework import serializers

from common.identity import is_valid_turkish_identity_no
from people.models import Personnel


NAME_PATTERN = re.compile(r"^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû\s'-]+$")


class PersonnelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Personnel
        fields = [
            "id",
            "type",
            "first_name",
            "last_name",
            "identity_no",
            "nationality",
            "gender",
            "phone",
            "address",
            "uetds_role_code",
            "src_codes",
            "status",
            "uetds_last_checked_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uetds_last_checked_at", "created_at", "updated_at"]

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
        value = value.strip()
        if not re.fullmatch(r"\d{11}", value):
            raise serializers.ValidationError("T.C. Kimlik 11 haneli sayı olmalı.")
        if not is_valid_turkish_identity_no(value):
            raise serializers.ValidationError("T.C. Kimlik numarası geçersiz.")
        view = self.context.get("view")
        if view:
            company = view.get_company()
            queryset = Personnel.objects.filter(company=company, identity_no=value)
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError("Bu kimlik/pasaport numarası bu firmada zaten kayıtlı.")
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

    def validate_nationality(self, value):
        value = (value or "").strip().upper()
        if not re.fullmatch(r"[A-Z]{2,3}", value):
            raise serializers.ValidationError("Uyruk 2 veya 3 harfli ülke kodu olmalı.")
        return value

    def validate_phone(self, value):
        value = (value or "").strip()
        if value and not re.fullmatch(r"\d{10,15}", value):
            raise serializers.ValidationError("Telefon 10-15 haneli sayı olmalı.")
        return value

    def validate_uetds_role_code(self, value):
        if value < 0:
            raise serializers.ValidationError("Görev kodu sayı olmalı.")
        return value

    def create(self, validated_data):
        validated_data["status"] = Personnel.Status.PASSIVE
        return super().create(validated_data)

    def update(self, instance, validated_data):
        old_identity_no = instance.identity_no
        personnel = super().update(instance, validated_data)
        if "identity_no" in validated_data and personnel.identity_no != old_identity_no:
            personnel.status = Personnel.Status.PASSIVE
            personnel.uetds_last_checked_at = None
            personnel.save(update_fields=["status", "uetds_last_checked_at", "updated_at"])
        return personnel
