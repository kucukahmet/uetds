from datetime import timedelta

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from companies.models import Company, CompanyMembership, CompanySettings
from fleet.models import Vehicle
from imports.passenger_photo_ocr import extract_passengers_from_image
from passengers.models import Passenger
from people.models import Personnel
from common.permissions import role_has_permission
from trips.models import SavedLocation, SavedRoute, Trip, TripGroup, TripPassenger, TripPersonnel
from trips.reports import format_passenger_name
from uetds.client import UETDSResponse, UetdsAriziClient
from uetds.models import UETDSCredential, UETDSOperationLog


pytestmark = pytest.mark.django_db


def test_healthz_is_public():
    response = APIClient().get("/healthz/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "uetds-backend"}


def make_user(email="ops@example.com", password="secret"):
    return get_user_model().objects.create_user(username=email, email=email, password=password, name="Ops User")


def make_company(name="Firma A"):
    company = Company.objects.create(name=name)
    CompanySettings.objects.create(company=company)
    return company


def make_membership(user, company, role="company_admin"):
    return CompanyMembership.objects.create(user=user, company=company, role=role)


def auth_client(user, company):
    client = APIClient()
    client.force_authenticate(user)
    client.credentials(HTTP_X_COMPANY_ID=str(company.id))
    user.active_company_id = company.id
    user.save(update_fields=["active_company_id"])
    return client


def test_refresh_session_is_seven_days():
    assert settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"] == timedelta(days=7)


def test_login_returns_tokens_and_companies():
    user = make_user()
    company = make_company()
    make_membership(user, company)

    response = APIClient().post(
        "/api/v1/auth/login",
        {"email": "ops@example.com", "password": "secret"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["token_type"] == "Bearer"
    assert response.data["session_expires_in"] == 7 * 24 * 60 * 60
    assert response.data["user"]["active_company_id"] == str(company.id)
    assert response.data["user"]["memberships"][0]["company"]["name"] == "Firma A"


def test_company_settings_can_update_default_uetds_environment(settings):
    settings.UETDS_ALLOWED_ENVIRONMENTS = ("test", "live")
    user = make_user()
    company = make_company()
    make_membership(user, company)

    response = auth_client(user, company).patch(
        f"/api/v1/companies/{company.id}/settings/",
        {"default_uetds_environment": "live", "live_uetds_enabled": True},
        format="json",
    )

    company.settings.refresh_from_db()
    assert response.status_code == 200
    assert response.data["default_uetds_environment"] == "live"
    assert response.data["live_uetds_enabled"] is True
    assert company.settings.default_uetds_environment == "live"
    assert company.settings.live_uetds_enabled is True


def test_vehicle_list_is_tenant_scoped():
    user = make_user()
    company_a = make_company("Firma A")
    company_b = make_company("Firma B")
    make_membership(user, company_a)
    Vehicle.objects.create(company=company_a, plate="34AAA001", seat_capacity=10)
    Vehicle.objects.create(company=company_b, plate="06BBB002", seat_capacity=12)

    response = auth_client(user, company_a).get("/api/v1/vehicles/")

    assert response.status_code == 200
    plates = [item["plate"] for item in response.data["results"]]
    assert plates == ["34AAA001"]


def test_vehicle_create_validates_phone_as_digits():
    user = make_user()
    company = make_company("Firma A")
    make_membership(user, company)

    response = auth_client(user, company).post(
        "/api/v1/vehicles/",
        {
            "plate": "34AAA001",
            "seat_capacity": 16,
            "phone": "+90 555 ABC",
            "status": "active",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"]["phone"][0] == "Araç telefonu sadece sayı olmalı."


def test_vehicle_create_validates_seat_capacity_positive():
    user = make_user()
    company = make_company("Firma A")
    make_membership(user, company)

    response = auth_client(user, company).post(
        "/api/v1/vehicles/",
        {
            "plate": "34AAA001",
            "seat_capacity": 0,
            "status": "active",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"]["seat_capacity"][0] == "Koltuk sayısı pozitif sayı olmalı."


def test_personnel_duplicate_identity_returns_validation_error():
    user = make_user()
    company = make_company("Firma A")
    make_membership(user, company)
    Personnel.objects.create(company=company, type="driver", first_name="Gizem", last_name="Akbay", identity_no="84365938130")

    response = auth_client(user, company).post(
        "/api/v1/personnel/",
        {
            "type": "driver",
            "first_name": "Gizem",
            "last_name": "Akbay",
            "identity_no": "84365938130",
            "nationality": "TR",
            "gender": "Kadın",
            "uetds_role_code": 1,
            "src_codes": "SRC2",
            "phone": "05435339454",
            "status": "active",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"]["identity_no"][0] == "Bu kimlik/pasaport numarası bu firmada zaten kayıtlı."


def test_personnel_create_validates_driver_fields():
    user = make_user()
    company = make_company("Firma A")
    make_membership(user, company)

    response = auth_client(user, company).post(
        "/api/v1/personnel/",
        {
            "type": "driver",
            "first_name": "Gizem1",
            "last_name": "Akbay",
            "identity_no": "84365938",
            "nationality": "T1",
            "gender": "",
            "uetds_role_code": 1,
            "phone": "abc",
            "status": "active",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"]["first_name"][0] == "Ad sadece harf içermeli."
    assert response.data["message"]["identity_no"][0] == "T.C. Kimlik 11 haneli sayı olmalı."
    assert response.data["message"]["nationality"][0] == "Uyruk 2 veya 3 harfli ülke kodu olmalı."
    assert response.data["message"]["gender"][0] == "Cinsiyet seçilmeli."
    assert response.data["message"]["phone"][0] == "Telefon 10-15 haneli sayı olmalı."


def test_passenger_create_validates_form_fields():
    user = make_user()
    company = make_company("Firma A")
    make_membership(user, company)

    response = auth_client(user, company).post(
        "/api/v1/passengers/",
        {
            "first_name": "Ayse1",
            "last_name": "Demir",
            "identity_type": "tc",
            "identity_no": "123",
            "nationality": "T1",
            "country_name": "Türkiye",
            "gender": "",
            "phone": "abc",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"]["first_name"][0] == "Ad sadece harf içermeli."
    assert response.data["message"]["nationality"][0] == "Ülke kodu 2 veya 3 harf olmalı."
    assert response.data["message"]["gender"][0] == "Cinsiyet seçilmeli."
    assert response.data["message"]["phone"][0] == "Telefon 10-15 haneli sayı olmalı."


def test_passenger_create_validates_tc_identity_length():
    user = make_user()
    company = make_company("Firma A")
    make_membership(user, company)

    response = auth_client(user, company).post(
        "/api/v1/passengers/",
        {
            "first_name": "Ayse",
            "last_name": "Demir",
            "identity_type": "tc",
            "identity_no": "123",
            "nationality": "TR",
            "country_name": "Türkiye",
            "gender": "K",
            "phone": "05435339454",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"]["identity_no"][0] == "T.C. Kimlik 11 haneli sayı olmalı."


def test_personnel_create_validates_tc_identity_checksum():
    user = make_user()
    company = make_company("Firma A")
    make_membership(user, company)

    response = auth_client(user, company).post(
        "/api/v1/personnel/",
        {
            "type": "driver",
            "first_name": "Hüseyin",
            "last_name": "Akbay",
            "identity_no": "57400000214",
            "nationality": "TR",
            "gender": "E",
            "uetds_role_code": 0,
            "status": "active",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"]["identity_no"][0] == "T.C. Kimlik numarası geçersiz."


def test_passenger_create_validates_tc_identity_checksum():
    user = make_user()
    company = make_company("Firma A")
    make_membership(user, company)

    response = auth_client(user, company).post(
        "/api/v1/passengers/",
        {
            "first_name": "Ayse",
            "last_name": "Demir",
            "identity_type": "tc",
            "identity_no": "57400000214",
            "nationality": "TR",
            "country_name": "Türkiye",
            "gender": "K",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"]["identity_no"][0] == "T.C. Kimlik numarası geçersiz."


def test_personnel_and_passenger_accept_english_gender_codes():
    user = make_user()
    company = make_company("Gender Firma")
    make_membership(user, company)
    client = auth_client(user, company)

    personnel_response = client.post(
        "/api/v1/personnel/",
        {
            "type": "driver",
            "first_name": "John",
            "last_name": "Driver",
            "identity_no": "11111111110",
            "nationality": "GB",
            "gender": "M",
            "uetds_role_code": 1,
            "status": "active",
        },
        format="json",
    )
    passenger_response = client.post(
        "/api/v1/passengers/",
        {
            "first_name": "Mary",
            "last_name": "Passenger",
            "identity_type": "passport",
            "identity_no": "NRF00000974",
            "nationality": "GB",
            "country_name": "İngiltere",
            "gender": "F",
        },
        format="json",
    )

    assert personnel_response.status_code == 201
    assert personnel_response.data["gender"] == "E"
    assert personnel_response.data["status"] == Personnel.Status.PASSIVE
    assert passenger_response.status_code == 201
    assert passenger_response.data["gender"] == "K"


def test_personnel_identity_update_resets_uetds_approval():
    user = make_user()
    company = make_company("Identity Update Firma")
    make_membership(user, company)
    personnel = Personnel.objects.create(
        company=company,
        type="driver",
        first_name="Ali",
        last_name="Veli",
        identity_no="11111111110",
        status=Personnel.Status.ACTIVE,
        uetds_last_checked_at=timezone.now(),
    )

    response = auth_client(user, company).patch(
        f"/api/v1/personnel/{personnel.id}/",
        {"identity_no": "22222222220"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == Personnel.Status.PASSIVE
    assert response.data["uetds_last_checked_at"] is None


def test_saved_route_list_is_tenant_scoped():
    user = make_user()
    company_a = make_company("Firma A")
    company_b = make_company("Firma B")
    make_membership(user, company_a)
    SavedRoute.objects.create(
        company=company_a,
        name="Göcek -> Dalaman",
        departure_city="Muğla",
        departure_place="Göcek",
        arrival_city="Muğla",
        arrival_place="Dalaman Havalimanı",
    )
    SavedRoute.objects.create(
        company=company_b,
        name="İstanbul -> Ankara",
        departure_city="İstanbul",
        departure_place="Bakırköy",
        arrival_city="Ankara",
        arrival_place="Kızılay",
    )

    response = auth_client(user, company_a).get("/api/v1/routes/")

    assert response.status_code == 200
    assert [item["name"] for item in response.data["results"]] == ["Göcek -> Dalaman"]


def test_location_references_searches_airports_and_company_saved_locations():
    user = make_user()
    company = make_company("Rota Firma")
    make_membership(user, company)
    SavedLocation.objects.create(
        company=company,
        name="Göcek Marina",
        country="TR",
        city="Muğla",
        district="Fethiye",
        city_code="48",
        district_code="1331",
        place="Göcek Marina",
        address="Göcek Marina",
        usage_count=8,
    )

    client = auth_client(user, company)
    airport_response = client.get("/api/v1/location-references/?search=dalaman%20havalimani")
    airport_alias_response = client.get("/api/v1/location-references/?search=dlm")
    saved_response = client.get("/api/v1/location-references/?search=gocek")
    invalid_limit_response = client.get("/api/v1/location-references/?search=dalaman&limit=abc")

    assert airport_response.status_code == 200
    airport = airport_response.data["results"][0]
    assert airport["place"] == "Dalaman Havalimanı"
    assert airport["city_code"] == "48"
    assert airport["district_code"] == "99125"
    assert airport["kind"] == "airport"
    assert airport_alias_response.status_code == 200
    assert airport_alias_response.data["results"][0]["place"] == "Dalaman Havalimanı"
    assert saved_response.status_code == 200
    assert saved_response.data["results"][0]["source"] == "saved"
    assert saved_response.data["results"][0]["place"] == "Göcek Marina"
    assert invalid_limit_response.status_code == 200


def test_passenger_photo_ocr_endpoint_returns_parsed_passengers(monkeypatch):
    user = make_user()
    company = make_company("OCR Firma")
    make_membership(user, company)

    def fake_extract(image):
        assert image.name == "passengers.jpg"
        return {
            "passengers": [
                {
                    "first_name": "İbrahim",
                    "last_name": "Erkan",
                    "identity_type": "tc",
                    "identity_no": "10481878388",
                    "nationality": "TR",
                    "country_name": "Türkiye",
                    "gender": "E",
                    "seat_no": "",
                    "phone": "",
                }
            ],
            "raw_text": "TR İBRAHİM ERKAN 10481878388 E",
            "provider": "openai",
            "model": "gpt-4o-mini",
        }

    monkeypatch.setattr("imports.views.extract_passengers_from_image", fake_extract)
    image = SimpleUploadedFile("passengers.jpg", b"fake-image", content_type="image/jpeg")

    response = auth_client(user, company).post("/api/v1/imports/passenger-photo-ocr/", {"image": image}, format="multipart")

    assert response.status_code == 200
    assert response.data["passengers"][0]["first_name"] == "İbrahim"
    assert response.data["passengers"][0]["identity_no"] == "10481878388"


def test_passenger_photo_ocr_status_reports_missing_key(settings):
    settings.OPENAI_API_KEY = ""
    user = make_user()
    company = make_company("OCR Status Firma")
    make_membership(user, company)

    response = auth_client(user, company).get("/api/v1/imports/passenger-photo-ocr/status/")

    assert response.status_code == 200
    assert response.data == {
        "available": False,
        "provider": "openai",
        "model": settings.OPENAI_VISION_MODEL,
        "message": "Foto/OCR henüz bağlı değil. OPENAI_API_KEY eklendiğinde aktif olacak.",
    }


def test_passenger_photo_ocr_endpoint_reports_missing_key_as_unavailable(settings):
    settings.OPENAI_API_KEY = ""
    user = make_user()
    company = make_company("OCR Missing Key Firma")
    make_membership(user, company)
    image = SimpleUploadedFile("passengers.jpg", b"fake-image", content_type="image/jpeg")

    response = auth_client(user, company).post("/api/v1/imports/passenger-photo-ocr/", {"image": image}, format="multipart")

    assert response.status_code == 503
    assert response.data["message"]["detail"] == "Foto/OCR henüz bağlı değil. OPENAI_API_KEY eklendiğinde aktif olacak."
    assert response.data["error_code"] == "photo_ocr_not_configured"


def test_passenger_photo_ocr_service_normalizes_openai_response(monkeypatch, settings):
    settings.OPENAI_API_KEY = "test-key"
    settings.OPENAI_VISION_MODEL = "gpt-test"

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": '{"passengers":[{"first_name":"İBRAHİM","last_name":"ERKAN","identity_no":"10481878388","nationality":"Türkiye","gender":"Erkek","phone":"-"}],"raw_text":"TR İBRAHİM ERKAN"}'
                        }
                    }
                ]
            }

    def fake_post(url, headers, json, timeout):
        assert headers["Authorization"] == "Bearer test-key"
        assert json["model"] == "gpt-test"
        assert json["messages"][1]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
        return FakeResponse()

    monkeypatch.setattr("imports.passenger_photo_ocr.requests.post", fake_post)
    image = SimpleUploadedFile("passengers.jpg", b"fake-image", content_type="image/jpeg")

    result = extract_passengers_from_image(image)

    assert result["passengers"][0] == {
        "first_name": "İbrahim",
        "last_name": "Erkan",
        "identity_type": "tc",
        "identity_no": "10481878388",
        "nationality": "TR",
        "country_name": "Türkiye",
        "gender": "E",
        "seat_no": "",
        "phone": "",
    }


def test_sefer_grup_payload_sends_district_code_and_free_text_place(monkeypatch):
    user = make_user()
    company = make_company("UETDS Rota Firma")
    vehicle = Vehicle.objects.create(company=company, plate="48AAL247", seat_capacity=16)
    driver = Personnel.objects.create(company=company, type="driver", first_name="Hüseyin", last_name="Akbay", identity_no="57400000208")
    trip = _trip(company, user, vehicle, driver)
    trip.uetds_reference_no = "123456"
    trip.save(update_fields=["uetds_reference_no"])
    group = TripGroup.objects.create(
        company=company,
        trip=trip,
        name="TRANSFER",
        description="Göcek - Dalaman",
        price="900.00",
        departure_country="TR",
        departure_city="Muğla",
        departure_district="Fethiye",
        departure_city_code="48",
        departure_district_code="1331",
        departure_place="Göcek Marina",
        arrival_country="TR",
        arrival_city="Muğla",
        arrival_district="Dalaman Havalimanı",
        arrival_city_code="48",
        arrival_district_code="99125",
        arrival_place="Dalaman Havalimanı",
    )
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")

    captured = {}

    def fake_call(self, operation, payload):
        captured["operation"] = operation
        captured["payload"] = payload
        return UETDSResponse(operation, True, "0", "OK", {})

    monkeypatch.setattr(UetdsAriziClient, "_call", fake_call)

    UetdsAriziClient(credential).sefer_grup_ekle(trip, group)

    route_payload = captured["payload"]["seferGrupBilgileriInput"]
    assert captured["operation"] == "seferGrupEkle"
    assert route_payload["baslangicIl"] == "48"
    assert route_payload["baslangicIlce"] == "1331"
    assert route_payload["baslangicYer"] == "Göcek Marina"
    assert route_payload["bitisIl"] == "48"
    assert route_payload["bitisIlce"] == "99125"
    assert route_payload["bitisYer"] == "Dalaman Havalimanı"


def test_uetds_client_uses_basic_auth_full_soap_action_and_direct_login_payload(monkeypatch):
    company = make_company("UETDS Client Firma")
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test/uetdsarizi")
    credential.set_username("999999")
    credential.set_password("999999testtest")
    sent = {}

    class FakeResponse:
        status_code = 200
        text = (
            "<?xml version='1.0' encoding='UTF-8'?>"
            '<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">'
            '<S:Body><ns2:kullaniciKontrolResponse xmlns:ns2="http://uetds.unetws.udhb.gov.tr/">'
            "<return><sonucKodu>0</sonucKodu><sonucMesaji>OK</sonucMesaji></return>"
            "</ns2:kullaniciKontrolResponse></S:Body></S:Envelope>"
        )

    def fake_post(url, data, headers, auth, timeout):
        sent["url"] = url
        sent["data"] = data.decode("utf-8")
        sent["headers"] = headers
        sent["auth"] = auth
        sent["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("uetds.client.requests.post", fake_post)

    response = UetdsAriziClient(credential).kullanici_kontrol()

    assert response.success is True
    assert sent["url"] == "https://example.test/uetdsarizi"
    assert sent["auth"] == ("999999", "999999testtest")
    assert sent["headers"]["SOAPAction"] == "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/kullaniciKontrol"
    assert "<uet:kullaniciKontrol>" in sent["data"]
    assert "<kullaniciAdi>999999</kullaniciAdi>" in sent["data"]
    assert "<wsuser>" not in sent["data"]


def test_uetds_client_uses_schema_field_for_driver_certificate_check(monkeypatch):
    company = make_company("UETDS SRC Firma")
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test/uetdsarizi")
    credential.set_username("999999")
    credential.set_password("999999testtest")
    captured = {}

    def fake_call(self, operation, payload):
        captured["operation"] = operation
        captured["payload"] = payload
        return UETDSResponse(operation, True, "0", "OK", {})

    monkeypatch.setattr(UetdsAriziClient, "_call", fake_call)

    UetdsAriziClient(credential).mesleki_yeterlilik_sorgula("57400000208")

    assert captured["operation"] == "meslekiYeterlilikSorgula"
    assert captured["payload"] == {"kimlikNo": "57400000208"}


def test_vehicle_uetds_check_uses_company_default_live_environment(monkeypatch, settings):
    settings.UETDS_ALLOWED_ENVIRONMENTS = ("test", "live")
    user = make_user()
    company = make_company("Canli Arac Firma")
    company.settings.live_uetds_enabled = True
    company.settings.default_uetds_environment = "live"
    company.settings.save(update_fields=["live_uetds_enabled", "default_uetds_environment", "updated_at"])
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="48AAL247", seat_capacity=10)
    credential = UETDSCredential(company=company, environment="live", endpoint_url=settings.UETDS_TEST_URL)
    credential.set_username("live-user")
    credential.set_password("live-pass")
    credential.save()
    seen = []

    def fake_authorization_check(self, plate):
        seen.append((self.credential.environment, self.credential.endpoint_url, plate))
        return UETDSResponse(
            "yetkiBelgesiKontrol",
            True,
            "0",
            "OK",
            {
                "belgeNo": "İZM.U-NET.D2.48.12698",
                "belgeTuru": "D2",
                "firmaUnvan": "ÖMER ACAR TURİZM",
                "unetNo": "1575257",
            },
        )

    def fake_inspection_check(self, plate):
        seen.append((self.credential.environment, self.credential.endpoint_url, plate))
        return UETDSResponse("aracMuayeneSorgula", True, "0", "OK", {})

    monkeypatch.setattr("uetds.client.UetdsAriziClient.yetki_belgesi_kontrol", fake_authorization_check)
    monkeypatch.setattr("uetds.client.UetdsAriziClient.arac_muayene_sorgula", fake_inspection_check)

    response = auth_client(user, company).post(f"/api/v1/vehicles/{vehicle.id}/uetds-check/", {}, format="json")

    credential.refresh_from_db()
    assert response.status_code == 200
    assert response.data["environment"] == "live"
    assert response.data["valid"] is True
    assert response.data["authorization"]["document_no"] == "İZM.U-NET.D2.48.12698"
    assert seen == [("live", settings.UETDS_LIVE_URL, "48AAL247"), ("live", settings.UETDS_LIVE_URL, "48AAL247")]
    assert credential.endpoint_url == settings.UETDS_LIVE_URL
    vehicle.refresh_from_db()
    assert vehicle.uetds_authorization_document_no == "İZM.U-NET.D2.48.12698"
    assert vehicle.uetds_authorization_document_type == "D2"
    assert vehicle.uetds_company_title == "ÖMER ACAR TURİZM"
    assert vehicle.uetds_unet_no == "1575257"
    assert UETDSOperationLog.objects.filter(company=company, environment="live").count() == 2


def test_personnel_uetds_check_accepts_explicit_environment(monkeypatch):
    user = make_user()
    company = make_company("Test Sofor Firma")
    company.settings.default_uetds_environment = "live"
    company.settings.save(update_fields=["default_uetds_environment", "updated_at"])
    make_membership(user, company)
    personnel = Personnel.objects.create(
        company=company,
        type="driver",
        first_name="Ali",
        last_name="Veli",
        identity_no="11111111110",
        status=Personnel.Status.PASSIVE,
    )
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test/uetdsarizi")
    credential.set_username("test-user")
    credential.set_password("test-pass")
    credential.save()
    seen = {}

    def fake_personnel_check(self, identity_no):
        seen["environment"] = self.credential.environment
        seen["identity_no"] = identity_no
        return UETDSResponse("meslekiYeterlilikSorgula", True, "0", "OK", {})

    monkeypatch.setattr("uetds.client.UetdsAriziClient.mesleki_yeterlilik_sorgula", fake_personnel_check)

    response = auth_client(user, company).post(
        f"/api/v1/personnel/{personnel.id}/uetds-check/",
        {"environment": "test"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["environment"] == "test"
    assert response.data["valid"] is True
    assert seen == {"environment": "test", "identity_no": "11111111110"}
    personnel.refresh_from_db()
    assert personnel.status == Personnel.Status.ACTIVE
    assert personnel.uetds_last_checked_at is not None


def test_personnel_uetds_check_marks_personnel_passive_on_failure(monkeypatch):
    user = make_user()
    company = make_company("Hatali Sofor Firma")
    make_membership(user, company)
    personnel = Personnel.objects.create(company=company, type="driver", first_name="Ali", last_name="Veli", identity_no="11111111110")
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test/uetdsarizi")
    credential.set_username("test-user")
    credential.set_password("test-pass")
    credential.save()

    def fake_personnel_check(self, identity_no):
        return UETDSResponse("meslekiYeterlilikSorgula", False, "34", "Mesleki yeterlilik bulunamadı.", {})

    monkeypatch.setattr("uetds.client.UetdsAriziClient.mesleki_yeterlilik_sorgula", fake_personnel_check)

    response = auth_client(user, company).post(f"/api/v1/personnel/{personnel.id}/uetds-check/", {}, format="json")

    assert response.status_code == 200
    assert response.data["valid"] is False
    personnel.refresh_from_db()
    assert personnel.status == Personnel.Status.PASSIVE
    assert personnel.uetds_last_checked_at is not None


def test_trip_list_is_tenant_scoped():
    user = make_user()
    company_a = make_company("Firma A")
    company_b = make_company("Firma B")
    make_membership(user, company_a)
    vehicle_a = Vehicle.objects.create(company=company_a, plate="34AAA001", seat_capacity=10)
    driver_a = Personnel.objects.create(company=company_a, type="driver", first_name="A", last_name="A", identity_no="11111111110")
    vehicle_b = Vehicle.objects.create(company=company_b, plate="06BBB002", seat_capacity=12)
    driver_b = Personnel.objects.create(company=company_b, type="driver", first_name="B", last_name="B", identity_no="22222222220")
    from trips.models import Trip

    Trip.objects.create(
        company=company_a,
        created_by=user,
        vehicle=vehicle_a,
        driver=driver_a,
        departure_at=timezone.now(),
        departure_city="Istanbul",
        departure_address="A",
        arrival_city="Ankara",
        arrival_address="B",
    )
    Trip.objects.create(
        company=company_b,
        created_by=user,
        vehicle=vehicle_b,
        driver=driver_b,
        departure_at=timezone.now(),
        departure_city="Izmir",
        departure_address="C",
        arrival_city="Bursa",
        arrival_address="D",
    )

    response = auth_client(user, company_a).get("/api/v1/trips/")

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["vehicle_detail"]["plate"] == "34AAA001"


def test_cross_company_header_is_forbidden():
    user = make_user()
    company_a = make_company("Firma A")
    company_b = make_company("Firma B")
    make_membership(user, company_a)

    response = auth_client(user, company_b).get("/api/v1/vehicles/")

    assert response.status_code == 403


def test_quick_create_builds_trip_vehicle_driver_and_passengers():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    payload = {
        "departure_at": "2026-06-13T10:30:00+03:00",
        "vehicle": {"plate": "34 abc 123", "seat_capacity": 16},
        "driver": {
            "identity_no": "11111111110",
            "first_name": "Ahmet",
            "last_name": "Yilmaz",
            "phone": "+905551111111",
        },
        "route": {
            "from": {"city": "Istanbul", "district": "Bakirkoy", "address": "Havalimani"},
            "to": {"city": "Istanbul", "district": "Besiktas", "address": "Otel"},
        },
        "passengers": [
            {
                "first_name": "Ayse",
                "last_name": "Demir",
                "identity_type": "tc",
                "identity_no": "22222222220",
                "nationality": "TR",
            }
        ],
    }

    response = auth_client(user, company).post("/api/v1/trips/quick-create/", payload, format="json")

    assert response.status_code == 200
    assert response.data["status"] == "draft"
    assert "arrival_estimated_at" in response.data["validation"]["missing_fields"]
    assert "groups.1.price" in response.data["validation"]["missing_fields"]
    assert Vehicle.objects.get(company=company).plate == "34ABC123"
    assert Personnel.objects.get(company=company).identity_no == "11111111110"


def test_quick_create_preserves_uetds_group_personnel_and_passenger_fields():
    user = make_user()
    company = make_company("Ömer Acar Turizm")
    make_membership(user, company)
    payload = {
        "firm_trip_no": "LOCAL-260614",
        "description": "GÖCEK / DLM HAVALİMANI SEFER LİSTESİDİR.",
        "departure_at": "2026-06-14T18:00:00+03:00",
        "arrival_estimated_at": "2026-06-14T20:30:00+03:00",
        "vehicle": {"plate": "48 AAL 247", "seat_capacity": 16, "phone": "+905551111111"},
        "driver": {
            "identity_no": "57400000208",
            "first_name": "Hüseyin",
            "last_name": "Akbay",
            "nationality": "TR",
            "gender": "M",
            "uetds_role_code": 0,
            "src_codes": ["ODY1", "SRC2"],
        },
        "route": {
            "from": {"country": "TR", "city": "Muğla", "district": "Fethiye", "city_code": "48", "district_code": "1331", "address": "Göcek"},
            "to": {"country": "TR", "city": "Muğla", "district": "Dalaman Havalimanı", "city_code": "48", "district_code": "99125", "address": "Dalaman Havalimanı"},
        },
        "group": {"name": "TRANSFER", "description": "Göcek / DLM Havalimanı", "price": "900.00", "currency": "TRY"},
        "passengers": [
            {
                "first_name": "Mary",
                "last_name": "Ferguson",
                "identity_type": "passport",
                "identity_no": "NRF00000974",
                "nationality": "GB",
                "country_name": "İngiltere",
                "gender": "F",
                "seat_no": "1",
            }
        ],
    }

    response = auth_client(user, company).post("/api/v1/trips/quick-create/", payload, format="json")

    assert response.status_code == 200
    from trips.models import Trip

    trip = Trip.objects.get(id=response.data["trip_id"])
    assert trip.firm_trip_no == "LOCAL-260614"
    assert trip.description == "GÖCEK / DLM HAVALİMANI SEFER LİSTESİDİR."
    assert trip.vehicle.phone == "+905551111111"
    assert trip.driver.gender == "E"
    assert trip.driver.uetds_role_code == 0
    assert trip.driver.src_codes == "ODY1, SRC2"
    group = trip.groups.get()
    assert group.name == "TRANSFER"
    assert group.price == 900
    passenger_link = trip.trip_passengers.select_related("passenger", "group").get()
    assert passenger_link.group == group
    assert passenger_link.seat_no == "1"
    assert passenger_link.passenger.country_name == "İngiltere"
    assert passenger_link.passenger.gender == "K"


def test_quick_create_supports_wizard_groups_personnel_and_multiple_passengers():
    user = make_user()
    company = make_company("Wizard Turizm")
    make_membership(user, company)
    payload = {
        "firm_trip_no": "WIZ-001",
        "description": "Çoklu yolcu transferi",
        "departure_at": "2026-06-14T18:00:00+03:00",
        "arrival_estimated_at": "2026-06-14T20:30:00+03:00",
        "vehicle": {"plate": "48 AAL 247", "seat_capacity": 16, "phone": "+905551111111"},
        "driver": {
            "identity_no": "57400000208",
            "first_name": "Hüseyin",
            "last_name": "Akbay",
            "nationality": "TR",
            "gender": "E",
            "uetds_role_code": 0,
            "src_codes": "ODY1, SRC2",
        },
        "personnel": [
            {
                "type": "guide",
                "role": "guide",
                "identity_no": "12345678950",
                "first_name": "Ayşe",
                "last_name": "Rehber",
                "nationality": "TR",
                "gender": "K",
                "uetds_role_code": 5,
            }
        ],
        "route": {
            "from": {"country": "TR", "city": "Muğla", "district": "Fethiye", "city_code": "48", "district_code": "1331", "address": "Göcek"},
            "to": {"country": "TR", "city": "Muğla", "district": "Dalaman Havalimanı", "city_code": "48", "district_code": "99125", "address": "Dalaman Havalimanı"},
        },
        "groups": [
            {"name": "TRANSFER", "description": "Göcek transfer grubu", "price": "900.00", "currency": "TRY"},
        ],
        "passengers": [
            {
                "first_name": "Gerrad",
                "last_name": "Ferguson",
                "identity_type": "passport",
                "identity_no": "NRF00000974",
                "nationality": "GB",
                "country_name": "İngiltere",
                "gender": "E",
                "seat_no": "1",
                "group_index": 0,
            },
            {
                "first_name": "Marijke",
                "last_name": "Feldman",
                "identity_type": "passport",
                "identity_no": "JKR00000931",
                "nationality": "GB",
                "country_name": "İngiltere",
                "gender": "K",
                "seat_no": "2",
                "group_index": 0,
            },
        ],
    }

    response = auth_client(user, company).post("/api/v1/trips/quick-create/", payload, format="json")

    assert response.status_code == 200
    assert response.data["status"] == "ready"
    assert response.data["validation"]["missing_fields"] == []
    from trips.models import Trip

    trip = Trip.objects.get(id=response.data["trip_id"])
    assert trip.trip_passengers.count() == 2
    assert trip.trip_personnel.count() == 2
    assert trip.groups.get().price == 900


def test_quick_create_uses_existing_vehicle_and_driver_ids():
    user = make_user()
    company = make_company("Kayıtlı Firma")
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="48 AAL 247", seat_capacity=16, phone="+905551111111")
    driver = Personnel.objects.create(
        company=company,
        type="driver",
        identity_no="57400000208",
        first_name="Hüseyin",
        last_name="Akbay",
        nationality="TR",
        uetds_role_code=0,
    )
    payload = {
        "departure_at": "2026-06-14T18:00:00+03:00",
        "arrival_estimated_at": "2026-06-14T20:30:00+03:00",
        "vehicle_id": str(vehicle.id),
        "driver_id": str(driver.id),
        "route": {
            "from": {"country": "TR", "city": "Muğla", "district": "Fethiye", "city_code": "48", "district_code": "1331", "address": "Göcek"},
            "to": {"country": "TR", "city": "Muğla", "district": "Dalaman Havalimanı", "city_code": "48", "district_code": "99125", "address": "Dalaman Havalimanı"},
        },
        "groups": [{"name": "TRANSFER", "description": "Göcek transfer", "price": "900.00"}],
        "passengers": [
            {
                "first_name": "Gerrad",
                "last_name": "Ferguson",
                "identity_type": "passport",
                "identity_no": "NRF00000974",
                "nationality": "GB",
                "country_name": "İngiltere",
            }
        ],
    }

    response = auth_client(user, company).post("/api/v1/trips/quick-create/", payload, format="json")

    assert response.status_code == 200
    assert Vehicle.objects.filter(company=company).count() == 1
    assert Personnel.objects.filter(company=company, type="driver").count() == 1
    from trips.models import Trip

    trip = Trip.objects.get(id=response.data["trip_id"])
    assert trip.vehicle == vehicle
    assert trip.driver == driver


def test_duplicate_clears_firm_trip_no_so_uetds_uses_new_trip_uuid():
    user = make_user()
    company = make_company("Kopya Firma")
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="48 AAL 247", seat_capacity=16)
    driver = Personnel.objects.create(company=company, type="driver", identity_no="57400000208", first_name="Hüseyin", last_name="Akbay")
    trip = Trip.objects.create(
        company=company,
        created_by=user,
        firm_trip_no="LOCAL-001",
        vehicle=vehicle,
        driver=driver,
        departure_at=timezone.now(),
        departure_city="Muğla",
        departure_address="Fethiye",
        arrival_city="Muğla",
        arrival_address="Dalaman",
        passenger_count=1,
        status="ready",
    )

    response = auth_client(user, company).post(f"/api/v1/trips/{trip.id}/duplicate/", {}, format="json")

    assert response.status_code == 200
    assert response.data["id"] != str(trip.id)
    assert response.data["firm_trip_no"] == ""


def test_trip_detail_pdf_endpoint_returns_pdf_bytes():
    user = make_user()
    company = make_company("ÖMER ACAR TURİZM TAŞIMACILIK LİMİTED ŞİRKETİ")
    company.unet_no = "İZM.U-NET.D2.48.12698"
    company.save(update_fields=["unet_no"])
    make_membership(user, company)
    payload = {
        "firm_trip_no": "2606146418658898",
        "description": "GÖCEK / DLM HAVALİMANI SEFER LİSTESİDİR.",
        "departure_at": "2026-06-14T18:00:00+03:00",
        "arrival_estimated_at": "2026-06-14T20:30:00+03:00",
        "vehicle": {"plate": "48 AAL 247", "seat_capacity": 16},
        "driver": {"identity_no": "57400000208", "first_name": "Hüseyin", "last_name": "Akbay", "gender": "E", "src_codes": "ODY1, SRC2"},
        "route": {
            "from": {"country": "TR", "city": "Muğla", "district": "Fethiye", "city_code": "48", "district_code": "1331", "address": "Göcek"},
            "to": {"country": "TR", "city": "Muğla", "district": "Dalaman Havalimanı", "city_code": "48", "district_code": "99125", "address": "Dalaman Havalimanı"},
        },
        "group": {"name": "TRANSFER", "description": "Göcek / DLM Havalimanı", "price": "900.00"},
        "passengers": [
            {
                "first_name": "Gerrad",
                "last_name": "F",
                "identity_type": "passport",
                "identity_no": "NRF00000974",
                "nationality": "GB",
                "country_name": "İngiltere",
                "gender": "E",
                "seat_no": "1",
            }
        ],
    }
    client = auth_client(user, company)
    created = client.post("/api/v1/trips/quick-create/", payload, format="json")

    response = client.get(f"/api/v1/trips/{created.data['trip_id']}/detail-pdf/", HTTP_ACCEPT="application/pdf")

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert len(response.content) > 1000


def test_trip_detail_pdf_masks_passenger_last_name():
    passenger = type("PassengerLike", (), {"first_name": "GERRAD", "last_name": "FERGUSON"})()

    assert format_passenger_name(passenger) == "GERRAD F******"


def test_trip_can_be_edited_before_uetds_submission():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)

    response = auth_client(user, company).patch(
        f"/api/v1/trips/{trip.id}/",
        {
            "description": "Düzenlenen açıklama",
            "departure_city": "Muğla",
            "departure_district": "Fethiye",
            "departure_address": "Göcek Marina",
            "arrival_city": "Muğla",
            "arrival_district": "Dalaman",
            "arrival_address": "Dalaman Havalimanı",
        },
        format="json",
    )

    assert response.status_code == 200
    trip.refresh_from_db()
    assert trip.description == "Düzenlenen açıklama"
    assert trip.departure_address == "Göcek Marina"
    assert trip.arrival_address == "Dalaman Havalimanı"


def test_trip_can_be_edited_after_uetds_submission_and_marks_update_required():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    trip.status = "submitted"
    trip.uetds_reference_no = "123456"
    trip.save(update_fields=["status", "uetds_reference_no"])

    response = auth_client(user, company).patch(
        f"/api/v1/trips/{trip.id}/",
        {"departure_address": "Güncel biniş adresi"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["uetds_sync_status"] in {"unknown", "update_required", "local_draft"}
    assert response.data["uetds_has_unsent_changes"] is True
    trip.refresh_from_db()
    assert trip.departure_address == "Güncel biniş adresi"


def test_trip_edit_can_update_add_and_remove_passengers():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    group = TripGroup.objects.create(company=company, trip=trip, name="TRANSFER", description="Transfer", price=900, departure_place="A", arrival_place="B")
    link = trip.trip_passengers.select_related("passenger").get()

    response = auth_client(user, company).patch(
        f"/api/v1/trips/{trip.id}/",
        {
            "passengers": [
                {
                    "id": str(link.id),
                    "group_id": str(group.id),
                    "first_name": "Ayşe",
                    "last_name": "Yılmaz",
                    "identity_type": "tc",
                    "identity_no": "22222222220",
                    "nationality": "TR",
                    "country_name": "Türkiye",
                    "gender": "K",
                    "seat_no": "5",
                },
                {
                    "group_id": str(group.id),
                    "first_name": "Mary",
                    "last_name": "Stone",
                    "identity_type": "passport",
                    "identity_no": "AB1234567",
                    "nationality": "GB",
                    "country_name": "İngiltere",
                    "gender": "F",
                    "seat_no": "6",
                    "phone": "05435339454",
                },
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    trip.refresh_from_db()
    link.refresh_from_db()
    link.passenger.refresh_from_db()
    assert trip.passenger_count == 2
    assert link.seat_no == "5"
    assert link.group == group
    assert link.passenger.first_name == "Ayşe"
    assert link.passenger.gender == "K"
    assert TripPassenger.objects.filter(company=company, trip=trip, passenger__identity_no="AB1234567", seat_no="6").exists()

    mary_link = TripPassenger.objects.get(company=company, trip=trip, passenger__identity_no="AB1234567")
    remove_response = auth_client(user, company).patch(
        f"/api/v1/trips/{trip.id}/",
        {
            "passengers": [
                {
                    "id": str(mary_link.id),
                    "group_id": str(group.id),
                    "first_name": "Mary",
                    "last_name": "Stone",
                    "identity_type": "passport",
                    "identity_no": "AB1234567",
                    "nationality": "GB",
                    "country_name": "İngiltere",
                    "gender": "K",
                    "seat_no": "6",
                }
            ]
        },
        format="json",
    )

    assert remove_response.status_code == 200
    trip.refresh_from_db()
    assert trip.passenger_count == 1
    assert list(trip.trip_passengers.values_list("passenger__identity_no", flat=True)) == ["AB1234567"]


def test_local_trip_can_be_deleted_before_uetds_submission():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)

    response = auth_client(user, company).delete(f"/api/v1/trips/{trip.id}/")

    assert response.status_code == 204
    assert not Trip.objects.filter(id=trip.id).exists()


def test_uetds_trip_cannot_be_deleted_and_can_be_cancelled(monkeypatch):
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    trip.status = Trip.Status.SUBMITTED
    trip.uetds_reference_no = "123456"
    trip.uetds_environment = "test"
    trip.save(update_fields=["status", "uetds_reference_no", "uetds_environment"])
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()
    seen = {}

    def fake_cancel(self, reference_no, reason):
        seen["reference_no"] = reference_no
        seen["reason"] = reason
        return UETDSResponse("seferIptal", True, "0", "OK", {})

    monkeypatch.setattr("uetds.client.UetdsAriziClient.sefer_iptal", fake_cancel)
    monkeypatch.setattr(
        "uetds.client.UetdsAriziClient.bildirim_ozeti",
        lambda self, reference_no: UETDSResponse("bildirimOzeti", True, "0", "OK", {"seferDurumAciklama": "İPTAL"}),
    )
    client = auth_client(user, company)

    delete_response = client.delete(f"/api/v1/trips/{trip.id}/")
    cancel_response = client.post(f"/api/v1/trips/{trip.id}/cancel-uetds/", {"reason": "Müşteri iptali"}, format="json")
    detail_response = client.get(f"/api/v1/trips/{trip.id}/")

    trip.refresh_from_db()
    assert delete_response.status_code == 400
    assert delete_response.data["message"]["trip"] == "UETDS'ye gönderilmiş sefer silinemez. Seferi UETDS iptal akışıyla iptal edin."
    assert cancel_response.status_code == 200
    assert cancel_response.data["success"] is True
    assert cancel_response.data["summary_remote_status"] == "cancelled"
    assert seen == {"reference_no": "123456", "reason": "Müşteri iptali"}
    assert trip.status == Trip.Status.CANCELLED
    assert detail_response.data["uetds_sync_status"] == "cancelled"
    assert detail_response.data["uetds_has_unsent_changes"] is False
    assert detail_response.data["uetds_sync_message"] == "Sefer UETDS'de iptal edildi."
    assert Trip.objects.filter(id=trip.id).exists()


def test_cancel_trip_marks_cancelled_when_uetds_says_already_cancelled(monkeypatch):
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    trip.status = Trip.Status.SUBMITTED
    trip.uetds_reference_no = "123456"
    trip.uetds_environment = "test"
    trip.save(update_fields=["status", "uetds_reference_no", "uetds_environment"])
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()

    monkeypatch.setattr(
        "uetds.client.UetdsAriziClient.sefer_iptal",
        lambda self, reference_no, reason: UETDSResponse("seferIptal", False, "11", "İptal Edilen Sefer Üzerinde İşlem Yapılamaz!", {}),
    )
    monkeypatch.setattr(
        "uetds.client.UetdsAriziClient.bildirim_ozeti",
        lambda self, reference_no: UETDSResponse("bildirimOzeti", True, "0", "OK", {"seferDurumAciklama": "İPTAL"}),
    )

    response = auth_client(user, company).post(f"/api/v1/trips/{trip.id}/cancel-uetds/", {"reason": "Müşteri iptali"}, format="json")

    trip.refresh_from_db()
    assert response.status_code == 200
    assert response.data["success"] is True
    assert response.data["remote_cancelled"] is True
    assert response.data["summary_remote_status"] == "cancelled"
    assert trip.status == Trip.Status.CANCELLED


def test_cancel_trip_does_not_mark_cancelled_until_summary_confirms(monkeypatch):
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    trip.status = Trip.Status.SUBMITTED
    trip.uetds_reference_no = "123456"
    trip.uetds_environment = "test"
    trip.save(update_fields=["status", "uetds_reference_no", "uetds_environment"])
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()

    monkeypatch.setattr(
        "uetds.client.UetdsAriziClient.sefer_iptal",
        lambda self, reference_no, reason: UETDSResponse("seferIptal", True, "0", "İŞLEM BAŞARILI", {}),
    )
    monkeypatch.setattr(
        "uetds.client.UetdsAriziClient.bildirim_ozeti",
        lambda self, reference_no: UETDSResponse("bildirimOzeti", True, "0", "OK", {"seferDurumAciklama": "GEÇERLİ"}),
    )

    response = auth_client(user, company).post(f"/api/v1/trips/{trip.id}/cancel-uetds/", {"reason": "Müşteri iptali"}, format="json")

    trip.refresh_from_db()
    assert response.status_code == 200
    assert response.data["success"] is False
    assert response.data["summary_remote_status"] == "submitted"
    assert trip.status == Trip.Status.CANCEL_REQUESTED


def test_cancel_trip_checks_summary_when_cancel_fails_after_time_limit(monkeypatch):
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    trip.status = Trip.Status.SUBMITTED
    trip.uetds_reference_no = "123456"
    trip.uetds_environment = "test"
    trip.save(update_fields=["status", "uetds_reference_no", "uetds_environment"])
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()

    monkeypatch.setattr(
        "uetds.client.UetdsAriziClient.sefer_iptal",
        lambda self, reference_no, reason: UETDSResponse("seferIptal", False, "88", "Sefer başlangıç zamanından 5 gün sonra herhangi bir güncelleme yapılamaz.", {}),
    )
    monkeypatch.setattr(
        "uetds.client.UetdsAriziClient.bildirim_ozeti",
        lambda self, reference_no: UETDSResponse("bildirimOzeti", True, "0", "OK", {"seferDurumAciklama": "İPTAL"}),
    )

    response = auth_client(user, company).post(f"/api/v1/trips/{trip.id}/cancel-uetds/", {"reason": "Müşteri iptali"}, format="json")

    trip.refresh_from_db()
    assert response.status_code == 200
    assert response.data["success"] is True
    assert response.data["remote_cancelled"] is True
    assert response.data["summary_remote_status"] == "cancelled"
    assert trip.status == Trip.Status.CANCELLED


def test_sync_summary_marks_trip_submitted_when_uetds_has_active_summary(monkeypatch):
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    trip.status = Trip.Status.FAILED
    trip.uetds_reference_no = "123456"
    trip.uetds_environment = "test"
    trip.save(update_fields=["status", "uetds_reference_no", "uetds_environment"])
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()

    def fake_summary(self, reference_no):
        assert reference_no == "123456"
        return UETDSResponse("bildirimOzeti", True, "0", "OK", {"durum": "Aktif"})

    monkeypatch.setattr("uetds.client.UetdsAriziClient.bildirim_ozeti", fake_summary)

    response = auth_client(user, company).post(f"/api/v1/trips/{trip.id}/sync-summary/", {}, format="json")

    trip.refresh_from_db()
    assert response.status_code == 200
    assert response.data["success"] is True
    assert response.data["remote_status"] == "submitted"
    assert response.data["updated"] is True
    assert response.data["local_status_before"] == "failed"
    assert response.data["local_status_after"] == "submitted"
    assert response.data["uetds_sync_status"] == "unknown"
    assert trip.status == Trip.Status.SUBMITTED


def test_sync_summary_marks_trip_cancelled_when_uetds_summary_is_cancelled(monkeypatch):
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    trip.status = Trip.Status.SUBMITTED
    trip.uetds_reference_no = "123456"
    trip.uetds_environment = "test"
    trip.save(update_fields=["status", "uetds_reference_no", "uetds_environment"])
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()

    def fake_summary(self, reference_no):
        assert reference_no == "123456"
        return UETDSResponse("bildirimOzeti", True, "0", "OK", {"seferDurum": "İptal Edildi"})

    monkeypatch.setattr("uetds.client.UetdsAriziClient.bildirim_ozeti", fake_summary)

    response = auth_client(user, company).post(f"/api/v1/trips/{trip.id}/sync-summary/", {}, format="json")

    trip.refresh_from_db()
    assert response.status_code == 200
    assert response.data["success"] is True
    assert response.data["remote_status"] == "cancelled"
    assert response.data["updated"] is True
    assert response.data["local_status_after"] == "cancelled"
    assert response.data["uetds_sync_status"] == "cancelled"
    assert trip.status == Trip.Status.CANCELLED


def test_trip_response_includes_actionable_uetds_last_error():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    trip.status = Trip.Status.PARTIAL_FAILED
    trip.uetds_reference_no = "123456"
    trip.save(update_fields=["status", "uetds_reference_no"])
    UETDSOperationLog.objects.create(
        company=company,
        trip=trip,
        operation="yolcuEkleCoklu",
        environment="test",
        success=False,
        uetds_sonuc_kodu="34",
        uetds_sonuc_mesaji="Yolcu kimlik bilgisi hatalı.",
    )

    response = auth_client(user, company).get(f"/api/v1/trips/{trip.id}/")

    assert response.status_code == 200
    assert response.data["uetds_last_error"]["operation_label"] == "Yolcu gönderimi"
    assert response.data["uetds_last_error"]["message"] == "Yolcu kimlik bilgisi hatalı."
    assert response.data["uetds_last_error"]["sonuc_kodu"] == "34"
    assert "Yolcu kimlik/pasaport" in response.data["uetds_last_error"]["action"]
    assert response.data["uetds_sync_message"] == "Yolcu gönderimi tamamlanamadı: Yolcu kimlik bilgisi hatalı."


def test_cancelled_trip_response_hides_stale_uetds_error():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    trip.status = Trip.Status.CANCELLED
    trip.uetds_reference_no = "123456"
    trip.save(update_fields=["status", "uetds_reference_no"])
    UETDSOperationLog.objects.create(
        company=company,
        trip=trip,
        operation="seferIptal",
        environment="test",
        success=False,
        uetds_sonuc_kodu="88",
        uetds_sonuc_mesaji="Sefer başlangıç zamanından 5 gün sonra herhangi bir güncelleme yapılamaz.",
    )

    response = auth_client(user, company).get(f"/api/v1/trips/{trip.id}/")

    assert response.status_code == 200
    assert response.data["uetds_sync_status"] == "cancelled"
    assert response.data["uetds_last_error"] is None
    assert response.data["uetds_sync_message"] == "Sefer UETDS'de iptal edildi."


def test_submit_update_marks_trip_cancelled_when_uetds_says_remote_cancelled(monkeypatch):
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    trip.status = Trip.Status.SUBMITTED
    trip.uetds_reference_no = "123456"
    trip.uetds_environment = "test"
    trip.save(update_fields=["status", "uetds_reference_no", "uetds_environment"])
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()

    monkeypatch.setattr(
        "uetds.client.UetdsAriziClient.sefer_guncelle",
        lambda self, trip: UETDSResponse("seferGuncelle", False, "11", "İptal Edilen Sefer Üzerinde İşlem Yapılamaz!", {}),
    )

    response = auth_client(user, company).post(f"/api/v1/trips/{trip.id}/submit-uetds/", {"environment": "test", "idempotency_key": "remote-cancelled"}, format="json")

    trip.refresh_from_db()
    assert response.status_code == 409
    assert response.data["status"] == "cancelled"
    assert response.data["uetds_sync_status"] == "cancelled"
    assert response.data["operations"][0]["remote_cancelled"] is True
    assert trip.status == Trip.Status.CANCELLED


def test_live_submit_is_disabled_in_test_only_installation():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)

    response = auth_client(user, company).post(
        f"/api/v1/trips/{trip.id}/submit-uetds/",
        {"environment": "live", "idempotency_key": "abc"},
        format="json",
    )

    assert response.status_code == 400
    assert "environment" in response.data["message"]


def test_submit_uetds_rejects_invalid_driver_tc_before_uetds_call():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="Hüseyin", last_name="Akbay", identity_no="57400000214")
    trip = _trip(company, user, vehicle, driver)

    response = auth_client(user, company).post(
        f"/api/v1/trips/{trip.id}/submit-uetds/",
        {"environment": "test", "idempotency_key": "invalid-driver-tc"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"]["driver.identity_no"] == "Şoför T.C. Kimlik numarası geçersiz. Gerçek T.C. ile güncelleyin."
    assert UETDSOperationLog.objects.filter(company=company).count() == 0


def test_company_admin_can_submit_to_live_uetds():
    assert role_has_permission("company_admin", "trip:create") is True
    assert role_has_permission("company_admin", "live_uetds_submit") is True
    assert role_has_permission("super_admin", "live_uetds_submit") is True


def test_live_submit_requires_company_live_enabled(settings):
    settings.UETDS_ALLOWED_ENVIRONMENTS = ("test", "live")
    user = make_user()
    company = make_company()
    make_membership(user, company, role="super_admin")
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)

    response = auth_client(user, company).post(
        f"/api/v1/trips/{trip.id}/submit-uetds/",
        {"environment": "live", "confirm_live_submission": True, "idempotency_key": "live-disabled"},
        format="json",
    )

    assert response.status_code == 403
    assert response.data["message"]["detail"] == "Firma gerçek UETDS gönderimine kapalı."


def test_live_submit_requires_explicit_live_permission(settings):
    settings.UETDS_ALLOWED_ENVIRONMENTS = ("test", "live")
    user = make_user()
    company = make_company()
    company.settings.live_uetds_enabled = True
    company.settings.save(update_fields=["live_uetds_enabled", "updated_at"])
    make_membership(user, company, role="operation_manager")
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)

    response = auth_client(user, company).post(
        f"/api/v1/trips/{trip.id}/submit-uetds/",
        {"environment": "live", "confirm_live_submission": True, "idempotency_key": "live-no-role"},
        format="json",
    )

    assert response.status_code == 403
    assert response.data["message"]["detail"] == "Gerçek UETDS gönderimi için yetkiniz yok."


def test_live_submit_requires_explicit_confirmation(settings):
    settings.UETDS_ALLOWED_ENVIRONMENTS = ("test", "live")
    user = make_user()
    company = make_company()
    company.settings.live_uetds_enabled = True
    company.settings.save(update_fields=["live_uetds_enabled", "updated_at"])
    make_membership(user, company, role="super_admin")
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)

    response = auth_client(user, company).post(
        f"/api/v1/trips/{trip.id}/submit-uetds/",
        {"environment": "live", "idempotency_key": "live-no-confirm"},
        format="json",
    )

    assert response.status_code == 403
    assert response.data["message"]["detail"] == "Gerçek UETDS gönderimi için confirm_live_submission=true gerekli."


def test_live_submit_runs_only_after_company_permission_and_confirmation(monkeypatch, settings):
    settings.UETDS_ALLOWED_ENVIRONMENTS = ("test", "live")
    user = make_user()
    company = make_company()
    company.settings.live_uetds_enabled = True
    company.settings.save(update_fields=["live_uetds_enabled", "updated_at"])
    make_membership(user, company, role="super_admin")
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    credential = UETDSCredential(company=company, environment="live", endpoint_url=settings.UETDS_TEST_URL)
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()

    monkeypatch.setattr("uetds.client.UetdsAriziClient.sefer_ekle", lambda self, trip: UETDSResponse("seferEkle", True, "0", "OK", {"uetds_reference_no": "LIVE-123"}))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.sefer_grup_ekle", lambda self, trip, group: UETDSResponse("seferGrupEkle", True, "0", "OK", {"uetds_group_ref_no": "1"}))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.personel_ekle", lambda self, trip, personnel: UETDSResponse("personelEkle", True, "0", "OK", {}))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.yolcu_ekle_coklu", lambda self, trip, passengers: UETDSResponse("yolcuEkleCoklu", True, "0", "OK", {}))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.bildirim_ozeti", lambda self, ref: UETDSResponse("bildirimOzeti", True, "0", "OK", {}))

    response = auth_client(user, company).post(
        f"/api/v1/trips/{trip.id}/submit-uetds/",
        {"environment": "live", "confirm_live_submission": True, "idempotency_key": "live-ok"},
        format="json",
    )

    credential.refresh_from_db()
    trip.refresh_from_db()
    assert response.status_code == 200
    assert response.data["success"] is True
    assert response.data["environment"] == "live"
    assert trip.status == "submitted"
    assert trip.uetds_environment == "live"
    assert credential.endpoint_url == settings.UETDS_LIVE_URL


def test_uetds_status_only_exposes_test_environment():
    user = make_user()
    company = make_company()
    make_membership(user, company)

    response = auth_client(user, company).get("/api/v1/uetds/status/")

    assert response.status_code == 200
    assert list(response.data.keys()) == ["test"]


def test_missing_uetds_credential_is_logged_and_exposed_in_status():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    client = auth_client(user, company)

    initial_status = client.get("/api/v1/uetds/status/")
    failed = client.post("/api/v1/uetds/verify/", {"environment": "test"}, format="json")
    status_response = client.get("/api/v1/uetds/status/")

    assert initial_status.status_code == 200
    assert initial_status.data["test"]["status"] == "missing"
    assert failed.status_code == 400
    assert failed.data["message"]["credential"] == "test UETDS bilgisi tanımlı değil."
    log = UETDSOperationLog.objects.get(company=company, operation="credentialCheck")
    assert log.success is False
    assert log.uetds_sonuc_kodu == "UETDS_CREDENTIAL_MISSING"
    assert UETDSOperationLog.objects.filter(company=company, operation="credentialCheck").count() == 1
    assert status_response.status_code == 200
    assert status_response.data["test"]["status"] == "missing"
    assert status_response.data["test"]["severity"] == "error"
    assert status_response.data["test"]["message"] == "UETDS test bilgisi tanımlı değil."
    assert status_response.data["test"]["last_log_id"] == log.id


def test_uetds_credentials_force_test_endpoint():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    payload = {
        "environment": "test",
        "username": "uetds-user",
        "password": "uetds-pass",
        "endpoint_url": "https://servis.turkiye.gov.tr/services/g2g/kdgm/uetdsarizi",
    }

    response = auth_client(user, company).post("/api/v1/uetds/credentials/", payload, format="json")

    assert response.status_code == 201
    credential = UETDSCredential.objects.get(company=company, environment="test")
    assert credential.endpoint_url == settings.UETDS_TEST_URL
    assert credential.last_result == "pending"


def test_uetds_credentials_force_live_endpoint_when_live_enabled(settings):
    settings.UETDS_ALLOWED_ENVIRONMENTS = ("test", "live")
    user = make_user()
    company = make_company()
    make_membership(user, company)
    payload = {
        "environment": "live",
        "username": "live-user",
        "password": "live-pass",
        "endpoint_url": settings.UETDS_TEST_URL,
    }

    response = auth_client(user, company).post("/api/v1/uetds/credentials/", payload, format="json")

    assert response.status_code == 201
    credential = UETDSCredential.objects.get(company=company, environment="live")
    assert credential.endpoint_url == settings.UETDS_LIVE_URL
    assert credential.last_result == "pending"


def test_uetds_trip_payload_uses_driver_phone_for_vehicle_phone_field():
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10, phone="05551111111")
    driver = Personnel.objects.create(
        company=company,
        type="driver",
        first_name="A",
        last_name="B",
        identity_no="11111111110",
        phone="05435339454",
    )
    trip = _trip(company, user, vehicle, driver)
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()

    payload = UetdsAriziClient(credential)._sefer_payload(trip)

    assert payload["aracTelefonu"] == "05435339454"


def test_seed_uetds_test_creates_test_ready_data():
    call_command("seed_uetds_test", "--email", "ops@example.com", "--password", "secret")

    user = get_user_model().objects.get(email="ops@example.com")
    company = Company.objects.get(name="Demo Turizm")
    credential = UETDSCredential.objects.get(company=company, environment="test")
    vehicle = Vehicle.objects.get(company=company, plate="48AAL247")
    driver = Personnel.objects.get(company=company, identity_no="57400000208")
    trip = Trip.objects.get(company=company, firm_trip_no="UETDS-TEST-001")
    group = trip.groups.get()

    assert user.active_company_id == company.id
    assert company.unet_no == "999999"
    assert company.settings.live_uetds_enabled is False
    assert credential.get_username() == "999999"
    assert credential.get_password() == "999999testtest"
    assert credential.endpoint_url == settings.UETDS_TEST_URL
    assert vehicle.status == Vehicle.Status.ACTIVE
    assert driver.type == Personnel.Type.DRIVER
    assert driver.uetds_role_code == 0
    assert trip.status == Trip.Status.READY
    assert trip.passenger_count == 2
    assert group.departure_city_code == "48"
    assert group.departure_district_code == "1331"
    assert group.arrival_district_code == "99125"
    assert TripPassenger.objects.filter(company=company, trip=trip).count() == 2
    assert TripPersonnel.objects.filter(company=company, trip=trip, role="driver").count() == 1


def test_seed_uetds_test_is_idempotent():
    call_command("seed_uetds_test")
    call_command("seed_uetds_test")

    company = Company.objects.get(name="Demo Turizm")
    assert Vehicle.objects.filter(company=company, plate="48AAL247").count() == 1
    assert Personnel.objects.filter(company=company, identity_no="57400000208").count() == 1
    assert Passenger.objects.filter(company=company).count() == 2
    assert Trip.objects.filter(company=company, firm_trip_no="UETDS-TEST-001").count() == 1
    assert TripPassenger.objects.filter(company=company).count() == 2
    assert TripPersonnel.objects.filter(company=company).count() == 1


def test_submit_is_idempotent(monkeypatch):
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()

    calls = {"sefer": 0}

    def fake_sefer(self, trip):
        calls["sefer"] += 1
        return UETDSResponse("seferEkle", True, "0", "OK", {"uetds_reference_no": "123"})

    monkeypatch.setattr("uetds.client.UetdsAriziClient.sefer_ekle", fake_sefer)
    monkeypatch.setattr("uetds.client.UetdsAriziClient.sefer_grup_ekle", lambda self, trip, group: UETDSResponse("seferGrupEkle", True, "0", "OK", {"uetds_group_ref_no": "1"}))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.personel_ekle", lambda self, trip, personnel: UETDSResponse("personelEkle", True, "0", "OK", {}))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.yolcu_ekle_coklu", lambda self, trip, passengers: UETDSResponse("yolcuEkleCoklu", True, "0", "OK", {}))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.bildirim_ozeti", lambda self, ref: UETDSResponse("bildirimOzeti", True, "0", "OK", {}))

    client = auth_client(user, company)
    payload = {"environment": "test", "idempotency_key": "same-key"}
    first = client.post(f"/api/v1/trips/{trip.id}/submit-uetds/", payload, format="json")
    second = client.post(f"/api/v1/trips/{trip.id}/submit-uetds/", payload, format="json")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.data["environment"] == "test"
    assert calls["sefer"] == 1
    assert first.data == second.data


def test_submitted_trip_update_uses_uetds_update_methods(monkeypatch):
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="34AAA001", seat_capacity=10)
    driver = Personnel.objects.create(
        company=company,
        type="driver",
        first_name="Ahmet",
        last_name="Yılmaz",
        identity_no="11111111110",
        nationality="TR",
        gender="E",
        uetds_role_code=0,
    )
    trip = _trip(company, user, vehicle, driver)
    trip.arrival_estimated_at = trip.departure_at + timedelta(hours=2)
    trip.save(update_fields=["arrival_estimated_at", "updated_at"])
    group = TripGroup.objects.create(
        company=company,
        trip=trip,
        name="TRANSFER",
        description="İlk rota",
        price="900.00",
        departure_country="TR",
        departure_city="Muğla",
        departure_district="Fethiye",
        departure_city_code="48",
        departure_district_code="1331",
        departure_place="Göcek",
        arrival_country="TR",
        arrival_city="Muğla",
        arrival_district="Dalaman Havalimanı",
        arrival_city_code="48",
        arrival_district_code="99125",
        arrival_place="Dalaman Havalimanı",
    )
    TripPassenger.objects.filter(company=company, trip=trip).update(group=group)
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()
    calls = []

    def record(operation, data=None):
        calls.append(operation)
        return UETDSResponse(operation, True, "0", "OK", data or {})

    monkeypatch.setattr("uetds.client.UetdsAriziClient.sefer_ekle", lambda self, trip: record("seferEkle", {"uetds_reference_no": "123"}))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.sefer_guncelle", lambda self, trip: record("seferGuncelle"))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.sefer_grup_ekle", lambda self, trip, group: record("seferGrupEkle", {"uetds_group_ref_no": "1"}))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.sefer_grup_guncelle", lambda self, trip, group: record("seferGrupGuncelle"))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.personel_ekle", lambda self, trip, personnel: record("personelEkle"))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.yolcu_ekle_coklu", lambda self, trip, passengers: record("yolcuEkleCoklu"))
    monkeypatch.setattr("uetds.client.UetdsAriziClient.bildirim_ozeti", lambda self, ref: record("bildirimOzeti"))

    client = auth_client(user, company)
    first = client.post(f"/api/v1/trips/{trip.id}/submit-uetds/", {"environment": "test", "idempotency_key": "first-submit"}, format="json")

    trip.refresh_from_db()
    assert first.status_code == 200
    assert first.data["uetds_sync_status"] == "synced"
    assert trip.status == "submitted"
    assert trip.uetds_last_submitted_hash
    assert calls == ["seferEkle", "seferGrupEkle", "personelEkle", "yolcuEkleCoklu", "bildirimOzeti"]

    group.refresh_from_db()
    update = client.patch(
        f"/api/v1/trips/{trip.id}/",
        {
            "departure_address": "Güncel biniş",
            "route_note": "Güncel rota",
            "groups": [
                {
                    "id": str(group.id),
                    "name": "TRANSFER",
                    "description": "Güncel rota",
                    "price": "950.00",
                    "currency": "TRY",
                    "departure_country": "TR",
                    "departure_city": "Muğla",
                    "departure_district": "Fethiye",
                    "departure_city_code": "48",
                    "departure_district_code": "1331",
                    "departure_place": "Göcek Marina",
                    "arrival_country": "TR",
                    "arrival_city": "Muğla",
                    "arrival_district": "Dalaman Havalimanı",
                    "arrival_city_code": "48",
                    "arrival_district_code": "99125",
                    "arrival_place": "Dalaman Havalimanı",
                }
            ],
        },
        format="json",
    )

    assert update.status_code == 200
    assert update.data["uetds_sync_status"] == "update_required"
    assert update.data["uetds_has_unsent_changes"] is True

    calls.clear()
    second = client.post(f"/api/v1/trips/{trip.id}/submit-uetds/", {"environment": "test", "idempotency_key": "update-submit"}, format="json")

    trip.refresh_from_db()
    assert second.status_code == 200
    assert second.data["uetds_sync_status"] == "synced"
    assert trip.status == "submitted"
    assert calls == ["seferGuncelle", "seferGrupGuncelle", "bildirimOzeti"]


def test_submit_uetds_business_failure_returns_conflict(monkeypatch):
    user = make_user()
    company = make_company()
    make_membership(user, company)
    vehicle = Vehicle.objects.create(company=company, plate="48AAL247", seat_capacity=10)
    driver = Personnel.objects.create(company=company, type="driver", first_name="A", last_name="B", identity_no="11111111110")
    trip = _trip(company, user, vehicle, driver)
    credential = UETDSCredential(company=company, environment="test", endpoint_url="https://example.test")
    credential.set_username("user")
    credential.set_password("pass")
    credential.save()

    monkeypatch.setattr(
        "uetds.client.UetdsAriziClient.sefer_ekle",
        lambda self, trip: UETDSResponse(
            "seferEkle",
            False,
            "34",
            "Girilen plaka Bakanlık kayıtlarında herhangi bir yetki belgesine kayıtlı değil!",
            {},
        ),
    )

    response = auth_client(user, company).post(
        f"/api/v1/trips/{trip.id}/submit-uetds/",
        {"environment": "test", "idempotency_key": "failed-key"},
        format="json",
    )

    trip.refresh_from_db()
    assert response.status_code == 409
    assert response.data["success"] is False
    assert response.data["status"] == "failed"
    assert response.data["environment"] == "test"
    assert response.data["message"] == "Girilen plaka Bakanlık kayıtlarında herhangi bir yetki belgesine kayıtlı değil!"
    assert response.data["operations"][0]["sonuc_kodu"] == "34"
    assert trip.status == "failed"


def _trip(company, user, vehicle, driver):
    from trips.models import Trip, TripPassenger, TripPersonnel

    trip = Trip.objects.create(
        company=company,
        created_by=user,
        vehicle=vehicle,
        driver=driver,
        departure_at=timezone.now(),
        departure_city="Istanbul",
        departure_address="A",
        arrival_city="Ankara",
        arrival_address="B",
        passenger_count=1,
        status="ready",
    )
    passenger = Passenger.objects.create(company=company, first_name="Ayse", last_name="Demir", identity_type="tc", identity_no="22222222220")
    TripPassenger.objects.create(company=company, trip=trip, passenger=passenger)
    TripPersonnel.objects.create(company=company, trip=trip, personnel=driver, role="driver")
    return trip
