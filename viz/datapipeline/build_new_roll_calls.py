"""
Build datapipeline/new_roll_calls.json patch from saved roll-call XML/JSON inputs.

Inputs in datapipeline/output/:
  _rc_ffcra_senate.xml    — Senate roll-call 116-2 #76 (Mar 18, 2020)
  _rc_bba_senate.xml      — Senate roll-call 116-1 #262 (Aug 1, 2019)
  _rc_chips_senate.xml    — Senate roll-call 117-2 #271 (Jul 27, 2022)
  _rc_ffcra_house.xml     — House roll-call 2020 #102  (Mar 14, 2020) — if available
  _rc_pppchea_house.xml   — House roll-call 2020 #104  (Apr 23, 2020) — if available
  _rc_bba_house.xml       — House roll-call 2019 #511  (Jul 25, 2019) — if available
  _rc_chips_house.xml     — House roll-call 2022 #404  (Jul 28, 2022) — if available

Senate XML uses LIS IDs; we map (last_name, state) → bioguide via legislators-current.json
(consistent with datapipeline/add_pact_caa_rollcalls.py). Historical/no-longer-serving
senators are skipped — they have no rep card to display.

House XML uses bioguide natively (name-id attribute).
"""

import json
import pathlib
import re
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent
OUT  = ROOT / "output"
PUB  = ROOT.parent / "public"

VOTE_CODE = {
    "Yea": "+",
    "Aye": "+",
    "Yes": "+",
    "Nay": "-",
    "No":  "-",
    "Not Voting": "0",
    "Present": "P",
    "Present, Giving Live Pair": "P",
}

def norm(s):
    nfkd = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()

def parse_senate_xml(path):
    txt = pathlib.Path(path).read_text()
    out = []
    for m in re.finditer(r"<member>(.*?)</member>", txt, re.S):
        body = m.group(1)
        def f(name):
            mm = re.search(rf"<{name}>([^<]*)</{name}>", body)
            return mm.group(1).strip() if mm else ""
        out.append({
            "last": f("last_name"), "first": f("first_name"),
            "state": f("state"), "party": f("party"),
            "vote": f("vote_cast"), "lis": f("lis_member_id"),
        })
    return out

def parse_house_xml(path):
    txt = pathlib.Path(path).read_text()
    out = {}
    for m in re.finditer(r"<recorded-vote>(.*?)</recorded-vote>", txt, re.S):
        body = m.group(1)
        leg = re.search(r'name-id="([^"]+)"', body)
        v = re.search(r"<vote>([^<]+)</vote>", body)
        if leg and v:
            out[leg.group(1)] = v.group(1).strip()
    return out

def map_senate(senate_rows, legislators, bill_id):
    sen_idx = {}
    for L in legislators:
        if L.get("chamber") != "senate":
            continue
        key = (norm(L["name"]["last"]), L["state"])
        sen_idx.setdefault(key, []).append(L)
    out = {}
    matched = skipped = 0
    tally = {"+": 0, "-": 0, "0": 0, "P": 0}
    for row in senate_rows:
        code = VOTE_CODE.get(row["vote"])
        if code is None:
            print(f"  [{bill_id}] WARN unknown vote {row['vote']!r}")
            continue
        tally[code] += 1
        key = (norm(row["last"]), row["state"])
        cands = sen_idx.get(key, [])
        if not cands:
            skipped += 1
            continue
        target = cands[0]
        if len(cands) > 1:
            for c in cands:
                if norm(c["name"]["first"])[:2] == norm(row["first"])[:2]:
                    target = c
                    break
        out[target["bioguide_id"]] = code
        matched += 1
    print(f"  [{bill_id}] senate: total={len(senate_rows)} (Y={tally['+']} N={tally['-']} NV={tally['0']} P={tally['P']}), "
          f"matched currently-serving={matched}, historical skipped={skipped}")
    return out

def convert_house(votes_dict, bill_id):
    out = {}
    tally = {"+": 0, "-": 0, "0": 0, "P": 0}
    for bg, v in votes_dict.items():
        code = VOTE_CODE.get(v)
        if code is None:
            print(f"  [{bill_id}] WARN unknown vote {v!r}")
            continue
        out[bg] = code
        tally[code] += 1
    print(f"  [{bill_id}] house: total={len(votes_dict)} (Y={tally['+']} N={tally['-']} NV={tally['0']} P={tally['P']})")
    return out

def main():
    leg = json.load((PUB / "legislators-current.json").open())
    out = {}

    bills = [
        ("ffcra_2020",   "_rc_ffcra_senate.xml",   "_rc_ffcra_house.xml"),
        ("pppchea_2020", None,                     "_rc_pppchea_house.xml"),
        ("bba_2019",     "_rc_bba_senate.xml",     "_rc_bba_house.xml"),
        ("chips_2022",   "_rc_chips_senate.xml",   "_rc_chips_house.xml"),
    ]

    for bill_id, sen_file, hou_file in bills:
        print(f"\n=== {bill_id} ===")
        sen_map = None
        hou_map = None
        if sen_file:
            p = OUT / sen_file
            if p.exists():
                sen_map = map_senate(parse_senate_xml(p), leg, bill_id)
            else:
                print(f"  [{bill_id}] missing senate XML: {p}")
        if hou_file:
            p = OUT / hou_file
            if p.exists():
                hou_map = convert_house(parse_house_xml(p), bill_id)
            else:
                print(f"  [{bill_id}] missing house XML: {p}")
        out[bill_id] = {"senate": sen_map, "house": hou_map}

    patch_path = ROOT / "new_roll_calls.json"
    patch_path.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {patch_path} ({patch_path.stat().st_size:,} bytes)")

if __name__ == "__main__":
    main()
