import json
import unicodedata
from functools import lru_cache
from pathlib import Path


DATA_FILE = Path(__file__).resolve().parent / "data" / "uetds_location_references.json"


@lru_cache(maxsize=1)
def load_location_references():
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def search_location_references(query="", limit=20):
    limit = max(1, min(int(limit or 20), 50))
    normalized_query = normalize_search(query)
    references = load_location_references()
    if not normalized_query:
        return references[:limit]
    tokens = normalized_query.split()
    scored = []
    for item in references:
        haystack = normalize_search(
            " ".join([item["place"], item["district"], item["city"], item["city_code"], item["district_code"], *item.get("aliases", [])])
        )
        if all(token in haystack for token in tokens):
            scored.append((score_reference(item, normalized_query, haystack), item))
    scored.sort(key=lambda value: value[0])
    return [item for _, item in scored[:limit]]


def saved_location_to_reference(location):
    return {
        "id": f"saved:{location.id}",
        "country": location.country or "TR",
        "city": location.city,
        "city_code": location.city_code,
        "district": location.district,
        "district_code": location.district_code,
        "place": location.place or location.name,
        "address": location.address or location.place or location.name,
        "kind": "saved",
        "source": "saved",
    }


def normalize_search(value):
    value = str(value or "").strip().lower().replace("ı", "i").replace("İ", "i")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(value.split())


def score_reference(item, normalized_query, haystack):
    place = normalize_search(item["place"])
    city = normalize_search(item["city"])
    kind_rank = 0 if item.get("kind") == "airport" else 1
    if place == normalized_query:
        return (0, kind_rank, place)
    if place.startswith(normalized_query):
        return (1, kind_rank, place)
    if city.startswith(normalized_query):
        return (2, kind_rank, place)
    if haystack.startswith(normalized_query):
        return (3, kind_rank, place)
    return (4, kind_rank, place)
