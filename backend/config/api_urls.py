from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts.views import LoginView, LogoutView, MeView, RefreshView
from agencies.views import AgencyContactViewSet, AgencyViewSet
from billing.views import InvoiceDraftViewSet, PriceRuleViewSet, TripPriceViewSet
from companies.views import CompanyViewSet
from fleet.views import VehicleViewSet
from imports.views import ImportBatchViewSet
from notifications.views import NotificationEventViewSet
from passengers.views import PassengerViewSet
from people.views import PersonnelViewSet
from trips.views import LocationReferenceView, SavedLocationViewSet, SavedRouteViewSet, TripViewSet
from uetds.views import UETDSLogViewSet, UETDSViewSet

router = DefaultRouter()
router.register("companies", CompanyViewSet, basename="company")
router.register("vehicles", VehicleViewSet, basename="vehicle")
router.register("personnel", PersonnelViewSet, basename="personnel")
router.register("passengers", PassengerViewSet, basename="passenger")
router.register("locations", SavedLocationViewSet, basename="location")
router.register("routes", SavedRouteViewSet, basename="route")
router.register("trips", TripViewSet, basename="trip")
router.register("uetds/logs", UETDSLogViewSet, basename="uetds-log")
router.register("uetds", UETDSViewSet, basename="uetds")
router.register("agencies", AgencyViewSet, basename="agency")
router.register("agency-contacts", AgencyContactViewSet, basename="agency-contact")
router.register("imports", ImportBatchViewSet, basename="import")
router.register("notifications/events", NotificationEventViewSet, basename="notification-event")
router.register("billing/price-rules", PriceRuleViewSet, basename="price-rule")
router.register("billing/trip-prices", TripPriceViewSet, basename="trip-price")
router.register("billing/invoice-drafts", InvoiceDraftViewSet, basename="invoice-draft")

urlpatterns = [
    path("", include(router.urls)),
    path("location-references/", LocationReferenceView.as_view(), name="location-references"),
    path("auth/login", LoginView.as_view(), name="auth-login"),
    path("auth/refresh", RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout", LogoutView.as_view(), name="auth-logout"),
    path("me", MeView.as_view(), name="me"),
]
