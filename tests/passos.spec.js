/* Passos do dia.

   A pessoa digita o total que o celular ou o relógio contou; o app converte em
   distância pela altura (0,415 × altura, 0,413 na mulher) e em calorias pelo
   peso, com o custo da caminhada do cardio (0,50 kcal/kg/km). Num dia com
   passos, a rotina estimada sai e o medido entra: a base é o GETD sem a parte
   da rotina acima do piso sedentário (TMB × 1,2).

   Perfil de referência (estadoBase): 80 kg, 180 cm, homem, 30 anos, rotina
   1,5, GETD 3000. TMB 1780 → base sem rotina 3000 − 1780 × 0,3 = 2466.
   Passo 0,747 m → 10.000 passos = 7,47 km → 80 × 7,47 × 0,5 = 299 kcal. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO } = require('./app');

const clicar = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const aberto = page => page.evaluate(() => document.getElementById('passosOverlay').classList.contains('open'));
const visivel = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none'; }, id);
const texto = (page, id) => page.evaluate(i => document.getElementById(i).textContent, id);
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('cutting.v1')));
const gasto = (page, dk) => page.evaluate(k => window.__t.gastoDia(k || window.__t.todayKey()), dk);
const digitar = (page, v) => page.evaluate(v => {
  const c = document.getElementById('passosN'); c.value = v; c.dispatchEvent(new Event('input', { bubbles: true }));
}, v);

/** Um dia com uma caminhada de exatamente 5.000 passos (3,735 km) já registrada. */
function comCaminhada(extraTdays = []) {
  const s = estadoBase();
  const st = JSON.parse(s['cutting.v1']);
  st.tdays[diaISO(0)] = [{ id: 'c1', name: 'Caminhada', min: 45, km: 3.735, kcal: 150, intens: 'caminhada · 5 km/h' }, ...extraTdays];
  s['cutting.v1'] = JSON.stringify(st);
  return s;
}

async function irAlimentacao(page) {
  await clicar(page, '#tabbar [data-tab="food"]');
  await page.waitForTimeout(200);
}

async function abrirPopup(page) {
  await clicar(page, '#passosRow');
  await page.waitForTimeout(250);
  expect(await aberto(page)).toBe(true);
}

async function salvar(page) {
  await clicar(page, '#passosSalvar');
  await page.waitForTimeout(250);
}

test.describe('Lançar os passos na Alimentação', () => {

  test('a linha existe, abre o pop-up, converte e entra no gasto do dia', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    const metaAntes = parseInt(await texto(page, 'metaShow'), 10);
    expect(await gasto(page)).toBe(3000);

    await abrirPopup(page);
    await digitar(page, '10.000');
    const nota = await texto(page, 'passosNota');
    expect(nota, 'a prévia mostra a distância').toMatch(/7,5 km/);
    expect(nota, 'e as calorias').toMatch(/= 299 kcal/);
    expect(nota, 'e diz o que sai no lugar').toMatch(/rotina do dia a dia, que já contava 534 kcal/);
    expect(nota, 'e o efeito de fato na meta').toMatch(/Na meta: −235 kcal/);
    expect(await visivel(page, 'passosAtivWrap'), 'sem atividade no dia, não há o que perguntar').toBe(false);
    await salvar(page);

    const s = await store(page);
    expect(s.passos[diaISO(0)], 'com o peso com que foi contado').toEqual({ n: 10000, inclui: false, peso: 80 });
    expect(await gasto(page), '2466 de base sem rotina + 299 dos passos').toBe(2765);
    expect(await texto(page, 'passosTit')).toBe('10.000 passos · 7,5 km');
    expect(await texto(page, 'passosSub')).toBe('299 no lugar de 534 da rotina · −235 na meta');
    expect(await texto(page, 'statusLine')).toMatch(/2466 \(GETD sem a rotina\) \+ 299 \(passos\)/);
    const metaDepois = parseInt(await texto(page, 'metaShow'), 10);
    expect(metaAntes - metaDepois, 'a rotina estimada (534) sai, os passos (299) entram').toBe(235);
    expect(erros).toEqual([]);
  });

  test('a rotina só é trocada no dia com passos: os outros dias ficam como estavam', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '8000');
    await salvar(page);
    expect(await gasto(page, diaISO(1)), 'ontem não tem passos').toBe(3000);
  });

  test('apagar os passos devolve o dia ao GETD', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '8000');
    await salvar(page);
    await abrirPopup(page);
    expect(await visivel(page, 'passosZerar')).toBe(true);
    await clicar(page, '#passosZerar');
    await page.waitForTimeout(250);
    expect((await store(page)).passos[diaISO(0)]).toBeUndefined();
    expect(await gasto(page)).toBe(3000);
    expect(await texto(page, 'passosTit')).toBe('Passos do dia');
  });

  test('mulher usa a passada de 0,413 da altura', async ({ page }) => {
    const s = estadoBase();
    const st = JSON.parse(s['cutting.v1']); st.goals.sexo = 'F'; s['cutting.v1'] = JSON.stringify(st);
    await abrirApp(page, s);
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '10000');
    expect(await texto(page, 'passosNota')).toMatch(/7,4 km/);   // 1,80 × 0,413 × 10.000
  });

  test('sem altura e peso, guarda os passos mas não inventa caloria', async ({ page }) => {
    const s = estadoBase();
    const st = JSON.parse(s['cutting.v1']); st.goals = { nome: 'Pedro' }; s['cutting.v1'] = JSON.stringify(st);
    await abrirApp(page, s);
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '9000');
    expect(await texto(page, 'passosNota')).toMatch(/Defina altura e peso/);
    await salvar(page);
    expect((await store(page)).passos[diaISO(0)].n).toBe(9000);
    expect(await gasto(page), 'o gasto do dia não muda').toBe(3000);
  });

  test('o campo aceita "10.000" e recusa letra', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '1a0.0b00');
    expect(await page.evaluate(() => document.getElementById('passosN').value)).toBe('10.000');
    await salvar(page);
    expect((await store(page)).passos[diaISO(0)].n).toBe(10000);
  });

  test('o dia visto manda: na seta de ontem, os passos vão para ontem', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await clicar(page, '#dayPrev');
    await page.waitForTimeout(200);
    await abrirPopup(page);
    expect(await texto(page, 'passosData')).not.toBe('Hoje');
    await digitar(page, '6000');
    await salvar(page);
    const s = await store(page);
    expect(s.passos[diaISO(1)].n).toBe(6000);
    expect(s.passos[diaISO(0)]).toBeUndefined();
    expect(await gasto(page, diaISO(0))).toBe(3000);
  });
});

