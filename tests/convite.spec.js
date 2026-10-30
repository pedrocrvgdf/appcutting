/* A página do convite (#97).

   O pedido: "o link/código que eu enviar deve levar o usuário a baixar o app
   e o Obtainium para atualizar o app". Quem recebe ainda não tem nada
   instalado. O que pode dar errado: o código não aparecer (ou aparecer o
   que alguém pôs no link), o botão do Obtainium apontar para outro lugar, o
   iPhone receber só os passos de Android, e a página empurrar a tela de
   lado num celular estreito. */

const { test, expect } = require('@playwright/test');
const path = require('path');
const { RAIZ } = require('./app');

const PAGINA = 'file://' + path.join(RAIZ, 'convite.html');
const abrir = async (page, q = '') => {
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto(PAGINA + q);
  return erros;
};
const estado = page => page.evaluate(() => ({
  codigo: document.getElementById('codigo').textContent,
  cartao: !document.getElementById('codigoCard').hidden,
  semCodigo: !document.getElementById('semCodigo').hidden,
  web: document.getElementById('web').getAttribute('href'),
  obtainium: document.getElementById('obtainium').getAttribute('href'),
  baixar: document.getElementById('baixarObtainium').getAttribute('href'),
  ordem: [...document.querySelectorAll('section')].map(s => s.id),
}));

test.describe('Página do convite', () => {

  test('mostra o código e leva ao Obtainium, ao app por ele e ao navegador com o código', async ({ page }) => {
    const erros = await abrir(page, '?c=abc234');
    const e = await estado(page);
    expect(e.codigo).toBe('ABC234');
    expect([e.cartao, e.semCodigo]).toEqual([true, false]);
    expect(e.obtainium, 'abre o Obtainium já com o endereço do app').toBe('obtainium://add/https://github.com/pedrocrvgdf/appcutting');
    expect(e.baixar).toBe('https://github.com/ImranR98/Obtainium/releases/latest');
    expect(e.web, 'no navegador, o app abre o pedido já preenchido').toBe('./?convite=ABC234');
    expect(e.ordem).toEqual(['android', 'iphone']);
    expect(erros).toEqual([]);
  });

  test('código fora do formato não aparece: a página pede o código ao treinador', async ({ page }) => {
    for (const q of ['', '?c=K0P3QX', '?c=%3Cimg%20src=x%20onerror=alert(1)%3E', '?c=ABC2345']) {
      await abrir(page, q);
      const e = await estado(page);
      expect([e.cartao, e.semCodigo, e.web], q).toEqual([false, true, './']);
      expect(await page.evaluate(() => document.querySelectorAll('img').length), q).toBe(1);   // só a marca
    }
  });

  test('no iPhone, o caminho do navegador vem primeiro', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    const page = await ctx.newPage();
    await abrir(page, '?c=ABC234');
    const e = await estado(page);
    expect(e.ordem).toEqual(['iphone', 'android']);
    expect(await page.textContent('#iphoneTit')).toBe('No iPhone');
    await ctx.close();
  });

  test('copiar o código e o endereço do app', async ({ page }) => {
    await page.addInitScript(() => { window.__copiado = []; navigator.clipboard.writeText = t => { window.__copiado.push(t); return Promise.resolve(); }; });
    await abrir(page, '?c=ABC234');
    await page.click('#copiar');
    await page.click('#copiarEnd');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.__copiado)).toEqual(['ABC234', 'https://github.com/pedrocrvgdf/appcutting']);
    expect(await page.textContent('#copiado')).toBe('Código copiado.');
  });

  test('só carrega a fonte de fora, e nada de script de terceiro', async ({ page }) => {
    const fora = [];
    page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) fora.push(new URL(r.url()).host); });
    await abrir(page, '?c=ABC234');
    expect([...new Set(fora)].every(h => h === 'fonts.googleapis.com')).toBe(true);
    expect(await page.evaluate(() => [...document.scripts].filter(s => s.src).length)).toBe(0);
  });

  for (const [largura, tema] of [[320, 'light'], [390, 'dark']]) {
    test(`em ${largura} px (${tema === 'dark' ? 'tema escuro' : 'tema claro'}), sem rolagem de lado`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 740 });
      await page.emulateMedia({ colorScheme: tema });
      await abrir(page, '?c=ABC234');
      const r = await page.evaluate(() => ({
        rola: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        fundo: getComputedStyle(document.body).backgroundColor,
      }));
      expect(r.rola).toBe(false);
      expect(r.fundo).toBe(tema === 'dark' ? 'rgb(18, 23, 21)' : 'rgb(246, 245, 241)');
    });
  }
});
