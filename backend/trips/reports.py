from io import BytesIO
from pathlib import Path

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


def render_trip_detail_pdf(trip):
    register_fonts()
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 28

    y = height - 36
    draw_text(pdf, margin, y, f"({company_display_code(trip)}) {company_display_name(trip)}", 12, bold=True)
    draw_text(pdf, width - 142, y - 24, "SEFER DETAY", 16, bold=True)

    draw_stamp(pdf, margin + 72, y - 130)
    draw_summary_box(pdf, trip, x=160, y=y - 28, w=407, h=145)

    y -= 190
    warnings = [
        "Tarifesiz taşımalarda yolcu bilgisi sefer başlamadan 1 saat öncesine kadar bildirilmelidir.",
        "Grup taşıma ücret bilgisi girilmelidir.",
        "Sefer personel bilgisi girilmelidir.",
        "Bu taşıtla 3 grup oluşturulabilir(Grup en az 1 kişiden oluşabilir)",
        "Taşımanın havaalanında başlaması veya bitmesi durumunda havaalanı belirtilmelidir.",
    ]
    pdf.setFillColor(colors.red)
    for warning in warnings:
        draw_text(pdf, margin, y, warning, 11, color=colors.red)
        y -= 14
    pdf.setFillColor(colors.black)

    y -= 6
    y = draw_personnel_section(pdf, trip, margin, y, width - (2 * margin))
    y -= 12
    draw_passenger_section(pdf, trip, margin, y, width - (2 * margin))

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


def register_fonts():
    global FONT_REGULAR, FONT_BOLD
    candidates = [
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ),
        (
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        ),
        (
            "/Library/Fonts/Arial Unicode.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        ),
    ]
    for regular, bold in candidates:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont("UETDSRegular", regular))
            pdfmetrics.registerFont(TTFont("UETDSBold", bold))
            FONT_REGULAR = "UETDSRegular"
            FONT_BOLD = "UETDSBold"
            break


def draw_summary_box(pdf, trip, x, y, w, h):
    pdf.rect(x, y - h, w, h)
    line_y = y - 18
    rows = [
        ("UETDS SEFER NO", trip.uetds_reference_no or trip.firm_trip_no or "-"),
        ("PLAKA", trip.vehicle.plate),
        ("SEFER TARİHİ - SAATİ", format_date_time_parts(trip.departure_at)),
        ("SEFER BİTİŞ TARİHİ - SAATİ", format_date_time_parts(trip.arrival_estimated_at)),
        ("SON YOLCU BİLDİRİM TARİHİ", format_datetime(trip.updated_at)),
        ("BELGE NO", vehicle_document_no(trip) or "-"),
    ]
    for label, value in rows:
        draw_text(pdf, x + 8, line_y, label, 10, bold=True)
        draw_text(pdf, x + 178, line_y, value, 10)
        line_y -= 22
    draw_text(pdf, x + w - 90, y - 70, derive_document_type(trip), 32, bold=True)


def draw_personnel_section(pdf, trip, x, y, w):
    header_h = 26
    pdf.setFillColor(colors.lightgrey)
    pdf.rect(x, y - header_h, w, header_h, stroke=0, fill=1)
    pdf.setFillColor(colors.black)
    draw_text(pdf, x + (w / 2) - 45, y - 17, "PERSONEL LİSTESİ", 12, bold=True)
    y -= header_h

    col_w = [145, 125, 170, w - 440]
    draw_row(pdf, x, y, col_w, ["GÖREV", "T.C. KİMLİK NO", "ADI SOYADI", "SRC"], bold=True, h=22)
    y -= 22
    for link in trip.trip_personnel.select_related("personnel").all():
        person = link.personnel
        draw_row(
            pdf,
            x,
            y,
            col_w,
            [
                role_label(link.role),
                mask_identifier(person.identity_no),
                f"{person.first_name} {person.last_name}",
                person.src_codes or "-",
            ],
            h=24,
            stroke=False,
        )
        y -= 24
    return y


def draw_passenger_section(pdf, trip, x, y, w):
    pdf.setFillColor(colors.lightgrey)
    pdf.rect(x, y - 26, w, 26, stroke=0, fill=1)
    pdf.setFillColor(colors.black)
    draw_text(pdf, x + (w / 2) - 42, y - 17, "YOLCU LİSTESİ", 12, bold=True)
    y -= 30

    groups = list(trip.groups.all())
    if not groups:
        groups = [None]
    for index, group in enumerate(groups, start=1):
        group_links = trip.trip_passengers.select_related("passenger", "group").filter(group=group) if group else trip.trip_passengers.select_related("passenger")
        pdf.setFillColor(colors.lightgrey)
        pdf.rect(x, y - 52, w, 52, stroke=0, fill=1)
        pdf.setFillColor(colors.black)
        draw_text(pdf, x + 4, y - 14, f"{index}. Grup", 11, bold=True)
        draw_text(pdf, x + 4, y - 30, f"Grup Adı: {group.name if group else 'TRANSFER'}", 9)
        route = group_route_text(group, trip)
        draw_text(pdf, x + 4, y - 46, f"Grup Biniş - İniş Yeri : ({route})", 9)
        y -= 52

        description = group.description if group else trip.route_note
        price = "" if not group or group.price is None else format_price(group.price)
        draw_row(pdf, x, y, [100, w - 100], ["Grup Açıklama", description or "-"], bold_first=True, h=22)
        y -= 22
        draw_row(pdf, x, y, [100, w - 100], ["Grup Ücreti", price or "-"], bold_first=True, h=22)
        y -= 22

        col_w = [38, 72, 160, 199, w - 469]
        draw_row(pdf, x, y, col_w, ["SIRA", "ÜLKE", "T.C. KİMLİK NO /\nPASAPORT NO", "ADI SOYADI", "CİNSİYET"], bold=True, h=28)
        y -= 28
        for passenger_index, link in enumerate(group_links, start=1):
            passenger = link.passenger
            draw_row(
                pdf,
                x,
                y,
                col_w,
                [
                    str(passenger_index),
                    passenger.country_name or passenger.nationality,
                    mask_identifier(passenger.identity_no or ""),
                    format_passenger_name(passenger),
                    passenger.gender or "-",
                ],
                h=22,
            )
            y -= 22
        y -= 10


