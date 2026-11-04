/* Tendência do peso no lugar da pesagem do dia (#84).

   A balança oscila de um dia para o outro mais do que a gordura muda numa
   semana. O veredito "No ritmo / Atrasado" lia a pesagem crua, com
   tolerância menor que essa oscilação, e o cartão "Atualizar / Manter"
   insistia a cada dia inchado. Agora os dois leem a tendência: média
   exponencial de 10% por dia, com o intervalo entre as pesagens
   descontado, que recomeça no peso de partida. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO } = require('./app');

/* estadoBase: homem, 30 anos, 180 cm, 80 kg, rotina 1,5, GETD 3000.
   Plano: 80 → 72 kg em 3 meses, começado há 30 dias. */
const PLANO = { pesoAtual: 80, pesoAlvo: 72, meses: 3, objetivo: 'cutting' };
const base = (goals = {}, extra = {}) => {
  const st = estadoBase(extra);
  const s = JSON.parse(st['cutting.v1']);
  Object.assign(s.goals, { inicio: diaISO(30), pesoDesde: diaISO(30) }, PLANO, goals);
  st['cutting.v1'] = JSON.stringify(s);
  return st;
};
/* A linha do plano no dia d (dias atrás): 80 − 8 × fração do prazo. */
const DIAS_PRAZO = 3 * 30.44;
const noPlano = atras => 80 - 8 * Math.min(1, (30 - atras) / DIAS_PRAZO);
const r1 = v => Math.round(v * 10) / 10;

const clicar = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const progresso = async page => {
  await clicar(page, '#fdIrProgresso');
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const el = document.getElementById('weightChart');
    const k = [...el.querySelectorAll('.wt-stats .k')].map(x => x.textContent);
    const v = [...el.querySelectorAll('.wt-stats .v')].map(x => x.textContent);
    return {
      txt: el.textContent,
      ritmo: (el.querySelector('.wt-pace') || {}).textContent || '',
      tend: (el.querySelector('.wt-trend') || {}).textContent || '',
      nota: (el.querySelector('.wt-nota') || {}).textContent || '',
      stats: Object.fromEntries(k.map((x, i) => [x, v[i]])),
      path: (el.querySelector('path.wt-tend') || { getAttribute: () => '' }).getAttribute('d'),
      pontos: el.querySelectorAll('svg circle').length,
    };
  });
};
const cartao = page => page.evaluate(() => { const c = document.getElementById('fdAjuste'); return c.hidden ? null : c.textContent; });

test.describe('A conta da tendência', () => {

  test('cada pesagem puxa 10% por dia de intervalo, descontado', async ({ page }) => {
    await abrirApp(page, base());
    const r = await page.evaluate(() => ({
      um: __t.tendenciaDe([{ d: '2026-10-01', w: 80 }, { d: '2026-10-02', w: 81 }]).map(x => x.t),
      semana: __t.tendenciaDe([{ d: '2026-10-01', w: 80 }, { d: '2026-10-08', w: 81 }]).map(x => x.t),
      alfa: __t.TEND_ALFA,
    }));
    expect(r.alfa).toBe(0.1);
    expect(r.um[0], 'a primeira pesagem é a tendência').toBe(80);
    expect(r.um[1]).toBeCloseTo(80.1, 6);
    expect(r.semana[1], 'uma semana sem pesar: a nova vale 1 − 0,9^7').toBeCloseTo(80 + (1 - Math.pow(0.9, 7)), 6);
  });

  test('recomeça no peso de partida: a pesagem de antes não puxa a de agora', async ({ page }) => {
    await abrirApp(page, base({ pesoAtual: 80, pesoDesde: diaISO(5), inicio: diaISO(5) }, {
      weights: [{ d: diaISO(10), w: 90 }, { d: diaISO(8), w: 90 }, { d: diaISO(4), w: 80 }, { d: diaISO(2), w: 80.2 }],
    }));
    const t = await page.evaluate(() => __t.tendenciaAtual());
    expect(t.n).toBe(2);
    expect(t.w).toBe(r1(80 + (1 - Math.pow(0.9, 2)) * 0.2));
    const p = await progresso(page);
    expect(p.stats['Tendência']).toBe('80 kg');
    expect((p.path.match(/M /g) || []).length, 'a linha não atravessa o recomeço').toBe(2);
    expect(p.pontos, 'as pesagens continuam como pontos').toBe(4);
  });
});

