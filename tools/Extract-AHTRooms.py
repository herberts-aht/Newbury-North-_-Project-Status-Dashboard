import re
import csv
import json
import pymupdf
from pathlib import Path
from collections import defaultdict

PDF_PATH = Path("2200-main-house-progress-set.pdf")
CSV_PATH = Path("room-builder-review.csv")
JSON_PATH = Path("room-builder-review.json")

ROOM_NUMBER_RE = re.compile(r"^\d{3}$")

def clean(text):
    return re.sub(r"\s+", " ", text).strip()

def page_info(text):
    upper = text.upper()

    if "FUTURE GROUND FLOOR PLAN" in upper:
        return "Ground Floor", "Future"
    if "GROUND FLOOR PLAN" in upper:
        return "Ground Floor", "Current"
    if "FIRST FLOOR PLAN" in upper:
        return "First Floor", "Current"
    if "SECOND FLOOR PLAN" in upper:
        return "Second Floor", "Current"

    return None, None

def floor_from_number(room_number):
    n = int(room_number)

    if 0 <= n <= 99:
        return "Ground Floor"
    if 100 <= n <= 199:
        return "First Floor"
    if 200 <= n <= 299:
        return "Second Floor"

    return ""

def is_noise(text):
    t = clean(text)
    u = t.upper()

    if not t:
        return True

    if ROOM_NUMBER_RE.fullmatch(t):
        return True

    if re.fullmatch(r"\d+(?:\.\d+)?", t):
        return True

    if re.search(r"\bM2\b|\bSQ\.?\s*FT\b", u):
        return True

    if re.search(r"\d+'\s*-", t):
        return True

    if re.fullmatch(r"[A-Z]\d+", u):
        return True

    if re.fullmatch(r"[A-Z]-[A-Z]'?", u):
        return True

    if re.fullmatch(r"[xX]+", t):
        return True

    if re.match(r"^\(?\d+\s*[xX]?", t):
        return True

    if "PARKING SPACES" in u:
        return True

    if "CADCOACHING" in u:
        return True

    if "10TH STREET" in u:
        return True

    return False

def normalize_room_name(name):
    name = clean(name)

    name = re.sub(r"\b19 PARKING SPACES\b", "", name, flags=re.I)
    name = re.sub(r"\bCRAWL SPACE UNDER SPA\b", "", name, flags=re.I)
    name = re.sub(r"\bCRAWL SPACE UNDER INDOOR POOL\b", "", name, flags=re.I)
    name = re.sub(r"\bCRAWL SPACE UNDER\b", "", name, flags=re.I)

    return clean(name)

def get_line_candidates(page):
    """
    Use text-line order only to identify legitimate isolated 3-digit
    room-number candidates and reconstruct the nearby label.
    """
    text = page.get_text("text")
    lines = [clean(x) for x in text.splitlines() if clean(x)]

    candidates = []

    for i, line in enumerate(lines):
        if not ROOM_NUMBER_RE.fullmatch(line):
            continue

        room_number = line
        parts = []

        for offset in range(1, 4):
            idx = i - offset

            if idx < 0:
                break

            candidate = lines[idx]

            if ROOM_NUMBER_RE.fullmatch(candidate):
                break

            if is_noise(candidate):
                break

            parts.insert(0, candidate)

        name = normalize_room_name(" ".join(parts))

        if name:
            candidates.append((room_number, name))

    return candidates


pdf = pymupdf.open(PDF_PATH)

raw = []

for page_index, page in enumerate(pdf):
    page_text = page.get_text("text")
    sheet_floor, plan_status = page_info(page_text)

    if not sheet_floor:
        continue

    candidates = get_line_candidates(page)

    for room_number, room_name in candidates:
        raw.append({
            "include": "Yes",
            "floor": floor_from_number(room_number),
            "room_number": room_number,
            "room_name": room_name,
            "source_page": page_index + 1,
            "plan_status": plan_status,
            "confidence": "High",
            "notes": ""
        })


# Collapse identical number/name rows across pages and plan versions.
grouped = defaultdict(list)

for row in raw:
    key = (
        row["room_number"],
        row["room_name"].upper()
    )
    grouped[key].append(row)

results = []

for _, rows in grouped.items():
    first = dict(rows[0])

    pages = sorted({str(r["source_page"]) for r in rows})
    statuses = sorted({r["plan_status"] for r in rows})

    first["source_page"] = ",".join(pages)

    if len(statuses) > 1:
        first["plan_status"] = "Current + Future"
        first["notes"] = "Same room appears in Current and Future plans"

    results.append(first)


# Flag only same room number with genuinely different names.
by_number = defaultdict(list)

for row in results:
    by_number[row["room_number"]].append(row)

for room_number, rows in by_number.items():
    names = {r["room_name"].upper() for r in rows}

    if len(names) > 1:
        for row in rows:
            row["confidence"] = "Review"
            row["notes"] = "Same room number has different names in plan set"


floor_order = {
    "Ground Floor": 0,
    "First Floor": 1,
    "Second Floor": 2
}

results.sort(
    key=lambda r: (
        floor_order.get(r["floor"], 9),
        int(r["room_number"]),
        r["room_name"]
    )
)


fields = [
    "include",
    "floor",
    "room_number",
    "room_name",
    "source_page",
    "plan_status",
    "confidence",
    "notes"
]

with CSV_PATH.open("w", newline="", encoding="utf-8-sig") as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    writer.writerows(results)

with JSON_PATH.open("w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print(f"Pages scanned: {pdf.page_count}")
print(f"Raw plan-room matches: {len(raw)}")
print(f"Unique review rows: {len(results)}")
print(f"Rows needing review: {sum(r['confidence'] == 'Review' for r in results)}")
print(f"Created: {CSV_PATH}")
