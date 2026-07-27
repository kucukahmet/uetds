from dataclasses import dataclass
from datetime import timedelta
from xml.etree import ElementTree

from django.utils import timezone
import requests


SOAP_ACTIONS = {
    "kullaniciKontrol": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/kullaniciKontrol",
    "ipListele": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/ipListele",
    "yetkiBelgesiKontrol": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/yetkiBelgesiKontrol",
    "aracMuayeneSorgula": "http://uetds.unetws.udhb.gov.tr/uetdsyts/aracMuayeneSorgula",
    "meslekiYeterlilikSorgula": "http://uetds.unetws.udhb.gov.tr/uetdsyts/meslekiYeterlilikSorgula",
    "seferEkle": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/seferEkle",
    "seferGuncelle": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/seferGuncelle",
    "seferPlakaDegistir": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/seferPlakaDegistir",
    "seferGrupEkle": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/seferGrupEkle",
    "seferGrupGuncelle": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/seferGrupGuncelle",
    "personelEkle": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/personelEkle",
    "personelIptal": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/personelIptal",
    "yolcuEkleCoklu": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/yolcuEkleCoklu",
    "yolcuIptal": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/yolcuIptal",
    "bildirimOzeti": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/bildirimOzeti",
    "seferIptal": "http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/seferIptal",
}


@dataclass
class UETDSResponse:
    operation: str
    success: bool
    sonuc_kodu: str = ""
    sonuc_mesaji: str = ""
    data: dict | None = None
    request_xml: str = ""
    response_xml: str = ""
    http_status: int | None = None


