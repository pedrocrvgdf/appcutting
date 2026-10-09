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
| Arquivos do app | `index.html` (app inteiro), `sw.js`, `manifest.json`, ícones PNG, `privacidade.html` (política de privacidade), `diag.html` (diagnóstico) |
| Servidor | `functions/` — só o aviso de descanso por push; o app funciona sem |
| Dados importados | `dados/` (planilha oficial da TACO) e `tools/importar_taco.py`, que gera o bloco no `index.html` |
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
- **Ação destrutiva com conta na nuvem pede a senha da conta** — `askDanger`
  com `pw:true` — e a senha é conferida com `reauthenticateWithCredential`
  antes de qualquer coisa ser apagada. Não é enfeite: `pushRemote` grava o
  documento inteiro **sem merge**, então o apagado sobe por cima do histórico e
  não sobra cópia em lugar nenhum. Antes de existir esta regra, três toques de
  quem estivesse com o celular destravado destruíam a conta inteira. Em modo
  local (sem `cloudEnabled`/`user`) não há senha a conferir, e exigir uma
  trancaria a pessoa fora do próprio app. Coberto por `tests/conta.spec.js`.
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
- **Depois da abertura vem a imersão** (`#imersao`, `mostrarImersao()`): o
  cumprimento pelo nome, que cobre a chegada ao Início e sai sozinha em 2 s.
  Regras dela: um toque dispensa; treino em andamento **não** passa por ela
  (`trRestore` vem antes); sem nome configurado ela não aparece; e com
  `prefers-reduced-motion` ela nem entra — sem movimento seria só uma parede
  de 2 s na frente do app. Coberta em `tests/abertura.spec.js`.

### A direção visual: off-white, fio fino e o saldo em verde fosco

O app já foi cartoon (contorno preto e sombra dura) e depois pastel arredondado
(sombra difusa, cantos de 30px, Quicksand). O dono achou que o pastel "parecia
livro de receitas" e escolheu esta direção depois de comparar quatro maquetes.
Ela vive num bloco próprio no fim do CSS ("DIREÇÃO OFF-WHITE E VERDE") e nos
tokens do `:root`.

