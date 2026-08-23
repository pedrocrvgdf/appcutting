/* O feed do Início.

   Ele é o histórico do esforço: cada cartão é uma sessão já feita. O que mais
   importa aqui não é a aparência — é a progressão, que é um número calculado.
   Um cálculo errado ali faz a pessoa achar que subiu carga quando não subiu. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO } = require('./app');

/** Uma sessão de treino já registrada, no formato que o app grava. */
const sessao = (nome, vol, extra = {}) => ({
  id: 's' + Math.random().toString(36).slice(2, 9),
  name: nome,
  min: 52,
  kcal: 310,
  vol,
  intens: 'intensa',
  rir: 1.5,
  ex: [
    { n: 'Supino reto', g: 'peito', sec: [], sets: [
      { kg: vol / 100, rep: 10, rir: 1 },
      { kg: vol / 100, rep: 9, rir: 1 },
    ] },
    { n: 'Remada curvada', g: 'costas', sec: [], sets: [
      { kg: vol / 120, rep: 10, rir: 2 },
    ] },
  ],
  ...extra,
});

/** Cardio lançado à mão: sem séries, sem volume — o feed precisa aguentar. */
const cardio = () => ({
  id: 'c1', name: 'Corrida', min: 30, kcal: 280, km: 5, intens: 'moderada · 10,0 km/h',
});

const comTreinos = tdays => estadoBase({ tdays });

const cartoes = page => page.evaluate(() =>
  [...document.querySelectorAll('#fdFeed .fd-card')].map(c => ({
    nome: c.querySelector('.fd-nome .n').textContent,
    selo: c.querySelector('.fd-prog')?.textContent.trim() || null,
    stats: [...c.querySelectorAll('.fd-stat .v')].map(v => v.textContent),
  })));

