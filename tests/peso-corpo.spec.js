/* Flexão, barra fixa e prancha não somem do histórico.

   Série sem carga era descartada ao finalizar o treino (o filtro exigia
   kg > 0): quem fazia flexão anotava as reps e o registro saía com ex:[] e
   vol:0, aparecendo no feed como "registro manual". A prancha, que se mede
   em tempo, nem tinha onde pôr os segundos.

   Nada de "kg movidos" inventado: a fração do corpo que a flexão levanta muda
   com a variação, então o volume em kg desses exercícios é zero e eles contam
   por séries, reps e segundos. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO, iniciarTreino } = require('./app');

const hoje = diaISO(0), ontem = diaISO(1);
const calistenia = extra => estadoBase({
  tprotocol: [{
    id: 'wc', nome: 'Calistenia', cat: 'A', ex: [
      { n: 'Flexão de braço', s: 2, rest: 60, g: 'peito', sec: [] },
      { n: 'Prancha', s: 2, rest: 45, g: 'abdomen', sec: [] },
    ],
  }],
  ...extra,
});
const digitar = (page, sel, txt) => page.evaluate(([s, t]) => {
  const c = document.querySelector(s);
  c.value = t;
  c.dispatchEvent(new Event('input', { bubbles: true }));
}, [sel, txt]);
const clicar = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const serie = i => `#trSets .tr-set[data-i="${i}"]`;
const visivel = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e.closest('.fld') || e).display !== 'none'; }, sel);
const proximo = async page => { await clicar(page, '#trNext'); await page.waitForTimeout(350); };

test.describe('Peso do corpo e tempo', () => {

  test('flexão grava as reps, prancha grava os segundos, e o feed mostra os dois', async ({ page }) => {
    const erros = await abrirApp(page, calistenia());
    await iniciarTreino(page);
    // flexão: só reps à vista, a carga atrás de "+ carga"
    expect(await visivel(page, `${serie(0)} .irep`)).toBe(true);
    expect(await visivel(page, `${serie(0)} .ikg`), 'carga escondida no peso do corpo').toBe(false);
    expect(await page.evaluate(() => !!document.getElementById('trMaisCarga'))).toBe(true);
    await digitar(page, `${serie(0)} .irep`, '15');
    await digitar(page, `${serie(1)} .irep`, '12');
    await proximo(page);
    // prancha: segundos no lugar de reps
    expect(await visivel(page, `${serie(0)} .iseg`)).toBe(true);
    expect(await visivel(page, `${serie(0)} .irep`)).toBe(false);
    await digitar(page, `${serie(0)} .iseg`, '45');
    await digitar(page, `${serie(1)} .iseg`, '40');
    await proximo(page);

    const s = await page.evaluate(h => __t.store.tdays[h][0], hoje);
    expect(s.ex.map(e => e.n)).toEqual(['Flexão de braço', 'Prancha']);
    expect(s.ex[0].sets.map(x => [x.kg, x.rep])).toEqual([[0, 15], [0, 12]]);
    expect(s.ex[1].sets.map(x => x.seg)).toEqual([45, 40]);
    expect(s.vol, 'sem kg movidos inventados').toBe(0);

    await page.evaluate(() => document.querySelector('#tabbar [data-tab="inicio"]').click());
    await page.waitForTimeout(300);
    const card = await page.evaluate(() => document.querySelector('#fdFeed .fd-card').textContent);
    expect(card).not.toContain('registro manual');
    expect(card).toContain('até 15 reps');
    expect(card).toContain('até 45 s');
    expect(card).toContain('primeira vez deste treino');
    expect(erros).toEqual([]);
  });

  test('da próxima vez, a referência diz "15 reps", e a diferença é em reps', async ({ page }) => {
    await abrirApp(page, calistenia({
      tdays: { [ontem]: [{ id: 's0', name: 'Calistenia', tid: 'wc', min: 20, kcal: 90, vol: 0, ex: [
        { n: 'Flexão de braço', g: 'peito', sets: [{ kg: 0, rep: 15, rir: 1 }, { kg: 0, rep: 12, rir: 1 }] },
        { n: 'Prancha', g: 'abdomen', sets: [{ kg: 0, rep: 0, seg: 45 }, { kg: 0, rep: 0, seg: 40 }] },
      ] }] },
    }));
    await iniciarTreino(page);
    expect(await page.evaluate(s => document.querySelector(s).textContent, `${serie(0)} .tp-v`)).toBe('15 reps');
    expect(await page.evaluate(s => document.querySelector(s).placeholder, `${serie(0)} .irep`)).toBe('15');
    await digitar(page, `${serie(0)} .irep`, '17');
    expect(await page.evaluate(s => document.querySelector(s).textContent, `${serie(0)} .tp-d`)).toBe('+2 reps');
    await proximo(page);
    expect(await page.evaluate(s => document.querySelector(s).textContent, `${serie(0)} .tp-v`)).toBe('45 s');
    await digitar(page, `${serie(0)} .iseg`, '45');
    expect(await page.evaluate(s => document.querySelector(s).textContent, `${serie(0)} .tp-d`)).toBe('mesmo tempo');
  });

  test('"+ carga" mostra o campo sem matar o descanso', async ({ page }) => {
    /* renderTr termina em stopRest(): redesenhar a tela para mostrar um campo
       mataria o descanso em andamento. */
    await abrirApp(page, calistenia());
    await iniciarTreino(page);
    await digitar(page, `${serie(0)} .irep`, '15');
    await clicar(page, '#trRest');
    await page.waitForTimeout(150);
    const fim = await page.evaluate(() => __t.trRestEnd);
    expect(fim).toBeGreaterThan(0);
    await clicar(page, '#trMaisCarga');
    await page.waitForTimeout(150);
    expect(await visivel(page, `${serie(0)} .ikg`)).toBe(true);
    expect(await page.evaluate(() => __t.trRestEnd), 'o descanso continua').toBe(fim);
    await digitar(page, `${serie(0)} .ikg`, '10');
    expect(await page.evaluate(() => __t.trS.logs[0][0])).toMatchObject({ kg: 10, rep: 15 });
  });

  test('treino só de peso do corpo compara reps com a vez anterior', async ({ page }) => {
    const sessao = (id, dia, reps) => ({ [dia]: [{ id, name: 'Calistenia', tid: 'wc', min: 20, kcal: 90, vol: 0,
      ex: [{ n: 'Flexão de braço', g: 'peito', sets: reps.map(rep => ({ kg: 0, rep })) }] }] });
    await abrirApp(page, calistenia({ tdays: { ...sessao('s0', ontem, [15, 12]), ...sessao('s1', hoje, [16, 14]) } }));
    const selo = await page.evaluate(() => document.querySelector('#fdFeed .fd-card[data-fd="s1"] .fd-prog').textContent);
    expect(selo).toContain('+11% de reps');
  });

  test('o 1RM ignora série sem carga', async ({ page }) => {
    /* Epley com 0 kg dá 0: a curva de força mostraria a flexão despencando. */
    await abrirApp(page, calistenia({
      tdays: { [ontem]: [{ id: 's0', name: 'Treino A', tid: 'w1', min: 40, kcal: 200, vol: 600, ex: [
        { n: 'Supino reto', g: 'peito', sets: [{ kg: 60, rep: 10 }] },
        { n: 'Flexão de braço', g: 'peito', sets: [{ kg: 0, rep: 20 }] },
      ] }] },
    }));
    const k = await page.evaluate(() => Object.keys(__t.evoData()));
    expect(k).toEqual(['supino reto']);
  });

  test('quem faz o nome decide a cara da linha, e o que tem carga continua com carga', async ({ page }) => {
    await abrirApp(page, estadoBase());
    /* Achou um nome classificado errado? Ponha na tabela. Os de baixo da
       primeira linha em branco vieram da revisão: máquina, cabo, pegada e o
       abdominal no banco declinado ("prancha") eram tratados como peso do
       corpo ou como tempo. */
    const esperado = {
      'Flexão de braço': 'corpo', 'Flexão com joelhos apoiados': 'corpo', 'Barra fixa': 'corpo', 'Mergulho': 'corpo',
      'Abdominal': 'corpo', 'Abdominal infra': 'corpo', 'Abdominal na roda': 'corpo', 'Elevação de pernas': 'corpo',
      'Prancha': 'tempo', 'Prancha lateral': 'tempo',
      'Supino reto': 'carga', 'Cadeira flexora': 'carga', 'Mesa flexora': 'carga', 'Flexão de punho': 'carga',
      'Abdominal na polia': 'carga', 'Agachamento livre': 'carga',

      'Flexão de joelho': 'carga', 'Mergulho máquina': 'carga', 'Abdominal máquina': 'carga', 'Abdominal na corda': 'carga',
      'Abdominal ajoelhado na polia': 'carga', 'Puxada pegada paralela': 'carga', 'Remada com pegada paralela': 'carga',
      'Desenvolvimento pegada paralela': 'carga', 'Flexão lateral de tronco com halter': 'carga',
      'Abdominal na prancha declinada': 'corpo', 'Abdominal na prancha': 'corpo', 'Prancha abdominal': 'tempo',
      'Prancha com anilha': 'tempo', 'Barra fixa pegada supinada': 'corpo', 'Mergulho nas paralelas': 'corpo',
    };
    const r = await page.evaluate(n => Object.fromEntries(n.map(x => [x, __t.exTipo(x)])), Object.keys(esperado));
    expect(r).toEqual(esperado);
  });

  test('prancha classificada errado vira reps com um toque, sem matar o descanso', async ({ page }) => {
    await abrirApp(page, calistenia());
    await iniciarTreino(page);
    await proximo(page);   // prancha
    await digitar(page, `${serie(0)} .iseg`, '45');
    await clicar(page, '#trRest');
    await page.waitForTimeout(150);
    const fim = await page.evaluate(() => __t.trRestEnd);
    await clicar(page, '#trEmReps');
    await page.waitForTimeout(150);
    expect(await visivel(page, `${serie(0)} .irep`)).toBe(true);
    expect(await visivel(page, `${serie(0)} .iseg`)).toBe(false);
    expect(await page.evaluate(() => __t.trRestEnd), 'o descanso continua').toBe(fim);
    await digitar(page, `${serie(0)} .irep`, '20');
    expect(await page.evaluate(() => __t.trS.logs[1][0]), 'os segundos escondidos não ficam').toMatchObject({ rep: 20, seg: 0 });
  });

  test('o que foi digitado antes de trocar o exercício não fica escondido na série', async ({ page }) => {
    /* Prancha com 45 s, trocada por "Abdominal": a linha passa a mostrar só
       reps, e os 45 s escondidos iam para o histórico ("até 45 s" num
       abdominal). */
    await abrirApp(page, calistenia());
    await iniciarTreino(page);
    await proximo(page);   // prancha
    await digitar(page, `${serie(0)} .iseg`, '45');
    await clicar(page, '#trTrocar'); await page.waitForTimeout(250);
    await page.evaluate(() => { const c = document.getElementById('trocaNome'); c.value = 'Abdominal'; c.dispatchEvent(new Event('input', { bubbles: true })); });
    await clicar(page, '#trocaOk'); await page.waitForTimeout(300);
    await digitar(page, `${serie(1)} .irep`, '20');
    await proximo(page);
    const s = await page.evaluate(h => __t.store.tdays[h][0], hoje);
    const abd = s.ex.find(e => e.n === 'Abdominal');
    expect(abd.sets.map(x => [x.rep, x.seg || 0])).toEqual([[20, 0]]);
  });

  test('o selo não diz "primeira vez" para um treino feito antes com outra medida', async ({ page }) => {
    const ses = (id, dia, sets) => ({ [dia]: [{ id, name: 'Calistenia', tid: 'wc', min: 20, kcal: 90, vol: 0, ex: [{ n: 'Prancha', g: 'abdomen', sets }] }] });
    await abrirApp(page, calistenia({ tdays: { ...ses('s0', ontem, [{ kg: 0, rep: 0, seg: 60 }]), ...ses('s1', hoje, [{ kg: 0, rep: 20 }]) } }));
    const selo = await page.evaluate(() => document.querySelector('#fdFeed .fd-card[data-fd="s1"] .fd-prog').textContent);
    expect(selo).not.toContain('primeira vez');
    expect(selo).toContain('medido de outro jeito');
  });

  test('exercício de carga feito com o kg em branco não vira a referência', async ({ page }) => {
    /* Esquecer o kg uma vez apagava da tela a última carga de verdade. */
    await abrirApp(page, estadoBase({ tdays: {
      [diaISO(2)]: [{ id: 's0', name: 'Treino A', tid: 'w1', min: 40, kcal: 200, vol: 600, ex: [{ n: 'Supino reto', g: 'peito', sets: [{ kg: 60, rep: 10 }] }] }],
      [ontem]: [{ id: 's1', name: 'Treino A', tid: 'w1', min: 40, kcal: 200, vol: 0, ex: [{ n: 'Supino reto', g: 'peito', sets: [{ kg: 0, rep: 10 }] }] }],
    } }));
    await iniciarTreino(page);
    expect(await page.evaluate(s => document.querySelector(s).textContent, `${serie(0)} .tp-v`)).toBe('60 kg × 10');
  });

  test('o aviso do fim do descanso conta as séries de tempo', async ({ page }) => {
    await abrirApp(page, calistenia());
    await iniciarTreino(page);
    await proximo(page);
    await digitar(page, `${serie(0)} .iseg`, '45');
    await clicar(page, '#trRest');
    await page.evaluate(() => __t.forcarFimDoDescanso());
    await page.waitForTimeout(300);
    const txt = await page.evaluate(() => (document.getElementById('restPop') || {}).textContent + ' ' + (document.getElementById('restDone') || {}).textContent);
    expect(txt, 'uma série de 45 s feita: a próxima é a 2').toMatch(/série 2 de 2/i);
  });

  test('exercício de carga feito sem carga também fica registrado', async ({ page }) => {
    /* Reps sem kg num exercício de carga: o que foi feito fica, como "10
       reps" — e "Corrigir série" acerta depois, se a carga foi esquecida. */
    await abrirApp(page, estadoBase());
    await iniciarTreino(page);
    await digitar(page, `${serie(0)} .irep`, '10');
    await proximo(page);
    await proximo(page);
    const s = await page.evaluate(h => __t.store.tdays[h][0], hoje);
    expect(s.ex[0].sets.map(x => [x.kg, x.rep])).toEqual([[0, 10]]);
  });
});
