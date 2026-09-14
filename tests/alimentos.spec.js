/* Busca de alimentos.

   A reclamação do dono: "o repertório de pesquisa não está achando nada". Duas
   causas no código. O casamento local era `nome.includes(frase)` — "ovos" não
   achava "Ovo cozido", "peito frango" não achava "Frango grelhado (peito)". E a
   busca na internet só rodava se a pessoa tocasse numa linha discreta, e ainda
   jogava fora todo produto que só trouxesse a energia em kJ — que é como muito
   rótulo brasileiro chega do Open Food Facts. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase } = require('./app');

const digitar = async (page, texto) => {
  await page.evaluate(t => {
    const c = document.getElementById('search');
    c.value = t; c.dispatchEvent(new Event('input', { bubbles: true }));
  }, texto);
  await page.waitForTimeout(80);
};

const nomesDoDrop = page => page.evaluate(() =>
  [...document.querySelectorAll('#drop .opt[data-idx] .n')].map(e => e.textContent));

const irAlimentacao = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="food"]').click());
  await page.waitForTimeout(300);
};

test.describe('Busca no banco local', () => {

  test('plural acha o singular: "ovos" encontra o ovo', async ({ page }) => {
    /* Era o caso mais comum de "não acha nada": a pessoa escreve como fala. */
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'ovos');
    const n = await nomesDoDrop(page);
    expect(n.length).toBeGreaterThan(0);
    expect(n[0]).toMatch(/^Ovo /);
  });

  test('palavras fora de ordem: "peito frango" encontra o peito de frango', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'peito frango');
    const n = await nomesDoDrop(page);
    expect(n[0]).toBe('Frango grelhado (peito)');
  });

  test('uma letra errada não zera a lista: "frnago"', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'frnago');
    const n = await nomesDoDrop(page);
    expect(n.some(x => /frango/i.test(x)), 'digitação no celular erra letra o tempo todo').toBe(true);
  });

  test('o mais afim vem primeiro, não o primeiro que foi digitado no banco', async ({ page }) => {
    /* Com includes, a ordem era a do arquivo: "Arroz" podia vir depois de um
       nome que só contém arroz no meio. */
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'arroz');
    const n = await nomesDoDrop(page);
    expect(n[0]).toMatch(/^Arroz /);
    expect(n.every(x => /arroz/i.test(x))).toBe(true);
  });

  test('apelido regional: "aipim" encontra a mandioca', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'aipim');
    const n = await nomesDoDrop(page);
    expect(n.some(x => /mandioca/i.test(x))).toBe(true);
  });

  test('nome repetido no banco aparece uma vez só', async ({ page }) => {
    /* O banco tem "Banana prata" duas vezes; mostrar as duas parece defeito. */
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'banana');
    const n = await nomesDoDrop(page);
    expect(new Set(n).size).toBe(n.length);
  });

  test('palavra que não existe em nenhum nome não devolve lixo', async ({ page }) => {
    /* Casar só metade da frase daria "Frango" para "frango com xyzabc". */
    await abrirApp(page, estadoBase());
    const r = await page.evaluate(() => __t.buscaAlimentos('frango xyzabc', __t.FOODS).length);
    expect(r).toBe(0);
  });

  test('a busca do protocolo de refeições usa o mesmo casamento', async ({ page }) => {
    /* Eram duas cópias do `includes`; consertar uma e esquecer a outra é o
       jeito de o defeito voltar por outra porta. */
    await abrirApp(page, estadoBase());
    await page.evaluate(() => {
      const c = document.getElementById('pmSearch');
      c.value = 'ovos'; c.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(100);
    const n = await page.evaluate(() =>
      [...document.querySelectorAll('#pmDrop .opt[data-i] .n')].map(e => e.textContent));
    expect(n[0]).toMatch(/^Ovo /);
  });
});

/* ---- Open Food Facts, imitado ----
   A rede desta sessão não alcança o serviço; os testes respondem no lugar
   dele, com o formato real das duas APIs (hits / products). */
