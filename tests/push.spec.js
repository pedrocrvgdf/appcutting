/* Aviso que chega com o app fechado.
   O ponto mais importante aqui não é o push funcionar — é o app continuar
   funcionando igual quando ele NÃO funciona: sem permissão, sem as funções
   publicadas ou sem rede. */

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, iniciarTreino, RAIZ } = require('./app');

/* Service worker e Notification falsos: sob file:// não há service worker de
   verdade, e a permissão real varia conforme o navegador. */
const AMBIENTE = permissao => {
  window.__fnCalls = [];
  window.__inscreveu = 0;
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: permissao, requestPermission: () => Promise.resolve(permissao) },
  });
  const registro = {
    showNotification: () => Promise.resolve(),
    getNotifications: () => Promise.resolve([]),
    pushManager: {
      getSubscription: () => Promise.resolve(null),
      subscribe: () => {
        window.__inscreveu++;
        return Promise.resolve({
          toJSON: () => ({ endpoint: 'https://push.exemplo/abc', keys: { p256dh: 'x', auth: 'y' } }),
        });
      },
    },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registro), register: () => Promise.resolve(registro) },
  });
};

/** Respostas que as Cloud Functions dariam se estivessem publicadas. */
const PUBLICADAS = {
  chavePush: { chave: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' },
  agendarAlarme: { ok: true },
  cancelarAlarme: { ok: true },
};

async function abrirCom(page, { permissao = 'granted', funcoes = PUBLICADAS } = {}) {
  await page.addInitScript(AMBIENTE, permissao);
  await page.addInitScript(r => { window.__fnRespostas = r; }, funcoes);
  return abrirApp(page, estadoBase());
}

const chamadas = page => page.evaluate(() => (window.__fnCalls || []).map(c => c.nome));

test.describe('Aviso com o app fechado', () => {

  test('agenda o aviso no servidor ao iniciar o descanso', async ({ page }) => {
    const erros = await abrirCom(page);
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(500);

    const feitas = await page.evaluate(() => window.__fnCalls);
    const agendar = feitas.find(c => c.nome === 'agendarAlarme');

    expect(feitas.map(c => c.nome), 'precisa buscar a chave antes de inscrever').toContain('chavePush');
    expect(await page.evaluate(() => window.__inscreveu), 'inscreve o aparelho no push').toBe(1);
    expect(agendar, 'sem isto, nada chega com o app fechado').toBeTruthy();
    expect(agendar.dados.emSegundos, 'descanso do exercício é de 90s').toBe(90);
    expect(agendar.dados.sub.endpoint, 'manda a inscrição deste aparelho').toContain('push.exemplo');
    expect(agendar.dados.id, 'identificador para poder cancelar depois').toBeTruthy();
    expect(erros).toEqual([]);
  });

  test('cancela o aviso quando o descanso é pulado', async ({ page }) => {
    await abrirCom(page);
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('trRest').click()); // toque = pular
    await page.waitForTimeout(400);

    expect(await chamadas(page), 'senão chegaria aviso de um descanso já encerrado')
      .toContain('cancelarAlarme');
  });

  test('cancela o aviso quando o alarme já tocou na tela', async ({ page }) => {
    await abrirCom(page);
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => __t.forcarFimDoDescanso());
    await page.waitForTimeout(400);

    expect(await chamadas(page), 'já avisamos na tela: o push viraria aviso repetido')
      .toContain('cancelarAlarme');
  });

  test('sem permissão de notificação, não tenta agendar nada', async ({ page }) => {
    const erros = await abrirCom(page, { permissao: 'denied' });
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(500);

    expect(await page.evaluate(() => window.__inscreveu), 'nada de inscrever sem permissão').toBe(0);
    expect(await chamadas(page)).not.toContain('agendarAlarme');
    expect(erros).toEqual([]);
  });

  test('com as funções ainda não publicadas, o app funciona igual', async ({ page }) => {
    /* É o estado do projeto até o deploy acontecer: as chamadas falham e nada
       pode quebrar por causa disso. */
    const erros = await abrirCom(page, { funcoes: {} });
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(500);

    const estado = await page.evaluate(() => ({
      descansoRodando: document.getElementById('trRest').classList.contains('resting'),
      tentou: (window.__fnCalls || []).some(c => c.nome === 'chavePush'),
      naoAgendou: !(window.__fnCalls || []).some(c => c.nome === 'agendarAlarme'),
    }));

    expect(estado.tentou, 'tenta, e é a falha dessa chamada que precisa ser inofensiva').toBe(true);
    expect(estado.naoAgendou).toBe(true);
    expect(estado.descansoRodando, 'o descanso local segue normal').toBe(true);
    expect(erros, 'falha do servidor não pode virar erro no app').toEqual([]);

    // e o alarme na tela continua funcionando, que é o aviso principal
    await page.evaluate(() => __t.forcarFimDoDescanso());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.getElementById('restDone').classList.contains('open')))
      .toBe(true);
  });
});

