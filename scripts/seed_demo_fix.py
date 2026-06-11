#!/usr/bin/env python3
# Complete les 2 etapes manquantes (perf + competition) sur les comptes deja crees.
import json, urllib.request, urllib.error, uuid, datetime, sys

BASE = "http://localhost:3000/api/v1"

def call(method, path, token=None, body=None, idem=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    if idem: req.add_header("Idempotency-Key", idem)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode("utf-8"); return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8"); return e.status, (json.loads(raw) if raw else {})

def must(label, status, ok, payload):
    print(f"[{'OK ' if status in ok else 'FAIL'}] {label}: HTTP {status}")
    if status not in ok: print("       ->", json.dumps(payload, ensure_ascii=False)[:300])
    return status in ok

today = datetime.date.today()

s, coach = call("POST", "/auth/login", body={"email": "coach.demo@talentx.test", "password": "Password123!"})
must("login coach", s, (200,), coach); ctok = coach["accessToken"]
s, ath = call("POST", "/auth/login", body={"email": "athlete.demo@talentx.test", "password": "Password123!"})
must("login athlete", s, (200,), ath); atok = ath["accessToken"]; aid = ath["user"]["id"]

# Trouver l'affectation passee (session "Test 30m chronometre") cote athlete
s, asg = call("GET", "/assignments", token=atok)
must("list assignments", s, (200,), asg)
target = None
for a in asg.get("data", []):
    title = (a.get("session") or {}).get("title", "")
    if "30m chronometre" in title or a.get("status") == "assigned":
        target = a["id"]
        if "30m chronometre" in title: break
print("       assignment cible =", target)

if target:
    s, perf = call("POST", f"/assignments/{target}/performance", token=atok, idem=str(uuid.uuid4()), body={
        "results": {"schemaVersion": 2, "items": [
            {"exerciseName": "30m depart", "order": 1, "setResults": [
                {"set": 1, "timeSeconds": 4.21, "completed": True},
                {"set": 2, "timeSeconds": 4.12, "completed": True},
                {"set": 3, "timeSeconds": 4.08, "completed": True}]}]},
        "rpe": 7, "notes": "Bonnes sensations sur le dernier depart."})
    must("submit performance", s, (200, 201), perf)

s, comp = call("POST", "/competitions", token=ctok, body={
    "name": "Meeting regional de printemps", "discipline": "Sprint",
    "location": "Stade Charlety, Paris",
    "startDate": (today + datetime.timedelta(days=14)).isoformat(),
    "status": "published"})
ok = must("create competition", s, (201,), comp)
cid = comp.get("id")
if ok and cid:
    s, eng = call("POST", f"/competitions/{cid}/entries", token=ctok, idem=str(uuid.uuid4()),
                  body={"athleteIds": [aid], "eventLabel": "100m"})
    must("engage athlete", s, (201,), eng)
print("\nDone.")