test.describe('Feed do Início', () => {

  test('o app abre no Início', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    expect(await page.evaluate(() => document.querySelector('.view.on')?.id)).toBe('view-inicio');
    expect(erros).toEqual([]);
  });

  test('sem treino nenhum, explica o que vai aparecer ali', async ({ page }) => {
    /* Área vazia sem explicação faz a pessoa achar que o app quebrou. */
    await abrirApp(page, estadoBase());
    const vazio = await page.evaluate(() => document.querySelector('#fdFeed .fd-vazio')?.textContent || '');
    expect(vazio).toMatch(/nenhum treino/i);
    expect(vazio, 'precisa dizer o que vai aparecer aqui').toMatch(/carga|calorias|duração/i);
  });

  test('mostra nome, duração, gasto e volume de cada sessão', async ({ page }) => {
    const erros = await abrirApp(page, comTreinos({ [diaISO(0)]: [sessao('Treino A', 4000)] }));
    const c = await cartoes(page);

    expect(c).toHaveLength(1);
    expect(c[0].nome).toBe('Treino A');
    expect(c[0].stats[0]).toContain('52');    // duração
    expect(c[0].stats[1]).toContain('310');   // kcal
    expect(c[0].stats[2]).toContain('4000');  // volume
    expect(erros).toEqual([]);
  });

  test('a progressão compara com a sessão anterior DO MESMO treino', async ({ page }) => {
    /* O ponto do feed. 4000 kg hoje contra 3200 na vez anterior = +25%.
       O Treino B no meio existe para provar que ele não entra na conta. */
    await abrirApp(page, comTreinos({
      [diaISO(0)]: [sessao('Treino A', 4000)],
      [diaISO(1)]: [sessao('Treino B', 9999)],
      [diaISO(2)]: [sessao('Treino A', 3200)],
    }));
    const c = await cartoes(page);
    expect(c[0].nome).toBe('Treino A');
    expect(c[0].selo, 'de 3200 para 4000 kg são +25%').toContain('+25%');
  });

  test('queda de carga aparece como queda, não como zero', async ({ page }) => {
    /* Esconder a queda seria mentir para quem usa o app para progredir. */
    await abrirApp(page, comTreinos({
      [diaISO(0)]: [sessao('Treino A', 3000)],
      [diaISO(3)]: [sessao('Treino A', 4000)],
    }));
    const c = await cartoes(page);
    expect(c[0].selo).toContain('-25%');
  });

  test('sem sessão anterior, diz que é a primeira — não inventa 0%', async ({ page }) => {
    await abrirApp(page, comTreinos({ [diaISO(0)]: [sessao('Treino A', 4000)] }));
    const c = await cartoes(page);
    expect(c[0].selo).toMatch(/primeira vez/i);
    expect(c[0].selo, 'zero por cento seria um dado inventado').not.toContain('0%');
  });

  test('mesma carga é dito como mesma carga', async ({ page }) => {
    await abrirApp(page, comTreinos({
      [diaISO(0)]: [sessao('Treino A', 4000)],
      [diaISO(2)]: [sessao('Treino A', 4000)],
    }));
    const c = await cartoes(page);
    expect(c[0].selo).toMatch(/mesma carga/i);
  });

  test('as sessões vêm da mais recente para a mais antiga', async ({ page }) => {
    await abrirApp(page, comTreinos({
      [diaISO(5)]: [sessao('Treino C', 1000)],
      [diaISO(0)]: [sessao('Treino A', 2000)],
      [diaISO(2)]: [sessao('Treino B', 3000)],
    }));
    expect((await cartoes(page)).map(c => c.nome)).toEqual(['Treino A', 'Treino B', 'Treino C']);
  });

  test('registro manual sem séries não quebra o feed', async ({ page }) => {
    /* Cardio lançado à mão não tem volume nem exercícios. Antes de existir o
       feed isso nunca foi lido por este caminho. */
    const erros = await abrirApp(page, comTreinos({ [diaISO(0)]: [cardio()] }));
    const c = await cartoes(page);
    expect(c).toHaveLength(1);
    expect(c[0].nome).toBe('Corrida');
    expect(c[0].selo, 'sem volume não há progressão a mostrar').toBeNull();
    expect(erros).toEqual([]);
  });

  test('tocar no cartão expande os exercícios sem sair do feed', async ({ page }) => {
    await abrirApp(page, comTreinos({ [diaISO(0)]: [sessao('Treino A', 4000)] }));

    const visivel = () => page.evaluate(() => {
      const m = document.querySelector('#fdFeed .fd-mais');
      return !!m && getComputedStyle(m).display !== 'none';
    });

    expect(await visivel(), 'fechado por padrão: o feed é para percorrer').toBe(false);
    await page.evaluate(() => document.querySelector('[data-fdtoggle]').click());
    await page.waitForTimeout(250);
    expect(await visivel()).toBe(true);

    expect(await page.evaluate(() =>
      [...document.querySelectorAll('#fdFeed .fd-ex .en')].map(e => e.textContent)))
      .toEqual(['Supino reto', 'Remada curvada']);

    await page.evaluate(() => document.querySelector('[data-fdtoggle]').click());
    await page.waitForTimeout(250);
    expect(await visivel(), 'tocar de novo fecha').toBe(false);
  });

  test('a sessão inteira abre com todas as séries e a comparação', async ({ page }) => {
    await abrirApp(page, comTreinos({
      [diaISO(0)]: [sessao('Treino A', 4000)],
      [diaISO(2)]: [sessao('Treino A', 3200)],
    }));

    await page.evaluate(() => document.querySelector('[data-fdtoggle]').click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('[data-fdver]').click());
    await page.waitForTimeout(300);

    expect(await page.evaluate(() =>
      document.getElementById('sessaoOverlay').classList.contains('open'))).toBe(true);
    expect(await page.evaluate(() => document.getElementById('ssTitulo').textContent)).toBe('Treino A');

    const series = await page.evaluate(() =>
      [...document.querySelectorAll('#ssCorpo .ss-serie .c')].map(e => e.textContent));
    expect(series, 'as três séries das duas sessões precisam estar ali').toHaveLength(3);

    /* 40 kg hoje contra 32 na vez anterior: +8 kg no supino. */
    expect(await page.evaluate(() =>
      document.querySelector('#ssCorpo .tp-d')?.textContent)).toContain('+8');
  });

  test('o resumo do dia leva para a alimentação', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await page.evaluate(() => document.getElementById('fdDia').click());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.querySelector('.view.on')?.id)).toBe('view-food');
  });

  test('o Progresso continua alcançável, agora de dentro do Início', async ({ page }) => {
    /* Ele saiu da barra de abas; se o atalho quebrar, a tela some do app. */
    await abrirApp(page, estadoBase());
    await page.evaluate(() => document.getElementById('fdIrProgresso').click());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.querySelector('.view.on')?.id)).toBe('view-progresso');

    expect(await page.evaluate(() =>
      document.querySelector('#tabbar [data-tab="inicio"]').classList.contains('on')),
      'sem aba acesa a pessoa perde a referência de onde está').toBe(true);

    await page.evaluate(() => document.querySelector('#view-progresso [data-volta]').click());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.querySelector('.view.on')?.id)).toBe('view-inicio');
  });
});

