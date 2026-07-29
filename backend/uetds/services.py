import hashlib
import json
import unicodedata

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from common.identity import is_valid_turkish_identity_no
from common.permissions import role_has_permission
from uetds.client import UetdsAriziClient, UETDSResponse
from uetds.models import IdempotencyRecord, UETDSCredential, UETDSOperationLog, UETDSOperationStep
from uetds.utils import mask_sensitive


WRITE_OPERATIONS = {
    "seferEkle",
    "seferGuncelle",
    "seferPlakaDegistir",
    "seferGrupEkle",
    "seferGrupGuncelle",
    "personelEkle",
    "personelIptal",
    "yolcuEkleCoklu",
    "yolcuIptal",
    "seferIptal",
}
CREDENTIAL_MISSING_CODE = "UETDS_CREDENTIAL_MISSING"


def validate_environment(environment):
    environment = environment or "test"
    if environment not in settings.UETDS_ALLOWED_ENVIRONMENTS:
        raise ValidationError(
            {
                "environment": (
                    "Bu kurulumda sadece UETDS test ortamı kullanılabilir. "
                    "Gerçek UETDS ortamı kapalıdır."
                )
            }
        )
    return environment


def get_endpoint(environment):
    environment = validate_environment(environment)
    return settings.UETDS_LIVE_URL if environment == "live" else settings.UETDS_TEST_URL


def get_credential(company, environment):
    environment = validate_environment(environment)
    try:
        credential = UETDSCredential.objects.get(company=company, environment=environment, is_active=True)
    except UETDSCredential.DoesNotExist as exc:
        message = f"{environment} UETDS bilgisi tanımlı değil."
        record_configuration_error(company, environment, message)
        raise ValidationError({"credential": message}) from exc
    endpoint_url = get_endpoint(environment)
    if credential.endpoint_url != endpoint_url:
        credential.endpoint_url = endpoint_url
        credential.save(update_fields=["endpoint_url", "updated_at"])
    return credential


def record_configuration_error(company, environment, message, operation="credentialCheck", code=CREDENTIAL_MISSING_CODE):
    latest = (
        UETDSOperationLog.objects.filter(
            company=company,
            operation=operation,
            environment=environment,
            success=False,
            uetds_sonuc_kodu=code,
        )
        .order_by("-created_at")
        .first()
    )
    if latest:
        latest.uetds_sonuc_mesaji = message
        latest.save(update_fields=["uetds_sonuc_mesaji", "updated_at"])
        return latest
    return UETDSOperationLog.objects.create(
        company=company,
        operation=operation,
        environment=environment,
        success=False,
        uetds_sonuc_kodu=code,
        uetds_sonuc_mesaji=message,
    )


def ensure_live_guard(user, company, environment, operation, confirm_live_submission=False):
    validate_environment(environment)
    if environment != "live" or operation not in WRITE_OPERATIONS:
        return
    try:
        company_settings = company.settings
    except ObjectDoesNotExist:
        company_settings = None
    if not company_settings or not company_settings.live_uetds_enabled:
        raise PermissionDenied("Firma gerçek UETDS gönderimine kapalı.")
    if not confirm_live_submission:
        raise PermissionDenied("Gerçek UETDS gönderimi için confirm_live_submission=true gerekli.")
    if user.is_superuser:
        return
    membership = user.company_memberships.filter(company=company, is_active=True).first()
    if not membership or not role_has_permission(membership.role, "live_uetds_submit"):
        raise PermissionDenied("Gerçek UETDS gönderimi için yetkiniz yok.")


def log_response(company, trip, response: UETDSResponse, environment):
    return UETDSOperationLog.objects.create(
        company=company,
        trip=trip,
        operation=response.operation,
        environment=environment,
        http_status=response.http_status,
        success=response.success,
        uetds_sonuc_kodu=response.sonuc_kodu,
        uetds_sonuc_mesaji=response.sonuc_mesaji,
        request_xml=mask_sensitive(response.request_xml),
        response_xml=mask_sensitive(response.response_xml),
    )


def set_step(company, trip, operation, status, log=None):
    step, _ = UETDSOperationStep.objects.get_or_create(company=company, trip=trip, operation=operation)
    step.status = status
    step.attempts += 1
    if log:
        step.last_log = log
    step.save(update_fields=["status", "attempts", "last_log", "updated_at"])
    return step


def get_company_default_environment(company):
    try:
        environment = company.settings.default_uetds_environment
    except ObjectDoesNotExist:
        environment = "test"
    return validate_environment(environment or "test")


def run_vehicle_check(vehicle, user, environment=None):
    environment = validate_environment(environment or get_company_default_environment(vehicle.company))
    credential = get_credential(vehicle.company, environment)
    client = UetdsAriziClient(credential)
    checks = []
    authorization = {}
    for call in (client.yetki_belgesi_kontrol, client.arac_muayene_sorgula):
        response = call(vehicle.plate)
        log_response(vehicle.company, None, response, credential.environment)
        if response.operation == "yetkiBelgesiKontrol" and response.success:
            authorization = {
                "document_no": (response.data or {}).get("belgeNo", ""),
                "document_type": (response.data or {}).get("belgeTuru", ""),
                "company_title": (response.data or {}).get("firmaUnvan", ""),
                "unet_no": (response.data or {}).get("unetNo", ""),
                "valid_until": (response.data or {}).get("belgeGecerlilikTarihi", ""),
            }
        checks.append(
            {
                "operation": response.operation,
                "success": response.success,
                "sonuc_kodu": response.sonuc_kodu,
                "message": response.sonuc_mesaji,
            }
        )
    return {
        "vehicle_id": vehicle.id,
        "plate": vehicle.plate,
        "environment": environment,
        "authorization": authorization,
        "valid": all(item["success"] for item in checks),
        "checks": checks,
    }


def run_personnel_check(personnel, user, environment=None):
    if personnel.identity_no and not is_valid_turkish_identity_no(personnel.identity_no):
        raise ValidationError({"identity_no": "T.C. Kimlik numarası geçersiz. Şoför kaydını gerçek T.C. ile güncelleyin."})
    environment = validate_environment(environment or get_company_default_environment(personnel.company))
    credential = get_credential(personnel.company, environment)
    response = UetdsAriziClient(credential).mesleki_yeterlilik_sorgula(personnel.identity_no)
    log_response(personnel.company, None, response, credential.environment)
    return {
        "personnel_id": personnel.id,
        "environment": environment,
        "valid": response.success,
        "operation": response.operation,
        "sonuc_kodu": response.sonuc_kodu,
        "message": response.sonuc_mesaji,
    }


def verify_credentials(company, environment):
    credential = get_credential(company, environment)
    response = UetdsAriziClient(credential).kullanici_kontrol()
    log_response(company, None, response, environment)
    credential.last_verified_at = timezone.now()
    credential.last_result = "success" if response.success else "failed"
    credential.save(update_fields=["last_verified_at", "last_result", "updated_at"])
    return response


def ip_list(company, environment):
    credential = get_credential(company, environment)
    response = UetdsAriziClient(credential).ip_listele()
    log_response(company, None, response, environment)
    return response


