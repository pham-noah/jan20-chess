"""End-to-end checks in headless Chromium. Usage: python3 tools/e2e.py [base_url]"""
import sys, json, re, os, tempfile
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8099/'
STARTER = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'src/tactics/starter.json')))
results, errs = [], []
def goto_app(pg):
    pg.goto(BASE); pg.wait_for_timeout(600)
    if pg.locator('#welcome[open]').count(): pg.click('#welcome [data-act=closedlg]'); pg.wait_for_timeout(250)

def check(name, cond, extra=''):
    results.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra and not cond else ''))

def board(pg):
    bb = pg.locator('#board cg-board').bounding_box(); ori = 'black' if pg.locator('#board.orientation-black').count() else 'white'
    return bb, ori
def sq_xy(pg, sq):
    bb, ori = board(pg); s = bb['width'] / 8; f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if ori == 'white' else 7 - f) + .5; y = ((7 - r) if ori == 'white' else r) + .5
    return bb['x'] + x * s, bb['y'] + y * s
def drag(pg, uci):
    x1, y1 = sq_xy(pg, uci[:2]); x2, y2 = sq_xy(pg, uci[2:4])
    pg.mouse.move(x1, y1); pg.mouse.down(); pg.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, steps=4); pg.mouse.move(x2, y2, steps=4); pg.mouse.up()
def click_sq(pg, name):
    x, y = sq_xy(pg, name); pg.mouse.click(x, y); pg.wait_for_timeout(150)
def legal_dests(pg):
    out = pg.evaluate('''() => {
      const bb = document.querySelector('#board cg-board').getBoundingClientRect();
      const cell = bb.width / 8;
      return [...document.querySelectorAll('#board .move-dest')].map(el => {
        const r = el.getBoundingClientRect();
        const f = Math.floor((r.x + r.width / 2 - bb.x) / cell);
        const rk = Math.floor((r.y + r.height / 2 - bb.y) / cell);
        return 'abcdefgh'[f] + (8 - rk);
      });
    }''')
    return [d for d in out if re.fullmatch(r'[a-h][1-8]', d or '')]
def arrow_uci(pg):
    ln = pg.locator('#board svg.cg-shapes line, #board .cg-shapes line').first
    x1, y1, x2, y2 = [float(ln.get_attribute(k)) for k in ('x1', 'y1', 'x2', 'y2')]
    _, ori = board(pg); dx, dy = x2 - x1, y2 - y1; L = (dx * dx + dy * dy) ** .5 or 1; x2 += dx / L * .3; y2 += dy / L * .3
    def sq(x, y):
        if ori == 'white': f, r = round(x + 3.5), round(3.5 - y)
        else: f, r = round(3.5 - x), round(y + 3.5)
        return 'abcdefgh'[f] + str(r + 1)
    return sq(x1, y1) + sq(x2, y2)
