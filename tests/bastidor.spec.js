/* Bastidor da nuvem e da busca (#87).

   (a) O Firestore recusa documento acima de 1 MiB, e o app grava tudo num
       documento só: a recusa seria calada. O app mede o documento a cada
       gravação e avisa no Perfil a partir de 700 KB; o Sentry recebe só a
       faixa. E sem espaço no aparelho o save() parava no meio: agora ele
       segue, e avisa.
   (b) A busca disparava até quatro pedidos por frase à Open Food Facts, um
       deles por um proxy de terceiro. Agora é um por vez, em cascata, com
       1,2 s de espera depois da última tecla e no máximo 8 por minuto. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, isolarRede, coletarErros, urlApp } = require('./app');

const PRODUTO = n => ({ product_name: n, brands: 'Marca', countries_tags: ['en:brazil'],
  nutriments: { 'energy-kcal_100g': 250, proteins_100g: 10, carbohydrates_100g: 20, fat_100g: 12 } });

/* Os dois corredores da Open Food Facts e o proxy de antes, contados. */
async function rede(page, { cgi = 'ok', sal = 'ok' } = {}) {
  const pedidos = [];
  const ctx = page.context();
  const responder = (r, modo, chave) => {
    const u = decodeURIComponent(r.request().url());
    const q = (u.match(/search_terms=([^&]*)/) || u.match(/[?&]q=([^&]*)/) || [, ''])[1].replace(/ countries_tags.*$/, '');
    pedidos.push({ c: chave, br: u.includes('cc=br') || u.includes('countries_tags:"en:brazil"'), q, t: Date.now() });
    if (modo === 'falha') return r.fulfill({ status: 503, body: 'não disponível' });
    if (modo === 'cai') return r.abort();
    const lista = modo === 'vazio' ? [] : [PRODUTO(q.trim() + ' especial')];
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chave === 'cgi' ? { products: lista } : { hits: lista }) });
  };
  await ctx.route('**/world.openfoodfacts.org/**', r => responder(r, cgi, 'cgi'));
  await ctx.route('**/search.openfoodfacts.org/**', r => responder(r, sal, 'sal'));
  await ctx.route('**/api.allorigins.win/**', r => { pedidos.push({ c: 'proxy' }); r.abort(); });
  return pedidos;
}
const irAlimentacao = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="food"]').click());
  await page.waitForTimeout(300);
};
const digitar = (page, txt) => page.evaluate(t => {
  const c = document.getElementById('search');
  c.focus(); c.value = t; c.dispatchEvent(new Event('input', { bubbles: true }));
}, txt);
const enter = page => page.evaluate(() => document.getElementById('search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
const online = page => page.evaluate(() => [...document.querySelectorAll('#drop .opt[data-offidx] .n')].map(e => e.textContent));
const drop = page => page.evaluate(() => document.getElementById('drop').textContent);
/* Frases que o banco não conhece: a busca sozinha entra. */
const FRASES = ['xablau', 'zumzum', 'quibix', 'trolola', 'pipoquinha xyz', 'nhoque wq', 'qwerty', 'bibimbap zz', 'tchurusbango'];

test.describe('A busca na Open Food Facts', () => {

  test('um pedido por frase, e nenhum ao proxy de antes', async ({ page }) => {
    const pedidos = await rede(page);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'xablau');
    await page.waitForTimeout(2000);
    expect(pedidos.map(p => p.c + (p.br ? ':br' : ':mundo'))).toEqual(['cgi:br']);
    expect((await online(page)).length).toBe(1);
  });

  test('espera 1,2 s depois da última tecla; o Enter busca na hora', async ({ page }) => {
    const pedidos = await rede(page);
    await abrirApp(page, estadoBase());
    expect(await page.evaluate(() => __t.OFF_ESPERA)).toBe(1200);
    await irAlimentacao(page);
    await digitar(page, 'xablau');
    await page.waitForTimeout(900);
    expect(pedidos.length, 'ainda digitando').toBe(0);
    await page.waitForTimeout(900);
    expect(pedidos.length).toBe(1);
    await digitar(page, 'zumzum');
    await enter(page);
    await page.waitForTimeout(300);
    expect(pedidos.length, 'o Enter não espera').toBe(2);
    await page.waitForTimeout(1500);
    expect(pedidos.length, 'e a espera de antes não manda de novo').toBe(2);
  });

  test('a mesma frase de novo não vai à internet', async ({ page }) => {
    const pedidos = await rede(page);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'xablau'); await enter(page); await page.waitForTimeout(400);
    await digitar(page, 'xabla'); await page.waitForTimeout(100);
    await digitar(page, 'xablau'); await page.waitForTimeout(1800);
    expect(pedidos.length).toBe(1);
    expect((await online(page)).length).toBe(1);
  });

  test('o mundo só entra se o Brasil respondeu vazio', async ({ page }) => {
    const pedidos = [];
    const ctx = page.context();
    await ctx.route('**/world.openfoodfacts.org/**', r => {
      const br = r.request().url().includes('cc=br');
      pedidos.push(br ? 'cgi:br' : 'cgi:mundo');
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ products: br ? [] : [PRODUTO('Xablau importado')] }) });
    });
    await ctx.route('**/search.openfoodfacts.org/**', r => { pedidos.push('sal'); r.abort(); });
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'xablau'); await enter(page);
    await page.waitForTimeout(800);
    expect(pedidos).toEqual(['cgi:br', 'cgi:mundo']);
    expect(await online(page)).toEqual(['Xablau importado · Marca']);
  });

  test('o corredor que falha fica de fora por 10 minutos', async ({ page }) => {
    const pedidos = await rede(page, { cgi: 'falha' });
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'xablau');
    await page.waitForTimeout(2000);
    expect(pedidos.map(p => p.c)).toEqual(['cgi', 'sal']);
    expect((await online(page)).length, 'o outro corredor respondeu').toBe(1);
    await digitar(page, 'zumzum');
    await page.waitForTimeout(2000);
    expect(pedidos.map(p => p.c), 'a segunda frase nem tenta o que caiu').toEqual(['cgi', 'sal', 'sal']);
  });

  test('sem nenhum corredor, avisa', async ({ page }) => {
    const pedidos = await rede(page, { cgi: 'cai', sal: 'cai' });
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'xablau');
    await page.waitForTimeout(2000);
    expect(await drop(page)).toMatch(/Não consegui buscar online/);
    expect(pedidos.filter(p => p.c === 'proxy').length).toBe(0);
  });

  test('no máximo 8 por minuto: a busca sozinha para calada, o toque explica', async ({ page }) => {
    const pedidos = await rede(page);
    await abrirApp(page, estadoBase());
    expect(await page.evaluate(() => __t.OFF_POR_MIN)).toBe(8);
    await irAlimentacao(page);
    for (const f of FRASES.slice(0, 8)) { await digitar(page, f); await enter(page); await page.waitForTimeout(250); }
    expect(pedidos.length).toBe(8);
    await digitar(page, FRASES[8]);
    await page.waitForTimeout(1800);
    expect(pedidos.length, 'o nono não sai').toBe(8);
    const txt = await drop(page);
    expect(txt, 'sem susto: a linha de buscar continua ali').toContain(`Buscar "${FRASES[8]}" na internet`);
    expect(txt).not.toMatch(/Não consegui|Muitas buscas/);
    await page.evaluate(() => document.querySelector('#drop [data-off]').click());
    await page.waitForTimeout(200);
    expect(await drop(page)).toMatch(/^Muitas buscas na internet em pouco tempo\. Tente de novo em \d+ s\.$/);
    expect(pedidos.length).toBe(8);
  });

  test('o limite que chega no meio da cascata também fica calado na busca sozinha', async ({ page }) => {
    /* Sete pedidos com resposta; o oitavo é o Brasil vazio de uma frase, e
       o mundo dela seria o nono: a busca sozinha para sem aviso. */
    const pedidos = [];
    const ctx = page.context();
    await ctx.route('**/world.openfoodfacts.org/**', r => {
      const u = decodeURIComponent(r.request().url()), br = u.includes('cc=br');
      pedidos.push(br ? 'br' : 'mundo');
      const vazio = u.includes('tchurusbango');
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ products: vazio ? [] : [PRODUTO('Achado')] }) });
    });
    await ctx.route('**/search.openfoodfacts.org/**', r => r.abort());
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    for (const f of FRASES.slice(0, 7)) { await digitar(page, f); await enter(page); await page.waitForTimeout(250); }
    expect(pedidos.length).toBe(7);
    await digitar(page, 'tchurusbango');
    await page.waitForTimeout(1800);
    expect(pedidos, 'o Brasil saiu; o mundo, não').toEqual([...Array(7).fill('br'), 'br']);
    const txt = await drop(page);
    expect(txt).toContain('Buscar "tchurusbango" na internet');
    expect(txt).not.toMatch(/Muitas buscas|Não consegui/);
  });

  test('o rastro do diagnóstico anota o corredor e o resultado, nunca o que foi digitado', async ({ page }) => {
    await rede(page, { cgi: 'falha' });
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'xablau');
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => JSON.parse(localStorage.getItem('tresults.rastro') || '[]').map(x => x.e));
    expect(r).toContain('internet: sal br ok, 1');
    expect(r.some(e => /^internet: cgi br falhou \(HTTP 503\)$/.test(e)), r.join(' | ')).toBe(true);
    expect(r.join(' '), 'nunca o que a pessoa digitou').not.toMatch(/xablau/);
  });

  test('a política de privacidade diz que a busca vai à Open Food Facts', async ({ page }) => {
    await isolarRede(page.context());
    await page.goto(urlApp().replace(/\.test-app\.html.*$/, 'privacidade.html'));
    const txt = await page.textContent('body');
    expect(txt).toContain('Open Food Facts');
    expect(txt).toContain('Vai só o texto da busca, sem o seu nome, e-mail ou conta.');
  });
});

