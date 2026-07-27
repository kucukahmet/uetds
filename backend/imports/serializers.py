from rest_framework import serializers

from imports.models import ImportBatch, ImportRowError


class ImportRowErrorSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportRowError
        fields = ["id", "row_number", "message", "raw_data"]


class ImportBatchSerializer(serializers.ModelSerializer):
    row_errors = ImportRowErrorSerializer(many=True, read_only=True)

    class Meta:
        model = ImportBatch
        fields = [
            "id",
            "import_type",
            "original_filename",
            "status",
            "total_rows",
            "success_rows",
            "error_rows",
            "row_errors",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "total_rows", "success_rows", "error_rows", "row_errors", "created_at", "updated_at"]
