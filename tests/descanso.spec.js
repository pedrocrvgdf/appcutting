/* O descanso é da sessão, e ganha "−15 s" / "+30 s" (#83).

   O defeito: tocar "Próximo exercício" com o descanso correndo apagava a
   contagem da tela (renderTr terminava em stopRest), enquanto o alarme do
   Android, ou o push no navegador, continuava agendado, sem dono na tela.
   Finalizar ou cancelar o treino também não avisava o Android nem o servidor.

   Aqui: o descanso continua ao avançar e ao voltar, diz de qual exercício é,
   os botões reagendam o aviso nos três caminhos (som do navegador, push e
   alarme do Android), o ajuste vale só para este descanso, e as sugestões
   prontas usam 90 s com fonte. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, iniciarTreino, preencherSerie } = require('./app');

/* Service worker e Notification falsos, como em push.spec.js: sob file://
   não há service worker de verdade. */
const AMBIENTE = () => {
  window.__fnCalls = [];
  window.__fnRespostas = {
    chavePush: { chave: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' },
    agendarAlarme: { ok: true },
    cancelarAlarme: { ok: true },
  };
  window.__notifs = [];
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'granted', requestPermission: () => Promise.resolve('granted') },
  });
  const registro = {
    showNotification: (t, o) => { window.__notifs.push({ t, corpo: o && o.body }); return Promise.resolve(); },
    getNotifications: () => Promise.resolve([]),
    pushManager: {
      getSubscription: () => Promise.resolve(null),
      subscribe: () => Promise.resolve({
        toJSON: () => ({ endpoint: 'https://push.exemplo/abc', keys: { p256dh: 'x', auth: 'y' } }),
      }),
    },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registro), register: () => Promise.resolve(registro) },
  });
};

/* A ponte do app Android, como em app-nativo.spec.js. */
const PONTE = () => {
  window.__nativo = [];
  window.TResults = {
    disponivel: () => true,
    versao: () => '1.6',
    iniciarDescanso: (segundos, exercicio) => window.__nativo.push({ chamada: 'iniciar', segundos, exercicio }),
    cancelarDescanso: () => window.__nativo.push({ chamada: 'cancelar' }),
  };
};

async function abrirWeb(page, extra) {
  await page.addInitScript(AMBIENTE);
  return abrirApp(page, estadoBase(extra));
}
async function abrirNativo(page, extra) {
  await page.addInitScript(AMBIENTE);
  await page.addInitScript(PONTE);
  return abrirApp(page, estadoBase(extra));
}

const clicar = (page, id) => page.evaluate(i => document.getElementById(i).click(), id);
const nativas = page => page.evaluate(() => window.__nativo || []);
const doServidor = page => page.evaluate(() => (window.__fnCalls || []).map(c => ({ nome: c.nome, dados: c.dados })));
const faltaS = page => page.evaluate(() => (__t.trRestEnd - Date.now()) / 1000);
const estado = page => page.evaluate(() => {
  const b = document.getElementById('trRest');
  return {
    rodando: b.classList.contains('resting'),
    texto: b.textContent,
    ajuste: getComputedStyle(document.getElementById('trAjuste')).display !== 'none',
    fim: __t.trRestEnd,
    total: __t.trRestTotal,
    ex: document.getElementById('trExName').textContent,
  };
});

