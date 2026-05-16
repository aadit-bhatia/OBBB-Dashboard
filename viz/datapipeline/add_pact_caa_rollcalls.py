"""
Append two bills to public/key_votes.json and public/roll_calls.json:
  - PACT Act 2022 (S. 3373 → P.L. 117-168)
  - Dec-2020 COVID Relief embedded in Consolidated Appropriations Act 2021 (H.R. 133 → P.L. 116-260)

Per-member votes are parsed from official roll-call XMLs from senate.gov and clerk.house.gov.
House XMLs use bioguide ID natively (name-id attribute). Senate XMLs use LIS IDs that need mapping.
Only currently-serving legislators (from legislators-current.json) are kept — historical members
who voted but are no longer in office wouldn't render on any rep card anyway.
"""
import json
import pathlib
import re
import unicodedata

PUB = pathlib.Path(__file__).resolve().parent.parent / "public"
KEYV = PUB / "key_votes.json"
RC   = PUB / "roll_calls.json"
LEG  = PUB / "legislators-current.json"


def normalize_name(s):
    # Strip accents and lowercase for fuzzy match
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def parse_senate_xml(path):
    """Senate XML uses LIS member IDs. Returns list of (last_name, first_name, state, party, vote_cast)."""
    txt = pathlib.Path(path).read_text()
    out = []
    for m in re.finditer(r"<member>(.*?)</member>", txt, re.S):
        body = m.group(1)
        def field(name):
            mm = re.search(rf"<{name}>([^<]*)</{name}>", body)
            return mm.group(1).strip() if mm else ""
        out.append({
            "last": field("last_name"),
            "first": field("first_name"),
            "state": field("state"),
            "party": field("party"),
            "vote": field("vote_cast"),
        })
    return out


def parse_house_xml(path):
    """House XML uses bioguide as name-id. Returns dict bioguide -> vote_string."""
    txt = pathlib.Path(path).read_text()
    out = {}
    for m in re.finditer(r"<recorded-vote>(.*?)</recorded-vote>", txt, re.S):
        body = m.group(1)
        leg = re.search(r'name-id="([^"]+)"', body)
        v   = re.search(r"<vote>([^<]+)</vote>", body)
        if leg and v:
            out[leg.group(1)] = v.group(1).strip()
    return out


VOTE_CODE = {
    "Yea":          "+",
    "Aye":          "+",
    "Yes":          "+",
    "Nay":          "-",
    "No":           "-",
    "Not Voting":   "0",
    "Present":      "P",
    "Present, Giving Live Pair": "P",
}


def map_senate_to_bioguide(senate_votes, legislators):
    """Match senate vote rows to currently-serving senators by (last_name, state)."""
    sen_index = {}
    for L in legislators:
        if L.get("chamber") != "senate":
            continue
        key = (normalize_name(L["name"]["last"]), L["state"])
        sen_index.setdefault(key, []).append(L)

    out = {}
    matched = unmatched = 0
    for row in senate_votes:
        last = normalize_name(row["last"])
        key = (last, row["state"])
        candidates = sen_index.get(key, [])
        if not candidates:
            unmatched += 1
            continue
        target = candidates[0]
        if len(candidates) > 1:
            # Disambiguate by first name initial
            for c in candidates:
                if normalize_name(c["name"]["first"])[:2] == normalize_name(row["first"])[:2]:
                    target = c
                    break
        code = VOTE_CODE.get(row["vote"], None)
        if code is None:
            print(f"  WARN: unknown vote string {row['vote']!r} for {row['last']}")
            continue
        out[target["bioguide_id"]] = code
        matched += 1
    print(f"  senate: matched {matched} currently-serving (of {len(senate_votes)} total votes), {unmatched} historical skipped")
    return out


def convert_house(votes_dict):
    """House votes already keyed by bioguide. Convert vote string to code."""
    out = {}
    for bg, v in votes_dict.items():
        code = VOTE_CODE.get(v, None)
        if code is None:
            print(f"  WARN: unknown vote string {v!r}")
            continue
        out[bg] = code
    return out


