#!/usr/bin/env python3
# Seed d'un scenario de demonstration complet via l'API REST locale.
# UTF-8 propre (urllib) -> accents OK dans les bodies JSON.
import json, urllib.request, urllib.error, uuid, datetime, sys

BASE = "http://localhost:3000/api/v1"

def call(method, path, token=None, body=None, idem=None):
    url = BASE + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    if idem: req.add_header("Idempotency-Key", idem)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode("utf-8")
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        return e.status, (json.loads(raw) if raw else {})

def must(label, status, ok, payload):
    flag = "OK " if status in ok else "FAIL"
    print(f"[{flag}] {label}: HTTP {status}")
    if status not in ok:
        print("       ->", json.dumps(payload, ensure_ascii=False)[:300])
    return status in ok

today = datetime.date.today()
yest = today - datetime.timedelta(days=1)
last_week = today - datetime.timedelta(days=6)

# 1. Coach
s, coach = call("POST", "/auth/register", body={
    "email": "coach.demo@talentx.test", "password": "Password123!",
    "role": "coach", "firstName": "Awa", "lastName": "Diallo"})
must("register coach", s, (201,), coach)
ctok = coach.get("accessToken")
if not ctok: sys.exit("pas de token coach")

# 2. Groupe + code d'invitation
s, grp = call("POST", "/groups", token=ctok, body={
    "name": "Sprint Elite", "description": "Groupe sprint 100/200m"})
must("create group", s, (201,), grp)
gid = grp.get("id")
code = grp.get("inviteCode")
if not code and gid:
    s, ic = call("POST", f"/groups/{gid}/invite-code", token=ctok, body={"action": "regenerate"})
    must("regenerate invite-code", s, (200,), ic)
    code = ic.get("inviteCode")
print("       inviteCode =", code)

# 3. Athlete
s, ath = call("POST", "/auth/register", body={
    "email": "athlete.demo@talentx.test", "password": "Password123!",
    "role": "athlete", "firstName": "Karim", "lastName": "Toure"})
must("register athlete", s, (201,), ath)
atok = ath.get("accessToken")
aid = ath.get("user", {}).get("id")
if not atok: sys.exit("pas de token athlete")

# 4. Consentements athlete (data_processing -> progression ; coach_access -> visibilite coach)
for ct in ("data_processing", "coach_access"):
    s, r = call("PUT", "/users/me/consents", token=atok, body={"type": ct, "granted": True})
    must(f"consent {ct}", s, (200,), r)

# 5. Athlete rejoint le groupe
if code:
    s, jr = call("POST", "/groups/join", token=atok, body={"inviteCode": code})
    must("athlete join group", s, (200, 201), jr)

# 6. Deux seances
def make_session(title, when):
    return call("POST", "/sessions", token=ctok, body={
        "title": title, "scheduledDate": when.isoformat(), "status": "published",
        "exercises": {"schemaVersion": 2, "items": [
            {"name": "30m depart", "order": 1, "type": "sprint", "sets": 3, "reps": 1, "restSeconds": 180},
            {"name": "Gainage", "order": 2, "type": "core", "sets": 3, "durationSeconds": 45},
        ]}})

s, sessA = make_session("Vitesse - departs", today)
must("session A (aujourd'hui)", s, (201,), sessA)
s, sessB = make_session("Test 30m chronometre", last_week)
must("session B (passee)", s, (201,), sessB)

# 7. Affectations
def assign(sess, due):
    sid = sess.get("id")
    return call("POST", f"/sessions/{sid}/assign", token=ctok,
                body={"athleteIds": [aid], "dueDate": due.isoformat()},
                idem=str(uuid.uuid4()))

s, asgA = assign(sessA, today)
must("assign A (due today)", s, (201,), asgA)
s, asgB = assign(sessB, yest)
must("assign B (due hier -> en retard)", s, (201,), asgB)

# 8. Performance sur l'affectation B -> "a revoir" cote coach + progression
asgB_id = None
data = asgB.get("data") if isinstance(asgB, dict) else None
if isinstance(data, list) and data:
    asgB_id = data[0].get("id")
if asgB_id:
    s, perf = call("POST", f"/assignments/{asgB_id}/performance", token=atok, body={
        "results": {"schemaVersion": 2, "items": [
            {"exerciseName": "30m depart", "order": 1, "setResults": [
                {"set": 1, "timeSeconds": 4.21, "completed": True},
                {"set": 2, "timeSeconds": 4.12, "completed": True},
                {"set": 3, "timeSeconds": 4.08, "completed": True},
            ]},
        ]},
        "rpe": 7, "notes": "Bonnes sensations sur le dernier depart."})
    must("submit performance", s, (200, 201), perf)
else:
    print("[WARN] pas d'id d'affectation B -> perf sautee")

# 9. Competition + engagement athlete
s, comp = call("POST", "/competitions", token=ctok, body={
    "name": "Meeting regional de printemps", "discipline": "Sprint",
    "location": "Stade Charlety, Paris", "startDate": (today + datetime.timedelta(days=14)).isoformat(),
    "status": "scheduled"})
ok = must("create competition", s, (201,), comp)
cid = comp.get("id")
if ok and cid:
    s, eng = call("POST", f"/competitions/{cid}/entries", token=ctok,
                  body={"athleteIds": [aid], "eventLabel": "100m"}, idem=str(uuid.uuid4()))
    must("engage athlete in competition", s, (201,), eng)

print("\n=== COMPTES DEMO ===")
print("Coach   : coach.demo@talentx.test / Password123!")
print("Athlete : athlete.demo@talentx.test / Password123!")
print("Invite  :", code)
