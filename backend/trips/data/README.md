UETDS location reference data
=============================

`uetds_location_references.json` contains Turkey province, district, and airport reference codes used for UETDS `seferGrupEkle` route fields.

Seed sources:
- Official UETDS `ilce_listesi.xls` from the UETDS technical documents page for province/district codes.
- Public MERNIS airport-code supplement for airport rows not present in the official `ilce_listesi.xls`.

The official UETDS arizi passenger SOAP flow does not expose a province/district lookup method; it expects callers to send `baslangicIl`, `baslangicIlce`, `bitisIl`, and `bitisIlce` codes. The mobile app should therefore let users search human-readable place names while the backend returns the codes.

Neighborhoods, marinas, hotels, meeting points, and other local place names are not modeled as separate UETDS district codes. For those, store the parent province/district or airport code and send the local name in `baslangicYer` / `bitisYer`. Company-specific frequently used points should be stored as `SavedLocation` records so they appear in search.

If the Ministry publishes a newer authoritative reference file, regenerate this JSON from that file and keep the API contract unchanged.
