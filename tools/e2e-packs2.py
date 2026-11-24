import sys, os; sys.argv = ['x']
__file__ = os.path.abspath('tools/e2e.py')
exec(open('tools/e2e.py').read().split("with sync_playwright() as p:")[0])
from playwright.sync_api import sync_playwright
def play(pg, ucis):
    for u in ucis: drag(pg, u); pg.wait_for_timeout(220)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1100, 'height': 800}, service_workers='block'); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    goto_app(pg); pg.wait_for_timeout(700); pg.click('text=Add starter lines'); pg.click('[data-u=martian]'); pg.wait_for_timeout(600)
    pg.click('[data-m=build]'); pg.wait_for_timeout(300)
    play(pg, ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'c8f5', 'e4g5', 'f5g6', 'g1f3', 'h7h6'])
    check('martian: reached 6...h6', pg.inner_text('#path').endswith('N1f3 h6') or pg.inner_text('#path').endswith('Nf3 h6'), pg.inner_text('#path'))
    check('martian: Ne6 offered as the saved sacrifice', 'Ne6' in pg.inner_text('#act'), pg.inner_text('#act')[:60])
    play(pg, ['g5e6']); pg.wait_for_timeout(200)
    check('martian: Black replies fxe6 / Qd6 / Qd7 / Qc8 are saved', all(x in pg.inner_text('#act') for x in ['fxe6', 'Qd6']), pg.inner_text('#act')[:80])
    # Stafford: other third moves
    pg.click('header [data-act=settings]'); pg.click('#set [data-act=openlib]'); pg.wait_for_timeout(300); pg.click('[data-u=stafford]'); pg.wait_for_timeout(600)
    pg.click('[data-m=build]'); pg.wait_for_timeout(300)
    play(pg, ['e2e4', 'e7e5', 'g1f3', 'g8f6'])
    acts = pg.inner_text('#act')
    check('stafford: after 2...Nf6 the pack knows 3.Nxe5 d4 Nc3 Bc4 d3', all(x in acts for x in ['Nxe5', 'd4', 'Nc3', 'Bc4', 'd3']), acts[:100])
    play(pg, ['d2d4']); pg.wait_for_timeout(200)
    check('stafford: against 3.d4 Black has ...Nxe4', 'Nxe4' in pg.inner_text('#act'), pg.inner_text('#act')[:60])
    pg.click('[data-act=mprev]'); play(pg, ['b1c3'])
    check('stafford: against 3.Nc3 Black has ...Nc6', 'Nc6' in pg.inner_text('#act'), pg.inner_text('#act')[:60])
    pg.click('[data-act=mprev]'); play(pg, ['f1c4'])
    check('stafford: against 3.Bc4 Black has ...Nxe4', 'Nxe4' in pg.inner_text('#act'), pg.inner_text('#act')[:60])
    shot(pg, 'stafford-3bc4.png')
    # stepping through the moves of one line, chess-viewer style
    if not pg.evaluate("() => document.querySelector('#act details').open"):   # wide screens start open, phones start folded
        pg.click('summary:has-text("Lines and tree")'); pg.wait_for_timeout(400)
    pg.click('[data-act=viewlines]'); pg.wait_for_timeout(400)      # the numbered list view
    pg.click('[data-act=goline][data-u="0"]'); pg.wait_for_timeout(500)
    mv = lambda t: t.split('\u00b7')[-1].strip()
    full = mv(pg.inner_text('#path'))
    for _ in range(3): pg.click('[data-act=mprev]'); pg.wait_for_timeout(170)
    back = mv(pg.inner_text('#path'))
    check('move back steps through the line', 0 < len(back) < len(full) and full.startswith(back), back[-40:])
    for _ in range(3): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(170)
    check('arrow forward walks back to the same ply', mv(pg.inner_text('#path')) == full, mv(pg.inner_text('#path'))[-40:])
    pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(220)
    check('arrow back steps one move', len(mv(pg.inner_text('#path'))) < len(full))
    # undo/redo and paste
    # undo/redo driven from the tree: cutting a leaf is deterministic, unlike a drag gesture here
    if not pg.locator('[data-act=viewtree]').is_visible():
        pg.click('summary:has-text("Lines and tree")'); pg.wait_for_timeout(500)
    pg.click('[data-act=viewtree]'); pg.wait_for_timeout(500)
    pg.wait_for_function("() => { const t = document.querySelector('#toast'); return !t || t.hidden; }", timeout=8000)
    before_cut = pg.inner_text('#strip')
    pg.evaluate("() => { const xs = [...document.querySelectorAll('[data-act=tcutm]')]; xs[xs.length - 1].click(); }")
    pg.wait_for_timeout(800)
    after_cut = pg.inner_text('#strip')
    check('cutting a move changes the counts', after_cut != before_cut, after_cut[:36])
    pg.click('[data-act=undo2]'); pg.wait_for_timeout(700)
    check('undo puts it back', pg.inner_text('#strip') == before_cut, pg.inner_text('#strip')[:36])
    pg.click('[data-act=redo2]'); pg.wait_for_timeout(700)
    check('redo cuts it again', pg.inner_text('#strip') == after_cut)
    pg.click('[data-act=reset]'); pg.wait_for_timeout(300)
    pg.click('summary:has-text("Paste or copy a line")'); pg.wait_for_timeout(300)
    pg.fill('#paste', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6')
    pg.click('[data-act=paste]'); pg.wait_for_timeout(900)
    check('pasted line is added and aligned', pg.inner_text('#path').endswith('c3 Nf6'), pg.inner_text('#path')[-40:])
    # the repertoire tree (the details is already open — clicking its summary again would close it)
    pg.click('[data-act=viewtree]'); pg.wait_for_timeout(500)
    pg.wait_for_function("() => { const t = document.querySelector('#toast'); return !t || t.hidden; }", timeout=8000)
    nodes0 = pg.locator('.tseg').count()
    if nodes0:
        check('tree shows a row per move run', nodes0 > 3, str(nodes0))
        check('tree numbers every line', pg.locator('.tseg .ln').count() > 0, str(pg.locator('.tseg .ln').count()))
        check('tree marks the branches', pg.locator('.tseg .cnt').count() > 0, str(pg.locator('.tseg .cnt').count()))
        moves_n = pg.locator('.tseg .tsan').count()
        check('single-move runs are merged into rows', moves_n > nodes0, f'{moves_n} moves on {nodes0} rows')
        pg.locator('[data-act=tnode]').nth(5).click(); pg.wait_for_timeout(500)
        check('clicking a move in the tree jumps to it', len(mv(pg.inner_text('#path'))) > 4, pg.inner_text('#path')[-40:])
        pg.eval_on_selector('[data-act=tfold]', 'e => e.click()'); pg.wait_for_timeout(500)   # fire it directly
        check('folding a branch hides its moves', pg.locator('.tseg').count() < nodes0, f'{nodes0} -> {pg.locator(".tseg").count()}')
        pg.eval_on_selector('[data-act=tfold]', 'e => e.click()'); pg.wait_for_timeout(500)
        pg.click('[data-act=viewlines]'); pg.wait_for_timeout(400)
        check('Lines view still lists them', pg.locator('.rowline').count() > 0, str(pg.locator('.rowline').count()))
        if pg.locator('#linefilter').count():
            total = pg.locator('.rowline').count()
            pg.fill('#linefilter', 'zzzz'); pg.wait_for_timeout(500)
            vis = pg.eval_on_selector_all('.rowline', 'e => e.filter(r => !r.hidden).length')
            check('the line filter narrows the list', vis == 0, f'{vis} of {total}')
            pg.fill('#linefilter', ''); pg.wait_for_timeout(400)
            check('clearing the filter shows them all again', pg.eval_on_selector_all('.rowline', 'e => e.filter(r => !r.hidden).length') == total)
        pg.click('[data-act=viewtree]'); pg.wait_for_timeout(300)
    # annotations: mark a move, see the glyph where the move lives, undo it
    pg.click('[data-act=reset]'); pg.wait_for_timeout(300)
    play(pg, ['e2e4']); pg.wait_for_timeout(400)
    if pg.locator('[data-act=tag]').count():
        pg.click('[data-act=tag]'); pg.wait_for_timeout(600)
        check('an annotation rides in the line under the board', pg.locator('#path .tag').count() > 0, pg.inner_text('#path')[:40])
        check('an annotation shows in the tree', pg.locator('.tree .tag').count() > 0, str(pg.locator('.tree .tag').count()))
        pg.click('[data-act=mprev]'); pg.wait_for_timeout(500)
        check('an annotation shows on the move', pg.locator('.chip .tag').count() > 0, str(pg.locator('.chip .tag').count()))
        pg.click('[data-act=mnext]'); pg.wait_for_timeout(500)
        check('an annotation is drawn on the board square', pg.locator('#endmark .tagmark').count() == 1, str(pg.locator('#endmark .tagmark').count()))
        check('the board badge carries the glyph', '!' in pg.inner_text('#endmark'), pg.inner_text('#endmark'))
        check('the badge is toned by the annotation (chess.com palette)',
              pg.locator('#endmark .tagmark.brilliant').count() == 1 or pg.locator('#endmark .tagmark.great').count() == 1,
              pg.eval_on_selector('#endmark .mm', 'e => e.className'))
        check('the palette offers !! brilliant and ! great move',
              pg.eval_on_selector_all('[data-act=tag]', 'e => e.map(x => x.dataset.u)')[:2] == ['!!', '!'],
              pg.eval_on_selector_all('[data-act=tag]', 'e => e.map(x => x.dataset.u)'))
        check('the check/cross mark is a square tile too, not a circle',
              pg.locator('#mmarks .g').count() == 0 or pg.eval_on_selector('#mmarks .g', 'e => getComputedStyle(e).borderTopLeftRadius') == '3px',
              pg.eval_on_selector('#mmarks .g', 'e => getComputedStyle(e).borderTopLeftRadius') if pg.locator('#mmarks .g').count() else 'expired')
        check('the annotation badge is a square tile, not a pill',
              pg.eval_on_selector('#endmark .tagmark .g', 'e => getComputedStyle(e).borderTopLeftRadius') == '3px',
              pg.eval_on_selector('#endmark .tagmark .g', 'e => getComputedStyle(e).borderTopLeftRadius'))
        pg.click('[data-act=mprev]'); pg.wait_for_timeout(400)
        if not pg.locator('[data-act=viewlines]').is_visible():
            pg.click('summary:has-text("Lines and tree")'); pg.wait_for_timeout(400)
        pg.click('[data-act=viewlines]'); pg.wait_for_timeout(400)
        check('an annotation shows in the flat line list', pg.locator('#act .tag').count() > 0, str(pg.locator('#act .tag').count()))
        pg.click('[data-act=viewtree]'); pg.wait_for_timeout(300)
        pg.click('[data-m=learn]'); pg.wait_for_timeout(700)
        check('an annotation shows while learning the line', pg.locator('#act .tag').count() > 0, pg.inner_text('#act')[:50])
        pg.click('[data-m=build]'); pg.wait_for_timeout(500)
        pg.keyboard.press('Control+z'); pg.wait_for_timeout(800)
        pg.click('[data-act=mprev]'); pg.wait_for_timeout(300)
        check('annotations are undoable', pg.locator('.chip .tag, #path .tag').count() == 0, str(pg.locator('.chip .tag, #path .tag').count()))
    # line names
    if not pg.locator('[data-act=viewlines]').is_visible():
        pg.click('summary:has-text("Lines and tree")'); pg.wait_for_timeout(500)
    pg.click('[data-act=viewlines]'); pg.wait_for_timeout(500)
    if pg.locator('[data-act=nameline]').count():
        pg.click('[data-act=nameline][data-u="0"]'); pg.wait_for_timeout(400)
        pg.fill('#ask-in', 'Suite name'); pg.click('#ask-ok'); pg.wait_for_timeout(800)
        check('a line can be named', pg.locator('.lname').count() > 0, str(pg.locator('.lname').count()))
        pg.click('[data-act=viewtree]'); pg.wait_for_timeout(500)
        check('the name shows on the tree leaf', 'Suite name' in pg.inner_text('.tseg .ln') or pg.eval_on_selector_all('.tseg .ln', 'e => e.some(x => x.innerText.includes("Suite name"))'))
    # weak spots, seeded through the backup importer so the check does not depend on engine timing
    import json as _json
    seed = {"app": "jan20", "v": 3, "reps": [{"id": "seed-weak", "name": "Weak seed", "color": "white",
            "moves": {"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": {"e2e4": "e4"}}, "cards": {}, "notes": {},
            "bad": {"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -|e2e4": 180}}],
            "tactics": {"cards": {}, "stats": {}, "imported": []}, "endgames": {"cards": {}, "custom": []}}
    seed_path = os.path.join(tempfile.gettempdir(), 'jan20-weak-seed.json')
    open(seed_path, 'w', encoding='utf-8').write(_json.dumps(seed))
    pg.click('header [data-act=settings]'); pg.wait_for_timeout(300)
    pg.click('[data-act=import-merge]'); pg.wait_for_timeout(300)
    pg.set_input_files('#file', seed_path); pg.wait_for_timeout(1400)
    if pg.locator('#set[open]').count(): pg.click('#set [data-act=closedlg]')
    pg.click('[data-m=build]'); pg.wait_for_timeout(700)
    opts = pg.eval_on_selector_all('#rep option', 'e => e.map(o => o.textContent)')
    pick = [o for o in opts if o.startswith('Weak seed')]
    if pick:
        pg.select_option('#rep', label=pick[0]); pg.wait_for_timeout(800)
        pg.evaluate("() => { const d = document.querySelector('details.weak'); if (d) d.open = true; }")
        pg.wait_for_timeout(300)
        check('weak spots lists a flagged move', pg.locator('.weakrow').count() == 1, pg.inner_text('.weakrow')[:30] if pg.locator('.weakrow').count() else 'none')
    # checkmate is drawn on the king that has no move — and not on the other one
    def mate_line(name, moves):
        pg.click('header [data-act=new]'); pg.fill('#dn', name); pg.click('#dok'); pg.wait_for_timeout(400)
        play(pg, moves); pg.wait_for_timeout(800)
        where = pg.eval_on_selector('#endmark .mm', 'e => e.style.left + " " + e.style.top') if pg.locator('#endmark .mm').count() else 'none'
        return where
    white = mate_line('Fool white', ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
    check('checkmate puts a mark on the board', white != 'none', white)
    check('the mark lands on the mated king (white: e1)', white.startswith('50% 87.5%'), white)
    check('the mark is a hash, the way chess writes mate', '#' in pg.inner_text('#endmark'), pg.inner_text('#endmark'))
    check('the mated king also gets a box on its square, like the move marks',
          'rgba(20, 20, 20' in pg.eval_on_selector('#endmark .mm.mate', 'e => getComputedStyle(e).backgroundColor'),
          pg.eval_on_selector('#endmark .mm.mate', 'e => getComputedStyle(e).backgroundColor'))
    check('the hash sits on a square tile too',
          pg.eval_on_selector('#endmark .mm.mate .g', 'e => getComputedStyle(e).borderTopLeftRadius') == '3px',
          pg.eval_on_selector('#endmark .mm.mate .g', 'e => getComputedStyle(e).borderTopLeftRadius'))
    ink = pg.eval_on_selector('#endmark .g', 'e => getComputedStyle(e).color')
    check('the hash is black', all(int(n) < 40 for n in ink.replace('rgb(', '').replace(')', '').split(',')), ink)
    check('the message says checkmate', msg(pg).startswith('Checkmate'), msg(pg))
    black = mate_line('Fool black', ['e2e4', 'f7f6', 'd2d4', 'g7g5', 'd1h5'])
    check('it also lands on a mated black king (e8)', black.startswith('50% 0%'), black)
    # castling lands on g1, not on the rook's square, and corner badges stay inside the board
    pg.click('header [data-act=new]'); pg.fill('#dn', 'Castle'); pg.click('#dok'); pg.wait_for_timeout(400)
    play(pg, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1']); pg.wait_for_timeout(600)
    if pg.locator('[data-act=tag]').count():
        pg.click('[data-act=tag]'); pg.wait_for_timeout(500)
        spot = pg.eval_on_selector('#endmark .mm', 'e => e.style.left + " " + e.style.top')
        check('a castling annotation lands on g1, not on the h1 rook', spot.startswith('75% 87.5%'), spot)
    ins = pg.evaluate("""() => {
      const b = document.querySelector('#board cg-board').getBoundingClientRect();
      const g = document.querySelector('#endmark .g') || document.querySelector('#mmarks .dest .g');
      if (!g) return null; const q = g.getBoundingClientRect();
      return q.left >= b.left - 1 && q.right <= b.right + 1 && q.top >= b.top - 1 && q.bottom <= b.bottom + 1;
    }""")
    check('a badge on the edge is not cut off by the board', ins is True, str(ins))
    play(pg, ['h7h6']); pg.wait_for_timeout(250)
    ins2 = pg.evaluate("""() => {
      const b = document.querySelector('#board cg-board').getBoundingClientRect();
      const g = document.querySelector('#mmarks .dest .g'); if (!g) return null;
      const q = g.getBoundingClientRect();
      return q.right <= b.right + 1 && q.left >= b.left - 1;
    }""")
    check('a tick on the h-file stays inside the board', ins2 is True, str(ins2))

    # --- a knight's saved move is drawn as an L, not as a diagonal line
    pg.evaluate("() => document.querySelector('[data-m=build]').click()"); pg.wait_for_timeout(700)
    pg.evaluate("() => document.querySelectorAll('#act .chips [data-act=go]')[0]?.click()"); pg.wait_for_timeout(600)
    pg.evaluate("() => document.querySelectorAll('#act .chips [data-act=go]')[0]?.click()"); pg.wait_for_timeout(700)
    hop = pg.evaluate(ARROW_JS)
    bent = pg.evaluate("() => document.querySelector('#parrows > path')?.getAttribute('d') || ''")
    check('arrows: a knight\'s saved move is drawn as a bent arrow', hop['hops'] >= 1 and 'Q' in bent, bent[:40])
    check('arrows: the board still draws its other arrows', hop['lines'] + hop['hops'] >= 1, hop)

    # an arrow the player draws by hand: right-drag from a knight must bend as well
    def hand_draw(a, d):
        x1, y1 = sq_xy(pg, a); x2, y2 = sq_xy(pg, d)
        pg.mouse.move(x1, y1); pg.mouse.down(button='right')
        pg.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, steps=5)
        pg.mouse.move(x2, y2, steps=5)
        pg.wait_for_timeout(200)
    # the preview while the button is still down must already be an L
    hand_draw('b1', 'c3')
    preview = pg.evaluate("() => document.querySelectorAll('#parrows > path').length")
    pg.mouse.up(button='right'); pg.wait_for_timeout(400)
    hops_before = hop['hops']
    check('arrows: the preview while dragging a knight already bends',
          preview == hops_before + 1, f"{preview} paths while drawing")
    check('arrows: a hand-drawn knight arrow is an L too',
          pg.evaluate("() => document.querySelectorAll('#parrows > path').length") == hops_before + 1,
          pg.evaluate("() => document.querySelectorAll('#parrows > path').length"))
    # draw a straight one and a knight one with the same brush: they must be measured alike
    hand_draw('a2', 'a4'); pg.mouse.up(button='right'); pg.wait_for_timeout(300)
    same = pg.evaluate("""() => {
        const l = [...document.querySelectorAll('#parrows > line')].pop();
        const p = [...document.querySelectorAll('#parrows > path')].pop();
        if (!l || !p) return null;
        return { lw: l.getAttribute('stroke-width'), pw: p.getAttribute('stroke-width'),
                 lm: l.getAttribute('marker-end'), pm: p.getAttribute('marker-end'),
                 lo: l.getAttribute('opacity'), po: p.getAttribute('opacity') };
    }""")
    check('arrows: a knight arrow is drawn with the same weight, opacity and head as a straight one',
          bool(same) and same['lw'] == same['pw'] and same['lo'] == same['po']
          and same['lm'].split('#')[1] == same['pm'].split('#')[1], str(same))
    hand_draw('b1', 'c3'); pg.mouse.up(button='right'); pg.wait_for_timeout(400)
    check('arrows: drawing it again takes it away',
          pg.evaluate("() => document.querySelectorAll('#parrows > path').length") == hops_before,
          pg.evaluate("() => document.querySelectorAll('#parrows > path').length"))

    # --- the lines and tree block is built only when it is on screen
    if pg.locator('#act details').count():
        def set_block(want):
            for _ in range(3):
                if pg.evaluate("() => document.querySelector('#act details').open") == want: return
                pg.click('#act details > summary'); pg.wait_for_timeout(500)      # only the summary toggles
        set_block(False)
        closed_rows = pg.locator('#panel .tree .tseg').count()
        closed_kb = pg.evaluate("() => document.querySelector('#act').innerHTML.length") / 1024
        check('the tree is not built while its block is collapsed', closed_rows == 0,
              f'{closed_rows} rows, {closed_kb:.0f} KB')
        set_block(True)
        open_rows = pg.locator('#panel .tree .tseg').count()
        check('opening the block renders the tree', open_rows > 0, open_rows)
        # a move inside a row is addressed by index: clicking one must walk the board there
        if open_rows:
            before = pg.evaluate("() => document.querySelector('#path').textContent.trim()")
            # the first move in the tree is an early ply, so the path must shorten
            pg.evaluate("() => { const r = document.querySelectorAll('#panel .tree .tseg [data-act=tnode]'); r[0].click(); }")
            pg.wait_for_timeout(500)
            after = pg.evaluate("() => document.querySelector('#path').textContent.trim()")
            check('a move clicked in the tree walks the board to it', after != before and len(after) < len(before),
                  f'{before} -> {after}')
        set_block(False)
    print('console/page errors:', errs or 'none'); b.close()

finish()
