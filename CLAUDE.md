# T-RESULTS — instruções do projeto

Leia este arquivo antes de qualquer alteração. Ele vale para **qualquer agente, de
qualquer modelo**. As regras aqui vieram de erros já cometidos — segui-las evita
repeti-los.

---

## 1. O que é este projeto

**T-RESULTS** (True Results) — PWA de dieta e treino, em português do Brasil,
usado no celular, principalmente dentro da academia.

| | |
|---|---|
| Arquivos do app | `index.html` (app inteiro), `sw.js`, `manifest.json`, ícones PNG |
| Servidor | `functions/` — só o aviso de descanso por push; o app funciona sem |
| Build | **Não existe.** O app não é empacotado nem transpilado |
| Publicação | GitHub Pages, a partir da branch `main` |
| Backend | Firebase (Auth + Firestore) para login e sincronização |
| Idioma | Todo texto visível em **pt-BR** |

Todo o CSS e o JavaScript ficam **embutidos** no `index.html`. Não crie arquivos
`.js` ou `.css` separados sem combinar antes: isso quebraria o modelo de publicação.

O `package.json` e a pasta `tests/` existem **somente para os testes** — o app
continua sendo um arquivo único servido direto. Publicar continua sendo copiar
`index.html` e `sw.js` para a `main`; nada é gerado por build.

---

## 2. Git e push — leia antes de tentar

A sessão nasce com o repositório anexado em **modo leitura**. Um `git push` direto
falha com `403` ou `could not read Username`.

**Antes do primeiro push, peça acesso de escrita:**

```
add_repo(owner: "pedrocrvgdf", repo: "appcutting", access: "push")
```

Só depois disso o push funciona.

### O que NÃO fazer

- ❌ **Nunca** oriente o usuário a revogar a autorização do Claude no GitHub.
  Isso não resolve nada e **destrói a credencial da sessão em andamento**,
  inclusive a de leitura, de forma irreversível.
- ❌ Não fique repetindo o push na esperança de que funcione. Se der `403`,
  o que falta é o `access: "push"` acima.
- ❌ Não mexa em `github.com/settings/installations` nem em
  `settings/apps/authorizations`. A instalação do app controla webhooks,
  **não** o acesso da sessão.

### Se mesmo assim falhar

Entregue os arquivos ao usuário com `SendUserFile` e explique que ele pode
subir por **Add file → Upload files** no site do GitHub — é o fluxo habitual dele
e funciona sem depender de credencial nenhuma.

---

## 3. Regra obrigatória de deploy

**Toda alteração no `index.html` exige subir a versão do cache no `sw.js`:**

```js
const CACHE = "tresults-vN";   // incremente N
```

O service worker serve o app do cache. Sem incrementar, os usuários continuam
recebendo a versão antiga e a correção simplesmente não chega. Esta regra não
tem exceção.

**A mesma versão precisa ser espelhada no `index.html`:**

```js
window.APP_RELEASE = "tresults-vN";   // igual ao CACHE
```

É ela que marca de qual versão veio cada erro no Sentry. Existe teste que falha
se as duas se desencontrarem (`tests/sentry.spec.js`).

Ao entregar, envie **os dois arquivos juntos** (`index.html` e `sw.js`).

---

## 4. Padrões de interface

O T-RESULTS é um **app**, não um site. Ele precisa se comportar como tal.

- **Nunca use `alert()`, `confirm()` ou `prompt()`.** Eles abrem o diálogo do
  navegador com a URL do site e destroem a sensação de app. Use as funções
  internas: `appAlert(msg)`, `appConfirm(msg, opts)` e `askDanger(opts)`
  (esta última para ações destrutivas, com confirmação por senha).
- **Zoom é bloqueado** por CSS (`touch-action`), por interceptação do gesto de
  pinça do iOS e do `Ctrl`+roda. Não reintroduza zoom sem combinar.
- Texto da interface **não é selecionável**; campos de digitação continuam sendo.
- Botões e rótulos em **pt-BR**, diretos e sem jargão
  (ex.: "Excluir" / "Voltar", não "OK" / "Cancelar").
- O app já tem animações (11 conjuntos de keyframes) e respeita
  `prefers-reduced-motion`. Mantenha esse respeito em qualquer animação nova.
- **Não adicione skeleton em elementos que renderizam do armazenamento local** —
  eles aparecem em milissegundos e o skeleton só faz piscar, deixando a sensação
  de lentidão. Skeleton só se justifica onde há espera de rede real.
- **A única espera de rede real do app é a abertura**, enquanto o Firebase
  confirma o login. É o que a tela `#splash` cobre: fundo igual ao do app, marca
  entrando só depois de 150 ms (abertura rápida não pisca nada), aviso de
  conexão lenta aos 6 s e botão de recomeçar aos 15 s. Ela sai em `showView()`,
  via `hideSplash()` — se você criar outro caminho que abre uma tela, chame
  `hideSplash()` nele também, senão o app fica preso na abertura.

---

## 5. Testes — rode antes de entregar

