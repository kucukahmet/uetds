from rest_framework import permissions, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError

from companies.models import Company
from common.permissions import role_has_permission


class CompanyContextMixin:
    required_permission = None

    def get_company(self):
        user = self.request.user
        company_id = self.request.headers.get("X-Company-ID") or getattr(user, "active_company_id", None)
        if not company_id:
            raise ValidationError({"company": "Aktif firma seçilmedi."})

        queryset = Company.objects.all()
        if not user.is_superuser:
            queryset = queryset.filter(memberships__user=user, memberships__is_active=True)

        try:
            return queryset.distinct().get(id=company_id)
        except Company.DoesNotExist as exc:
            raise PermissionDenied("Bu firmaya erişim yetkiniz yok.") from exc

    def get_membership(self, company):
        if self.request.user.is_superuser:
            return None
        return self.request.user.company_memberships.filter(company=company, is_active=True).first()

    def check_company_permission(self, company, permission_code=None):
        if self.request.user.is_superuser:
            return
        membership = self.get_membership(company)
        if not membership:
            raise PermissionDenied("Bu firmaya erişim yetkiniz yok.")
        code = permission_code or self.required_permission
        if code and not role_has_permission(membership.role, code):
            raise PermissionDenied("Bu işlem için yetkiniz yok.")


class TenantModelViewSet(CompanyContextMixin, viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.queryset.filter(company=self.get_company())

    def perform_create(self, serializer):
        company = self.get_company()
        self.check_company_permission(company)
        serializer.save(company=company)

    def perform_update(self, serializer):
        company = self.get_company()
        self.check_company_permission(company)
        serializer.save()
