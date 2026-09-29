#!/usr/bin/env python3
"""Verify Polish coverage and interpolation parameters for mobile translations."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
english = json.loads((root / "i18n/en.json").read_text())
polish = json.loads((root / "i18n/pl.json").read_text())
missing = sorted(english.keys() - polish.keys())
mismatches = {
    key: (sorted(re.findall(r"\{[A-Za-z0-9_]+\}", english[key])), sorted(re.findall(r"\{[A-Za-z0-9_]+\}", polish[key])))
    for key in english.keys() & polish.keys()
    if isinstance(english[key], str) and isinstance(polish[key], str)
    and sorted(re.findall(r"\{[A-Za-z0-9_]+\}", english[key])) != sorted(re.findall(r"\{[A-Za-z0-9_]+\}", polish[key]))
}
print(f"Polish: {len(polish)}/{len(english)} English keys; missing={len(missing)}; placeholder differences requiring ICU review={len(mismatches)}")
for key in missing:
    print("MISSING", key)
for key, params in mismatches.items():
    print("REVIEW_ICU", key, params)
raise SystemExit(bool(missing))
