from django.conf import settings
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.views import CompanyContextMixin
from uetds.models import UETDSCredential, UETDSOperationLog
from uetds.serializers import UETDSCredentialSerializer, UETDSOperationLogSerializer, VerifySerializer
from uetds.services import ip_list, record_configuration_error, verify_credentials


class UETDSViewSet(CompanyContextMixin, viewsets.GenericViewSet):
    queryset = UETDSCredential.objects.all()
    serializer_class = UETDSCredentialSerializer

    @action(detail=False, methods=["get"])
    def status(self, request):
        company = self.get_company()
        data = {}
        for environment in settings.UETDS_ALLOWED_ENVIRONMENTS:
            credential = UETDSCredential.objects.filter(company=company, environment=environment, is_active=True).first()
            if credential:
                latest_error = (
                    UETDSOperationLog.objects.filter(company=company, environment=environment, success=False)
                    .exclude(operation="credentialCheck")
                    .order_by("-created_at")
                    .first()
                )
            else:
                latest_error = record_configuration_error(company, environment, f"{environment_display_name(environment)} bilgisi tanımlı değil.")
            data[environment] = self._environment_status(environment, credential, latest_error)
        return Response(data)

    def _environment_status(self, environment, credential, latest_error):
        environment_label = environment_display_name(environment)
        if not credential:
            return {
                "configured": False,
                "status": "missing",
                "severity": "error",
                "message": latest_error.uetds_sonuc_mesaji if latest_error else f"{environment_label} bilgisi tanımlı değil.",
                "last_verified_at": None,
                "last_result": "missing",
                "last_error_at": latest_error.updated_at if latest_error else None,
                "last_log_id": latest_error.id if latest_error else None,
            }
        if credential.last_result == "success":
            return {
                "configured": True,
                "status": "verified",
                "severity": "success",
                "message": f"{environment_label} bilgileri doğrulandı.",
                "last_verified_at": credential.last_verified_at,
                "last_result": credential.last_result,
                "last_error_at": latest_error.updated_at if latest_error else None,
                "last_log_id": latest_error.id if latest_error else None,
            }
        if credential.last_result == "failed":
            return {
                "configured": True,
                "status": "failed",
                "severity": "error",
                "message": latest_error.uetds_sonuc_mesaji if latest_error else "UETDS doğrulama başarısız.",
                "last_verified_at": credential.last_verified_at,
                "last_result": credential.last_result,
                "last_error_at": latest_error.updated_at if latest_error else None,
                "last_log_id": latest_error.id if latest_error else None,
            }
        return {
            "configured": True,
            "status": "pending",
            "severity": "warning",
            "message": f"Credential kayıtlı, henüz {environment_label} doğrulaması yapılmadı.",
            "last_verified_at": credential.last_verified_at,
            "last_result": credential.last_result or "pending",
            "last_error_at": latest_error.updated_at if latest_error else None,
            "last_log_id": latest_error.id if latest_error else None,
        }

    @action(detail=False, methods=["post"], url_path="credentials")
    def credentials(self, request):
        company = self.get_company()
        self.check_company_permission(company, "settings:uetds_manage")
        serializer = UETDSCredentialSerializer(data={**request.data, "company": company.id})
        serializer.is_valid(raise_exception=True)
        credential = serializer.save(company=company)
        return Response(
            {
                "id": credential.id,
                "environment": credential.environment,
                "is_active": credential.is_active,
                "updated_at": credential.updated_at,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"])
    def verify(self, request):
        company = self.get_company()
        self.check_company_permission(company, "settings:uetds_manage")
        serializer = VerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        response = verify_credentials(company, serializer.validated_data["environment"])
        return Response(
            {
                "success": response.success,
                "sonuc_kodu": response.sonuc_kodu,
                "sonuc_mesaji": response.sonuc_mesaji,
                "data": response.data or {},
                "verified_at": timezone.now(),
            }
        )

    @action(detail=False, methods=["get"], url_path="ip-list")
    def ip_list(self, request):
        company = self.get_company()
        environment = request.query_params.get("environment", "test")
        response = ip_list(company, environment)
        return Response(
            {
                "success": response.success,
                "sonuc_kodu": response.sonuc_kodu,
                "sonuc_mesaji": response.sonuc_mesaji,
                "data": response.data or {},
            }
        )


class UETDSLogViewSet(CompanyContextMixin, viewsets.ReadOnlyModelViewSet):
    queryset = UETDSOperationLog.objects.all()
    serializer_class = UETDSOperationLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["trip", "operation", "environment", "success"]
    search_fields = ["uetds_sonuc_mesaji", "correlation_id"]
    ordering_fields = ["created_at", "operation"]
    required_permission = "logs:view"

    def get_queryset(self):
        company = self.get_company()
        self.check_company_permission(company, "logs:view")
        return self.queryset.filter(company=company)


def environment_display_name(environment):
    return "Gerçek UETDS" if environment == "live" else "UETDS test"
