from rest_framework import serializers

from agencies.models import Agency, AgencyContact


class AgencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Agency
        fields = ["id", "name", "tax_no", "phone", "email", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class AgencyContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgencyContact
        fields = ["id", "agency", "name", "phone", "email", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
