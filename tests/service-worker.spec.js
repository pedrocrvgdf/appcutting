/* Cache do service worker.

   O app é servido do cache, então um erro aqui não aparece como erro: aparece
   como "o app não atualizou" ou "o app abriu a tela errada". São os defeitos
   mais caros de diagnosticar, porque não deixam rastro nenhum. */

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { RAIZ } = require('./app');

const swFonte = () => fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');

/** Executa o tratador de `fetch` do sw.js num ambiente controlado. */
function navegarPara(endereco) {
  const trecho = swFonte().match(/self\.addEventListener\("fetch"[\s\S]*?\n\}\);/);
  if (!trecho) throw new Error('sw.js precisa tratar o evento fetch');

  const gravadas = [];
  const cache = { put: (chave, res) => { gravadas.push(String(chave)); return Promise.resolve(); } };
  const caches = { open: () => Promise.resolve(cache), match: () => Promise.resolve(null) };
  const resposta = { clone: () => ({ corpo: endereco }) };
  const fetch = () => Promise.resolve(resposta);
  const location = { origin: 'https://exemplo.github.io' };

  /* CACHE é declarado fora do trecho extraído. Sem passá-lo, o corpo estoura
     com ReferenceError dentro de um `.then()` que ninguém observa, e o teste
     mede silêncio em vez de comportamento. */
  const CACHE = swFonte().match(/CACHE\s*=\s*"([^"]+)"/)[1];

  const self = { addEventListener: (nome, fn) => { if (nome === 'fetch') self.__fetch = fn; } };
  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'location', 'CACHE', trecho[0])(
    self, caches, fetch, location, CACHE);

  let devolvida = null;
  self.__fetch({
    request: { url: endereco, mode: 'navigate' },
    respondWith: p => { devolvida = p; },
  });

  /* A gravação no cache é uma promessa solta dentro do sw.js — ninguém espera
     por ela. Sem esta folga, a lista é lida antes de a gravação acontecer e
     TODOS os testes passam, inclusive os que deveriam falhar. */
  return Promise.resolve(devolvida)
    .then(() => new Promise(r => setTimeout(r, 0)))
    .then(() => gravadas);
}

test.describe('Cache do service worker', () => {

  test('guarda o app como reserva offline ao abrir a raiz', async () => {
    const gravadas = await navegarPara('https://exemplo.github.io/appcutting/');
    expect(gravadas, 'sem isto o app não abre sem internet').toContain('./index.html');
  });

  test('guarda o app ao abrir o index.html direto', async () => {
    const gravadas = await navegarPara('https://exemplo.github.io/appcutting/index.html');
    expect(gravadas).toContain('./index.html');
  });

  test('não grava outra página do site como se fosse o app', async () => {
    /* Defeito real, encontrado ao criar a segunda página do projeto: o
       tratador gravava QUALQUER navegação sob a chave "./index.html". Enquanto
       existia uma página só, ninguém percebia — depois disso, abrir o app sem
       internet mostraria a página de diagnóstico. */
    const gravadas = await navegarPara('https://exemplo.github.io/appcutting/diag.html');
    expect(gravadas, 'só a página do app pode ocupar a reserva offline')
      .not.toContain('./index.html');
  });

  test('a versão do cache acompanha a versão do app', () => {
    const cache = swFonte().match(/CACHE\s*=\s*"([^"]+)"/)[1];
    const app = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8')
      .match(/APP_RELEASE\s*=\s*"([^"]+)"/)[1];
    expect(cache, 'se desencontrarem, a correção não chega em quem já usa o app').toBe(app);
  });

  test('a página de diagnóstico não mexe nos dados do usuário', () => {
    /* Ela apaga cache e service worker de propósito. Se um dia encostar em
       localStorage, apaga treino, peso e medidas de quem só queria entender
       por que a notificação não chegou. */
    const diag = fs.readFileSync(path.join(RAIZ, 'diag.html'), 'utf8');
    expect(diag).not.toMatch(/localStorage\s*\.\s*(clear|removeItem|setItem)/);
    expect(diag).not.toMatch(/indexedDB\s*\.\s*deleteDatabase/);
  });

  test('a página de diagnóstico mostra o rastro que o app anotou', async ({ page }) => {
    /* É por aqui que um "o teclado fechou sozinho" vira dado: a página lê
       tresults.rastro e o põe no relatório, do mais recente ao mais antigo. */
    await page.addInitScript(() => {
      localStorage.setItem('tresults.rastro', JSON.stringify([
        { t: 1700000000000, s: 0.1, e: 'abriu tresults-v35 · app Android' },
        { t: 1700000004000, s: 4.1, e: 'busca perdeu foco → ninguém' },
      ]));
    });
    await page.route('**/*', r => (/\.html$/.test(new URL(r.request().url()).pathname) ? r.continue() : r.abort()));
    await page.goto('file://' + path.join(RAIZ, 'diag.html'));
    await page.waitForTimeout(600);
    const rastro = await page.evaluate(() => [...document.querySelectorAll('#rastro .li .val')].map(e => e.textContent));
    expect(rastro[0]).toBe('busca perdeu foco → ninguém');
    expect(rastro[1]).toMatch(/app Android/);
  });
});