Existe uma suíte de Playwright versionada, que roda sozinha no GitHub Actions
a cada push na `main` e em todo pull request (`.github/workflows/testes.yml`).

```bash
npm install
npx playwright install --with-deps chromium   # só na primeira vez

npm test                                       # roda tudo
npx playwright test tests/treino.spec.js       # só um arquivo
```

Se o ambiente já tiver um Chromium instalado (é o caso dos containers de
sessão), aponte para ele em vez de baixar outro:

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium npm test
```

**Sempre rode a suíte antes de entregar.** Se você mexeu em algo que ela não
cobre, **acrescente um teste** — foi assim que ela cresceu.

| Arquivo | Cobre |
|---|---|
| `tests/treino.spec.js` | Persistência da sessão, retomada após o app ser descartado, desconto do tempo fora do app |
| `tests/historico.spec.js` | Referência da última sessão, sugestões, indicador de progressão de carga |
| `tests/interface.spec.js` | Zoom bloqueado, diálogos internos, layout em 390/320px, tema claro e escuro |
| `tests/alarme.spec.js` | Volume e ausência de distorção do alarme de descanso |
| `tests/sentry.spec.js` | Configuração do monitoramento, limpeza de dados pessoais, app abrindo sem a Sentry |
| `tests/alarme-descanso.spec.js` | Tela do alarme, interrupção da música, insistência, permissão |
| `tests/abertura.spec.js` | Splash, avisos de espera, instalação como app |
| `tests/push.spec.js` | Aviso com o app fechado, e o app funcionando sem ele |
| `tests/app.js` | Utilitários: Firebase falso, estado inicial, atalhos de navegação |

Os testes carregam uma **cópia instrumentada** do `index.html` (gerada em
`.test-app.html`, ignorada pelo git) com uma ponte `window.__t` para o escopo
do módulo. Se a linha `$("mealSel").value=defaultMeal();` for renomeada, a
injeção quebra e o próprio teste avisa — ajuste `ANCORA` em `tests/app.js`.

O login é interceptado com `page.route()` devolvendo módulos falsos do Firebase;
sem isso a sessão trava esperando a rede.

**A suíte não substitui olhar.** Dois defeitos reais desta base — placeholder de
carga cortado ("57," em vez de "57,5") e a linha de referência despedaçada em
telas estreitas — só apareceram em captura de tela. Tire captura do que mudou e
olhe, além de rodar os testes.

Chaves usadas no armazenamento local, úteis para montar cenários:

| Chave | Conteúdo |
|---|---|
| `cutting.v1` | Todos os dados do usuário |
| `cutting.owner` | UID do dono dos dados no aparelho |
| `tresults.run` | Treino em andamento (some ao finalizar) |
| `tresults.theme` | `light` / `dark` |

---

## 6. Cuidados no módulo de treino

- **A sessão de treino é persistida** em `tresults.run` e restaurada quando o
  celular descarta a página. Se você mexer em `renderTr`, `trSaveInputs` ou
  `startTRun`, garanta que `trPersist()` continua sendo chamado.
- **Tempo fora do app acima de 3 minutos não conta como treino** (`trS.away`).
  Use `trElapsedMs()` para duração, nunca `Date.now() - trS.start`, senão as
  calorias saem infladas.
- **O alarme do descanso é agendado no relógio do áudio** (`scheduleAlarm`), não
  por `setTimeout` — timers de JavaScript congelam em segundo plano. Ele passa
  por um limitador para ficar alto sem distorcer.
- **O alarme se comporta como o temporizador do celular:** toma o áudio com
  `transient-solo` (interrompe a música, não só abaixa), repete por
  `ALARM_DUR` segundos, vibra em ciclo e abre `#restDone`, que toma a tela
  inteira. Qualquer toque chama `alarmStop()`, que silencia tudo e devolve o
  áudio. Se você mexer aqui, garanta que **todo caminho de saída passa por
  `alarmStop()`** — senão o som fica preso e a música do usuário não volta.
- **Descanso vencido há mais de 3 minutos não alarma** (a pessoa voltou ao app
  muito depois). Mostra o estado, sem tocar nem interromper a música.

### Aviso com o app fechado (Web Push)

Quando o usuário sai para outro app, o navegador **congela** o nosso código: o
alarme sonoro não toca e nenhuma notificação local é disparada. Por isso existe
a pasta `functions/`: o app pede ao servidor um aviso para o horário do
término, e ele chega mesmo com o app fechado.

- `pushAgendar(segundos)` ao iniciar o descanso; `pushCancelar()` ao pular ou
  quando o alarme já tocou na tela (senão vira aviso repetido)
- **Tudo é opcional.** Sem permissão, sem as funções publicadas ou sem rede, o
  app funciona igual. Existe teste que garante isso (`tests/push.spec.js`) —
  não o remova ao mexer aqui.
- A chave VAPID pública vem da função `chavePush`; a privada é segredo do
  Firebase e nunca aparece no `index.html`

