/* Abertura do app: antes disto, o usuário olhava para uma tela em branco
   enquanto o Firebase confirmava o login — na academia, com sinal ruim,
   parecia app travado. */

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, isolarRede, coletarErros, urlApp, RAIZ } = require('./app');

/* Abre o app com o login demorando: é o caso da academia com sinal ruim,
   e o único momento em que a tela de abertura fica visível. */
async function abrirLento(page, atrasoMs = 2500) {
  await isolarRede(page.context());
  await page.route('**/firebasejs/**/firebase-auth.js', async r => {
    await new Promise(res => setTimeout(res, atrasoMs));
    r.fulfill({
      status: 200, contentType: 'application/javascript', body: `
      export function getAuth(){return {};}
      export function onAuthStateChanged(a,fn){setTimeout(()=>fn({uid:"u1",email:"t@t.com"}),20);}
      export function signInWithEmailAndPassword(){return Promise.resolve();}
      export function createUserWithEmailAndPassword(){return Promise.resolve();}
      export function signOut(){return Promise.resolve();}
      export function sendPasswordResetEmail(){return Promise.resolve();}
      export const EmailAuthProvider={credential:()=>({})};
      export function reauthenticateWithCredential(){return Promise.resolve();}
      export function deleteUser(){return Promise.resolve();}`,
    });
  });
  await page.goto(urlApp());
  await page.evaluate(s => { for (const k in s) localStorage.setItem(k, s[k]); }, estadoBase());
  await page.reload({ waitUntil: 'commit' });
}

test.describe('Abertura', () => {

  test('a tela de abertura sai assim que o app tem o que mostrar', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    await page.waitForTimeout(700);

    const estado = await page.evaluate(() => ({
      splash: !!document.getElementById('splash'),
      view: document.querySelector('.view.on')?.id,
    }));

    expect(estado.view, 'o app deveria ter aberto').toBe('view-inicio');
    expect(estado.splash, 'a abertura precisa sumir do documento').toBe(false);
    expect(erros).toEqual([]);
  });

  test('cobre a espera do login em vez de deixar tela em branco', async ({ page }) => {
    await abrirLento(page);
    await page.waitForTimeout(900);   // login ainda não respondeu

    const durante = await page.evaluate(() => {
      const s = document.getElementById('splash');
      if (!s) return { existe: false };
      const marca = document.querySelector('.sp-mark');
      return {
        existe: true,
        visivel: getComputedStyle(s).opacity !== '0',
        cobreTudo: s.getBoundingClientRect().height >= window.innerHeight - 1,
        temMarca: !!marca && getComputedStyle(marca).width !== '0px',
        semTelaAberta: !document.querySelector('.view.on'),
      };
    });

    expect(durante.existe, 'sem a abertura, aqui seria tela em branco').toBe(true);
    expect(durante.visivel).toBe(true);
    expect(durante.cobreTudo, 'precisa ocupar a tela inteira').toBe(true);
    expect(durante.temMarca, 'a marca deveria estar visível na espera').toBe(true);
    expect(durante.semTelaAberta, 'nenhuma tela do app abriu ainda').toBe(true);

    // e sai quando o login enfim responde
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
    expect(await page.evaluate(() => document.querySelector('.view.on')?.id)).toBe('view-inicio');
  });

  test('avisa quando a espera se arrasta, em vez de fingir que está tudo bem', async ({ page }) => {
    await abrirLento(page);
    await page.waitForTimeout(300);

    // lê o atraso calculado pelo navegador, não o texto do CSS
    const atrasos = await page.evaluate(() => {
      const seg = el => parseFloat(getComputedStyle(el).animationDelay) || 0;
      return {
        aviso: seg(document.querySelector('.sp-slow')),
        botao: seg(document.querySelector('.sp-retry')),
        textoAviso: document.querySelector('.sp-slow').textContent.trim(),
        textoBotao: document.querySelector('.sp-retry').textContent.trim(),
      };
    });

    expect(atrasos.aviso, 'cedo demais viraria alarme falso').toBeGreaterThanOrEqual(4);
    expect(atrasos.botao, 'o botão de recomeçar vem depois do aviso').toBeGreaterThan(atrasos.aviso);
    expect(atrasos.textoAviso).toMatch(/lenta|tentando/i);
    expect(atrasos.textoBotao).toMatch(/tentar/i);
  });

  test('abertura rápida não pisca a marca na cara do usuário', async () => {
    /* o conteúdo entra com atraso: se o app abre em milissegundos, o usuário
       vê só o fundo — que já é o do app — e nada pisca */
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const regra = html.match(/\.sp-in\{[^}]*\}/);
    expect(regra, 'regra .sp-in não encontrada').toBeTruthy();
    expect(regra[0], 'o conteúdo deve começar invisível').toMatch(/opacity:0/);
    expect(regra[0], 'e entrar só depois de um atraso').toMatch(/animation:[^;}]*0?\.\d+s\s+forwards|animation:[^;}]*\.15s/);
  });

  test('a barra de carregamento parece viva, não parada', async ({ page }) => {
    /* Com ease-in-out e alcance maior que a trilha, o indicador desacelerava
       fora da vista: ficou invisível em 14 de 40 amostras e a barra parecia
       travada. Aqui medimos o quanto ele aparece ao longo de um ciclo. */
    await abrirLento(page, 30000);
    await page.waitForTimeout(900);

    const amostras = await page.evaluate(async () => {
      const trilha = document.querySelector('.sp-bar');
      const ind = document.querySelector('.sp-bar i');
      const r = [];
      for (let i = 0; i < 40; i++) {
        const t = trilha.getBoundingClientRect(), b = ind.getBoundingClientRect();
        r.push(Math.max(0, Math.min(t.right, b.right) - Math.max(t.left, b.left)));
        await new Promise(res => setTimeout(res, 30));
      }
      return r;
    });

    const invisiveis = amostras.filter(v => v <= 0).length;
    expect(invisiveis, `indicador sumiu em ${invisiveis} de ${amostras.length} amostras`)
      .toBeLessThanOrEqual(4);
    expect(Math.max(...amostras), 'o indicador precisa aparecer inteiro em algum momento')
      .toBeGreaterThan(0);
  });

  test('respeita quem desliga animações no sistema', async () => {
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const bloco = html.match(/@media \(prefers-reduced-motion:reduce\)\{[^@]*?\.sp-bar i\{[^}]*\}/s);
    expect(bloco, 'a barra ficaria tremendo sem uma regra própria').toBeTruthy();
    expect(bloco[0]).toMatch(/animation:none/);
  });
});

test.describe('Instalação como app', () => {

  test('declara tela cheia para Android e para iOS', async ({ page }) => {
    await abrirApp(page, estadoBase());

    const metas = await page.evaluate(() => ({
      padrao: document.querySelector('meta[name="mobile-web-app-capable"]')?.content,
      apple: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
    }));

    expect(metas.padrao, 'a padronizada é a que o Android usa').toBe('yes');
    expect(metas.apple, 'a da Apple continua necessária no iOS').toBe('yes');
  });
});