def draw_row(pdf, x, y, widths, values, bold=False, bold_first=False, h=22, stroke=True):
    cursor = x
    if stroke:
        pdf.rect(x, y - h, sum(widths), h)
    for index, (width, value) in enumerate(zip(widths, values, strict=False)):
        if stroke and index:
            pdf.line(cursor, y, cursor, y - h)
        text = str(value or "")
        font_bold = bold or (bold_first and index == 0)
        if "\n" in text:
            parts = text.split("\n")
            draw_text(pdf, cursor + 4, y - 10, parts[0], 8, bold=font_bold)
            draw_text(pdf, cursor + 4, y - 20, parts[1], 8, bold=font_bold)
        else:
            draw_text(pdf, cursor + 4, y - 14, text, 9, bold=font_bold)
        cursor += width


def draw_stamp(pdf, cx, cy):
    pdf.setStrokeColor(colors.red)
    pdf.circle(cx, cy, 48)
    pdf.circle(cx, cy, 34)
    pdf.setFillColor(colors.red)
    draw_text(pdf, cx - 27, cy + 4, "T.C.", 14, bold=True, color=colors.red)
    draw_text(pdf, cx - 34, cy - 12, "ULAŞTIRMA", 7, color=colors.red)
    pdf.setStrokeColor(colors.black)
    pdf.setFillColor(colors.black)


def draw_text(pdf, x, y, text, size, bold=False, color=colors.black):
    pdf.setFillColor(color)
    pdf.setFont(FONT_BOLD if bold else FONT_REGULAR, size)
    pdf.drawString(x, y, str(text))


def format_datetime(value):
    if not value:
        return "-"
    value = timezone.localtime(value)
    return value.strftime("%d/%m/%Y %H:%M:%S")


def format_date_time_parts(value):
    if not value:
        return "-"
    value = timezone.localtime(value)
    return f"{value.strftime('%d/%m/%Y')}    {value.strftime('%H:%M')}"


def format_price(value):
    as_text = f"{value:.2f}"
    return as_text[:-3] if as_text.endswith(".00") else as_text


def mask_identifier(value):
    value = str(value or "")
    if len(value) <= 6:
        return value
    return f"{value[:3]}*****{value[-3:]}"


def format_passenger_name(passenger):
    last_name = str(passenger.last_name or "")
    if len(last_name) > 1 and "*" not in last_name:
        last_name = f"{last_name[:1]}******"
    return f"{passenger.first_name} {last_name}".strip()


def role_label(role):
    labels = {"driver": "Şoför", "guide": "Rehber", "assistant": "Personel"}
    return labels.get(role, role.title())


def company_display_name(trip):
    return (getattr(trip.vehicle, "uetds_company_title", "") or trip.company.name).strip()


def company_display_code(trip):
    return getattr(trip.vehicle, "uetds_unet_no", "") or credential_username(trip) or trip.company.tax_no or trip.company.unet_no or "-"


def credential_username(trip):
    try:
        from uetds.models import UETDSCredential

        credential = (
            UETDSCredential.objects.filter(
                company=trip.company,
                environment=trip.uetds_environment or trip.company.settings.default_uetds_environment or "test",
                is_active=True,
            )
            .order_by("-updated_at")
            .first()
        )
        return credential.get_username() if credential else ""
    except Exception:
        return ""


def vehicle_document_no(trip):
    return getattr(trip.vehicle, "uetds_authorization_document_no", "") or trip.company.unet_no or ""


def group_route_text(group, trip):
    if not group:
        return f"{trip.departure_address}/{trip.departure_city} - {trip.arrival_address}/{trip.arrival_city}"
    start = " ".join(part for part in [group.departure_place, group.departure_district] if part)
    end = group.arrival_place or trip.arrival_address
    return f"{start}/{group.departure_city} - {end}/{group.arrival_city}"


def derive_document_type(trip):
    document_type = getattr(trip.vehicle, "uetds_authorization_document_type", "")
    if document_type:
        return document_type
    parts = str(vehicle_document_no(trip) or "").split(".")
    for part in parts:
        if part.upper().startswith("D"):
            return part.upper()
    return "D2"
