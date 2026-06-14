#!/usr/bin/env python3
# Helper de validation live (TLX-134/137/138). Register-or-login, seed scenario,
# emet tokens + IDs en JSON sur la derniere ligne (capturable). UTF-8 propre (urllib).
import json, urllib.request, urllib.error, uuid, datetime, sys

BASE = "http://localhost:3000/api/v1"

def call(method, path, token=None, body=None, idem=None, raw_body=None, headers=None):
    url = BASE + path
    if raw_body is not None:
        data = raw_body
    else:
        data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    if idem: req.add_header("Idempotency-Key", idem)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            b = r.read().decode("utf-8")
            return r.status, (json.loads(b) if b else {})
    except urllib.error.HTTPError as e:
        b = e.read().decode("utf-8")
        try: return e.status, (json.loads(b) if b else {})
        except Exception: return e.status, {"_raw": b[:300]}

def log(label, status, ok, payload):
    flag = "OK " if status in ok else "FAIL"
    print(f"[{flag}] {label}: HTTP {status}", file=sys.stderr)
    if status not in ok:
        print("       ->", json.dumps(payload, ensure_ascii=False)[:300], file=sys.stderr)
    return status in ok

def register_or_login(email, password, role, first, last):
    s, r = call("POST", "/auth/register", body={
        "email": email, "password": password, "role": role,
        "firstName": first, "lastName": last})
    if s == 201:
        log(f"register {role}", s, (201,), r)
        return r.get("accessToken"), r.get("user", {}).get("id")
    # deja existant -> login
    s, r = call("POST", "/auth/login", body={"email": email, "password": password})
    log(f"login {role}", s, (200, 201), r)
    return r.get("accessToken"), r.get("user", {}).get("id")

def main():
    today = datetime.date.today()
    yest = today - datetime.timedelta(days=1)
    last_week = today - datetime.timedelta(days=6)

    ctok, cid = register_or_login("coach.live@talentx.test", "Password123!", "coach", "Awa", "Diallo")
    if not ctok: sys.exit("pas de token coach")
    atok, aid = register_or_login("athlete.live@talentx.test", "Password123!", "athlete", "Karim", "Toure")
    if not atok: sys.exit("pas de token athlete")

    for ct in ("data_processing", "coach_access"):
        s, r = call("PUT", "/users/me/consents", token=atok, body={"type": ct, "granted": True})
        log(f"consent {ct}", s, (200,), r)

    # Groupe (idempotent : si l'athlete est deja membre, join renverra une erreur benigne)
    s, grp = call("POST", "/groups", token=ctok, body={"name": "Sprint Live", "description": "Scenario live"})
    log("create group", s, (201,), grp)
    gid = grp.get("id"); code = grp.get("inviteCode")
    if code:
        s, jr = call("POST", "/groups/join", token=atok, body={"inviteCode": code})
        log("athlete join", s, (200, 201, 409), jr)

    # Une seance + affectation due aujourd'hui (cible saisie de perf offline TLX-137)
    s, sess = call("POST", "/sessions", token=ctok, body={
        "title": "Vitesse live - departs", "scheduledDate": today.isoformat(), "status": "published",
        "exercises": {"schemaVersion": 2, "items": [
            {"name": "30m depart", "order": 1, "type": "sprint", "sets": 3, "reps": 1, "restSeconds": 180,
             "params": {"distanceMeters": 30}},
            {"name": "Gainage", "order": 2, "type": "core", "sets": 3, "durationSeconds": 45},
        ]}})
    log("session", s, (201,), sess)
    sid = sess.get("id")
    asg_id = None
    if sid:
        s, asg = call("POST", f"/sessions/{sid}/assign", token=ctok,
                      body={"athleteIds": [aid], "dueDate": today.isoformat()}, idem=str(uuid.uuid4()))
        log("assign", s, (201,), asg)
        data = asg.get("data") if isinstance(asg, dict) else None
        if isinstance(data, list) and data:
            asg_id = data[0].get("id")

    out = {"coachToken": ctok, "athleteToken": atok, "coachId": cid, "athleteId": aid,
           "groupId": gid, "sessionId": sid, "assignmentId": asg_id}
    print(json.dumps(out))

if __name__ == "__main__":
    main()
