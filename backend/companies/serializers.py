from django.conf import settings
from rest_framework import serializers

from companies.models import Company, CompanyMembership, CompanySettings


class CompanySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanySettings
        fields = [
            "live_uetds_enabled",
            "default_uetds_environment",
            "session_days",
            "ai_passenger_parse_enabled",
            "ai_passenger_parse_monthly_token_limit",
            "ai_passenger_parse_monthly_tokens_used",
            "ai_passenger_parse_usage_month",
        ]
        read_only_fields = [
            "session_days",
            "ai_passenger_parse_enabled",
            "ai_passenger_parse_monthly_token_limit",
            "ai_passenger_parse_monthly_tokens_used",
            "ai_passenger_parse_usage_month",
        ]

    def validate_default_uetds_environment(self, value):
        if value not in settings.UETDS_ALLOWED_ENVIRONMENTS:
            raise serializers.ValidationError("Bu UETDS ortamı backend kurulumunda açık değil.")
        return value

class CompanySerializer(serializers.ModelSerializer):
    settings = CompanySettingsSerializer(read_only=True)

    class Meta:
        model = Company
        fields = ["id", "name", "tax_no", "unet_no", "status", "settings", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class CompanyMembershipSerializer(serializers.ModelSerializer):
    company = CompanySerializer(read_only=True)

    class Meta:
        model = CompanyMembership
        fields = ["id", "company", "role", "is_active"]