test.describe('O descanso continua ao trocar de exercício', () => {

  test('avançar não apaga o descanso, e ele diz de qual exercício é', async ({ page }) => {
    const erros = await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(300);
    const antes = await estado(page);
    expect(antes.rodando).toBe(true);
    expect(antes.texto).toMatch(/^Descanso: 01:[23]\d · toque para pular$/);
    const nos = await page.evaluate(() => __t.alarmNodesLen());

    await clicar(page, 'trNext');
    await page.waitForTimeout(300);
    const depois = await estado(page);
    expect(depois.ex).toBe('Remada curvada');
    expect(depois.rodando, 'o descanso é da sessão, não da tela').toBe(true);
    expect(depois.fim, 'o mesmo fim: nada recomeçou').toBe(antes.fim);
    expect(depois.texto, 'diz de quem é, sem artigo').toMatch(/^Descanso · Supino reto01:[23]\d · toque para pular$/);
    expect(depois.ajuste).toBe(true);
    expect(await page.evaluate(() => __t.alarmNodesLen()), 'o som agendado continua').toBe(nos);

    await clicar(page, 'trPrev');
    await page.waitForTimeout(300);
    const volta = await estado(page);
    expect(volta.fim).toBe(antes.fim);
    expect(volta.texto, 'de volta ao exercício do descanso, o texto de sempre').toMatch(/^Descanso: 01:[23]\d/);
    expect(erros).toEqual([]);
  });

  test('o descanso que acaba no exercício seguinte avisa a próxima série dele', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(200);
    await clicar(page, 'trNext');
    await page.waitForTimeout(200);
    await page.evaluate(() => __t.forcarFimDoDescanso());
    await page.waitForTimeout(300);

    const r = await page.evaluate(() => ({
      pop: document.getElementById('restPop').classList.contains('open'),
      sub: document.getElementById('rpSub').textContent,
      botao: document.getElementById('trRest').textContent,
      ajuste: getComputedStyle(document.getElementById('trAjuste')).display,
    }));
    expect(r.pop).toBe(true);
    expect(r.sub).toBe('Remada curvada · série 1 de 3');
    expect(r.botao).toContain('Descanso concluído');
    expect(r.ajuste, 'sem descanso, sem os botões').toBe('none');
  });

  test('trocar o exercício e desfazer não matam o descanso', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(200);
    const fim = (await estado(page)).fim;
    // a troca e o "Desfazer" redesenham a tela inteira (renderTr)
    await clicar(page, 'trTrocar');
    await page.waitForSelector('#trocaOverlay.open', { timeout: 5000 });
    await page.evaluate(() => {
      const c = document.getElementById('trocaNome');
      c.value = 'Supino com halter'; c.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('trocaOk').click();
    });
    await page.waitForSelector('#trDesfazer', { timeout: 5000 });
    expect((await estado(page)).rodando, 'depois da troca').toBe(true);
    await page.evaluate(() => document.getElementById('trDesfazer').click());
    await page.waitForTimeout(200);
    const s = await estado(page);
    expect(s.rodando).toBe(true);
    expect(s.fim).toBe(fim);
  });

  test('o descanso só aparece com os botões enquanto corre', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    expect((await estado(page)).ajuste, 'antes do descanso').toBe(false);
    await clicar(page, 'trRest');
    await page.waitForTimeout(200);
    expect((await estado(page)).ajuste).toBe(true);
    await clicar(page, 'trRest');   // pular
    await page.waitForTimeout(200);
    const s = await estado(page);
    expect(s.rodando).toBe(false);
    expect(s.ajuste).toBe(false);
    expect(s.texto).toContain('Iniciar descanso (01:30)');
  });
});

