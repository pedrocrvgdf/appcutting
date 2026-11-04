/* A direção visual, parte 2 (#65): telas secundárias, pop-ups e o tema
   escuro. A revisão tela a tela achou o que tinha ficado do visual antigo:
   emojis coloridos, o alarme em verde cheio (neon no tema escuro), chips
   marcados em bloco chapado, a marca com brilho verde e a página de
   privacidade com a fonte, os cantos e a sombra de antes. */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { abrirApp, estadoBase, URL_HTTP, servirPorHttp, isolarRede } = require('./app');

const RAIZ = path.resolve(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const comTema = tema => ({ ...estadoBase({ academias: [{ id: 'g1', nome: 'Smart' }] }), 'tresults.theme': tema });
const cor = (page, sel, prop = 'backgroundColor') => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
const token = (page, nome) => page.evaluate(n => {
  const d = document.createElement('div'); d.style.background = `var(${n})`; document.body.appendChild(d);
  const c = getComputedStyle(d).backgroundColor; d.remove(); return c;
}, nome);

test.describe('Direção visual, parte 2 (#65)', () => {

  test('nenhum emoji colorido no app: os ícones são de traço', () => {
    const s = ler('index.html');
    const achados = [];
    for (const [i, l] of s.split('\n').entries()) {
      for (const ch of l) {
        const o = ch.codePointAt(0);
        // pictogramas, dingbats coloridos (✨ ✅) e o seletor que pede o desenho de emoji
        if ((o >= 0x1F300 && o <= 0x1FAFF) || o === 0x2728 || o === 0x2705 || o === 0xFE0F) achados.push(`${i + 1}: ${ch}`);
      }
    }
    expect(achados).toEqual([]);
  });

  for (const tema of ['light', 'dark']) {
    test(`o alarme do descanso usa o verde fosco do saldo (${tema})`, async ({ page }) => {
      await abrirApp(page, comTema(tema));
      const fosco = await token(page, '--saldo-bg');
      await page.evaluate(() => { document.getElementById('restDone').classList.add('open'); document.getElementById('restPop').classList.add('open'); });
      expect(await cor(page, '#restDone')).toBe(fosco);
      expect(await cor(page, '#restPop')).toBe(fosco);
      expect(await cor(page, '#restDone')).not.toBe(await token(page, '--primary'));
      expect(await cor(page, '.rd-go', 'color'), 'o texto do botão é o mesmo verde').toBe(fosco);
    });

    test(`a marca não tem brilho verde e é o verde da marca nos dois temas (${tema})`, async ({ page }) => {
      await page.addInitScript(() => { window.__semLogin = true; });
      await abrirApp(page, comTema(tema));
      // a abertura sai do documento depois de esconder: a regra é conferida num igual
      await page.evaluate(() => { const d = document.createElement('div'); d.className = 'sp-mark'; d.id = 'spTeste'; document.body.appendChild(d); });
      for (const sel of ['#view-login .login-brand .mark', '#spTeste', '#imersao .im-marca']) {
        expect(await cor(page, sel), sel).toBe('rgb(14, 124, 107)');
        expect(await cor(page, sel, 'boxShadow'), sel).toBe('none');
      }
    });

    test(`chip marcado é tinta clara com "✓", não bloco chapado (${tema})`, async ({ page }) => {
      await abrirApp(page, comTema(tema));
      await page.evaluate(() => {
        const w = document.createElement('div'); w.className = 'synchips'; w.id = 'chipsTeste';
        w.innerHTML = '<button class="on">Halteres</button><button>Smith</button>';
        document.body.appendChild(w);
      });
      const r = await page.evaluate(() => {
        const [on, off] = document.querySelectorAll('#chipsTeste button');
        return { on: getComputedStyle(on).backgroundColor, off: getComputedStyle(off).backgroundColor, txt: getComputedStyle(on).color,
          marca: getComputedStyle(on, '::before').content };
      });
      expect(r.on).not.toBe(await token(page, '--primary'));
      expect(r.txt, 'o texto é o verde').toBe(await token(page, '--primary'));
      expect(r.on, 'e se distingue do desmarcado').not.toBe(r.off);
      expect(r.marca).toBe('"✓"');
    });
  }

  test('o aviso das ações destrutivas e o da digital têm ícone de traço', async ({ page }) => {
    await abrirApp(page, comTema('light'));
    const aviso = await page.evaluate(() => document.querySelector('#exogRiscoOverlay .dg-ico svg') !== null);
    expect(aviso, 'o pop-up de riscos').toBe(true);
    // Excluir dados: aviso, vermelho
    await page.evaluate(() => document.getElementById('profReset').click());
    await page.waitForSelector('#dangerOverlay.open');
    expect(await page.evaluate(() => ({ svg: !!document.querySelector('#dgIco svg'), txt: document.getElementById('dgIco').textContent.trim(), neutro: document.getElementById('dgIco').classList.contains('neutro') })))
      .toEqual({ svg: true, txt: '', neutro: false });
    await page.evaluate(() => document.getElementById('dgCancel').click());
    // a digital: cadeado, no verde
    await page.evaluate(() => { window.__t.askDanger({ ico: 'cadeado', title: 'Entrar com a digital', msg: 'x' }); });
    await page.waitForSelector('#dangerOverlay.open');
    expect(await page.evaluate(() => ({ svg: !!document.querySelector('#dgIco svg rect'), neutro: document.getElementById('dgIco').classList.contains('neutro') })))
      .toEqual({ svg: true, neutro: true });
  });

  test('a página de privacidade segue a direção e o tema escolhido no app', async ({ page }) => {
    const h = ler('privacidade.html');
    expect(h).not.toContain('Quicksand');
    expect(h).toContain('family=Sora');
    await isolarRede(page.context());
    await servirPorHttp(page.context());
    await page.goto(URL_HTTP + 'privacidade.html');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 245, 241)');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.card')).borderRadius)).toBe('22px');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.card')).boxShadow)).toContain('0px 0px 0px 1px');
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Sora');
    // escuro escolhido no app, com o celular no claro
    await page.evaluate(() => localStorage.setItem('tresults.theme', 'dark'));
    await page.reload();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(18, 23, 21)');
    // claro escolhido no app, com o celular no escuro
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => localStorage.setItem('tresults.theme', 'light'));
    await page.reload();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 245, 241)');
  });

  test('o diagnóstico e o manifesto usam o fundo do app', async ({ page }) => {
    expect(JSON.parse(ler('manifest.json')).background_color).toBe('#F6F5F1');
    await isolarRede(page.context());
    await servirPorHttp(page.context());
    await page.goto(URL_HTTP + 'diag.html');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 245, 241)');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.card')).borderRadius)).toBe('20px');
  });
});
