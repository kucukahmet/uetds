from billing.models import InvoiceDraft, PriceRule, TripPrice
from billing.serializers import InvoiceDraftSerializer, PriceRuleSerializer, TripPriceSerializer
from common.views import TenantModelViewSet


class PriceRuleViewSet(TenantModelViewSet):
    queryset = PriceRule.objects.all()
    serializer_class = PriceRuleSerializer
    filterset_fields = ["currency", "is_active"]
    search_fields = ["name"]
    required_permission = "trip:create"


class TripPriceViewSet(TenantModelViewSet):
    queryset = TripPrice.objects.select_related("trip")
    serializer_class = TripPriceSerializer
    filterset_fields = ["currency", "trip"]
    required_permission = "trip:update"


class InvoiceDraftViewSet(TenantModelViewSet):
    queryset = InvoiceDraft.objects.prefetch_related("trips")
    serializer_class = InvoiceDraftSerializer
    filterset_fields = ["status", "currency", "agency"]
    required_permission = "trip:update"
