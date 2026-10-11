#!/usr/bin/env python3
"""Merge researched council figures into data/council-rates-2026-27.json.

usage: python3 merge_results.py results1.json [results2.json ...]

Each file is {slug: {...council fields..., "_check": {...}}}. The "_check"
notes (confidence, anomalies) go to data/checks-2026-27.json, not the site data.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
DATA = HERE / "data" / "council-rates-2026-27.json"
CHECKS = HERE / "data" / "checks-2026-27.json"
REQUIRED = ("name", "csv_council", "residential_rate", "minimum_rate", "landscape_levy", "source_pdf")

data = json.loads(DATA.read_text())
checks = json.loads(CHECKS.read_text()) if CHECKS.exists() else {}
for path in sys.argv[1:]:
    for slug, c in json.loads(pathlib.Path(path).read_text()).items():
        if slug not in data["councils"]:
            sys.exit(f"{path}: unknown council slug {slug!r}")
        missing = [k for k in REQUIRED if c.get(k) is None]
        if missing:
            sys.exit(f"{path}: {slug} is missing {missing}")
        # A rate over 1 cent in the dollar means someone forgot to divide by 100.
        if c.get("basis", "capital value") == "capital value" and not 0.0005 < c["residential_rate"] < 0.01:
            sys.exit(f"{path}: {slug} residential_rate {c['residential_rate']} looks like cents, not dollars")
        checks[slug] = c.pop("_check", {})
        data["councils"][slug] = c
        print(f"merged {slug}{' (unverified)' if c.get('verified') is False else ''}")
DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
CHECKS.write_text(json.dumps(checks, indent=2, ensure_ascii=False) + "\n")
