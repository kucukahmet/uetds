# UETDS Mobile

Expo React Native mobile app for Android and iOS. It follows the Stitch `UETDS MOBILE` design system and talks to the Django backend in `../backend`.

## Setup

```bash
npm install
cp .env.example .env
npm run start
```

Backend local setup:

```bash
cd ../backend
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py seed_uetds_test
./.venv/bin/python manage.py runserver
```

Demo login:

```text
ops@example.com / EXPO_PUBLIC_DEMO_PASSWORD
```

## Backend

The app uses a single backend configured from `.env` and shows that backend plus the selected UETDS environment in the top area of each screen. There is no in-app backend switcher.

```text
EXPO_PUBLIC_API_URL=http://165.232.64.193:8080/api/v1
EXPO_PUBLIC_BACKEND_LABEL=server-test
EXPO_PUBLIC_BACKEND_SHORT_LABEL=SERVER
```

For Android emulator localhost testing:

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1
EXPO_PUBLIC_BACKEND_LABEL=localhost
EXPO_PUBLIC_BACKEND_SHORT_LABEL=LOCAL
```

## Scripts

```bash
npm run ios
npm run android
npm run web
npm run typecheck
npm test
```

## Implemented Flow

- Login, session restore, token refresh and logout.
- Active company selection and `X-Company-ID` header injection.
- Home, Trips, Quick Trip, Records and Settings tabs.
- Vehicle, driver, passenger and saved route list/create screens.
- Trip list/detail, duplicate, return trip and single UETDS submit action.
- UETDS test/real credential screens, selected environment switch, verify, IP list and operation logs.

Trip submit uses the selected company UETDS environment from `Ayarlar > UETDS Ortamları`.
