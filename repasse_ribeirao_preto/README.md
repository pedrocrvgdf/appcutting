# Repasse Médico — Hospital Oftalmológico Ribeirão Preto

Ferramenta de cálculo de repasse médico para a unidade de Ribeirão Preto, feita a
partir da ferramenta do CBV mas com um fluxo diferente, porque a realidade da
unidade é diferente.

**A diferença que define esta ferramenta:** no CBV existe um setor de quitação —
o recebimento é baixado no sistema e a ferramenta consome um relatório de
recebidos. Aqui não existe esse setor. A única prova de que o convênio pagou é o
**demonstrativo de pagamento em PDF**, e ele não diz quem operou: diz apenas o
nome do beneficiário. Quem sabe o médico é o **relatório de produção**.

Então a ferramenta faz exatamente o que hoje é feito à mão, folheando o PDF:

```
Demonstrativo (PDF)          Produção (Excel)
   o que foi pago      ×      quem atendeu       →   Regras   →   Repasse
   e de qual paciente         cada paciente
```

---

## Como rodar

1. Descompacte a pasta em qualquer lugar (Desktop, rede, OneDrive).
2. Dê **duplo clique em `index.html`**.
3. Pronto. Não instala nada, não precisa de internet, não sobe nada para lugar nenhum.

Recomendado: Google Chrome ou Microsoft Edge.

---

## O fluxo de um fechamento

O painel inicial mostra estes cinco passos e o que falta em cada um.

### 1. Carregar a tabela de regras (uma vez, e sempre que mudar)
`Regras de repasse → Importar planilha`

Lê a aba **PORCENTAGEM_PROCEDIMENTO** da planilha `REGRAS DE REPASSE`: para cada
convênio e código TUSS, o percentual do médico responsável. São cerca de 80 mil
combinações.

### 2. Importar a produção
`Produção (Excel) → Escolher planilha`

Antes de gravar, a tela mostra **qual coluna do arquivo virou qual campo** —
paciente, cirurgião, auxiliar, convênio, data. Confira e confirme. Reimportar a
mesma competência substitui as linhas dela, sem duplicar.

### 3. Importar o demonstrativo de pagamento
`Demonstrativo (PDF) → Escolher arquivo`

O PDF é lido e **mostrado antes de ser gravado**, guia por guia, já conferido
contra os totais impressos pelo próprio convênio. Ao confirmar, a ferramenta já
sai procurando cada paciente na produção.

### 4. Revisar o que não casou
`Revisão de casamentos`

A fila de trabalho: guias pagas que a ferramenta não conseguiu casar com
segurança. Cada cartão mostra os candidatos, explica por que cada um pontuou o
que pontuou, e permite buscar o paciente à mão. Ao confirmar uma correção de
nome, ela é **memorizada** — a mesma pergunta não volta no mês seguinte.

### 5. Conferir e exportar o repasse
`Repasse`

Total por profissional e o detalhamento linha a linha: paciente, guia,
procedimento, valor pago pelo convênio, regra aplicada, percentual e valor.
Exporta para Excel em três abas (por profissional, detalhamento, pontos de
atenção).

---

## Como o casamento por nome funciona

Nome de paciente se repete, vem abreviado e vem grafado diferente nos dois
sistemas. Por isso cada candidato é pontuado por vários sinais independentes:

| Sinal | Peso |
|---|---|
| Número da guia do prestador bate | prova documental — decide sozinho |
| Carteirinha bate | prova documental — decide sozinho |
| Semelhança do nome (comparação por token, não por letra) | até 72% da nota |
| Data do atendimento | exata +20 · até 3 dias +8 · até 30 dias +3 · fora da janela −20 |
| Convênio confere | +10 / −12 |

Dois cuidados que vieram dos dados reais desta unidade:

- **Paciente crônico volta muitas vezes.** Um paciente de injeção intravítrea tem
  dezenas de atendimentos, todos com nome idêntico. A data de realização impressa
  no demonstrativo é o que separa um do outro: quando um único candidato bate a
  data exata, ele é o atendimento — os outros são as demais idas ao hospital.

- **Empate que não muda nada não vira trabalho.** Quando os candidatos empatados
  são do mesmo paciente e têm a mesma equipe (o que é a regra nos retornos), o
  repasse sai igual em qualquer um deles. Pedir conferência aí seria gastar o
  tempo do operador para decidir algo que não altera um centavo.

Quando as equipes são diferentes, aí sim vai para revisão — escolher errado paga
o médico errado.

---

## Como o repasse é calculado

Três camadas, nesta ordem:

**1. Regra de sócio** — Dr. Nilton e Dr. Clayton Tokunaga recebem 32% sobre o
valor **integral da conta**, em qualquer papel e qualquer convênio. Passa por
cima das demais regras para eles; os outros profissionais da mesma conta seguem
as regras normais.

**2. Tabela de percentuais** — convênio × código TUSS, da planilha da unidade.
É ela que dá o percentual do cirurgião.

**3. Regras por papel e forma de cobrança** — auxiliar e anestesista dependem de
como a conta foi cobrada, não do procedimento:

| Forma de cobrança | Cirurgião | Auxiliar | Anestesista |
|---|---|---|---|
| Conta aberta | tabela (65% em geral) | 65% | 0% (65% no Bradesco) |
| Pacote com honorário fora | tabela (65% em geral) | 65% | 0% (65% no Bradesco) |
| Pacote com honorário dentro | 17% | 6% | 6% |
| Pacote com honorário dentro — IAMSPE | 21% | 9% | 0% |

### Como a ferramenta sabe a forma de cobrança

