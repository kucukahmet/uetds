from django.db import models

from common.models import CompanyScopedModel


class Passenger(CompanyScopedModel):
    class IdentityType(models.TextChoices):
        TC = "tc", "TC"
        PASSPORT = "passport", "Passport"
        FOREIGN_ID = "foreign_id", "Foreign ID"
        UNKNOWN = "unknown", "Unknown"

    first_name = models.CharField(max_length=120)
    last_name = models.CharField(max_length=120)
    identity_type = models.CharField(max_length=16, choices=IdentityType.choices, default=IdentityType.UNKNOWN)
    identity_no = models.CharField(max_length=64, blank=True, null=True)
    nationality = models.CharField(max_length=3, default="TR")
    country_name = models.CharField(max_length=120, blank=True)
    gender = models.CharField(max_length=1, blank=True)
    phone = models.CharField(max_length=32, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["company", "first_name", "last_name"]),
            models.Index(fields=["company", "identity_no"]),
        ]
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}".strip()

# Create your models here.
