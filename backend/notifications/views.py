from common.views import TenantModelViewSet
from notifications.models import NotificationEvent
from notifications.serializers import NotificationEventSerializer


class NotificationEventViewSet(TenantModelViewSet):
    queryset = NotificationEvent.objects.all()
    serializer_class = NotificationEventSerializer
    filterset_fields = ["channel", "event_type", "status"]
    search_fields = ["recipient", "event_type"]
    required_permission = "logs:view"
