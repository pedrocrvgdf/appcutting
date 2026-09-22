/* Uso de exógenos.

   O app é para todo mundo, inclusive quem usa anabolizante ou estimulante.
   Estimulante muda o gasto em repouso, e a meta precisa acompanhar: o
   clembuterol entra na conta (+21% da taxa basal a 80 mcg, escalando pela
   dose), a efedrina também (+10%), e o anabolizante fica só como informação,
   porque não há medida confiável do efeito dele no gasto.

   Perfil de referência (estadoBase com ativ 1.4): TMB 1780 → GETD 2492. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase } = require('./app');

const estado = () => {
  const s = estadoBase();
  const st = JSON.parse(s['cutting.v1']);
  st.goals.ativ = 1.4; st.getd = 2492;
  s['cutting.v1'] = JSON.stringify(st);
  return s;
};

const clicar = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const aberto = (page, id) => page.evaluate(i => document.getElementById(i).classList.contains('open'), id);
const visivel = (page, id) => page.evaluate(i => {
  const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none';
}, id);
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('cutting.v1')));
const digitar = (page, id, v) => page.evaluate(({ id, v }) => {
  const c = document.getElementById(id); c.value = v; c.dispatchEvent(new Event('input', { bubbles: true }));
}, { id, v });

/** Abre o objetivo e vai até o passo "Sua meta". */
async function irParaMeta(page) {
  await clicar(page, '#editGoals');
  await page.waitForTimeout(250);
  await clicar(page, '#gNext'); await clicar(page, '#gNext');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.getElementById('gTitle').textContent)).toBe('Sua meta');
}

/** Marca uma opção passando pelo pop-up de riscos. */
async function marcar(page, lista, id, aceitar = true) {
  await clicar(page, `#${lista} [data-ex="${id}"]`);
  await page.waitForTimeout(200);
  expect(await aberto(page, 'exogRiscoOverlay'), 'marcar tem que passar pelo aviso de riscos').toBe(true);
  await clicar(page, aceitar ? '#exogRiscoOk' : '#exogRiscoVoltar');
  await page.waitForTimeout(200);
}

