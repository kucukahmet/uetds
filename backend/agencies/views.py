from agencies.models import Agency, AgencyContact
from agencies.serializers import AgencyContactSerializer, AgencySerializer
from common.views import TenantModelViewSet


class AgencyViewSet(TenantModelViewSet):
    queryset = Agency.objects.all()
    serializer_class = AgencySerializer
    search_fields = ["name", "tax_no", "phone", "email"]
    filterset_fields = ["status"]
    required_permission = "trip:create"


class AgencyContactViewSet(TenantModelViewSet):
    queryset = AgencyContact.objects.select_related("agency")
    serializer_class = AgencyContactSerializer
    search_fields = ["name", "phone", "email"]
    required_permission = "trip:create"
