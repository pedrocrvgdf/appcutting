/* O peso de hoje, ao lado dos passos, e a meta que acompanha o peso.

   O pedido: "adicione também na tela aonde está os passos para a pessoa
   adicionar o peso atual (ela pode colocar por dia ou semanalmente ou quando
   ela quiser)".

   E o defeito por trás: a taxa basal, os passos e a proteína usavam o peso
   digitado no dia em que o objetivo foi salvo. Quem perdia 8 kg continuava
   com o GETD de quando pesava mais, e corrigir o peso no objetivo reiniciava
   o plano. Agora a pesagem PROPÕE ajustar a meta ("Atualizar" / "Manter"),
   o plano não reinicia, e os dias que já passaram não mudam. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO } = require('./app');

const hoje = diaISO(0), ontem = diaISO(1), anteontem = diaISO(2);
/* estadoBase: homem, 30 anos, 180 cm, 80 kg, rotina 1,5, GETD guardado 3000.
   Pela fórmula, 10 kcal por kg × 1,5 = 15 kcal por kg. */
const base = (goals = {}, extra = {}) => {
  const st = estadoBase(extra);
  const s = JSON.parse(st['cutting.v1']);
  Object.assign(s.goals, { inicio: '2026-09-01', objetivo: 'cutting' }, goals);
  st['cutting.v1'] = JSON.stringify(s);
  return st;
};
const digitar = (page, sel, txt) => page.evaluate(([s, t]) => {
  const c = document.querySelector(s);
  c.value = t;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  c.dispatchEvent(new Event('change', { bubbles: true }));
}, [sel, txt]);
const clicar = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const irPara = async (page, aba) => {
  await page.evaluate(a => document.querySelector(`#tabbar [data-tab="${a}"]`).click(), aba);
  await page.waitForTimeout(250);
};
const store = page => page.evaluate(() => JSON.parse(JSON.stringify(__t.store)));
const cartao = page => page.evaluate(() => { const c = document.getElementById('fdAjuste'); return c.hidden ? null : c.textContent; });
const responder = async (page, sim) => {
  await page.waitForSelector('#appDlgOverlay.open', { timeout: 5000 });
  await clicar(page, sim ? '#appDlgOk' : '#appDlgCancel');
  await page.waitForTimeout(200);
};

test.describe('Peso do dia', () => {

  test('a linha do peso fica logo depois da dos passos, no Início e na Alimentação', async ({ page }) => {
    const erros = await abrirApp(page, base());
    expect(await page.evaluate(() => document.getElementById('fdPassos').nextElementSibling.id)).toBe('fdPeso');
    expect(await page.evaluate(() => document.getElementById('passosRow').nextElementSibling.id)).toBe('pesoRow');
    expect(await page.evaluate(() => document.getElementById('fdPesoTx').textContent)).toBe('Lançar o peso de hoje');
    expect(erros).toEqual([]);
  });

  test('pelo Início, vale hoje, e a vírgula fica no lugar', async ({ page }) => {
    await abrirApp(page, base());
    await clicar(page, '#fdPeso');
    await page.waitForSelector('#pesoOverlay.open');
    expect(await page.evaluate(() => document.getElementById('pesoData').textContent)).toBe('Hoje');
    await digitar(page, '#pesoN', '79,4');
    await clicar(page, '#pesoSalvar');
    await page.waitForTimeout(300);
    expect((await store(page)).weights).toEqual([{ d: hoje, w: 79.4 }]);
    expect(await page.evaluate(() => document.getElementById('fdPesoTx').textContent)).toBe('Peso de hoje: 79,4 kg');
    expect(await page.evaluate(() => document.getElementById('pesoOverlay').classList.contains('open'))).toBe(false);
  });

  test('pela Alimentação, vale o dia que está na tela', async ({ page }) => {
    await abrirApp(page, base());
    await irPara(page, 'food');
    await clicar(page, '#dayPrev');
    await page.waitForTimeout(200);
    await clicar(page, '#pesoRow');
    await page.waitForSelector('#pesoOverlay.open');
    expect(await page.evaluate(() => document.getElementById('pesoData').textContent)).toBe('Ontem');
    await digitar(page, '#pesoN', '81');
    await clicar(page, '#pesoSalvar');
    await page.waitForTimeout(300);
    expect((await store(page)).weights).toEqual([{ d: ontem, w: 81 }]);
    expect(await page.evaluate(() => document.getElementById('pesoTit').textContent)).toBe('81 kg');
  });

  test('número impossível avisa, com o provável, e o pop-up continua aberto', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: ontem, w: 82 }] }));
    await clicar(page, '#fdPeso');
    await digitar(page, '#pesoN', '824');
    await clicar(page, '#pesoSalvar');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById('appDlgMsg').textContent)).toContain('Talvez seja 82,4 kg');
    await responder(page, true);
    expect((await store(page)).weights.length).toBe(1);
    expect(await page.evaluate(() => document.getElementById('pesoOverlay').classList.contains('open'))).toBe(true);
  });

  test('apagar a pesagem do dia pede confirmação', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: hoje, w: 79 }] }));
    await clicar(page, '#fdPeso');
    expect(await page.evaluate(() => document.getElementById('pesoN').value)).toBe('79');
    await clicar(page, '#pesoApagar');
    await responder(page, true);
    expect((await store(page)).weights).toEqual([]);
  });
});