- **Fundo off-white** (`--bg` #F6F5F1) e **cartões brancos separados por fio
  fino**, não por sombra: os tokens `--sombra`, `--sombra-sm` e `--shadow`
  viraram `0 0 0 1px var(--line)`. Quem usa os tokens ganhou o fio sozinho.
  Não devolva sombra difusa colorida.
- **Cantos médios:** 20–22px nos cartões, 16–18px no que vive dentro deles.
- **Fonte Sora** em `--sans` e `--display`, pesos 400 a 800.
- **Botão de ação em degradê de verdes** (`--acao`, do menta ao verde da
  marca). O texto fica centralizado, onde o degradê já é escuro o bastante
  para o branco ler. Botão secundário é branco com fio.
- **O saldo do dia é um cartão verde-escuro FOSCO**, com o anel numa cor só
  (verde sálvia), sem halo e sem degradê: o dono pediu "fosco ao invés de
  neon". Ele aparece no Início (`.fd-resumo`) e na Alimentação
  (`.hero .ringwrap`), e o cartão do objetivo no perfil (`.pfgoal`) usa o
  mesmo fundo. **O cartão redefine os tokens para si** (`--ink`, `--muted`,
  `--line`, `--primary`, `--anel-tri`) em vez de reescrever cada regra de
  cor: o anel que o JavaScript pinta com `var(--primary)` passa a sair
  sálvia sem mexer no JavaScript. Se criar outro elemento dentro dele, use os
  tokens e ele já nasce certo.
- **Marca d'água por aba**, em `#view-*::before`: o T da marca no Início e no
  Progresso, talheres na Comida, halter no Treino, silhueta no Perfil. É
  máscara SVG sobre `var(--ink)` a 3,5%, em `z-index:-1`, sem criar contexto
  de empilhamento (senão prenderia pop-ups). Some atrás de qualquer cartão,
  de propósito.
- **Verde como TEXTO é o verde da marca, não o menta.** Menta sobre branco
  não passa de 2:1 de contraste.
- **Macros:** ilhas neutras com fio; o verde só na barra que enche, do mais
  claro ao mais fundo. Foi pedido "tire as cores diversas, deixe como
  predominância a cor do app", e o pastel de cada um era o resto do visual
  antigo.
- Botão apertado **encolhe** (`transform:scale(.97)`).
- Fundo tingido pede tinta escura por cima: `--selo-bg`/`--selo-ink` e
  `--macro-ink`/`--macro-num` existem porque reaproveitar `--mg` como fundo de
  texto escuro deixou o selo "+25% de carga" ilegível no tema claro.
- **O tema escuro segue a mesma estrutura**: grafite esverdeado, fio fino, o
  mesmo saldo fosco um tom acima. Ainda não houve rodada de revisão dele com
  o dono.

### Criar conta, e a idade que não envelhece errada

Cadastrar já foi preencher os mesmos campos do "Entrar" e apertar outro botão
embaixo — e gente de verdade não entendia se tinha entrado ou se cadastrado.
Hoje `#btnSignup` abre `#cadastroOverlay`, um pedido próprio com nome completo,
data de nascimento, e-mail e senha.

- **A idade sai da data, sempre** (`idadeDe`/`idadeAtual`). Guardar a idade como
  número a congela: quem se cadastrou aos 29 seguiria 29 para sempre, e como
  Mifflin-St Jeor tira 5 kcal por ano, a meta diária ia ficando errada em
  silêncio, um ano por vez. `store.goals.idade` continua sendo gravado, mas é
  **derivado** — quem manda é `nasc`.
- **Contas antigas não têm `nasc`** e seguem pelo número digitado. É por isso
  que `idadeAtual` tem os dois caminhos, e que o campo de idade no formulário de
  objetivo só fica travado quando existe data.
- **`saveGoals` remonta `store.goals` do zero.** Se você mexer nele, carregue
  `nasc` junto — sem isso a data some no primeiro salvamento e a idade volta a
  ser número parado. Existe teste para exatamente isso.
- Data fora de 10–100 anos é recusada no cadastro: quase sempre é ano digitado
  errado (1092 por 1992), e a conta de calorias sairia absurda sem ninguém
  perceber. A idade aparece embaixo do campo enquanto se digita.
- O formato que o campo de data **mostra** vem do idioma do aparelho, não do
  `lang` da página; o valor é sempre ISO. Não tente "consertar" isso.
- Coberto em `tests/cadastro.spec.js`.

### Uso de exógenos: quem usa clembuterol gasta mais em repouso

O dono pediu que o app fosse "para todos", inclusive para atleta que usa
anabolizante ou estimulante — e estimulante muda o gasto diário (GETD), logo a
meta. A pergunta "Faz uso de exógenos?" vive no passo **Sua meta** do objetivo
(`#gExogSeg`) e no **"+" do Início** (`#fdMais` → `#exogOverlay`), que existe
para quem já usava o app avisar sem refazer o objetivo. Os dois usam o **mesmo
marcador** (`montarExog`): eram para ser duas cópias, e cópia é como o defeito
volta.

- **Marcar uma opção passa pelo pop-up de riscos** (`exogRiscos`,
  `#exogRiscoOverlay`) antes de valer; "Voltar" deixa desmarcado. Desmarcar
  não pede nada. O texto dos riscos é o das orientações do Ministério da Saúde
  e da Anvisa. **Ele foi escrito sem acesso ao gov.br** (o proxy da sessão
  bloqueia o domínio): confira lá quando puder, e não acrescente número
  nenhum nele.
- **Só entra na conta o que foi medido em humanos**, e a fonte fica no código
  (`EXOG`, `exogFatorDe`):
  - Clembuterol: **+21% do gasto em repouso** 140 min após 80 mcg, em seis
    homens jovens — Jessen et al., *Drug Test Anal* 2020;12:610-618, PMID
    31887249. É **uma dose só**: a resposta por dose não foi medida em pessoas,
    então o app **escala em proporção** a partir de `CLEN_REF` (80) e **trava
    em `CLEN_MAX`** (120 mcg). Isso é extrapolação declarada, não medição. Sem
    dose digitada, vale a do estudo, e a tela diz isso.
  - Efedrina: **+10%** sustentado, com 20 mg três vezes ao dia por três meses,
    em cinco mulheres — Astrup et al., *Metabolism* 1986;35:260-265, PMID
    3512957. Não escala por dose.
  - Anabolizante: **só informação, a meta não muda.** Não há medida confiável
    do efeito no gasto (retirada ou reposição aguda de testosterona não mudou
    o gasto em repouso — Berg et al., *Obesity* 2010, PMID 20448541).
- **O acréscimo soma sobre a taxa basal, não multiplica o GETD inteiro**
  (`computeGETD`): o que foi medido foi repouso, e no exercício o efeito do
  agonista β2 some (Hostrup, salbutamol, PMID 34665856).
- **Clembuterol e efedrina juntos: vale o maior, não a soma.** Mesmo caminho
  adrenérgico. Existe teste.
- **A dose é em microgramas (mcg), e a tela avisa.** Clembuterol se dosa em
  mcg; "20 mg" seria mil vezes a dose. O campo é `type="text"` com `numBR`,
  como os do cardio, para a vírgula não sumir.
- `saveGoals` remonta `store.goals` do zero: `exog`, `clenDose`, `exogAceite`
  e `exogLocal` precisam ser carregados junto, como `nasc`. Existe teste.
- Coberto em `tests/exogenos.spec.js`.

**Este dado é sensível pela LGPD** (dado de saúde, art. 5º e 11, e que pode
sugerir conduta ilícita). Por isso ele tem tratamento próprio, e cada ponto
tem teste:

- **O pop-up de riscos é também o consentimento.** Ele diz que o app não
  recomenda nem prescreve, que a informação é dado de saúde, e "Entendi,
  marcar" grava a data em `goals.exogAceite`. "Não" limpa a data junto.
- **Por padrão fica só no aparelho** (`goals.exogLocal`, ligado quando não há
  escolha guardada). `pushRemote` sobe o objetivo por `goalsParaNuvem`, que
  tira `EXOG_CAMPOS`; e `applyRemote` **guarda os campos locais antes de
  trocar o `store`** e os devolve depois, senão a primeira sincronização
  vinda de outro aparelho apagaria a escolha daqui. O número do GETD sobe
  normalmente: é só um número. Isso vale só para o **dono do aparelho**
  (`cutting.owner`): outra conta entrando no mesmo celular não herda nada
  disso (veja "A nuvem").
- Consequência que vale saber: em outro celular o objetivo chega sem o
  exógeno, e se ele for salvo lá o GETD volta a ser calculado sem o efeito.
  É o preço de não subir o dado, e a chave diz isso na tela.
- **`privacidade.html`** é a política de privacidade, ligada do perfil
  (`#pfPriv`) e do pop-up. É a segunda página do site, além do `diag.html`;
  está no `CORE` do service worker e a navegação para ela cai no cache dela
  quando offline, e não no `index.html`.

### Passos do dia

A pessoa digita o total que o celular ou o relógio contou, e o app o converte
em distância e em calorias que entram no gasto daquele dia. Lança-se na
**Alimentação** (`#passosRow`, embaixo do saldo, no dia visto pela seta) e no
**Início** (`#fdPassos`, sempre hoje); os dois abrem o mesmo pop-up
(`#passosOverlay`, `abrirPassos(dk)`). Fica em `store.passos[dia] = {n,
inclui, peso}`, sincronizado como o resto.

- **O peso da conta é o daquele dia, e fica gravado com os passos**
  (`pesoNoDia`, `pesoPassos`): a última pesagem até o dia, o mesmo peso que
  o cardio usa — antes os passos usavam o peso do objetivo e o cardio a
  última pesagem, e a mesma caminhada valia dois números. Gravado, uma
  pesagem nova não muda os passos de ontem. Registro de antes da v45, sem
  `peso`, segue com o peso do objetivo, como sempre foi.

- **Passo = 0,415 × altura (homem) ou 0,413 × altura (mulher)**, a regra
  padrão de calibração de pedômetro (`passadaM`). Sem altura ou peso o app
  guarda os passos e **não inventa caloria**: a tela pede o perfil.
- **Calorias = peso × km × `CUSTO_CAMINHADA`**, o mesmo custo da caminhada do
  cardio. Foi por isso que o custo foi corrigido nos dois ao mesmo tempo.
- **Num dia com passos, a rotina estimada sai e o medido entra**
  (`baseSemRotina`): a base é o GETD menos `TMB × (fator da rotina − 1,2)`,
  o piso sedentário. Com GETD digitado à mão o desconto é o mesmo; o
  exógeno fica, porque é somado à parte. **Dias sem passos não mudam.** Quem
  andou menos que a rotina estimada vê a meta cair: é o medido mandando.
- **A troca aparece inteira na tela** (`rotinaKcal`, `efeitoPassos`). O dono
  via "+421 kcal" no selo e a meta parada: a rotina que saiu valia quase o
  mesmo, e a tela só mostrava o que entrava. Hoje o pop-up, a linha da
  Alimentação e o selo do Início dizem o que entra, o que sai e o efeito
  na meta ("421 no lugar de 420 da rotina · +1 na meta"). Ele escolheu
  isso no lugar de mudar a conta. **Não volte a mostrar só o que entra.**
- **As três telas usam a mesma conta (`gastoDia`)**: Início, Alimentação e
  o "Gasto de hoje" do Treino, que já mostrou "GETD + treino" ignorando os
  passos. Existe teste.
- **A pergunta "esses passos já incluem a atividade de hoje?" só aparece
  quando há caminhada, corrida ou esteira com km naquele dia**
  (`kmAtividades`). Nem todo app soma as duas coisas. Com "sim", as
  calorias da atividade ficam como estão e só os passos **além** dela entram
  (a distância da atividade vira passos pela mesma passada; para corrida isso
  superestima um pouco e a sobra sai menor, que é o lado seguro). Com "não",
  entram todos. **Nunca desconta**: menos passos que a atividade dá sobra
  zero, não número negativo. A resposta fica guardada por dia, e a da última
  vez vem marcada (`tresults.passosInc`).
- O campo é `type="text"` com `inputmode="numeric"`, aceita "10.000" e
  recusa letra; teto `PASSOS_MAX`.
- Coberto em `tests/passos.spec.js`.

### O peso do dia, e a meta que acompanha o peso

O pedido: "adicione também na tela aonde está os passos para a pessoa
adicionar o peso atual (ela pode colocar por dia ou semanalmente ou quando
ela quiser)". A linha fica **logo depois da dos passos**: no Início
(`#fdPeso`, sempre hoje) e na Alimentação (`#pesoRow`, o dia visto pela
seta). As duas abrem `#pesoOverlay` (`abrirPeso(dk)`), que grava na mesma
lista da curva de peso (`store.weights`, por `gravarPeso`) e passa pela mesma
conferência do Progresso (`conferePeso`).

O defeito por trás: a taxa basal, o GETD e a proteína usavam o peso digitado
no dia em que o objetivo foi salvo. Quem perdia 8 kg continuava com o GETD de
quando pesava mais (Mifflin-St Jeor: 10 kcal por kg, vezes o fator da
rotina), e corrigir o peso no objetivo **reiniciava o plano** (`inicio`
voltava para hoje). Por isso o objetivo passou a guardar dois pesos:

- **`pesoAtual` é o peso no início do plano.** Dele saem o ritmo, o "faltam X
  kg" e o `inicio`. Mudá-lo continua sendo começar outro plano.
- **`pesoConta` é o peso da conta** (`pesoConta(g)`, usado por `computeTMB`
  e `macroTargets`). Ausente, vale o `pesoAtual`. Só muda quando a pessoa
  toca **"Atualizar"**.

**A meta nunca muda sozinha.** Quando a pesagem mais recente muda o gasto
estimado em `GETD_AVISO` (25) kcal ou mais, um cartão no Início (`#fdAjuste`)
e na Alimentação (`#alAjuste`) diz quanto e mostra a meta de hoje antes e
depois (`metaComAjuste`, a conta inteira, com passos e treino):

- "Atualizar" troca `pesoConta` e o GETD (`aplicarAjuste`); o plano, o
  `inicio` e o `pesoAtual` não mudam.
- "Manter" grava a data daquela pesagem em `goals.mantido`; a próxima
  pesagem pergunta de novo.
- O limiar é decisão de produto: abaixo dele a diferença some no erro da
  própria estimativa.
- `saveGoals` remonta `store.goals` do zero: **`pesoConta`, `getdManual` e
  `mantido` são carregados junto**, como `nasc` e o exógeno. Com o mesmo
  plano, `pesoConta` fica; com plano novo (outro peso de partida, alvo,
  prazo ou objetivo), a conta parte do peso de partida.

**O GETD de cada dia** (`store.getdHist`, `{desde, getd, base}`): mudar o
GETD não pode reescrever o saldo dos dias que passaram — a semana, o mês e a
sequência mudariam sem a pessoa ter comido nada diferente. **Todo caminho
que muda `store.getd` passa por `mudarGetd(novo, foto)`**, com a `foto`
(`fotoGetd`) tirada **antes** de mexer no objetivo: na primeira mudança ela
vira a entrada `"0000-01-01"`, que vale para todo o passado. `gastoBase(dk)`
devolve, para dia passado, a entrada mais recente até ele; hoje usa o atual.
Sem histórico, vale o atual, como sempre foi. É campo de primeiro nível na
nuvem, em `CAMPOS_NUVEM`, e segue "campo ausente não é lista vazia".

**GETD digitado à mão** (`goals.getdManual`): não é mais trocado sozinho —
nem pelo objetivo, nem pelo "+" do exógeno, nem pela pesagem (o cartão nem
aparece). A nota `#getdNota` diz isso embaixo do campo, com "Usar o
calculado" (`#getdAuto`), que tira a marca.

- Coberto em `tests/peso.spec.js`.

### A busca de alimentos

O dono reclamou que "o repertório de pesquisa não achava nada". Havia duas
causas, e nenhuma era o tamanho do banco.

- **O casamento local é `buscaAlimentos(frase, lista)`**, não `includes`. A
  frase vira palavras; cada palavra precisa aparecer no nome, em qualquer
  ordem, por começo de palavra, no singular ou no plural (`alimRaiz`), tolerando
  um erro de digitação nas maiores (`alimPerto`, que aceita vizinhas
  invertidas — "frnago"). O resultado sai ordenado por afinidade
  (`alimPontos`), não pela ordem em que o banco foi digitado, e nome repetido
  aparece uma vez. **Uma palavra sem casa é resposta errada**: "frango xyzabc"
  devolve vazio, não "Frango".
- `ALIM_SIN` guarda apelidos regionais (aipim → mandioca). É só isso; não vire
  dicionário.
- **A busca do protocolo de refeições (`#pmSearch`) usa a mesma função.** Eram
  duas cópias do `includes`; consertar uma e esquecer a outra é como o defeito
  volta.
- **A internet entra sozinha quando o banco responde pouco** (menos de
  `OFF_MIN` nomes, hoje 3), 700 ms depois de a pessoa parar de digitar
  (`offAutoT`). "Linguiça" tinha um nome só no banco e o dono concluía que o
  app "não acha linguiça". O que vem de fora entra **embaixo** do que é local
  (`pintarDrop` redesenha os dois), sem repetir nome; com o banco vazio a
  lista vira só internet. Com resposta farta a internet **não** é consultada
  sozinha: é o que a pessoa digitou saindo para um terceiro sem necessidade. A
  linha "Buscar na internet" continua para quem quiser forçar. Resposta que
  chega para uma frase que a pessoa já trocou é descartada.
- **Open Food Facts:** produto que só traz a energia em kJ (`energy_100g`)
  entra, convertido (÷ 4,184) — exigir `energy-kcal_100g` jogava fora
  justamente os rótulos brasileiros. **Os dois corredores pedem produto do
  Brasil** (`countries_tags:"en:brazil"` no search-a-licious, `cc=br` no
  cgi): sem o filtro, "picanha" devolvia hambúrguer importado e "salmão" um
  produto só; com ele, 30 coxinhas em vez de 9. A busca mundial é
  **reserva**, junto com o proxy (`api.allorigins.win`): entram se os
  diretos demoram 3,5 s ou assim que os dois terminam sem nada. O proxy não
  entra se já houve resposta — seria mandar o que a pessoa digitou a um
  terceiro sem necessidade. Produto do Brasil vem antes (`ordenarOff`), e **o
  que não tem nenhuma palavra da pergunta no nome nem na marca sai da lista**
  (o serviço casa por ingrediente: "banana" trazia barra de proteína), desde
  que sobre alguma coisa que tenha. **Cuidado nos testes:** a lista de
  campos da URL também contém `countries_tags`; quem distingue o pedido do
  Brasil é o trecho com o valor.
- **A TACO está no banco local** (`const TACO`, 591 alimentos, por 100 g):
  Tabela Brasileira de Composição de Alimentos, 4ª edição, NEPA/UNICAMP,
  2011. É ela que cobre a comida genérica e o prato pronto que a internet
  não acha (picanha, strogonoff, coxinha). A fonte é a **planilha oficial**
  (https://nepa.unicamp.br/publicacoes/tabela-taco-excel/), guardada em
  `dados/taco-4ed-unicamp.xlsx`, e o bloco entre `/* TACO:INICIO */` e
  `/* TACO:FIM */` é **gerado** por `tools/importar_taco.py` — não edite à
  mão; mude a planilha ou o script e rode de novo. Das 597 linhas, 6 não têm
  dado nenhum ("*"/"NA" em tudo) e ficam de fora; "Tr" (traço) vira 0. O
  PDF da obra autoriza: "É permitida a reprodução total ou parcial do
  material, desde que seja citada a fonte" — por isso cada linha leva
  `src:"taco"` e a lista mostra "· TACO". Os nomes são os da tabela
  ("Carne, bovina, picanha, com gordura, grelhada"); o casamento por
  palavras acha "picanha grelhada" neles, e o nome curto do banco próprio
  continua vindo antes porque é mais curto.
- **A TBCA (USP) NÃO pode ser importada.** O site diz: "Não é permitida a
  reprodução total ou parcial do material" e "Para fins comerciais, é
  necessário contatar os coordenadores". Ela fica como consulta externa. Só
  entra se o dono obtiver autorização por escrito dos coordenadores.
- **O que ainda falta:** marcas e restaurantes em pt-BR. Serviços como
  FatSecret exigem chave que não pode viver no `index.html` (teria que passar
  por uma função em `functions/`). Está na issue #62.
- **Com o teclado aberto, a lista precisa caber no que sobra da tela**
  (`ajustarDrop`). No app Android (targetSdk 35) a página **não encolhe** para
  o teclado: ele só cobre, e a lista nascia embaixo dele. O `visualViewport`
  sabe o que está visível de verdade; a barra de abas, fixa embaixo, também
  tira espaço. O campo sobe para o alto ao ganhar foco (`subirBusca`).
- **O rastro para diagnóstico** (`rastro()`, chave `tresults.rastro`, últimos
  40) existe porque o dono relatou "o teclado fecha sozinho" no app Android e
  nada no código faz isso por tempo. O app anota quem tirou o foco da busca e
  para quem, página escondida/visível, tamanho da janela visível e troca de
  tela; o `diag.html` mostra. **Nunca anote o que a pessoa digitou.**
  `rastro` é `function`, não `const`, porque `showView` a chama e pode rodar
  antes da linha em que ela é definida.
- **Não invente valores nutricionais.** Números chutados num app de dieta
  são pior que "não achei". O que entrou veio com fonte (a TACO, acima); se
  importar outra tabela, registre a fonte, a licença e o arquivo original em
  `dados/`, e gere o bloco por script, como a TACO.
- O serviço não é alcançável do ambiente de sessão (o proxy bloqueia): os
  testes respondem no lugar dele, com o formato real das duas APIs (`hits` /
  `products`). Coberto em `tests/alimentos.spec.js`.

### Números na tela são em português

Casa decimal se escreve com **vírgula**. Existe `kgTxt(v)` para isso: arredonda
para uma casa e troca o ponto pela vírgula, **sem forçar decimal** — 5 km sai
"5", 7,5 km sai "7,5". `r1()` devolve um número cru e escreve `42.5` com ponto:
use-o para contas, nunca direto no HTML. Já apareceram com ponto o peso das
séries, a diferença de carga e a distância do cardio; hoje há teste para os três
(`tests/feed.spec.js`). Os macros do dia na Alimentação ("3.8") foram o
quarto, achado por captura de tela (`tests/virgula.spec.js`).

### Números digitados: a vírgula não multiplica por dez

**Nenhum campo do app é `type="number"`**, e existe teste que confere isso no
`index.html` inteiro. No teclado numérico brasileiro a tecla decimal é a
vírgula, e o `type="number"` a descartava antes de o JavaScript enxergar:
"57,5" virava 575 na carga da série, e contaminava o selo, o 1RM, o volume e
a referência da próxima vez.

- Todo campo numérico é `type="text"` com `data-num="dec"` (aceita dígito,
  vírgula e ponto) ou `data-num="int"` (dígito e ponto de milhar), e o
  `inputmode` certo. Um filtro único, em captura, limpa o resto antes de
  qualquer outro ouvinte ler o campo.
- **Leitura:** `numBR` para kg e cm (o ponto é decimal: "82.4" é 82,4, porque
  há teclado que só tem ponto); `qtdBR` para gramas, ml e kcal ("1.500" é mil
  e quinhentos, não um e meio); `inteiroBR` para o que é inteiro (reps,
  minutos, idade, GETD). Nunca `parseFloat(x.value)` num campo destes.
- **Escrita:** número que volta para dentro de um campo passa por `campoBR`
  (vírgula, sem casas à toa).
- **Conferências, que perguntam e nunca trocam o número sozinhas.** Os
  limites são decisão de produto, não fisiologia, e estão no código:
  - pesagem a mais de 10% da pesagem mais perto, ou fora de 30–250 kg sem
    nenhuma para comparar, pergunta (`conferePeso`, "Talvez seja 82,4 kg");
    acima de 400 kg não é peso de gente e não grava;
  - carga de série no dobro da maior da última vez (e 10 kg a mais) pergunta
    antes de seguir para o próximo exercício (`confereCargas`); referência de
    outra academia não serve de régua;
  - mais de 2 kg (ou 2 L) num lançamento de comida pergunta (`confereQtd`).
- **Corrigir série** (`#serieOverlay`, `abrirSerie`): na sessão inteira,
  tocar numa série abre a correção. Antes, um número errado só saía apagando
  a sessão inteira. Corrigir recalcula o `vol` da sessão (e com ele o selo);
  as calorias não mudam, porque vêm da duração e do esforço, não da carga.
- Coberto em `tests/virgula.spec.js`.

### O histórico de líquidos

O total sozinho não respondia à pergunta de quem abre o app no meio da tarde:
"eu já lancei a garrafa do almoço?". Por isso cada lançamento vira uma linha com
horário, embaixo do anel de água (`renderLiqHist`).

- **`store.liquids[dia]` continua sendo o total que manda.** É ele que alimenta
  o anel e é ele que já existe no aparelho de quem usa o app. O
  `store.liqLog[dia]` é anotação de **quando**, e por isso pode estar
  incompleto: quem já usava o app tem total e nenhum log. A diferença aparece
  como a linha **"Lançado antes de existir histórico"**, em vez de a lista e o
  anel se desmentirem na tela. Se você trocar a ordem dessa conta, some essa
  garantia — existe teste que soma as linhas e compara com o anel.
- **Horário não se inventa.** `addLiquid` só grava `t` quando o dia visto é
  hoje; lançar água num dia passado com a hora de agora seria escrever mentira
  no histórico. Linha sem horário mostra `--:--`. O mesmo vale para o `t` dos
  itens de refeição.
- **Bebida lançada como refeição entra na lista** (item com `unit:"ml"`), porque
  para quem bebeu é a mesma coisa — mas **não é apagável daqui**: apagar ali
  mexeria nas calorias do dia, e quem tira comida é a lista de comida. Ela
  aparece com o nome e a refeição de origem.
- **Excluir uma linha desconta do total**, senão o anel passaria a discordar da
  lista.
- **"Zerar" agora pergunta antes** (`appConfirm`): antes ele zerava um número, e
  agora apaga o histórico do dia junto.
- A lista sai da mais recente para a mais antiga: quem confere quer ver o
  último lançamento, não o primeiro da manhã.
- **A lista mostra três lançamentos e rola no dedo para o resto**
  (`limitarLiqHist`). A altura sai da posição da **quarta linha**, não de um
  número fixo em pixels: linha com origem ("Almoço") ocupa duas alturas de
  texto, e altura chutada cortaria a terceira ao meio nos dias em que houver
  bebida de refeição no topo.
- **A barra de rolagem fica escondida** (`scrollbar-width:none` e o
  pseudo-elemento do WebKit), porque quem rola é o dedo. Por isso existe o
  **esmaecido** no rodapé da lista: sem barra, uma lista cortada parece uma
  lista inteira. Ele some ao chegar no fim — prometer conteúdo que acabou é o
  mesmo defeito ao contrário. Se você tirar o esmaecido, tire também a rolagem,
  ou ninguém descobre que há mais.

### A aba Início e o feed

O Início é a tela de entrada (`showView("inicio")`). Ele reúne três coisas:

- **o saldo do dia**, que leva para a Alimentação ao toque (`#fdDia`)
- **os atalhos** para Progresso (`#fdIrProgresso`) e para treinar
- **o feed**, o histórico das sessões já feitas, da mais recente para a mais
  antiga (`renderInicio()`)

O **Progresso saiu da barra de abas** e vive dentro do Início. Por isso a aba
"Início" continua acesa enquanto o Progresso está aberto, e a tela tem um
`[data-volta]` que devolve para o Início — se esse botão quebrar, a tela some do
app. Existe teste para isso.

Cada cartão do feed abre no próprio lugar (`data-fdtoggle`) e, dentro dele, há
"Ver a sessão inteira" (`data-fdver`), que abre `#sessaoOverlay` com todas as
séries e a comparação com a vez anterior.

Cuidados ao mexer aqui:

- **A progressão compara com a sessão anterior do mesmo treino**, não com a
  anterior no tempo. Ela é calculada sobre `fdTodas()` — a lista **inteira** —
  e não sobre as 60 mostradas: senão a 61ª sessão se anunciaria "primeira vez"
  e a pessoa acharia que o app perdeu o histórico dela.
- **Sem sessão anterior o selo diz "primeira vez"**, nunca "0%" — inventar um
  número é pior que omitir. Queda de carga aparece como queda; esconder seria
  mentir para quem usa o app justamente para progredir.
- **Registro manual (cardio) não tem `ex` nem `vol`.** Todo caminho do feed
  precisa aguentar isso sem quebrar.
- **Chame `renderInicio()` sempre que o histórico mudar** — ao salvar um treino,
  ao apagar um, e no lançamento manual. Sem isso o feed fica desatualizado até
  a próxima troca de aba.
- Nas três colunas de números, o valor é empurrado para baixo
  (`margin-top:auto`) porque "Duração (min)" quebra em duas linhas e
  "Gasto (kcal)" não — sem isso os números ficam em alturas diferentes.

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
| `tests/nuvem.spec.js` | Sincronização: outra conta no celular não herda exógeno, academias, líquidos nem treino em andamento; campo ausente não apaga; quem não sabe não envia; campo de versão mais nova volta como chegou; histórico de líquidos sobe |
| `tests/virgula.spec.js` | Nenhum `type="number"`; carga, peso, ml, rótulo e objetivo com vírgula; macros na tela; conferências de peso, carga e quantidade; corrigir série salva |
| `tests/peso-corpo.spec.js` | Flexão com reps, prancha com segundos, feed sem "registro manual", referência e diferença em reps, "+ carga" sem matar o descanso, selo em reps, 1RM sem série sem carga, classificação por nome |
| `tests/peso.spec.js` | Peso do dia no Início e na Alimentação, conferência, apagar; cartão "Atualizar/Manter", plano que não reinicia, dia passado que não muda, proteína; GETD manual; passos com o peso do dia; nuvem |
| `tests/sem-sinal.spec.js` | Treino feito sem sinal sobrevive ao app descartado; dois aparelhos sem sinal juntam; apagado não volta; água soma; transação não apaga o de outro aparelho; envio ao sair do app; aviso atrasado; excluir dados substitui; a mescla direto na função |
| `tests/protocolos.spec.js` | Protocolos com nome: "Meu protocolo" virtual sem regravar nada, criar/renomear/excluir, sugestão que preenche ou cria, mover treino, selo que não mistura dois "Treino A", sessão com `tid`/`prot`, nuvem com versão anterior |
| `tests/inventario.spec.js` | Inventário: catálogo inteiro reconhecido, "não informado" sem aviso, gravação por toque, aviso no cartão/treino/editor, troca com o que tem primeiro, "Tem, sim" sem matar o descanso, alternativas, nome desconhecido sem aviso |
| `tests/academias.spec.js` | Academias: sem cadastro o app fica igual, filtro por academia, treino novo nascendo na escolhida, sessão gravando onde foi, referência e selo na mesma academia, excluir sem apagar treino nem histórico, nuvem, 320px |
| `tests/historico.spec.js` | Referência da última sessão, sugestões, indicador de progressão de carga |
| `tests/interface.spec.js` | Zoom bloqueado, diálogos internos, layout em 390/320px, tema claro e escuro |
| `tests/alarme.spec.js` | Volume e ausência de distorção do alarme de descanso |
| `tests/sentry.spec.js` | Configuração do monitoramento, limpeza de dados pessoais, app abrindo sem a Sentry |
| `tests/alarme-descanso.spec.js` | Tela do alarme, interrupção da música, insistência, permissão |
| `tests/abertura.spec.js` | Splash, avisos de espera, instalação como app |
| `tests/push.spec.js` | Aviso com o app fechado, e o app funcionando sem ele |
| `tests/feed.spec.js` | Feed do Início: ordem, progressão, cartão que expande, sessão inteira, vírgula decimal |
| `tests/perfil.spec.js` | Som do alarme e o atalho da digital, no app Android e no navegador |
| `tests/digital.spec.js` | Entrar com a digital: e-mail que confere, e cada caminho de falha voltando para a senha |
| `tests/conta.spec.js` | Excluir dados exigindo a senha da conta |
| `tests/cadastro.spec.js` | Pop-up de criar conta, e a idade derivada da data de nascimento |
| `tests/alimentos.spec.js` | Busca de alimentos: plural, ordem, erro de digitação, afinidade; internet automática, kJ, Brasil primeiro |
| `tests/cardio.spec.js` | Registro manual: distância opcional na caminhada, inclinação da esteira, ganho de elevação em metros, digitação com vírgula |
| `tests/liquidos.spec.js` | Histórico de ingestão: horário, origem, exclusão, total antigo sem histórico, zerar com confirmação |
| `tests/passos.spec.js` | Passos do dia: conversão pela altura e peso, rotina trocada pelo medido, pergunta só com atividade com km, "sim" conta só a sobra, "não" conta tudo, selo do Início, nuvem |
| `tests/exogenos.spec.js` | Uso de exógenos: pop-up de riscos, clembuterol escalando pela dose com teto, efedrina, anabolizante só informação, o "+" do Início; consentimento com data, dado que não sobe para a nuvem por padrão, página de privacidade |
| `tests/app-nativo.spec.js` | Caminho web desligado quando o app Android está presente |
| `tests/service-worker.spec.js` | Cache do app, versão, e a página de diagnóstico |
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
| `cutting.pendente` | `{uid}`: há alteração que a nuvem ainda não confirmou (some quando ela confirma) |
| `cutting.base` | `{uid, doc}`: a nuvem como este aparelho a viu por último, para a mescla |
| `tresults.run` | Treino em andamento (some ao finalizar) |
| `tresults.theme` | `light` / `dark` |
| `tresults.acad` | Academia escolhida neste aparelho (vazio = Todas) |
| `tresults.prot` | Protocolo aberto na aba Treino neste aparelho |

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
- **O aviso tem duas caras, e quem escolhe é onde a pessoa estava.** Passou o
  descanso inteiro com o app na frente (`descansouOlhando()`), recebe o pop-up
  `#restPop`, que não tapa o treino — obrigar quem já estava olhando a apertar
  "pronto" para voltar ao que via é atrito à toa. Saiu do app em algum momento,
  recebe `#restDone` em tela cheia, que é o que alcança alguém com o celular no
  bolso. **Som e vibração são iguais nos dois**: o discreto é o visual, não o
  alarme. Não dá para decidir isso por `visibilityState` na hora — com o app em
  segundo plano o JavaScript congela e `restFinish` só roda na volta, quando a
  página já está visível de novo. Quem sabe a verdade é `trS.saiuNoDescanso`,
  marcado no `visibilitychange` e no `trRestore` (restaurar = a página foi
  descartada, logo a pessoa esteve fora).

### Academias: cada uma tem os seus aparelhos

O dono pediu que o app entendesse que "nem todas as academias comportam todos
os aparelhos": a pessoa cadastra as academias que frequenta (quantas forem) e
cada uma tem o seu treino, ou o mesmo se repete onde der. A academia agrupa
treinos (aqui) e tem um **inventário de aparelhos** (seção própria, abaixo).

- **`store.academias = [{id, nome}]`** sincroniza como o resto (load,
  blankStore, applyRemote, pushRemote). **A escolhida é do aparelho**
  (`tresults.acad`): é o celular que vai à academia. Escolha que não existe
  mais (excluída aqui ou em outro aparelho) vale "Todas" (`acadSel`), em vez
  de esconder o protocolo.
- **Cada treino guarda em `acads` onde vale; ausente ou vazio = todas.** É
  como todo treino nasceu antes disto, e é por isso que **sem academia
  cadastrada o app fica exatamente igual** — existe teste. `tpSave` remonta o
  treino do zero: carregue `acads` junto, como `nasc` no objetivo.
- Treino novo e sugestão de protocolo **nascem na academia escolhida**: é para
  ela que estão sendo montados.
- **A sessão grava `acad` e `acadNome`** (`trNext`), e `trPersist`/`trRestore`
  carregam a academia do treino em andamento (lista explícita de campos).
  Com "Todas" escolhida, a sessão é da única academia do treino, se ele tiver
  uma só; senão fica sem academia — não se inventa (`acadDaSessao`). O nome
  na tela vem de `acadNomeDe`: o atual, se a academia existe (renomear muda o
  histórico também), senão o guardado.
- **Referência e progressão comparam na mesma academia** (`mesmaAcad`): o leg
  press de uma não é o da outra. **Registro sem academia casa com qualquer
  uma** — sem isso, ao cadastrar a primeira academia, o histórico inteiro
  deixaria de servir de referência. Sem nada na mesma academia,
  `lastExSession` devolve a de outra **com o nome dela** (`outra`): o aviso
  `.tr-ref-outra` diz de onde vêm as cargas, **uma vez, acima das séries** —
  dentro de cada linha o nome partia a referência em duas — e o selo de
  diferença por série (`trDelta`) **some**, porque carga de outro aparelho é
  ponto de partida, não régua. O selo do feed diz **"primeira vez nesta
  academia"** (`fdSoEmOutra`), nunca "primeira vez deste treino" para um
  treino que já foi feito. `abrirSessao` compara com **a mesma sessão que o
  selo usou** (`pr.j`): com dois critérios, uma sessão vazia no meio fazia o
  selo dizer "+10%" e a comparação sumir.
- **Recadastrar uma academia excluída devolve a mesma** (`idOrfao`): o id é
  reaproveitado do histórico pelo nome. Com id novo, o histórico dela
  viraria "outra academia" para sempre.
- **Campo `academias` ausente não é lista vazia**, nem no documento da nuvem
  nem no aparelho (veja "A nuvem", abaixo): `load()` não inventa `[]`, e
  `pushRemote` só envia a lista que o aparelho conhece. Vazio de verdade
  (excluiu todas) sobe como `[]` e vale. O que não dá para evitar daqui:
  editar um treino num aparelho ainda na v41 ou anterior tira as academias
  daquele treino — some quando o aparelho atualiza.
- **Excluir academia não apaga treino nem histórico.** O id sai dos treinos
  (id que não existe esconderia o treino de todas); o treino que era só dela
  passa a valer em todas; a sessão gravada mantém `acadNome`. Pede
  `appConfirm`, não senha: nada se perde.
- **Renomear não se perde:** tocar em Concluir ou fora do pop-up grava o
  que foi digitado (`salvarRen`), e nome repetido segura o pop-up aberto.
- O gráfico de evolução (Progresso) **ainda mistura academias**: é a melhor
  série estimada por dia, de qualquer lugar. Separar seria o próximo passo,
  se o dono pedir.
- Coberto em `tests/academias.spec.js`.

### Protocolos com nome

O dono pediu que, ao abrir a aba Treino, aparecessem "os protocolos da pessoa,
que ela possa batizar com o nome que bem entender". A aba mostra um bloco por
protocolo (`renderProtLista`), **um aberto por vez**, com os cartões dos
treinos dele; o aberto é lembrado no aparelho (`tresults.prot`) e, sem
escolha, é o do último treino feito (`protAberto`).

- **O protocolo de um treino fica no próprio treino** (`prot`, `protNome`); a
  lista `store.tprotos=[{id,nome}]` guarda só nome e ordem. Motivo: aparelho
  com versão anterior grava o documento inteiro e apaga campo novo de
  primeiro nível, mas preserva campo dentro do treino. Se a lista se perder,
  `listaProtocolos()` a reconstrói pelos treinos (por isso `protNome` vai em
  cada treino, e renomear carimba todos).
- **Quem já usava o app tem um protocolo virtual**, id fixo `"principal"`,
  nome "Meu protocolo": os treinos sem `prot` são dele. **Nada é regravado ao
  abrir o app**; a lista só vira dado (`materializarProtocolos`) quando a
  pessoa cria, renomeia ou exclui protocolo, usa sugestão, ou salva treino
  com dois ou mais protocolos. Id fixo para dois aparelhos não criarem cada
  um o seu "Meu protocolo". O virtual vazio não é gravado: quem começa do
  zero e cria "Hipertrofia" não ganha um "Meu protocolo" vazio de brinde.
- **Nenhum caminho tira o `prot` de um treino.** `tpSave` só grava `prot`
  quando há motivo (protocolo não é o principal, lista já materializada, ou o
  treino já tinha); mover para o "Meu protocolo" grava `"principal"`. E
  `applyRemote` devolve o `prot` local ao treino que chega **sem a chave**
  (editado num aparelho antigo, que remonta o treino sem ela).
- **A sessão grava `tid`, `prot` e `protNome`.** O selo de progressão e a
  sessão inteira comparam o **mesmo treino** (`mesmoTreino`): mesmo `tid`
  (sobrevive a renomear e a mover o treino), ou mesmo nome no mesmo
  protocolo. Sem isso, "Treino A" de dois protocolos com exercícios
  diferentes seria comparado como se fosse um. **Dois `tid` diferentes de
  treinos que ainda existem nunca são o mesmo treino**, mesmo com o mesmo
  nome; o nome só decide quando um lado não tem `tid` ou o treino foi
  excluído. Sessão de antes conta como do principal.
- **Renomear ou mover um treino carimba o `tid` nas sessões antigas dele**
  (`carimbarTid`): elas só o reconheciam pelo nome e pelo protocolo, e o
  selo passava a dizer "primeira vez deste treino" — contra a frase do
  editor, "O histórico deste treino vem junto".
- **A referência da última carga (`lastExSession`) não muda**: ela segue o
  exercício e a academia, de qualquer protocolo — supino é supino.
- Excluir protocolo apaga **os treinos dele** (com `appConfirm`, não senha:
  é o nível de excluir treino) e **não toca no histórico**; o feed passa a
  dizer o nome do protocolo da sessão (`fdProtTxt`), que não existe mais.
  Recriar com o mesmo nome devolve o id (`protOrfao`), como academias.
- Sugestão pronta: com o protocolo aberto **vazio**, ela o preenche; com
  treinos nele, vira protocolo **novo com o nome dela** ("… 2" se repetir).
- O nome do protocolo só aparece no histórico com dois ou mais protocolos
  (ou quando o da sessão não existe mais; sessão antiga, sem `prot`, é do
  "Meu protocolo").
- **O título do pop-up só renomeia se a pessoa mexeu nele**
  (`tpProtNomeIni`): com o pop-up aberto, um nome dado em outro aparelho
  atualiza o título, e o título velho não o desfaz ao fechar.
- **Protocolo excluído em outro aparelho com o editor aberto:** salvar grava o
  treino nele mesmo assim, e o protocolo volta pela reconstrução da lista. O
  que foi digitado não se perde.
- Coberto em `tests/protocolos.spec.js`.

### Inventário de aparelhos por academia

Cada academia guarda o que ela **não** tem: `academias[i].faltam=[ids]`.
Ausente = "não informado", que se comporta como "tem tudo": o app só avisa
depois que a pessoa disser o que falta. O pop-up (`#equipOverlay`) abre todo
marcado e a pessoa desmarca; cada toque grava na hora; abrir e fechar sem
tocar não grava nada. Guardar o que falta faz aparelho novo no catálogo
nascer "tem" — sem aviso falso para quem já tinha marcado.

- **O aparelho sai do nome do exercício** (`EX_EQUIP`, `exEquip`): regras por
  trecho do nome sem acento, **em começo de palavra**, da mais específica para
  a mais geral, primeira que casa. Começo de palavra porque "lateral" casava
  dentro de "unilateral" e "Elevação pélvica unilateral" virava elevação
  lateral de ombro. Pontuação vira espaço ("Peck-deck"). Cada regra dá
  **alternativas** (serve uma ou outra; dentro de uma, todos juntos;
  alternativa vazia = peso do corpo). **O aviso só aparece quando todas as
  alternativas têm algo faltando** (`equipFalta`).
- **Nome que o catálogo não reconhece nunca recebe aviso** (`null`), e
  "máquina"/"articulado" no nome sem regra própria também vira `null`: é uma
  máquina que o catálogo não conhece. Faltar aviso é o app de antes; aviso
  falso ensina a ignorar o aviso. Na dúvida, mais alternativas, ou `null`.
- O catálogo (`EQUIP`, 44 aparelhos em 7 grupos; `EX_EQUIP`, 263 regras) saiu
  de dois levantamentos independentes, conciliados, e é conferido por teste:
  todo nome de `EX_POR_GRUPO` e `T_SUG` é reconhecido, todo id existe, todo
  aparelho é usado, e uma tabela de nomes que já deram aviso falso ("Flexão
  com joelhos apoiados" não é flexora; "Thruster" não é elevação pélvica;
  "Puxador frente" aceita cabo). Achou outro? Ponha uma regra mais
  específica ANTES da geral e o caso na tabela. Ids são imutáveis (o rótulo
  pode mudar). Sem cardio.
- **Usos**, e só estes: aviso no cartão do treino com academia escolhida
  (`pcFalta`); faixa no treino em andamento (`#trFalta`, `pintarFalta`) com
  "Trocar" e "Tem, sim"; a troca de exercício em três faixas (o que tem, o
  que o app não sabe, o que falta — este marcado e **ainda tocável**); nota
  no editor (`renderTpEquip`); estado na lista de academias. **Avisa, nunca
  esconde, reordena treino nem troca sozinho.**
- **"Tem, sim" chama só `pintarFalta()`, nunca `renderTr()`**: `renderTr`
  termina em `stopRest()` e mataria o descanso. Existe teste.
- Exercício trocado (`e.orig`) não avisa: foi escolhido numa lista que já
  mostrava o que falta. "Desfazer" traz o aviso de volta.
- Id de aparelho que esta versão não conhece fica guardado e é ignorado na
  conta. Excluir a academia leva a lista de aparelhos junto; recadastrar
  devolve o id (`idOrfao`) mas começa "não informado".
- Coberto em `tests/inventario.spec.js`.

### A nuvem: o documento é gravado inteiro

`pushRemote` grava o documento do usuário **inteiro**: o que ele não mandou deixa
de existir. Desde a v44 a gravação é uma transação que lê a nuvem e mescla
antes de gravar (veja "Nada do que foi lançado sem sinal se perde", abaixo),
mas o documento continua indo inteiro, e aparelho com versão anterior ainda
grava por cima às cegas. Três regras saem disso, e cada uma tem teste em
`tests/nuvem.spec.js`:

- **Só herda do aparelho quem é dono dele** (`applyRemote`, `local`). O que é
  guardado no aparelho e sobrevive à nuvem — exógeno (dado de saúde),
  academias, histórico de líquidos — só fica se `cutting.owner` é a conta que
  entrou. Antes, a segunda conta num celular herdava o clembuterol e a dose da
  primeira. Na troca de conta, `startSync` descarta o treino em andamento e a
  academia escolhida, e `onAuthStateChanged` só retoma o treino se o aparelho
  é da conta.
- **Campo ausente não é lista vazia, e quem não sabe não envia.** Aparelho com
  versão anterior grava sem os campos novos; aceitar a ausência como vazio
  apagaria o dado de todos os aparelhos. Vale para `academias`, `liqLog`,
  `tprotos` e `getdHist`.
- **O que veio de uma versão mais nova volta como chegou** (`CAMPOS_NUVEM`,
  `store._nuvem`): campo que esta versão não conhece é guardado e reenviado,
  em vez de apagado. Por isso campo novo de primeiro nível precisa ser JSON
  simples (sem `Timestamp`), e quem acrescentar um campo ao documento precisa
  pô-lo em `CAMPOS_NUVEM`. Pelo mesmo motivo `tpSave` parte do treino que
  existia: campo de treino que esta versão não conhece continua nele.
- **O histórico de líquidos (`liqLog`) sobe.** Antes ele ficava só no
  aparelho, e o `store` remontado pela nuvem o apagava a cada abertura do app.

### Nada do que foi lançado sem sinal se perde

O caso que motivou: treino finalizado no subsolo da academia, sem sinal. O app
gravava no aparelho, mas o envio ficava numa fila **na memória** (o Firestore
usa cache em memória). Se o Android descartasse a página antes de o sinal
voltar, a abertura seguinte baixava a nuvem e **trocava o aparelho inteiro por
ela**: o treino sumia sem aviso. Reproduzido com a nuvem falsa dos testes antes
do conserto. São três peças, todas no bloco da nuvem do `index.html`:

- **A marca** (`cutting.pendente`, `{uid}`): `save()` a grava
  (`marcarPendente`), e ela só sai quando a transação confirma. Sobrevive ao
  app fechado. `pendN` (só na memória) conta os toques, para saber se algo foi
  lançado **durante** o envio — aí a marca fica e sai mais uma rodada.
- **A base** (`cutting.base`, `{uid, doc}`): a nuvem como este aparelho a viu
  por último (o que leu, ou o que gravou). É ela que diz quem mexeu no quê.
  Sem a base, não dá para distinguir "apagado lá" de "lançado aqui".
- **A mescla** (`mesclar(B, L, R)`): base, este aparelho, nuvem. Regras:
  - por campo, por dia (`days`, `tdays`, `liqLog`, `passos`, `liquids`) e por
    registro (`id`; pesagem pela data `d`; alimento próprio pelo nome `n`);
  - lançado de um lado entra; apagado de um lado sai, **desde que o outro não
    tenha mexido no mesmo registro** — mexido vence apagado, porque ver um
    registro voltar é melhor que perdê-lo;
  - os dois mexeram **na mesma coisa**: com base, vale a deste aparelho; sem
    base (aparelho vindo da v43, ou sem espaço para gravá-la), vale a da
    nuvem, porque este pode ser um celular parado há semanas — mas o que só
    ele tem entra assim mesmo;
  - o objetivo junta chave por chave;
  - **líquido é contador**: o que cada lado somou desde a base soma, e o total
    do dia nunca fica abaixo do que a lista de horários soma;
  - campo ausente na nuvem não é vazio (a regra de sempre); campo de versão
    mais nova vale o da nuvem.

Como as peças se encaixam:

- **Toda gravação é `runTransaction`** (`sincronizar` → `sincronizarAgora`):
  lê a nuvem, mescla com o daqui e grava, e só grava se o resultado difere do
  que está lá. Se outro aparelho gravar no meio, o Firestore recomeça a
  transação, em vez de um apagar o outro. Custa uma leitura a mais por
  gravação. Uma transação por vez (`enviando`); o que chega no meio pega
  carona (`maisUma`).
- **Sem sinal, a transação falha** (não fica numa fila em memória), o texto de
  sincronização diz "Sem sinal, salvo no aparelho" e o app tenta de novo com
  espera crescente (5 s até 60 s), ao voltar o sinal (`online`) e ao voltar
  ao app. **Ao sair do app** (`visibilitychange`, `pagehide`) envia na hora,
  sem esperar os 800 ms.
- **Na abertura, com marca pendente da mesma conta**, `applyRemote` mescla em
  vez de trocar, e o resultado sobe. Sem marca, segue a nuvem, como sempre: o
  aparelho em dia não tem o que defender, e o que foi apagado em outro
  aparelho não pode voltar por ele.
- **O aviso da nuvem (`onSnapshot`) não é aplicado direto.** Ele pode chegar
  atrasado, com o documento de antes da última gravação daqui, e aplicado
  direto tiraria da tela o que acabou de subir. Ele só dispara uma transação,
  que lê a versão de verdade.
- **Excluir dados substitui, não mescla** (`marcarPendente(true)` →
  `substituir`): sem isso, o que outro aparelho gravou depois da última
  leitura daqui sobreviveria à exclusão.
- **Outra conta entrando descarta a marca e a base da anterior**
  (`limparSync`), junto com o treino em andamento.
- Recusa que não é falta de sinal (documento grande demais, permissão) manda
  ao Sentry **só o código do erro**, uma vez por abertura.
- **O que ainda não resolve:** abrir o app **sem sinal** continua parado na
  abertura (a tela espera o `getDoc`); é a ideia "Abrir na hora", que muda
  uma regra desta página e precisa ser combinada. E aparelho com versão
  anterior à v44 ainda grava às cegas.
- Coberto em `tests/sem-sinal.spec.js`, que usa a **nuvem falsa com estado**
  (`__nuvem`, `__semRede`, `__lento` no armazenamento local, em
  `tests/app.js`): recarregar a página é o app descartado e aberto de novo, e
  "outro aparelho" é o teste mexendo direto no documento.

### Peso do corpo e tempo: flexão, barra fixa e prancha

Série sem carga era **descartada ao finalizar** (o filtro exigia kg > 0):
quem fazia flexão anotava as reps e o registro saía com `ex:[]` e `vol:0`,
aparecendo no feed como "registro manual". A prancha nem tinha onde pôr os
segundos.

- **A série vale com reps — ou segundos — acima de zero**, com ou sem carga.
  Gravada como `{kg, rep, rir}` e, nas de tempo, `seg`. Exercício de carga
  feito sem carga também fica ("10 reps"); "Corrigir série" acerta depois.
- **O nome decide só a cara da linha** (`exTipo`, `EX_CORPO_RE`,
  `EX_TEMPO_RE`): no peso do corpo a carga fica atrás de "+ carga (colete,
  anilha)"; nas isometrias o campo é de segundos (`.iseg`) e o plano diz
  "segure com a forma certa". Errar a classificação custa um toque, nunca um
  número. A carga aparece sozinha se já foi usada hoje ou da última vez.
  Existe tabela de nomes no teste ("Flexão de punho" e "Abdominal na polia"
  têm carga).
- **"+ carga" não chama `renderTr()`**: ele termina em `stopRest()` e
  mataria o descanso. Mostra o campo pelo DOM e grava `comCarga` no exercício
  da sessão (`trPersist` leva). Existe teste.
- **Nunca "kg movidos" inventados.** A fração do corpo que a flexão levanta
  muda com a variação (Ebben et al., *J Strength Cond Res*
  2011;25:2891-2894), então o volume em kg desses exercícios é zero e eles
  contam por séries e reps, que é o que a literatura de dose-resposta usa.
  O 1RM (`evoData`) ignora série sem carga: Epley com 0 kg dá 0.
- **O selo compara a mesma coisa** (`medidaSessao`): volume em kg; sem carga
  nenhuma, o total de reps ("+11% de reps"), ou de segundos. Nunca um com o
  outro. A referência diz "15 reps" e "45 s" (`serieTxt`), e a diferença por
  série também ("+2 reps", "mesmo tempo").
- Coberto em `tests/peso-corpo.spec.js`.

### Trocar o exercício no meio do treino

Academia lotada, fila no aparelho, equipamento quebrado: `#trTrocar` troca o
exercício da vez por outro do mesmo grupo (`EX_POR_GRUPO`) ou por um nome
digitado.

- **A troca é da sessão, nunca do protocolo.** `trS.w` é cópia profunda do
  treino (`startTRun`), então mexer em `trS.w.ex[idx]` não reescreve o que a
  pessoa montou. Existe teste que lê `store.tprotocol` depois da troca.
- **Séries e descanso continuam os do prescrito.** Trocar de aparelho não é
  trocar de plano.
- O nome prescrito fica em `ex.orig`, e é o que o aviso `#trTrocado` mostra com
  o botão "Desfazer" — sem isso, semanas depois o histórico pareceria dizer que
  o treino mudou.
- **O que fica registrado é o que foi feito**, não o que estava no papel: é o
  histórico que a pessoa consulta para progredir.
- A referência da última vez (`lastExSession`) segue o exercício **novo**:
  comparar a carga do leg press com a do agachamento não diria nada.
- Coberto em `tests/treino.spec.js`.

### Registro manual de cardio: distância e inclinação

O "treino avulso" calcula por dois caminhos, e quem escolhe é a atividade:

- **Por distância** (`dist`), quando a pessoa sabe quantos quilômetros fez. A
  velocidade cai numa faixa (caminhada, trote, corrida) e cada faixa tem um
  custo líquido em kcal por kg por km.
- **Por MET** (`met`), quando só há duração, graduada pela intensidade.

Três cuidados:

- **Na caminhada a distância é opcional** (`distOpc`). Quem andou 40 minutos no
  bairro sem medir nada precisa continuar registrando: tornar o campo
  obrigatório tiraria do app algo que já funcionava. Com km preenchido, a conta
  passa para o caminho da distância e o seletor de intensidade some — campo
  visível que não entra na conta é campo que mente.
- **O que custa energia são os METROS SUBIDOS, não a inclinação.** O acréscimo é
  `peso × metros × subidaCoef(rampa)`, e o coeficiente vem da **curva de
  Minetti (2002)**, não de uma constante.
- **A fonte, e por que ela.** Minetti, Moia, Roi, Susta e Ferretti, *Energy
  cost of walking and running at extreme uphill and downhill slopes*, J Appl
  Physiol 93(3):1039-1046, 2002 — https://pubmed.ncbi.nlm.nih.gov/12183501/.
  Medição primária em laboratório, revisada por pares, de −45% a +45%. É a
  fonte de maior acurácia e respaldo para gradiente. O app já usou as equações
  do ACSM, que são regressões de prescrição com erro assumido maior; o dono
  pediu a fonte mais acurada, e é esta.
- **Como o coeficiente sai da curva.** `MINETTI_CW(i)` é o custo da caminhada
  em J/kg por metro **percorrido**, com `i` em fração. O acréscimo por metro
  **vertical** é `[Cw(i) − Cw(0)] / sen(atan(i)) / 4184`. Ele cresce com a
  rampa — 0,0053 a 5%, 0,0058 a 10%, 0,0072 a 30% — porque subir íngreme
  desperdiça menos movimento horizontal. Uma constante única errava até 35%
  nas pontas; existe teste com os mesmos 300 m subidos em 6% e em 15%.
- **Acima de 45% o coeficiente trava** (`MINETTI_MAX`). O polinômio é de
  quinto grau e dispara fora do medido: a 75% daria quase o triplo. Extrapolar
  é inventar número, então para em 45%. Existe teste.
- **Não depende da velocidade, e isso é de propósito.** O app já teve
  coeficiente que trocava de faixa junto com o custo plano (0,009 abaixo de
  6,5 km/h, 0,0045 acima), e acelerar num percurso com subida **baixava** a
  estimativa: 5 km a 10% davam 482 kcal a 6,494 km/h e 408 a 6,508. Existe
  teste varrendo as quatro faixas e exigindo que acelerar nunca reduza.
- **Correr e andar usam a mesma curva.** Pelo `Cr` do mesmo artigo, os dois
  custam praticamente o mesmo por metro vertical nesta faixa (0,00576 contra
  0,00569 a 10%). A razão 2 para 1 do ACSM era artefato de duas regressões
  separadas, não fisiologia: o tendão devolve o que guardou **dentro da
  passada**, e em subida sustentada o centro de massa nunca torna a descer.
- **O custo de plano vem das equações do ACSM** (`CUSTO_CAMINHADA` 0,50 e
  `CUSTO_TROTE` 0,90 kcal/kg/km, líquidos): caminhada 0,1 mL O2/kg por metro
  → 0,50; corrida 0,2 mL/kg por metro → 1,0, com Minetti (2002) em 0,86, e o
  app em 0,90 para todas as faixas de corrida. O app já usou 0,32 para
  caminhada e 0,60 para trote, sem fonte; uma auditoria por quatro fontes
  (ACSM, Minetti, compêndio de METs, calculadoras de campo) convergiu em
  0,50–0,60 e 0,82–1,00. O dono primeiro preferiu não mexer, e ao criar os
  passos do dia pediu "o que for cientificamente mais correto": a mudança
  valeu para o cardio e para os passos juntos, para a mesma caminhada não
  valer dois números. **O histórico registrado antes ficou com o custo
  antigo** e não é recalculado: o número gravado é o que a pessoa viu.
- **Duas unidades para a mesma subida, e cada aparelho fala uma.** A esteira
  mostra **inclinação em %**; o relógio e o Strava mostram **ganho acumulado em
  metros**, que chega a 1.100 m num treino de montanha. Por isso:
  - Esteira (`inc` + `ganho`): alternador %/m, começando em %.
  - Ar livre (`ganho` só): metros. Oferecer "%" na rua seria pedir um número
    que a pessoa não tem.
  - Trocar a unidade **limpa o campo**. 7,5 em % e 7,5 em metros são coisas
    diferentes, e converter por baixo do pano gravaria um número que a pessoa
    não escolheu.
- **A inclinação média mostrada no ar livre é conferência de tela, não dado.**
  Ela não entra na conta e não é gravada. Acima de `INC_ALERTA` (45%) ela sai
  **sinalizada em vermelho, e não limitada**: limitar mudaria o número sem a
  pessoa saber, que é o mesmo defeito pelo outro lado. Teto absoluto do ganho:
  `GANHO_MAX` 10.000 m, que é domínio de dedo errado.
- **Trocar de atividade limpa o campo de elevação e volta a unidade para %.**
  1100 é ganho plausível na rua e inclinação impossível na esteira, onde virava
  30% pelo teto e inventava 1.500 m de subida com a tela inteira parecendo
  certa. O alternador de unidade já limpava; a troca de atividade não limpava,
  e era por onde o número errado entrava calado.
- **Com elevação 0, a conta precisa dar exatamente o número do plano.** Se
  mudar sem decisão do dono, o histórico de quem já registrou deixa de ser
  comparável com o de amanhã, e a pessoa vê uma "melhora" que só existe
  porque a fórmula mudou. Existe teste fixando esse valor, nas duas unidades
  (190 kcal para 5 km em 60 min na esteira, 80 kg). Ele mudou uma vez, de
  122 para 190, quando o custo da caminhada foi corrigido a pedido do dono.
- **A descida não é descontada.** Num percurso de volta ao ponto de partida, o
  app cobra o plano pelo trecho de descida, que na verdade custa menos que o
  plano. É a simplificação que toda ferramenta do mercado faz, e ela
  superestima de leve. Mudar isso exigiria o perfil do percurso, que o app não
  tem.

**Os campos decimais do cardio são `type="text"` com `inputmode="decimal"`, de
propósito.** No teclado numérico brasileiro a tecla decimal é a vírgula, e um
`<input type="number">` **descarta a vírgula antes de o JavaScript enxergar**:
quem digitasse "7,5" gravaria 75. Num app que calcula caloria, isso é número
errado entrando calado. A leitura passa por `numBR()`, que aceita vírgula e
ponto, e um filtro impede letra no campo.

Desde a v45 isso vale para o app inteiro: veja "Números digitados", na
seção 4.

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
| Alarme que sobrepõe a música | `AlarmeService` toca com `MediaPlayer` em `USAGE_ALARM` e pede foco `TRANSIENT_EXCLUSIVE` |
| Disparo no segundo certo com o app fechado | `AlarmManager.setAlarmClock`, o único agendamento que o Android não adia |
| Tela cheia por cima do TikTok | `setFullScreenIntent` com `CATEGORY_ALARM` |

Duas coisas do perfil também vivem aqui, e por isso mudam de cara conforme o
lugar (`tests/perfil.spec.js` cobre os dois lados):

| | No app Android | No navegador |
|---|---|---|
| **Som do alarme** | seletor do sistema, com os sons do celular | quatro acordes gerados na hora, guardados em `tresults.som` |
| **Entrar com a digital** | `BiometricPrompt` + chave do Keystore | não aparece — a web não alcança |

### A digital entra na conta; ela não tranca a abertura

Ela já foi uma trava de abertura, e isso estava errado por dois motivos: pedia o
dedo a cada vez que o app voltava do segundo plano, e num Android ≤ 10 (sem PIN
de reserva) uma digital apagada deixava o app **impossível de abrir**. Hoje a
digital faz outra coisa: guarda a senha da conta neste aparelho e a devolve na
hora de entrar.

- `Credencial.kt` — a senha é cifrada em **AES-256/GCM** com chave do
  `AndroidKeyStore`, `setUserAuthenticationRequired(true)` e autenticação **por
  uso** (não por janela de tempo). Quem recusa a decifragem é o hardware, não o
  nosso código.
- `setInvalidatedByBiometricEnrollment(true)` — cadastrar um dedo novo destrói a
  chave. Quem acrescenta a própria digital ao celular de outra pessoa **não**
  herda o acesso; a credencial some e a senha volta a ser pedida.
- `BIOMETRIC_STRONG` sozinho, sem PIN: só biometria de classe 3 destrava chave do
  Keystore. Aceitar biometria fraca daria um prompt que sempre falharia ao
  decifrar.
- **A senha nunca sai do aparelho**, não vai para o Firestore e não é sincronizada.
- **Todo caminho de falha termina na senha digitada.** Cancelar não é erro e não
  acusa nada. Se a chave foi invalidada, o app diz isso e volta para a senha; se
  a senha guardada não vale mais (trocada em outro aparelho), o atalho é apagado
  em vez de virar um botão que nunca funciona. Existe teste para cada um
  (`tests/digital.spec.js`).

Na tela de entrada, o botão só aparece quando o e-mail escrito **confere** com o
atalho guardado — e quem confere é o Android (`atalhoConfere`), justamente para o
app nunca **exibir** o e-mail de quem estava logado a quem pegou o celular.

Ligar o atalho pede a senha da conta e a confere com
`reauthenticateWithCredential` **antes** de guardar: sem isso o atalho passaria a
repetir uma senha errada para sempre, e a pessoa só descobriria no dia em que
precisasse dela.

O prompt do sistema é assíncrono — o Android responde chamando
`window.__digital` de volta na página. Se você criar outro caminho que abre o
prompt, garanta que ele **sempre** responde: uma promessa pendurada deixa a tela
de entrada esperando para sempre.

A página conversa com o Android por `window.TResults` (ver `PonteWeb.kt`):

```js
const appNativo = !!(window.TResults && window.TResults.disponivel());
```

**Regra:** quando `appNativo` é verdadeiro, o caminho web precisa ficar
**desligado** — nada de `scheduleAlarm`, `notifMostrar`, `pushAgendar` nem
`abrirRestDone`. Os dois juntos dão alarme dobrado e duas telas de aviso
disputando. Existe teste para cada um desses (`tests/app-nativo.spec.js`), e o
último deles garante que no navegador comum tudo continua como era.

#### Como o APK chega ao celular

O APK é montado pelo GitHub Actions (`.github/workflows/apk.yml`) — não é preciso
instalar o Android Studio. O fluxo tem dois caminhos:

| | O que roda | Para quê |
|---|---|---|
| Pull request | `assembleDebug`, artefato | conferir que o Kotlin compila |
| Push na `main` | `assembleRelease` assinado, **Release publicada** | é de onde o celular se atualiza |

**A chave de assinatura é fixa e vive em segredos do repositório**
(`ANDROID_KEYSTORE_BASE64` e `ANDROID_KEYSTORE_SENHA`), nunca no git — há
`*.jks` no `.gitignore` para isso. Antes ela não existia: o Gradle inventava uma
chave de depuração a cada execução, e como cada execução roda numa máquina nova,
**cada build saía com uma chave diferente**. O Android recusa instalar por cima
de um app assinado por outra chave, então atualizar exigia desinstalar — e
desinstalar apaga o armazenamento do WebView: treino em andamento, tema e a
senha guardada da digital iam junto.

Regras que o fluxo cobra sozinho:

- **Suba `versionCode` e `versionName`** a cada mudança em `android/`. A Release
  é etiquetada `v{versionName}+{versionCode}`, e etiqueta repetida **falha o
  build** de propósito: publicar por cima faria o celular de quem já atualizou
  achar que está em dia rodando código antigo.
- Se a assinatura não pegar, o Gradle não reclama — ele só nomeia o arquivo
  `-unsigned` e segue. Existe conferência para isso, porque quem reclamaria
  seria o celular, tarde demais.

No celular, quem busca a Release e instala sozinho é o **Obtainium**, apontado
para `github.com/pedrocrvgdf/appcutting`. Nada disso passa pela Play Store.

**Lembre-se de que quase nenhuma mudança precisa de APK novo.** A tela vem do
GitHub Pages e se atualiza sozinha; o APK só muda quando muda a parte nativa —
temporizador na barra, alarme, ou o atalho da digital. Por isso o fluxo só roda
quando `android/**` muda.

#### Duas armadilhas que já custaram um teste em celular real

**Som de canal de notificação não serve para alarme.** Ele toca uma vez, não
repete, e é cortado quando o telefone está no modo vibrar. Na primeira versão o
celular vibrou e não saiu som nenhum. Quem toca é o `AlarmeService`, com
`MediaPlayer` no stream de alarme — que o modo silencioso não silencia. **Não
devolva o som para o canal.**

**`USE_FULL_SCREEN_INTENT` não vem concedida do Android 14 em diante**, e não
existe diálogo de sistema para pedi-la: o único caminho é
`Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`. Sem ela o alarme não abre
sozinho por cima do TikTok — fica esperando um toque na notificação.
`MainActivity.conferirTelaCheia()` avisa quando falta.

Por isso o alarme tem **três caminhos** até a pessoa: tela cheia automática,
toque na notificação, e o botão "Parar". Se você mexer aqui, mantenha os três —
o automático é o único que depende de permissão, e foi o que falhou.

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
