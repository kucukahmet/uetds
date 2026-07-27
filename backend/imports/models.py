from django.conf import settings
from django.db import models

from common.models import CompanyScopedModel


class ImportBatch(CompanyScopedModel):
    class Type(models.TextChoices):
        PASSENGERS = "passengers", "Passengers"
        TRIPS = "trips", "Trips"

    import_type = models.CharField(max_length=32, choices=Type.choices)
    original_filename = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=32, default="pending")
    total_rows = models.PositiveIntegerField(default=0)
    success_rows = models.PositiveIntegerField(default=0)
    error_rows = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="import_batches")


class ImportRowError(CompanyScopedModel):
    batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name="row_errors")
    row_number = models.PositiveIntegerField()
    message = models.TextField()
    raw_data = models.JSONField(default=dict, blank=True)

# Create your models here.
