/* Sessão de treino: precisa sobreviver ao celular descartar a página quando
   o usuário troca de app, e o tempo fora do app não pode virar caloria. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, iniciarTreino, preencherSerie } = require('./app');

test.describe('Treino em andamento', () => {

  test('grava a sessão no aparelho enquanto o treino acontece', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    await iniciarTreino(page);
    await preencherSerie(page, 0, 60, 10, 1);
    await page.evaluate(() => document.getElementById('trRest').click()); // inicia descanso
    await page.waitForTimeout(600);

    const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem('tresults.run') || 'null'));

    expect(salvo, 'sessão deveria estar gravada em tresults.run').toBeTruthy();
    expect(salvo.w.nome).toBe('Treino A');
    expect(salvo.logs[0][0]).toMatchObject({ kg: 60, rep: 10, rir: 1 });
    expect(salvo.restEnd, 'descanso em andamento deveria estar gravado').toBeGreaterThan(Date.now());
    expect(erros).toEqual([]);
  });

  test('retoma de onde parou quando o app é descartado e reaberto', async ({ page, context }) => {
    await abrirApp(page, estadoBase());
    await iniciarTreino(page);
    await preencherSerie(page, 0, 60, 10, 1);
    // treino já rolando há 5 min, para provar que o início é preservado
    // (e não apenas que "algum tempo" passou)
    await page.evaluate(() => { __t.trS.start = Date.now() - 5 * 60000; });
    await page.evaluate(() => document.getElementById('trRest').click()); // dispara trPersist
    await page.waitForTimeout(600);

    // o iOS descarta a página quando você fica um tempo em outro app
    const storage = await page.evaluate(() => {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
      return o;
    });
    await page.close();

    const nova = await context.newPage();
    const erros = await abrirApp(nova, storage);
    await nova.waitForSelector('#trSets .tr-set', { timeout: 10000 });

    const estado = await nova.evaluate(() => ({
      overlay: document.getElementById('tRunOverlay').classList.contains('open'),
      view: document.querySelector('.view.on')?.id,
      titulo: document.getElementById('trTitle').textContent,
      timer: document.getElementById('trTimer').textContent,
      kg: document.querySelector('#trSets .ikg')?.value,
      rep: document.querySelector('#trSets .irep')?.value,
      rir: !!document.querySelector('#trSets [data-rir="1"].on'),
      descanso: document.getElementById('trRest').textContent.trim(),
    }));

    expect(estado.overlay, 'o treino deveria reabrir sozinho').toBe(true);
    expect(estado.view).toBe('view-treino');
    expect(estado.titulo).toBe('Treino A');
    expect(estado.kg).toBe('60');
    expect(estado.rep).toBe('10');
    expect(estado.rir, 'RIR marcado deveria ser preservado').toBe(true);
    expect(estado.timer, 'cronômetro deveria continuar dos ~5 min, não reiniciar').toMatch(/^0[45]:/);
    expect(estado.descanso, 'descanso deveria continuar correndo').toMatch(/Descanso/);
    expect(erros).toEqual([]);
  });

  test('desconta o tempo fora do app da duração do treino', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await iniciarTreino(page);

    // treino aberto há 40 min, com 25 min gastos fora do app
    const minutos = await page.evaluate(() => {
      __t.trS.start = Date.now() - 40 * 60000;
      __t.trS.away = 25 * 60000;
      return Math.round(__t.trElapsedMs() / 60000);
    });

    expect(minutos, '40 min de relógio menos 25 min fora do app').toBe(15);
  });

  test('registra o treino com a duração já descontada e limpa a sessão', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await iniciarTreino(page);
    await preencherSerie(page, 0, 60, 10, 1);

    await page.evaluate(() => { __t.trS.start = Date.now() - 40 * 60000; __t.trS.away = 25 * 60000; });
    await page.evaluate(() => document.getElementById('trNext').click()); // vai para o 2º exercício
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('trNext').click()); // finaliza
    await page.waitForTimeout(400);

    const fim = await page.evaluate(() => {
      const dia = (__t.store.tdays || {})[__t.todayKey()] || [];
      return {
        registros: dia.length,
        min: dia[0]?.min,
        kcal: dia[0]?.kcal,
        overlayFechado: !document.getElementById('tRunOverlay').classList.contains('open'),
        sessaoLimpa: localStorage.getItem('tresults.run') === null,
      };
    });

    expect(fim.registros).toBe(1);
    expect(fim.min, 'duração não pode incluir o tempo fora do app').toBe(15);
    expect(fim.kcal).toBeGreaterThan(0);
    expect(fim.overlayFechado).toBe(true);
    expect(fim.sessaoLimpa, 'a sessão salva deveria ser apagada ao finalizar').toBe(true);
  });

  test('descarta treino esquecido de mais de 10 horas', async ({ page }) => {
    const antigo = Date.now() - 30 * 3600 * 1000;
    const storage = estadoBase();
    storage['tresults.run'] = JSON.stringify({
      w: JSON.parse(storage['cutting.v1']).tprotocol[0],
      start: antigo, idx: 0, logs: [[{ kg: 0, rep: 0, rir: null }]],
      away: 0, hiddenAt: 0, restEnd: 0, at: antigo,
    });

    await abrirApp(page, storage);
    await page.waitForTimeout(600);

    const estado = await page.evaluate(() => ({
      overlay: document.getElementById('tRunOverlay').classList.contains('open'),
      limpo: localStorage.getItem('tresults.run') === null,
    }));

    expect(estado.overlay, 'treino de 30 h atrás não deveria reabrir').toBe(false);
    expect(estado.limpo).toBe(true);
  });
});
