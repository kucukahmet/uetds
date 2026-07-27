from rest_framework import serializers

from companies.serializers import CompanyMembershipSerializer


class UserSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    name = serializers.CharField()
    active_company_id = serializers.UUIDField(allow_null=True)
    memberships = CompanyMembershipSerializer(source="company_memberships", many=True)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    company_id = serializers.UUIDField(required=False)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
