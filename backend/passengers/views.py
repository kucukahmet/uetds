from common.views import TenantModelViewSet
from passengers.models import Passenger
from passengers.serializers import PassengerSerializer


class PassengerViewSet(TenantModelViewSet):
    queryset = Passenger.objects.all()
    serializer_class = PassengerSerializer
    search_fields = ["first_name", "last_name", "identity_no", "phone"]
    filterset_fields = ["identity_type", "nationality"]
    ordering_fields = ["first_name", "last_name", "created_at"]
    required_permission = "passenger:manage"