Diferenças entre os sistemas, ambas tratadas no `sw.js`:

| | Android | iOS |
|---|---|---|
| Push | funciona bem | exige iOS 16.4+ **e** app instalado na tela de início |
| Botões na notificação | aparecem | ignorados, sem quebrar |
| `requireInteraction` | fica até dispensar | ignorado |

### O app Android (`android/`) — temporizador nativo

O que está logo abaixo, em "o que não dá para fazer", vale **para a web**. Dentro
do app Android, dá — e é por isso que ele existe.

O app é uma **casca**: um `WebView` que carrega o mesmo `index.html` do GitHub
Pages. Publicar o T-RESULTS continua sendo copiar `index.html` e `sw.js` para a
`main`; o APK quase nunca muda.

O que a casca acrescenta, e a web não alcança:

| | Como |
|---|---|
| Contagem regressiva andando na barra | `setChronometerCountDown` — quem desenha é o sistema, não o nosso código |
| Alarme que sobrepõe a música | canal de notificação com `AudioAttributes.USAGE_ALARM` |
| Disparo no segundo certo com o app fechado | `AlarmManager.setAlarmClock`, o único agendamento que o Android não adia |
| Tela cheia por cima do TikTok | `setFullScreenIntent` com `CATEGORY_ALARM` |

A página conversa com o Android por `window.TResults` (ver `PonteWeb.kt`):

```js
const appNativo = !!(window.TResults && window.TResults.disponivel());
```

**Regra:** quando `appNativo` é verdadeiro, o caminho web precisa ficar
**desligado** — nada de `scheduleAlarm`, `notifMostrar`, `pushAgendar` nem
`abrirRestDone`. Os dois juntos dão alarme dobrado e duas telas de aviso
disputando. Existe teste para cada um desses (`tests/app-nativo.spec.js`), e o
último deles garante que no navegador comum tudo continua como era.

O APK é montado pelo GitHub Actions (`.github/workflows/apk.yml`) e baixado pela
aba **Actions** — não é preciso instalar o Android Studio. É um APK de
depuração, assinado com a chave de teste: instala por "fontes desconhecidas" e
serve para uso pessoal, não para a Play Store.

### O que não dá para fazer, e por quê

**Contagem regressiva andando na barra de notificação** — não existe API web.
Verificado no Chrome 141: as opções da notificação são `actions, badge, body,
data, dir, icon, image, lang, renotify, requireInteraction, silent, tag,
timestamp, title, vibrate` — não há cronômetro, não há som, não há prioridade.
O que dá **na web** é a notificação com o **horário de término**. A contagem
andando existe só no app Android, acima.

**Agendar notificação local** — o `TimestampTrigger` foi removido do Chrome.
Verificado no Chrome 141: `showTrigger` é `false` e `TimestampTrigger` é
`undefined`. Por isso o aviso vem do servidor, e não do aparelho.

**Alarme insistente com o app fechado** — o push entrega **uma** notificação
com o som do sistema, não um alarme tocando até ser dispensado. Isso é
privilégio de app nativo.

Não tente resolver nada disso com `<audio>` silencioso para segurar a sessão
de mídia: funciona, mas rouba os controles de mídia do celular e a música do
usuário perde o comando na tela de bloqueio — pior que o problema.

---

## 7. Monitoramento de erros

O app envia erros para o Sentry, e **só erros**: sem gravação de tela e sem
rastreamento de navegação. Ele guarda peso, medidas, e-mail e alimentação —
nada disso pode sair do aparelho.

- Todo texto enviado passa por `window.__sentryScrub`, que mascara e-mails e
  identificadores longos
- O rastro do console é descartado inteiro: ele costuma conter dados do usuário
- `sendDefaultPii` fica em `false`; `user` é removido em `beforeSend`
- A tag do carregador **precisa continuar com `async`** — sem isso ela trava a
  leitura da página e a abertura do app fica refém da rede

Se um dia ligar gravação de tela ou rastreamento, revise essa decisão com o
dono do app: é dado de saúde saindo para servidor de terceiro.

## 8. Issues e Pull Requests

- Abra uma **issue** para cada tarefa (correção, melhoria ou nova função) antes
  de começar, e **mencione o número dela na descrição do PR**
  (ex.: `Closes #12`).
- **Trabalhe por PR.** Agora existe CI: o pull request roda a suíte de testes
  antes de o código chegar na `main`, e é isso que ele barra. Não empurre
  direto para a `main` sem os testes terem passado.
- O fluxo do PR também avisa quando o `index.html` mudou sem que a versão do
  cache no `sw.js` subisse.
- Se um PR já foi mesclado, **não empilhe novos commits sobre ele** — comece
  do zero a partir da `main`.

---

## 9. Ao entregar

- Diga o que foi verificado e **como**, com os números reais
  ("14 de 14 verificações passaram"), sem arredondar para melhor.
- Se algo falhou ou ficou de fora, diga explicitamente qual e por quê.
- Envie `index.html` **e** `sw.js` juntos, com a versão do cache já incrementada.