def msg(pg): return pg.inner_text('#msg').strip()
def wait_not(pg, text, ms=15000):
    pg.wait_for_function("t => document.querySelector('#msg').textContent.trim() !== t", arg=text, timeout=ms)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1100, 'height': 800}, service_workers='block', accept_downloads=True)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    goto_app(pg); pg.wait_for_timeout(600)

    # --- Build: own repertoire, castling, notes, persistence
    pg.click('header [data-act=new]'); pg.fill('#dn', 'Test White'); pg.click('#dok'); pg.wait_for_timeout(400)
    for u in ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1']:
        drag(pg, u); pg.wait_for_timeout(250)
    check('build: seven moves saved incl. castling', 'O-O' in pg.inner_text('#path') and pg.inner_text('#path').startswith('1. e4 e5'), pg.inner_text('#path'))
    pg.fill('#note-ed', 'Castle early; king is safe.'); pg.wait_for_timeout(300)
    check('build: last-move highlight on castling is king move', pg.locator('#board square.last-move').count() == 2)
    pg.reload(); pg.wait_for_timeout(900)
    check('persistence: repertoire survives reload', 'Test White' in pg.inner_text('#rep') or 'Test White' in pg.eval_on_selector('#rep', 'e => e.selectedOptions[0].textContent'))
    pg.click('[data-m=learn]'); pg.wait_for_timeout(800)
    drag(pg, 'e2e4'); pg.wait_for_timeout(1500)
    check('learn: correct first move accepted, opponent replies', '1. e4 e5' in pg.inner_text('#path'), pg.inner_text('#path'))
    drag(pg, 'a2a3'); pg.wait_for_timeout(400)
    check('learn: wrong move rejected', 'Not in your repertoire' in msg(pg), msg(pg))
    # --- Review
    pg.click('[data-m=review]'); pg.wait_for_timeout(800)
    pg.click('[data-act=hint]'); pg.wait_for_timeout(300); u = arrow_uci(pg); drag(pg, u); pg.wait_for_timeout(500)
    check('review: hinted move graded and accepted', msg(pg).startswith('Correct'), msg(pg))
    grades = pg.eval_on_selector_all('[data-act=grade]', 'e => e.map(x => x.innerText + (x.className.includes("on") ? "*" : ""))')
    check('review: you grade the card yourself', len(grades) == 4 and any(g.endswith('*') for g in grades), str(grades))
    if len(grades) == 4:
        pg.click('[data-act=grade][data-u="2"]'); pg.wait_for_timeout(900)
        check('review: grading moves to the next card', pg.locator('[data-act=grade]').count() == 0, msg(pg)[:40])
    pg.wait_for_timeout(600)
    # --- Library + notes display
    pg.click('header [data-act=settings]'); pg.click('#set [data-act=openlib]'); pg.wait_for_timeout(300)
    pg.click('[data-u=evans]'); pg.wait_for_timeout(600)
    check('library: Evans added with notes', 'Evans' in pg.eval_on_selector('#rep', 'e => e.selectedOptions[0].textContent'))

    # --- Tactics: solve stored puzzle, wrong move
    pg.click('[data-m=tactics]'); pg.wait_for_timeout(1500)
    pid = None
    # figure out which puzzle is showing by matching the fen via hint arrow -> instead solve with generic loop using stored data:
    # find puzzle by trying to match first expected move after setup using the board position is complex; so use 'Show solution' once, then solve a second one via hint arrows.
    wrong_tested = False
    solved = 0
    for _ in range(5):
        pg.wait_for_function("document.querySelector('#msg').textContent.includes('Find the best')", timeout=8000)
        if not wrong_tested:
            # a legal-but-wrong move, found by asking chessground which squares the piece can reach
            pg.click('[data-act=thint]'); pg.wait_for_timeout(250); good = arrow_uci(pg)
            side = 'white' if 'White' in msg(pg) else 'black'
            mine = pg.evaluate('''(side) => [...document.querySelectorAll('#board piece.' + side)].map(el => {
              const r = el.getBoundingClientRect(), bb = document.querySelector('#board cg-board').getBoundingClientRect();
              const f = Math.round((r.x - bb.x) / (bb.width / 8)), rk = Math.round((r.y - bb.y) / (bb.height / 8));
              return 'abcdefgh'[f] + (8 - rk);
            })''', side)
            ring = ['d4', 'd5', 'e4', 'e5', 'c4', 'c5', 'f4', 'f5', 'b4', 'b5', 'g4', 'g5', 'c3', 'f3', 'c6', 'f6', 'a3', 'h3']
            for frm in mine:
                for to in ring:
                    if to == frm or (frm + to) == good: continue
                    drag(pg, frm + to); pg.wait_for_timeout(170)
                    if msg(pg).startswith('Not that one'): wrong_tested = True; break
                if wrong_tested: break
            if not wrong_tested:
                # last resort: reveal the solution and require it to be graded as a miss
                pg.click('[data-act=tsolution]'); pg.wait_for_timeout(900)
                wrong_tested = 'counted as a miss' in pg.inner_text('#msg') or 'counted as a miss' in pg.inner_text('#note')
                check('tactics: a wrong move is rejected (graded as a miss)', wrong_tested, pg.inner_text('#msg')[:40] + pg.inner_text('#note')[:40])
        for step in range(4):
            pg.click('[data-act=thint]'); pg.wait_for_timeout(250)
            u = arrow_uci(pg); drag(pg, u); pg.wait_for_timeout(300)
            if pg.locator('[data-act=tnext]').count(): break
            pg.wait_for_function("document.querySelector('#msg').textContent.includes('Find the next') || document.querySelector('[data-act=tnext]')", timeout=5000)
            if pg.locator('[data-act=tnext]').count(): break
        if pg.locator('[data-act=tnext]').count() and ('Solved' in msg(pg)): solved += 1
        pg.click('[data-act=tnext]'); pg.wait_for_timeout(1000)
    check('tactics: puzzles solved by following hints (hint-solved)', solved >= 3, solved)
    check('tactics: rating tiles shown', pg.locator('.tile').count() == 3 and 'rating' in pg.inner_text('#act').lower(), pg.inner_text('#act')[:60])
    pg.wait_for_function("document.querySelector('#msg').textContent.includes('Find the best')", timeout=8000)
    # a deliberately wrong move: pick any legal-looking drag from a piece of the side to move is hard; use Show solution path
    pg.click('[data-act=tsolution]'); pg.wait_for_timeout(300)
    check('tactics: show solution displays SAN', msg(pg).startswith('Solution:'), msg(pg))
    pg.click('[data-act=tnext]'); pg.wait_for_timeout(900)

    # --- Endgames: complete a hold drill and a win drill through the UI
    pg.click('[data-m=endgames]'); pg.wait_for_timeout(500)
    def run_drill(did, limit):
        pg.click(f'[data-u={did}]'); pg.wait_for_function("document.querySelector('#msg').textContent.includes('Win this') || document.querySelector('#msg').textContent.includes('Hold the')", timeout=30000)
        for i in range(limit):
            if pg.locator('[data-act=eagain]').count(): break
            pg.click('[data-act=ehint]'); pg.wait_for_function("document.querySelector('#msg').textContent.includes('Hint shown')", timeout=20000)
            u = arrow_uci(pg); drag(pg, u)
            pg.wait_for_timeout(350)
            if pg.locator('[data-act=promo]').count(): pg.click('[data-act=promo][data-u=queen]')
            pg.wait_for_function("t => { const m=document.querySelector('#msg').textContent; return !m.startsWith('Checking') && !m.startsWith('Hint shown') }", timeout=30000)
        return msg(pg)
    # the Endgames tab deals a position now: open the full list first
    if not pg.locator('[data-u=kpk-h4]').is_visible() and pg.locator('[data-act=elist]').count():
        pg.click('[data-act=elist]'); pg.wait_for_timeout(500)
    m1 = run_drill('kpk-h4', 20); check('drill: hold drill completes with success', 'held' in m1.lower() or 'drawn' in m1.lower(), m1)
    pg.click('[data-act=elist]'); pg.wait_for_timeout(400)
    m2 = run_drill('kpk-w3', 20); check('drill: win drill completes with success', m2.startswith('Converted') or m2.startswith('Checkmate'), m2)
    pg.screenshot(path='/tmp/shots/e2e-drill-done.png')
    pg.click('[data-act=elist]'); pg.wait_for_timeout(300)
    if not pg.locator('[data-u=kpk-w3]').is_visible() and pg.locator('[data-act=elist]').count():
        pg.click('[data-act=elist]'); pg.wait_for_timeout(500)
    check('drill: status updated in list (not "new")', pg.locator('[data-u=kpk-w3] .stat').inner_text().strip() != 'new', pg.locator('[data-u=kpk-w3] .stat').inner_text())

    # --- Settings persistence
    pg.click('header [data-act=settings]'); pg.select_option('#s-theme', 'classic'); pg.fill('#s-new', '7'); pg.dispatch_event('#s-new', 'change'); pg.wait_for_timeout(300)
    pg.click('#set [data-act=closedlg]'); pg.reload(); pg.wait_for_timeout(900)
    check('settings: board theme persisted', pg.evaluate("document.documentElement.dataset.theme") == 'classic')

    # --- Backup export and merge import
    # (the Endgames tab deals a fresh position on every re-render, which would overwrite the message)
    pg.click('[data-m=learn]'); pg.wait_for_timeout(600)
    pg.click('header [data-act=settings]')
    with pg.expect_download() as dl: pg.click('#set [data-act=exportall]')
    path = dl.value.path(); data = json.load(open(path))
    check('backup: export has repertoires, tactics and endgames', len(data['reps']) >= 2 and 'cards' in data['tactics'] and 'cards' in data['endgames'], list(data.keys()))
    with pg.expect_file_chooser() as fc: pg.click('#set [data-act=import-merge]')
    fc.value.set_files(path); pg.wait_for_timeout(1200)
    check('backup: merge import reports success', 'merged' in msg(pg).lower(), msg(pg))
    ctx.close()

    # --- Offline via service worker
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='allow'); pg2 = ctx2.new_page()
    goto_app(pg2); pg2.wait_for_function("navigator.serviceWorker.ready.then(()=>true)", timeout=20000); pg2.wait_for_timeout(2500)
    pg2.reload(); pg2.wait_for_timeout(1500)
    ctx2.set_offline(True); pg2.reload(); pg2.wait_for_timeout(1500)
    check('offline: app shell loads with no network', pg2.locator('#board cg-board').count() == 1)
    pg2.click('[data-m=endgames]'); pg2.wait_for_timeout(600)
    if not pg2.locator('[data-u=kqk]').is_visible() and pg2.locator('[data-act=elist]').count():
        pg2.click('[data-act=elist]'); pg2.wait_for_timeout(600)
    pg2.click('[data-u=kqk]')
    try:
        pg2.wait_for_function("document.querySelector('#msg').textContent.includes('Win this')", timeout=30000); ok = True
    except Exception: ok = False
    check('offline: engine starts with no network', ok, msg(pg2))
    ctx2.close()

    # --- Phone with touch: tap-to-move in Build, tab bar visible, no horizontal overflow
    ctx3 = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, service_workers='block'); pg3 = ctx3.new_page()
    goto_app(pg3); pg3.wait_for_timeout(700)
    pg3.click('header [data-act=new]'); pg3.fill('#dn', 'Phone test'); pg3.click('#dok'); pg3.wait_for_timeout(400)
    def tap(sq): x, y = sq_xy(pg3, sq); pg3.touchscreen.tap(x, y); pg3.wait_for_timeout(200)
    tap('e2'); tap('e4'); tap('e7'); tap('e5')
    check('touch: tap-to-move saves moves', pg3.inner_text('#path').startswith('1. e4 e5'), pg3.inner_text('#path'))
    check('phone: no horizontal overflow', pg3.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    check('phone: tab bar fixed at bottom', pg3.evaluate("(()=>{const r=document.querySelector('#tabs').getBoundingClientRect();return Math.abs(r.bottom-window.innerHeight)<2})()"))
    ctx3.close(); b.close()
print('\nconsole/page errors:', errs if errs else 'none')
bad = [r for r in results if not r[1]]
print(f'\n{len(results) - len(bad)}/{len(results)} checks passed')