class UetdsAriziClient:
    def __init__(self, credential, timeout=20):
        self.credential = credential
        self.timeout = timeout
        self.endpoint_url = credential.endpoint_url
        self.username = credential.get_username()
        self.password = credential.get_password()

    def kullanici_kontrol(self):
        return self._call(
            "kullaniciKontrol",
            {"kullaniciAdi": self.username, "sifre": self.password},
            include_wsuser=False,
        )

    def ip_listele(self):
        return self._call("ipListele", {})

    def yetki_belgesi_kontrol(self, plate):
        return self._call("yetkiBelgesiKontrol", {"plaka": plate})

    def arac_muayene_sorgula(self, plate):
        return self._call("aracMuayeneSorgula", {"plaka": plate})

    def mesleki_yeterlilik_sorgula(self, identity_no):
        return self._call("meslekiYeterlilikSorgula", {"kimlikNo": identity_no})

    def sefer_ekle(self, trip):
        return self._call("seferEkle", {"ariziSeferBilgileriInput": self._sefer_payload(trip)})

    def sefer_guncelle(self, trip):
        return self._call(
            "seferGuncelle",
            {
                "guncellenecekSeferReferansNo": trip.uetds_reference_no,
                "ariziSeferBilgileriInput": self._sefer_payload(trip),
            },
        )

    def sefer_plaka_degistir(self, trip):
        return self._call(
            "seferPlakaDegistir",
            {
                "uetdsSeferReferansNo": trip.uetds_reference_no,
                "tasitPlakaNo": trip.vehicle.plate,
            },
        )

    def sefer_grup_ekle(self, trip, group):
        return self._call(
            "seferGrupEkle",
            {
                "uetdsSeferReferansNo": trip.uetds_reference_no,
                "seferGrupBilgileriInput": self._group_payload(trip, group),
            },
        )

    def sefer_grup_guncelle(self, trip, group):
        return self._call(
            "seferGrupGuncelle",
            {
                "uetdsSeferReferansNo": trip.uetds_reference_no,
                "grupId": group.uetds_group_ref_no,
                "seferGrupBilgileriInput": self._group_payload(trip, group),
            },
        )

    def personel_ekle(self, trip, personnel):
        return self._call(
            "personelEkle",
            {
                "uetdsSeferReferansNo": trip.uetds_reference_no,
                "seferPersonelBilgileriInput": [
                    {
                        "turKodu": personnel.uetds_role_code,
                        "uyrukUlke": personnel.nationality,
                        "tcKimlikPasaportNo": personnel.identity_no,
                        "cinsiyet": personnel.gender or "E",
                        "adi": personnel.first_name,
                        "soyadi": personnel.last_name,
                        "telefon": personnel.phone,
                        "adres": personnel.address,
                    }
                ],
            },
        )

    def personel_iptal(self, trip, identity_no, reason="Mobil güncelleme"):
        return self._call(
            "personelIptal",
            {
                "iptalPersonelInput": {
                    "personelTCKimlikPasaportNo": identity_no,
                    "uetdsSeferReferansNo": trip.uetds_reference_no,
                    "iptalAciklama": reason,
                }
            },
        )

    def yolcu_ekle_coklu(self, trip, passenger_links):
        payload = {"uetdsSeferReferansNo": trip.uetds_reference_no}
        payload["yolcuBilgileri"] = []
        for index, item in enumerate(passenger_links, start=1):
            passenger = getattr(item, "passenger", item)
            group = getattr(item, "group", None)
            payload["yolcuBilgileri"].append(
                {
                    "uyrukUlke": passenger.nationality,
                    "tcKimlikPasaportNo": passenger.identity_no or "",
                    "cinsiyet": passenger.gender,
                    "adi": passenger.first_name,
                    "soyadi": passenger.last_name,
                    "koltukNo": getattr(item, "seat_no", "") or str(index),
                    "telefonNo": passenger.phone,
                    "grupId": getattr(group, "uetds_group_ref_no", "") or "1",
                }
            )
        return self._call("yolcuEkleCoklu", payload)

    def yolcu_iptal(self, trip, identity_no, seat_no, reason="Mobil güncelleme"):
        return self._call(
            "yolcuIptal",
            {
                "uetdsSeferReferansNo": trip.uetds_reference_no,
                "iptalYolcuInput": {
                    "yolcuTCKimlikPasaportNo": identity_no,
                    "koltukNo": seat_no,
                    "iptalAciklama": reason,
                },
            },
        )

    def bildirim_ozeti(self, uetds_reference_no):
        return self._call("bildirimOzeti", {"uetdsSeferReferansNo": uetds_reference_no})

    def sefer_iptal(self, uetds_reference_no, reason):
        return self._call("seferIptal", {"uetdsSeferReferansNo": uetds_reference_no, "iptalAciklama": reason})

    def _sefer_payload(self, trip):
        departure_at = timezone.localtime(trip.departure_at)
        arrival_at = timezone.localtime(trip.arrival_estimated_at or (trip.departure_at + timedelta(hours=2)))
        return {
            "aracPlaka": trip.vehicle.plate,
            "seferAciklama": trip.description or trip.route_note,
            "hareketTarihi": departure_at.date().isoformat(),
            "hareketSaati": departure_at.strftime("%H:%M"),
            "aracTelefonu": trip.driver.phone if trip.driver_id else "",
            "firmaSeferNo": trip.firm_trip_no or str(trip.id),
            "seferBitisTarihi": arrival_at.date().isoformat(),
            "seferBitisSaati": arrival_at.strftime("%H:%M"),
        }

    def _group_payload(self, trip, group):
        return {
            "grupAciklama": group.description or trip.route_note or group.name,
            "baslangicUlke": group.departure_country,
            "baslangicIl": group.departure_city_code,
            "baslangicIlce": group.departure_district_code,
            "baslangicYer": group.departure_place or trip.departure_address,
            "bitisUlke": group.arrival_country,
            "bitisIl": group.arrival_city_code,
            "bitisIlce": group.arrival_district_code,
            "bitisYer": group.arrival_place or trip.arrival_address,
            "grupAdi": group.name,
            "grupUcret": "" if group.price is None else str(group.price),
        }

    def _call(self, operation, payload, include_wsuser=True):
        payload_with_user = dict(payload)
        if include_wsuser:
            payload_with_user = {
                "wsuser": {
                    "kullaniciAdi": self.username,
                    "sifre": self.password,
                },
                **payload,
            }
        request_xml = self._build_envelope(operation, payload_with_user)
        try:
            response = requests.post(
                self.endpoint_url,
                data=request_xml.encode("utf-8"),
                headers={
                    "Content-Type": "text/xml; charset=utf-8",
                    "SOAPAction": SOAP_ACTIONS.get(operation, operation),
                },
                auth=(self.username, self.password),
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            return UETDSResponse(
                operation=operation,
                success=False,
                sonuc_kodu="UETDS_TIMEOUT",
                sonuc_mesaji=str(exc),
                request_xml=request_xml,
            )

        parsed = self._parse_response(operation, response.text)
        parsed.request_xml = request_xml
        parsed.response_xml = response.text
        parsed.http_status = response.status_code
        if response.status_code == 401 and parsed.sonuc_kodu == "UETDS_INVALID_RESPONSE":
            parsed.sonuc_kodu = "UETDS_HTTP_AUTH_REQUIRED"
            parsed.sonuc_mesaji = "UETDS servis HTTP Basic kimlik doğrulaması istedi."
        if response.status_code >= 400:
            parsed.success = False
        return parsed

    def _build_envelope(self, operation, payload):
        fields = "\n".join(self._build_xml_field(key, value, indent="      ") for key, value in payload.items() if value is not None)
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:uet="http://uetds.unetws.udhb.gov.tr/">
  <soapenv:Header/>
  <soapenv:Body>
    <uet:{operation}>
      {fields}
    </uet:{operation}>
  </soapenv:Body>
</soapenv:Envelope>"""

    def _build_xml_field(self, key, value, indent=""):
        if isinstance(value, list):
            return "\n".join(self._build_xml_field(key, item, indent=indent) for item in value if item is not None)
        if isinstance(value, dict):
            children = "\n".join(
                self._build_xml_field(child_key, child_value, indent=f"{indent}  ")
                for child_key, child_value in value.items()
                if child_value is not None
            )
            return f"{indent}<{key}>\n{children}\n{indent}</{key}>"
        return f"{indent}<{key}>{self._xml_escape(value)}</{key}>"

    def _parse_response(self, operation, xml_text):
        try:
            root = ElementTree.fromstring(xml_text)
        except ElementTree.ParseError:
            message = "Geçersiz XML cevap"
            if xml_text:
                message = f"UETDS servisinden XML olmayan cevap alındı: {xml_text.strip()[:120]}"
            return UETDSResponse(operation=operation, success=False, sonuc_kodu="UETDS_INVALID_RESPONSE", sonuc_mesaji=message)

        data = {}
        for elem in root.iter():
            tag = elem.tag.split("}")[-1]
            if elem.text and elem.text.strip():
                data[tag] = elem.text.strip()
        sonuc_kodu = data.get("sonucKodu") or data.get("sonuc_kodu") or ""
        sonuc_mesaji = data.get("sonucMesaji") or data.get("sonuc_mesaji") or ""
        reference = data.get("uetdsSeferReferansNo") or data.get("seferReferansNo") or data.get("referansNo")
        if reference:
            data["uetds_reference_no"] = reference
        group_reference = data.get("uetdsGrupRefNo") or data.get("grupRefNo")
        if group_reference:
            data["uetds_group_ref_no"] = group_reference
        return UETDSResponse(
            operation=operation,
            success=sonuc_kodu in ("", "0"),
            sonuc_kodu=sonuc_kodu,
            sonuc_mesaji=sonuc_mesaji,
            data=data,
        )

    def _xml_escape(self, value):
        return (
            str(value)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )
