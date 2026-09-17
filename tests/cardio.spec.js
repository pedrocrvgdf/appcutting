/* Registro manual de cardio: quilometragem na caminhada e inclinação na esteira.

   Dois pedidos do dono, e um cuidado em cada um.

   Na caminhada, a distância é **opcional**: quem andou 40 minutos no bairro sem
   medir nada precisa continuar registrando, senão a função nova tira do app algo
   que já funcionava.

   Na esteira, inclinação 0 tem de dar exatamente o mesmo número de antes —
   senão o histórico de quem já registrou deixa de ser comparável com o de
   amanhã, e a pessoa vê uma "melhora" que só existe porque a conta mudou. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase } = require('./app');

/* estadoBase tem pesoAtual 80 e nenhuma pesagem, então userWeight() = 80.
   Todos os números esperados abaixo saem disso. */

const irAvulso = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
  await page.waitForSelector('#tTabs [data-tab="avulso"]', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('#tTabs [data-tab="avulso"]').click());
  await page.waitForTimeout(250);
};

/** Preenche o formulário como a digitação real preenche. */
const preencher = async (page, { atividade, km, min, inc }) => {
  if (atividade) await page.selectOption('#taAct', { label: atividade });
  await page.evaluate(({ km, min, inc }) => {
    const por = (id, v) => {
      if (v === undefined) return;
      const c = document.getElementById(id);
      c.value = v === null ? '' : String(v);
      c.dispatchEvent(new Event('input', { bubbles: true }));
    };
    por('taKm', km); por('taMin', min); por('taInc', inc);
  }, { km, min, inc });
  await page.waitForTimeout(150);
};

const previa = page => page.evaluate(() => document.getElementById('taPreview').textContent);

const kcalDaPrevia = async page => {
  const t = await previa(page);
  const m = t.match(/Estimativa:\s*(\d+)\s*kcal/);
  return m ? parseInt(m[1], 10) : null;
};

const visivel = (page, id) => page.evaluate(x => {
  const e = document.getElementById(x);
  return !!e && getComputedStyle(e).display !== 'none';
}, id);

test.describe('Caminhada com quilometragem', () => {

  test('o campo de distância aparece ao escolher Caminhada', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Caminhada' });
    expect(await visivel(page, 'taKmWrap'), 'era só duração e intensidade').toBe(true);
  });

  test('a distância continua opcional: sem km, registra pela duração', async ({ page }) => {
    /* Se virar obrigatória, some do app o registro de quem não mediu nada. */
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Caminhada', km: null, min: 60 });
    expect(await kcalDaPrevia(page)).toBe(210);          // MET 3,5 líquido, 80 kg, 60 min
    expect(await visivel(page, 'taIntWrap'), 'sem distância, quem gradua é a intensidade').toBe(true);
  });

  test('com a distância preenchida, a conta passa a sair do ritmo', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Caminhada', km: 5, min: 60 });
    expect(await kcalDaPrevia(page)).toBe(128);          // 80 kg × 5 km × 0,32
    const t = await previa(page);
    expect(t).toMatch(/km\/h/);
    expect(t).toMatch(/pace/);
    /* campo visível que não entra na conta é campo que mente */
    expect(await visivel(page, 'taIntWrap')).toBe(false);
  });

  test('o placeholder avisa que a distância é opcional', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Caminhada' });
    expect(await page.evaluate(() => document.getElementById('taKm').placeholder)).toBe('opcional');
    await preencher(page, { atividade: 'Esteira' });
    expect(await page.evaluate(() => document.getElementById('taKm').placeholder)).not.toBe('opcional');
  });

  test('a caminhada registrada com km guarda a distância', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Caminhada', km: 5.4, min: 62 });
    await page.evaluate(() => document.getElementById('taAdd').click());
    await page.waitForTimeout(300);
    const w = await page.evaluate(() => {
      const d = Object.values(__t.store.tdays).flat();
      return d[d.length - 1];
    });
    expect(w.km).toBe(5.4);
    expect(w.name).toBe('Caminhada');
  });
});

