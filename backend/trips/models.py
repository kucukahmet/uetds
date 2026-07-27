from django.conf import settings
from django.db import models

from common.models import CompanyScopedModel


class SavedLocation(CompanyScopedModel):
    name = models.CharField(max_length=160)
    country = models.CharField(max_length=3, default="TR")
    city = models.CharField(max_length=120)
    district = models.CharField(max_length=120, blank=True)
    city_code = models.CharField(max_length=16, blank=True)
    district_code = models.CharField(max_length=16, blank=True)
    place = models.CharField(max_length=255, blank=True)
    address = models.TextField(blank=True)
    usage_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-usage_count", "name"]

    def __str__(self):
        return self.name


class SavedRoute(CompanyScopedModel):
    name = models.CharField(max_length=160)
    departure_country = models.CharField(max_length=3, default="TR")
    departure_city = models.CharField(max_length=120)
    departure_district = models.CharField(max_length=120, blank=True)
    departure_city_code = models.CharField(max_length=16, blank=True)
    departure_district_code = models.CharField(max_length=16, blank=True)
    departure_place = models.CharField(max_length=255)
    departure_address = models.TextField(blank=True)
    arrival_country = models.CharField(max_length=3, default="TR")
    arrival_city = models.CharField(max_length=120)
    arrival_district = models.CharField(max_length=120, blank=True)
    arrival_city_code = models.CharField(max_length=16, blank=True)
    arrival_district_code = models.CharField(max_length=16, blank=True)
    arrival_place = models.CharField(max_length=255)
    arrival_address = models.TextField(blank=True)
    default_group_name = models.CharField(max_length=120, default="TRANSFER")
    default_group_description = models.TextField(blank=True)
    default_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="TRY")
    usage_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-usage_count", "name"]

    def __str__(self):
        return self.name


class Trip(CompanyScopedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        READY = "ready", "Ready"
        SUBMITTING = "submitting", "Submitting"
        SUBMITTED = "submitted", "Submitted"
        PARTIAL_FAILED = "partial_failed", "Partial Failed"
        FAILED = "failed", "Failed"
        CANCEL_REQUESTED = "cancel_requested", "Cancel Requested"
        CANCELLED = "cancelled", "Cancelled"

    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT)
    firm_trip_no = models.CharField(max_length=64, blank=True)
    description = models.TextField(blank=True)
    vehicle = models.ForeignKey("fleet.Vehicle", on_delete=models.PROTECT, related_name="trips")
    driver = models.ForeignKey("people.Personnel", on_delete=models.PROTECT, related_name="driver_trips")
    departure_at = models.DateTimeField()
    arrival_estimated_at = models.DateTimeField(null=True, blank=True)
    departure_city = models.CharField(max_length=120)
    departure_district = models.CharField(max_length=120, blank=True)
    departure_address = models.TextField()
    arrival_city = models.CharField(max_length=120)
    arrival_district = models.CharField(max_length=120, blank=True)
    arrival_address = models.TextField()
    route_note = models.TextField(blank=True)
    passenger_count = models.PositiveIntegerField(default=0)
    uetds_reference_no = models.CharField(max_length=64, blank=True, null=True)
    uetds_environment = models.CharField(max_length=16, default="test")
    uetds_last_submitted_at = models.DateTimeField(null=True, blank=True)
    uetds_last_submitted_hash = models.CharField(max_length=64, blank=True)
    uetds_last_submitted_snapshot = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_trips")

    class Meta:
        ordering = ["-departure_at"]
        indexes = [
            models.Index(fields=["company", "status", "departure_at"]),
            models.Index(fields=["company", "uetds_reference_no"]),
        ]

    def __str__(self):
        return f"{self.departure_city} -> {self.arrival_city} @ {self.departure_at}"


class TripGroup(CompanyScopedModel):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="groups")
    name = models.CharField(max_length=120, default="TRANSFER")
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="TRY")
    departure_country = models.CharField(max_length=3, default="TR")
    departure_city = models.CharField(max_length=120, blank=True)
    departure_district = models.CharField(max_length=120, blank=True)
    departure_city_code = models.CharField(max_length=16, blank=True)
    departure_district_code = models.CharField(max_length=16, blank=True)
    departure_place = models.CharField(max_length=255, blank=True)
    arrival_country = models.CharField(max_length=3, default="TR")
    arrival_city = models.CharField(max_length=120, blank=True)
    arrival_district = models.CharField(max_length=120, blank=True)
    arrival_city_code = models.CharField(max_length=16, blank=True)
    arrival_district_code = models.CharField(max_length=16, blank=True)
    arrival_place = models.CharField(max_length=255, blank=True)
    uetds_group_ref_no = models.CharField(max_length=64, blank=True, null=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return self.name


class TripPassenger(CompanyScopedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELLED = "cancelled", "Cancelled"
        NOT_ARRIVED = "not_arrived", "Not Arrived"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="trip_passengers")
    passenger = models.ForeignKey("passengers.Passenger", on_delete=models.PROTECT, related_name="trip_links")
    group = models.ForeignKey(TripGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name="passenger_links")
    seat_no = models.CharField(max_length=16, blank=True)
    uetds_passenger_reference_no = models.CharField(max_length=64, blank=True, null=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        unique_together = ("trip", "passenger")


class TripPersonnel(CompanyScopedModel):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="trip_personnel")
    personnel = models.ForeignKey("people.Personnel", on_delete=models.PROTECT, related_name="trip_links")
    role = models.CharField(max_length=32, default="driver")

    class Meta:
        unique_together = ("trip", "personnel", "role")

# Create your models here.