test.describe('Progressão além do que o feed mostra', () => {

  test('a 61ª sessão não se declara "primeira vez"', async ({ page }) => {
    /* O feed mostra 60 sessões. Se a progressão só olhasse essa fatia, a de
       número 61 anunciaria estreia mesmo havendo dezenas dela antes — e a
       pessoa acharia que o app perdeu o histórico dela. */
    const tdays = {};
    for (let d = 0; d < 62; d++) tdays[diaISO(d)] = [sessao('Treino A', 4000 - d * 10)];

    await abrirApp(page, comTreinos(tdays));

    const mostrados = await page.evaluate(() => document.querySelectorAll('#fdFeed .fd-card').length);
    expect(mostrados, 'o feed corta em 60').toBe(60);

    expect(await page.evaluate(() => document.getElementById('fdCount').textContent),
      'mas a contagem diz a verdade sobre o total').toContain('62');

    const selos = await page.evaluate(() =>
      [...document.querySelectorAll('#fdFeed .fd-prog')].map(e => e.textContent));
    expect(selos.filter(t => /primeira vez/i.test(t)),
      'nenhuma sessão mostrada é a primeira: existem 62').toEqual([]);
  });

  test('a distância do cardio cabe na coluna', async ({ page }) => {
    /* "moderada · 10,1 km/h" não cabia e era cortado no meio da palavra. */
    await abrirApp(page, comTreinos({ [diaISO(0)]: [cardio()] }));
    const v = await page.evaluate(() =>
      [...document.querySelectorAll('#fdFeed .fd-stat')].map(s => ({
        k: s.querySelector('.k').textContent,
        v: s.querySelector('.v').textContent,
        corta: s.querySelector('.v').scrollWidth > s.querySelector('.v').clientWidth + 1,
      })));
    expect(v[2].k, 'a unidade vive no rótulo justamente para o valor caber').toBe('Distância (km)');
    expect(v[2].v, '5 km é "5", não "5,0" — ninguém escreve assim').toBe('5');
    expect(v.filter(x => x.corta), 'nenhuma coluna pode cortar o texto').toEqual([]);
  });

  test('distância quebrada usa vírgula, não ponto', async ({ page }) => {
    /* O app é em português: 7.5 km escrito com ponto é erro de idioma, e no
       feed a distância era a única casa decimal que ainda saía crua. */
    await abrirApp(page, comTreinos({ [diaISO(0)]: [{ ...cardio(), km: 7.5 }] }));
    const c = await cartoes(page);
    expect(c[0].stats[2]).toBe('7,5');

    expect(await page.evaluate(() =>
      document.querySelector('#fdFeed .fd-nome .h').textContent)).toBe('7,5 km');
  });

  test('os três números do cartão ficam na mesma altura', async ({ page }) => {
    /* "Duração (min)" quebra em duas linhas e "Gasto (kcal)" não: sem alinhar
       por baixo, o 52 descia abaixo do 310 e o cartão ficava torto. Medido,
       porque a fonte real muda quantas linhas cada rótulo ocupa. */
    await abrirApp(page, comTreinos({ [diaISO(0)]: [sessao('Treino A', 4250)] }));
    await page.addStyleTag({ content: '*{letter-spacing:.06em !important}' });

    const base = await page.evaluate(() =>
      [...document.querySelector('#fdFeed .fd-card').querySelectorAll('.fd-stat .v')]
        .map(v => Math.round(v.getBoundingClientRect().bottom)));

    expect(base).toHaveLength(3);
    expect(Math.max(...base) - Math.min(...base),
      'os três valores precisam repousar na mesma linha de base').toBeLessThanOrEqual(1);
  });

  test('a carga máxima do exercício também vem com vírgula', async ({ page }) => {
    /* Anilha de 2,5 kg é o pão de cada dia da academia: 57.5 tem que sair
       "57,5". Foi assim que o placeholder de carga já apareceu cortado antes. */
    await abrirApp(page, comTreinos({ [diaISO(0)]: [sessao('Treino A', 5750)] }));
    await page.evaluate(() => document.querySelector('[data-fdtoggle]').click());
    await page.waitForTimeout(250);
    const es = await page.evaluate(() =>
      [...document.querySelectorAll('#fdFeed .fd-ex .es')].map(e => e.textContent));
    expect(es[0], 'vol/100 = 57,5 kg no supino').toContain('57,5');
    expect(es.join(' '), 'ponto decimal não existe em pt-BR').not.toContain('.');
  });

  test('a sessão inteira também escreve as cargas com vírgula', async ({ page }) => {
    /* Aqui aparecem duas casas decimais de uma vez: a carga de cada série e a
       diferença para a última vez. Ambas saíam com ponto — "42.5 kg", "+8.5 kg". */
    await abrirApp(page, comTreinos({
      [diaISO(0)]: [sessao('Treino A', 4250)],
      [diaISO(2)]: [sessao('Treino A', 3400)],
    }));
    await page.evaluate(() => document.querySelector('[data-fdtoggle]').click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('[data-fdver]').click());
    await page.waitForTimeout(300);

    const series = await page.evaluate(() =>
      [...document.querySelectorAll('#ssCorpo .ss-serie .c')].map(e => e.textContent));
    expect(series[0], '4250/100 = 42,5 kg').toContain('42,5');

    const delta = await page.evaluate(() =>
      document.querySelector('#ssCorpo .tp-d')?.textContent);
    expect(delta, 'de 34 para 42,5 kg são +8,5').toContain('+8,5');

    expect(await page.evaluate(() => document.getElementById('ssCorpo').textContent),
      'nenhum ponto decimal em tela nenhuma').not.toContain('.');
  });
});
