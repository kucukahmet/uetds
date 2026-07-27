from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from common.views import TenantModelViewSet
from people.models import Personnel
from people.serializers import PersonnelSerializer
from uetds.services import get_company_default_environment, run_personnel_check


class PersonnelViewSet(TenantModelViewSet):
    queryset = Personnel.objects.all()
    serializer_class = PersonnelSerializer
    search_fields = ["first_name", "last_name", "identity_no", "phone"]
    filterset_fields = ["type", "status"]
    ordering_fields = ["first_name", "last_name", "created_at"]
    required_permission = "personnel:manage"

    @action(detail=True, methods=["post"], url_path="uetds-check")
    def uetds_check(self, request, pk=None):
        personnel = self.get_object()
        environment = request.data.get("environment") or request.query_params.get("environment") or get_company_default_environment(personnel.company)
        result = run_personnel_check(personnel, request.user, environment)
        personnel.status = Personnel.Status.ACTIVE if result["valid"] else Personnel.Status.PASSIVE
        personnel.uetds_last_checked_at = timezone.now()
        personnel.save(update_fields=["status", "uetds_last_checked_at"])
        return Response(result)
