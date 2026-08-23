/* Excluir os dados da conta.

   É a única ação do app que não tem volta: `pushRemote` grava o documento
   inteiro sem merge, então o apagado sobe por cima do histórico na nuvem e não
   sobra cópia em lugar nenhum — nem local, nem remota. Quem estiver com o
   celular destravado na mão não pode conseguir isso sozinho. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO } = require('./app');

const SENHA = 'senha-de-verdade';

/** Um estado com histórico, para dar o que perder. */
const comHistorico = () => estadoBase({
  weights: [{ d: diaISO(3), w: 81 }, { d: diaISO(0), w: 80 }],
  tdays: { [diaISO(0)]: [{ id: 's1', name: 'Treino A', min: 50, kcal: 300, vol: 4000, ex: [] }] },
});

const irAoPerfil = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="perfil"]').click());
  await page.waitForTimeout(250);
};

/** Abre "Excluir dados" e devolve o diálogo já na tela. */
const pedirExclusao = async page => {
  await irAoPerfil(page);
  await page.evaluate(() => document.getElementById('pfReset').click());
  await page.waitForTimeout(250);
};

const digitar = (page, senha) => page.evaluate(s => {
  const c = document.getElementById('dgPw');
  c.value = s; c.dispatchEvent(new Event('input', { bubbles: true }));
}, senha);

const confirmar = async page => {
  await page.evaluate(() => document.getElementById('dgConfirm').click());
  await page.waitForTimeout(350);
};

const temHistorico = page => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('cutting.v1') || '{}');
  return (s.weights || []).length > 0 && Object.keys(s.tdays || {}).length > 0;
});

test.describe('Excluir dados pede a senha da conta', () => {

  test('o campo de senha aparece no aviso', async ({ page }) => {
    /* Sem ele, três toques bastam: Perfil → Excluir dados → Sim. */
    const erros = await abrirApp(page, comHistorico());
    await pedirExclusao(page);

    expect(await page.evaluate(() =>
      document.getElementById('dangerOverlay').classList.contains('open'))).toBe(true);
    expect(await page.evaluate(() =>
      getComputedStyle(document.getElementById('dgPwWrap')).display),
      'a senha é a única coisa que quem pegou o celular não tem').not.toBe('none');
    expect(erros).toEqual([]);
  });

  test('confirmar sem digitar a senha não apaga nada', async ({ page }) => {
    await abrirApp(page, comHistorico());
    await pedirExclusao(page);
    await confirmar(page);

    expect(await page.evaluate(() =>
      document.getElementById('dangerOverlay').classList.contains('open')),
      'o aviso continua aberto, cobrando a senha').toBe(true);
    expect(await page.evaluate(() => document.getElementById('dgErr').textContent))
      .toMatch(/senha/i);
    expect(await temHistorico(page), 'nada pode ter sido apagado').toBe(true);
  });

  test('senha errada não apaga nada', async ({ page }) => {
    await abrirApp(page, comHistorico());
    await page.evaluate(s => { window.__senhaCerta = s; }, SENHA);

    await pedirExclusao(page);
    await digitar(page, 'chute');
    await confirmar(page);

    expect(await temHistorico(page), 'o histórico precisa continuar inteiro').toBe(true);
    expect(await page.evaluate(() => document.querySelector('.view.on')?.id),
      'o app não pode ter voltado para o primeiro acesso').not.toBe('view-welcome');
  });

  test('a senha digitada é conferida contra a conta de verdade', async ({ page }) => {
    /* Conferir contra qualquer outra coisa — um valor guardado no aparelho, por
       exemplo — seria teatro: quem tem o celular também tem o que está nele. */
    await abrirApp(page, comHistorico());
    await page.evaluate(s => { window.__senhaCerta = s; }, SENHA);

    await pedirExclusao(page);
    await digitar(page, SENHA);
    await confirmar(page);

    const conferidas = await page.evaluate(() => window.__reauth || []);
    expect(conferidas, 'o Firebase precisa ter sido consultado').toHaveLength(1);
    expect(conferidas[0].email, 'com o e-mail da conta logada').toBe('teste@t-results.app');
    expect(conferidas[0].senha).toBe(SENHA);
  });

  test('com a senha certa, apaga mesmo', async ({ page }) => {
    /* O outro lado do risco: uma trava que não deixa a própria dona apagar os
       dados dela é um defeito, não uma proteção. */
    await abrirApp(page, comHistorico());
    await page.evaluate(s => { window.__senhaCerta = s; }, SENHA);

    await pedirExclusao(page);
    await digitar(page, SENHA);
    await confirmar(page);

    expect(await temHistorico(page)).toBe(false);
    expect(await page.evaluate(() => document.querySelector('.view.on')?.id)).toBe('view-welcome');
  });

  test('sem conta na nuvem, não há senha a exigir', async ({ page }) => {
    /* No modo local não existe senha nenhuma para conferir. Exigir uma ali
       trancaria a pessoa fora dos próprios dados — uma proteção que vira
       defeito. */
    await abrirApp(page, comHistorico());
    await page.evaluate(() => __t.setUser(null));

    await pedirExclusao(page);
    expect(await page.evaluate(() =>
      getComputedStyle(document.getElementById('dgPwWrap')).display)).toBe('none');

    await confirmar(page);

    expect(await page.evaluate(() => window.__reauth || []),
      'sem conta, ninguém a quem perguntar').toEqual([]);
    expect(await temHistorico(page), 'e a exclusão precisa acontecer').toBe(false);
  });

  test('a senha não fica guardada no campo depois de usada', async ({ page }) => {
    /* O valor de um input é lido por qualquer script da página, e a Sentry e os
       módulos do Firebase rodam nela. */
    await abrirApp(page, comHistorico());
    await page.evaluate(s => { window.__senhaCerta = s; }, SENHA);

    await pedirExclusao(page);
    await digitar(page, SENHA);
    await confirmar(page);

    expect(await page.evaluate(() => document.getElementById('dgPw').value)).toBe('');
  });

  test('sem internet a exclusão não acontece por engano', async ({ page }) => {
    /* Se a conferência falhar por rede, apagar assim mesmo seria o pior dos
       mundos: o dado some e a senha nunca foi conferida. */
    await abrirApp(page, comHistorico());
    await page.evaluate(() => {
      window.__reauth = [];
      const fb = window.__fb;
      fb.reauthenticateWithCredential = () => {
        const e = new Error('offline'); e.code = 'auth/network-request-failed';
        return Promise.reject(e);
      };
    });

    await pedirExclusao(page);
    await digitar(page, SENHA);
    await confirmar(page);

    expect(await temHistorico(page)).toBe(true);
  });
});
