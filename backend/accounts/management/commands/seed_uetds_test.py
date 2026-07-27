from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from companies.models import Company, CompanyMembership, CompanySettings
from fleet.models import Vehicle
from passengers.models import Passenger
from people.models import Personnel
from trips.models import SavedLocation, SavedRoute, Trip, TripGroup, TripPassenger, TripPersonnel
from uetds.models import UETDSCredential


TEST_USERNAME = "999999"
TEST_PASSWORD = "999999testtest"


class Command(BaseCommand):
    help = "Seed UETDS test credentials and a test-ready demo trip."

    def add_arguments(self, parser):
        parser.add_argument("--email", default="ops@example.com")
        parser.add_argument("--password", default="secret")
        parser.add_argument("--company", default="Demo Turizm")
        parser.add_argument("--keep-password", action="store_true")

    def handle(self, *args, **options):
        User = get_user_model()
        email = options["email"]
        password = options["password"]
        company_name = options["company"]

        user, created_user = User.objects.get_or_create(
            email=email,
            defaults={"username": email, "name": "Demo Operasyon"},
        )
        if created_user or not options["keep_password"]:
            user.set_password(password)
            user.save(update_fields=["password"])

        company, _ = Company.objects.update_or_create(
            name=company_name,
            defaults={
                "tax_no": "0000000000",
                "unet_no": TEST_USERNAME,
                "status": Company.Status.ACTIVE,
            },
        )
        company_settings, _ = CompanySettings.objects.get_or_create(company=company)
        company_settings.live_uetds_enabled = False
        company_settings.default_uetds_environment = "test"
        company_settings.session_days = 7
        company_settings.save(update_fields=["live_uetds_enabled", "default_uetds_environment", "session_days", "updated_at"])

        CompanyMembership.objects.update_or_create(
            user=user,
            company=company,
            defaults={"role": CompanyMembership.Role.COMPANY_ADMIN, "is_active": True},
        )
        if user.active_company_id != company.id:
            user.active_company_id = company.id
            user.save(update_fields=["active_company_id"])

        credential, _ = UETDSCredential.objects.update_or_create(
            company=company,
            environment=UETDSCredential.Environment.TEST,
            defaults={
                "endpoint_url": settings.UETDS_TEST_URL,
                "is_active": True,
                "last_result": "pending",
                "last_verified_at": None,
            },
        )
        credential.set_username(TEST_USERNAME)
        credential.set_password(TEST_PASSWORD)
        credential.endpoint_url = settings.UETDS_TEST_URL
        credential.is_active = True
        credential.last_result = "pending"
        credential.last_verified_at = None
        credential.save(
            update_fields=[
                "username_encrypted",
                "password_encrypted",
                "endpoint_url",
                "is_active",
                "last_result",
                "last_verified_at",
                "updated_at",
            ]
        )

        vehicle = self._seed_vehicle(company)
        driver = self._seed_driver(company)
        passengers = self._seed_passengers(company)
        self._seed_locations(company)
        route = self._seed_route(company)
        trip = self._seed_trip(company, user, vehicle, driver, route, passengers)

        self.stdout.write(self.style.SUCCESS("UETDS test seed hazır."))
        self.stdout.write(f"Firma: {company.name} ({company.id})")
        self.stdout.write(f"UETDS test kullanıcısı: {TEST_USERNAME}")
        self.stdout.write(f"UETDS test endpoint: {settings.UETDS_TEST_URL}")
        self.stdout.write(f"Araç: {vehicle.plate}")
        self.stdout.write(f"Şoför: {driver.first_name} {driver.last_name} / turKodu={driver.uetds_role_code}")
        self.stdout.write(f"Sefer: {trip.firm_trip_no} / status={trip.status} / yolcu={trip.passenger_count}")

    def _seed_vehicle(self, company):
        vehicle, _ = Vehicle.objects.update_or_create(
            company=company,
            plate="48AAL247",
            defaults={
                "brand": "Mercedes-Benz",
                "model": "Sprinter",
                "seat_capacity": 16,
                "phone": "05551111111",
                "status": Vehicle.Status.ACTIVE,
                "uetds_status": Vehicle.UETDSStatus.UNKNOWN,
            },
        )
        return vehicle

    def _seed_driver(self, company):
        driver, _ = Personnel.objects.update_or_create(
            company=company,
            identity_no="57400000208",
            defaults={
                "type": Personnel.Type.DRIVER,
                "first_name": "Hüseyin",
                "last_name": "Akbay",
                "nationality": "TR",
                "gender": "E",
                "phone": "05435339454",
                "address": "Muğla",
                "uetds_role_code": 0,
                "src_codes": "SRC2",
                "status": Personnel.Status.ACTIVE,
            },
        )
        return driver

    def _seed_passengers(self, company):
        fixtures = [
            {
                "identity_no": "NRF00000974",
                "first_name": "Gerrad",
                "last_name": "Ferguson",
                "identity_type": Passenger.IdentityType.PASSPORT,
                "nationality": "GB",
                "country_name": "İngiltere",
                "gender": "E",
                "phone": "",
            },
            {
                "identity_no": "NP3B38C52",
                "first_name": "David",
                "last_name": "Letscher",
                "identity_type": Passenger.IdentityType.PASSPORT,
                "nationality": "GB",
                "country_name": "İngiltere",
                "gender": "E",
                "phone": "",
            },
        ]
        passengers = []
        for fixture in fixtures:
            passenger, _ = Passenger.objects.update_or_create(
                company=company,
                identity_no=fixture["identity_no"],
                defaults=fixture,
            )
            passengers.append(passenger)
        return passengers

    def _seed_locations(self, company):
        locations = [
            {
                "name": "Göcek",
                "country": "TR",
                "city": "Muğla",
                "district": "Fethiye",
                "city_code": "48",
                "district_code": "1331",
                "place": "Fethiye",
                "address": "Göcek",
                "usage_count": 20,
            },
            {
                "name": "Dalaman Havalimanı",
                "country": "TR",
                "city": "Muğla",
                "district": "Dalaman Havalimanı",
                "city_code": "48",
                "district_code": "99125",
                "place": "Dalaman Havalimanı",
                "address": "Dalaman Havalimanı",
                "usage_count": 20,
            },
        ]
        for location in locations:
            SavedLocation.objects.update_or_create(
                company=company,
                name=location["name"],
                defaults=location,
            )

    def _seed_route(self, company):
        route, _ = SavedRoute.objects.update_or_create(
            company=company,
            name="Göcek -> Dalaman Havalimanı",
            defaults={
                "departure_country": "TR",
                "departure_city": "Muğla",
                "departure_district": "Fethiye",
                "departure_city_code": "48",
                "departure_district_code": "1331",
                "departure_place": "Fethiye",
                "departure_address": "Göcek",
                "arrival_country": "TR",
                "arrival_city": "Muğla",
                "arrival_district": "Dalaman Havalimanı",
                "arrival_city_code": "48",
                "arrival_district_code": "99125",
                "arrival_place": "Dalaman Havalimanı",
                "arrival_address": "Dalaman Havalimanı",
                "default_group_name": "TRANSFER",
                "default_group_description": "Göcek / DLM Havalimanı",
                "default_price": Decimal("900.00"),
                "currency": "TRY",
                "usage_count": 30,
            },
        )
        return route

    def _seed_trip(self, company, user, vehicle, driver, route, passengers):
        departure_at = (timezone.now() + timedelta(days=1)).replace(hour=10, minute=30, second=0, microsecond=0)
        arrival_at = departure_at + timedelta(hours=1, minutes=30)
        trip = Trip.objects.filter(company=company, firm_trip_no="UETDS-TEST-001").first()
        if not trip:
            trip = Trip(company=company, created_by=user, vehicle=vehicle, driver=driver)
        trip.firm_trip_no = "UETDS-TEST-001"
        trip.description = "UETDS test ortamı için demo sefer."
        trip.vehicle = vehicle
        trip.driver = driver
        trip.departure_at = departure_at
        trip.arrival_estimated_at = arrival_at
        trip.departure_city = route.departure_city
        trip.departure_district = route.departure_district
        trip.departure_address = route.departure_address
        trip.arrival_city = route.arrival_city
        trip.arrival_district = route.arrival_district
        trip.arrival_address = route.arrival_address
        trip.route_note = "Göcek - Dalaman Havalimanı test transferi."
        trip.uetds_environment = "test"
        if trip.status in {Trip.Status.SUBMITTED, Trip.Status.PARTIAL_FAILED, Trip.Status.CANCEL_REQUESTED, Trip.Status.CANCELLED}:
            trip.uetds_reference_no = ""
        trip.status = Trip.Status.READY
        trip.passenger_count = len(passengers)
        trip.created_by = user
        trip.save()

        group = trip.groups.first()
        if not group:
            group = TripGroup(company=company, trip=trip)
        group.name = route.default_group_name
        group.description = route.default_group_description
        group.price = route.default_price
        group.currency = route.currency
        group.departure_country = route.departure_country
        group.departure_city = route.departure_city
        group.departure_district = route.departure_district
        group.departure_city_code = route.departure_city_code
        group.departure_district_code = route.departure_district_code
        group.departure_place = route.departure_place
        group.arrival_country = route.arrival_country
        group.arrival_city = route.arrival_city
        group.arrival_district = route.arrival_district
        group.arrival_city_code = route.arrival_city_code
        group.arrival_district_code = route.arrival_district_code
        group.arrival_place = route.arrival_place
        group.uetds_group_ref_no = None
        group.save()

        TripPersonnel.objects.update_or_create(
            company=company,
            trip=trip,
            personnel=driver,
            role="driver",
            defaults={},
        )
        for index, passenger in enumerate(passengers, start=1):
            TripPassenger.objects.update_or_create(
                company=company,
                trip=trip,
                passenger=passenger,
                defaults={"group": group, "seat_no": str(index), "status": TripPassenger.Status.ACTIVE},
            )
        trip.passenger_count = trip.trip_passengers.count()
        trip.save(update_fields=["passenger_count", "updated_at"])
        return trip