test.describe('O tamanho do documento na nuvem', () => {

  test('as regras de tamanho do Firestore', async ({ page }) => {
    await abrirApp(page, estadoBase());
    const r = await page.evaluate(() => ({
      ab: __t.tamanhoFs('ab'), acento: __t.tamanhoFs('ç'), emoji: __t.tamanhoFs('🔥'), n: __t.tamanhoFs(3000.5),
      b: __t.tamanhoFs(true), nulo: __t.tamanhoFs(null), lista: __t.tamanhoFs([1, 2]), mapa: __t.tamanhoFs({ a: 'x' }),
      max: __t.NUVEM_MAX, aviso: __t.NUVEM_AVISO,
    }));
    expect(r).toEqual({ ab: 3, acento: 3, emoji: 5, n: 8, b: 1, nulo: 1, lista: 16, mapa: 4, max: 1048576, aviso: 716800 });
  });

  /* Semeia antes do app (como em sem-sinal.spec.js) e entra na nuvem falsa. */
  async function abrirNuvem(page, aparelho) {
    await isolarRede(page.context());
    const erros = coletarErros(page);
    await page.addInitScript(() => { window.__sentry = []; window.Sentry = { captureMessage: m => window.__sentry.push(m) }; });
    await page.addInitScript(s => {
      if (localStorage.getItem('__semeado')) return;
      localStorage.clear();
      for (const k in s) localStorage.setItem(k, s[k]);
      localStorage.setItem('__semeado', '1');
    }, { 'cutting.v1': JSON.stringify(aparelho), 'cutting.owner': 'u1', '__nuvem': JSON.stringify(aparelho), 'cutting.pendente': JSON.stringify({ uid: 'u1' }) });
    await page.goto(urlApp());
    await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
    await page.waitForFunction(() => !localStorage.getItem('cutting.pendente') && !__t.enviando, null, { timeout: 15000 });
    return erros;
  }
  const grande = kb => {
    const s = JSON.parse(estadoBase()['cutting.v1']);
    s.custom = Array.from({ length: Math.ceil(kb * 1024 / 85) }  /* ~90 bytes cada, no Firestore */, (_, i) => ({ n: 'Alimento de teste número ' + i + ' com nome comprido', k: 100, p: 1, c: 2, g: 3 }));
    return s;
  };

  test('acima de 700 KB, o Perfil avisa e o Sentry recebe só a faixa', async ({ page }) => {
    const erros = await abrirNuvem(page, grande(760));
    const b = await page.evaluate(() => __t.nuvemBytes);
    expect(b).toBeGreaterThan(700 * 1024);
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="perfil"]').click());
    await page.waitForTimeout(300);
    const linha = await page.evaluate(() => { const e = document.getElementById('pfEspaco'); return e.hidden ? null : e.textContent; });
    expect(linha).toBe(`Seus dados na nuvem: ${Math.round(b / 1024)} KB de 1.024 KB. Perto do limite.`);
    const msgs = await page.evaluate(() => window.__sentry);
    expect(msgs.filter(m => /^Documento na nuvem/.test(m))).toEqual([`Documento na nuvem: ${Math.floor(b / 1024 / 100) * 100}–${Math.floor(b / 1024 / 100) * 100 + 100} KB`]);
    expect(msgs.join(' '), 'nada da pessoa: só o número').not.toMatch(/Alimento|Pedro|u1/);
    // mais uma gravação na mesma abertura: o Sentry não recebe de novo
    await page.evaluate(() => { __t.store.custom.push({ n: 'Mais um', k: 1, p: 0, c: 0, g: 0 }); __t.salvar(); });
    await page.waitForTimeout(1500);
    expect((await page.evaluate(() => window.__sentry)).filter(m => /^Documento/.test(m)).length).toBe(1);
    expect(erros).toEqual([]);
  });

  test('abaixo de 700 KB, nada aparece', async ({ page }) => {
    await abrirNuvem(page, grande(50));
    expect(await page.evaluate(() => __t.nuvemBytes)).toBeGreaterThan(40 * 1024);
    expect(await page.evaluate(() => document.getElementById('pfEspaco').hidden)).toBe(true);
    expect(await page.evaluate(() => window.__sentry.length)).toBe(0);
  });

  test('a medida bate com o tamanho do documento em JSON, na mesma ordem de grandeza', async ({ page }) => {
    await abrirNuvem(page, grande(300));
    const r = await page.evaluate(() => ({ b: __t.nuvemBytes, json: new Blob([JSON.stringify(JSON.parse(localStorage.getItem('__nuvem')))]).size }));
    expect(r.b / r.json).toBeGreaterThan(0.8);
    expect(r.b / r.json).toBeLessThan(1.3);
  });
});