test.describe('O veredito do Progresso', () => {

  test('quem está exatamente no plano está "No ritmo", apesar do atraso da tendência', async ({ page }) => {
    /* Perdendo 0,6 kg por semana, a tendência anda ~0,8 kg acima da
       balança. Comparada direto com o plano de hoje, diria "Atrasado" para
       sempre. O app compara com o plano filtrado do mesmo jeito. */
    const weights = [];
    for (let a = 29; a >= 0; a--) weights.push({ d: diaISO(a), w: r1(noPlano(a)) });
    await abrirApp(page, base({}, { weights }));
    const p = await progresso(page);
    expect(p.ritmo).toBe('No ritmo do plano, pela tendência');
    const t = await page.evaluate(() => __t.tendenciaAtual().w);
    expect(t - weights[weights.length - 1].w, 'a tendência atrasa: é por isso a comparação filtrada').toBeGreaterThan(0.5);
  });

  test('acima do plano, pela tendência, é "Atrasado"; abaixo, "Adiantado"', async ({ page }) => {
    const acima = [], abaixo = [];
    for (let a = 13; a >= 0; a--) { acima.push({ d: diaISO(a), w: r1(noPlano(a) + 1.5) }); abaixo.push({ d: diaISO(a), w: r1(noPlano(a) - 1.5) }); }
    await abrirApp(page, base({}, { weights: acima }));
    let p = await progresso(page);
    expect(p.ritmo).toMatch(/^Atrasado: 1,5 kg acima do plano, pela tendência$/);
    await page.evaluate(w => { __t.store.weights = w; }, abaixo);
    await page.evaluate(() => document.querySelector('[data-volta]').click());
    p = await progresso(page);
    expect(p.ritmo).toMatch(/^Adiantado: 1,5 kg à frente do plano, pela tendência$/);
  });

  test('um dia inchado no meio de uma semana no plano não vira "Atrasado"', async ({ page }) => {
    const weights = [];
    for (let a = 13; a >= 0; a--) weights.push({ d: diaISO(a), w: r1(noPlano(a) + (a === 0 ? 1.6 : 0)) });
    await abrirApp(page, base({}, { weights }));
    const p = await progresso(page);
    expect(p.ritmo, 'pela balança crua seriam 1,6 kg acima').toBe('No ritmo do plano, pela tendência');
  });

  test('com menos de 3 pesagens em 14 dias, não há veredito nem previsão', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: diaISO(20), w: 79 }, { d: diaISO(9), w: 78.5 }, { d: diaISO(2), w: 78 }] }));
    let p = await progresso(page);
    expect(p.ritmo).toBe('Para saber se está no ritmo do plano, pese-se 3 vezes em 14 dias (2 pesagens até agora).');
    expect(p.nota).not.toContain('Pela tendência');
    await page.evaluate(d => { __t.store.weights.push({ d, w: 77.8 }); }, diaISO(0));
    await page.evaluate(() => document.querySelector('[data-volta]').click());
    p = await progresso(page);
    expect(p.ritmo).toMatch(/pela tendência$/);
  });

  test('"desde o início do plano" é a tendência menos o peso de partida', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: diaISO(3), w: 78 }, { d: diaISO(1), w: 77.6 }] }));
    const t = await page.evaluate(() => __t.tendenciaAtual().w);
    const p = await progresso(page);
    expect(p.tend).toBe(`↓ Descendo · ${String(r1(t - 80)).replace('.', ',')} kg desde o início do plano`);
    expect(p.stats['Faltam']).toBe(String(r1(t - 72)).replace('.', ',') + ' kg');
  });
});

