from django.conf import settings
from django.db import models

from common.models import TimeStampedUUIDModel


class Company(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PASSIVE = "passive", "Passive"

    name = models.CharField(max_length=255)
    tax_no = models.CharField(max_length=32, blank=True)
    unet_no = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class CompanySettings(TimeStampedUUIDModel):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name="settings")
    live_uetds_enabled = models.BooleanField(default=False)
    default_uetds_environment = models.CharField(max_length=16, default="test")
    session_days = models.PositiveSmallIntegerField(default=7)
    ai_passenger_parse_enabled = models.BooleanField(default=False)
    ai_passenger_parse_monthly_token_limit = models.PositiveIntegerField(default=50000)
    ai_passenger_parse_monthly_tokens_used = models.PositiveIntegerField(default=0)
    ai_passenger_parse_usage_month = models.CharField(max_length=7, blank=True)


class CompanyMembership(TimeStampedUUIDModel):
    class Role(models.TextChoices):
        SUPER_ADMIN = "super_admin", "Super Admin"
        COMPANY_ADMIN = "company_admin", "Company Admin"
        OPERATION_MANAGER = "operation_manager", "Operation Manager"
        DISPATCHER = "dispatcher", "Dispatcher"
        DRIVER = "driver", "Driver"
        VIEWER = "viewer", "Viewer"

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="company_memberships")
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.DISPATCHER)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("company", "user")

# Create your models here.
