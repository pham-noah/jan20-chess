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
    # --- Drill: whole lines, short first, a miss restarts the line without leaving the drill
    pg.click('[data-act=lmode][data-u=drill]'); pg.wait_for_timeout(900)
    check('drill: starts by itself, with no start button', pg.locator('[data-act=dstart]').count() == 0
          and pg.locator('[data-act=dstop]').count() == 1)
    d0 = pg.evaluate("() => window.__jan20().drill")
    check('drill: the first line is the shortest one available',
          len(d0['line'].split()) == d0['cap'], f"line {len(d0['line'].split())} plies, cap {d0['cap']}")
    check('drill: the line starts at move one', d0['at'] == 0 and d0['line'].split()[0] == 'e2e4', d0['line'][:20])
    moves = d0['line'].split()
    for i in range(0, min(len(moves), 6), 2):          # play up to three of my moves
        drag(pg, moves[i]); pg.wait_for_timeout(900)
    prog = pg.evaluate("() => window.__jan20().drill")
    check('drill: playing the line on scores it', prog['streak'] >= 1 or prog['clean'] >= 1, pg.inner_text('#path'))
    pg.wait_for_timeout(900)
    same = pg.evaluate("() => window.__jan20().drill")['line']
    drag(pg, 'd2d4' if not same.startswith('d2d4') else 'h2h3'); pg.wait_for_timeout(500)   # legal, not in the book
    check('drill: a wrong move restarts the line, it does not end the drill',
          'Starting the line again' in msg(pg), msg(pg)[:60])
    pg.wait_for_timeout(2400)
    d1 = pg.evaluate("() => window.__jan20().drill")
    check('drill: it restarts the same line from move one', d1['active'] and d1['at'] == 0 and d1['line'] == same,
          f"active {d1['active']}, at {d1['at']}")
    check('drill: the run is reset but the drill goes on', d1['streak'] == 0 and d1['clean'] == 0
          and pg.locator('[data-act=dstop]').count() == 1)

    # --- arrows look back on any board (here: a drill, after the line has advanced)
    d2 = pg.evaluate("() => window.__jan20().drill")
    drag(pg, d2['line'].split()[0]); pg.wait_for_timeout(900)
    live = pg.evaluate("() => window.__jan20()")
    pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(300)
    back = pg.evaluate("() => window.__jan20()")
    check('arrows: left shows the previous position', back['boardFen'] != live['boardFen'] and back['back'] >= 1,
          f"back {back['back']}")
    check('arrows: looking back does not touch the game', back['fen'] == live['fen'] and back['drill']['at'] == live['drill']['at'])
    locked = pg.evaluate("""() => { const d = document.querySelector('#board .move-dest'); return !d; }""")
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300)
    home = pg.evaluate("() => window.__jan20()")
    check('arrows: right returns to the live position', home['boardFen'] == live['boardFen'] and home['back'] == 0,
          home['back'])
    check('arrows: the past position cannot be played on', locked is True)
    # --- Time trial: starts, clock runs, can be stopped, score saved
    pg.click('[data-act=lmode][data-u=time]'); pg.wait_for_timeout(300); pg.click('[data-act=tstart]'); pg.wait_for_timeout(1000)
    t1 = pg.inner_text('#path'); pg.wait_for_timeout(1500); t2 = pg.inner_text('#path')
    check('time trial: the clock runs', t1 != t2 and 's ·' in t2, f'{t1} -> {t2}')
    pg.wait_for_timeout(1200)                 # let the clock run a moment longer
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
    shot(pg, 'arena-end.png')
    print('   arena result:', txt, '|', pg.inner_text('#path'), '|', pg.inner_text('#note')[:120].replace('\n', ' '))

    # Lessons: a catalogue that explains, and opens the thing that practises it
    pg.click('[data-m=lessons]'); pg.wait_for_timeout(800)
    check('lessons: the tab lists ideas with instructions', pg.locator('.lesson').count() >= 20, str(pg.locator('.lesson').count()))
    check('lessons: each card names its idea in one line', pg.locator('.lesson .lidea').count() >= 20, str(pg.locator('.lesson .lidea').count()))
    check('lessons: the card carries the position it opens on, for the hover preview',
          pg.locator('.lesson[data-prev]').count() >= 20, str(pg.locator('.lesson[data-prev]').count()))
    check('lessons: endgames are taught here too', pg.locator('.lesson:has-text("Lucena")').count() == 1)
    pg.click('[data-u=fork]'); pg.wait_for_timeout(900)
    check('lessons: a lesson opens as a chapter in this tab, not a jump to Tactics',
          pg.get_attribute('[data-m=lessons]', 'aria-current') == 'page' and pg.locator('#act .lstep').count() == 3,
          pg.locator('#act .lstep').count())
    tiers = pg.eval_on_selector_all('#act .lstep .tier', 'e => e.map(x => x.textContent.trim())')
    check('lessons: the chapter goes from basics to advanced to a real game',
          tiers == ['Basics', 'Advanced', 'Real game'], tiers)
    fens = pg.eval_on_selector_all('#act .lstep', 'e => e.map(x => x.dataset.prev || "")')
    check('lessons: every step carries its own position', all(fens) and len(set(fens)) == 3, len(set(fens)))
    start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
    first = pg.evaluate("() => window.__jan20().fen")
    check('lessons: the chapter opens showing the first step', first != start, first[:30])
    pg.hover('#act .lstep >> nth=2'); pg.wait_for_timeout(400)
    third = pg.evaluate("() => window.__jan20().fen")
    check('lessons: hovering the real-game step puts it on the board', third != first, third[:30])
    pg.evaluate("() => document.querySelectorAll('#act .lstep')[2].click()"); pg.wait_for_timeout(1400)
    played = pg.evaluate("() => window.__jan20().fen")
    check("lessons: showing a step walks its solution on the board", played != third, played[:30])
    check('lessons: the chapter has a way back', pg.locator('[data-act=lback]').count() == 1)
    pg.evaluate("() => document.querySelector('[data-act=lstart]').click()"); pg.wait_for_timeout(1600)
    check('lessons: practising opens a short set of that idea',
          'Find the best' in msg(pg) and pg.locator('[data-act=lback]').count() == 1, msg(pg)[:40])
    pg.evaluate("() => document.querySelector('[data-act=lback]').click()"); pg.wait_for_timeout(700)
    check('lessons: back returns to the list', pg.locator('.lesson').count() >= 20, str(pg.locator('.lesson').count()))
    pg.click('.lesson:has-text("Lucena")'); pg.wait_for_timeout(900)
    pg.evaluate("() => document.querySelector('[data-act=lstart]').click()"); pg.wait_for_timeout(2600)
    check('lessons: an endgame lesson runs its drill inside the chapter',
          'Lucena' in pg.inner_text('#path') and pg.get_attribute('[data-m=lessons]', 'aria-current') == 'page',
          pg.inner_text('#path')[:40])
    # Endgames deals a position instead of asking
    pg.click('[data-m=learn]'); pg.wait_for_timeout(500)
    pg.click('[data-m=endgames]'); pg.wait_for_timeout(2600)
    check('endgames: the tab deals a position by itself', pg.locator('#act [data-act=erandom]').count() == 1, ' '.join(pg.inner_text('#act').split())[:50])
    check('endgames: a position is on the board', pg.eval_on_selector_all('#board piece', 'e => e.length') >= 3,
          pg.eval_on_selector_all('#board piece', 'e => e.length'))
    # --- show, don't tell: the board carries the information the copy used to
    pg.click('[data-m=endgames]'); pg.wait_for_timeout(900)
    if pg.locator('[data-act=elist]').count(): pg.click('[data-act=elist]'); pg.wait_for_timeout(700)
    check('endgames: the list carries no unreadable stamps', pg.locator('.item .thumb, svg.mini').count() == 0)
    sig = "() => [...document.querySelectorAll('#board piece')].map(p => p.className).sort().join(',')"
    pg.hover('[data-act=edrill] >> nth=0'); pg.wait_for_timeout(500); a = pg.evaluate(sig)
    pg.hover('[data-act=edrill] >> nth=2'); pg.wait_for_timeout(500); b2 = pg.evaluate(sig)
    check('endgames: hovering a drill puts its position on the board', bool(a) and a != b2, (a[:60], b2[:60]))
    pg.hover('[data-act=edrill] >> nth=0'); pg.wait_for_timeout(400)
    check('endgames: moving off a row restores the other position', pg.evaluate(sig) == a)
    pg.click('header [data-act=settings]'); pg.wait_for_timeout(800)
    check('settings: a live board shows appearance, pieces and coordinates', pg.locator('#setprev.cg-wrap').count() == 1)
    check('settings: the preview really has a position on it', pg.eval_on_selector_all('#setprev piece', 'e => e.length') >= 20,
          pg.eval_on_selector_all('#setprev piece', 'e => e.length'))
    pg.click('#set [data-act=closedlg]'); pg.wait_for_timeout(200)
    print('console/page errors:', errs or 'none'); b.close()
finish()
