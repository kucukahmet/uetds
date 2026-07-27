from django.db import models

from common.models import CompanyScopedModel


class Vehicle(CompanyScopedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PASSIVE = "passive", "Passive"

    class UETDSStatus(models.TextChoices):
        UNKNOWN = "unknown", "Unknown"
        VALID = "valid", "Valid"
        INVALID = "invalid", "Invalid"

    plate = models.CharField(max_length=16)
    brand = models.CharField(max_length=80, blank=True)
    model = models.CharField(max_length=80, blank=True)
    seat_capacity = models.PositiveSmallIntegerField(default=1)
    phone = models.CharField(max_length=32, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    uetds_status = models.CharField(max_length=16, choices=UETDSStatus.choices, default=UETDSStatus.UNKNOWN)
    uetds_last_checked_at = models.DateTimeField(null=True, blank=True)
    uetds_authorization_document_no = models.CharField(max_length=80, blank=True)
    uetds_authorization_document_type = models.CharField(max_length=16, blank=True)
    uetds_company_title = models.CharField(max_length=255, blank=True)
    uetds_unet_no = models.CharField(max_length=64, blank=True)

    class Meta:
        unique_together = ("company", "plate")
        ordering = ["plate"]

    def save(self, *args, **kwargs):
        if self.plate:
            self.plate = self.plate.replace(" ", "").upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.plate

# Create your models here.
