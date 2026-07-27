# UETDS Backend

Django 6 + Django REST Framework backend for multi-company UETDS tarifesiz yolcu operations.

## What Is Included

- Multi-company tenant model with company scoped vehicles, personnel, passengers, trips, UETDS credentials, logs and billing/import foundations.
- JWT auth with 12 hour access tokens and 7 day refresh/session lifetime.
- Company membership roles and permission checks.
- Tenant selection with `X-Company-ID` header or the user's active company.
- Quick trip creation, duplicate trip and return-trip endpoints.
- Raw SOAP UETDS adapter with masked request/response logging.
- Synchronous `submit-uetds` orchestration with idempotency and partial failure state.
- UETDS live environment is disabled by default; only the official test endpoint is used unless `UETDS_ALLOW_LIVE=true` is explicitly set.
- Live write operations still require `CompanySettings.live_uetds_enabled=true`, `confirm_live_submission=true`, and an explicit `live_uetds_submit` role permission.
- OpenAPI docs at `/api/docs/`.

## Setup

```bash
python3.13 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py seed_uetds_test
./.venv/bin/python manage.py createsuperuser
./.venv/bin/python manage.py runserver
```

The default development database is SQLite. Set the `DB_*` variables in `.env` to use PostgreSQL.

`seed_demo` creates `ops@example.com / secret` and a demo company for Bruno/local API testing.
`seed_uetds_test` creates the same demo user plus UETDS test credentials from the official test document, demo vehicle/personnel/passengers, saved Göcek -> Dalaman route, and a ready demo trip.

The generic UETDS test credentials verify successfully and `ipListele` works. Actual `seferEkle` still requires a vehicle plate registered to the credential's A1/A2/B2/D2 authorization and a driver with valid mesleki yeterlilik/SRC data. If the test credential has no registered plate, UETDS returns code `34` or code `3`; this is a Ministry-side data requirement, not a backend routing issue.

## Main API Paths

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me`
- `GET|POST /api/v1/companies/`
- `POST /api/v1/companies/{id}/switch/`
- `GET|POST /api/v1/vehicles/`
- `GET|POST /api/v1/personnel/`
- `GET|POST /api/v1/passengers/`
- `POST /api/v1/trips/quick-create/`
- `POST /api/v1/trips/{id}/duplicate/`
- `POST /api/v1/trips/{id}/create-return-trip/`
- `POST /api/v1/trips/{id}/submit-uetds/`
- `POST /api/v1/trips/{id}/sync-summary/`
- `POST /api/v1/trips/{id}/cancel-uetds/`
- `GET /api/v1/uetds/status/`
- `POST /api/v1/uetds/credentials/`
- `POST /api/v1/uetds/verify/`
- `GET /api/v1/uetds/ip-list/`
- `GET /api/v1/uetds/logs/`

## Bruno API Collection

The Bruno collection lives at [bruno/UETDS API](bruno/UETDS%20API).

Start the backend first:

```bash
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py seed_uetds_test
./.venv/bin/python manage.py runserver
```

Then open `bruno/UETDS API` in Bruno and select `Local` or `Server Test`.

Run order:

1. `00 Auth / 01 Login`
2. `01 Companies / 01 List Companies`
3. `01 Companies / 03 Switch Company`
4. `05 Trips / 01 Quick Create Trip`
5. `05 Trips / 02 Get Trip`
6. `05 Trips / 03 Duplicate Trip`
7. `05 Trips / 04 Create Return Trip`
8. `06 UETDS / 01 Status`
9. `uetdsUsername` and `uetdsPassword` are prefilled with the official test credentials.
10. `06 UETDS / 02 Save Test Credentials`
11. `06 UETDS / 03 Verify Test Credentials`
12. `06 UETDS / 04 IP List`
13. Optional preflight: `02 Fleet / 03 UETDS Check Vehicle`, `03 People / 03 UETDS Check Personnel`
14. `06 UETDS / 05 Submit Trip To Test UETDS`
15. `07 Logs / 01 List UETDS Logs`

The login request captures `accessToken`, `refreshToken`, and `companyId` automatically. Trip requests capture `tripId`, `duplicateTripId`, and `returnTripId`.

The collection is test-only by default. The API rejects `environment=live` unless `UETDS_ALLOW_LIVE=true` is explicitly set in `.env`. Enabling that flag only makes live credentials/status available; live trip write operations remain blocked until the company live flag and explicit live submit permission are enabled.

Authenticated tenant-scoped requests should include:

```http
Authorization: Bearer <access_token>
X-Company-ID: <company_uuid>
```

## Test

```bash
./.venv/bin/pytest -q
./.venv/bin/python manage.py check
./.venv/bin/python manage.py spectacular --file /tmp/uetds-schema.yaml --validate
```