Ela lê do próprio demonstrativo, do mesmo jeito que o setor lê a olho:

- existe um pacote pago **e** um honorário avulso ao lado → *honorário fora*;
- existe pacote pago e **nenhum** honorário avulso → *honorário dentro*;
- não existe pacote → *conta aberta*.

Isso importa muito: na planilha de regras, 9 códigos têm **dois percentuais**
para o mesmo convênio (17% e 65%) exatamente por causa dessa distinção. Escolher
o errado paga quase quatro vezes mais — ou um quarto — do devido. A ferramenta
marca cada linha da planilha com o cenário a que pertence e escolhe a certa.

### Princípios do cálculo

- A base é sempre o **valor liberado** no demonstrativo. Nada é estimado.
- **Item glosado não gera repasse**, porque não houve pagamento.
- Material, medicamento, OPME e taxa são do hospital — não geram honorário.
- Guia sem casamento confirmado **fica de fora** do repasse (aparece na revisão).
- Procedimento pago **sem percentual cadastrado** não é ignorado em silêncio: vai
  para "Pontos de atenção", com paciente, código e valor.

---

## Validação com os arquivos reais

Testado de ponta a ponta no navegador com o demonstrativo da CASSI, a planilha de
regras e a produção reais:

| Verificação | Resultado |
|---|---|
| Leitura do PDF | 8 guias, 163 itens; soma dos itens **bate ao centavo** com o total impresso (R$ 27.210,30) |
| Importação das regras | 80.094 percentuais, 22 convênios |
| Importação da produção | 121.923 linhas |
| Casamento com a produção | **8 de 8 automáticas**, todas com a equipe correta |
| Repasse calculado | R$ 9.883,25 para 9 profissionais, sem pendências |

Conferências pontuais: goniotomia em conta aberta a 65% do honorário; pacote de
injeção intravítrea a 17% do pacote para o cirurgião e 6% para o auxiliar; sócio
a 32% do valor integral da conta.

---

## Pontos que precisam da sua confirmação

Estes eu implementei da forma que me pareceu mais fiel e mais conservadora, mas
mudam dinheiro — vale confirmar com quem define a regra:

1. **Anestesista não vem na produção.** O relatório tem cirurgião, auxiliar 1 e
   auxiliar 2, mas nenhuma coluna de anestesista. As regras preveem repasse a ele
   em pacote com honorário dentro (6%) e no Bradesco em conta aberta (65%). Hoje
   esses valores não são calculados por falta do dado. Ou o relatório passa a
   trazer a coluna, ou incluo um campo para informar o anestesista na revisão.

2. **Sócio recebe 32% e os demais continuam recebendo normalmente.** Foi assim
   que implementei: o sócio troca a regra dele pelos 32% do valor integral, e o
   auxiliar da mesma conta segue com o percentual dele. Se a intenção for que os
   32% substituam todo o repasse daquela conta, é um ajuste pequeno.

3. **APAS e SASSOM.** O documento diz que são credenciados diretos (sem repasse),
   mas a planilha traz percentuais para os dois. Deixei valendo a **planilha**,
   por ser a tabela operacional. Só a UNIMED está marcada como "sem repasse".

4. **Exceções da Unimed.** A Unimed não está na planilha de percentuais, então
   cadastrei as dez exceções do documento (campimetria 35%, ceratoscopia 75%,
   etc.) direto na ferramenta, casando pela descrição do exame. Elas sobrevivem a
   uma reimportação da planilha. Confira se a lista e os percentuais estão certos.

5. **Papéis de indicante e solicitante.** A planilha tem colunas para eles, todas
   zeradas. Não implementei repasse para esses papéis — se existir, é só cadastrar.

---

## Onde os dados ficam

No **navegador desta máquina** (IndexedDB), nunca na internet. Consequências:

- outro navegador ou outro computador não enxergam nada;
- limpar dados de navegação **apaga o banco**.

Por isso: `Backup → Exportar arquivo .db` ao fim de cada fechamento, guardado em
pasta de rede ou OneDrive. O arquivo `.db` contém tudo — dados, regras e as
decisões de conciliação.

---

## Estrutura do projeto

```
repasse_ribeirao_preto/
├── index.html                      ← abra este
├── css/                            style.css (identidade visual) + app.css (layout)
├── libs/                           sql.js, xlsx, pdf.js — tudo local, tudo offline
└── js/
    ├── utilidades.js               normalização e comparação de nomes, formatação
    ├── schema.js                   tabelas do banco + regras iniciais da unidade
    ├── banco.js                    SQLite no navegador e gravação serializada
    ├── parser_demonstrativo.js     lê o PDF por coordenadas (módulo puro, testável)
    ├── importador_demonstrativo.js PDF → banco
    ├── importador_producao.js      Excel → banco, tolerante a cabeçalhos
    ├── importador_regras.js        planilha de percentuais → banco
    ├── conciliacao.js              casamento paciente ↔ produção
    ├── regras_repasse.js           motor de cálculo do repasse
    ├── app.js                      navegação
    └── telas/                      painel, importações, revisão, guias, repasse, regras, backup
```

### Uma nota sobre a leitura do PDF

O texto do PDF **não** é lido na ordem em que aparece no arquivo — essa ordem
embaralha as colunas numéricas e cola o valor liberado no fim da descrição do
procedimento. Em vez disso, cada fragmento é posicionado pelas coordenadas que o
próprio PDF informa, as linhas são remontadas e cada número é atribuído à coluna
cujo cabeçalho o contém. É o que garante que "Valor Liberado" nunca seja
confundido com "Valor Glosa". (Nesses demonstrativos a página vem rotacionada em
90°, o que o parser trata.)
