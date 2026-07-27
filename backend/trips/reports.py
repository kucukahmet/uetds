from io import BytesIO
from math import cos, pi, sin
from pathlib import Path

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
MINISTRY_LOGO_PATH = Path(__file__).resolve().parent / "static" / "trips" / "uetds_ministry_logo.png"


def render_trip_detail_pdf(trip):
    register_fonts()
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 14

    summary_x = 160
    summary_y = height - 58
    summary_h = 136
    summary_w = width - summary_x - margin

    draw_text(pdf, margin + 5, height - 28, f"({company_display_code(trip)}) {company_display_name(trip)}", 10.5)
    draw_text(pdf, width - 107, summary_y + 12, "SEFER DETAY", 13.5)

    draw_stamp(pdf, margin + 62, summary_y - (summary_h / 2))
    draw_summary_box(pdf, trip, x=summary_x, y=summary_y, w=summary_w, h=summary_h)

    y = summary_y - summary_h - 17
    warnings = [
        "Tarifesiz taşımalarda yolcu bilgisi sefer başlamadan 1 saat öncesine kadar bildirilmelidir.",
        "Grup taşıma ücret bilgisi girilmelidir.",
        "Sefer personel bilgisi girilmelidir.",
        "Bu taşıtla 3 grup oluşturulabilir(Grup en az 1 kişiden oluşabilir)",
        "Taşımanın havaalanında başlaması veya bitmesi durumunda havaalanı belirtilmelidir.",
    ]
    pdf.setFillColor(colors.red)
    for warning in warnings:
        draw_text(pdf, margin + 2, y, warning, 10.6, color=colors.red)
        y -= 13
    pdf.setFillColor(colors.black)

    y -= 5
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
    pdf.setLineWidth(0.8)
    pdf.rect(x, y - h, w, h)
    line_y = y - 13
    rows = [
        ("UETDS SEFER NO", trip.uetds_reference_no or trip.firm_trip_no or "-"),
        ("PLAKA", trip.vehicle.plate),
        ("SEFER TARİHİ - SAATİ", format_date_time_parts(trip.departure_at)),
        ("SEFER BİTİŞ TARİHİ - SAATİ", format_date_time_parts(trip.arrival_estimated_at)),
        ("SON YOLCU BİLDİRİM TARİHİ", format_datetime(trip.uetds_last_submitted_at or trip.updated_at)),
        ("BELGE NO", vehicle_document_no(trip) or "-"),
    ]
    for label, value in rows:
        draw_text(pdf, x + 6, line_y, label, 10.5)
        draw_text(pdf, x + 170, line_y, value, 10.2)
        line_y -= 20
    draw_text(pdf, x + w - 88, y - 73, derive_document_type(trip), 31, bold=True)


def draw_personnel_section(pdf, trip, x, y, w):
    header_h = 24
    pdf.setFillColor(colors.HexColor("#cfcfcf"))
    pdf.rect(x, y - header_h, w, header_h, stroke=0, fill=1)
    pdf.setFillColor(colors.black)
    draw_centered_text(pdf, x + (w / 2), y - 16, "PERSONEL LİSTESİ", 12.2)
    y -= header_h

    col_w = [145, 125, 170, w - 440]
    draw_row(pdf, x, y, col_w, ["GÖREV", "T.C. KİMLİK NO", "ADI SOYADI", "SRC"], h=24, font_size=9.8)
    y -= 24
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
            h=22,
            stroke=False,
            font_size=8.8,
        )
        y -= 24
    return y


