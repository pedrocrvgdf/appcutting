/* Entrar com a digital.

   O pedido do dono: escreveu o e-mail, e se esse e-mail já tem cadastro neste
   aparelho, a digital é pedida — porque entende-se que já existe conta.

   O que está em jogo aqui não é conveniência: é a senha da conta, guardada no
   celular. Todo caminho que falha precisa terminar na senha digitada, nunca
   numa pessoa presa fora da própria conta. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase } = require('./app');

const CONTA = 'pedro@t-results.app';
const SENHA = 'senha-de-verdade';

/** A ponte do Android, deslogado, com ou sem senha guardada. */
const PONTE = op => {
  window.__semLogin = true;
  window.__nativo = [];
  window.__cred = op.cred || null;
  window.TResults = {
    disponivel: () => true,
    versao: () => '1.3',
    iniciarDescanso: () => {},
    cancelarDescanso: () => {},
    somDoAlarme: () => 'Cesium',
    escolherSom: () => {},
    testarSom: () => {},
    volumeDoAlarme: () => 100,
    definirVolume: () => {},
    digitalDisponivel: () => op.biometria !== false,
    atalhoAtivo: () => !!window.__cred,
    atalhoConfere: e => !!window.__cred && window.__cred.email === e,
    guardarAtalho: () => {},
    entrarComDigital: email => {
      window.__nativo.push({ chamada: 'entrarComDigital', email });
      setTimeout(() => {
        if (window.__digitalFalha)
          return window.__digital({ acao: 'entrar', ok: false, motivo: window.__digitalFalha });
        if (!window.__cred || window.__cred.email !== email)
          return window.__digital({ acao: 'entrar', ok: false, motivo: 'outra_conta' });
        window.__digital({ acao: 'entrar', ok: true, senha: window.__cred.senha, motivo: '' });
      }, 10);
    },
    esquecerAtalho: () => { window.__nativo.push({ chamada: 'esquecerAtalho' }); window.__cred = null; },
  };
};

const escrever = async (page, texto) => {
  await page.evaluate(t => {
    const c = document.getElementById('email');
    c.value = t; c.dispatchEvent(new Event('input', { bubbles: true }));
  }, texto);
  await page.waitForTimeout(300);
};

const naTelaDeEntrada = page =>
  page.evaluate(() => document.querySelector('.view.on')?.id);

const botaoVisivel = page => page.evaluate(() => {
  const b = document.getElementById('btnDigital');
  return !!b && getComputedStyle(b).display !== 'none';
});

const aviso = page => page.evaluate(() => document.getElementById('authMsg').textContent);

test.describe('A digital na tela de entrada', () => {

  test('o app começa na tela de entrada quando não há sessão', async ({ page }) => {
    await page.addInitScript(PONTE, {});
    const erros = await abrirApp(page, estadoBase());
    expect(await naTelaDeEntrada(page)).toBe('view-login');
    expect(erros).toEqual([]);
  });

  test('sem e-mail escrito, a digital não é oferecida', async ({ page }) => {
    /* Oferecer antes de saber de quem é a conta seria pedir o dedo à toa. */
    await page.addInitScript(PONTE, { cred: { email: CONTA, senha: SENHA } });
    await abrirApp(page, estadoBase());

    expect(await botaoVisivel(page)).toBe(false);
    expect(await page.evaluate(() => window.__nativo.length)).toBe(0);
  });

  test('escrever um e-mail com cadastro pede a digital na hora', async ({ page }) => {
    /* É literalmente o pedido: "se esse email tiver cadastrado, vai pedir a
       biometria pois entende-se que já tem cadastro". */
    await page.addInitScript(PONTE, { cred: { email: CONTA, senha: SENHA } });
    await abrirApp(page, estadoBase());
    await escrever(page, CONTA);

    expect(await page.evaluate(() =>
      window.__nativo.filter(c => c.chamada === 'entrarComDigital').map(c => c.email)))
      .toEqual([CONTA]);
    expect(await botaoVisivel(page), 'e o botão fica ali para tentar de novo').toBe(true);
  });

  test('a digital confirmada entra na conta', async ({ page }) => {
    await page.addInitScript(PONTE, { cred: { email: CONTA, senha: SENHA } });
    await abrirApp(page, estadoBase());
    await page.evaluate(s => { window.__senhaCerta = s; }, SENHA);
    await escrever(page, CONTA);
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => window.__logins || []),
      'a senha guardada é a que entra, sem ninguém digitar').toEqual([{ email: CONTA, senha: SENHA }]);
    expect(await naTelaDeEntrada(page), 'e o app sai da tela de entrada').not.toBe('view-login');
  });

  test('e-mail de outra conta não oferece a digital', async ({ page }) => {
    /* A digital do dono do celular não pode entrar na conta de outra pessoa só
       porque o dedo é o mesmo. */
    await page.addInitScript(PONTE, { cred: { email: CONTA, senha: SENHA } });
    await abrirApp(page, estadoBase());
    await escrever(page, 'outra@pessoa.com');

    expect(await botaoVisivel(page)).toBe(false);
    expect(await page.evaluate(() => window.__nativo.length)).toBe(0);
  });

  test('sem senha guardada, a tela é a de sempre', async ({ page }) => {
    await page.addInitScript(PONTE, {});
    await abrirApp(page, estadoBase());
    await escrever(page, CONTA);

    expect(await botaoVisivel(page)).toBe(false);
    expect(await naTelaDeEntrada(page)).toBe('view-login');
  });

  test('celular sem biometria não mostra o botão', async ({ page }) => {
    await page.addInitScript(PONTE, { biometria: false, cred: { email: CONTA, senha: SENHA } });
    await abrirApp(page, estadoBase());
    await escrever(page, CONTA);

    expect(await botaoVisivel(page)).toBe(false);
  });

  test('no navegador comum nada disso aparece', async ({ page }) => {
    /* Sem a ponte não há cofre nenhum: um botão de digital ali seria mentira. */
    await page.addInitScript(() => { window.__semLogin = true; });
    const erros = await abrirApp(page, estadoBase());
    await escrever(page, CONTA);

    expect(await botaoVisivel(page)).toBe(false);
    expect(await naTelaDeEntrada(page)).toBe('view-login');
    expect(erros).toEqual([]);
  });
});

