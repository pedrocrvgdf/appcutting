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

test.describe('A tabela TACO no banco local', () => {
  /* Tabela Brasileira de Composição de Alimentos, 4ª ed. (NEPA/UNICAMP),
     importada da planilha oficial por tools/importar_taco.py. É ela que cobre
     a comida genérica e o prato pronto que a internet não acha. */

  test('a tabela inteira está no app, com número em todo campo', async ({ page }) => {
    await abrirApp(page, estadoBase());
    const t = await page.evaluate(() => ({
      n: window.__t.TACO.length,
      ruins: window.__t.TACO.filter(f => !f.n || typeof f.k !== 'number' || typeof f.p !== 'number' || typeof f.c !== 'number' || typeof f.g !== 'number' || f.src !== 'taco').length,
      noBanco: window.__t.localList().filter(f => f.src === 'taco').length,
    }));
    expect(t.n, 'a planilha tem 597 linhas; 6 não têm dado nenhum').toBe(591);
    expect(t.ruins).toBe(0);
    expect(t.noBanco, 'a busca enxerga a tabela').toBe(591);
  });

  test('comida genérica que a internet não achava sai do banco, com os valores da planilha', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'picanha grelhada');
    const n = await nomesDoDrop(page);
    expect(n.some(x => /picanha, com gordura, grelhada/i.test(x))).toBe(true);
    const meta = await page.evaluate(() => [...document.querySelectorAll('#drop .opt[data-idx]')]
      .find(o => /picanha, com gordura, grelhada/i.test(o.querySelector('.n').textContent)).querySelector('.m').textContent);
    expect(meta).toMatch(/^289 kcal · P26\.4 C0 G19\.5 \/100g · TACO$/);   // linha 289 da planilha
  });

  test('o nome curto do banco continua vindo antes do nome formal da TACO', async ({ page }) => {
    /* "Arroz branco cozido" responde melhor a "arroz" que "Arroz, tipo 1, cozido" */
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'arroz');
    const n = await nomesDoDrop(page);
    expect(n[0]).toMatch(/^Arroz /);
    expect(n.some(x => /^Arroz, /.test(x)), 'e a TACO vem junto').toBe(true);
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

  test('banco com pouca resposta: a internet complementa embaixo, sem tirar o local', async ({ page }) => {
    /* "linguiça" tinha um nome só no banco, e o dono concluía que o app "não
       acha linguiça". Agora o que vem de fora entra embaixo do que é daqui.
       (Com a TACO, linguiça passou a ter sete nomes; o caso de "pouca
       resposta" é a granola, que tem um.) */
    const GRANOLAS = [
      { product_name: 'Granola Tradicional', brands: 'Mãe Terra', countries_tags: ['en:brazil'],
        nutriments: { 'energy-kcal_100g': 430, proteins_100g: 10, carbohydrates_100g: 65, fat_100g: 14 } },
      { product_name: 'Granola Zero Açúcar', brands: 'Jasmine', countries_tags: ['en:brazil'],
        nutriments: { 'energy-kcal_100g': 410, proteins_100g: 11, carbohydrates_100g: 60, fat_100g: 13 } },
    ];
    await comOff(page, GRANOLAS);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'granola');
    const antes = await nomesDoDrop(page);
    expect(antes.length, 'o banco responde na hora').toBeGreaterThan(0);
    expect(antes.length).toBeLessThan(3);
    await page.waitForTimeout(1300);

    const locais = await nomesDoDrop(page);
    const online = await nomesOnline(page);
    expect(locais, 'o que é local continua em cima').toEqual(antes);
    expect(online.length, 'a internet entrou sozinha para complementar').toBe(2);
    const ordem = await page.evaluate(() => [...document.querySelectorAll('#drop .opt')].map(o => o.dataset.idx !== undefined ? 'local' : (o.dataset.offidx !== undefined ? 'online' : 'outro')));
    expect(ordem.indexOf('online'), 'internet vem depois do local').toBeGreaterThan(ordem.lastIndexOf('local'));
    expect(await page.evaluate(() => !!document.querySelector('#drop [data-off]')), 'a linha de buscar some quando a busca já foi feita').toBe(false);
  });

  test('banco com resposta farta: a internet não é consultada sozinha', async ({ page }) => {
    /* Mandar o que a pessoa digita para fora sem necessidade é dado saindo à toa. */
    let chamadas = 0;
    const ctx = page.context();
    await ctx.route('**/openfoodfacts.org/**', r => { chamadas++; r.fulfill({ status: 200, contentType: 'application/json', body: '{"hits":[]}' }); });
    await ctx.route('**/api.allorigins.win/**', r => r.abort());
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'frango');
    await page.waitForTimeout(1300);
    expect((await nomesDoDrop(page)).length).toBeGreaterThanOrEqual(3);
    expect(chamadas).toBe(0);
  });

});

