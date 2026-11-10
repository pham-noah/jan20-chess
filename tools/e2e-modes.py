"""Browser tests for Drill, Time Trial, Arena and engine explanations. Needs the built app served at BASE."""
import sys, os; sys.argv = ['x']
__file__ = os.path.abspath('tools/e2e.py')
exec(open('tools/e2e.py').read().split("with sync_playwright() as p:")[0])
from playwright.sync_api import sync_playwright
def play(pg, ucis):
    for u in ucis: drag(pg, u); pg.wait_for_timeout(220)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1100, 'height': 800}, service_workers='block'); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    goto_app(pg); pg.wait_for_timeout(700)
    # a tiny White repertoire: 1.e4 e5 2.Nf3
    pg.click('header [data-act=new]'); pg.fill('#dn', 'Mini'); pg.click('#dok'); pg.wait_for_timeout(300)
    play(pg, ['e2e4', 'e7e5', 'g1f3'])
    # --- explanations on a wrong move in Walk mode
    pg.click('[data-m=learn]'); pg.wait_for_timeout(500)
    check('learn has four modes', pg.locator('.seg button').count() == 4, pg.locator('.seg button').count())
    drag(pg, 'a2a3'); pg.wait_for_timeout(300)
    check('walk: wrong move rejected', 'Not in your repertoire' in msg(pg), msg(pg))
    try:
        pg.wait_for_function("(()=>{const t=document.querySelector('#note').textContent;return /Engine:/.test(t)&&!/Checking/.test(t)})()", timeout=25000); got = True
    except Exception: got = False
    check('walk: engine explanation appears for the mistake', got, pg.inner_text('#note')[:160])
    print('   explanation:', pg.inner_text('#note')[:200].replace('\n', ' '))
    # --- Drill: streak ends on a mistake, best saved
    pg.click('[data-act=lmode][data-u=drill]'); pg.wait_for_timeout(300); pg.click('[data-act=dstart]'); pg.wait_for_timeout(900)
    def correct():  # the right answer depends on which position was drawn: start position -> e4, after 1.e4 e5 -> Nf3
        return 'e2e4' if not pg.inner_text('#path').startswith('1.') else 'g1f3'
    drag(pg, correct()); pg.wait_for_timeout(1400)
    check('drill: a correct move scores', 'Streak 1' in pg.inner_text('#path') or 'lines' in pg.inner_text('#path'), pg.inner_text('#path'))
    # make sure it is my move, then play something wrong
    pg.wait_for_function("document.querySelector('#msg').textContent.startsWith('Your move')||document.querySelector('#msg').textContent.startsWith('Line complete')", timeout=8000); pg.wait_for_timeout(1200)
    pg.wait_for_function("document.querySelector('#msg').textContent.startsWith('Your move')", timeout=8000)
    drag(pg, 'h2h3'); pg.wait_for_timeout(500)
    check('drill: a mistake ends the streak', msg(pg).startswith('Streak over'), msg(pg))
    check('drill: Again button offered', pg.locator('[data-act=dstart]').count() == 1)
    # --- Time trial: starts, clock runs, can be stopped, score saved
    pg.click('[data-act=lmode][data-u=time]'); pg.wait_for_timeout(300); pg.click('[data-act=tstart]'); pg.wait_for_timeout(1000)
    t1 = pg.inner_text('#path'); pg.wait_for_timeout(1500); t2 = pg.inner_text('#path')
    check('time trial: the clock runs', t1 != t2 and 's ·' in t2, f'{t1} -> {t2}')
    pg.wait_for_function("document.querySelector('#msg').textContent.startsWith('Your move')", timeout=8000); drag(pg, correct()); pg.wait_for_timeout(1500)
    pg.click('[data-act=dstop]'); pg.wait_for_timeout(400)
    check('time trial: stop ends the run and reports the score', msg(pg).startswith('Time!'), msg(pg))
    # --- Arena: follow the book, then play on; Stockfish judges
    pg.click('[data-act=lmode][data-u=arena]'); pg.wait_for_timeout(300); pg.click('[data-act=astart]')
    pg.wait_for_function("document.querySelector('#msg').textContent.startsWith('Your move')", timeout=30000)
    cands = ['e2e4', 'g1f3', 'b1c3', 'f1c4', 'd2d3', 'c1e3', 'd1e2', 'e1g1', 'h2h3', 'a2a3', 'b2b3', 'g2g3', 'a1e1', 'c3d5', 'c4b5', 'e3d2']
    ended = False; moves_made = 0
    for rnd in range(14):
        txt = msg(pg)
        if txt.startswith('You won') or txt.startswith('You lost') or txt.startswith('Equal') or txt.startswith('The game') or txt.startswith('Checkmate'): ended = True; break
        if not txt.startswith('Your move'): pg.wait_for_timeout(1500); continue
        before = pg.inner_text('#path')
        for u in cands:
            drag(pg, u); pg.wait_for_timeout(250)
            if msg(pg).startswith('Thinking') or pg.inner_text('#path') != before: break
        try: pg.wait_for_function("t=>{const m=document.querySelector('#msg').textContent;return !m.startsWith('Thinking')}", timeout=40000)
        except Exception: pass
        moves_made += 1; pg.wait_for_timeout(300)
    txt = msg(pg); ended = ended or txt.startswith(('You won', 'You lost', 'Equal'))
    check('arena: the game ends with a verdict from the engine', ended, txt)
    check('arena: rating line and book summary shown', 'rating' in pg.inner_text('#path').lower(), pg.inner_text('#path'))
    pg.screenshot(path='/tmp/shots/arena-end.png')
    print('   arena result:', txt, '|', pg.inner_text('#path'), '|', pg.inner_text('#note')[:120].replace('\n', ' '))
    print('console/page errors:', errs or 'none'); b.close()
print(sum(1 for r in results if r[1]), '/', len(results))