@transaction.atomic
def submit_trip(trip, user, environment, idempotency_key="", confirm_live_submission=False):
    ensure_live_guard(user, trip.company, environment, "seferEkle", confirm_live_submission)
    validate_trip_identity_numbers(trip)
    _ensure_trip_groups(trip)
    current_snapshot = build_trip_submission_snapshot(trip)
    current_hash = trip_submission_hash(current_snapshot)
    endpoint = f"submit-uetds:{environment}:{current_hash}"
    if idempotency_key:
        record, _ = IdempotencyRecord.objects.get_or_create(
            company=trip.company,
            trip=trip,
            key=idempotency_key,
            endpoint=endpoint,
            defaults={"completed": False},
        )
        if record.completed:
            return record.response_data

    if trip.uetds_reference_no and trip.uetds_last_submitted_hash == current_hash and trip.status == "submitted":
        response_data = _submit_response(trip, [], message="UETDS kaydı zaten güncel.")
        if idempotency_key:
            record.response_data = response_data
            record.completed = True
            record.save(update_fields=["response_data", "completed", "updated_at"])
        return response_data

    credential = get_credential(trip.company, environment)
    client = UetdsAriziClient(credential)
    trip.status = "submitting"
    trip.uetds_environment = environment
    trip.save(update_fields=["status", "uetds_environment", "updated_at"])

    operation_results = []
    failed = False

    if trip.uetds_reference_no:
        failed = _run_update_flow(trip, client, environment, current_snapshot, operation_results)
    else:
        response = client.sefer_ekle(trip)
        log = log_response(trip.company, trip, response, environment)
        set_step(trip.company, trip, "seferEkle", "success" if response.success else "failed", log)
        operation_results.append(_operation_result(response))
        if response.success:
            reference = (response.data or {}).get("uetds_reference_no") or (response.data or {}).get("sonucReferansNo")
            trip.uetds_reference_no = reference or trip.uetds_reference_no or str(log.id)
            trip.save(update_fields=["uetds_reference_no", "updated_at"])
        else:
            failed = True

        if not failed:
            failed = _run_initial_children_flow(trip, client, environment, operation_results)

    if not failed:
        response = client.bildirim_ozeti(trip.uetds_reference_no)
        log = log_response(trip.company, trip, response, environment)
        set_step(trip.company, trip, "bildirimOzeti", "success" if response.success else "failed", log)
        operation_results.append(_operation_result(response))
        failed = failed or not response.success

    remote_cancelled = any(operation.get("remote_cancelled") for operation in operation_results)
    trip.status = "cancelled" if remote_cancelled else "partial_failed" if trip.uetds_reference_no and failed else "failed" if failed else "submitted"
    update_fields = ["status", "updated_at"]
    if not failed:
        trip.uetds_last_submitted_at = timezone.now()
        trip.uetds_last_submitted_hash = current_hash
        trip.uetds_last_submitted_snapshot = current_snapshot
        update_fields.extend(["uetds_last_submitted_at", "uetds_last_submitted_hash", "uetds_last_submitted_snapshot"])
    trip.save(update_fields=update_fields)
    response_data = _submit_response(trip, operation_results)

    if idempotency_key:
        record.response_data = response_data
        record.completed = not failed
        record.status_code = 200 if not failed else 409
        record.save(update_fields=["response_data", "completed", "status_code", "updated_at"])
    return response_data


def sync_trip_summary(trip, environment):
    if not trip.uetds_reference_no:
        raise ValidationError({"trip": "UETDS referansı olmayan sefer senkronize edilemez."})
    credential = get_credential(trip.company, environment)
    response = UetdsAriziClient(credential).bildirim_ozeti(trip.uetds_reference_no)
    log_response(trip.company, trip, response, environment)
    before_status = trip.status
    remote_status = _remote_status_from_summary(response)
    applied_changes = []

    if response.success and remote_status in {"submitted", "cancelled"}:
        target_status = "cancelled" if remote_status == "cancelled" else "submitted"
        save_fields = []
        if trip.status != target_status:
            trip.status = target_status
            applied_changes.append({"field": "status", "old": before_status, "new": target_status})
            save_fields.append("status")
        if trip.uetds_environment != environment:
            old_environment = trip.uetds_environment
            trip.uetds_environment = environment
            applied_changes.append({"field": "uetds_environment", "old": old_environment, "new": environment})
            save_fields.append("uetds_environment")
        if save_fields:
            trip.save(update_fields=[*save_fields, "updated_at"])

    sync_status = trip_uetds_sync_status(trip)
    result = _operation_result(response)
    result.update(
        {
            "environment": environment,
            "remote_status": remote_status,
            "local_status_before": before_status,
            "local_status_after": trip.status,
            "updated": bool(applied_changes),
            "applied_changes": applied_changes,
            "uetds_sync_status": sync_status,
            "message": _sync_summary_message(response, remote_status, sync_status, bool(applied_changes)),
        }
    )
    return result


def _remote_status_from_summary(response):
    if not response.success:
        return "unknown"
    summary_text = _normalize_summary_text(" ".join(_summary_values(response.data or {})))
    message = _normalize_summary_text(response.sonuc_mesaji or "")
    haystack = f"{message} {summary_text}".strip()
    if any(marker in haystack for marker in ("bulunamad", "not found")):
        return "unknown"
    if any(marker in haystack for marker in ("iptal", "cancelled", "canceled")):
        return "cancelled"
    return "submitted"


