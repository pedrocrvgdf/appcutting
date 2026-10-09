/* A vírgula não multiplica por dez.

   No teclado numérico brasileiro a tecla decimal é a vírgula, e um
   <input type="number"> a descarta antes de o JavaScript enxergar: "57,5"
   virava 575 calado. O cardio e a dose já tinham sido corrigidos; este
   arquivo cobre o resto — carga das séries, peso, quantidades, rótulo,
   objetivo — e as conferências que pegam o número que fugiu do esperado. */

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO, iniciarTreino, APP } = require('./app');

const hoje = diaISO(0), ontem = diaISO(1);

/** Digita como o teclado: o filtro do app roda no evento de entrada. */
const digitar = (page, sel, txt) => page.evaluate(([s, t]) => {
  const c = document.querySelector(s);
  c.value = t;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  c.dispatchEvent(new Event('change', { bubbles: true }));
}, [sel, txt]);
const clicar = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const dialogo = page => page.evaluate(() => {
  const o = document.getElementById('appDlgOverlay');
  return o.classList.contains('open') ? document.getElementById('appDlgMsg').textContent : null;
});
const responder = async (page, sim) => {
  await page.waitForSelector('#appDlgOverlay.open', { timeout: 5000 });
  await clicar(page, sim ? '#appDlgOk' : '#appDlgCancel');
  await page.waitForTimeout(200);
};
const irPara = async (page, aba) => {
  await page.evaluate(a => document.querySelector(`#tabbar [data-tab="${a}"]`).click(), aba);
  await page.waitForTimeout(250);
};