test.describe('Uso de exógenos no passo "Sua meta"', () => {

  test('a pergunta existe, começa em "Não" e "Sim" abre as opções', async ({ page }) => {
    const erros = await abrirApp(page, estado());
    await irParaMeta(page);

    expect(await visivel(page, 'gExogSeg')).toBe(true);
    expect(await visivel(page, 'gExogLista'), 'em "Não" a lista fica escondida').toBe(false);
    await clicar(page, '#gExogSeg [data-v="sim"]');
    expect(await visivel(page, 'gExogLista')).toBe(true);
    const opcoes = await page.evaluate(() => [...document.querySelectorAll('#gExogLista [data-ex]')].map(b => b.dataset.ex));
    expect(opcoes).toEqual(['anab', 'clen', 'efed']);
    expect(erros).toEqual([]);
  });

  test('marcar abre o aviso de riscos com fonte e "Voltar" deixa desmarcado', async ({ page }) => {
    await abrirApp(page, estado());
    await irParaMeta(page);
    await clicar(page, '#gExogSeg [data-v="sim"]');
    await marcar(page, 'gExogLista', 'clen', false);

    const t = await page.evaluate(() => ({
      on: document.querySelector('#gExogLista [data-ex="clen"]').classList.contains('on'),
      fonte: document.getElementById('exogRiscoFonte').textContent,
      riscos: document.querySelectorAll('#exogRiscoLista li').length,
      conta: document.getElementById('exogRiscoConta').textContent,
    }));
    expect(t.on, 'quem voltou não marcou').toBe(false);
    expect(t.fonte).toMatch(/Ministério da Saúde/);
    expect(t.riscos).toBeGreaterThan(2);
    expect(t.conta).toMatch(/\+21%/);
  });

  test('clembuterol a 80 mcg soma 21% da taxa basal ao GETD', async ({ page }) => {
    await abrirApp(page, estado());
    await irParaMeta(page);
    await clicar(page, '#gExogSeg [data-v="sim"]');
    await marcar(page, 'gExogLista', 'clen');
    expect(await visivel(page, 'gExogDoseWrap'), 'clembuterol pede a dose').toBe(true);
    await digitar(page, 'gExogDose', '80');
    await clicar(page, '#saveGoals');
    await page.waitForTimeout(300);

    const s = await store(page);
    expect(s.goals.exog).toEqual(['clen']);
    expect(s.goals.clenDose).toBe(80);
    expect(s.getd, '2492 + 21% de 1780').toBe(2866);
  });

  test('a dose escala o efeito e trava em 120 mcg', async ({ page }) => {
    await abrirApp(page, estado());
    await irParaMeta(page);
    await clicar(page, '#gExogSeg [data-v="sim"]');
    await marcar(page, 'gExogLista', 'clen');

    await digitar(page, 'gExogDose', '40');
    let nota = await page.evaluate(() => document.getElementById('gExogNota').textContent);
    expect(nota, '40 mcg é metade do estudo: metade do efeito').toMatch(/2679/);

    await digitar(page, 'gExogDose', '200');
    nota = await page.evaluate(() => document.getElementById('gExogNota').textContent + ' ' + document.getElementById('gExogDoseNota').textContent);
    expect(nota, 'acima de 120 mcg não há medição: trava').toMatch(/3053/);
    expect(nota).toMatch(/trava em 120/);

    await digitar(page, 'gExogDose', '');
    nota = await page.evaluate(() => document.getElementById('gExogNota').textContent + ' ' + document.getElementById('gExogDoseNota').textContent);
    expect(nota, 'sem dose vale a do estudo, e o app diz isso').toMatch(/2866/);
    expect(nota).toMatch(/assume 80 mcg/);
  });

  test('a dose aceita vírgula e recusa letra', async ({ page }) => {
    await abrirApp(page, estado());
    await irParaMeta(page);
    await clicar(page, '#gExogSeg [data-v="sim"]');
    await marcar(page, 'gExogLista', 'clen');
    await digitar(page, 'gExogDose', '6a0,5');
    const v = await page.evaluate(() => document.getElementById('gExogDose').value);
    expect(v).toBe('60,5');
  });

  test('anabolizante fica só como informação: o GETD não muda', async ({ page }) => {
    await abrirApp(page, estado());
    await irParaMeta(page);
    await clicar(page, '#gExogSeg [data-v="sim"]');
    await marcar(page, 'gExogLista', 'anab');
    const conta = await page.evaluate(() => document.getElementById('exogRiscoConta').textContent);
    expect(conta).toMatch(/não muda/);
    expect(await visivel(page, 'gExogDoseWrap'), 'só o clembuterol pede dose').toBe(false);
    await clicar(page, '#saveGoals');
    await page.waitForTimeout(300);

    const s = await store(page);
    expect(s.goals.exog).toEqual(['anab']);
    expect(s.getd).toBe(2492);
  });

  test('clembuterol e efedrina juntos: vale o maior efeito, não a soma', async ({ page }) => {
    await abrirApp(page, estado());
    await irParaMeta(page);
    await clicar(page, '#gExogSeg [data-v="sim"]');
    await marcar(page, 'gExogLista', 'clen');
    await marcar(page, 'gExogLista', 'efed');
    await clicar(page, '#saveGoals');
    await page.waitForTimeout(300);

    const s = await store(page);
    expect(s.goals.exog).toEqual(['clen', 'efed']);
    expect(s.getd, 'mesmo caminho adrenérgico: 21%, não 31%').toBe(2866);
  });

  test('desmarcar não pede aviso e tira o efeito; "Não" limpa tudo', async ({ page }) => {
    await abrirApp(page, estado());
    await irParaMeta(page);
    await clicar(page, '#gExogSeg [data-v="sim"]');
    await marcar(page, 'gExogLista', 'efed');
    await clicar(page, '#gExogLista [data-ex="efed"]');
    await page.waitForTimeout(150);
    expect(await aberto(page, 'exogRiscoOverlay')).toBe(false);
    expect(await page.evaluate(() => document.querySelector('#gExogLista [data-ex="efed"]').classList.contains('on'))).toBe(false);

    await marcar(page, 'gExogLista', 'efed');
    await clicar(page, '#gExogSeg [data-v="nao"]');
    await clicar(page, '#saveGoals');
    await page.waitForTimeout(300);
    const s = await store(page);
    expect(s.goals.exog).toEqual([]);
    expect(s.getd).toBe(2492);
  });

  test('salvar o objetivo de novo não perde o exógeno', async ({ page }) => {
    /* saveGoals remonta store.goals do zero — a data de nascimento já sumiu
       assim uma vez. */
    const s0 = estado();
    const st = JSON.parse(s0['cutting.v1']);
    st.goals.exog = ['clen']; st.goals.clenDose = 40;
    s0['cutting.v1'] = JSON.stringify(st);
    await abrirApp(page, s0);
    await irParaMeta(page);

    expect(await page.evaluate(() => document.querySelector('#gExogLista [data-ex="clen"]').classList.contains('on'))).toBe(true);
    expect(await page.evaluate(() => document.getElementById('gExogDose').value)).toBe('40');
    await clicar(page, '#saveGoals');
    await page.waitForTimeout(300);
    const s = await store(page);
    expect(s.goals.exog).toEqual(['clen']);
    expect(s.goals.clenDose).toBe(40);
    expect(s.getd).toBe(2679);
  });
});

