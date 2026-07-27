from decimal import Decimal

from django.db import models

from common.models import CompanyScopedModel


class PriceRule(CompanyScopedModel):
    name = models.CharField(max_length=255)
    base_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=3, default="TRY")
    is_active = models.BooleanField(default=True)


class TripPrice(CompanyScopedModel):
    trip = models.OneToOneField("trips.Trip", on_delete=models.CASCADE, related_name="price")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="TRY")
    note = models.TextField(blank=True)


class InvoiceDraft(CompanyScopedModel):
    agency = models.ForeignKey("agencies.Agency", on_delete=models.SET_NULL, null=True, blank=True)
    trips = models.ManyToManyField("trips.Trip", blank=True, related_name="invoice_drafts")
    status = models.CharField(max_length=32, default="draft")
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=3, default="TRY")

# Create your models here.
