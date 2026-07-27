from django.conf import settings
from rest_framework import serializers

from uetds.models import UETDSCredential, UETDSOperationLog
from uetds.services import validate_environment as validate_uetds_environment


class UETDSCredentialSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True)
    environment = serializers.CharField()

    class Meta:
        model = UETDSCredential
        fields = ["id", "environment", "username", "password", "endpoint_url", "is_active", "last_verified_at", "last_result"]
        read_only_fields = ["id", "last_verified_at", "last_result"]

    def validate_environment(self, value):
        return validate_uetds_environment(value)

    def create(self, validated_data):
        username = validated_data.pop("username")
        password = validated_data.pop("password")
        environment = validated_data["environment"]
        endpoint_url = settings.UETDS_LIVE_URL if environment == "live" else settings.UETDS_TEST_URL
        instance, _ = UETDSCredential.objects.update_or_create(
            company=validated_data["company"],
            environment=environment,
            defaults={
                "endpoint_url": endpoint_url,
                "is_active": validated_data.get("is_active", True),
            },
        )
        instance.set_username(username)
        instance.set_password(password)
        instance.last_verified_at = None
        instance.last_result = "pending"
        instance.save()
        return instance


class VerifySerializer(serializers.Serializer):
    environment = serializers.CharField(default="test")

    def validate_environment(self, value):
        return validate_uetds_environment(value)


class UETDSOperationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = UETDSOperationLog
        fields = [
            "id",
            "trip",
            "operation",
            "environment",
            "http_status",
            "success",
            "uetds_sonuc_kodu",
            "uetds_sonuc_mesaji",
            "request_xml",
            "response_xml",
            "correlation_id",
            "created_at",
        ]
        read_only_fields = fields
