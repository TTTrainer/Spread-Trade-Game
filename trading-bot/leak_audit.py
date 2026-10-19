#!/usr/bin/env python3
"""
leak_audit.py -- reject write-ups that could leak the future (protocol §7.2, trial prompt Phase 4).

Flags any line with: a calendar date, a month+year/day, a year inside the data window, a price,
a ticker within a few words of an outcome verb, or a named market event. Conditional rules
("when RSI > 70 with falling volume, the 10-day upper bound was too low") pass.

Usage:
  python3 leak_audit.py trial_03.md                       # audit whole files
  python3 leak_audit.py --since MASTER_LOG.before.md MASTER_LOG.md   # audit only added lines
Exit code 1 if anything is flagged. Review every hit; rewrite it as a conditional rule.
"""
import argparse
import difflib
import re
import sys

TICKERS = ["AAPL", "GOOGL", "AMZN", "MSFT", "NVDA", "META", "TSLA", "JPM", "BA", "COST", "NFLX",
           "AMD", "CRM", "COIN", "GME", "SPY", "DIA", "VIX", "Apple", "Alphabet", "Google", "Amazon",
           "Microsoft", "Nvidia", "Tesla", "JPMorgan", "Boeing", "Costco", "Netflix", "Salesforce",
           "Coinbase", "GameStop"]
ALLOW = {"$100,000"}   # the per-book starting capital is a setting, not a market price

_MONTH = (r"(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|June?|July?|Aug(ust)?|Sep(t(ember)?)?"
          r"|Oct(ober)?|Nov(ember)?|Dec(ember)?)")
PATTERNS = [
    ("date", re.compile(r"\b(19|20)\d{2}[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b")),
    ("date", re.compile(r"\b(0?[1-9]|1[0-2])/(0?[1-9]|[12]\d|3[01])/(\d{2}|\d{4})\b")),
    ("date", re.compile(rf"\b{_MONTH}\.?\s+(\d{{1,2}}(st|nd|rd|th)?\b|'?\d{{2,4}}\b)")),
    ("date", re.compile(r"\b(Q[1-4]|H[12]|FY)\s?'?(20)?2[3-7]\b")),
    ("year", re.compile(r"\b202[4-6]\b")),
    ("price", re.compile(r"\$\s?\d[\d,]*(\.\d+)?[kKmMbB]?")),
    ("price", re.compile(r"\b(at|to|from|near|above|below|hit|reached|topped|bottomed)\s+\d{2,5}(\.\d{1,2})?\b(?!\s*(%|percent|sessions|days|bars|bps|trades|x))")),
    ("event", re.compile(r"\b(FOMC|CPI release|rate (cut|hike)|election|tariffs?|shutdown|DeepSeek|"
                         r"Liberation Day|Jackson Hole|stimulus|bankrupt\w*|antitrust ruling|stock split)\b", re.I)),
]
_OUTCOME = (r"(?i:rall(y|ied|ies)|surg\w*|soar\w*|jump\w*|gap(ped|s)?\s+(up|down)|fell|falls?|drop\w*|"
            r"plung\w*|crash\w*|tank\w*|sank|spik\w*|rose|climb\w*|sell-?off|beat|miss(ed)?|"
            r"broke (out|down)|bottom\w*|top(ped)?)")
# tickers match case-sensitively so "cost", "coin flip" or "ba" in prose are not tickers
TICKER_OUTCOME = re.compile(rf"\b({'|'.join(TICKERS)})\b(\W+\w+){{0,6}}?\W+{_OUTCOME}\b")


def audit_lines(lines, start=1):
    hits = []
    for n, line in enumerate(lines, start):
        text = line
        for a in ALLOW:
            text = text.replace(a, "")
        for kind, pat in PATTERNS:
            for m in pat.finditer(text):
                hits.append((n, kind, m.group(0), line.strip()))
        for m in TICKER_OUTCOME.finditer(text):
            hits.append((n, "ticker+outcome", m.group(0), line.strip()))
    return hits


def audit_text(text):
    return audit_lines(text.splitlines())


def added_lines(old_text, new_text):
    out = []
    sm = difflib.SequenceMatcher(None, old_text.splitlines(), new_text.splitlines(), autojunk=False)
    new = new_text.splitlines()
    for tag, _, _, j1, j2 in sm.get_opcodes():
        if tag in ("insert", "replace"):
            out.extend((j + 1, new[j]) for j in range(j1, j2))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--since", help="older version of the single file given; audit only added lines")
    a = ap.parse_args()
    hits = []
    if a.since:
        old, new = open(a.since, encoding="utf-8").read(), open(a.files[0], encoding="utf-8").read()
        for n, line in added_lines(old, new):
            hits += [(a.files[0],) + h for h in audit_lines([line], n)]
    else:
        for f in a.files:
            hits += [(f,) + h for h in audit_text(open(f, encoding="utf-8").read())]
    for f, n, kind, match, line in hits:
        print(f"{f}:{n}: [{kind}] '{match}'  ->  {line[:140]}")
    print(f"leak audit: {'FAIL' if hits else 'PASS'} ({len(hits)} hit(s))")
    sys.exit(1 if hits else 0)


if __name__ == "__main__":
    main()