test.describe('A nuvem que recusa a leitura', () => {

  /* A leitura da abertura falha com o código dado, e o Sentry é falso. */
  async function abrirRecusando(page, code) {
    await isolarRede(page.context());
    await page.addInitScript(c => {
      window.__sentry = []; window.Sentry = { captureMessage: m => window.__sentry.push(m) };
      let fb;
      Object.defineProperty(window, '__fb', { configurable: true, get: () => fb,
        set: v => { fb = Object.assign({}, v, { getDoc: () => Promise.reject(Object.assign(new Error('recusado'), { code: c })) }); } });
    }, code);
    await page.addInitScript(s => {
      if (localStorage.getItem('__semeado')) return;
      for (const k in s) localStorage.setItem(k, s[k]);
      localStorage.setItem('__semeado', '1');
    }, { ...estadoBase(), '__nuvem': estadoBase()['cutting.v1'] });
    await page.goto(urlApp());
    await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
    await page.waitForTimeout(800);
  }

  test('pela regra: o Sentry recebe só o código, uma vez', async ({ page }) => {
    await abrirRecusando(page, 'permission-denied');
    expect(await page.evaluate(() => window.__sentry)).toEqual(['Nuvem recusou a leitura: permission-denied']);
    expect(await page.textContent('#syncText')).toBe('Erro ao carregar');
  });

  test('sem sinal não é defeito: nada vai ao Sentry', async ({ page }) => {
    await abrirRecusando(page, 'unavailable');
    expect(await page.evaluate(() => window.__sentry)).toEqual([]);
  });
});

