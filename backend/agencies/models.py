from django.db import models

from common.models import CompanyScopedModel


class Agency(CompanyScopedModel):
    name = models.CharField(max_length=255)
    tax_no = models.CharField(max_length=32, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    status = models.CharField(max_length=16, default="active")

    class Meta:
        ordering = ["name"]


class AgencyContact(CompanyScopedModel):
    agency = models.ForeignKey(Agency, on_delete=models.CASCADE, related_name="contacts")
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)

# Create your models here.
