# Integration test for the multi-teacher Edge Functions against a real Postgres + PostgREST.
# It needs a local stack (Postgres 16, PostgREST, a mock Supabase gateway on :54321); see TESTING.md.
# Kept for reference — it is not run by `npm` scripts.
import requests, uuid, json, subprocess, io, struct
G="http://127.0.0.1:54321/functions/v1/"
ANON=open('anon.jwt').read()
H={"apikey":ANON,"Authorization":"Bearer "+ANON,"Origin":"https://x.netlify.app"}
res=[]
def check(name, cond, extra=""):
    res.append(bool(cond)); print(("PASS " if cond else "FAIL ")+name+(" — "+str(extra) if extra and not cond else ""))
def T(action, token=None, **kw):
    h=dict(H); 
    if token: h["x-teacher-token"]=token
    r=requests.post(G+"teacher", json={"action":action,**kw}, headers=h); return r.status_code, r.json()
def S(action, **kw):
    r=requests.post(G+"student", json={"action":action,**kw}, headers=H); return r.status_code, r.json()
def sql(q):
    return subprocess.run(["psql","-h","/tmp","-p","5544","-U","postgres","-d","postgres","-tAc",q],capture_output=True,text=True).stdout.strip()
JPEG="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z"

# ---- registration
c,b=T("teachers"); check("no teachers at start", c==200 and b["teachers"]==[], b)
c,b=T("register", school_code="WRONG", title="Teacher", name="Rina", pin="1111"); check("register with wrong school code refused", c==401, b)
c,b=T("register", school_code="135790", title="Teacher", name="Rina", school="SK Taman Permata", subject="English", welcome_message="Hello 3 Bestari!", pin="1111")
check("first teacher registers with INITIAL_TEACHER_PIN as school code", c==200 and b.get("first") is True, b); A=b.get("token"); Aid=b["teacher"]["id"]
check("first teacher is admin", b["teacher"]["is_admin"] is True, b)
check("first teacher adopted legacy class + submission", sql(f"select count(*) from classes where teacher_id='{Aid}'")=="1" and sql(f"select count(*) from submissions where teacher_id='{Aid}'")=="1")
check("first teacher got a copy of the 24 default words", sql(f"select count(*) from word_bank where teacher_id='{Aid}'")=="24")
check("first teacher inherited old Word of the Day + photo setting", sql(f"select word_of_day->>'word', photo_required from teachers where id='{Aid}'")=="garden|f")
c,b=T("school_update", A, registration_code="SKTP2026"); check("admin sets school code", c==200, b)
c,b=T("register", school_code="135790", title="Cikgu", name="Ali", pin="2222"); check("old INITIAL code no longer registers once school code set", c==401, b)
c,b=T("register", school_code="sktp2026", title="Teacher", name="Rina", pin="2222"); check("duplicate teacher name refused", c==409, b)
c,b=T("register", school_code="sktp2026", title="Cikgu", name="Ali", subject="English", pin="2222"); check("second teacher registers with school code", c==200 and b["teacher"]["is_admin"] is False, b)
B=b["token"]; Bid=b["teacher"]["id"]
c,b=T("teachers"); check("login list shows both teachers, no PIN hashes", [t["display_name"] for t in b["teachers"]]==["Cikgu Ali","Teacher Rina"] and "pin_hash" not in json.dumps(b), b)

# ---- login
c,b=T("login", teacher_id=Bid, pin="1111"); check("teacher B cannot log in with A's PIN", c==401)
c,b=T("login", teacher_id=Bid, pin="2222"); check("teacher B logs in with own PIN", c==200); B=b["token"]