def _normalize_summary_text(value):
    normalized = unicodedata.normalize("NFKD", value.casefold())
    return "".join(character for character in normalized if not unicodedata.combining(character))


def _summary_values(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from _summary_values(item)
        return
    if isinstance(value, list):
        for item in value:
            yield from _summary_values(item)
        return
    if value is not None:
        yield str(value)


def _sync_summary_message(response, remote_status, sync_status, updated):
    if not response.success:
        return response.sonuc_mesaji or "UETDS özeti alınamadı; yerel kayıt değiştirilmedi."
    if remote_status == "cancelled":
        if updated:
            return "UETDS'de sefer iptal görünüyor; uygulamadaki kayıt iptal olarak güncellendi."
        return "UETDS'de sefer iptal görünüyor; uygulamadaki kayıt zaten iptal."
    if remote_status == "submitted":
        if updated:
            return "UETDS'de sefer aktif görünüyor; uygulamadaki durum gönderilmiş olarak güncellendi."
        if sync_status == "synced":
            return "UETDS özeti alındı; uygulamadaki kayıt son gönderimle güncel."
        return "UETDS özeti alındı. Uygulamadaki son değişiklikler henüz UETDS'ye gönderilmediyse güncelle ve tekrar gönder."
    return "UETDS özeti alındı ancak sefer durumu net okunamadı; yerel kayıt değiştirilmedi."


def cancel_trip(trip, user, reason, environment, confirm_live_submission=False):
    if not trip.uetds_reference_no:
        raise ValidationError({"trip": "UETDS referansı olmayan sefer silinmeli, iptal edilemez."})
    ensure_live_guard(user, trip.company, environment, "seferIptal", confirm_live_submission)
    credential = get_credential(trip.company, environment)
    client = UetdsAriziClient(credential)
    response = client.sefer_iptal(trip.uetds_reference_no, reason)
    log_response(trip.company, trip, response, environment)
    result = _operation_result(response)

    summary_response = client.bildirim_ozeti(trip.uetds_reference_no)
    log_response(trip.company, trip, summary_response, environment)
    summary_remote_status = _remote_status_from_summary(summary_response)
    result.update(
        {
            "summary_success": summary_response.success,
            "summary_sonuc_kodu": summary_response.sonuc_kodu,
            "summary_sonuc_mesaji": summary_response.sonuc_mesaji,
            "summary_remote_status": summary_remote_status,
        }
    )

    if summary_response.success and summary_remote_status == "cancelled":
        result["remote_cancelled"] = True
        result["success"] = True
        result["sonuc_mesaji"] = "UETDS sefer iptali Bakanlık özetiyle doğrulandı."
        trip.status = "cancelled"
        trip.save(update_fields=["status", "updated_at"])
    elif summary_response.success and summary_remote_status == "submitted":
        result["success"] = False
        result["sonuc_mesaji"] = "UETDS iptal isteği alındı ancak Bakanlık özeti seferi hâlâ geçerli gösteriyor. Biraz sonra senkronize et; hâlâ geçerliyse tekrar iptal isteği gönder."
        trip.status = "cancel_requested" if response.success or result["remote_cancelled"] else "submitted"
        trip.save(update_fields=["status", "updated_at"])
    elif response.success or result["remote_cancelled"]:
        result["success"] = False
        result["sonuc_mesaji"] = "UETDS iptal isteği alındı ancak Bakanlık özetiyle doğrulanamadı. Biraz sonra UETDS'den senkronize et."
        trip.status = "cancel_requested"
        trip.save(update_fields=["status", "updated_at"])
    return result


def validate_trip_identity_numbers(trip):
    driver_links = list(trip.trip_personnel.select_related("personnel").filter(role="driver"))
    drivers = [link.personnel for link in driver_links] or ([trip.driver] if trip.driver_id else [])
    for index, driver in enumerate(drivers, start=1):
        if driver.identity_no and not is_valid_turkish_identity_no(driver.identity_no):
            key = "driver.identity_no" if index == 1 else f"drivers.{index}.identity_no"
            raise ValidationError({key: "Şoför T.C. Kimlik numarası geçersiz. Gerçek T.C. ile güncelleyin."})
    for index, link in enumerate(trip.trip_passengers.select_related("passenger").all(), start=1):
        passenger = link.passenger
        if passenger.identity_type == "tc" and not is_valid_turkish_identity_no(passenger.identity_no):
            raise ValidationError({f"passengers.{index}.identity_no": "Yolcu T.C. Kimlik numarası geçersiz."})


def _operation_result(response):
    return {
        "operation": response.operation,
        "success": response.success,
        "sonuc_kodu": response.sonuc_kodu,
        "sonuc_mesaji": response.sonuc_mesaji,
        "remote_cancelled": response_indicates_remote_cancelled(response),
    }


def response_indicates_remote_cancelled(response):
    text = " ".join([response.sonuc_mesaji or "", *_summary_values(response.data or {})])
    haystack = _normalize_summary_text(text)
    return any(
        marker in haystack
        for marker in (
            "iptal edilen sefer",
            "iptal edilmis sefer",
            "sefer zaten iptal",
            "sefer iptal edilmistir",
            "sefer iptal edildi",
        )
    )


def _trip_personnel_for_uetds(trip):
    links = list(trip.trip_personnel.select_related("personnel").all())
    personnel = [(link.personnel, link.role) for link in links]
    has_driver_link = any(link.role == "driver" for link in links)
    if trip.driver_id and not has_driver_link:
        personnel = [(person, role) for person, role in personnel if person.id != trip.driver_id]
        personnel.insert(0, (trip.driver, "driver"))
    return personnel


def _run_initial_children_flow(trip, client, environment, operation_results):
    failed = False
    groups = list(_ensure_trip_groups(trip))
    for group in groups:
        if group.uetds_group_ref_no:
            continue
        response = client.sefer_grup_ekle(trip, group)
        log = log_response(trip.company, trip, response, environment)
        set_step(trip.company, trip, "seferGrupEkle", "success" if response.success else "failed", log)
        operation_results.append(_operation_result(response))
        if response.success:
            group_reference = (response.data or {}).get("uetds_group_ref_no") or (response.data or {}).get("uetdsGrupRefNo")
            group.uetds_group_ref_no = group_reference or group.uetds_group_ref_no or "1"
            group.save(update_fields=["uetds_group_ref_no", "updated_at"])
        else:
            failed = True
            break

    if not failed:
        for personnel, _role in _trip_personnel_for_uetds(trip):
            response = client.personel_ekle(trip, personnel)
            log = log_response(trip.company, trip, response, environment)
            set_step(trip.company, trip, "personelEkle", "success" if response.success else "failed", log)
            operation_results.append(_operation_result(response))
            if not response.success:
                failed = True
                break

    if not failed:
        passenger_links = list(trip.trip_passengers.select_related("passenger", "group").all())
        response = client.yolcu_ekle_coklu(trip, passenger_links)
        log = log_response(trip.company, trip, response, environment)
        set_step(trip.company, trip, "yolcuEkleCoklu", "success" if response.success else "failed", log)
        operation_results.append(_operation_result(response))
        failed = failed or not response.success
    return failed


def _run_update_flow(trip, client, environment, current_snapshot, operation_results):
    old_snapshot = trip.uetds_last_submitted_snapshot or {}
    failed = False
    old_plate = ((old_snapshot.get("trip") or {}).get("vehicle_plate") or "").replace(" ", "").upper()
    new_plate = ((current_snapshot.get("trip") or {}).get("vehicle_plate") or "").replace(" ", "").upper()
    if old_plate and new_plate and old_plate != new_plate:
        response = client.sefer_plaka_degistir(trip)
        log = log_response(trip.company, trip, response, environment)
        set_step(trip.company, trip, "seferPlakaDegistir", "success" if response.success else "failed", log)
        operation_results.append(_operation_result(response))
        failed = failed or not response.success

    if not failed:
        response = client.sefer_guncelle(trip)
        log = log_response(trip.company, trip, response, environment)
        set_step(trip.company, trip, "seferGuncelle", "success" if response.success else "failed", log)
        operation_results.append(_operation_result(response))
        failed = failed or not response.success

    if not failed:
        groups = list(_ensure_trip_groups(trip))
        for group in groups:
            operation = "seferGrupGuncelle" if group.uetds_group_ref_no else "seferGrupEkle"
            response = client.sefer_grup_guncelle(trip, group) if group.uetds_group_ref_no else client.sefer_grup_ekle(trip, group)
            log = log_response(trip.company, trip, response, environment)
            set_step(trip.company, trip, operation, "success" if response.success else "failed", log)
            operation_results.append(_operation_result(response))
            if response.success and not group.uetds_group_ref_no:
                group_reference = (response.data or {}).get("uetds_group_ref_no") or (response.data or {}).get("uetdsGrupRefNo")
                group.uetds_group_ref_no = group_reference or group.uetds_group_ref_no or "1"
                group.save(update_fields=["uetds_group_ref_no", "updated_at"])
            if not response.success:
                failed = True
                break

    if not failed:
        failed = _sync_updated_personnel(trip, client, environment, old_snapshot, current_snapshot, operation_results)

    if not failed:
        failed = _sync_updated_passengers(trip, client, environment, old_snapshot, current_snapshot, operation_results)

    return failed


def _sync_updated_personnel(trip, client, environment, old_snapshot, current_snapshot, operation_results):
    old_personnel = old_snapshot.get("personnel")
    if old_personnel is None or old_personnel == current_snapshot.get("personnel", []):
        return False
    failed = False
    for item in old_personnel:
        identity_no = item.get("identity_no", "")
        if not identity_no:
            continue
        response = client.personel_iptal(trip, identity_no)
        log = log_response(trip.company, trip, response, environment)
        set_step(trip.company, trip, "personelIptal", "success" if response.success else "failed", log)
        operation_results.append(_operation_result(response))
        if not response.success:
            return True
    for personnel, _role in _trip_personnel_for_uetds(trip):
        response = client.personel_ekle(trip, personnel)
        log = log_response(trip.company, trip, response, environment)
        set_step(trip.company, trip, "personelEkle", "success" if response.success else "failed", log)
        operation_results.append(_operation_result(response))
        if not response.success:
            failed = True
            break
    return failed


def _sync_updated_passengers(trip, client, environment, old_snapshot, current_snapshot, operation_results):
    old_passengers = old_snapshot.get("passengers")
    if old_passengers is None or old_passengers == current_snapshot.get("passengers", []):
        return False
    for item in old_passengers:
        identity_no = item.get("identity_no", "")
        seat_no = item.get("seat_no", "")
        if not identity_no:
            continue
        response = client.yolcu_iptal(trip, identity_no, seat_no)
        log = log_response(trip.company, trip, response, environment)
        set_step(trip.company, trip, "yolcuIptal", "success" if response.success else "failed", log)
        operation_results.append(_operation_result(response))
        if not response.success:
            return True
    passenger_links = list(trip.trip_passengers.select_related("passenger", "group").all())
    response = client.yolcu_ekle_coklu(trip, passenger_links)
    log = log_response(trip.company, trip, response, environment)
    set_step(trip.company, trip, "yolcuEkleCoklu", "success" if response.success else "failed", log)
    operation_results.append(_operation_result(response))
    return not response.success


def _ensure_trip_groups(trip):
    groups = list(trip.groups.all())
    if groups:
        return groups
    from trips.models import TripGroup

    group = TripGroup.objects.create(
        company=trip.company,
        trip=trip,
        name="TRANSFER",
        description=trip.route_note,
        departure_city=trip.departure_city,
        departure_district=trip.departure_district,
        departure_place=trip.departure_address,
        arrival_city=trip.arrival_city,
        arrival_district=trip.arrival_district,
        arrival_place=trip.arrival_address,
    )
    trip.trip_passengers.filter(group__isnull=True).update(group=group)
    if hasattr(trip, "_prefetched_objects_cache"):
        trip._prefetched_objects_cache = {}
    return [group]


def _submit_response(trip, operations, message=None):
    failed_operation = next((operation for operation in operations if not operation["success"]), None)
    return {
        "trip_id": str(trip.id),
        "status": trip.status,
        "environment": trip.uetds_environment,
        "uetds_reference_no": trip.uetds_reference_no,
        "uetds_sync_status": trip_uetds_sync_status(trip),
        "uetds_last_submitted_at": trip.uetds_last_submitted_at.isoformat() if trip.uetds_last_submitted_at else None,
        "operations": operations,
        "success": trip.status == "submitted",
        "message": failed_operation["sonuc_mesaji"] if failed_operation else message or "UETDS gönderimi başarılı.",
    }


def build_trip_submission_snapshot(trip):
    groups = []
    for group in trip.groups.all():
        groups.append(
            {
                "id": str(group.id),
                "name": group.name,
                "description": group.description,
                "price": "" if group.price is None else str(group.price),
                "currency": group.currency,
                "departure_country": group.departure_country,
                "departure_city": group.departure_city,
                "departure_district": group.departure_district,
                "departure_city_code": group.departure_city_code,
                "departure_district_code": group.departure_district_code,
                "departure_place": group.departure_place,
                "arrival_country": group.arrival_country,
                "arrival_city": group.arrival_city,
                "arrival_district": group.arrival_district,
                "arrival_city_code": group.arrival_city_code,
                "arrival_district_code": group.arrival_district_code,
                "arrival_place": group.arrival_place,
            }
        )
    personnel = []
    for person, role in _trip_personnel_for_uetds(trip):
        personnel.append(
            {
                "role": role,
                "identity_no": person.identity_no,
                "first_name": person.first_name,
                "last_name": person.last_name,
                "nationality": person.nationality,
                "gender": person.gender,
                "phone": person.phone,
                "address": person.address,
                "uetds_role_code": person.uetds_role_code,
            }
        )
    passengers = []
    for link in trip.trip_passengers.select_related("passenger", "group").all():
        passenger = link.passenger
        passengers.append(
            {
                "group_id": str(link.group_id or ""),
                "seat_no": link.seat_no,
                "status": link.status,
                "identity_type": passenger.identity_type,
                "identity_no": passenger.identity_no or "",
                "first_name": passenger.first_name,
                "last_name": passenger.last_name,
                "nationality": passenger.nationality,
                "country_name": passenger.country_name,
                "gender": passenger.gender,
                "phone": passenger.phone,
            }
        )
    return {
        "trip": {
            "vehicle_plate": trip.vehicle.plate if trip.vehicle_id else "",
            "vehicle_phone": trip.driver.phone if trip.driver_id else "",
            "driver_identity_no": trip.driver.identity_no if trip.driver_id else "",
            "firm_trip_no": trip.firm_trip_no or str(trip.id),
            "description": trip.description,
            "departure_at": trip.departure_at.isoformat() if trip.departure_at else "",
            "arrival_estimated_at": trip.arrival_estimated_at.isoformat() if trip.arrival_estimated_at else "",
            "departure_city": trip.departure_city,
            "departure_district": trip.departure_district,
            "departure_address": trip.departure_address,
            "arrival_city": trip.arrival_city,
            "arrival_district": trip.arrival_district,
            "arrival_address": trip.arrival_address,
            "route_note": trip.route_note,
        },
        "groups": sorted(groups, key=lambda item: item["id"]),
        "personnel": sorted(personnel, key=lambda item: (item["role"], item["identity_no"])),
        "passengers": sorted(passengers, key=lambda item: (item["group_id"], item["seat_no"], item["identity_no"])),
    }


def trip_submission_hash(snapshot):
    encoded = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def trip_uetds_sync_status(trip):
    if trip.status == "cancelled":
        return "cancelled"
    if not trip.uetds_reference_no:
        return "not_submitted"
    if not trip.uetds_last_submitted_hash:
        return "unknown"
    current_hash = trip_submission_hash(build_trip_submission_snapshot(trip))
    if current_hash == trip.uetds_last_submitted_hash and trip.status == "submitted":
        return "synced"
    if trip.status == "draft":
        return "local_draft"
    return "update_required"
