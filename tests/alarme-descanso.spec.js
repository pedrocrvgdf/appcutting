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

/** Inicia o descanso e faz o tempo acabar agora, sem esperar o relógio.
 *  Sem sair do app: é o caso de quem está com o treino na frente. */
async function estourarDescanso(page) {
  await page.evaluate(() => document.getElementById('trRest').click());
  await page.waitForTimeout(200);
  await page.evaluate(() => { __t.forcarFimDoDescanso(); });
  await page.waitForTimeout(350);
}

/** Sai do app e volta — o celular no bolso, ou o Instagram no meio do descanso.
 *  Com a página escondida o JavaScript congela de verdade; aqui imitamos só o
 *  sinal que o app recebe, que é o `visibilitychange`. */
async function sairDoApp(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(120);
}

/** Descanso que venceu depois de a pessoa ter saído do app. */
async function estourarTendoSaido(page) {
  await page.evaluate(() => document.getElementById('trRest').click());
  await page.waitForTimeout(200);
  await sairDoApp(page);
  await page.evaluate(() => { __t.forcarFimDoDescanso(); });
  await page.waitForTimeout(350);
}

/** Qual aviso apareceu: a tela cheia, o pop-up, ou nenhum. */
const avisoAberto = page => page.evaluate(() => ({
  tela: document.getElementById('restDone').classList.contains('open'),
  pop: document.getElementById('restPop').classList.contains('open'),
}));

test.describe('Alarme do descanso', () => {

  test('toma a tela de quem saiu do app', async ({ page }) => {
    /* Quem deixou o celular no bolso ou foi para outro app precisa ser
       alcançado: som sozinho se perde no barulho da academia. */
    const erros = await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await estourarTendoSaido(page);

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

  test('com o app na frente, avisa sem tapar a tela', async ({ page }) => {
    /* Quem já está olhando o treino não precisa ser interrompido e obrigado a
       apertar "pronto" para voltar ao que já estava vendo. */
    const erros = await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await estourarDescanso(page);

    const a = await avisoAberto(page);
    expect(a.pop, 'o aviso curto é o que serve aqui').toBe(true);
    expect(a.tela, 'a tela cheia seria um tapa-vista').toBe(false);

    const pop = await page.evaluate(() => {
      const p = document.getElementById('restPop'), r = p.getBoundingClientRect();
      return {
        sub: document.getElementById('rpSub').textContent,
        cobreTudo: r.height >= window.innerHeight - 1,
        deixaVerOTreino: !!document.querySelector('#trSets .tr-set'),
      };
    });
    expect(pop.cobreTudo, 'não pode ocupar a tela inteira').toBe(false);
    expect(pop.sub, 'diz de qual exercício e série se trata').toMatch(/Supino reto · série \d+ de \d+/);
    expect(pop.deixaVerOTreino, 'as séries continuam à vista por baixo').toBe(true);
    expect(erros).toEqual([]);
  });

  test('o pop-up também toca e vibra, como o alarme de verdade', async ({ page }) => {
    /* Discreto é o visual, não o alarme: quem está de fone ou distraído
       continua precisando ser avisado. */
    await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await estourarDescanso(page);

    const e = await page.evaluate(() => window.__espiao);
    expect(e.sessao, 'o som continua tomando o áudio').toContain('transient-solo');
    expect(e.vibra.length, 'e a vibração continua').toBeGreaterThan(0);
  });

  test('o pop-up silencia e devolve o áudio ao ser dispensado', async ({ page }) => {
    /* A regra vale para todo caminho de saída: som preso é música do usuário
       que nunca volta. */
    await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await estourarDescanso(page);

    await page.evaluate(() => document.getElementById('rpOk').click());
    await page.waitForTimeout(400);

    const depois = await page.evaluate(() => ({
      fechado: !document.getElementById('restPop').classList.contains('open'),
      sessao: window.__espiao.sessao[window.__espiao.sessao.length - 1],
      vibraParou: window.__espiao.vibra[window.__espiao.vibra.length - 1] === 0,
      semAgendado: __t.alarmNodesLen() === 0,
    }));

    expect(depois.fechado).toBe(true);
    expect(depois.sessao, 'a música precisa voltar ao normal').toBe('ambient');
    expect(depois.vibraParou, 'a vibração precisa parar').toBe(true);
    expect(depois.semAgendado, 'nenhum toque pode continuar agendado').toBe(true);
  });

  test('treino descartado e retomado volta a alarmar em tela cheia', async ({ page }) => {
    /* Retomar significa que a página foi descartada: a pessoa esteve fora. */
    await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(250);

    await page.reload();
    await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { __t.forcarFimDoDescanso(); });
    await page.waitForTimeout(350);

    const a = await avisoAberto(page);
    expect(a.tela, 'quem voltou de fora precisa da tela cheia').toBe(true);
    expect(a.pop).toBe(false);
  });

  test('interrompe a música em vez de só abaixar', async ({ page }) => {
    await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await estourarTendoSaido(page);

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
    await estourarTendoSaido(page);

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

  /* Instala um Notification totalmente controlado: o estado real da permissão
     muda conforme o navegador (headless costuma vir "denied"), e o teste não
     pode depender disso.
     O estado vai como argumento, não por closure — addInitScript serializa a
     função para o navegador e closures não sobrevivem à viagem. */
  const FAKE_NOTIF = estado => {
    window.__pediu = 0;
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: estado,
        requestPermission() { window.__pediu++; return Promise.resolve(estado); },
      },
    });
  };

  test('pede permissão ao iniciar o treino, nunca ao abrir o app', async ({ page }) => {
    /* pedir na abertura é intrusivo; o momento certo é um toque do usuário */
    await page.addInitScript(FAKE_NOTIF, 'default');
    await abrirApp(page, estadoBase());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__pediu), 'nada de pedir ao abrir').toBe(0);

    await iniciarTreino(page);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__pediu), 'pede ao iniciar o treino').toBe(1);
  });

  test('não insiste com quem já recusou a notificação', async ({ page }) => {
    await page.addInitScript(FAKE_NOTIF, 'denied');
    await abrirApp(page, estadoBase());
    await iniciarTreino(page);
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => window.__pediu), 'quem recusou não pode ser perguntado de novo').toBe(0);
  });

  test('o app funciona igual sem permissão de notificação', async ({ page }) => {
    await page.addInitScript(() => {
      if (window.Notification) Notification.requestPermission = () => Promise.resolve('denied');
    });
    const erros = await comEspiao(page, estadoBase());
    await iniciarTreino(page);
    await estourarDescanso(page);

    const a = await avisoAberto(page);
    expect(a.tela || a.pop, 'o aviso principal é o alarme, não a notificação').toBe(true);
    expect(erros).toEqual([]);
  });
});
