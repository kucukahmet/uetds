from django.db import models

from common.models import CompanyScopedModel


class NotificationEvent(CompanyScopedModel):
    channel = models.CharField(max_length=32, default="internal")
    event_type = models.CharField(max_length=64)
    recipient = models.CharField(max_length=255, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=32, default="pending")
    sent_at = models.DateTimeField(null=True, blank=True)

# Create your models here.
