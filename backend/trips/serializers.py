from django.db import transaction
from rest_framework import serializers

from common.identity import is_valid_turkish_identity_no
from fleet.models import Vehicle
from fleet.serializers import VehicleSerializer
from passengers.models import Passenger
from passengers.serializers import PassengerSerializer
from people.models import Personnel
from people.serializers import PersonnelSerializer
from trips.models import SavedLocation, SavedRoute, Trip, TripGroup, TripPassenger, TripPersonnel
from uetds.services import trip_uetds_sync_status, validate_environment as validate_uetds_environment


UETDS_OPERATION_LABELS = {
    "seferEkle": "Sefer kaydı",
    "seferGuncelle": "Sefer güncellemesi",
    "seferPlakaDegistir": "Araç/plaka güncellemesi",
    "seferGrupEkle": "Rota/grup kaydı",
    "seferGrupGuncelle": "Rota/grup güncellemesi",
    "personelEkle": "Şoför/personel gönderimi",
    "personelIptal": "Şoför/personel iptali",
    "yolcuEkleCoklu": "Yolcu gönderimi",
    "yolcuIptal": "Yolcu iptali",
    "bildirimOzeti": "UETDS özet kontrolü",
    "seferIptal": "Sefer iptali",
}


UETDS_OPERATION_ACTIONS = {
    "seferEkle": "Araç, şoför, tarih ve rota bilgilerini kontrol edip tekrar UETDS'ye gönder.",
    "seferGuncelle": "Sefer ana bilgilerini kontrol edip güncelle ve tekrar UETDS'ye gönder.",
    "seferPlakaDegistir": "Seçilen aracın plakasını/yetki belgesini kontrol edip tekrar UETDS'ye gönder.",
    "seferGrupEkle": "Rota, adres detayı, grup ve ücret bilgilerini kontrol edip tekrar UETDS'ye gönder.",
    "seferGrupGuncelle": "Rota, adres detayı, grup ve ücret bilgilerini kontrol edip tekrar UETDS'ye gönder.",
    "personelEkle": "Şoför bilgilerini ve SRC/mesleki yeterlilik durumunu kontrol edip tekrar UETDS'ye gönder.",
    "personelIptal": "Şoför değişikliğini kontrol edip tekrar UETDS'ye gönder.",
    "yolcuEkleCoklu": "Yolcu kimlik/pasaport, ülke, cinsiyet ve koltuk bilgilerini kontrol edip tekrar UETDS'ye gönder.",
    "yolcuIptal": "Yolcu listesindeki değişikliği kontrol edip tekrar UETDS'ye gönder.",
    "bildirimOzeti": "UETDS kaydı oluşmuş olabilir; önce UETDS'den senkronize et, gerekirse tekrar gönder.",
    "seferIptal": "İptal sonucunu kontrol et; sefer UETDS'de hâlâ aktifse tekrar iptal isteği gönder.",
}


def normalize_gender(value):
    normalized = (value or "").strip().lower()
    if normalized in {"e", "erkek", "m", "male"}:
        return "E"
    if normalized in {"k", "kadın", "kadin", "f", "female"}:
        return "K"
    return ""


def validate_turkish_identity_number(value, field_name="identity_no"):
    value = str(value or "").strip()
    if not value:
        return value
    if not value.isdigit() or len(value) != 11:
        raise serializers.ValidationError({field_name: "T.C. Kimlik 11 haneli sayı olmalı."})
    if not is_valid_turkish_identity_no(value):
        raise serializers.ValidationError({field_name: "T.C. Kimlik numarası geçersiz."})
    return value


class SavedLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedLocation
        fields = [
            "id",
            "name",
            "country",
            "city",
            "district",
            "city_code",
            "district_code",
            "place",
            "address",
            "usage_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "usage_count", "created_at", "updated_at"]


class SavedRouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedRoute
        fields = [
            "id",
            "name",
            "departure_country",
            "departure_city",
            "departure_district",
            "departure_city_code",
            "departure_district_code",
            "departure_place",
            "departure_address",
            "arrival_country",
            "arrival_city",
            "arrival_district",
            "arrival_city_code",
            "arrival_district_code",
            "arrival_place",
            "arrival_address",
            "default_group_name",
            "default_group_description",
            "default_price",
            "currency",
            "usage_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "usage_count", "created_at", "updated_at"]


class TripPassengerSerializer(serializers.ModelSerializer):
    passenger = PassengerSerializer(read_only=True)
    group_id = serializers.UUIDField(source="group.id", read_only=True)

    class Meta:
        model = TripPassenger
        fields = ["id", "passenger", "group_id", "seat_no", "uetds_passenger_reference_no", "status"]


class TripPersonnelSerializer(serializers.ModelSerializer):
    personnel = PersonnelSerializer(read_only=True)

    class Meta:
        model = TripPersonnel
        fields = ["id", "personnel", "role"]


class TripGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripGroup
        fields = [
            "id",
            "name",
            "description",
            "price",
            "currency",
            "departure_country",
            "departure_city",
            "departure_district",
            "departure_city_code",
            "departure_district_code",
            "departure_place",
            "arrival_country",
            "arrival_city",
            "arrival_district",
            "arrival_city_code",
            "arrival_district_code",
            "arrival_place",
            "uetds_group_ref_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uetds_group_ref_no", "created_at", "updated_at"]


class TripSerializer(serializers.ModelSerializer):
    vehicle_detail = VehicleSerializer(source="vehicle", read_only=True)
    driver_detail = PersonnelSerializer(source="driver", read_only=True)
    groups = TripGroupSerializer(many=True, read_only=True)
    passengers = TripPassengerSerializer(source="trip_passengers", many=True, read_only=True)
    personnel = TripPersonnelSerializer(source="trip_personnel", many=True, read_only=True)
    uetds_sync_status = serializers.SerializerMethodField()
    uetds_has_unsent_changes = serializers.SerializerMethodField()
    uetds_sync_message = serializers.SerializerMethodField()
    uetds_last_error = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            "id",
            "status",
            "firm_trip_no",
            "description",
            "vehicle",
            "vehicle_detail",
            "driver",
            "driver_detail",
            "departure_at",
            "arrival_estimated_at",
            "departure_city",
            "departure_district",
            "departure_address",
            "arrival_city",
            "arrival_district",
            "arrival_address",
            "route_note",
            "passenger_count",
            "uetds_reference_no",
            "uetds_environment",
            "uetds_sync_status",
            "uetds_has_unsent_changes",
            "uetds_last_submitted_at",
            "uetds_sync_message",
            "uetds_last_error",
            "groups",
            "passengers",
            "personnel",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "passenger_count",
            "uetds_reference_no",
            "uetds_environment",
            "uetds_sync_status",
            "uetds_has_unsent_changes",
            "uetds_last_submitted_at",
            "uetds_sync_message",
            "uetds_last_error",
            "created_at",
            "updated_at",
        ]

    def get_uetds_sync_status(self, obj):
        return trip_uetds_sync_status(obj)

    def get_uetds_has_unsent_changes(self, obj):
        return self.get_uetds_sync_status(obj) in {"update_required", "local_draft", "unknown"}

    def get_uetds_sync_message(self, obj):
        if obj.status in {"failed", "partial_failed"}:
            last_error = self.get_uetds_last_error(obj)
            if last_error:
                return f"{last_error['operation_label']} tamamlanamadı: {last_error['message']}"
            return "UETDS gönderimi tamamlanamadı. Logları kontrol edip tekrar gönder."
        status = self.get_uetds_sync_status(obj)
        if status == "not_submitted":
            return "Bu sefer henüz UETDS'ye gönderilmedi."
        if status == "synced":
            return "UETDS kaydı son değişikliklerle güncel."
        if status == "local_draft":
            return "Önceki gönderim UETDS'ye gitti; son değişiklikler taslakta kaldı ve henüz gönderilmedi."
        if status == "update_required":
            return "Önceki gönderim UETDS'ye gitti; son değişiklikler için güncelle ve tekrar gönder."
        if status == "cancelled":
            return "Sefer UETDS'de iptal edildi."
        return "Önceki gönderim var; UETDS ile güncellik durumu doğrulanmalı."

    def get_uetds_last_error(self, obj):
        failed_logs = getattr(obj, "failed_uetds_logs", None)
        log = failed_logs[0] if failed_logs else obj.uetds_logs.filter(success=False).order_by("-created_at").first()
        if not log:
            return None
        message = log.uetds_sonuc_mesaji or "UETDS hata mesajı dönmedi. Log detayını kontrol et."
        return {
            "id": str(log.id),
            "operation": log.operation,
            "operation_label": UETDS_OPERATION_LABELS.get(log.operation, log.get_operation_display() or log.operation),
            "sonuc_kodu": log.uetds_sonuc_kodu,
            "message": message,
            "action": UETDS_OPERATION_ACTIONS.get(log.operation, "Bilgileri kontrol edip tekrar UETDS'ye gönder."),
            "created_at": log.created_at.isoformat(),
        }


class TripUpdateSerializer(serializers.ModelSerializer):
    groups = serializers.ListField(child=serializers.DictField(), required=False)
    passengers = serializers.ListField(child=serializers.DictField(), required=False, allow_empty=False)

    class Meta:
        model = Trip
        fields = [
            "description",
            "vehicle",
            "driver",
            "departure_at",
            "arrival_estimated_at",
            "departure_city",
            "departure_district",
            "departure_address",
            "arrival_city",
            "arrival_district",
            "arrival_address",
            "route_note",
            "groups",
            "passengers",
        ]

    def validate_vehicle(self, vehicle):
        company = self.context["company"]
        if vehicle.company_id != company.id:
            raise serializers.ValidationError("Seçilen araç bu firmaya ait değil.")
        if vehicle.status != Vehicle.Status.ACTIVE:
            raise serializers.ValidationError("Sadece aktif araç seçilebilir.")
        return vehicle

    def validate_driver(self, driver):
        company = self.context["company"]
        if driver.company_id != company.id:
            raise serializers.ValidationError("Seçilen şoför bu firmaya ait değil.")
        if driver.status != Personnel.Status.ACTIVE:
            raise serializers.ValidationError("Sadece aktif şoför seçilebilir.")
        if driver.type != Personnel.Type.DRIVER:
            raise serializers.ValidationError("Seçilen personel şoför değil.")
        return driver

    def update(self, instance, validated_data):
        group_payloads = validated_data.pop("groups", None)
        passenger_payloads = validated_data.pop("passengers", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        self._sync_driver_link(instance)
        if group_payloads is not None:
            self._update_groups(instance, group_payloads)
        if passenger_payloads is not None:
            self._update_passengers(instance, passenger_payloads)
        if hasattr(instance, "_prefetched_objects_cache"):
            instance._prefetched_objects_cache.pop("groups", None)
            instance._prefetched_objects_cache.pop("trip_passengers", None)
        instance.passenger_count = TripPassenger.objects.filter(company=instance.company, trip=instance).count()
        instance.status = "ready" if QuickCreateTripSerializer(context=self.context).get_missing_fields(instance) == [] else "draft"
        instance.save(update_fields=["passenger_count", "status", "updated_at"])
        return instance

    def _sync_driver_link(self, trip):
        if not trip.driver_id:
            return
        TripPersonnel.objects.filter(company=trip.company, trip=trip, role="driver").exclude(personnel=trip.driver).delete()
        TripPersonnel.objects.get_or_create(company=trip.company, trip=trip, personnel=trip.driver, role="driver")

    def _update_groups(self, trip, group_payloads):
        existing = list(trip.groups.all())
        for index, payload in enumerate(group_payloads):
            group = self._group_for_payload(trip, existing, payload, index)
            if not group:
                continue
            for field in [
                "name",
                "description",
                "price",
                "currency",
                "departure_country",
                "departure_city",
                "departure_district",
                "departure_city_code",
                "departure_district_code",
                "departure_place",
                "arrival_country",
                "arrival_city",
                "arrival_district",
                "arrival_city_code",
                "arrival_district_code",
                "arrival_place",
            ]:
                if field in payload:
                    setattr(group, field, payload[field])
            group.save()

    def _group_for_payload(self, trip, existing, payload, index):
        group_id = payload.get("id")
        if group_id:
            for group in existing:
                if str(group.id) == str(group_id):
                    return group
            raise serializers.ValidationError({"groups": "Sefer grubu bulunamadı."})
        if index < len(existing):
            return existing[index]
        return TripGroup.objects.create(company=trip.company, trip=trip)

    def _update_passengers(self, trip, passenger_payloads):
        existing_links = {str(link.id): link for link in trip.trip_passengers.select_related("passenger", "group").all()}
        retained_link_ids = []
        quick_serializer = QuickCreateTripSerializer(context=self.context)

        for index, raw_payload in enumerate(passenger_payloads):
            payload = self._validated_passenger_payload(raw_payload, index)
            passenger = quick_serializer._get_passenger(trip.company, payload)
            group = self._passenger_group_for_payload(trip, payload, index)
            link_id = str(raw_payload.get("id") or "")
            link = existing_links.get(link_id)

            duplicate = TripPassenger.objects.filter(company=trip.company, trip=trip, passenger=passenger)
            if link:
                duplicate = duplicate.exclude(id=link.id)
            if duplicate.exists():
                raise serializers.ValidationError({"passengers": f"Yolcu {index + 1}: aynı yolcu seferde birden fazla olamaz."})

            if not link:
                link = TripPassenger(company=trip.company, trip=trip, passenger=passenger)
            link.passenger = passenger
            link.group = group
            link.seat_no = str(raw_payload.get("seat_no") or "")
            if raw_payload.get("status") in dict(TripPassenger.Status.choices):
                link.status = raw_payload["status"]
            link.save()
            retained_link_ids.append(link.id)

        trip.trip_passengers.exclude(id__in=retained_link_ids).delete()

    def _validated_passenger_payload(self, raw_payload, index):
        payload = dict(raw_payload)
        data = {
            "first_name": payload.get("first_name", ""),
            "last_name": payload.get("last_name", ""),
            "identity_type": payload.get("identity_type", Passenger.IdentityType.UNKNOWN),
            "identity_no": payload.get("identity_no", ""),
            "nationality": payload.get("nationality") or ("TR" if payload.get("identity_type") == Passenger.IdentityType.TC else ""),
            "country_name": payload.get("country_name", ""),
            "gender": payload.get("gender", ""),
            "phone": payload.get("phone", ""),
        }
        serializer = PassengerSerializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"passengers": {index: exc.detail}}) from exc
        return serializer.validated_data

    def _passenger_group_for_payload(self, trip, payload, index):
        group_id = payload.get("group_id")
        groups = list(trip.groups.all())
        if group_id:
            for group in groups:
                if str(group.id) == str(group_id):
                    return group
            raise serializers.ValidationError({"passengers": f"Yolcu {index + 1}: sefer grubu bulunamadı."})
        group_index = payload.get("group_index")
        if group_index not in (None, ""):
            try:
                return groups[int(group_index)]
            except (ValueError, TypeError, IndexError) as exc:
                raise serializers.ValidationError({"passengers": f"Yolcu {index + 1}: sefer grubu bulunamadı."}) from exc
        return groups[0] if groups else None


