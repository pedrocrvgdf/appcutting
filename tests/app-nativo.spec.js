/* A ponte com o app Android.

   Dentro do app, quem conta o descanso é o Android. O risco aqui não é a ponte
   não funcionar — é ela funcionar *junto* com o caminho web, e o usuário levar
   dois alarmes e duas telas de aviso ao mesmo tempo. Estes testes cobrem os
   dois lados: a ponte sendo usada, e o caminho web sendo desligado. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, iniciarTreino } = require('./app');

/* A ponte que o WebView instala. Precisa existir antes do script do app rodar:
   `appNativo` é decidido uma vez, na avaliação do módulo. */
const PONTE = () => {
  window.__nativo = [];
  window.TResults = {
    disponivel: () => true,
    versao: () => '1.0',
    iniciarDescanso: (segundos, exercicio) =>
      window.__nativo.push({ chamada: 'iniciar', segundos, exercicio }),
    cancelarDescanso: () => window.__nativo.push({ chamada: 'cancelar' }),
  };
};

/* Sem estes, o app tenta o caminho web e o teste mede a coisa errada. */
const AMBIENTE = () => {
  window.__fnCalls = [];
  window.__fnRespostas = {
    chavePush: { chave: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' },
    agendarAlarme: { ok: true },
    cancelarAlarme: { ok: true },
  };
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'granted', requestPermission: () => Promise.resolve('granted') },
  });
  const registro = {
    showNotification: () => { window.__notificou = (window.__notificou || 0) + 1; return Promise.resolve(); },
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

async function abrirNoApp(page) {
  await page.addInitScript(AMBIENTE);
  await page.addInitScript(PONTE);
  return abrirApp(page, estadoBase());
}

const nativas = page => page.evaluate(() => window.__nativo || []);
const doServidor = page => page.evaluate(() => (window.__fnCalls || []).map(c => c.nome));

test.describe('Dentro do app Android', () => {

  test('o descanso vai para o temporizador do sistema', async ({ page }) => {
    const erros = await abrirNoApp(page);
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(500);

    const chamadas = await nativas(page);
    const iniciar = chamadas.find(c => c.chamada === 'iniciar');

    expect(iniciar, 'sem isto não há contagem na barra nem alarme').toBeTruthy();
    expect(iniciar.segundos, 'descanso do exercício é de 90s').toBe(90);
    expect(iniciar.exercicio, 'o nome aparece na notificação').toBe('Supino reto');
    expect(erros).toEqual([]);
  });

  test('não agenda também pelo servidor', async ({ page }) => {
    /* Se os dois caminhos rodassem, chegariam dois avisos: o do Android e o do
       push. O usuário levaria alarme dobrado a cada série. */
    await abrirNoApp(page);
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(600);

    expect(await doServidor(page), 'o push é o caminho do navegador, não do app')
      .not.toContain('agendarAlarme');
  });

  test('não põe a notificação da web na barra', async ({ page }) => {
    /* A contagem nativa já ocupa a barra. A notificação web ficaria ao lado,
       parada no horário de término, dizendo a mesma coisa pior. */
    await abrirNoApp(page);
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(600);

    expect(await page.evaluate(() => window.__notificou || 0)).toBe(0);
  });

  test('pular o descanso cancela o temporizador do sistema', async ({ page }) => {
    await abrirNoApp(page);
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('trRest').click()); // toque = pular
    await page.waitForTimeout(400);

    expect((await nativas(page)).map(c => c.chamada),
      'senão o alarme tocaria depois de um descanso já encerrado').toContain('cancelar');
  });

  test('ao terminar, não abre a tela de alarme da web', async ({ page }) => {
    /* Quem toma a tela é a AlarmeActivity do Android, por cima de tudo — até
       de outro app. A tela web apareceria embaixo, com som próprio. */
    await abrirNoApp(page);
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => __t.forcarFimDoDescanso());
    await page.waitForTimeout(500);

    expect(await page.evaluate(() => document.getElementById('restDone').classList.contains('open')),
      'duas telas de alarme disputando é pior que nenhuma').toBe(false);
  });

  test('o botão do descanso continua reagindo normalmente', async ({ page }) => {
    /* Desligar o caminho web não pode desligar a interface junto. */
    const erros = await abrirNoApp(page);
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(400);

    expect(await page.evaluate(() =>
      document.getElementById('trRest').classList.contains('resting'))).toBe(true);

    await page.evaluate(() => __t.forcarFimDoDescanso());
    await page.waitForTimeout(400);

    expect(await page.evaluate(() =>
      document.getElementById('trRest').textContent)).toMatch(/concluíd/i);
    expect(erros).toEqual([]);
  });
});

test.describe('Fora do app Android', () => {

  test('sem a ponte, o caminho web continua inteiro', async ({ page }) => {
    /* A garantia de que nada foi trocado, só desviado: no navegador comum tudo
       precisa seguir exatamente como antes. */
    await page.addInitScript(AMBIENTE);
    await abrirApp(page, estadoBase());
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(600);

    expect(await doServidor(page), 'no navegador quem avisa é o push').toContain('agendarAlarme');
    expect(await page.evaluate(() => window.__notificou || 0),
      'e a notificação com o horário de término volta a fazer sentido').toBeGreaterThan(0);

    await page.evaluate(() => __t.forcarFimDoDescanso());
    await page.waitForTimeout(400);
    /* Qual dos dois avisos aparece depende de a pessoa estar ou não olhando o
       app; o que este teste garante é que o caminho web volta a existir. */
    expect(await page.evaluate(() =>
      document.getElementById('restDone').classList.contains('open') ||
      document.getElementById('restPop').classList.contains('open')),
      'e o alarme da web volta a ser necessário').toBe(true);
  });
});
