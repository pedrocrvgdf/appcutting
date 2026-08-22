/* Alarme do descanso: precisa se comportar como o temporizador do celular —
   toma a tela, insiste no som e interrompe a música, em vez de um "plim" que
   se perde no barulho da academia. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, iniciarTreino } = require('./app');

/* Espia o que o app pede ao sistema de áudio e às notificações, sem depender
   de permissão real nem de alto-falante. */
const ESPIAO = () => {
  window.__espiao = { sessao: [], notif: [], vibra: [] };
  try {
    Object.defineProperty(navigator, 'audioSession', {
      configurable: true,
      value: { set type(v) { window.__espiao.sessao.push(v); }, get type() { return 'ambient'; } },
    });
  } catch (e) { }
  navigator.vibrate = p => { window.__espiao.vibra.push(p); return true; };
};

async function comEspiao(page, storage) {
  await page.addInitScript(ESPIAO);
  return abrirApp(page, storage);
}

/** Inicia o descanso e faz o tempo acabar agora, sem esperar o relógio. */
async function estourarDescanso(page) {
  await page.evaluate(() => document.getElementById('trRest').click());
  await page.waitForTimeout(200);
  await page.evaluate(() => { __t.forcarFimDoDescanso(); });
  await page.waitForTimeout(350);
}

test.describe('Alarme do descanso', () => {

  test('toma a tela quando o tempo bate', async ({ page }) => {
    const erros = await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await estourarDescanso(page);

    const tela = await page.evaluate(() => {
      const ov = document.getElementById('restDone');
      const r = ov.getBoundingClientRect();
      return {
        aberta: ov.classList.contains('open'),
        cobreTudo: r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1,
        titulo: document.querySelector('.rd-t')?.textContent.trim(),
        exercicio: document.getElementById('rdEx')?.textContent.trim(),
        serie: document.getElementById('rdSet')?.textContent.trim(),
        acima: getComputedStyle(ov).zIndex,
      };
    });

    expect(tela.aberta, 'som sozinho se perde: precisa aparecer').toBe(true);
    expect(tela.cobreTudo, 'precisa ocupar a tela inteira').toBe(true);
    expect(tela.titulo).toMatch(/concluíd/i);
    expect(tela.exercicio, 'dizer de qual exercício se trata').toBe('Supino reto');
    expect(tela.serie, 'e qual série vem agora').toMatch(/Série \d+ de \d+/);
    expect(+tela.acima, 'tem de ficar acima da tela de execução').toBeGreaterThan(100);
    expect(erros).toEqual([]);
  });

  test('interrompe a música em vez de só abaixar', async ({ page }) => {
    await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await estourarDescanso(page);

    const sessao = await page.evaluate(() => window.__espiao.sessao);

    expect(sessao, 'transient só abaixava e o toque se perdia').toContain('transient-solo');
    expect(sessao[sessao.length - 1], 'enquanto toca, o áudio fica tomado')
      .toBe('transient-solo');
    // a devolução do áudio é verificada no teste que dispensa o alarme
  });

  test('insiste até ser dispensado, como um temporizador de verdade', async ({ page }) => {
    await comEspiao(page, estadoBase());
    await iniciarTreino(page);

    const agenda = await page.evaluate(() => {
      const dur = __t.ALARM_DUR, ciclo = __t.ALARM_CICLO;
      return { dur, ciclo, toques: Math.ceil(dur / ciclo) };
    });

    expect(agenda.dur, 'um toque único passa despercebido').toBeGreaterThanOrEqual(10);
    expect(agenda.toques, 'precisa repetir várias vezes').toBeGreaterThanOrEqual(4);

    await estourarDescanso(page);
    const vibra = await page.evaluate(() => window.__espiao.vibra);
    expect(vibra.length, 'a vibração também insiste').toBeGreaterThan(0);
    expect(vibra[0].length, 'padrão longo, não um tremor').toBeGreaterThan(2);
  });

  test('qualquer toque silencia e devolve o áudio', async ({ page }) => {
    await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await estourarDescanso(page);

    await page.evaluate(() => document.getElementById('restDone').click());
    await page.waitForTimeout(200);

    const depois = await page.evaluate(() => ({
      fechada: !document.getElementById('restDone').classList.contains('open'),
      sessao: window.__espiao.sessao[window.__espiao.sessao.length - 1],
      vibraParou: window.__espiao.vibra[window.__espiao.vibra.length - 1] === 0,
      semAgendado: __t.alarmNodesLen() === 0,
    }));

    expect(depois.fechada).toBe(true);
    expect(depois.sessao, 'a música precisa voltar ao normal').toBe('ambient');
    expect(depois.vibraParou, 'a vibração precisa parar').toBe(true);
    expect(depois.semAgendado, 'nenhum toque pode continuar agendado').toBe(true);
  });

  test('não toca alarme atrasado ao voltar muito depois', async ({ page }) => {
    await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(200);

    // descanso venceu há 10 minutos: mostra o estado, mas não alarma
    await page.evaluate(() => { __t.setRestEnd(Date.now() - 10 * 60000); __t.restTick(); });
    await page.waitForTimeout(250);

    const estado = await page.evaluate(() => ({
      telaAberta: document.getElementById('restDone').classList.contains('open'),
      pediuSolo: window.__espiao.sessao.includes('transient-solo'),
    }));

    expect(estado.telaAberta, 'não faz sentido alarmar 10 min depois').toBe(false);
    expect(estado.pediuSolo, 'nem interromper a música do nada').toBe(false);
  });

  test('não pede permissão de notificação antes da hora', async ({ page }) => {
    /* pedir na abertura do app é intrusivo; o momento certo é ao iniciar o
       treino, que já é um toque do usuário */
    await page.addInitScript(() => {
      window.__pediu = 0;
      if (window.Notification) Notification.requestPermission = () => { window.__pediu++; return Promise.resolve('default'); };
    });
    await abrirApp(page, estadoBase());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__pediu), 'nada de pedir ao abrir').toBe(0);

    await iniciarTreino(page);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__pediu), 'pede ao iniciar o treino').toBe(1);
  });

  test('o app funciona igual sem permissão de notificação', async ({ page }) => {
    await page.addInitScript(() => {
      if (window.Notification) Notification.requestPermission = () => Promise.resolve('denied');
    });
    const erros = await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await estourarDescanso(page);

    const tela = await page.evaluate(() => document.getElementById('restDone').classList.contains('open'));
    expect(tela, 'o aviso principal é o alarme, não a notificação').toBe(true);
    expect(erros).toEqual([]);
  });
});