def draw_passenger_section(pdf, trip, x, y, w):
    pdf.setFillColor(colors.HexColor("#cfcfcf"))
    pdf.rect(x, y - 24, w, 24, stroke=0, fill=1)
    pdf.setFillColor(colors.black)
    draw_centered_text(pdf, x + (w / 2), y - 16, "YOLCU LİSTESİ", 12.2)
    y -= 28

    groups = list(trip.groups.all())
    if not groups:
        groups = [None]
    for index, group in enumerate(groups, start=1):
        group_links = trip.trip_passengers.select_related("passenger", "group").filter(group=group) if group else trip.trip_passengers.select_related("passenger")
        pdf.setFillColor(colors.HexColor("#cfcfcf"))
        pdf.rect(x, y - 48, w, 48, stroke=0, fill=1)
        pdf.setFillColor(colors.black)
        draw_text(pdf, x + 3, y - 13, f"{index}. Grup", 10.4)
        draw_text(pdf, x + 3, y - 28, f"Grup Adı: {group.name if group else 'TRANSFER'}", 9.2)
        route = group_route_text(group, trip)
        draw_text(pdf, x + 3, y - 42, f"Grup Biniş - İniş Yeri : ({route})", 8.8)
        y -= 48

        description = group.description if group else trip.route_note
        price = "" if not group or group.price is None else format_price(group.price)
        draw_row(pdf, x, y, [98, w - 98], ["Grup Açıklama", description or "-"], h=17, font_size=8.8)
        y -= 17
        draw_row(pdf, x, y, [98, w - 98], ["Grup Ücreti", price or "-"], h=17, font_size=8.8)
        y -= 17

        col_w = [38, 74, 176, 194, w - 482]
        draw_row(pdf, x, y, col_w, ["SIRA", "ÜLKE", "T.C. KİMLİK NO /\nPASAPORT NO", "ADI SOYADI", "CİNSİYET"], h=25, font_size=8.7, header=True)
        y -= 25
        for passenger_index, link in enumerate(group_links, start=1):
            passenger = link.passenger
            draw_row(
                pdf,
                x,
                y,
                col_w,
                [
                    str(passenger_index),
                    passenger_country_label(passenger),
                    mask_identifier(passenger.identity_no or ""),
                    format_passenger_name(passenger),
                    passenger.gender or "-",
                ],
                h=20,
                font_size=8,
            )
            y -= 20
        y -= 10


def draw_row(pdf, x, y, widths, values, bold=False, bold_first=False, h=22, stroke=True, font_size=9, header=False):
    cursor = x
    pdf.setLineWidth(0.55)
    if stroke:
        pdf.rect(x, y - h, sum(widths), h)
    for index, (width, value) in enumerate(zip(widths, values, strict=False)):
        if stroke and index:
            pdf.line(cursor, y, cursor, y - h)
        text = str(value or "")
        font_bold = bold or (bold_first and index == 0)
        if "\n" in text:
            parts = text.split("\n")
            draw_centered_text(pdf, cursor + (width / 2), y - 10, parts[0], font_size, bold=font_bold)
            draw_centered_text(pdf, cursor + (width / 2), y - 20, parts[1], font_size, bold=font_bold)
        elif header and index in {0, 1, 3, 4}:
            draw_centered_text(pdf, cursor + (width / 2), y - 16, text, font_size, bold=font_bold)
        else:
            draw_text(pdf, cursor + 4, y - 14, text, font_size, bold=font_bold)
        cursor += width


def draw_stamp(pdf, cx, cy):
    if MINISTRY_LOGO_PATH.exists():
        try:
            logo = ImageReader(str(MINISTRY_LOGO_PATH))
            image_width, image_height = logo.getSize()
            logo_width = 104
            logo_height = logo_width * (image_height / image_width)
            pdf.drawImage(
                logo,
                cx - (logo_width / 2),
                cy - (logo_height / 2),
                width=logo_width,
                height=logo_height,
                mask="auto",
            )
            return
        except Exception:
            pass

    red = colors.HexColor("#ed1c24")
    pdf.setStrokeColor(red)
    pdf.setFillColor(red)
    pdf.setLineWidth(1.0)
    pdf.circle(cx, cy, 48)
    pdf.circle(cx, cy, 35)
    pdf.circle(cx, cy, 22)
    for step in range(0, 360, 24):
        angle = (step * pi) / 180
        draw_star(pdf, cx + (42 * cos(angle)), cy + (42 * sin(angle)), 3.2, 1.4, red)
    draw_centered_text(pdf, cx, cy + 23, "ULAŞTIRMA VE", 5.8, bold=True, color=red)
    draw_centered_text(pdf, cx, cy + 14, "ALTYAPI BAKANLIĞI", 5.8, bold=True, color=red)
    draw_centered_text(pdf, cx, cy + 1, "T.C.", 11.5, bold=True, color=red)
    pdf.ellipse(cx - 17, cy - 12, cx + 17, cy + 8, stroke=1, fill=0)
    pdf.line(cx - 17, cy - 2, cx + 17, cy - 2)
    pdf.line(cx, cy - 12, cx, cy + 8)
    pdf.ellipse(cx - 8, cy - 12, cx + 8, cy + 8, stroke=1, fill=0)
    draw_centered_text(pdf, cx, cy - 25, "TÜRKİYE CUMHURİYETİ", 5.5, bold=True, color=red)
    pdf.setStrokeColor(colors.black)
    pdf.setFillColor(colors.black)
    pdf.setLineWidth(1)


