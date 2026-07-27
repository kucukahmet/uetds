from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from companies.models import Company, CompanyMembership, CompanySettings
from companies.serializers import CompanySerializer, CompanySettingsSerializer
from common.permissions import role_has_permission


class CompanyViewSet(viewsets.ModelViewSet):
    serializer_class = CompanySerializer
    permission_classes = [permissions.IsAuthenticated]
    search_fields = ["name", "tax_no", "unet_no"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Company.objects.none()
        if self.request.user.is_superuser:
            return Company.objects.all()
        if not self.request.user.is_authenticated:
            return Company.objects.none()
        return Company.objects.filter(memberships__user=self.request.user, memberships__is_active=True).distinct()

    def perform_create(self, serializer):
        company = serializer.save()
        CompanySettings.objects.get_or_create(company=company)
        CompanyMembership.objects.get_or_create(
            company=company,
            user=self.request.user,
            defaults={"role": CompanyMembership.Role.COMPANY_ADMIN},
        )

    @action(detail=True, methods=["post"])
    def switch(self, request, pk=None):
        company = self.get_object()
        request.user.active_company_id = company.id
        request.user.save(update_fields=["active_company_id"])
        return Response({"active_company_id": company.id}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="settings")
    def update_settings(self, request, pk=None):
        company = self.get_object()
        self._check_settings_permission(company)
        company_settings, _ = CompanySettings.objects.get_or_create(company=company)
        serializer = CompanySettingsSerializer(company_settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _check_settings_permission(self, company):
        user = self.request.user
        if user.is_superuser:
            return
        membership = user.company_memberships.filter(company=company, is_active=True).first()
        if not membership:
            raise PermissionDenied("Bu firmaya erişim yetkiniz yok.")
        if not role_has_permission(membership.role, "settings:uetds_manage"):
            raise PermissionDenied("Bu işlem için yetkiniz yok.")