test.describe('A meta acompanha o peso', () => {

  test('a pesagem propõe; só "Atualizar" muda a meta, e o plano não reinicia', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: hoje, w: 72 }] }));
    const antes = await store(page);
    expect(antes.getd).toBe(3000);
    const txt = await cartao(page);
    expect(txt).toContain('Com 72 kg (pesagem de hoje), seu gasto estimado cai 120 kcal por dia');
    expect(txt).toMatch(/Meta de hoje: [\d.]+ \(era [\d.]+\)/);
    const ontemAntes = await page.evaluate(o => __t.gastoDia(o), ontem);

    await clicar(page, '#fdAjuste [data-ajuste="sim"]');
    await page.waitForTimeout(250);
    const s = await store(page);
    expect(s.getd).toBe(2880);
    expect(s.goals.pesoConta).toBe(72);
    expect(s.goals.pesoAtual, 'o peso de partida do plano não muda').toBe(80);
    expect(s.goals.inicio, 'e o plano não reinicia').toBe('2026-09-01');
    expect(await cartao(page)).toBeNull();
    expect(await page.evaluate(o => __t.gastoDia(o), ontem), 'o dia que passou mantém o saldo').toBe(ontemAntes);
    expect(await page.evaluate(h => __t.gastoDia(h), hoje)).toBe(2880);
    expect(await page.evaluate(() => __t.macroTargets().p), 'a proteína acompanha o peso aceito (1,8 g/kg)').toBe(Math.round(72 * 1.8));
  });

  test('"Manter" vale para aquela pesagem; a próxima pergunta de novo', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: ontem, w: 72 }] }));
    expect(await cartao(page)).toContain('pesagem de ontem');
    await clicar(page, '#fdAjuste [data-ajuste="nao"]');
    await page.waitForTimeout(200);
    expect(await cartao(page)).toBeNull();
    expect((await store(page)).getd).toBe(3000);
    await clicar(page, '#fdPeso');
    await digitar(page, '#pesoN', '71,5');
    await clicar(page, '#pesoSalvar');
    await page.waitForTimeout(300);
    expect(await cartao(page)).toContain('Com 71,5 kg (pesagem de hoje)');
  });

  test('diferença pequena não pergunta nada', async ({ page }) => {
    /* 1 kg a menos = 15 kcal: abaixo do limiar de 25, some no erro da
       própria estimativa. */
    await abrirApp(page, base({}, { weights: [{ d: hoje, w: 79 }] }));
    expect(await cartao(page)).toBeNull();
  });

  test('também aparece na Alimentação, embaixo do peso do dia', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: hoje, w: 72 }] }));
    await irPara(page, 'food');
    expect(await page.evaluate(() => document.getElementById('alAjuste').hidden)).toBe(false);
    await clicar(page, '#alAjuste [data-ajuste="sim"]');
    await page.waitForTimeout(250);
    expect((await store(page)).getd).toBe(2880);
    expect(await page.evaluate(() => document.getElementById('alAjuste').hidden)).toBe(true);
  });

  test('GETD digitado à mão não é trocado: nem pela pesagem, nem pelo objetivo, nem pelo exógeno', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: hoje, w: 72 }] }));
    await irPara(page, 'food');
    await digitar(page, '#getdInput', '3200');
    await page.waitForTimeout(150);
    let s = await store(page);
    expect(s.getd).toBe(3200);
    expect(s.goals.getdManual).toBe(true);
    expect(await page.evaluate(() => document.getElementById('getdNota').hidden)).toBe(false);
    expect(await cartao(page), 'a pesagem não propõe nada').toBeNull();

    // objetivo salvo de novo
    await irPara(page, 'perfil');
    await clicar(page, '#pfEdit'); await page.waitForTimeout(400);
    await clicar(page, '#gNext'); await page.waitForTimeout(150);
    await clicar(page, '#gNext'); await page.waitForTimeout(150);
    await clicar(page, '#saveGoals'); await page.waitForTimeout(300);
    s = await store(page);
    expect(s.getd).toBe(3200);
    expect(s.goals.getdManual, 'a marca sobrevive ao objetivo remontado').toBe(true);

    // o "+" do exógeno, salvo
    await irPara(page, 'inicio');
    await clicar(page, '#fdMais'); await page.waitForTimeout(200);
    await clicar(page, '#exogPopSalvar'); await page.waitForTimeout(200);
    expect((await store(page)).getd).toBe(3200);

    // "usar o calculado" tira a marca
    await irPara(page, 'food');
    await clicar(page, '#getdAuto');
    await responder(page, true);
    s = await store(page);
    expect(s.goals.getdManual).toBeUndefined();
    expect(s.getd).toBe(Math.round(await page.evaluate(() => __t.computeGETD(__t.store.goals))));
  });

  test('salvar o objetivo com o mesmo plano mantém o peso aceito; plano novo parte do peso de partida', async ({ page }) => {
    await abrirApp(page, base({ pesoConta: 72 }, { weights: [{ d: hoje, w: 72 }] }));
    const abrirESalvar = async (mexer) => {
      await irPara(page, 'perfil');
      await clicar(page, '#pfEdit'); await page.waitForTimeout(400);
      if (mexer) await mexer();
      await clicar(page, '#gNext'); await page.waitForTimeout(150);
      await clicar(page, '#gNext'); await page.waitForTimeout(150);
      await clicar(page, '#saveGoals'); await page.waitForTimeout(300);
    };
    await abrirESalvar();
    let s = await store(page);
    expect(s.goals.pesoConta).toBe(72);
    expect(s.goals.inicio).toBe('2026-09-01');
    expect(s.getd).toBe(Math.round(await page.evaluate(() => __t.computeGETD(__t.store.goals))));

    await abrirESalvar(() => digitar(page, '#gPesoAtual', '74'));
    s = await store(page);
    expect(s.goals.pesoConta, 'plano novo: o peso da conta é o de partida').toBeUndefined();
    expect(s.goals.pesoAtual).toBe(74);
    expect(s.goals.inicio).toBe(hoje);
  });
});