def draw_star(pdf, cx, cy, outer_radius, inner_radius, color):
    path = pdf.beginPath()
    for index in range(10):
        angle = (pi / 2) + (index * pi / 5)
        radius = outer_radius if index % 2 == 0 else inner_radius
        x = cx + radius * cos(angle)
        y = cy + radius * sin(angle)
        if index == 0:
            path.moveTo(x, y)
        else:
            path.lineTo(x, y)
    path.close()
    pdf.setFillColor(color)
    pdf.drawPath(path, stroke=0, fill=1)


def draw_text(pdf, x, y, text, size, bold=False, color=colors.black):
    pdf.setFillColor(color)
    pdf.setFont(FONT_BOLD if bold else FONT_REGULAR, size)
    pdf.drawString(x, y, str(text))


def draw_centered_text(pdf, x, y, text, size, bold=False, color=colors.black):
    font_name = FONT_BOLD if bold else FONT_REGULAR
    text = str(text)
    pdf.setFillColor(color)
    pdf.setFont(font_name, size)
    pdf.drawString(x - (pdfmetrics.stringWidth(text, font_name, size) / 2), y, text)


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
    return f"{value:.2f}"


def mask_identifier(value):
    value = str(value or "")
    if len(value) <= 6:
        return value
    return f"{value[:3]}*****{value[-3:]}"


def format_passenger_name(passenger):
    last_name = str(passenger.last_name or "")
    if len(last_name) > 1 and "*" not in last_name:
        last_name = f"{last_name[:1]}{'*' * (len(last_name) - 1)}"
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
        start = format_route_location(trip.departure_address, trip.departure_district, trip.departure_city)
        end = format_route_location(trip.arrival_address, trip.arrival_district, trip.arrival_city)
        return f"{start} - {end}"
    start = format_route_location(group.departure_place, group.departure_district, group.departure_city or trip.departure_city)
    end = format_route_location(group.arrival_place or trip.arrival_address, group.arrival_district, group.arrival_city or trip.arrival_city)
    return f"{start} - {end}"


def format_route_location(place, district, city):
    primary = str(place or "").strip()
    district = turkish_upper(district)
    city = turkish_upper(city)
    if district and city:
        suffix = f"{district}/{city}"
        return " ".join(part for part in [primary, suffix] if part)
    if primary and city:
        return f"{primary}/{city}"
    if primary and district:
        return f"{primary}/{district}"
    if primary:
        return primary
    else:
        return city or district


def turkish_upper(value):
    value = str(value or "")
    return value.translate(str.maketrans({"i": "İ", "ı": "I"})).upper()


def passenger_country_label(passenger):
    if passenger.country_name:
        return passenger.country_name
    if (passenger.nationality or "").upper() == "TR":
        return "Türkiye"
    return passenger.nationality or "-"


def derive_document_type(trip):
    document_type = getattr(trip.vehicle, "uetds_authorization_document_type", "")
    if document_type:
        return document_type
    parts = str(vehicle_document_no(trip) or "").split(".")
    for part in parts:
        if part.upper().startswith("D"):
            return part.upper()
    return "D2"
