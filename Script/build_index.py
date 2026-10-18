"""Registers every JSON file in Kingdoms/ and Troops/.

Run from the repo root after adding or removing a kingdom or troop:
    python Script/build_index.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

for folder in ("Kingdoms", "Troops"):
    d = ROOT / folder
    files = sorted(p.name for p in d.glob("*.json") if p.name != "index.json")
    (d / "index.json").write_text(json.dumps(files, indent=2) + "\n", encoding="utf-8")
    print(f"{folder}: {files}")
