from rest_framework import serializers

from notifications.models import NotificationEvent


class NotificationEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationEvent
        fields = ["id", "channel", "event_type", "recipient", "payload", "status", "sent_at", "created_at", "updated_at"]
        read_only_fields = ["id", "sent_at", "created_at", "updated_at"]