const PRODUTOS = [
  { product_name: 'Gatorade Zero', brands: 'Gatorade', quantity: '500 ml',
    countries_tags: ['en:united-states'],
    nutriments: { 'energy-kcal_100g': 2, proteins_100g: 0, carbohydrates_100g: 0.4, fat_100g: 0 } },
  /* rótulo brasileiro: só kJ, sem o campo em kcal */
  { product_name: 'Gatorade Zero Limão', brands: 'Gatorade', quantity: '500 ml',
    countries_tags: ['en:brazil'],
    nutriments: { energy_100g: 8, proteins_100g: 0, carbohydrates_100g: 0.5, fat_100g: 0 } },
  { product_name: 'Gatorade Zero', brands: 'Gatorade', quantity: '500 ml',   // repetido
    countries_tags: ['en:brazil'],
    nutriments: { 'energy-kcal_100g': 2, proteins_100g: 0, carbohydrates_100g: 0.4, fat_100g: 0 } },
  { product_name: 'Sem energia nenhuma', nutriments: { proteins_100g: 1 } },
];

async function comOff(page, resposta) {
  const ctx = page.context();
  await ctx.route('**/search.openfoodfacts.org/**', r =>
    resposta ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hits: resposta }) }) : r.abort());
  await ctx.route('**/world.openfoodfacts.org/**', r =>
    resposta ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ products: resposta }) }) : r.abort());
  await ctx.route('**/api.allorigins.win/**', r => r.abort());
}

const nomesOnline = page => page.evaluate(() =>
  [...document.querySelectorAll('#drop .opt[data-offidx] .n')].map(e => e.textContent));

test.describe('Busca na internet', () => {

  test('quando o banco não responde, a internet é consultada sozinha', async ({ page }) => {
    /* Antes era uma linha discreta que ninguém tocava — e a pessoa concluía
       que "não acha nada". */
    await comOff(page, PRODUTOS);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'gatorade zero');
    await page.waitForTimeout(1300);   // espera a pessoa parar de digitar

    const n = await nomesOnline(page);
    expect(n.length, 'a internet precisa ter sido consultada sem toque').toBeGreaterThan(0);
  });

  test('produto que só traz kJ entra, com as kcal convertidas', async ({ page }) => {
    await comOff(page, PRODUTOS);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'gatorade zero');
    await page.waitForTimeout(1300);

    const limao = await page.evaluate(() =>
      [...document.querySelectorAll('#drop .opt[data-offidx]')]
        .map(o => ({ n: o.querySelector('.n').textContent, m: o.querySelector('.m').textContent }))
        .find(x => /Lim/.test(x.n)));
    expect(limao, 'era descartado por não ter energy-kcal_100g').toBeTruthy();
    expect(limao.m).toMatch(/^2 kcal/);   // 8 kJ / 4,184 ≈ 2
  });

  test('produto brasileiro vem antes do estrangeiro, e nome repetido só uma vez', async ({ page }) => {
    await comOff(page, PRODUTOS);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'gatorade zero');
    await page.waitForTimeout(1300);

    const n = await nomesOnline(page);
    expect(new Set(n).size).toBe(n.length);
    /* os dois primeiros são os brasileiros (Limão e o Zero duplicado, que
       desempata pelo que chegou antes) */
    expect(n.slice(0, 2).every(x => /Gatorade/.test(x))).toBe(true);
    expect(n.some(x => /Sem energia/.test(x)), 'sem caloria não serve para contar').toBe(false);
  });

  test('sem serviço, avisa em vez de ficar mudo', async ({ page }) => {
    await comOff(page, null);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'gatorade zero');
    await page.waitForTimeout(1600);

    expect(await page.evaluate(() => document.getElementById('drop').textContent))
      .toMatch(/Não consegui buscar online/);
  });

  test('digitar outra coisa cancela a consulta antiga', async ({ page }) => {
    /* Sem isso, o resultado de "gatorade" chegaria por cima da lista de
       "frango" que a pessoa já estava vendo. */
    await comOff(page, PRODUTOS);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'gatorade zero');
    await page.waitForTimeout(300);
    await digitar(page, 'frango');
    await page.waitForTimeout(1300);

    expect(await nomesOnline(page)).toEqual([]);
    expect((await nomesDoDrop(page))[0]).toMatch(/frango/i);
  });

  test('a linha para forçar a busca continua quando o banco já respondeu', async ({ page }) => {
    await comOff(page, PRODUTOS);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'frango');
    expect(await page.evaluate(() => !!document.querySelector('#drop [data-off]'))).toBe(true);
  });
});
