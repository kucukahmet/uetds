from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from common.views import TenantModelViewSet
from fleet.models import Vehicle
from fleet.serializers import VehicleSerializer
from uetds.services import get_company_default_environment, run_vehicle_check


class VehicleViewSet(TenantModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer
    search_fields = ["plate", "brand", "model"]
    filterset_fields = ["status", "uetds_status"]
    ordering_fields = ["plate", "created_at"]
    required_permission = "vehicle:manage"

    @action(detail=True, methods=["post"], url_path="uetds-check")
    def uetds_check(self, request, pk=None):
        vehicle = self.get_object()
        environment = request.data.get("environment") or request.query_params.get("environment") or get_company_default_environment(vehicle.company)
        result = run_vehicle_check(vehicle, request.user, environment)
        vehicle.uetds_status = "valid" if result["valid"] else "invalid"
        vehicle.uetds_last_checked_at = timezone.now()
        update_fields = ["uetds_status", "uetds_last_checked_at"]
        authorization = result.get("authorization") or {}
        if authorization:
            vehicle.uetds_authorization_document_no = authorization.get("document_no", "")
            vehicle.uetds_authorization_document_type = authorization.get("document_type", "")
            vehicle.uetds_company_title = authorization.get("company_title", "")
            vehicle.uetds_unet_no = authorization.get("unet_no", "")
            update_fields.extend(
                [
                    "uetds_authorization_document_no",
                    "uetds_authorization_document_type",
                    "uetds_company_title",
                    "uetds_unet_no",
                ]
            )
        vehicle.save(update_fields=update_fields)
        return Response(result)