test.describe('Vírgula', () => {

  test('nenhum campo do app é type="number"', async () => {
    /* Um campo esquecido mantém o defeito. Os comentários que explicam o
       porquê podem citar o tipo; campo de verdade, não. */
    const src = fs.readFileSync(APP, 'utf8');
    expect(src.match(/type="number"/g) || []).toEqual([]);
  });

  test('carga "57,5" grava 57,5, e o volume da sessão sai com ela', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    await iniciarTreino(page);
    await digitar(page, '#trSets .tr-set[data-i="0"] .ikg', '57,5');
    await digitar(page, '#trSets .tr-set[data-i="0"] .irep', '10');
    expect(await page.evaluate(() => __t.trS.logs[0][0].kg)).toBe(57.5);
    await clicar(page, '#trNext');
    await page.waitForTimeout(300);
    await clicar(page, '#trNext');
    await page.waitForTimeout(500);
    const s = await page.evaluate(h => __t.store.tdays[h][0], hoje);
    expect(s.ex[0].sets[0]).toMatchObject({ kg: 57.5, rep: 10 });
    expect(s.vol).toBe(575);
    expect(erros).toEqual([]);
  });

  test('o campo de carga aceita vírgula e recusa letra', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await iniciarTreino(page);
    await digitar(page, '#trSets .tr-set[data-i="0"] .ikg', '5a7,5');
    expect(await page.evaluate(() => document.querySelector('#trSets .tr-set[data-i="0"] .ikg').value)).toBe('57,5');
    await digitar(page, '#trSets .tr-set[data-i="0"] .irep', '12,4');
    expect(await page.evaluate(() => __t.trS.logs[0][0].rep), 'reps são inteiras, e a vírgula não vira ×10 (124)').toBe(12);
  });

  test('peso "82,4" no Progresso grava 82,4', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await clicar(page, '#fdIrProgresso');
    await page.waitForTimeout(300);
    await digitar(page, '#wtInput', '82,4');
    await clicar(page, '#wtAdd');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __t.store.weights.map(x => x.w))).toEqual([82.4]);
  });

  test('"1.500" ml de água é mil e quinhentos, não um e meio', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irPara(page, 'food');
    await digitar(page, '#liqCustom', '1.500');
    await clicar(page, '#liqAddCustom');
    await page.waitForTimeout(200);
    expect(await page.evaluate(h => __t.store.liquids[h], hoje)).toBe(1500);
  });

  test('alimento do rótulo: "2,4" g de proteína e "1.200" kcal', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irPara(page, 'food');
    await clicar(page, '#toggleManual');
    await page.waitForTimeout(150);
    await digitar(page, '#search', 'Bolo da vó');
    await digitar(page, '#mgrams', '350');
    await digitar(page, '#mkcal', '1.200');
    await digitar(page, '#mprot', '2,4');
    await digitar(page, '#mcarb', '150,5');
    await digitar(page, '#mgord', '40');
    await clicar(page, '#addBtn');
    await page.waitForTimeout(300);
    const it = await page.evaluate(h => __t.store.days[h].at(-1), hoje);
    expect(it).toMatchObject({ name: 'Bolo da vó', grams: 350, kcal: 1200, p: 2.4, c: 150.5, g: 40 });
  });

  test('os macros do dia aparecem com vírgula', async ({ page }) => {
    /* "3.8" de proteína ficou na tela até a revisão por captura: r1() direto
       no texto escreve ponto. */
    await abrirApp(page, estadoBase({ days: { [hoje]: [{ id: 'a1', name: 'Arroz', grams: 150, unit: 'g', base: null, kcal: 195, p: 3.8, c: 42, g: 0.4, status: 'consumido' }] } }));
    await irPara(page, 'food');
    expect(await page.evaluate(() => ['mProt', 'mCarb', 'mGord'].map(i => document.getElementById(i).textContent))).toEqual(['3,8', '42', '0,4']);
  });

  test('o objetivo e a curva de peso mostram vírgula, não ponto', async ({ page }) => {
    /* r1() direto no texto escreve "82.4": estavam assim o "Atual" da curva,
       o título do objetivo no perfil e o peso no passo 3 do objetivo. */
    const st = estadoBase({ weights: [{ d: ontem, w: 83.1 }, { d: hoje, w: 82.4 }] });
    const s = JSON.parse(st['cutting.v1']);
    Object.assign(s.goals, { pesoAtual: 84.5, pesoAlvo: 77.5, objetivo: 'cutting' });
    st['cutting.v1'] = JSON.stringify(s);
    await abrirApp(page, st);
    await clicar(page, '#fdIrProgresso');
    await page.waitForTimeout(400);
    const curva = await page.evaluate(() => document.querySelector('.wt-stats').textContent);
    expect(curva).toContain('82,4 kg');
    expect(curva).not.toMatch(/\d\.\d/);
    await irPara(page, 'perfil');
    expect(await page.evaluate(() => document.getElementById('pfObjTitle').textContent)).toBe('Cutting · 84,5 → 77,5 kg');
    await clicar(page, '#pfEdit');
    await page.waitForTimeout(400);
    await clicar(page, '#gNext'); await page.waitForTimeout(200);
    await clicar(page, '#gNext'); await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById('gPesoAtualShow').textContent)).toBe('84,5 kg');
  });

  test('altura em metros ("1,78") vira 178 cm, e o prazo aceita "1,5" mês', async ({ page }) => {
    /* O campo antigo descartava a vírgula e "1,78" virava 178 por acaso;
       respeitada a vírgula sem isto, seriam 1,78 cm e um GETD de ~830 kcal. */
    await abrirApp(page, estadoBase());
    await irPara(page, 'perfil');
    await clicar(page, '#pfEdit');
    await page.waitForTimeout(400);
    await digitar(page, '#gAltura', '1,78');
    expect(await page.evaluate(() => document.getElementById('gAltura').value), 'a pessoa vê o número em centímetros').toBe('178');
    await digitar(page, '#gMeses', '4,5');
    await clicar(page, '#gNext'); await page.waitForTimeout(200);
    await clicar(page, '#gNext'); await page.waitForTimeout(200);
    await clicar(page, '#saveGoals'); await page.waitForTimeout(400);
    const g = await page.evaluate(() => __t.store.goals);
    expect(g.altura).toBe(178);
    expect(g.meses, 'prazo decimal não vira 45').toBe(4.5);
  });

  test('objetivo: peso "82,5" e altura "178,5" ficam com a vírgula no lugar', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irPara(page, 'perfil');
    await clicar(page, '#pfEdit');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.getElementById('gPesoAtual').value), 'o número volta para o campo com vírgula').toBe('80');
    await digitar(page, '#gAltura', '178,5');
    await digitar(page, '#gPesoAtual', '82,5');
    await clicar(page, '#gNext'); await page.waitForTimeout(200);
    await clicar(page, '#gNext'); await page.waitForTimeout(200);
    await clicar(page, '#saveGoals'); await page.waitForTimeout(400);
    const g = await page.evaluate(() => __t.store.goals);
    expect(g.altura).toBe(178.5);
    expect(g.pesoAtual).toBe(82.5);
  });
});

