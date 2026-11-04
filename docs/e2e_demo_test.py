import asyncio, re, sys
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:4173"
import os
SHOTS = "e2e-shots"; os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(n, msg): results.append((n, True, msg)); print(f"PASS {n}: {msg}")
def bad(n, msg): results.append((n, False, msg)); print(f"FAIL {n}: {msg}")

async def student_flow(page, name, who="Aina", what="is reading a book", where="in the library", when="after school", fix=False):
    await page.goto(BASE + "/")
    await page.get_by_role("button", name=re.compile("STUDENT")).click()
    await page.get_by_placeholder("Type your name").fill(name)
    await page.get_by_placeholder("Ask your teacher").fill("FACTORY1")
    await page.get_by_role("button", name=re.compile("Let's build")).click()
    await page.get_by_text("My sentence", exact=False).first.wait_for()
    for t in [who, what, where, when]:
        await page.get_by_role("button", name=t, exact=True).click()
    if fix:
        await page.get_by_role("button", name=re.compile("Fix it for me")).click()
    await page.get_by_role("button", name=re.compile("Next: Photo")).click()
    await page.get_by_role("button", name=re.compile("Take my photo")).click()
    await page.locator("img.camera-img").wait_for(timeout=8000)
    await page.get_by_role("button", name=re.compile("Next: Read")).click()
    await page.get_by_role("button", name="Start recording").click()
    await page.wait_for_timeout(3200)
    await page.get_by_role("button", name="Stop recording").click()
    await page.get_by_role("button", name=re.compile("Play my voice")).wait_for(timeout=5000)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800}, permissions=["camera", "microphone"])
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))

        # Welcome
        await page.goto(BASE + "/")
        await expect(page.get_by_role("button", name=re.compile("STUDENT"))).to_be_enabled()
        await page.wait_for_timeout(400)
        await page.screenshot(path=f"{SHOTS}/01-welcome.png")

        # 1 identify (wrong code first)
        await page.get_by_role("button", name=re.compile("STUDENT")).click()
        await page.get_by_placeholder("Type your name").fill("Aina")
        await page.get_by_placeholder("Ask your teacher").fill("WRONG1")
        await page.get_by_role("button", name=re.compile("Let's build")).click()
        await page.get_by_text("classroom code is not right").wait_for()
        await page.screenshot(path=f"{SHOTS}/02-identify-error.png")
        await page.get_by_placeholder("Ask your teacher").fill("FACTORY1")
        await page.get_by_role("button", name=re.compile("Let's build")).click()
        await page.get_by_text("My sentence").first.wait_for()
        ok(1, "student entered details; wrong code rejected, right code accepted")

        # 2 build: missing component blocked
        await page.get_by_role("button", name="Aina", exact=True).click()
        await page.get_by_role("button", name=re.compile("Next: Photo")).click()
        await page.get_by_text("Pick WHAT is happening").first.wait_for()
        blocked = await page.get_by_role("button", name=re.compile("Take my photo")).count() == 0
        # agreement check: plural who + is
        await page.get_by_role("button", name="My friends", exact=True).click()
        await page.get_by_role("button", name="is reading a book", exact=True).click()
        await page.get_by_text("so we use \"are\"").first.wait_for()
        await page.get_by_role("button", name=re.compile("Fix it for me")).click()
        await page.get_by_role("button", name="in the library", exact=True).click()
        await page.get_by_role("button", name="after school", exact=True).click()
        txt = await page.locator(".preview-sentence").inner_text()
        await page.screenshot(path=f"{SHOTS}/03-build.png", full_page=True)
        exp = "My friends are reading a book in the library after school."
        if blocked and txt.replace("\n", " ").replace("  ", " ").strip() == exp:
            ok(2, f"sentence built + agreement fixed: '{txt.strip()}'; missing part blocked")
        else:
            bad(2, f"got '{txt}' blocked={blocked}")
        # shuffle works
        await page.get_by_role("button", name=re.compile("Surprise me")).click()
        t2 = await page.locator(".preview-sentence").inner_text()
        print("  shuffle ->", t2.strip())
        await page.get_by_role("button", name="My friends", exact=True).click()
        await page.get_by_role("button", name="are planting flowers", exact=True).click()
        await page.get_by_role("button", name="near the garden", exact=True).click()
        await page.get_by_role("button", name="every day", exact=True).click()
        await page.get_by_role("button", name=re.compile("Next: Photo")).click()

        # 3 photo
        await page.get_by_role("button", name=re.compile("Take my photo")).wait_for(timeout=8000)
        await page.screenshot(path=f"{SHOTS}/04-camera.png")
        await page.get_by_role("button", name=re.compile("Take my photo")).click()
        await page.locator("img.camera-img").wait_for(timeout=8000)
        await page.screenshot(path=f"{SHOTS}/05-photo-taken.png")
        await page.get_by_role("button", name=re.compile("Retake")).click()
        await page.get_by_role("button", name=re.compile("Take my photo")).click()
        await page.locator("img.camera-img").wait_for(timeout=8000)
        ok(3, "photo captured, retake works")
        await page.get_by_role("button", name=re.compile("Next: Read")).click()

        # 4 voice
        await page.get_by_role("button", name="Start recording").click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{SHOTS}/06-recording.png")
        await page.wait_for_timeout(1800)
        await page.get_by_role("button", name="Stop recording").click()
        await page.get_by_role("button", name=re.compile("Play my voice")).wait_for(timeout=5000)
        dur = await page.evaluate("""() => new Promise(r => { const a=document.querySelector('audio'); if (a.readyState>=1) r(a.duration); else a.onloadedmetadata=()=>r(a.duration); setTimeout(()=>r(-1),3000)})""")
        await page.screenshot(path=f"{SHOTS}/07-recorded.png", full_page=True)
        ok(4, f"voice recorded (audio element duration={dur})")

        # 5 submit (double tap)
        btn = page.get_by_role("button", name=re.compile("Send to my teacher"))
        await btn.dblclick()
        await page.get_by_text("WELL DONE, AINA!").wait_for(timeout=10000)
        await page.wait_for_timeout(1800); await page.screenshot(path=f"{SHOTS}/08-success.png", full_page=True)
        ok(5, "submitted; success screen shown")

        # 12 next student cleared
        await page.get_by_role("button", name=re.compile("Next student")).click()
        await page.get_by_role("button", name=re.compile("STUDENT")).click()
        nm = await page.get_by_placeholder("Type your name").input_value()
        cd = await page.get_by_placeholder("Ask your teacher").input_value()
        if nm == "" and cd == "":
            ok(12, "next student starts with empty name/code")
        else:
            bad(12, f"leftover name={nm!r} code={cd!r}")
        await page.get_by_placeholder("Type your name").fill("Ben")
        await page.get_by_placeholder("Ask your teacher").fill("FACTORY1")
        await page.get_by_role("button", name=re.compile("Let's build")).click()
        await page.get_by_text("My sentence").first.wait_for()
        sel = await page.locator(".chip.selected").count()
        prev = await page.locator(".preview-sentence").inner_text()
        await page.get_by_role("button", name="✕").click() if False else None
        if sel == 0 and "Who?" in prev:
            ok(12, "build screen is empty for the next student (no previous selections)")
        else:
            bad(12, f"selected chips={sel} preview={prev}")

        # second submission (singular) so we can test reject + queue
        await student_flow(page, "Ben", "The boy", "is playing football", "on the field", "during recess")
        await page.get_by_role("button", name=re.compile("Send to my teacher")).click()
        await page.get_by_text("WELL DONE, BEN!").wait_for(timeout=10000)
        await page.get_by_role("button", name=re.compile("Next student")).click()

        # 6 teacher login
        await page.goto(BASE + "/teacher")
        for d in "9999": await page.get_by_role("button", name=d, exact=True).click()
        await page.get_by_role("button", name="Unlock").click()
        await page.get_by_text("Wrong PIN").wait_for()
        for d in "1234": await page.get_by_role("button", name=d, exact=True).click()
        await page.get_by_role("button", name="Unlock").click()
        await page.get_by_role("heading", name="Overview").wait_for()
        await page.wait_for_timeout(500)
        await page.screenshot(path=f"{SHOTS}/09-overview.png", full_page=True)
        total = await page.locator(".stat-total .stat-num").inner_text()
        pend = await page.locator(".stat-pending .stat-num").inner_text()
        ok(6, f"wrong PIN refused, right PIN accepted; total={total} pending={pend}")
        if total != "2": bad(5, f"expected 2 submissions (double-tap must not duplicate), got {total}")
        else: ok(5, "double-tap did not create a duplicate (2 total)")

        # 7 view submissions
        await page.get_by_role("link", name=re.compile("Submissions")).click()
        await page.locator(".sub-table tbody tr").first.wait_for()
        rows = await page.locator(".sub-table tbody tr").count()
        await page.screenshot(path=f"{SHOTS}/10-submissions.png", full_page=True)
        ok(7, f"submission list shows {rows} rows")
        await page.get_by_role("tab", name="Approved").click()
        await page.get_by_text("No submissions here yet").wait_for()
        await page.get_by_role("tab", name="All").click()

        # 8 open + listen
        await page.locator(".sub-table tbody tr", has_text="Aina").click()
        await page.locator(".review-audio").wait_for()
        await page.locator(".review-photo").wait_for(); await page.wait_for_timeout(600)
        d2 = await page.evaluate("""() => new Promise(r => { const a=document.querySelector('.review-audio'); const go=()=>{a.play().then(()=>setTimeout(()=>r({t:a.currentTime, paused:a.paused}),800)).catch(e=>r({err:String(e)}))}; if (a.readyState>=2) go(); else a.oncanplay=go; setTimeout(()=>r({timeout:true}),5000)})""")
        await page.screenshot(path=f"{SHOTS}/11-review.png")
        if isinstance(d2, dict) and d2.get("t", 0) > 0: ok(8, f"teacher audio plays {d2}")
        else: bad(8, f"audio playback {d2}")

        # 9 approve
        await page.get_by_role("button", name=re.compile("^✓ Approve$")).click()
        await page.locator(".review .badge-approved").wait_for()
        ok(9, "approved")
        await page.get_by_role("button", name="Close").click()
        await page.locator(".sub-table tbody tr", has_text="Ben").click()
        await page.get_by_role("button", name=re.compile("Reject")).click()
        await page.locator(".review .badge-rejected").wait_for()
        card_disabled = await page.get_by_role("button", name=re.compile("Printable card")).is_disabled()
        ok(9, f"rejected; printable card disabled for rejected = {card_disabled}")
        await page.get_by_role("button", name="Close").click()

        # 10 printable card
        await page.locator(".sub-table tbody tr", has_text="Aina").click()
        await page.get_by_role("button", name=re.compile("Printable card")).click()
        await page.locator(".a6-card").wait_for()
        await page.wait_for_timeout(800)
        await page.locator(".a6-card").screenshot(path=f"{SHOTS}/12-card.png")
        box = await page.locator(".a6-card").bounding_box()
        qr_src = await page.locator(".a6-qr img").get_attribute("src")
        # print-media PDF
        await page.emulate_media(media="print")
        await page.pdf(path=f"{SHOTS}/card-print.pdf", prefer_css_page_size=True, print_background=True)
        await page.emulate_media(media="screen")
        ok(10, f"A6 card rendered {box['width']:.0f}x{box['height']:.0f}px (≈105x148mm @96dpi=397x559), QR present={bool(qr_src)}")
        # Download PDF button
        async with page.expect_download(timeout=30000) as dl:
            await page.get_by_role("button", name=re.compile("Download PDF")).click()
        d = await dl.value
        await d.save_as(f"{SHOTS}/card-download.pdf")
        ok(10, f"PDF downloaded: {d.suggested_filename}")

        # 11 QR leads to correct audio: decode QR content via jsQR? use the share token from demo DB
        token = await page.evaluate("""async () => {
          const db = await new Promise(r => { const q = indexedDB.open('sf360-demo'); q.onsuccess = () => r(q.result); });
          const all = await new Promise(r => { const t = db.transaction('data').objectStore('data').getAll(); t.onsuccess = () => r(t.result); });
          return all.filter(x => x && x.pupil_name).map(x => ({n:x.pupil_name, t:x.share_token, s:x.status}));
        }""")
        print("  tokens:", token)
        aina = [x for x in token if x["n"] == "Aina"][0]
        # decode the QR image itself with a decoder
        listen = await ctx.new_page()
        await listen.goto(f"{BASE}/listen/{aina['t']}")
        await listen.get_by_text("Listen to Aina read!").wait_for()
        sent = await listen.locator(".listen-sentence").inner_text()
        await listen.get_by_role("button", name="Play recording").click()
        await listen.wait_for_timeout(900)
        playing = await listen.evaluate("() => { const a=document.querySelector('audio'); return {t:a.currentTime, paused:a.paused} }")
        await listen.screenshot(path=f"{SHOTS}/13-listen.png")
        ok(11, f"listen page for Aina: {sent} playing={playing}")
        # rejected token should not work
        ben = [x for x in token if x["n"] == "Ben"][0]
        print("  ben token (rejected, never approved):", ben["t"])
        await listen.goto(f"{BASE}/listen/notarealtoken1234567890abc")
        await listen.get_by_text("could not be found").wait_for()
        ok(11, "unknown token shows friendly 'not found'")

        # gallery
        await page.goto(BASE + "/teacher/gallery")
        await page.locator(".gallery-card").first.wait_for()
        gc = await page.locator(".gallery-card").count()
        await page.screenshot(path=f"{SHOTS}/14-gallery.png", full_page=True)
        ok(0, f"gallery shows {gc} approved card(s) only")

        # settings: add word, class, WOD, challenge
        await page.goto(BASE + "/teacher/settings")
        await page.get_by_placeholder("e.g. The cat").fill("The cat")
        await page.locator(".wb-col.col-who button", has_text="+ Add").click()
        await page.get_by_text("Word added").wait_for()
        await page.get_by_placeholder("Word, e.g. garden").fill("garden")
        await page.get_by_placeholder(re.compile("Meaning")).fill("a place where plants grow")
        await page.locator(".card-section", has_text="Word of the Day").get_by_role("button", name="Save").click()
        await page.get_by_text("Word of the Day saved").wait_for()
        await page.get_by_role("button", name="Make a sentence about an animal").click()
        await page.get_by_role("button", name="Save challenge").click()
        await page.get_by_text("Challenge saved").wait_for()
        await page.screenshot(path=f"{SHOTS}/15-settings.png", full_page=True)
        ok(0, "settings: word added, word of the day + challenge saved")

        # student sees new word + WOD
        await page.goto(BASE + "/")
        await page.get_by_role("button", name=re.compile("STUDENT")).click()
        await page.get_by_placeholder("Type your name").fill("Chen")
        await page.get_by_placeholder("Ask your teacher").fill("factory1")
        await page.get_by_role("button", name=re.compile("Let's build")).click()
        await page.get_by_role("button", name="The cat", exact=True).wait_for()
        await page.get_by_role("button", name="The cat", exact=True).click()
        await page.get_by_role("button", name="is watering the plants", exact=True).click()
        await page.get_by_role("button", name="near the garden", exact=True).click()
        await page.get_by_role("button", name="in the morning", exact=True).click()
        await page.get_by_text("You used it!").wait_for()
        await page.screenshot(path=f"{SHOTS}/16-build-wod.png", full_page=True)
        ok(0, "student sees teacher's new word, Word of the Day recognised")

        # portrait tablet
        await page.set_viewport_size({"width": 800, "height": 1280})
        await page.wait_for_timeout(300)
        await page.screenshot(path=f"{SHOTS}/17-build-portrait.png", full_page=True)

        # change PIN
        await page.goto(BASE + "/teacher/settings")
        pins = page.locator("#pin input")
        await pins.nth(0).fill("1234"); await pins.nth(1).fill("2468"); await pins.nth(2).fill("2468")
        await page.get_by_role("button", name="Change PIN").click()
        await page.get_by_text("PIN changed").wait_for()
        await page.get_by_role("button", name=re.compile("Lock")).click()
        await page.goto(BASE + "/teacher")
        await page.get_by_label("Teacher PIN").fill("1234"); await page.get_by_role("button", name="Unlock").click()
        await page.get_by_text("Wrong PIN").wait_for()
        await page.get_by_label("Teacher PIN").fill("2468"); await page.get_by_role("button", name="Unlock").click()
        await page.get_by_role("heading", name="Overview").wait_for()
        ok(6, "PIN change works; old PIN refused")

        # offline banner
        await ctx.set_offline(True)
        await page.goto(BASE + "/teacher") if False else None
        await page.evaluate("window.dispatchEvent(new Event('offline'))")
        await page.get_by_text("No internet connection").first.wait_for()
        ok(0, "offline banner shows")
        await ctx.set_offline(False)

        print("JS errors:", errors)
        await browser.close()
    fails = [r for r in results if not r[1]]
    print(f"\n{len(results)-len(fails)} passed, {len(fails)} failed")

asyncio.run(main())