test.describe('Inclinação da esteira', () => {

  test('a inclinação só aparece na esteira', async ({ page }) => {
    /* Na rua ninguém sabe a rampa; pedir o número seria pedir um chute. */
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira' });
    expect(await visivel(page, 'taIncWrap')).toBe(true);
    await preencher(page, { atividade: 'Caminhada' });
    expect(await visivel(page, 'taIncWrap')).toBe(false);
    await preencher(page, { atividade: 'Bicicleta' });
    expect(await visivel(page, 'taIncWrap')).toBe(false);
  });

  test('inclinação 0 dá exatamente o número de antes', async ({ page }) => {
    /* A regressão que importa: se este valor mudar, o histórico de quem já
       registrou deixa de ser comparável. */
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60, inc: 0 });
    expect(await kcalDaPrevia(page)).toBe(122);          // 80 × 5 × 0,32 × 0,95
  });

  test('subir custa mais, e quanto mais íngreme mais custa', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60, inc: 6 });
    /* 5 km a 6% = 300 m de subida; 80 kg × 300 m × 0,009 = 216 kcal em cima */
    expect(await kcalDaPrevia(page)).toBe(338);
    await preencher(page, { inc: 12 });
    expect(await kcalDaPrevia(page)).toBe(554);
  });

  test('correr aproveita melhor a rampa do que andar', async ({ page }) => {
    /* Coeficientes diferentes do ACSM: 0,009 andando e 0,0045 correndo por kg
       e por metro subido. Mesma subida, acréscimo menor correndo. */
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60, inc: 0 });
    const andandoPlano = await kcalDaPrevia(page);
    await preencher(page, { inc: 6 });
    const andandoRampa = await kcalDaPrevia(page);

    await preencher(page, { km: 5, min: 25, inc: 0 });   // 12 km/h
    const correndoPlano = await kcalDaPrevia(page);
    await preencher(page, { inc: 6 });
    const correndoRampa = await kcalDaPrevia(page);

    expect(andandoRampa - andandoPlano).toBe(216);
    expect(correndoRampa - correndoPlano).toBe(108);
  });

  test('a prévia mostra a inclinação e os metros de subida', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60, inc: 7.5 });
    const t = await previa(page);
    expect(t, 'casa decimal se escreve com vírgula').toMatch(/7,5%/);
    expect(t).toMatch(/375 m de subida/);
    expect(t).not.toMatch(/7\.5/);
  });

  test('a esteira registrada guarda a inclinação, e a lista de hoje a mostra', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60, inc: 7.5 });
    await page.evaluate(() => document.getElementById('taAdd').click());
    await page.waitForTimeout(300);

    const w = await page.evaluate(() => {
      const d = Object.values(__t.store.tdays).flat();
      return d[d.length - 1];
    });
    expect(w.inc).toBe(7.5);
    expect(w.km).toBe(5);

    const linha = await page.evaluate(() => document.getElementById('tTodayList').textContent);
    expect(linha).toMatch(/7,5% de inclinação/);
    expect(linha, 'distância também em vírgula').not.toMatch(/\d+\.\d/);
  });

  test('sem inclinação, nada de "0%" pendurado na linha', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60, inc: 0 });
    await page.evaluate(() => document.getElementById('taAdd').click());
    await page.waitForTimeout(300);
    const linha = await page.evaluate(() => document.getElementById('tTodayList').textContent);
    expect(linha).not.toMatch(/inclinação/);
  });

  test('o feed do Início mostra a inclinação junto da distância', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60, inc: 7.5 });
    await page.evaluate(() => document.getElementById('taAdd').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="inicio"]').click());
    await page.waitForTimeout(400);
    const feed = await page.evaluate(() => document.getElementById('fdFeed').textContent);
    expect(feed).toMatch(/5 km/);
    expect(feed).toMatch(/7,5% de inclinação/);
  });
});

test.describe('Digitação com vírgula', () => {
  /* No teclado numérico do celular brasileiro a tecla decimal é a vírgula.
     Com <input type="number"> o navegador descarta a vírgula antes de o
     JavaScript enxergar: "7,5" chegava como 75. Num app que calcula caloria,
     isso é número errado entrando calado. */

  const digitar = async (page, id, texto) => {
    await page.click('#' + id);
    await page.keyboard.type(texto);
    await page.waitForTimeout(200);
  };

  test('inclinação digitada com vírgula vale 7,5 e não 75', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60 });
    await digitar(page, 'taInc', '7,5');
    expect(await previa(page)).toMatch(/7,5% de inclinação/);
    expect(await kcalDaPrevia(page)).toBe(392);   // 121,6 + 80 × 375 m × 0,009
  });

  test('distância digitada com vírgula vale 5,4 km e não 54', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Caminhada', min: 60 });
    await digitar(page, 'taKm', '5,4');
    const t = await previa(page);
    expect(t).toMatch(/5,4 km/);
    expect(t).not.toMatch(/54 km/);
  });

  test('ponto continua valendo, para quem tem teclado com ponto', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60 });
    await digitar(page, 'taInc', '7.5');
    expect(await kcalDaPrevia(page)).toBe(392);
  });

  test('letra digitada não entra no campo', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60 });
    await digitar(page, 'taInc', '6abc');
    expect(await page.evaluate(() => document.getElementById('taInc').value)).toBe('6');
  });
});

test('a linha do formulário não estoura em tela de 320px', async ({ page }) => {
  /* Três campos lado a lado cortavam o rótulo; a linha passa a quebrar. */
  await page.setViewportSize({ width: 320, height: 720 });
  await abrirApp(page, estadoBase());
  await irAvulso(page);
  await preencher(page, { atividade: 'Esteira', km: 5, min: 60, inc: 6 });
  const estoura = await page.evaluate(() => {
    const linha = document.querySelector('.row.row-ta');
    const r = linha.getBoundingClientRect();
    return [...linha.children]
      .filter(e => getComputedStyle(e).display !== 'none')
      .some(e => {
        const b = e.getBoundingClientRect();
        return b.right > r.right + 1 || b.left < r.left - 1 || e.scrollWidth > e.clientWidth + 1;
      });
  });
  expect(estoura).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