# ---- B sets up own class + words
c,b=T("class_add", B, name="3 Bestari", access_code="ALI123"); check("B can create a class with same name as A's (per-teacher names)", c==200, b)
c,b=T("word_add", B, category="who", text="The cat", is_plural=False); check("B adds word", c==200, b)
c,b=T("update_settings", B, challenge={"title":"Use cat","required_word":"cat"}); check("B sets own challenge", c==200, b)
c,b=T("update_profile", B, title="Cikgu", name="Ali", school="SK Taman Permata", subject="English", welcome_message="Selamat datang!"); check("B updates profile", c==200, b)
c,b=T("set_photo", B, data_url=JPEG); check("B uploads profile photo", c==200, b)
_,sa=T("get_settings", A); _,sb=T("get_settings", B)
check("A sees only A's class", [x["name"] for x in sa["classes"]]==["3 Bestari"] and sa["classes"][0]["access_code"]=="FACTORY1", sa["classes"])
check("B sees only B's class", [x["access_code"] for x in sb["classes"]]==["ALI123"], sb["classes"])
check("A's word bank unaffected by B's new word", not any(w["text"]=="The cat" for w in sa["words"]) and any(w["text"]=="The cat" for w in sb["words"]))
check("admin section only for admin", "admin" in sa and "admin" not in sb)
check("B profile photo url present", bool(sb["profile"]["photo_url"]), sb["profile"])

# ---- student flow
c,b=S("classes"); cls=b["classes"]; check("student class list shows both classes with teacher names", sorted((x["name"],x["teacher_name"]) for x in cls)==[("3 Bestari","Cikgu Ali"),("3 Bestari","Teacher Rina")], cls)
bcls=[x for x in cls if x["teacher_name"]=="Cikgu Ali"][0]; acls=[x for x in cls if x["teacher_name"]=="Teacher Rina"][0]
check("class list has no access codes", "ALI123" not in json.dumps(b) and "FACTORY1" not in json.dumps(b))
c,b=S("verify", class_id=bcls["id"], access_code="FACTORY1"); check("A's code doesn't open B's class", c==401)
c,b=S("verify", class_id=bcls["id"], access_code="ali123"); check("B's code opens B's class with B's words + challenge + welcome", c==200 and any(w["text"]=="The cat" for w in b["words"]) and b["challenge"]["title"]=="Use cat" and b["teacher"]["welcome_message"]=="Selamat datang!", b.get("teacher"))
check("verify does not leak teacher PIN hash", "pin_hash" not in json.dumps(b))
def submit(classid, code, who, photo=True):
    sid=str(uuid.uuid4())
    files={"audio":("v.webm",b"\x1a\x45\xdf\xa3"+b"0"*2000,"audio/webm")}
    if photo: files["photo"]=("p.jpg",b"\xff\xd8\xff"+b"0"*500,"image/jpeg")
    data={"id":sid,"pupil_name":"Amir","class_id":classid,"access_code":code,"who":who,"what":"is reading a book","where":"in the library","when":"after school","audio_duration_ms":"3000"}
    r=requests.post(G+"student", data=data, files=files, headers=H); return sid, r.status_code, r.json()
sid,c,b=submit(bcls["id"],"ALI123","The cat"); check("pupil submits to B's class using B's own word", c==200, b)
_,c,b=submit(acls["id"],"FACTORY1","The cat"); check("B's word rejected in A's class (A doesn't have it)", c==400, b)
sid2,c,b=requests.post and submit(bcls["id"],"ALI123","The cat")[0:3]
c2=requests.post(G+"student", data={"id":sid,"pupil_name":"Amir","class_id":bcls["id"],"access_code":"ALI123","who":"The cat","what":"is reading a book","where":"in the library","when":"after school"}, files={"audio":("v.webm",b"x"*900,"audio/webm"),"photo":("p.jpg",b"\xff\xd8"+b"0"*90,"image/jpeg")}, headers=H)
check("resubmitting same id is idempotent", c2.json().get("duplicate") is True, c2.json())
check("submission stored with B's teacher_id + challenge done", sql(f"select teacher_id, challenge_done from submissions where id='{sid}'")==f"{Bid}|t")

