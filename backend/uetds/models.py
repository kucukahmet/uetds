import base64
import hashlib

from cryptography.fernet import Fernet
from django.conf import settings
from django.db import models

from common.models import CompanyScopedModel


def get_fernet():
    key = settings.FIELD_ENCRYPTION_KEY
    if not key:
        digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
        key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


class UETDSCredential(CompanyScopedModel):
    class Environment(models.TextChoices):
        TEST = "test", "Test"
        LIVE = "live", "Live"

    environment = models.CharField(max_length=16, choices=Environment.choices)
    username_encrypted = models.TextField()
    password_encrypted = models.TextField()
    endpoint_url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    last_verified_at = models.DateTimeField(null=True, blank=True)
    last_result = models.CharField(max_length=32, blank=True)

    class Meta:
        unique_together = ("company", "environment")

    def set_username(self, value):
        self.username_encrypted = get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")

    def get_username(self):
        return get_fernet().decrypt(self.username_encrypted.encode("utf-8")).decode("utf-8")

    def set_password(self, value):
        self.password_encrypted = get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")

    def get_password(self):
        return get_fernet().decrypt(self.password_encrypted.encode("utf-8")).decode("utf-8")


class UETDSOperationLog(CompanyScopedModel):
    class Operation(models.TextChoices):
        KULLANICI_KONTROL = "kullaniciKontrol", "Kullanici Kontrol"
        IP_LISTELE = "ipListele", "IP Listele"
        YETKI_BELGESI_KONTROL = "yetkiBelgesiKontrol", "Yetki Belgesi Kontrol"
        ARAC_MUAYENE_SORGULA = "aracMuayeneSorgula", "Arac Muayene Sorgula"
        CREDENTIAL_CHECK = "credentialCheck", "Credential Check"
        SEFER_EKLE = "seferEkle", "Sefer Ekle"
        SEFER_GUNCELLE = "seferGuncelle", "Sefer Guncelle"
        SEFER_PLAKA_DEGISTIR = "seferPlakaDegistir", "Sefer Plaka Degistir"
        SEFER_GRUP_EKLE = "seferGrupEkle", "Sefer Grup Ekle"
        SEFER_GRUP_GUNCELLE = "seferGrupGuncelle", "Sefer Grup Guncelle"
        PERSONEL_EKLE = "personelEkle", "Personel Ekle"
        PERSONEL_IPTAL = "personelIptal", "Personel Iptal"
        YOLCU_EKLE_COKLU = "yolcuEkleCoklu", "Yolcu Ekle Coklu"
        YOLCU_IPTAL = "yolcuIptal", "Yolcu Iptal"
        BILDIRIM_OZETI = "bildirimOzeti", "Bildirim Ozeti"
        SEFER_IPTAL = "seferIptal", "Sefer Iptal"

    trip = models.ForeignKey("trips.Trip", on_delete=models.SET_NULL, null=True, blank=True, related_name="uetds_logs")
    operation = models.CharField(max_length=64, choices=Operation.choices)
    environment = models.CharField(max_length=16, default="test")
    http_status = models.PositiveIntegerField(null=True, blank=True)
    success = models.BooleanField(default=False)
    uetds_sonuc_kodu = models.CharField(max_length=32, blank=True)
    uetds_sonuc_mesaji = models.TextField(blank=True)
    request_xml = models.TextField(blank=True)
    response_xml = models.TextField(blank=True)
    correlation_id = models.CharField(max_length=128, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "operation", "success"]),
            models.Index(fields=["company", "trip"]),
        ]


class UETDSOperationStep(CompanyScopedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        RETRYING = "retrying", "Retrying"
        SKIPPED = "skipped", "Skipped"

    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="uetds_steps")
    operation = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_log = models.ForeignKey(UETDSOperationLog, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        unique_together = ("trip", "operation")


class IdempotencyRecord(CompanyScopedModel):
    key = models.CharField(max_length=128)
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="idempotency_records")
    endpoint = models.CharField(max_length=128)
    response_data = models.JSONField(default=dict, blank=True)
    status_code = models.PositiveSmallIntegerField(default=200)
    completed = models.BooleanField(default=False)

    class Meta:
        unique_together = ("company", "key", "endpoint")

# Create your models here.
