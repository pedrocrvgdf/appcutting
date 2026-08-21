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
| Arquivos | `index.html` (app inteiro), `sw.js`, `manifest.json`, ícones PNG |
| Build | **Não existe.** Sem npm, sem `package.json`, sem empacotador |
| Publicação | GitHub Pages, a partir da branch `main` |
| Backend | Firebase (Auth + Firestore) para login e sincronização |
| Idioma | Todo texto visível em **pt-BR** |

Todo o CSS e o JavaScript ficam **embutidos** no `index.html`. Não crie arquivos
`.js` ou `.css` separados sem combinar antes: isso quebraria o modelo de publicação.

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

---

## 5. Testes — verifique antes de entregar

Este projeto **não tem CI ainda**. A verificação é feita rodando o app de verdade
num navegador, com Playwright (Chromium já vem instalado no ambiente).

```bash
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
# navegador: /opt/pw-browsers/chromium-*/chrome-linux/chrome
```

**O que sempre verificar:**

1. Sintaxe do JavaScript embutido — extraia o bloco `<script type="module">`
   e rode `node --check --input-type=module`
2. O fluxo alterado, na tela, com dados realistas
3. **Sem erros de JavaScript** no console (ignore `Failed to load resource`
   de ícones quando servir por `file://`)
4. Largura de **390px e 320px** — o layout já quebrou em 320px antes
5. Temas **claro e escuro** — ambos são usados

Para testar o login, intercepte os módulos do Firebase com `page.route()`
e devolva módulos falsos; sem isso a sessão trava esperando a rede.

**Tire captura de tela e olhe.** Dois defeitos reais desta base — placeholder de
carga cortado ("57," em vez de "57,5") e a linha de referência despedaçada em
telas estreitas — só apareceram na imagem renderizada; nenhum teste automático
os pegou.

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
  por um limitador para ficar alto sem distorcer, e abaixa a música do celular
  um instante antes de tocar.

---

## 7. Issues e Pull Requests

- Abra uma **issue** para cada tarefa (correção, melhoria ou nova função) antes
  de começar, e **mencione o número dela na descrição do PR**
  (ex.: `Closes #12`).
- **PR só passa a valer a pena depois que houver teste automático rodando.**
  Hoje ele não barra nada: não há CI e não há segundo revisor. Enquanto for
  assim, prefira entregar os arquivos direto ao usuário.
- Se um PR já foi mesclado, **não empilhe novos commits sobre ele** — comece
  do zero a partir da `main`.

---

## 8. Ao entregar

- Diga o que foi verificado e **como**, com os números reais
  ("14 de 14 verificações passaram"), sem arredondar para melhor.
- Se algo falhou ou ficou de fora, diga explicitamente qual e por quê.
- Envie `index.html` **e** `sw.js` juntos, com a versão do cache já incrementada.