class QuickCreateTripSerializer(serializers.Serializer):
    departure_at = serializers.DateTimeField()
    arrival_estimated_at = serializers.DateTimeField(required=False, allow_null=True)
    vehicle_id = serializers.UUIDField(required=False)
    driver_id = serializers.UUIDField(required=False)
    vehicle = serializers.DictField(required=False)
    driver = serializers.DictField(required=False)
    route = serializers.DictField()
    group = serializers.DictField(required=False)
    groups = serializers.ListField(child=serializers.DictField(), required=False, allow_empty=True)
    passenger_group = serializers.DictField(required=False)
    personnel = serializers.ListField(child=serializers.DictField(), required=False, allow_empty=True)
    passengers = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    route_note = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    firm_trip_no = serializers.CharField(required=False, allow_blank=True)
    submit_to_uetds = serializers.BooleanField(default=False)

    def create(self, validated_data):
        company = self.context["company"]
        user = self.context["user"]
        route = validated_data["route"]
        from_data = route.get("from", {})
        to_data = route.get("to", {})
        with transaction.atomic():
            vehicle = self._get_vehicle(company, validated_data.get("vehicle") or {}, validated_data.get("vehicle_id"))
            driver = self._get_driver(company, validated_data.get("driver") or {}, validated_data.get("driver_id"))
            trip = Trip.objects.create(
                company=company,
                created_by=user,
                firm_trip_no=validated_data.get("firm_trip_no", ""),
                description=validated_data.get("description", ""),
                vehicle=vehicle,
                driver=driver,
                departure_at=validated_data["departure_at"],
                arrival_estimated_at=validated_data.get("arrival_estimated_at"),
                departure_city=from_data.get("city", ""),
                departure_district=from_data.get("district", ""),
                departure_address=from_data.get("address", ""),
                arrival_city=to_data.get("city", ""),
                arrival_district=to_data.get("district", ""),
                arrival_address=to_data.get("address", ""),
                route_note=validated_data.get("route_note", ""),
            )
            group = self._create_group(
                company,
                trip,
                route,
                self._group_payloads(validated_data)[0],
            )
            groups = [group]
            for group_data in self._group_payloads(validated_data)[1:]:
                groups.append(self._create_group(company, trip, route, group_data))
            TripPersonnel.objects.create(company=company, trip=trip, personnel=driver, role="driver")
            for personnel_data in validated_data.get("personnel", []):
                personnel = self._get_personnel(company, personnel_data, default_type=personnel_data.get("type", "assistant"))
                role = personnel_data.get("role") or personnel.type
                TripPersonnel.objects.get_or_create(company=company, trip=trip, personnel=personnel, role=role)
            for passenger_data in validated_data["passengers"]:
                passenger = self._get_passenger(company, passenger_data)
                TripPassenger.objects.create(
                    company=company,
                    trip=trip,
                    passenger=passenger,
                    group=self._passenger_group(groups, passenger_data),
                    seat_no=passenger_data.get("seat_no", ""),
                )
            trip.passenger_count = trip.trip_passengers.count()
            trip.status = "ready" if self._ready_for_uetds(trip) else "draft"
            trip.save(update_fields=["passenger_count", "status"])
        return trip

    def _group_payloads(self, validated_data):
        groups = validated_data.get("groups") or []
        if groups:
            return groups
        return [validated_data.get("group") or validated_data.get("passenger_group") or {}]

    def _get_vehicle(self, company, data, vehicle_id=None):
        if vehicle_id:
            try:
                return Vehicle.objects.get(company=company, id=vehicle_id, status=Vehicle.Status.ACTIVE)
            except Vehicle.DoesNotExist as exc:
                raise serializers.ValidationError({"vehicle_id": "Aktif araç bulunamadı."}) from exc
        if data.get("id"):
            try:
                return Vehicle.objects.get(company=company, id=data["id"], status=Vehicle.Status.ACTIVE)
            except Vehicle.DoesNotExist as exc:
                raise serializers.ValidationError({"vehicle": "Aktif araç bulunamadı."}) from exc
        plate = (data.get("plate") or "").replace(" ", "").upper()
        if not plate:
            raise serializers.ValidationError({"vehicle": "Plaka zorunlu."})
        vehicle, _ = Vehicle.objects.get_or_create(
            company=company,
            plate=plate,
            defaults={
                "brand": data.get("brand", ""),
                "model": data.get("model", ""),
                "seat_capacity": data.get("seat_capacity") or 1,
                "phone": data.get("phone", ""),
            },
        )
        if data.get("phone") and vehicle.phone != data["phone"]:
            vehicle.phone = data["phone"]
            vehicle.save(update_fields=["phone", "updated_at"])
        return vehicle

    def _get_driver(self, company, data, driver_id=None):
        if driver_id:
            try:
                driver = Personnel.objects.get(company=company, id=driver_id, status=Personnel.Status.ACTIVE)
            except Personnel.DoesNotExist as exc:
                raise serializers.ValidationError({"driver_id": "Aktif şoför bulunamadı."}) from exc
            if driver.type != Personnel.Type.DRIVER:
                raise serializers.ValidationError({"driver_id": "Seçilen personel şoför değil."})
            return driver
        if data.get("id"):
            try:
                driver = Personnel.objects.get(company=company, id=data["id"], status=Personnel.Status.ACTIVE)
            except Personnel.DoesNotExist as exc:
                raise serializers.ValidationError({"driver": "Aktif şoför bulunamadı."}) from exc
            if driver.type != Personnel.Type.DRIVER:
                raise serializers.ValidationError({"driver": "Seçilen personel şoför değil."})
            return driver
        data = {**data, "type": "driver"}
        data.setdefault("role", "driver")
        data.setdefault("uetds_role_code", 0)
        return self._get_personnel(company, data, default_type="driver")

    def _get_personnel(self, company, data, default_type="assistant"):
        identity_no = data.get("identity_no")
        if not identity_no:
            raise serializers.ValidationError({"personnel": "Personel identity_no zorunlu."})
        identity_no = validate_turkish_identity_number(identity_no, "personnel.identity_no")
        normalized = dict(data)
        normalized["identity_no"] = identity_no
        if isinstance(normalized.get("src_codes"), list):
            normalized["src_codes"] = ", ".join(normalized["src_codes"])
        if "uetds_role_code" in normalized and normalized["uetds_role_code"] not in (None, ""):
            normalized["uetds_role_code"] = int(normalized["uetds_role_code"])
        driver = Personnel.objects.filter(company=company, identity_no=identity_no).first()
        if driver:
            updated_fields = []
            for field in ["type", "first_name", "last_name", "phone", "nationality", "gender", "address", "uetds_role_code", "src_codes"]:
                if field == "gender" and field in normalized:
                    normalized[field] = normalize_gender(normalized[field])
                if field in normalized and normalized[field] not in (None, "") and getattr(driver, field) != normalized[field]:
                    setattr(driver, field, normalized[field])
                    updated_fields.append(field)
            if updated_fields:
                driver.save(update_fields=[*updated_fields, "updated_at"])
            return driver
        if not normalized.get("first_name") or not normalized.get("last_name"):
            raise serializers.ValidationError({"personnel": "Yeni personel için first_name ve last_name gerekli."})
        return Personnel.objects.create(
            company=company,
            type=normalized.get("type") or default_type,
            first_name=normalized["first_name"],
            last_name=normalized["last_name"],
            identity_no=identity_no,
            nationality=normalized.get("nationality", "TR"),
            gender=normalize_gender(normalized.get("gender", "")),
            phone=normalized.get("phone", ""),
            address=normalized.get("address", ""),
            uetds_role_code=normalized["uetds_role_code"] if "uetds_role_code" in normalized else 0,
            src_codes=normalized.get("src_codes", ""),
            status=Personnel.Status.PASSIVE,
        )

    def _create_group(self, company, trip, route, data):
        from_data = route.get("from", {})
        to_data = route.get("to", {})
        return TripGroup.objects.create(
            company=company,
            trip=trip,
            name=data.get("name") or "TRANSFER",
            description=data.get("description") or trip.route_note,
            price=data.get("price"),
            currency=data.get("currency") or "TRY",
            departure_country=data.get("departure_country") or from_data.get("country") or "TR",
            departure_city=data.get("departure_city") or from_data.get("city", ""),
            departure_district=data.get("departure_district") or from_data.get("district", ""),
            departure_city_code=str(data.get("departure_city_code") or from_data.get("city_code") or ""),
            departure_district_code=str(data.get("departure_district_code") or from_data.get("district_code") or ""),
            departure_place=data.get("departure_place") or from_data.get("place") or from_data.get("address", ""),
            arrival_country=data.get("arrival_country") or to_data.get("country") or "TR",
            arrival_city=data.get("arrival_city") or to_data.get("city", ""),
            arrival_district=data.get("arrival_district") or to_data.get("district", ""),
            arrival_city_code=str(data.get("arrival_city_code") or to_data.get("city_code") or ""),
            arrival_district_code=str(data.get("arrival_district_code") or to_data.get("district_code") or ""),
            arrival_place=data.get("arrival_place") or to_data.get("place") or to_data.get("address", ""),
        )

    def _get_passenger(self, company, data):
        identity_no = data.get("identity_no")
        identity_type = data.get("identity_type", "unknown")
        if identity_type == "tc":
            identity_no = validate_turkish_identity_number(identity_no, "passengers.identity_no")
        if identity_no:
            passenger = Passenger.objects.filter(company=company, identity_no=identity_no).first()
            if passenger:
                updated_fields = []
                for field in ["first_name", "last_name", "identity_type", "nationality", "country_name", "gender", "phone"]:
                    if field == "gender" and field in data:
                        data[field] = normalize_gender(data[field])
                    if field in data and data[field] not in (None, "") and getattr(passenger, field) != data[field]:
                        setattr(passenger, field, data[field])
                        updated_fields.append(field)
                if updated_fields:
                    passenger.save(update_fields=[*updated_fields, "updated_at"])
                return passenger
        return Passenger.objects.create(
            company=company,
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
            identity_type=data.get("identity_type", "unknown"),
            identity_no=identity_no,
            nationality=data.get("nationality", "TR"),
            country_name=data.get("country_name") or data.get("country_label", ""),
            gender=normalize_gender(data.get("gender", "")),
            phone=data.get("phone", ""),
        )

    def _passenger_group(self, groups, passenger_data):
        if not groups:
            return None
        group_index = passenger_data.get("group_index")
        if group_index not in (None, ""):
            try:
                return groups[int(group_index)]
            except (ValueError, TypeError, IndexError):
                return groups[0]
        group_name = passenger_data.get("group_name")
        if group_name:
            for group in groups:
                if group.name == group_name:
                    return group
        return groups[0]

    def _ready_for_uetds(self, trip):
        return not self.get_missing_fields(trip)

    def get_missing_fields(self, trip):
        missing = []
        checks = [
            ("vehicle.plate", trip.vehicle_id and trip.vehicle.plate),
            ("departure_at", trip.departure_at),
            ("arrival_estimated_at", trip.arrival_estimated_at),
            ("driver.identity_no", trip.driver_id and trip.driver.identity_no),
            ("driver.first_name", trip.driver_id and trip.driver.first_name),
            ("driver.last_name", trip.driver_id and trip.driver.last_name),
            ("driver.nationality", trip.driver_id and trip.driver.nationality),
            ("driver.uetds_role_code", trip.driver_id and trip.driver.uetds_role_code is not None),
            ("passengers", trip.passenger_count > 0),
        ]
        missing.extend(field for field, value in checks if not value)

        for index, group in enumerate(trip.groups.all(), start=1):
            prefix = f"groups.{index}"
            group_checks = [
                (f"{prefix}.name", group.name),
                (f"{prefix}.description", group.description),
                (f"{prefix}.departure_country", group.departure_country),
                (f"{prefix}.departure_place", group.departure_place),
                (f"{prefix}.arrival_country", group.arrival_country),
                (f"{prefix}.arrival_place", group.arrival_place),
                (f"{prefix}.price", group.price is not None),
            ]
            if group.departure_country == "TR":
                group_checks.extend(
                    [
                        (f"{prefix}.departure_city_code", group.departure_city_code),
                        (f"{prefix}.departure_district_code", group.departure_district_code),
                    ]
                )
            if group.arrival_country == "TR":
                group_checks.extend(
                    [
                        (f"{prefix}.arrival_city_code", group.arrival_city_code),
                        (f"{prefix}.arrival_district_code", group.arrival_district_code),
                    ]
                )
            missing.extend(field for field, value in group_checks if not value)

        for index, link in enumerate(trip.trip_passengers.select_related("passenger", "group").all(), start=1):
            passenger = link.passenger
            prefix = f"passengers.{index}"
            passenger_checks = [
                (f"{prefix}.group", link.group_id),
                (f"{prefix}.first_name", passenger.first_name),
                (f"{prefix}.last_name", passenger.last_name),
                (f"{prefix}.identity_no", passenger.identity_no),
                (f"{prefix}.nationality", passenger.nationality),
            ]
            missing.extend(field for field, value in passenger_checks if not value)
        return missing


class SubmitUETDSSerializer(serializers.Serializer):
    environment = serializers.CharField(required=False, allow_blank=True)
    confirm_live_submission = serializers.BooleanField(default=False)
    idempotency_key = serializers.CharField(required=False, allow_blank=True)

    def validate_environment(self, value):
        if not value:
            return ""
        return validate_uetds_environment(value)


class CancelUETDSSerializer(serializers.Serializer):
    environment = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField()
    confirm_live_submission = serializers.BooleanField(default=False)

    def validate_environment(self, value):
        if not value:
            return ""
        return validate_uetds_environment(value)