test.describe('"+30 s" e "−15 s"', () => {

  test('somam e tiram do mesmo descanso, sem redesenhar as séries', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await preencherSerie(page, 0, '57,5', 10);
    const campo = await page.evaluate(() => { window.__campo = document.querySelector('#trSets .ikg'); return 1; });
    await clicar(page, 'trRest');
    await page.waitForTimeout(200);
    const f0 = await faltaS(page);

    await clicar(page, 'trMais30');
    let f = await faltaS(page);
    expect(f - f0).toBeGreaterThan(29);
    expect(f - f0).toBeLessThan(31);
    expect((await estado(page)).total, 'o total cresce junto: a barra não pula').toBe(120);
    expect((await estado(page)).texto).toMatch(/^Descanso: (01:5\d|02:00)/);

    await clicar(page, 'trMenos15');
    f = await faltaS(page);
    expect(f - f0).toBeGreaterThan(14);
    expect(f - f0).toBeLessThan(16);
    expect((await estado(page)).total).toBe(105);

    const r = await page.evaluate(() => ({
      mesmo: document.querySelector('#trSets .ikg') === window.__campo,
      valor: document.querySelector('#trSets .ikg').value,
    }));
    expect(r.mesmo, 'renderTr redesenharia as séries e fecharia o teclado').toBe(true);
    expect(r.valor).toBe('57,5');
    expect(campo).toBe(1);
  });

  test('"−15 s" com 15 s ou menos encerra como pular, sem alarme', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(200);
    await page.evaluate(() => __t.setRestEnd(Date.now() + 12000));
    await clicar(page, 'trMenos15');
    await page.waitForTimeout(300);

    const s = await estado(page);
    expect(s.rodando).toBe(false);
    expect(s.fim).toBe(0);
    expect(s.texto).toContain('Iniciar descanso');
    const r = await page.evaluate(() => ({
      nos: __t.alarmNodesLen(),
      pop: document.getElementById('restPop').classList.contains('open'),
      cheia: document.getElementById('restDone').classList.contains('open'),
    }));
    expect(r.nos, 'nada de alarme logo depois do toque').toBe(0);
    expect(r.pop).toBe(false);
    expect(r.cheia).toBe(false);
    await page.waitForTimeout(400);
    expect((await doServidor(page)).map(c => c.nome)).toContain('cancelarAlarme');
  });

  test('"+30 s" para no teto de 1 hora', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(200);
    await page.evaluate(() => __t.setRestEnd(Date.now() + 3590 * 1000));
    await clicar(page, 'trMais30');
    let f = await faltaS(page);
    expect(f).toBeLessThanOrEqual(3600);
    expect(f).toBeGreaterThan(3598);
    await clicar(page, 'trMais30');
    f = await faltaS(page);
    expect(f, 'o Android e o servidor recusam acima de 1 h').toBeLessThanOrEqual(3600);
  });

  test('o ajuste vale só para este descanso: o protocolo e o próximo descanso não mudam', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(200);
    await clicar(page, 'trMais30');
    await clicar(page, 'trMais30');
    await clicar(page, 'trRest');   // pular
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => __t.store.tprotocol[0].ex[0].rest)).toBe(90);
    expect(await page.evaluate(() => __t.trS.w.ex[0].rest)).toBe(90);
    await clicar(page, 'trRest');
    await page.waitForTimeout(200);
    const f = await faltaS(page);
    expect(f).toBeGreaterThan(88);
    expect(f).toBeLessThanOrEqual(90);
  });

  test('a notificação da barra mostra o novo horário', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(300);
    await clicar(page, 'trMais30');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ n: window.__notifs, fim: __t.trRestEnd }));
    const ult = r.n[r.n.length - 1];
    const hh = new Date(r.fim);
    const hhmm = String(hh.getHours()).padStart(2, '0') + ':' + String(hh.getMinutes()).padStart(2, '0');
    expect(ult.corpo).toBe(`Termina às ${hhmm} · 02:00 de descanso`);
  });
});

test.describe('O aviso com o app fechado (push)', () => {

  test('três toques em "+30 s" viram um pedido só, com o fim certo', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(500);
    await clicar(page, 'trMais30');
    await clicar(page, 'trMais30');
    await clicar(page, 'trMais30');
    await page.waitForTimeout(1500);

    const ag = (await doServidor(page)).filter(c => c.nome === 'agendarAlarme');
    expect(ag.length, 'o primeiro e o do último toque').toBe(2);
    expect(ag[0].dados.emSegundos).toBe(90);
    expect(ag[1].dados.emSegundos).toBeGreaterThanOrEqual(178);
    expect(ag[1].dados.emSegundos).toBeLessThanOrEqual(180);
    expect(ag[1].dados.id, 'outro id: o servidor só envia o último pedido').not.toBe(ag[0].dados.id);
  });

  test('pular antes da espera acabar não agenda o aviso de novo', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(500);
    await clicar(page, 'trMais30');
    await clicar(page, 'trRest');   // pular logo em seguida
    await page.waitForTimeout(1500);
    const nomes = (await doServidor(page)).map(c => c.nome);
    expect(nomes.filter(n => n === 'agendarAlarme').length).toBe(1);
    expect(nomes[nomes.length - 1], 'o último pedido é o cancelamento').toBe('cancelarAlarme');
  });

  test('avançar de exercício não cancela o aviso', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(500);
    await clicar(page, 'trNext');
    await page.waitForTimeout(500);
    expect((await doServidor(page)).map(c => c.nome)).not.toContain('cancelarAlarme');
  });

  test('cancelar o treino com o descanso correndo cancela o aviso', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(500);
    await clicar(page, 'trQuit');
    await page.waitForSelector('#appDlgOverlay.open', { timeout: 5000 });
    expect(await page.textContent('#appDlgOk')).toBe('Sim, cancelar');
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(600);
    expect((await doServidor(page)).map(c => c.nome)).toContain('cancelarAlarme');
    expect(await page.evaluate(() => __t.trS)).toBe(null);
  });
});

