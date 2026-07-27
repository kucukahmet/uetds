from django.db import models

from common.models import CompanyScopedModel


class Personnel(CompanyScopedModel):
    class Type(models.TextChoices):
        DRIVER = "driver", "Driver"
        GUIDE = "guide", "Guide"
        ASSISTANT = "assistant", "Assistant"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PASSIVE = "passive", "Passive"

    type = models.CharField(max_length=16, choices=Type.choices, default=Type.DRIVER)
    first_name = models.CharField(max_length=120)
    last_name = models.CharField(max_length=120)
    identity_no = models.CharField(max_length=32)
    nationality = models.CharField(max_length=3, default="TR")
    gender = models.CharField(max_length=1, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    address = models.TextField(blank=True)
    uetds_role_code = models.PositiveSmallIntegerField(default=0)
    src_codes = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    uetds_last_checked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("company", "identity_no")
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}".strip()

# Create your models here.