def main():
    legislators = json.load(LEG.open())
    keyv = json.load(KEYV.open())
    rc   = json.load(RC.open())

    bills = [
        {
            "id": "caa_dec2020",
            "name": "Consolidated Appropriations Act, 2021 — COVID Relief",
            "short_name": "Dec-2020 COVID",
            "public_law": "P.L. 116-260",
            "congress": 116,
            "year": 2020,
            "date_enacted": "2020-12-27",
            "cbo_10yr_b": 868,
            "cbo_note": "CBO scored the COVID-relief divisions (M & N) at ~$868B over 2021-2030: $184B in Div M + $682B in Div N. The full omnibus also contained FY2021 appropriations; only the COVID portion is attributed here, since trackers including CRFB treat the December 2020 package as the second major pandemic response after CARES.",
            "cbo_source": "cbo_56891",
            "description": "Second major pandemic relief package, attached to the FY2021 omnibus: $600 direct payments, $300/wk expanded unemployment, $325B small-business aid (incl. second-round PPP), $69B vaccine/testing, plus rental assistance and education aid. The bill also funded the federal government through FY2021.",
            "senate_xml": "/tmp/sen_caa.xml",
            "senate_roll_call": {"number": 289, "year": 2020, "congress": 116, "yea": 92, "nay": 6, "result": "Passed", "url": "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1162/vote_116_2_00289.htm"},
            "house_xml": "/tmp/h_caa.xml",
            "house_roll_call": {"number": 251, "year": 2020, "congress": 116, "yea": 359, "nay": 53, "result": "Passed", "url": "https://clerk.house.gov/Votes/2020251"},
            "partisan_pattern": "Strong bipartisan: 92-6 Senate; 359-53 House on the COVID-relief portion (Roll 251). A separate House vote (Roll 250, 327-85) covered the FY2021 funding portion.",
            "wikipedia_url": "https://en.wikipedia.org/wiki/Consolidated_Appropriations_Act,_2021",
            "include_in_score": True,
            "emergency": True,
        },
        {
            "id": "pact_2022",
            "name": "Honoring our PACT Act of 2022",
            "short_name": "PACT Act",
            "public_law": "P.L. 117-168",
            "congress": 117,
            "year": 2022,
            "date_enacted": "2022-08-10",
            "cbo_10yr_b": 277,
            "cbo_note": "CBO scored the conference text at +$277B over 2022-2031: ~$278B in mandatory veterans-healthcare spending offset by ~$1B in revenues. Among the largest non-emergency mandatory expansions of the period.",
            "cbo_source": "cbo_58392",
            "description": "Expanded VA healthcare and disability benefits for ~3.5 million veterans exposed to toxic substances (burn pits, Agent Orange, radiation). Created a presumption-of-service-connection framework. Final law was enacted as S. 3373 after the House passed the Senate-amended bill on July 13, 2022 and the Senate concurred Aug 2, 2022.",
            "senate_xml": "/tmp/sen_pact.xml",
            "senate_roll_call": {"number": 280, "year": 2022, "congress": 117, "yea": 86, "nay": 11, "result": "Passed", "url": "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1172/vote_117_2_00280.htm"},
            "house_xml": "/tmp/h_pact.xml",
            "house_roll_call": {"number": 309, "year": 2022, "congress": 117, "yea": 342, "nay": 88, "result": "Passed", "url": "https://clerk.house.gov/Votes/2022309"},
            "partisan_pattern": "Bipartisan in both chambers: 86-11 Senate (Aug 2, 2022, after a procedural fight over a tax provision); 342-88 House (July 13, 2022).",
            "wikipedia_url": "https://en.wikipedia.org/wiki/Honoring_our_PACT_Act_of_2022",
            "include_in_score": True,
            "emergency": False,
        },
    ]

    # Build entries
    for b in bills:
        print(f"\n=== {b['id']} ===")
        sen_raw = parse_senate_xml(b["senate_xml"])
        sen_map = map_senate_to_bioguide(sen_raw, legislators)
        hou_raw = parse_house_xml(b["house_xml"])
        hou_map = convert_house(hou_raw)
        print(f"  house: {len(hou_map)} member votes")

        rc[b["id"]] = {"senate": sen_map, "house": hou_map}

        keyv_entry = {k: v for k, v in b.items() if not k.endswith("_xml")}
        keyv["votes"].append(keyv_entry)

    # Add new CBO sources
    new_sources = [
        {"id": "cbo_56891", "label": "CBO: Consolidated Appropriations Act 2021 — Division M (COVID Relief) Cost Estimate (Jan 2021)", "url": "https://www.cbo.gov/publication/56891"},
        {"id": "cbo_58392", "label": "CBO: Honoring our PACT Act of 2022 (S. 3373) Cost Estimate (Aug 2022)", "url": "https://www.cbo.gov/publication/58392"},
    ]
    existing_source_ids = {s["id"] for s in keyv["_meta"]["sources"]}
    for s in new_sources:
        if s["id"] not in existing_source_ids:
            keyv["_meta"]["sources"].append(s)

    keyv["_meta"]["last_updated"] = "2026-05-15"

    KEYV.write_text(json.dumps(keyv, indent=2))
    RC.write_text(json.dumps(rc, separators=(",", ":")))
    print(f"\nWrote {KEYV.name} ({KEYV.stat().st_size:,} bytes)")
    print(f"Wrote {RC.name} ({RC.stat().st_size:,} bytes)")
    print(f"Total bills now in key_votes: {len(keyv['votes'])}")


if __name__ == "__main__":
    main()
