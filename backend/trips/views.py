from django.db import transaction
from django.db.models import Prefetch
from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response

from common.views import CompanyContextMixin, TenantModelViewSet
from trips.location_references import normalize_search, saved_location_to_reference, search_location_references
from trips.models import SavedLocation, SavedRoute, Trip, TripGroup, TripPassenger, TripPersonnel
from trips.reports import render_trip_detail_pdf
from trips.serializers import (
    CancelUETDSSerializer,
    QuickCreateTripSerializer,
    SavedLocationSerializer,
    SavedRouteSerializer,
    SubmitUETDSSerializer,
    TripSerializer,
    TripUpdateSerializer,
)
from uetds.services import cancel_trip, get_company_default_environment, submit_trip, sync_trip_summary
from uetds.models import UETDSOperationLog


class PDFRenderer(BaseRenderer):
    media_type = "application/pdf"
    format = "pdf"
    charset = None

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class SavedLocationViewSet(TenantModelViewSet):
    queryset = SavedLocation.objects.all()
    serializer_class = SavedLocationSerializer
    search_fields = ["name", "city", "district", "address"]
    ordering_fields = ["usage_count", "name", "created_at"]
    required_permission = "trip:create"


class SavedRouteViewSet(TenantModelViewSet):
    queryset = SavedRoute.objects.all()
    serializer_class = SavedRouteSerializer
    search_fields = ["name", "departure_city", "departure_place", "arrival_city", "arrival_place"]
    ordering_fields = ["usage_count", "name", "created_at"]
    required_permission = "trip:create"


class LocationReferenceView(CompanyContextMixin, APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        company = self.get_company()
        query = request.query_params.get("search", "")
        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 50))
        normalized_query = normalize_search(query)
        saved = []
        if normalized_query:
            for location in SavedLocation.objects.filter(company=company).order_by("-usage_count", "name")[:200]:
                candidate = saved_location_to_reference(location)
                haystack = normalize_search(
                    " ".join(
                        [
                            candidate["place"],
                            candidate["district"],
                            candidate["city"],
                            candidate["city_code"],
                            candidate["district_code"],
                            candidate["address"],
                        ]
                    )
                )
                if all(token in haystack for token in normalized_query.split()):
                    saved.append(candidate)
        else:
            saved = [saved_location_to_reference(location) for location in SavedLocation.objects.filter(company=company).order_by("-usage_count", "name")[:8]]
        references = search_location_references(query, limit=limit)
        seen = {(item["city_code"], item["district_code"], item["place"]) for item in saved}
        merged = [*saved]
        for item in references:
            key = (item["city_code"], item["district_code"], item["place"])
            if key not in seen:
                merged.append(item)
                seen.add(key)
            if len(merged) >= limit:
                break
        return Response({"count": len(merged), "results": merged})