test.describe('Passos com o peso do dia', () => {

  test('passos e cardio usam o mesmo peso, e a pesagem nova não muda os passos de ontem', async ({ page }) => {
    /* O cardio sempre usou a última pesagem; os passos usavam o peso do
       objetivo. A mesma caminhada valia dois números. */
    await abrirApp(page, base({}, {
      weights: [{ d: anteontem, w: 70 }],
      passos: { [ontem]: { n: 10000, inclui: false, peso: 70 } },
    }));
    const ontemAntes = await page.evaluate(o => __t.passosDia(o).kcal, ontem);
    await clicar(page, '#fdPassos');
    await page.waitForSelector('#passosOverlay.open');
    await digitar(page, '#passosN', '10000');
    await clicar(page, '#passosSalvar');
    await page.waitForTimeout(250);
    const s = await store(page);
    expect(s.passos[hoje].peso).toBe(70);
    const km = 10000 * 1.80 * 0.415 / 1000;
    expect(await page.evaluate(h => __t.passosDia(h).kcal, hoje)).toBe(Math.round(70 * km * 0.5));

    await page.evaluate(() => { __t.store.weights.push({ d: __t.todayKey(), w: 60 }); });
    expect(await page.evaluate(o => __t.passosDia(o).kcal, ontem), 'os passos de ontem guardam o peso de ontem').toBe(ontemAntes);
  });

  test('passos lançados antes desta versão seguem com o peso do objetivo', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: anteontem, w: 70 }], passos: { [ontem]: { n: 10000, inclui: false } } }));
    const km = 10000 * 1.80 * 0.415 / 1000;
    expect(await page.evaluate(o => __t.passosDia(o).kcal, ontem)).toBe(Math.round(80 * km * 0.5));
  });
});

test.describe('Nuvem', () => {

  test('o GETD de cada dia sobe, e documento sem ele não apaga o daqui', async ({ page }) => {
    await abrirApp(page, base({}, { weights: [{ d: hoje, w: 72 }] }));
    await clicar(page, '#fdAjuste [data-ajuste="sim"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.__pushes = [];
      window.__fb.setDoc = (r, d) => { window.__pushes.push(JSON.parse(JSON.stringify(d))); return Promise.resolve(); };
    });
    await page.evaluate(() => window.__t.pushRemote());
    await page.waitForTimeout(80);
    const d = await page.evaluate(() => window.__pushes.at(-1));
    expect(d.getdHist.map(x => [x.desde, x.getd])).toEqual([['0000-01-01', 3000], [hoje, 2880]]);

    const sem = { ...d };
    delete sem.getdHist;
    await page.evaluate(x => __t.applyRemote(x), sem);
    expect((await store(page)).getdHist.length, 'versão anterior não apaga o histórico do GETD').toBe(2);
  });
});
