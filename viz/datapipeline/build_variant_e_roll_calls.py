"""
Build datapipeline/new_roll_calls_E.json patch from the 10 Variant-E roll-call XMLs.

Reuses the parse_senate_xml / parse_house_xml / map_senate / convert_house helpers
from build_new_roll_calls.py. Inputs in datapipeline/output/:

  Senate (6):
    _rc_macra_senate.xml          — 114-1 #144  (Apr 14, 2015)  expected 92-8
    _rc_caa2016path_senate.xml    — 114-1 #339  (Dec 18, 2015)  expected 65-33
    _rc_ssfa_senate.xml           — 118-2 #338  (Dec 21, 2024)  expected 76-20
    _rc_fy25cr_senate.xml         — 119-1 #133  (Mar 14, 2025)  expected 54-46
    _rc_skinny_repeal_senate.xml  — 115-1 #179  (Jul 28, 2017)  expected 49-51 (FAILED)
    _rc_rahfra_senate.xml         — 114-1 #329  (Dec 3, 2015)   expected 52-47

  House (9):
    _rc_macra_house.xml         — 2015 #144  (Mar 26, 2015)  expected 392-37
    _rc_caa2016path_house.xml   — 2015 #703  (Dec 17, 2015)  expected 318-109 (PATH portion)
    _rc_ssfa_house.xml          — 2024 #456  (Nov 12, 2024)  expected 327-75
    _rc_fy25cr_house.xml        — 2025 #70   (Mar 11, 2025)  expected 217-213
    _rc_bbb_house.xml           — 2021 #385  (Nov 19, 2021)  expected 220-213 (FAILED)
    _rc_ahca_house.xml          — 2017 #256  (May 4, 2017)   expected 217-213 (FAILED)
    _rc_heroes_house.xml        — 2020 #109  (May 15, 2020)  expected 208-199 (FAILED)
    _rc_dream_house.xml         — 2021 #91   (Mar 18, 2021)  expected 228-197 (FAILED)
    _rc_rahfra_house.xml        — 2016 #6    (Jan 6, 2016)   expected 240-181 (FAILED — vetoed)

Both BBB and HEROES and Dream and AHCA had no Senate vote in this form.
Skinny Repeal had no House vote (Senate-only amendment).
"""

import json
import pathlib
import sys

# Reuse helpers from the existing pipeline
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_new_roll_calls import (
    parse_senate_xml, parse_house_xml, map_senate, convert_house, PUB
)

ROOT = pathlib.Path(__file__).resolve().parent
OUT  = ROOT / "output"

# bill_id, senate_xml_filename_or_None, house_xml_filename_or_None, (expected_yea, expected_nay)
BILLS = [
    ("macra_2015",         "_rc_macra_senate.xml",         "_rc_macra_house.xml",         (92, 8),    (392, 37)),
    ("caa_2016_path",      "_rc_caa2016path_senate.xml",   "_rc_caa2016path_house.xml",   (65, 33),   (318, 109)),
    ("ssfa_2024",          "_rc_ssfa_senate.xml",          "_rc_ssfa_house.xml",          (76, 20),   (327, 75)),
    ("fy25_cr_119_4",      "_rc_fy25cr_senate.xml",        "_rc_fy25cr_house.xml",        (54, 46),   (217, 213)),
    ("bbb_2021",           None,                           "_rc_bbb_house.xml",           None,       (220, 213)),
    ("ahca_2017",          None,                           "_rc_ahca_house.xml",          None,       (217, 213)),
    ("skinny_repeal_2017", "_rc_skinny_repeal_senate.xml", None,                          (49, 51),   None),
    ("heroes_2020",        None,                           "_rc_heroes_house.xml",        None,       (208, 199)),
    ("dream_2021",         None,                           "_rc_dream_house.xml",         None,       (228, 197)),
    ("rahfra_2016",        "_rc_rahfra_senate.xml",        "_rc_rahfra_house.xml",        (52, 47),   (240, 181)),
]

def check_tally(parsed_counts, expected, label):
    if expected is None:
        return True
    y, n = expected
    raw_y = parsed_counts.get("+", 0)
    raw_n = parsed_counts.get("-", 0)
    ok = (raw_y == y and raw_n == n)
    mark = "✓" if ok else "✗ MISMATCH"
    print(f"    {label} raw tally {raw_y}-{raw_n}  expected {y}-{n}  {mark}")
    return ok

def count_house_raw(votes_dict):
    from build_new_roll_calls import VOTE_CODE
    t = {"+": 0, "-": 0, "0": 0, "P": 0}
    for v in votes_dict.values():
        c = VOTE_CODE.get(v)
        if c:
            t[c] += 1
    return t

def count_senate_raw(senate_rows):
    from build_new_roll_calls import VOTE_CODE
    t = {"+": 0, "-": 0, "0": 0, "P": 0}
    for r in senate_rows:
        c = VOTE_CODE.get(r["vote"])
        if c:
            t[c] += 1
    return t

def main():
    leg = json.load((PUB / "legislators-current.json").open())
    out = {}
    all_ok = True

    for bill_id, sen_file, hou_file, sen_exp, hou_exp in BILLS:
        print(f"\n=== {bill_id} ===")
        sen_map = None
        hou_map = None
        if sen_file:
            p = OUT / sen_file
            if p.exists():
                rows = parse_senate_xml(p)
                if not check_tally(count_senate_raw(rows), sen_exp, "senate"):
                    all_ok = False
                sen_map = map_senate(rows, leg, bill_id)
            else:
                print(f"  missing senate XML: {p}")
                all_ok = False
        if hou_file:
            p = OUT / hou_file
            if p.exists():
                votes = parse_house_xml(p)
                if not check_tally(count_house_raw(votes), hou_exp, "house"):
                    all_ok = False
                hou_map = convert_house(votes, bill_id)
            else:
                print(f"  missing house XML: {p}")
                all_ok = False
        out[bill_id] = {"senate": sen_map, "house": hou_map}

    patch_path = ROOT / "new_roll_calls_E.json"
    patch_path.write_text(json.dumps(out, indent=2))
    print(f"\n{'=' * 60}\nWrote {patch_path} ({patch_path.stat().st_size:,} bytes)")
    print(f"All tallies verified: {all_ok}")
    return 0 if all_ok else 1

if __name__ == "__main__":
    sys.exit(main())