test.describe('A atividade registrada e os passos', () => {

  test('a pergunta só aparece quando há caminhada, corrida ou esteira com km', async ({ page }) => {
    const s = estadoBase();
    const st = JSON.parse(s['cutting.v1']);
    st.tdays[diaISO(0)] = [{ id: 'm1', name: 'Musculação', min: 60, kcal: 300 }];
    s['cutting.v1'] = JSON.stringify(st);
    await abrirApp(page, s);
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '10000');
    expect(await visivel(page, 'passosAtivWrap'), 'musculação não tem km: nada a perguntar').toBe(false);
  });

  test('"sim": a caminhada vale o que vale, e só os passos além dela entram', async ({ page }) => {
    await abrirApp(page, comCaminhada());
    await irAlimentacao(page);
    expect(await gasto(page), 'antes: GETD + caminhada').toBe(3150);
    await abrirPopup(page);
    await digitar(page, '10000');
    expect(await visivel(page, 'passosAtivWrap')).toBe(true);
    expect(await texto(page, 'passosAtivNota')).toMatch(/Caminhada 3,7 km ≈ 5.000 passos/);
    expect(await texto(page, 'passosNota')).toMatch(/5.000 além da atividade/);
    expect(await texto(page, 'passosNota')).toMatch(/= 149 kcal/);   // 80 × 3,735 × 0,5
    await salvar(page);

    const s = await store(page);
    expect(s.passos[diaISO(0)], 'com o peso com que foi contado').toEqual({ n: 10000, inclui: true, peso: 80 });
    expect(await gasto(page), '2466 + 149 dos passos a mais + 150 da caminhada').toBe(2765);
    expect(await texto(page, 'passosSub')).toBe('5.000 além da atividade · 149 no lugar de 534 da rotina · −385 na meta');
  });

  test('"não": os passos entram inteiros, por cima da caminhada', async ({ page }) => {
    await abrirApp(page, comCaminhada());
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '10000');
    await clicar(page, '#passosIncSeg [data-v="nao"]');
    expect(await texto(page, 'passosNota')).toMatch(/= 299 kcal/);
    expect(await texto(page, 'passosNota')).not.toMatch(/além da atividade/);
    await salvar(page);
    expect((await store(page)).passos[diaISO(0)].inclui).toBe(false);
    expect(await gasto(page), '2466 + 299 + 150').toBe(2915);
  });

  test('menos passos que a caminhada: nada se soma, e nada se desconta', async ({ page }) => {
    await abrirApp(page, comCaminhada());
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '4000');
    expect(await texto(page, 'passosNota')).toMatch(/0 além da atividade = 0 kcal/);
    await salvar(page);
    expect(await gasto(page), '2466 + 0 + 150: a caminhada continua inteira').toBe(2616);
  });

  test('a resposta da última vez vem marcada', async ({ page }) => {
    await abrirApp(page, comCaminhada());
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '10000');
    await clicar(page, '#passosIncSeg [data-v="nao"]');
    await salvar(page);

    /* outro dia, também com caminhada */
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('cutting.v1'));
      const d = new Date(); d.setDate(d.getDate() - 1);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      s.tdays[k] = [{ id: 'c2', name: 'Esteira', min: 30, km: 3, kcal: 120 }];
      localStorage.setItem('cutting.v1', JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(() => !!window.__t);
    await page.waitForTimeout(400);
    await irAlimentacao(page);
    await clicar(page, '#dayPrev');
    await page.waitForTimeout(200);
    await abrirPopup(page);
    await digitar(page, '7000');
    expect(await page.evaluate(() => document.querySelector('#passosIncSeg button.on').dataset.v), 'quem respondeu "não" ontem responde "não" hoje').toBe('nao');
  });
});

