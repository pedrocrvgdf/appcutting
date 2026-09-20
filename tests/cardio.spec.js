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

test.describe('Ganho de elevação acumulado', () => {
  /* Pedido do dono: "é o ganho de elevação acumulado, às vezes no Strava chega
     a 1.100 m". Na rua ninguém sabe a própria inclinação média — o relógio dá
     o ganho pronto, em metros. A esteira continua falando em %, porque é o que
     o painel dela mostra, mas passa a aceitar metros também.

     A conta é a mesma dos dois lados, porque o que custa energia são os METROS
     subidos: kcal = peso × metros × coeficiente. A % existe só para converter. */

  const unidadeVisivel = page => page.evaluate(() => {
    const s = document.getElementById('taIncSeg');
    return {
      seletorVisivel: getComputedStyle(s).display !== 'none',
      unidade: (s.querySelector('button.on') || {}).dataset?.u || null,
      rotulo: document.getElementById('taIncLbl').textContent.trim(),
      campoVisivel: getComputedStyle(document.getElementById('taIncWrap')).display !== 'none',
    };
  });

  test('no ar livre o campo é ganho em metros, sem escolha de unidade', async ({ page }) => {
    /* Oferecer "%" na rua seria pedir um número que a pessoa não tem. */
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Aeróbico ao ar livre' });
    const u = await unidadeVisivel(page);
    expect(u.campoVisivel).toBe(true);
    expect(u.seletorVisivel).toBe(false);
    expect(u.unidade).toBe('m');
    expect(u.rotulo).toBe('Ganho de elevação (m)');
  });

  test('na esteira dá para escolher entre % e metros, começando em %', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira' });
    let u = await unidadeVisivel(page);
    expect(u.seletorVisivel).toBe(true);
    expect(u.unidade).toBe('pct');
    expect(u.rotulo).toBe('Inclinação (%)');

    await page.evaluate(() => document.querySelector('#taIncSeg [data-u="m"]').click());
    await page.waitForTimeout(200);
    u = await unidadeVisivel(page);
    expect(u.unidade).toBe('m');
    expect(u.rotulo).toBe('Ganho de elevação (m)');
  });

  test('1.100 m de ganho em 20 km: a conta sai pelos metros', async ({ page }) => {
    /* 20 km em 2h30 = 8 km/h -> faixa de corrida, coeficiente 0,0045.
       plano: 80 kg × 20 km × 0,90 × 1,0 = 1440
       subida: 80 kg × 1100 m × 0,0045  =  396
       total 1836 */
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Aeróbico ao ar livre', km: 20, min: 150, inc: 1100 });
    expect(await kcalDaPrevia(page)).toBe(1836);
  });

  test('o ganho aparece na prévia com a inclinação média, para o dedo errado se denunciar', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Aeróbico ao ar livre', km: 20, min: 150, inc: 1100 });
    const t = await previa(page);
    expect(t).toMatch(/1100 m<?\/?b?> ?de ganho|1100 m de ganho/);
    expect(t, '1100 m em 20 km são 5,5%').toMatch(/5,5% de inclinação média/);

    /* mesmos 1.100 m em 2 km seriam 55%: absurdo que se anuncia sozinho */
    await preencher(page, { km: 2 });
    expect(await previa(page)).toMatch(/55% de inclinação média/);
  });

  test('ganho 0 devolve exatamente o número sem elevação', async ({ page }) => {
    /* A invariante que protege o histórico já gravado. */
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Aeróbico ao ar livre', km: 20, min: 150, inc: 0 });
    expect(await kcalDaPrevia(page)).toBe(1440);   // 80 × 20 × 0,90
  });

  test('andando, o mesmo ganho custa o dobro do que correndo', async ({ page }) => {
    /* 0,009 contra 0,0045, que é o que separa as duas equações do ACSM. */
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Aeróbico ao ar livre', km: 10, min: 150, inc: 0 });
    const andandoPlano = await kcalDaPrevia(page);          // 4 km/h
    await preencher(page, { inc: 500 });
    const andandoRampa = await kcalDaPrevia(page);

    await preencher(page, { km: 20, min: 120, inc: 0 });    // 10 km/h
    const correndoPlano = await kcalDaPrevia(page);
    await preencher(page, { inc: 500 });
    const correndoRampa = await kcalDaPrevia(page);

    expect(andandoRampa - andandoPlano).toBe(360);          // 80 × 500 × 0,009
    expect(correndoRampa - correndoPlano).toBe(180);        // 80 × 500 × 0,0045
  });

  test('ganho absurdo é limitado, em vez de virar caloria absurda', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Aeróbico ao ar livre', km: 20, min: 150, inc: 999999 });
    /* teto de 10.000 m: 80 × 10000 × 0,0045 = 3600 em cima dos 1440 */
    expect(await kcalDaPrevia(page)).toBe(5040);
  });

  test('o registro guarda o ganho, e a lista de hoje o mostra em metros', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Aeróbico ao ar livre', km: 20, min: 150, inc: 1100 });
    await page.evaluate(() => document.getElementById('taAdd').click());
    await page.waitForTimeout(300);

    const w = await page.evaluate(() => {
      const d = Object.values(__t.store.tdays).flat();
      return d[d.length - 1];
    });
    expect(w.ganho).toBe(1100);
    expect(w.inc, 'a inclinação média é conferência de tela, não dado registrado').toBeUndefined();

    const linha = await page.evaluate(() => document.getElementById('tTodayList').textContent);
    expect(linha).toMatch(/1100 m de ganho/);
  });

  test('o feed do Início mostra o ganho junto da distância', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Aeróbico ao ar livre', km: 20, min: 150, inc: 1100 });
    await page.evaluate(() => document.getElementById('taAdd').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="inicio"]').click());
    await page.waitForTimeout(400);
    const feed = await page.evaluate(() => document.getElementById('fdFeed').textContent);
    expect(feed).toMatch(/20 km/);
    expect(feed).toMatch(/1100 m de ganho/);
  });

  test('trocar a unidade limpa o campo, em vez de converter por baixo do pano', async ({ page }) => {
    /* 7,5 em % e 7,5 em metros são coisas diferentes. Converter sozinho
       gravaria um número que a pessoa não escolheu. */
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60, inc: 7.5 });
    expect(await kcalDaPrevia(page)).toBe(392);

    await page.evaluate(() => document.querySelector('#taIncSeg [data-u="m"]').click());
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById('taInc').value)).toBe('');
    expect(await kcalDaPrevia(page), 'campo vazio volta ao valor sem elevação').toBe(122);
  });

  test('na esteira em metros, a conta bate com a mesma subida em %', async ({ page }) => {
    /* 5 km a 7,5% são 375 m. Pelos dois caminhos o gasto tem de ser o mesmo. */
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    await preencher(page, { atividade: 'Esteira', km: 5, min: 60, inc: 7.5 });
    const porcento = await kcalDaPrevia(page);

    await page.evaluate(() => document.querySelector('#taIncSeg [data-u="m"]').click());
    await page.waitForTimeout(200);
    await preencher(page, { inc: 375 });
    expect(await kcalDaPrevia(page)).toBe(porcento);
  });

  test('bicicleta e musculação não ganham campo de elevação', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAvulso(page);
    for (const a of ['Bicicleta', 'Musculação', 'Natação']) {
      await preencher(page, { atividade: a });
      expect(await visivel(page, 'taIncWrap'), `${a} não sobe rampa medida`).toBe(false);
    }
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
