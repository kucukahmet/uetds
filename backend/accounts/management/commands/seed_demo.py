from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from companies.models import Company, CompanyMembership, CompanySettings


class Command(BaseCommand):
    help = "Create a demo user and company for local API testing."

    def add_arguments(self, parser):
        parser.add_argument("--email", default="ops@example.com")
        parser.add_argument("--password", default="secret")
        parser.add_argument("--company", default="Demo Turizm")

    def handle(self, *args, **options):
        User = get_user_model()
        email = options["email"]
        password = options["password"]
        company_name = options["company"]

        user, created_user = User.objects.get_or_create(
            email=email,
            defaults={"username": email, "name": "Demo Operasyon"},
        )
        if created_user:
            user.set_password(password)
            user.save(update_fields=["password"])

        company, _ = Company.objects.get_or_create(
            name=company_name,
            defaults={"tax_no": "0000000000", "unet_no": "TEST-UNET"},
        )
        CompanySettings.objects.get_or_create(company=company)
        CompanyMembership.objects.get_or_create(
            user=user,
            company=company,
            defaults={"role": CompanyMembership.Role.COMPANY_ADMIN},
        )
        if not user.active_company_id:
            user.active_company_id = company.id
            user.save(update_fields=["active_company_id"])

        self.stdout.write(self.style.SUCCESS(f"Demo user ready: {email} / {password}"))
        self.stdout.write(self.style.SUCCESS(f"Demo company ready: {company.name} ({company.id})"))
