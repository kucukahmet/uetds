from common.views import TenantModelViewSet
from imports.models import ImportBatch
from imports.passenger_photo_ocr import extract_passengers_from_image, extract_passengers_from_text, get_passenger_photo_ocr_status
from imports.serializers import ImportBatchSerializer
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response


class ImportBatchViewSet(TenantModelViewSet):
    queryset = ImportBatch.objects.prefetch_related("row_errors")
    serializer_class = ImportBatchSerializer
    filterset_fields = ["import_type", "status"]
    search_fields = ["original_filename"]
    required_permission = "trip:create"

    def perform_create(self, serializer):
        company = self.get_company()
        self.check_company_permission(company, "trip:create")
        serializer.save(company=company, created_by=self.request.user)

    @action(detail=False, methods=["post"], url_path="passenger-photo-ocr", parser_classes=[MultiPartParser, FormParser])
    def passenger_photo_ocr(self, request):
        company = self.get_company()
        self.check_company_permission(company, "trip:create")
        image = request.FILES.get("image")
        if not image:
            raise ValidationError({"image": "Fotoğraf zorunlu."})
        result = extract_passengers_from_image(image, company=company)
        return Response(result)

    @action(detail=False, methods=["post"], url_path="passenger-text-parse")
    def passenger_text_parse(self, request):
        company = self.get_company()
        self.check_company_permission(company, "trip:create")
        result = extract_passengers_from_text(request.data.get("text", ""), company=company)
        return Response(result)

    @action(detail=False, methods=["get"], url_path="passenger-photo-ocr/status")
    def passenger_photo_ocr_status(self, request):
        company = self.get_company()
        self.check_company_permission(company, "trip:create")
        return Response(get_passenger_photo_ocr_status(company))
