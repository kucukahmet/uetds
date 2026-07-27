from rest_framework import serializers

from fleet.models import Vehicle


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = [
            "id",
            "plate",
            "brand",
            "model",
            "seat_capacity",
            "phone",
            "status",
            "uetds_status",
            "uetds_last_checked_at",
            "uetds_authorization_document_no",
            "uetds_authorization_document_type",
            "uetds_company_title",
            "uetds_unet_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "uetds_status",
            "uetds_last_checked_at",
            "uetds_authorization_document_no",
            "uetds_authorization_document_type",
            "uetds_company_title",
            "uetds_unet_no",
            "created_at",
            "updated_at",
        ]

    def validate_phone(self, value):
        value = (value or "").strip()
        if value and not value.isdigit():
            raise serializers.ValidationError("Araç telefonu sadece sayı olmalı.")
        if value and not 10 <= len(value) <= 15:
            raise serializers.ValidationError("Araç telefonu 10-15 haneli olmalı.")
        return value

    def validate_seat_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("Koltuk sayısı pozitif sayı olmalı.")
        return value