# ---- isolation of submissions
_,la=T("list", A); _,lb=T("list", B)
check("A's list has only A's (legacy) submission", [s["pupil_name"] for s in la["submissions"]]==["Legacy Lina"], la)
check("B's list has only B's 2 submissions", len(lb["submissions"])==2 and all(s["pupil_name"]=="Amir" for s in lb["submissions"]))
_,st=T("stats", A); check("A's stats count only A's", st["total"]==1, st)
c,b=T("get", A, id=sid); check("A cannot open B's submission", c==404, b)
c,b=T("set_status", A, id=sid, status="approved"); check("A cannot approve B's submission", c==404, b)
c,b=T("delete", A, id=sid); check("A's delete of B's submission does nothing", sql(f"select count(*) from submissions where id='{sid}'")=="1")
c,b=T("class_delete", A, id=sql(f"select id from classes where teacher_id='{Bid}'")); check("A cannot delete B's class", sql(f"select count(*) from classes where teacher_id='{Bid}'")=="1")
wid=sql(f"select id from word_bank where teacher_id='{Bid}' and text='The cat'")
T("word_delete", A, id=wid); check("A cannot delete B's word", sql(f"select count(*) from word_bank where id='{wid}'")=="1")
c,b=T("get", B, id=sid); check("B opens own submission with photo + audio URLs", c==200 and b["submission"]["photo_url"] and b["submission"]["audio_url"], b)
c,b=T("set_status", B, id=sid, status="approved"); check("B approves own", c==200)
tok=sql(f"select share_token from submissions where id='{sid}'")
r=requests.post(G+"listen", json={"token":tok}, headers=H).json(); check("QR listen page shows B as teacher + audio url", r.get("teacher_name")=="Cikgu Ali" and r.get("audio_url") and r.get("classroom_name")=="SK Taman Permata", r)
_,g=T("gallery", A); check("A's gallery doesn't show B's approved card", g["submissions"]==[], g)
_,g=T("cards", B); check("B's cards include the approved one", len(g["submissions"])==1)

# ---- admin powers
c,b=T("school_update", B, school_name="Hacked"); check("non-admin cannot change school", c==403, b)
c,b=T("teacher_reset_pin", B, teacher_id=Aid, new_pin="9999"); check("non-admin cannot reset PINs", c==403, b)
c,b=T("teacher_remove", B, teacher_id=Aid); check("non-admin cannot remove teachers", c==403, b)
c,b=T("teacher_set_admin", A, teacher_id=Aid, is_admin=False); check("last admin cannot demote self", c==400, b)
c,b=T("teacher_reset_pin", A, teacher_id=Bid, new_pin="4444"); check("admin resets B's PIN", c==200)
c,b=T("stats", B); check("B's old session is signed out after PIN reset", c==401, b)
c,b=T("login", teacher_id=Bid, pin="4444"); check("B logs in with reset PIN", c==200); B=b["token"]
c,b=T("change_pin", B, current_pin="4444", new_pin="5555"); check("B changes own PIN, gets fresh token", c==200 and b.get("token")); B=b["token"]
c,b=T("stats", B); check("new token works", c==200)
files_before=requests.get("http://127.0.0.1:54321/storage/v1/__files").json()
c,b=T("teacher_remove", A, teacher_id=Bid); check("admin removes teacher B", c==200, b)
files_after=requests.get("http://127.0.0.1:54321/storage/v1/__files").json()
check("B's classes, words, submissions gone", sql(f"select (select count(*) from classes where teacher_id='{Bid}')+(select count(*) from word_bank where teacher_id='{Bid}')+(select count(*) from submissions where teacher_id='{Bid}')")=="0")
check("B's photos, recordings and profile photo deleted from storage", len(files_before)-len(files_after)==5 and not any(Bid in f for f in files_after), (files_before, files_after))
c,b=T("stats", B); check("removed teacher's session rejected", c==401)
c,b=T("teacher_remove", A, teacher_id=Aid); check("admin cannot remove self", c==400)
r=requests.post(G+"listen", json={"token":tok}, headers=H); check("removed teacher's QR codes stop working", r.status_code==404)

# ---- brute force
for i in range(8): T("login", teacher_id=Aid, pin="0000")
c,b=T("login", teacher_id=Aid, pin="1111"); check("after 8 wrong PINs even the right PIN is locked out", c==429, b)
print(f"\n{sum(res)} passed, {len(res)-sum(res)} failed")