test.describe('Produto do Brasil primeiro, e sem lixo', () => {

  test('a busca pede produto do Brasil, e só vai ao mundo se o Brasil não responder', async ({ page }) => {
    /* "picanha" devolvia hambúrguer importado; "salmão", um produto só. Com o
       filtro de país, picanha de verdade e 30 coxinhas em vez de 9. */
    const pedidos = [];
    const ctx = page.context();
    await ctx.route('**/search.openfoodfacts.org/**', r => {
      const u = decodeURIComponent(r.request().url());
      /* a lista de campos também contém "countries_tags": o filtro de país é
         o trecho com o valor */
      const brasil = u.includes('countries_tags:"en:brazil"');
      pedidos.push(brasil ? 'brasil' : 'mundo');
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hits: brasil ? [] : [PRODUTOS[0]] }) });
    });
    await ctx.route('**/world.openfoodfacts.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"products":[]}' }));
    await ctx.route('**/api.allorigins.win/**', r => r.abort());
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'gatorade zero');
    await page.waitForTimeout(1500);

    expect(pedidos[0], 'o primeiro pedido é só Brasil').toBe('brasil');
    expect(pedidos, 'o mundo entra como reserva').toContain('mundo');
    expect((await nomesOnline(page)).length, 'a reserva respondeu').toBeGreaterThan(0);
  });

  test('o que não tem nenhuma palavra da pergunta no nome sai da lista', async ({ page }) => {
    /* O serviço casa por ingrediente: "banana" trazia "Protein + Vegan". */
    await comOff(page, [
      { product_name: 'Protein + Vegan', brands: 'Supino', countries_tags: ['en:brazil'],
        nutriments: { 'energy-kcal_100g': 380, proteins_100g: 20, carbohydrates_100g: 40, fat_100g: 10 } },
      { product_name: 'Banana Passa', brands: 'Banana Brasil', countries_tags: ['en:brazil'],
        nutriments: { 'energy-kcal_100g': 290, proteins_100g: 2, carbohydrates_100g: 70, fat_100g: 0.5 } },
    ]);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'banana passa');
    await page.waitForTimeout(1300);
    const n = await nomesOnline(page);
    expect(n.some(x => /Banana Passa/.test(x))).toBe(true);
    expect(n.some(x => /Protein/.test(x)), 'sem banana no nome, não responde à pergunta').toBe(false);
  });
});

test.describe('A lista com o teclado aberto', () => {

  test('em tela curta, a lista cabe entre o campo e a barra de abas, e o campo sobe', async ({ page }) => {
    /* No celular o teclado toma metade da tela. A lista nascia embaixo do
       campo, debaixo do teclado ou da barra de abas, e a pessoa não via o
       que ia escolher. */
    await page.setViewportSize({ width: 390, height: 470 });
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await page.evaluate(() => document.getElementById('search').focus());
    await digitar(page, 'ovo');
    await page.waitForTimeout(900);

    const m = await page.evaluate(() => {
      const d = document.getElementById('drop').getBoundingClientRect();
      const tb = document.getElementById('tabbar').getBoundingClientRect();
      const s = document.getElementById('search').getBoundingClientRect();
      return { fundoLista: d.bottom, topoBarra: tb.top, topoCampo: s.top, alturaJanela: window.innerHeight, maxH: document.getElementById('drop').style.maxHeight };
    });
    expect(m.fundoLista, 'a lista não pode entrar debaixo da barra de abas').toBeLessThanOrEqual(m.topoBarra + 1);
    expect(m.fundoLista).toBeLessThanOrEqual(m.alturaJanela);
    expect(m.topoCampo, 'o campo sobe para o alto, para a lista ter espaço').toBeLessThan(120);
    expect(m.maxH).toMatch(/px$/);
  });

  test('o app anota quem tirou o foco da busca, para o diagnóstico', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await page.evaluate(() => document.getElementById('search').focus());
    await digitar(page, 'ovo');
    await page.evaluate(() => document.getElementById('search').blur());
    await page.waitForTimeout(100);

    const rastro = await page.evaluate(() => JSON.parse(localStorage.getItem('tresults.rastro') || '[]').map(r => r.e));
    expect(rastro.some(e => /^abriu tresults-v\d+/.test(e))).toBe(true);
    expect(rastro).toContain('tela food');
    expect(rastro).toContain('busca ganhou foco');
    expect(rastro).toContain('busca perdeu foco → ninguém');
    expect(rastro.join(' '), 'nunca o que a pessoa digitou').not.toMatch(/ovo/);
  });

  test('a linha para forçar a busca continua quando o banco já respondeu', async ({ page }) => {
    await comOff(page, PRODUTOS);
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await digitar(page, 'frango');
    expect(await page.evaluate(() => !!document.querySelector('#drop [data-off]'))).toBe(true);
  });
});
