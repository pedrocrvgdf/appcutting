/* Monitoramento de erros: precisa capturar defeito sem levar junto dado de
   saúde do usuário, e não pode derrubar o app se a Sentry estiver fora do ar. */

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, isolarRede, coletarErros, urlApp, RAIZ } = require('./app');

const DSN_ESPERADO = 'https://7aaeee92a2510ed6867849ed623aec88@o4511949986856960.ingest.us.sentry.io/4511950149779456';

/* Substitui o carregador da Sentry por um espião: guarda a configuração que o
   app pediu, sem depender da rede. */
const SENTRY_FALSO = `
window.Sentry={init:function(o){window.__sentryConfig=o;}};
if(typeof window.sentryOnLoad==="function")window.sentryOnLoad();
`;

async function abrirComSentryFalso(page, storage) {
  await isolarRede(page.context());
  await page.route('**/js.sentry-cdn.com/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: SENTRY_FALSO }));
  const erros = coletarErros(page);
  await page.goto(urlApp());
  if (storage) {
    await page.evaluate(s => { for (const k in s) localStorage.setItem(k, s[k]); }, storage);
    await page.reload();
  }
  await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return erros;
}

test.describe('Monitoramento de erros', () => {

  test('a versão enviada acompanha o cache do service worker', () => {
    // se as duas se desencontrarem, o erro chega marcado com a versão errada
    const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const noSw = sw.match(/const CACHE\s*=\s*"([^"]+)"/);
    const noHtml = html.match(/window\.APP_RELEASE\s*=\s*"([^"]+)"/);

    expect(noSw, 'CACHE não encontrado em sw.js').toBeTruthy();
    expect(noHtml, 'APP_RELEASE não encontrado em index.html').toBeTruthy();
    expect(noHtml[1], `sw.js está em ${noSw[1]} e o index.html em ${noHtml[1]}`).toBe(noSw[1]);
  });

  test('o carregador aponta para o mesmo projeto do DSN', () => {
    /* O endereço do carregador embute a chave pública do projeto. Se o projeto
       for recriado e só o DSN for trocado, o carregador continua apontando para
       o projeto antigo e nenhum erro chega — falhando em silêncio. */
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const noCarregador = html.match(/js\.sentry-cdn\.com\/([a-f0-9]+)\.min\.js/);
    const noDsn = html.match(/dsn\s*:\s*"https:\/\/([a-f0-9]+)@/);

    expect(noCarregador, 'tag do carregador não encontrada').toBeTruthy();
    expect(noDsn, 'dsn não encontrado').toBeTruthy();
    expect(noCarregador[1], `carregador usa ${noCarregador[1]} e o DSN usa ${noDsn[1]}`).toBe(noDsn[1]);
  });

  test('a tag do carregador é assíncrona', () => {
    // sem async a tag trava a leitura da página e a abertura fica refém da rede
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const tag = html.match(/<script[^>]*js\.sentry-cdn\.com[^>]*>/);
    expect(tag, 'tag do carregador não encontrada').toBeTruthy();
    expect(tag[0], `a tag precisa de async: ${tag[0]}`).toMatch(/\basync\b/);
  });

  test('configura com o projeto certo e sem rastreamento invasivo', async ({ page }) => {
    const erros = await abrirComSentryFalso(page, estadoBase());
    const cfg = await page.evaluate(() => window.__sentryConfig);

    expect(cfg, 'Sentry.init deveria ter sido chamado').toBeTruthy();
    expect(cfg.dsn).toBe(DSN_ESPERADO);
    expect(cfg.release).toMatch(/^tresults-v\d+$/);
    expect(cfg.sendDefaultPii, 'não enviar IP nem cookies').toBe(false);
    expect(cfg.tracesSampleRate, 'sem rastreamento de desempenho').toBe(0);
    expect(cfg.replaysSessionSampleRate, 'gravação de tela mostraria peso e dieta').toBe(0);
    expect(cfg.replaysOnErrorSampleRate).toBe(0);
    expect(erros).toEqual([]);
  });

  test('limpa e-mail e identificadores antes de enviar', async ({ page }) => {
    await abrirComSentryFalso(page, estadoBase());

    const limpo = await page.evaluate(() => {
      const ev = window.__sentryConfig.beforeSend({
        user: { email: 'pedro@exemplo.com', id: 'u1' },
        message: 'falha ao salvar para pedro@exemplo.com',
        request: { url: 'https://x/users/aBcDeFgHiJkLmNoPqRsTuVwX', cookies: 'a=1', headers: { A: 'b' } },
        exception: { values: [{ value: 'permissão negada para pedro@exemplo.com' }] },
        breadcrumbs: [{ message: 'login de pedro@exemplo.com', data: { url: 'https://x/aBcDeFgHiJkLmNoPqRsTuVwX' } }],
      });
      return {
        user: ev.user,
        message: ev.message,
        url: ev.request.url,
        cookies: ev.request.cookies,
        headers: ev.request.headers,
        excecao: ev.exception.values[0].value,
        migalha: ev.breadcrumbs[0].message,
        migalhaUrl: ev.breadcrumbs[0].data.url,
      };
    });

    expect(limpo.user, 'quem é o usuário não interessa ao relatório').toBeUndefined();
    expect(limpo.cookies).toBeUndefined();
    expect(limpo.headers).toBeUndefined();
    for (const campo of ['message', 'excecao', 'migalha']) {
      expect(limpo[campo], `${campo} ainda tem e-mail`).not.toContain('pedro@exemplo.com');
      expect(limpo[campo]).toContain('[email]');
    }
    expect(limpo.url, 'identificador na URL').not.toContain('aBcDeFgHiJkLmNoPqRsTuVwX');
    expect(limpo.migalhaUrl).toContain('[id]');
  });

  test('descarta o rastro do console, que pode conter dados', async ({ page }) => {
    await abrirComSentryFalso(page, estadoBase());

    const r = await page.evaluate(() => {
      const f = window.__sentryConfig.beforeBreadcrumb;
      return {
        console: f({ category: 'console', message: 'peso 82,4 kg' }),
        clique: f({ category: 'ui.click', message: 'botão' }),
        comEmail: f({ category: 'fetch', message: 'GET pedro@exemplo.com' }),
      };
    });

    expect(r.console, 'rastro do console não pode ser enviado').toBeNull();
    expect(r.clique, 'cliques podem ser enviados').toBeTruthy();
    expect(r.comEmail.message).toContain('[email]');
  });

  test('ignora ruído que não é defeito do app', async ({ page }) => {
    await abrirComSentryFalso(page, estadoBase());
    const cfg = await page.evaluate(() => ({
      ignore: window.__sentryConfig.ignoreErrors,
      deny: (window.__sentryConfig.denyUrls || []).length,
    }));

    expect(cfg.ignore.join(' ')).toMatch(/ResizeObserver/);
    expect(cfg.ignore.join(' ')).toMatch(/Failed to fetch/);
    expect(cfg.deny, 'erros de extensão do navegador devem ser descartados').toBeGreaterThan(0);
  });

  test('o app abre normalmente se a Sentry estiver fora do ar', async ({ page }) => {
    await isolarRede(page.context());
    await page.route('**/js.sentry-cdn.com/**', r => r.abort());   // CDN inacessível
    const erros = coletarErros(page);

    await page.goto(urlApp());
    await page.evaluate(s => { for (const k in s) localStorage.setItem(k, s[k]); }, estadoBase());
    await page.reload();
    await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
    await page.waitForTimeout(600);

    const estado = await page.evaluate(() => ({
      view: document.querySelector('.view.on')?.id,
      semSentry: typeof window.Sentry === 'undefined',
    }));

    expect(estado.semSentry, 'a Sentry não deveria ter carregado neste teste').toBe(true);
    expect(estado.view, 'o app precisa abrir mesmo assim').toBe('view-food');
    expect(erros, 'a falha da Sentry não pode virar erro no app').toEqual([]);
  });

  test('o carregamento da Sentry não atrasa a abertura do app', async ({ page }) => {
    await isolarRede(page.context());
    // CDN lenta: 5 segundos para responder
    await page.route('**/js.sentry-cdn.com/**', async r => {
      await new Promise(res => setTimeout(res, 5000));
      r.fulfill({ status: 200, contentType: 'application/javascript', body: SENTRY_FALSO });
    });

    await page.goto(urlApp());
    await page.evaluate(s => { for (const k in s) localStorage.setItem(k, s[k]); }, estadoBase());

    // 'commit' devolve assim que a navegação começa; esperar 'load' mediria o
    // navegador aguardando o script assíncrono, não o app ficar pronto
    const inicio = Date.now();
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
    const demorou = Date.now() - inicio;

    expect(demorou, `app levou ${demorou}ms com a Sentry travada em 5s`).toBeLessThan(3000);
  });
});