test.describe('Conferências', () => {

  test('pesagem de 824 com a anterior em 82 avisa; 72 pergunta; "Corrigir" não grava', async ({ page }) => {
    await abrirApp(page, estadoBase({ weights: [{ d: ontem, w: 82 }] }));
    await clicar(page, '#fdIrProgresso');
    await page.waitForTimeout(300);
    await digitar(page, '#wtInput', '824');
    await clicar(page, '#wtAdd');
    await page.waitForTimeout(200);
    let msg = await dialogo(page);
    expect(msg, 'acima de 400 kg não é peso de gente: avisa e não grava').toContain('824 kg não é um peso possível');
    expect(msg).toContain('Talvez seja 82,4 kg');
    await responder(page, true);
    expect(await page.evaluate(() => __t.store.weights.length), 'nada gravado').toBe(1);

    await digitar(page, '#wtInput', '72');
    await clicar(page, '#wtAdd');
    await page.waitForTimeout(200);
    msg = await dialogo(page);
    expect(msg).toContain('Confere 72 kg?');
    expect(msg).toContain('foi 82 kg');
    await responder(page, false);
    expect(await page.evaluate(() => __t.store.weights.length), '"Corrigir" não grava').toBe(1);

    await digitar(page, '#wtInput', '82,4');
    await clicar(page, '#wtAdd');
    await page.waitForTimeout(250);
    expect(await dialogo(page), 'perto da anterior, não pergunta nada').toBeNull();
    expect(await page.evaluate(h => __t.store.weights.find(x => x.d === h).w, hoje)).toBe(82.4);
  });

  test('"Está certo" grava o número como foi digitado', async ({ page }) => {
    /* Quem ganhou ou perdeu muito de verdade não pode ficar trancado. */
    await abrirApp(page, estadoBase({ weights: [{ d: ontem, w: 82 }] }));
    await clicar(page, '#fdIrProgresso');
    await page.waitForTimeout(300);
    await digitar(page, '#wtInput', '95');
    await clicar(page, '#wtAdd');
    await responder(page, true);
    expect(await page.evaluate(h => __t.store.weights.find(x => x.d === h).w, hoje)).toBe(95);
  });

  test('carga de 575 com a última vez em 57,5 pergunta antes de seguir', async ({ page }) => {
    await abrirApp(page, estadoBase({
      tdays: { [ontem]: [{ id: 's0', name: 'Treino A', tid: 'w1', min: 50, kcal: 300, vol: 1725,
        ex: [{ n: 'Supino reto', g: 'peito', sets: [{ kg: 57.5, rep: 10, rir: 1 }, { kg: 57.5, rep: 10 }, { kg: 57.5, rep: 10 }] }] }] },
    }));
    await iniciarTreino(page);
    await digitar(page, '#trSets .tr-set[data-i="0"] .ikg', '575');
    await digitar(page, '#trSets .tr-set[data-i="0"] .irep', '10');
    await clicar(page, '#trNext');
    await page.waitForTimeout(200);
    const msg = await dialogo(page);
    expect(msg).toContain('Série 1 com 575 kg?');
    expect(msg).toContain('Talvez seja 57,5 kg');
    await responder(page, false);
    expect(await page.evaluate(() => __t.trS.idx), 'continua no mesmo exercício').toBe(0);
    await digitar(page, '#trSets .tr-set[data-i="0"] .ikg', '60');
    await clicar(page, '#trNext');
    await page.waitForTimeout(300);
    expect(await dialogo(page), 'progressão normal não pergunta').toBeNull();
    expect(await page.evaluate(() => __t.trS.idx)).toBe(1);
  });

  test('"Corrigir" a quantidade não guarda o alimento próprio com os macros errados', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irPara(page, 'food');
    await clicar(page, '#toggleManual');
    await page.waitForTimeout(150);
    await digitar(page, '#search', 'Bolo da vó');
    await digitar(page, '#mgrams', '3500');
    await digitar(page, '#mkcal', '350');
    await clicar(page, '#addBtn');
    await responder(page, false);
    expect(await page.evaluate(() => (__t.store.custom || []).length), 'nada guardado antes de conferir').toBe(0);
    await digitar(page, '#mgrams', '350');
    await clicar(page, '#addBtn');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __t.store.custom.map(x => [x.n, Math.round(x.k)]))).toEqual([['Bolo da vó', 100]]);
  });

  test('editar um item do banco não arredonda os gramas', async ({ page }) => {
    await abrirApp(page, estadoBase({ days: { [hoje]: [{ id: 'a1', name: 'Arroz', grams: 152.5, unit: 'g', base: { k: 130, p: 2.5, c: 28, g: 0.2 }, kcal: 198.25, p: 3.8, c: 42.7, g: 0.3, status: 'consumido' }] } }));
    await irPara(page, 'food');
    await clicar(page, '[data-edit="a1"]');
    await page.waitForTimeout(200);
    const valor = await page.evaluate(() => document.getElementById('eGrams').value);
    expect(valor).toBe('152,5');
  });

  test('mais de 2 kg num lançamento pergunta', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irPara(page, 'food');
    await clicar(page, '#toggleManual');
    await page.waitForTimeout(150);
    await digitar(page, '#search', 'Arroz');
    await digitar(page, '#mgrams', '2500');
    await digitar(page, '#mkcal', '3200');
    await clicar(page, '#addBtn');
    await page.waitForTimeout(200);
    expect(await dialogo(page)).toContain('Confere 2.500 g de Arroz?');
    await responder(page, false);
    expect(await page.evaluate(h => (__t.store.days[h] || []).length, hoje)).toBe(0);
  });
});