test.describe('Dentro do app Android', () => {

  test('avançar não cancela o temporizador do sistema', async ({ page }) => {
    await abrirNativo(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(300);
    await clicar(page, 'trNext');
    await page.waitForTimeout(300);
    const ch = await nativas(page);
    expect(ch.map(c => c.chamada)).toEqual(['iniciar']);
    expect((await estado(page)).rodando).toBe(true);
  });

  test('"+30 s" e "−15 s" reagendam o alarme do sistema, sem APK novo', async ({ page }) => {
    await abrirNativo(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(300);
    await clicar(page, 'trNext');   // o descanso ainda é do supino
    await clicar(page, 'trMais30');
    await clicar(page, 'trMenos15');
    await page.waitForTimeout(300);

    const ch = await nativas(page);
    expect(ch.map(c => c.chamada)).toEqual(['iniciar', 'iniciar', 'iniciar']);
    expect(ch[1].segundos).toBeGreaterThanOrEqual(119);
    expect(ch[1].segundos).toBeLessThanOrEqual(120);
    expect(Number.isInteger(ch[1].segundos), 'a ponte recebe Int').toBe(true);
    expect(ch[2].segundos).toBe(ch[1].segundos - 15);
    expect(ch[1].exercicio, 'a notificação continua dizendo de qual exercício é').toBe('Supino reto');
    expect(await page.evaluate(() => (window.__fnCalls || []).some(c => c.nome === 'agendarAlarme')),
      'no app, quem avisa é o Android, nunca o push').toBe(false);
    expect(await page.evaluate(() => __t.alarmNodesLen()), 'nem o som do navegador').toBe(0);
  });

  test('"−15 s" no fim cancela o alarme do sistema, sem mandar 0 s', async ({ page }) => {
    await abrirNativo(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(300);
    await page.evaluate(() => __t.setRestEnd(Date.now() + 9000));
    await clicar(page, 'trMenos15');
    await page.waitForTimeout(300);
    const ch = await nativas(page);
    expect(ch.map(c => c.chamada)).toEqual(['iniciar', 'cancelar']);
  });

  test('finalizar o treino com o descanso correndo cancela o alarme do sistema', async ({ page }) => {
    await abrirNativo(page);
    await iniciarTreino(page);
    await preencherSerie(page, 0, 60, 10);
    await clicar(page, 'trNext');
    await page.waitForTimeout(300);
    await preencherSerie(page, 0, 50, 10);
    await clicar(page, 'trRest');
    await page.waitForTimeout(300);
    await clicar(page, 'trNext');   // "Finalizar treino"
    await page.waitForFunction(() => !__t.trS, null, { timeout: 5000 });
    const ch = await nativas(page);
    expect(ch.map(c => c.chamada), 'senão o alarme tocava depois do treino').toEqual(['iniciar', 'cancelar']);
  });

  test('finalizar sem descanso correndo não manda nada ao Android', async ({ page }) => {
    await abrirNativo(page);
    await iniciarTreino(page);
    await preencherSerie(page, 0, 60, 10);
    await clicar(page, 'trNext');
    await clicar(page, 'trNext');
    await page.waitForFunction(() => !__t.trS, null, { timeout: 5000 });
    expect(await nativas(page)).toEqual([]);
  });
});

test.describe('O app descartado no meio do descanso', () => {

  test('volta com o total, o exercício do descanso e o tempo certo', async ({ page }) => {
    await abrirWeb(page);
    await iniciarTreino(page);
    await clicar(page, 'trRest');
    await page.waitForTimeout(200);
    await clicar(page, 'trMais30');
    await clicar(page, 'trNext');
    await page.waitForTimeout(200);
    const antes = await estado(page);
    await page.reload();
    await page.waitForFunction(() => window.__t && __t.trS && __t.trRestEnd > 0, null, { timeout: 10000 });
    await page.waitForTimeout(300);
    const depois = await estado(page);
    expect(depois.fim).toBe(antes.fim);
    expect(depois.total).toBe(120);
    expect(depois.ex).toBe('Remada curvada');
    expect(depois.texto).toMatch(/^Descanso · Supino reto/);
    expect(await page.evaluate(() => __t.trRestIdx)).toBe(0);
  });

  test('treino salvo pela versão anterior, sem total, usa o descanso do exercício', async ({ page }) => {
    const run = {
      w: { id: 'w1', nome: 'Treino A', ex: [
        { n: 'Supino reto', s: 3, rest: 90, g: 'peito', sec: [] },
        { n: 'Remada curvada', s: 3, rest: 60, g: 'costas', sec: [] },
      ] },
      start: Date.now() - 60000, idx: 1, logs: [], away: 0, hiddenAt: 0,
      restEnd: Date.now() + 40000, at: Date.now(),
    };
    await page.addInitScript(AMBIENTE);
    await abrirApp(page, { ...estadoBase(), 'tresults.run': JSON.stringify(run) });
    await page.waitForFunction(() => window.__t && __t.trS && __t.trRestEnd > 0, null, { timeout: 10000 });
    await page.waitForTimeout(300);
    const s = await estado(page);
    expect(s.total).toBe(60);
    expect(s.texto, 'sem saber de quem era, vale o exercício da vez').toMatch(/^Descanso: 00:[34]\d/);
  });
});

test.describe('As sugestões prontas', () => {

  for (const obj of ['cutting', 'bulking']) {
    test(`${obj}: descanso de 90 s, sem promessa de gasto`, async ({ page }) => {
      await abrirWeb(page, {
        tprotocol: [],
        goals: { nome: 'Pedro', pesoAtual: 80, pesoAlvo: 75, meses: 3, tIntro: true,
          sexo: 'M', idade: 30, altura: 180, ativ: 1.5, obj, objetivo: obj },
      });
      expect(await page.evaluate(() => __t.SUG_DESCANSO)).toBe(90);
      await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
      await page.waitForTimeout(300);
      await page.evaluate(() => document.getElementById('tSugBtn').click());
      await page.waitForSelector('#tSugOverlay.open');
      const txt = await page.evaluate(() => document.getElementById('tSugSub').textContent);
      expect(txt).toContain('90 s');
      expect(txt).not.toMatch(/gasto/);
      await page.evaluate(() => document.querySelector('[data-usesug="abc"]').click());
      await page.waitForTimeout(300);
      const rests = await page.evaluate(() => [...new Set(__t.store.tprotocol.flatMap(w => w.ex.map(e => e.rest)))]);
      expect(rests).toEqual([90]);
    });
  }
});

test.describe('Na tela', () => {

  for (const largura of [320, 390]) {
    test(`os botões e o nome cabem em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 740 });
      await abrirWeb(page, {
        tprotocol: [{ id: 'w1', nome: 'Treino A', cat: 'A', ex: [
          { n: 'Desenvolvimento com halter sentado no banco inclinado', s: 3, rest: 90, g: 'ombro', sec: [] },
          { n: 'Remada curvada', s: 3, rest: 60, g: 'costas', sec: [] },
        ] }],
      });
      await iniciarTreino(page);
      await clicar(page, 'trRest');
      await clicar(page, 'trNext');
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const box = id => document.getElementById(id).getBoundingClientRect();
        const rest = box('trRest'), m = box('trMenos15'), p = box('trMais30');
        const rde = document.querySelector('#trRest .rde');
        return {
          larg: document.documentElement.scrollWidth, vw: innerWidth,
          rest, m, p,
          rdeCorta: rde.scrollWidth > rde.clientWidth,
          rdeDentro: rde.getBoundingClientRect().right <= rest.right + 0.5,
          alturaRest: rest.height,
        };
      });
      expect(r.larg, 'sem rolagem de lado').toBeLessThanOrEqual(r.vw);
      expect(r.m.top, 'os dois na mesma linha').toBe(r.p.top);
      expect(r.m.right).toBeLessThanOrEqual(r.p.left);
      expect(r.p.right).toBeLessThanOrEqual(r.rest.right + 0.5);
      expect(r.rdeDentro, 'o nome longo fica dentro do botão, com reticências').toBe(true);
      expect(r.alturaRest, 'duas linhas, não quatro').toBeLessThan(80);
    });
  }
});