test.describe('Os números embaixo da curva', () => {

  test('"Prazo" é o do plano; a previsão vem da tendência', async ({ page }) => {
    const weights = [];
    for (let a = 29; a >= 0; a--) weights.push({ d: diaISO(a), w: r1(noPlano(a)) });
    await abrirApp(page, base({}, { weights }));
    const p = await progresso(page);
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const mesAno = d => meses[d.getMonth()] + '/' + String(d.getFullYear()).slice(2);
    const fim = new Date(); fim.setDate(fim.getDate() - 30); fim.setTime(fim.getTime() + 3 * 30.44 * 86400000);
    expect(p.stats['Prazo']).toBe(mesAno(fim));
    expect(Object.keys(p.stats)).not.toContain('Previsão');
    /* No plano, a tendência chega à meta uns 9 dias depois do prazo. */
    const possiveis = [55, 65, 75, 85].map(n => { const d = new Date(); d.setDate(d.getDate() + n); return mesAno(d); });
    const m = p.nota.match(/Pela tendência, a meta chega em (\w{3}\/\d{2})\./);
    expect(m, p.nota).toBeTruthy();
    expect(possiveis).toContain(m[1]);
    expect(p.nota).toContain(`Última pesagem: ${String(weights[29].w).replace('.', ',')} kg, hoje.`);
  });

  test('subindo no cutting, a meta "ainda não está à vista"; abaixo dela, "já chegou"', async ({ page }) => {
    const sobe = [];
    for (let a = 20; a >= 0; a--) sobe.push({ d: diaISO(a), w: r1(79 + (20 - a) * 0.05) });
    await abrirApp(page, base({}, { weights: sobe }));
    let p = await progresso(page);
    expect(p.nota).toContain('Pela tendência, a meta ainda não está à vista.');
    await page.evaluate(w => { __t.store.weights = w; }, [8, 5, 3, 1].map(a => ({ d: diaISO(a), w: 71.5 })));
    await page.evaluate(() => document.querySelector('[data-volta]').click());
    p = await progresso(page);
    expect(p.nota).toContain('A tendência já chegou à meta.');
  });

  test('vírgula em tudo, e nada de ponto decimal', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: diaISO(4), w: 78.3 }, { d: diaISO(2), w: 77.9 }, { d: diaISO(0), w: 77.7 }] }));
    const p = await progresso(page);
    expect(p.txt).not.toMatch(/\d\.\d/);
    expect(p.txt).toContain('77,7 kg');
  });

  for (const largura of [320, 390]) {
    test(`cabe em ${largura}px, sem rolar de lado`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      const weights = [];
      for (let a = 29; a >= 0; a--) weights.push({ d: diaISO(a), w: r1(noPlano(a) + (a % 3 - 1) * 0.4) });
      await abrirApp(page, base({}, { weights }));
      await progresso(page);
      const r = await page.evaluate(() => {
        const card = document.getElementById('weightChart').getBoundingClientRect();
        const fora = [...document.querySelectorAll('#weightChart .wt-stats > div, #weightChart .wt-nota > span')]
          .filter(x => { const b = x.getBoundingClientRect(); return b.right > card.right + 1 || b.left < card.left - 1; }).length;
        const corta = [...document.querySelectorAll('#weightChart .wt-stats .v, #weightChart .wt-stats .k')].filter(x => x.scrollWidth > x.clientWidth + 1).length;
        return { larg: document.documentElement.scrollWidth, vw: innerWidth, fora, corta };
      });
      expect(r.larg).toBeLessThanOrEqual(r.vw);
      expect(r.fora).toBe(0);
      expect(r.corta, 'os números e os rótulos não passam da borda').toBe(0);
    });
  }
});

test.describe('O cartão "Atualizar / Manter" segue a tendência', () => {

  test('um dia de balança baixa não propõe mudar a meta', async ({ page }) => {
    /* 80 kg por dez dias e 77 hoje: pela pesagem do dia, 3 kg = 45 kcal, e
       o cartão aparecia. Pela tendência, 0,3 kg. */
    const weights = [];
    for (let a = 10; a >= 1; a--) weights.push({ d: diaISO(a), w: 80 });
    weights.push({ d: diaISO(0), w: 77 });
    await abrirApp(page, base({}, { weights }));
    expect(await cartao(page)).toBeNull();
  });

  test('a perda de verdade propõe, com o mesmo número do Progresso', async ({ page }) => {
    const weights = [];
    for (let a = 20; a >= 0; a--) weights.push({ d: diaISO(a), w: r1(80 - (20 - a) * 0.2) });
    await abrirApp(page, base({}, { weights }));
    const t = await page.evaluate(() => __t.tendenciaAtual());
    const txt = await cartao(page);
    expect(txt).toContain(`Com ${String(t.w).replace('.', ',')} kg (tendência das suas pesagens; a última, de hoje)`);
    const p = await progresso(page);
    expect(p.stats['Tendência']).toBe(String(t.w).replace('.', ',') + ' kg');
    await page.evaluate(() => document.querySelector('[data-volta]').click());
    await page.waitForTimeout(300);
    await clicar(page, '#fdAjuste [data-ajuste="sim"]');
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => __t.store.goals.pesoConta), 'o peso aceito é a tendência').toBe(t.w);
  });

  test('com uma pesagem só, a tendência é ela', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: diaISO(0), w: 72 }] }));
    expect(await cartao(page)).toContain('Com 72 kg (pesagem de hoje)');
  });
});