test.describe('Notificação enviada pelo servidor', () => {

  test('o service worker mostra o aviso ao receber o push', async () => {
    /* Sob file:// não há service worker de verdade, então executamos o
       tratador do sw.js num ambiente controlado. */
    const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
    const trecho = sw.match(/self\.addEventListener\("push"[\s\S]*?\n\}\);/);
    expect(trecho, 'sw.js precisa tratar o evento push').toBeTruthy();

    let mostrada = null;
    const self = {
      registration: { showNotification: (t, o) => { mostrada = { titulo: t, opcoes: o }; return Promise.resolve(); } },
      addEventListener: (nome, fn) => { if (nome === 'push') self.__push = fn; },
    };
    // eslint-disable-next-line no-new-func
    new Function('self', trecho[0])(self);

    self.__push({
      data: { json: () => ({ titulo: 'Descanso concluído', corpo: 'Hora da próxima série.' }) },
      waitUntil: p => p,
    });

    expect(mostrada, 'o push precisa virar notificação').toBeTruthy();
    expect(mostrada.titulo).toMatch(/concluíd/i);
    expect(mostrada.opcoes.requireInteraction, 'no Android fica até ser dispensada').toBe(true);
    expect(mostrada.opcoes.vibrate, 'vibração junto com o som').toBeTruthy();
    expect(mostrada.opcoes.actions.map(a => a.action), 'botões do Android')
      .toEqual(['abrir', 'dispensar']);
  });

  test('o push usa o padrão quando vem sem conteúdo', async () => {
    const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
    const trecho = sw.match(/self\.addEventListener\("push"[\s\S]*?\n\}\);/)[0];

    let mostrada = null;
    const self = {
      registration: { showNotification: (t, o) => { mostrada = { titulo: t, opcoes: o }; return Promise.resolve(); } },
      addEventListener: (nome, fn) => { if (nome === 'push') self.__push = fn; },
    };
    // eslint-disable-next-line no-new-func
    new Function('self', trecho)(self);

    self.__push({ data: null, waitUntil: p => p });

    expect(mostrada, 'sem conteúdo ainda assim precisa avisar').toBeTruthy();
    expect(mostrada.titulo).toMatch(/Descanso/);
  });

  test('o botão Dispensar não abre o app', async () => {
    const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
    expect(sw, 'sem isto, dispensar abriria o treino sem querer')
      .toMatch(/e\.action === "dispensar"[\s\S]{0,40}return/);
  });
});

test.describe('Configuração do deploy', () => {

  /* O `firebase deploy` recusa o firebase.json antes de olhar o código, e a
     mensagem de erro não diz qual chave está errada. Já aconteceu com
     `"hosting": null`: chave sem uso, valor que o esquema não aceita. */
  test('o firebase.json não tem chave com valor nulo', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'firebase.json'), 'utf8'));
    const nulas = Object.keys(cfg).filter(k => cfg[k] === null);
    expect(nulas, 'chave sem uso deve ser removida, não zerada').toEqual([]);
  });

  test('o firebase.json aponta para a pasta das funções', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'firebase.json'), 'utf8'));
    expect(cfg.functions, 'sem isto o deploy não acha o código').toBeTruthy();
    expect(cfg.functions.source).toBe('functions');
    expect(fs.existsSync(path.join(RAIZ, cfg.functions.source, 'index.js'))).toBe(true);
  });

  test('a versão do Node bate entre o firebase.json e o package.json', () => {
    /* Se desencontrarem, o deploy usa uma e o `npm install` do build usa outra,
       e a falha aparece só lá no Cloud Build. */
    const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'firebase.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'functions', 'package.json'), 'utf8'));
    expect(cfg.functions.runtime).toBe('nodejs' + pkg.engines.node);
  });

  test('a chave privada do VAPID não está em lugar nenhum do que é publicado', () => {
    /* Ela é segredo do Firebase. Se vazar para o index.html, qualquer pessoa
       manda notificação em nome do app. */
    for (const arquivo of ['index.html', 'sw.js', 'firebase.json', 'functions/index.js']) {
      const txt = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
      expect(txt, `${arquivo} não pode conter a chave privada`)
        .not.toMatch(/VAPID_PRIVADA\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
    }
  });
});
