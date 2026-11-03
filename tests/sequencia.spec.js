/* Sequência: "5 de 7 dias na meta", e dia abaixo do mínimo não conta (#85).

   Antes: dias seguidos com déficit de 90% do planejado, sem limite de cima.
   Comer 500 kcal num dia de cutting contava como meta batida, e um dia sem
   lançamento zerava semanas. Agora a semana do calendário conta com 5 dias
   na meta, a sequência é de semanas, e no cutting o dia com menos de 1.500
   kcal lançadas (1.200 para mulheres) não conta. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase } = require('./app');

/* Sábado, 7 de novembro de 2026, meio-dia. A semana vai de segunda (2) a
   domingo (8); a anterior, de 26/10 a 01/11. */
const AGORA = new Date(2026, 10, 7, 12, 0, 0);
const dia = n => { const d = new Date(AGORA); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const SEG = -5;            // segunda desta semana
const SEG_ANT = SEG - 7;   // segunda da semana passada
const SEG_2 = SEG - 14;

/* estadoBase: homem, GETD 3000, plano 80 → 75 kg em 3 meses: déficit diário
   de ~423 kcal; a meta do dia é ~2.577. Na meta: comer até ~2.619. */
const comida = kcal => [{ id: 'x' + kcal, name: 'Refeição', grams: 100, unit: 'g', base: null, kcal, p: 0, c: 0, g: 0, status: 'consumido' }];
const NA_META = 2000, FORA = 2900, BAIXO = 800;
function estado(dias, goals = {}, extra = {}) {
  const days = {};
  for (const [dk, kcal] of Object.entries(dias)) days[dk] = comida(kcal);
  const st = estadoBase({ days, ...extra });
  const s = JSON.parse(st['cutting.v1']);
  Object.assign(s.goals, { objetivo: 'cutting', inicio: dia(-60) }, goals);
  st['cutting.v1'] = JSON.stringify(s);
  return st;
}
const semana = (seg, kcals) => Object.fromEntries(kcals.map((k, i) => [dia(seg + i), k]).filter(([, k]) => k !== null));

async function abrir(page, st) {
  await page.clock.setFixedTime(AGORA);
  return abrirApp(page, st);
}
const resumo = page => page.evaluate(() => {
  const t = __t.goalTargets(), q = __t.sequencia(t);
  return { n: q.atual.n, y: q.seguidas, dias: q.atual.dias.map(x => x.s) };
});
const irPara = async (page, aba) => {
  await page.evaluate(a => document.querySelector(`#tabbar [data-tab="${a}"]`).click(), aba);
  await page.waitForTimeout(250);
};

test.describe('A conta', () => {

  test('a semana conta com 5 dias na meta, e a sequência é de semanas', async ({ page }) => {
    await abrir(page, estado({
      ...semana(SEG_2, [NA_META, NA_META, NA_META, NA_META, null, null, null]),     // 4: não conta
      ...semana(SEG_ANT, [NA_META, NA_META, NA_META, NA_META, NA_META, null, FORA]), // 5: conta
    }));
    const r = await resumo(page);
    expect(r.y).toBe(1);
    expect(r.n).toBe(0);
  });

  test('um dia sem lançamento não zera as semanas', async ({ page }) => {
    await abrir(page, estado({
      ...semana(SEG_2, [NA_META, NA_META, null, NA_META, NA_META, FORA, NA_META]),
      ...semana(SEG_ANT, [NA_META, null, NA_META, NA_META, NA_META, NA_META, NA_META]),
    }));
    expect((await resumo(page)).y, 'antes, o dia vazio zerava tudo').toBe(2);
  });

  test('no cutting, comer quase nada não conta como meta batida', async ({ page }) => {
    await abrir(page, estado({
      ...semana(SEG_ANT, [NA_META, NA_META, NA_META, NA_META, BAIXO, BAIXO, BAIXO]),
    }));
    expect((await resumo(page)).y, 'com 800 kcal o déficit é enorme, e antes contava').toBe(0);
    expect(await page.evaluate(d => __t.diaSeq(__t.goalTargets(), d), dia(SEG_ANT + 4))).toBe('abaixo');
  });

  test('o piso é 1.500 para homens e 1.200 para mulheres', async ({ page }) => {
    await abrir(page, estado({ [dia(-1)]: 1300 }));
    expect(await page.evaluate(() => __t.pisoKcal())).toBe(1500);
    expect(await page.evaluate(d => __t.diaSeq(__t.goalTargets(), d), dia(-1))).toBe('abaixo');
    await page.evaluate(() => { __t.store.goals.sexo = 'F'; });
    expect(await page.evaluate(() => __t.pisoKcal())).toBe(1200);
    expect(await page.evaluate(d => __t.diaSeq(__t.goalTargets(), d), dia(-1))).toBe('meta');
    await page.evaluate(() => { delete __t.store.goals.sexo; });
    expect(await page.evaluate(() => __t.pisoKcal()), 'sem sexo informado, o de homem').toBe(1500);
  });

  test('hoje nunca é falha: o dia ainda está correndo', async ({ page }) => {
    for (const [kcal, esperado] of [[FORA, 'hoje'], [BAIXO, 'hoje'], [NA_META, 'meta']]) {
      await abrir(page, estado({ [dia(0)]: kcal }));
      expect(await page.evaluate(d => __t.diaSeq(__t.goalTargets(), d), dia(0)), `${kcal} kcal`).toBe(esperado);
    }
    expect(await page.evaluate(d => __t.diaSeq(__t.goalTargets(), d), dia(1))).toBe('futuro');
  });

  test('a semana de agora entra quando fecha os 5, e enquanto não fecha não quebra nada', async ({ page }) => {
    await abrir(page, estado({
      ...semana(SEG_ANT, [NA_META, NA_META, NA_META, NA_META, NA_META, NA_META, NA_META]),
      ...semana(SEG, [NA_META, NA_META, NA_META, FORA, null, null, null]),
    }));
    let r = await resumo(page);
    expect(r.n).toBe(3);
    expect(r.y, 'ainda dá: sábado e domingo pela frente').toBe(1);
    expect(r.dias).toEqual(['meta', 'meta', 'meta', 'fora', 'vazio', 'hoje', 'futuro']);
    await page.evaluate(([a, b]) => {
      const it = k => [{ id: 'y' + k, name: 'R', grams: 1, unit: 'g', base: null, kcal: 2000, p: 0, c: 0, g: 0, status: 'consumido' }];
      __t.store.days[a] = it(a); __t.store.days[b] = it(b);
    }, [dia(SEG + 4), dia(0)]);
    r = await resumo(page);
    expect(r.n).toBe(5);
    expect(r.y).toBe(2);
  });

  test('no bulking não há piso nem teto', async ({ page }) => {
    await abrir(page, estado({ [dia(-1)]: 6000, [dia(-2)]: 800 }, { pesoAlvo: 85, objetivo: 'bulking' }));
    expect(await page.evaluate(d => __t.diaSeq(__t.goalTargets(), d), dia(-1))).toBe('meta');
    expect(await page.evaluate(d => __t.diaSeq(__t.goalTargets(), d), dia(-2)), 'sem superávit, fora').toBe('fora');
  });
});

test.describe('Na tela', () => {

  test('Alimentação: "X de 7 nesta semana", um ponto por dia e as semanas seguidas', async ({ page }) => {
    const erros = await abrir(page, estado({
      ...semana(SEG_ANT, [NA_META, NA_META, NA_META, NA_META, NA_META, null, null]),
      ...semana(SEG, [NA_META, BAIXO, NA_META, null, FORA, null, null]),
    }));
    await irPara(page, 'food');
    const r = await page.evaluate(() => {
      const el = document.getElementById('streakLine');
      return {
        n: el.querySelector('.sn').textContent, st: el.querySelector('.st').textContent,
        pts: [...el.querySelectorAll('.seq-dots i')].map(i => i.className),
        tit: [...el.querySelectorAll('.seq-dots i')].map(i => i.title),
        sub: el.querySelector('.seq-sub').textContent,
        aria: el.querySelector('.seq-pill').getAttribute('aria-label'),
      };
    });
    expect(r.n).toBe('2');
    expect(r.st).toBe('de 7 nesta semana');
    expect(r.pts).toEqual(['sq-meta', 'sq-abaixo', 'sq-meta', 'sq-vazio', 'sq-fora', 'sq-hoje', 'sq-futuro']);
    expect(r.tit[1]).toBe('ter: menos de 1.500 kcal lançadas');
    expect(r.sub).toBe('1 semana seguida');
    expect(r.aria).toContain('2 de 7 dias na meta nesta semana; 1 semana seguida.');
    expect(erros).toEqual([]);
  });

  test('sem semana fechada, a linha diz a regra', async ({ page }) => {
    await abrir(page, estado({ [dia(-1)]: NA_META }));
    await irPara(page, 'food');
    expect(await page.textContent('#streakLine .seq-sub')).toBe('a semana conta com 5 dias na meta');
  });

  test('meta abaixo do piso: a tela explica por que o dia não conta', async ({ page }) => {
    /* GETD 1.800 e déficit de ~423: a meta fica em ~1.377, abaixo dos 1.500. */
    await abrir(page, estado({}, {}, { getd: 1800 }));
    await irPara(page, 'food');
    expect(await page.textContent('#streakLine .seq-sub')).toMatch(/Sua meta de hoje \(1\.\d{3}\) fica abaixo do mínimo que o app usa \(1\.500\): dia com menos de 1\.500 kcal lançadas não conta na sequência\./);
  });

  test('Início: a linha da semana abre o Progresso', async ({ page }) => {
    await abrir(page, estado({
      ...semana(SEG_ANT, [NA_META, NA_META, NA_META, NA_META, NA_META, NA_META, null]),
      ...semana(SEG, [NA_META, NA_META, null, null, null, null, null]),
    }));
    const r = await page.evaluate(() => ({
      vis: !document.getElementById('fdSeq').hidden,
      tx: document.querySelector('#fdSeq .fd-seq-txt').textContent,
      pts: document.querySelectorAll('#fdSeqPts .seq-dots i').length,
      antes: document.getElementById('fdSeq').nextElementSibling.className,
    }));
    expect(r.vis).toBe(true);
    expect(r.tx).toBe('2 de 7 dias na meta1 semana seguida');
    expect(r.pts).toBe(7);
    expect(r.antes, 'logo antes dos atalhos').toBe('fd-atalhos');
    await page.evaluate(() => document.getElementById('fdSeq').click());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.querySelector('.view.on')?.id)).toBe('view-progresso');
  });

  test('sem objetivo, nada aparece', async ({ page }) => {
    const st = estadoBase();
    const s = JSON.parse(st['cutting.v1']); s.goals.meses = 0; st['cutting.v1'] = JSON.stringify(s);
    await abrir(page, st);
    expect(await page.evaluate(() => document.getElementById('fdSeq').hidden)).toBe(true);
  });

  test('o dia abaixo do piso é marcado nas barras e no Histórico, e a soma da semana não muda', async ({ page }) => {
    await abrir(page, estado({ ...semana(SEG, [NA_META, BAIXO, NA_META, null, null, null, null]) }));
    await irPara(page, 'food');
    const r = await page.evaluate(() => ({
      barras: [...document.querySelectorAll('#weekBars .wb')].map(b => b.classList.contains('abaixo')),
      dica: document.getElementById('weekHint').textContent,
      soma: document.getElementById('weekDefVal').textContent,
    }));
    expect(r.barras).toEqual([false, true, false, false, false, false, false]);
    expect(r.dica).toContain('ter: menos de 1.500 kcal lançadas. Entra no déficit, mas não conta na sequência.');
    /* A soma é balanço de energia: os três dias entram com o déficit
       planejado inteiro (o de cada dia é limitado a ele), o de terça junto. */
    const d = await page.evaluate(() => __t.goalTargets().daily);
    expect(r.soma).toBe(`${Math.round(3 * d)} / ${Math.round(7 * d)} kcal`);
    await page.evaluate(() => document.getElementById('histBtn').click());
    await page.waitForSelector('#histOverlay.open');
    const h = await page.evaluate(d => document.querySelector(`#histList [data-k="${d}"]`).textContent, dia(SEG + 1));
    expect(h).toContain('menos de 1.500 kcal lançadas');
  });

  for (const largura of [320, 390]) {
    test(`cabe em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 760 });
      await abrir(page, estado({
        ...semana(SEG_2, [NA_META, NA_META, NA_META, NA_META, NA_META, null, null]),
        ...semana(SEG_ANT, [NA_META, NA_META, NA_META, NA_META, NA_META, NA_META, null]),
        ...semana(SEG, [NA_META, BAIXO, NA_META, NA_META, null, null, null]),
      }));
      const ini = await page.evaluate(() => {
        const b = document.getElementById('fdSeq').getBoundingClientRect();
        const pts = document.querySelector('#fdSeqPts').getBoundingClientRect();
        const cortado = [...document.querySelectorAll('#fdSeq .fd-seq-txt > span, #fdSeqSub')].filter(x => x.scrollWidth > x.clientWidth + 1).length;
        return { bR: b.right, pR: pts.right, cortado, larg: document.documentElement.scrollWidth, vw: innerWidth };
      });
      expect(ini.larg).toBeLessThanOrEqual(ini.vw);
      expect(ini.pR).toBeLessThanOrEqual(ini.bR);
      expect(ini.cortado, 'nenhuma palavra cortada no meio').toBe(0);
      await irPara(page, 'food');
      const al = await page.evaluate(() => {
        const p = document.querySelector('#streakLine .seq-pill').getBoundingClientRect();
        return { pR: p.right, vw: innerWidth, larg: document.documentElement.scrollWidth };
      });
      expect(al.larg).toBeLessThanOrEqual(al.vw);
      expect(al.pR).toBeLessThanOrEqual(al.vw - 8);
    });
  }
});
