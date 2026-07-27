from rest_framework import serializers

from billing.models import InvoiceDraft, PriceRule, TripPrice


class PriceRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceRule
        fields = ["id", "name", "base_price", "currency", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class TripPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripPrice
        fields = ["id", "trip", "amount", "currency", "note", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class InvoiceDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceDraft
        fields = ["id", "agency", "trips", "status", "total_amount", "currency", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