test.describe('O "+" do Início', () => {

  test('abre o pop-up de exógenos e salvar recalcula o GETD na hora', async ({ page }) => {
    const erros = await abrirApp(page, estado());
    await clicar(page, '#fdMais');
    await page.waitForTimeout(250);
    expect(await aberto(page, 'exogOverlay')).toBe(true);

    await clicar(page, '#exogPopSeg [data-v="sim"]');
    await marcar(page, 'exogPopLista', 'clen');
    await digitar(page, 'exogPopDose', '40');
    const nota = await page.evaluate(() => document.getElementById('exogPopNota').textContent);
    expect(nota, 'mostra o antes e o depois').toMatch(/2492/);
    expect(nota).toMatch(/2679/);

    await clicar(page, '#exogPopSalvar');
    await page.waitForTimeout(300);
    expect(await aberto(page, 'exogOverlay')).toBe(false);
    const s = await store(page);
    expect(s.goals.exog).toEqual(['clen']);
    expect(s.goals.clenDose).toBe(40);
    expect(s.getd).toBe(2679);
    expect(s.goals.pesoAlvo, 'o resto do objetivo fica como estava').toBe(75);

    await clicar(page, '#tabbar [data-tab="perfil"]');
    await page.waitForTimeout(200);
    const perfil = await page.evaluate(() => ({
      exog: document.getElementById('pfExog').textContent,
      getd: document.getElementById('pfGetd').textContent,
    }));
    expect(perfil.exog).toMatch(/Clembuterol 40 mcg/);
    expect(perfil.getd).toBe('2679');
    expect(erros).toEqual([]);
  });

  test('"Voltar" não muda nada', async ({ page }) => {
    await abrirApp(page, estado());
    await clicar(page, '#fdMais');
    await clicar(page, '#exogPopSeg [data-v="sim"]');
    await marcar(page, 'exogPopLista', 'efed');
    await clicar(page, '#exogPopVoltar');
    await page.waitForTimeout(200);
    const s = await store(page);
    expect(s.goals.exog).toBeUndefined();
    expect(s.getd).toBe(2492);
  });

  test('sem objetivo configurado, o pop-up avisa e não inventa GETD', async ({ page }) => {
    const s0 = estado();
    const st = JSON.parse(s0['cutting.v1']);
    st.goals = { nome: 'Pedro' }; st.getd = 0;
    s0['cutting.v1'] = JSON.stringify(st);
    await abrirApp(page, s0);
    await clicar(page, '#fdMais');
    await clicar(page, '#exogPopSeg [data-v="sim"]');
    await marcar(page, 'exogPopLista', 'clen');
    const nota = await page.evaluate(() => document.getElementById('exogPopNota').textContent);
    expect(nota).toMatch(/Defina seu objetivo/);
    await clicar(page, '#exogPopSalvar');
    await page.waitForTimeout(200);
    const s = await store(page);
    expect(s.goals.exog).toEqual(['clen']);
    expect(s.getd).toBe(0);
  });

  test('nenhum diálogo do navegador em todo o fluxo', async ({ page }) => {
    let dialogos = 0;
    page.on('dialog', d => { dialogos++; d.dismiss(); });
    await abrirApp(page, estado());
    await clicar(page, '#fdMais');
    await clicar(page, '#exogPopSeg [data-v="sim"]');
    await marcar(page, 'exogPopLista', 'anab');
    await clicar(page, '#exogPopSalvar');
    await page.waitForTimeout(200);
    expect(dialogos).toBe(0);
  });
});