test.describe('Quando a digital não resolve', () => {

  test('cancelar deixa a senha à mão, sem acusar erro', async ({ page }) => {
    /* Cancelar é uma escolha, não uma falha: encher a tela de vermelho por isso
       trata a pessoa como se tivesse errado algo. */
    await page.addInitScript(PONTE, { cred: { email: CONTA, senha: SENHA } });
    await abrirApp(page, estadoBase());
    await page.evaluate(() => { window.__digitalFalha = 'cancelado'; });
    await escrever(page, CONTA);
    await page.waitForTimeout(300);

    expect(await aviso(page)).toBe('');
    expect(await naTelaDeEntrada(page)).toBe('view-login');
    expect(await page.evaluate(() =>
      getComputedStyle(document.getElementById('pass')).display),
      'o campo de senha continua ali').not.toBe('none');
  });

  test('digital nova cadastrada no celular explica e volta para a senha', async ({ page }) => {
    /* A chave do Keystore é destruída de propósito quando alguém cadastra outro
       dedo. Sem explicar, a pessoa ficaria batendo num botão que não responde. */
    await page.addInitScript(PONTE, { cred: { email: CONTA, senha: SENHA } });
    await abrirApp(page, estadoBase());
    await page.evaluate(() => { window.__digitalFalha = 'biometria_mudou'; });
    await escrever(page, CONTA);
    await page.waitForTimeout(300);

    expect(await aviso(page)).toMatch(/digital.*mudou/i);
    expect(await naTelaDeEntrada(page)).toBe('view-login');
  });

  test('senha trocada em outro aparelho apaga o atalho em vez de insistir', async ({ page }) => {
    /* A senha guardada aqui não vale mais. Manter o botão seria oferecer para
       sempre um caminho que nunca mais funciona. */
    await page.addInitScript(PONTE, { cred: { email: CONTA, senha: 'senha-antiga' } });
    await abrirApp(page, estadoBase());
    await page.evaluate(s => { window.__senhaCerta = s; }, SENHA);
    await escrever(page, CONTA);
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => window.__nativo.map(c => c.chamada))).toContain('esquecerAtalho');
    expect(await botaoVisivel(page)).toBe(false);
    expect(await aviso(page)).toMatch(/senha/i);
    expect(await naTelaDeEntrada(page)).toBe('view-login');
  });

  test('depois de cancelar, escrever de novo não reabre o pedido sozinho', async ({ page }) => {
    /* Reabrir o prompt a cada tecla depois de a pessoa ter dito não é
       perseguição. O botão fica, e quem decide é ela. */
    await page.addInitScript(PONTE, { cred: { email: CONTA, senha: SENHA } });
    await abrirApp(page, estadoBase());
    await page.evaluate(() => { window.__digitalFalha = 'cancelado'; });
    await escrever(page, CONTA);
    await page.waitForTimeout(300);

    await escrever(page, CONTA.slice(0, -1));
    await escrever(page, CONTA);
    await page.waitForTimeout(300);

    expect(await page.evaluate(() =>
      window.__nativo.filter(c => c.chamada === 'entrarComDigital').length),
      'pedido uma vez só').toBe(1);
    expect(await botaoVisivel(page), 'mas o botão continua disponível').toBe(true);
  });
});