class TripViewSet(TenantModelViewSet):
    queryset = Trip.objects.select_related("vehicle", "driver", "created_by").prefetch_related(
        "groups",
        "trip_passengers__passenger",
        "trip_passengers__group",
        "trip_personnel__personnel",
        Prefetch("uetds_logs", queryset=UETDSOperationLog.objects.filter(success=False).order_by("-created_at"), to_attr="failed_uetds_logs"),
    )
    serializer_class = TripSerializer
    search_fields = [
        "departure_city",
        "arrival_city",
        "departure_address",
        "arrival_address",
        "vehicle__plate",
        "trip_passengers__passenger__first_name",
        "trip_passengers__passenger__last_name",
    ]
    filterset_fields = ["status", "vehicle__plate", "driver__identity_no"]
    ordering_fields = ["departure_at", "created_at", "status"]
    required_permission = "trip:update"

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        objects = page if page is not None else queryset
        self._sync_uetds_for_response(objects)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        self._sync_uetds_for_response([instance])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def perform_create(self, serializer):
        company = self.get_company()
        self.check_company_permission(company, "trip:create")
        serializer.save(company=company, created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        return self._update_editable_trip(request, False, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self._update_editable_trip(request, True, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        trip = self.get_object()
        self.check_company_permission(trip.company, "trip:update")
        if trip.uetds_reference_no or trip.status in {Trip.Status.SUBMITTED, Trip.Status.PARTIAL_FAILED, Trip.Status.CANCEL_REQUESTED, Trip.Status.CANCELLED}:
            raise ValidationError({"trip": "UETDS'ye gönderilmiş sefer silinemez. Seferi UETDS iptal akışıyla iptal edin."})
        return super().destroy(request, *args, **kwargs)

    def _update_editable_trip(self, request, partial, *args, **kwargs):
        trip = self.get_object()
        self.check_company_permission(trip.company, "trip:update")
        if self._is_uetds_locked(trip):
            raise ValidationError({"trip": "İptal sürecindeki UETDS seferi düzenlenemez."})
        serializer = TripUpdateSerializer(trip, data=request.data, partial=partial, context={"company": trip.company, "user": request.user})
        serializer.is_valid(raise_exception=True)
        trip = serializer.save()
        return Response(TripSerializer(trip).data)

    def _is_uetds_locked(self, trip):
        return trip.status in {"cancel_requested", "cancelled"}

    def _sync_uetds_for_response(self, trips):
        if not self._should_sync_uetds_on_read():
            return
        max_items = self._uetds_read_sync_limit()
        synced = 0
        for trip in list(trips):
            if synced >= max_items:
                return
            if not self._can_sync_trip_on_read(trip):
                continue
            environment = trip.uetds_environment or get_company_default_environment(trip.company)
            try:
                sync_trip_summary(trip, environment)
            except Exception:
                continue
            synced += 1

    def _should_sync_uetds_on_read(self):
        value = str(self.request.query_params.get("sync_uetds", "")).lower()
        return value in {"1", "true", "yes", "on"}

    def _uetds_read_sync_limit(self):
        try:
            value = int(self.request.query_params.get("sync_uetds_limit", 8))
        except (TypeError, ValueError):
            value = 8
        return max(1, min(value, 20))

    def _can_sync_trip_on_read(self, trip):
        return bool(trip.uetds_reference_no) and trip.status in {
            Trip.Status.SUBMITTED,
            Trip.Status.PARTIAL_FAILED,
            Trip.Status.CANCEL_REQUESTED,
        }

    @action(detail=False, methods=["post"], url_path="quick-create")
    def quick_create(self, request):
        company = self.get_company()
        self.check_company_permission(company, "trip:create")
        serializer = QuickCreateTripSerializer(data=request.data, context={"company": company, "user": request.user})
        serializer.is_valid(raise_exception=True)
        trip = serializer.save()
        missing_fields = serializer.get_missing_fields(trip)
        return Response(
            {
                "trip_id": trip.id,
                "status": trip.status,
                "validation": {"ready_for_uetds": not missing_fields, "missing_fields": missing_fields},
            }
        )

    @action(detail=True, methods=["post"], url_path="duplicate")
    def duplicate(self, request, pk=None):
        source = self.get_object()
        with transaction.atomic():
            source.pk = None
            source.id = None
            source.uetds_reference_no = None
            source.firm_trip_no = ""
            source.status = "draft"
            source.created_by = request.user
            source.save()
            original_id = pk
            original = Trip.objects.get(id=original_id)
            group_map = {}
            for group in original.groups.all():
                old_id = group.id
                group.pk = None
                group.id = None
                group.trip = source
                group.uetds_group_ref_no = None
                group.save()
                group_map[old_id] = group
            for link in original.trip_passengers.all():
                TripPassenger.objects.create(
                    company=source.company,
                    trip=source,
                    passenger=link.passenger,
                    group=group_map.get(link.group_id),
                    seat_no=link.seat_no,
                )
            for link in original.trip_personnel.all():
                TripPersonnel.objects.create(company=source.company, trip=source, personnel=link.personnel, role=link.role)
        return Response(TripSerializer(source).data)

    @action(detail=True, methods=["post"], url_path="create-return-trip")
    def create_return_trip(self, request, pk=None):
        source = self.get_object()
        with transaction.atomic():
            trip = Trip.objects.create(
                company=source.company,
                created_by=request.user,
                status="draft",
                vehicle=source.vehicle,
                driver=source.driver,
                departure_at=request.data.get("departure_at") or source.departure_at,
                arrival_estimated_at=request.data.get("arrival_estimated_at") or source.arrival_estimated_at,
                departure_city=source.arrival_city,
                departure_district=source.arrival_district,
                departure_address=source.arrival_address,
                arrival_city=source.departure_city,
                arrival_district=source.departure_district,
                arrival_address=source.departure_address,
                route_note=request.data.get("route_note", source.route_note),
                passenger_count=source.passenger_count,
            )
            group_map = {}
            for group in source.groups.all():
                new_group = TripGroup.objects.create(
                    company=trip.company,
                    trip=trip,
                    name=group.name,
                    description=group.description,
                    price=group.price,
                    currency=group.currency,
                    departure_country=group.arrival_country,
                    departure_city=group.arrival_city,
                    departure_district=group.arrival_district,
                    departure_city_code=group.arrival_city_code,
                    departure_district_code=group.arrival_district_code,
                    departure_place=group.arrival_place,
                    arrival_country=group.departure_country,
                    arrival_city=group.departure_city,
                    arrival_district=group.departure_district,
                    arrival_city_code=group.departure_city_code,
                    arrival_district_code=group.departure_district_code,
                    arrival_place=group.departure_place,
                )
                group_map[group.id] = new_group
            for link in source.trip_passengers.all():
                TripPassenger.objects.create(
                    company=trip.company,
                    trip=trip,
                    passenger=link.passenger,
                    group=group_map.get(link.group_id),
                    seat_no=link.seat_no,
                )
            for link in source.trip_personnel.all():
                TripPersonnel.objects.create(company=trip.company, trip=trip, personnel=link.personnel, role=link.role)
        return Response(TripSerializer(trip).data)

    @action(detail=True, methods=["post"], url_path="submit-uetds")
    def submit_uetds(self, request, pk=None):
        trip = self.get_object()
        self.check_company_permission(trip.company, "trip:submit_uetds")
        serializer = SubmitUETDSSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        data["environment"] = data.get("environment") or get_company_default_environment(trip.company)
        result = submit_trip(trip, request.user, **data)
        response_status = status.HTTP_200_OK if result.get("success") else status.HTTP_409_CONFLICT
        return Response(result, status=response_status)

    @action(detail=True, methods=["post"], url_path="sync-summary")
    def sync_summary(self, request, pk=None):
        trip = self.get_object()
        self.check_company_permission(trip.company, "trip:update")
        environment = request.data.get("environment") or trip.uetds_environment or get_company_default_environment(trip.company)
        result = sync_trip_summary(trip, environment)
        return Response(result)

    @action(detail=True, methods=["get"], url_path="detail-pdf", renderer_classes=[PDFRenderer])
    def detail_pdf(self, request, pk=None):
        trip = self.get_object()
        self.check_company_permission(trip.company, "trip:update")
        pdf_bytes = render_trip_detail_pdf(trip)
        filename = f"sefer-{trip.uetds_reference_no or trip.firm_trip_no or trip.id}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=["post"], url_path="cancel-uetds")
    def cancel_uetds(self, request, pk=None):
        trip = self.get_object()
        self.check_company_permission(trip.company, "trip:cancel_uetds")
        serializer = CancelUETDSSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        data["environment"] = data.get("environment") or trip.uetds_environment or get_company_default_environment(trip.company)
        result = cancel_trip(trip, request.user, **data)
        return Response(result)