test.describe('O selo no Início', () => {

  test('mostra os passos de hoje e abre o mesmo pop-up', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await clicar(page, '#tabbar [data-tab="inicio"]');
    await page.waitForTimeout(200);
    expect(await texto(page, 'fdPassosTx')).toBe('Lançar os passos de hoje');
    await clicar(page, '#fdPassos');
    await page.waitForTimeout(250);
    expect(await aberto(page)).toBe(true);
    expect(await texto(page, 'passosData')).toBe('Hoje');
    await digitar(page, '10000');
    await salvar(page);
    expect(await texto(page, 'fdPassosTx')).toBe('10.000 passos hoje · −235 kcal na meta');
    expect(await texto(page, 'fdSaldoSub'), 'o saldo do Início acompanha').toMatch(/de 2342 kcal/);   // 2765 − 423 de déficit
  });

  test('os passos sobem para a nuvem junto com o resto', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await page.evaluate(() => { window.__pushes = []; window.__fb.setDoc = (r, d) => { window.__pushes.push(JSON.parse(JSON.stringify(d))); return Promise.resolve(); }; });
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '5000');
    await salvar(page);
    await page.evaluate(() => window.__t.pushRemote());
    await page.waitForTimeout(100);
    const nuvem = await page.evaluate(() => window.__pushes.at(-1));
    expect(nuvem.passos[Object.keys(nuvem.passos)[0]].n).toBe(5000);
  });

  test('passos que superam a rotina aparecem como ganho na meta', async ({ page }) => {
    /* Rotina "Sentado" (1,2): não há rotina a trocar, e tudo que os passos
       medem entra na meta. */
    const s = estadoBase();
    const st = JSON.parse(s['cutting.v1']); st.goals.ativ = 1.2; st.getd = 2136; s['cutting.v1'] = JSON.stringify(st);
    await abrirApp(page, s);
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '10000');
    expect(await texto(page, 'passosNota')).toMatch(/Na meta: \+299 kcal/);
    await salvar(page);
    expect(await texto(page, 'passosSub')).toBe('+299 kcal na meta');
    expect(await gasto(page)).toBe(2435);
  });

  test('a tela de Treino conta os passos como o Início e a Alimentação', async ({ page }) => {
    /* Ela mostrava "GETD + treino" e ignorava os passos: três telas, dois
       números para o mesmo dia. */
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '10000');
    await salvar(page);
    await clicar(page, '#tabbar [data-tab="treino"]');
    await page.waitForTimeout(200);
    expect(await texto(page, 'tGasto')).toBe(String(await gasto(page)));
    expect(await texto(page, 'tGastoSub')).toMatch(/GETD sem a rotina 2466 \+ passos 299 \+ treino 0/);
  });

  test('nenhum diálogo do navegador', async ({ page }) => {
    let dialogos = 0;
    page.on('dialog', d => { dialogos++; d.dismiss(); });
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await abrirPopup(page);
    await digitar(page, '8000');
    await salvar(page);
    await abrirPopup(page);
    await clicar(page, '#passosZerar');
    await page.waitForTimeout(200);
    expect(dialogos).toBe(0);
  });
});