test.describe('Corrigir série', () => {

  const duasSessoes = () => estadoBase({
    tdays: {
      [ontem]: [{ id: 's0', name: 'Treino A', tid: 'w1', min: 50, kcal: 300, vol: 600,
        ex: [{ n: 'Supino reto', g: 'peito', sets: [{ kg: 60, rep: 10, rir: 1 }] }] }],
      [hoje]: [{ id: 's1', name: 'Treino A', tid: 'w1', min: 50, kcal: 300, vol: 5750,
        ex: [{ n: 'Supino reto', g: 'peito', sets: [{ kg: 575, rep: 10, rir: 1 }] }] }],
    },
  });

  test('a série salva com a vírgula perdida é corrigida, e o volume e o selo acompanham', async ({ page }) => {
    const erros = await abrirApp(page, duasSessoes());
    const selo = () => page.evaluate(() => document.querySelector('#fdFeed .fd-card[data-fd="s1"] .fd-prog').textContent);
    expect(await selo()).toContain('+858% de carga');
    await page.evaluate(() => document.querySelector('[data-fdver="s1"]').click());
    await page.waitForSelector('#sessaoOverlay.open');
    await clicar(page, '#ssCorpo [data-ssc="0:0"]');
    await page.waitForSelector('#serieOverlay.open');
    expect(await page.evaluate(() => document.getElementById('serieKg').value)).toBe('575');
    await digitar(page, '#serieKg', '57,5');
    await clicar(page, '#serieSalvar');
    await page.waitForTimeout(300);
    const s = await page.evaluate(h => __t.store.tdays[h][0], hoje);
    expect(s.ex[0].sets[0].kg).toBe(57.5);
    expect(s.vol).toBe(575);
    expect(s.kcal, 'as calorias vêm da duração e do esforço, não da carga').toBe(300);
    expect(await selo()).toContain('-4% de carga');
    expect(await page.evaluate(() => document.querySelector('#ssCorpo .ss-serie .c').textContent), 'a sessão aberta mostra o número novo').toBe('57,5 kg × 10');
    expect(erros).toEqual([]);
  });

  test('sem reps a correção não é aceita', async ({ page }) => {
    await abrirApp(page, duasSessoes());
    await page.evaluate(() => document.querySelector('[data-fdver="s1"]').click());
    await page.waitForSelector('#sessaoOverlay.open');
    await clicar(page, '#ssCorpo [data-ssc="0:0"]');
    await digitar(page, '#serieRep', '');
    await clicar(page, '#serieSalvar');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById('serieNota').textContent)).toContain('repetições');
    expect(await page.evaluate(h => __t.store.tdays[h][0].ex[0].sets[0].rep, hoje)).toBe(10);
  });
});