test.describe('Sem espaço no aparelho', () => {

  /* O setItem do store passa a falhar, como num aparelho sem espaço. */
  const encher = (page, { liberaComBase = false } = {}) => page.evaluate(lib => {
    const orig = Storage.prototype.setItem;
    window.__cheio = true;
    Storage.prototype.setItem = function (k, v) {
      if (window.__cheio && k === 'cutting.v1' && !(lib && !localStorage.getItem('cutting.base'))) {
        const e = new Error('cheio'); e.name = 'QuotaExceededError'; throw e;
      }
      return orig.call(this, k, v);
    };
  }, liberaComBase);

  test('o lançamento segue, avisa uma vez, e o Perfil diz', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    await encher(page);
    const r = await page.evaluate(() => { try { __t.store.weights.push({ d: '2026-11-01', w: 79 }); __t.salvar(); return 'ok'; } catch (e) { return 'quebrou: ' + e.message; } });
    expect(r, 'antes o save() lançava e parava quem o chamou').toBe('ok');
    await page.waitForSelector('#appDlgOverlay.open', { timeout: 3000 });
    expect(await page.textContent('#appDlgMsg')).toContain('O espaço do app neste celular acabou');
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(200);
    await page.evaluate(() => __t.salvar());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('appDlgOverlay').classList.contains('open')), 'uma vez por abertura').toBe(false);
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="perfil"]').click());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('pfEspaco').textContent)).toMatch(/^Sem espaço neste aparelho\./);
    // o espaço voltou: a próxima gravação guarda, e a linha some
    await page.evaluate(() => { window.__cheio = false; __t.salvar(); });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById('pfEspaco').hidden)).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cutting.v1')).weights.some(x => x.w === 79))).toBe(true);
    expect(erros).toEqual([]);
  });

  test('antes de desistir, solta o que é só cópia', async ({ page }) => {
    await abrirApp(page, { ...estadoBase(), 'cutting.base': JSON.stringify({ uid: 'u1', doc: { x: 1 } }), 'tresults.rastro': '[]' });
    await encher(page, { liberaComBase: true });
    await page.evaluate(() => { __t.store.weights.push({ d: '2026-11-01', w: 78 }); __t.salvar(); });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('appDlgOverlay').classList.contains('open')), 'coube depois de soltar a cópia').toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('cutting.base'))).toBeNull();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cutting.v1')).weights.some(x => x.w === 78))).toBe(true);
  });
});
