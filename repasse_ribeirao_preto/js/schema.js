/**
 * ============================================================================
 * SCHEMA do banco (SQLite no navegador)
 *
 * Quatro blocos, que espelham o fluxo real da unidade:
 *
 *   1. DEMONSTRATIVO  — o que o convênio pagou (vem do PDF).
 *                       demonstrativos → guias_demonstrativo → itens_demonstrativo
 *
 *   2. PRODUÇÃO       — o que o hospital fez e QUEM fez (vem do Excel).
 *                       linhas_producao
 *
 *   3. LIGAÇÃO        — a ponte entre os dois, pelo nome do paciente.
 *                       conciliacoes + de_para_pacientes
 *
 *   4. REGRAS         — quanto cada profissional recebe.
 *                       tabela_percentuais (convênio × código TUSS)
 *                       regras_papel · regras_medico · excecoes_execucao
 *
 * O repasse nasce do cruzamento: valor pago (1) × equipe médica (2) × regra (4).
 * ============================================================================
 */

const Schema = {

  VERSAO: 2,

  SQL: `
-- ═══════════════════════════════════════════════════════════════════════
-- 1. DEMONSTRATIVO DE PAGAMENTO
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS demonstrativos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  numero            TEXT,
  operadora         TEXT,
  convenio          TEXT,            -- nome curto, usado nas regras (ex: CASSI)
  registro_ans      TEXT,
  cnpj_operadora    TEXT,
  data_emissao      TEXT,
  codigo_prestador  TEXT,
  prestador         TEXT,
  cnes              TEXT,
  competencia       TEXT,
  arquivo           TEXT,
  importado_em      TEXT,
  total_informado   REAL DEFAULT 0,
  total_processado  REAL DEFAULT 0,
  total_liberado    REAL DEFAULT 0,
  total_glosa       REAL DEFAULT 0,
  qtd_guias         INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS guias_demonstrativo (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  demonstrativo_id      INTEGER NOT NULL,
  numero_guia_prestador TEXT,
  numero_guia_operadora TEXT,
  senha                 TEXT,
  beneficiario          TEXT,
  beneficiario_norm     TEXT,        -- chave do casamento com a produção
  carteira              TEXT,
  numero_protocolo      TEXT,
  numero_lote           TEXT,
  data_atendimento      TEXT,
  competencia           TEXT,
  cenario               TEXT,        -- CONTA_ABERTA | PACOTE_HONORARIO_DENTRO
                                     -- | PACOTE_HONORARIO_FORA  (ver regras_repasse.js)
  cenario_manual        INTEGER DEFAULT 0,   -- 1 = ajustado à mão, não recalcular
  total_informado       REAL DEFAULT 0,
  total_processado      REAL DEFAULT 0,
  total_liberado        REAL DEFAULT 0,
  total_glosa           REAL DEFAULT 0,
  FOREIGN KEY (demonstrativo_id) REFERENCES demonstrativos(id)
);

CREATE INDEX IF NOT EXISTS idx_guias_benef ON guias_demonstrativo(beneficiario_norm);
CREATE INDEX IF NOT EXISTS idx_guias_demo  ON guias_demonstrativo(demonstrativo_id);
CREATE INDEX IF NOT EXISTS idx_guias_comp  ON guias_demonstrativo(competencia);

CREATE TABLE IF NOT EXISTS itens_demonstrativo (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guia_id           INTEGER NOT NULL,
  demonstrativo_id  INTEGER NOT NULL,
  data_realizacao   TEXT,
  tabela            TEXT,
  codigo            TEXT,
  descricao         TEXT,
  grau_participacao TEXT,
  tipo              TEXT,            -- PROCEDIMENTO | PACOTE | OPME | MATERIAL | ...
  lio               INTEGER DEFAULT 0,
  gera_repasse      INTEGER DEFAULT 0,
  valor_informado   REAL DEFAULT 0,
  quantidade        REAL DEFAULT 0,
  valor_processado  REAL DEFAULT 0,
  valor_liberado    REAL DEFAULT 0,
  valor_glosa       REAL DEFAULT 0,
  codigo_glosa      TEXT,
  centro_consumo    TEXT,
  FOREIGN KEY (guia_id) REFERENCES guias_demonstrativo(id)
);

CREATE INDEX IF NOT EXISTS idx_itens_guia ON itens_demonstrativo(guia_id);
CREATE INDEX IF NOT EXISTS idx_itens_tipo ON itens_demonstrativo(tipo);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. PRODUÇÃO
-- ═══════════════════════════════════════════════════════════════════════
-- Guarda as colunas que o repasse usa. O que o importador não reconhece vai
-- para "extras" (JSON), então nada do relatório original se perde.

CREATE TABLE IF NOT EXISTS linhas_producao (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  competencia       TEXT,
  linha_origem      INTEGER,
  arquivo           TEXT,
  cod_admissao      TEXT,
  data_atendimento  TEXT,
  paciente          TEXT,
  paciente_norm     TEXT,            -- chave do casamento com o demonstrativo
  cod_paciente      TEXT,
  carteira          TEXT,
  guia              TEXT,
  convenio          TEXT,
  plano             TEXT,
  procedimento      TEXT,
  produto           TEXT,
  categoria         TEXT,
  classificacao_produto TEXT,
  tipo_recebimento  TEXT,            -- CONVÊNIO | PARTICULAR | CORTESIA
  status            TEXT,
  medico            TEXT,
  medico_norm       TEXT,
  cirurgiao         TEXT,
  indicante         TEXT,
  solicitante       TEXT,
  auxiliar_1        TEXT,
  auxiliar_2        TEXT,
  anestesista       TEXT,
  instrumentador    TEXT,
  profissional_admissao TEXT,
  especialidade     TEXT,
  unidade           TEXT,
  quantidade        REAL,
  valor             REAL,
  extras            TEXT
);

CREATE INDEX IF NOT EXISTS idx_prod_pac  ON linhas_producao(paciente_norm);
CREATE INDEX IF NOT EXISTS idx_prod_comp ON linhas_producao(competencia);
CREATE INDEX IF NOT EXISTS idx_prod_adm  ON linhas_producao(cod_admissao);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. LIGAÇÃO ENTRE PAGAMENTO E PRODUÇÃO
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conciliacoes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guia_id           INTEGER NOT NULL UNIQUE,
  producao_id       INTEGER,
  cod_admissao      TEXT,
  status            TEXT NOT NULL,   -- AUTOMATICO | CONFIRMADO | PENDENTE
                                     -- SEM_CORRESPONDENCIA | IGNORADO
  score             REAL DEFAULT 0,
  motivo            TEXT,
  candidatos        TEXT,            -- JSON dos concorrentes, para a revisão
  cirurgiao         TEXT,
  auxiliar_1        TEXT,
  auxiliar_2        TEXT,
  anestesista       TEXT,
  equipe_manual     INTEGER DEFAULT 0,
  decidido_em       TEXT,
  FOREIGN KEY (guia_id) REFERENCES guias_demonstrativo(id)
);

CREATE INDEX IF NOT EXISTS idx_conc_status ON conciliacoes(status);

-- Correções de nome já feitas pelo operador: na importação seguinte o mesmo
-- paciente é reconhecido sozinho.
CREATE TABLE IF NOT EXISTS de_para_pacientes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_demonstrativo  TEXT,
  nome_demo_norm      TEXT UNIQUE,
  nome_producao       TEXT,
  nome_producao_norm  TEXT,
  criado_em           TEXT
);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. REGRAS DE REPASSE
-- ═══════════════════════════════════════════════════════════════════════

-- Tabela mestra: percentual do médico responsável por convênio e código TUSS.
-- É a planilha "PORCENTAGEM_PROCEDIMENTO" importada (dezenas de milhares de
-- linhas). O campo "cenario" separa os poucos códigos que têm percentual
-- diferente conforme a cobrança seja pacote fechado ou conta aberta.
CREATE TABLE IF NOT EXISTS tabela_percentuais (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  convenio      TEXT,
  convenio_norm TEXT,
  codigo        TEXT,
  descricao     TEXT,
  descricao_norm TEXT,
  percentual    REAL,               -- 0 a 100
  cenario       TEXT,               -- vazio = vale para qualquer cenário
  origem        TEXT
);

CREATE INDEX IF NOT EXISTS idx_pct_busca ON tabela_percentuais(convenio_norm, codigo);
CREATE INDEX IF NOT EXISTS idx_pct_desc  ON tabela_percentuais(convenio_norm, descricao_norm);

-- Percentual de cada PAPEL conforme o cenário de cobrança.
-- O percentual do cirurgião vem da tabela mestra; auxiliar e anestesista
-- seguem daqui, porque dependem do formato da conta e não do procedimento.
CREATE TABLE IF NOT EXISTS regras_papel (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cenario     TEXT NOT NULL,
  convenio    TEXT,                 -- vazio = todos os convênios
  papel       TEXT NOT NULL,        -- CIRURGIAO | AUXILIAR | ANESTESISTA
  percentual  REAL NOT NULL,
  observacao  TEXT
);

-- Regras que seguem a PESSOA, não o procedimento (o caso dos sócios).
CREATE TABLE IF NOT EXISTS regras_medico (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  medico      TEXT NOT NULL,
  medico_norm TEXT NOT NULL,
  percentual  REAL NOT NULL,
  base        TEXT DEFAULT 'TOTAL_GUIA',  -- TOTAL_GUIA | ITEM
  convenio    TEXT,
  ativa       INTEGER DEFAULT 1,
  observacao  TEXT
);

-- Casos em que o profissional que aparece na conta não é quem executou.
CREATE TABLE IF NOT EXISTS excecoes_execucao (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  convenio      TEXT,
  codigo        TEXT,
  medico_conta  TEXT,
  medico_real   TEXT,
  ativa         INTEGER DEFAULT 1,
  observacao    TEXT
);

-- Convênios em que o profissional é credenciado direto: o convênio paga o
-- médico, o hospital não repassa.
CREATE TABLE IF NOT EXISTS convenios_sem_repasse (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  convenio      TEXT,
  convenio_norm TEXT UNIQUE,
  observacao    TEXT
);

CREATE TABLE IF NOT EXISTS medicos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  nome_norm     TEXT UNIQUE,
  crm           TEXT,
  especialidade TEXT,
  ativo         INTEGER DEFAULT 1,
  observacao    TEXT
);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. APOIO
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS config (
  chave  TEXT PRIMARY KEY,
  valor  TEXT
);

CREATE TABLE IF NOT EXISTS importacoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo          TEXT,                -- DEMONSTRATIVO | PRODUCAO | REGRAS
  arquivo       TEXT,
  competencia   TEXT,
  qtd_linhas    INTEGER,
  resumo        TEXT,
  importado_em  TEXT
);
`,

  /**
   * Valores que vêm do documento de regras da unidade e não dependem de
   * planilha nenhuma. São gravados só na criação do banco — depois disso a
   * tela de Regras manda, para que um ajuste feito pelo usuário não seja
   * desfeito na próxima abertura.
   */
  SEED_PAPEIS: [
    // Conta aberta: todo mundo recebe 65% do honorário do respectivo profissional.
    ['CONTA_ABERTA', '', 'AUXILIAR', 65, 'Conta aberta: auxiliar recebe 65%.'],
    ['CONTA_ABERTA', '', 'ANESTESISTA', 0, 'Conta aberta: anestesista fatura direto na CARP.'],
    ['CONTA_ABERTA', 'BRADESCO', 'ANESTESISTA', 65, 'Exceção Bradesco: anestesista recebe 65%.'],

    // Pacote com honorário lançado fora: segue o padrão da conta aberta.
    ['PACOTE_HONORARIO_FORA', '', 'AUXILIAR', 65, 'Pacote com honorário fora: auxiliar recebe 65%.'],
    ['PACOTE_HONORARIO_FORA', '', 'ANESTESISTA', 0, 'Anestesista fatura direto na CARP.'],
    ['PACOTE_HONORARIO_FORA', 'BRADESCO', 'ANESTESISTA', 65, 'Exceção Bradesco: anestesista recebe 65%.'],

    // Pacote com honorário dentro: percentuais sobre o valor total do pacote.
    ['PACOTE_HONORARIO_DENTRO', '', 'CIRURGIAO', 17, 'Pacote com honorário dentro: cirurgião 17%.'],
    ['PACOTE_HONORARIO_DENTRO', '', 'AUXILIAR', 6, 'Pacote com honorário dentro: auxiliar 6%.'],
    ['PACOTE_HONORARIO_DENTRO', '', 'ANESTESISTA', 6, 'Pacote com honorário dentro: anestesista 6%.'],
    ['PACOTE_HONORARIO_DENTRO', 'IAMSPE', 'CIRURGIAO', 21, 'IAMSPE: cirurgião 21%.'],
    ['PACOTE_HONORARIO_DENTRO', 'IAMSPE', 'AUXILIAR', 9, 'IAMSPE: auxiliar 9%.'],
    ['PACOTE_HONORARIO_DENTRO', 'IAMSPE', 'ANESTESISTA', 0, 'IAMSPE: anestesista fatura pela CARP.'],
  ],

  /**
   * Sócios: 32% do valor integral da conta sempre que o nome aparecer nela,
   * em qualquer papel e em qualquer convênio.
   */
  SEED_MEDICOS: [
    ['NILTON CLAUDIO TOKUNAGA', 32, 'Sócio: 32% do valor integral da conta, qualquer papel e convênio.'],
    ['CLAYTON CESAR TOKUNAGA', 32, 'Sócio: 32% do valor integral da conta, qualquer papel e convênio.'],
  ],

  /** Dra. Fernanda executa as OCTs do SASSOM, mas quem aparece na conta é o Dr. Nilton. */
  SEED_EXCECOES: [
    ['SASSOM', '41501144', 'NILTON CLAUDIO TOKUNAGA', 'FERNANDA CROTTI',
     'OCT do SASSOM: confira na produção se quem realizou foi a Dra. Fernanda.'],
  ],

  /** Convênios cujos profissionais são credenciados diretos. */
  SEED_SEM_REPASSE: [
    ['UNIMED', 'Credenciado direto: a Unimed paga o médico. Só as exceções abaixo geram repasse.'],
  ],

  /**
   * Exceções da Unimed.
   *
   * A Unimed não aparece na planilha de percentuais porque, em regra, ela paga
   * o médico direto. O documento de regras lista os poucos exames em que o
   * hospital repassa — são estes. Como o convênio não usa a mesma codificação
   * dos demais aqui, o casamento é pela descrição do item no demonstrativo.
   */
  SEED_PERCENTUAIS: [
    ['UNIMED', 'CAMPIMETRIA', 35],
    ['UNIMED', 'RETINOGRAFIA', 35],
    ['UNIMED', 'TOMOGRAFIA DE COERENCIA OPTICA', 35],
    ['UNIMED', 'OCT', 35],
    ['UNIMED', 'ULTRASSONOGRAFIA', 65],
    ['UNIMED', 'ANGIOFLUORESCEINOGRAFIA', 65],
    ['UNIMED', 'CERATOSCOPIA', 75],
    ['UNIMED', 'MICROSCOPIA ESPECULAR', 75],
    ['UNIMED', 'BIOMETRIA', 75],
    ['UNIMED', 'PAQUIMETRIA', 75],
  ],

  /** Marca das linhas que vêm do documento de regras, não da planilha. */
  ORIGEM_DOCUMENTO: 'DOCUMENTO_REGRAS',

  criar(db) {
    db.exec(this.SQL);

    const jaSemeado = db.exec("SELECT valor FROM config WHERE chave = 'seed_regras'");
    if (!jaSemeado.length) {
      for (const [cenario, convenio, papel, pct, obs] of this.SEED_PAPEIS) {
        db.run(`INSERT INTO regras_papel (cenario, convenio, papel, percentual, observacao)
                VALUES (?,?,?,?,?)`, [cenario, convenio, papel, pct, obs]);
      }
      for (const [nome, pct, obs] of this.SEED_MEDICOS) {
        db.run(`INSERT INTO regras_medico (medico, medico_norm, percentual, base, observacao)
                VALUES (?,?,?, 'TOTAL_GUIA', ?)`, [nome, nome, pct, obs]);
      }
      for (const [conv, cod, contaN, realN, obs] of this.SEED_EXCECOES) {
        db.run(`INSERT INTO excecoes_execucao (convenio, codigo, medico_conta, medico_real, observacao)
                VALUES (?,?,?,?,?)`, [conv, cod, contaN, realN, obs]);
      }
      for (const [conv, obs] of this.SEED_SEM_REPASSE) {
        db.run(`INSERT OR IGNORE INTO convenios_sem_repasse (convenio, convenio_norm, observacao)
                VALUES (?,?,?)`, [conv, conv, obs]);
      }
      for (const [conv, desc, pct] of this.SEED_PERCENTUAIS) {
        db.run(`INSERT INTO tabela_percentuais
                  (convenio, convenio_norm, codigo, descricao, descricao_norm, percentual, cenario, origem)
                VALUES (?,?,'',?,?,?,'',?)`,
               [conv, conv, desc, desc, pct, this.ORIGEM_DOCUMENTO]);
      }
      db.run("INSERT OR REPLACE INTO config (chave, valor) VALUES ('seed_regras', '1')");
    }

    db.run(`INSERT INTO config (chave, valor) VALUES ('versao_schema', ?)
            ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [String(this.VERSAO)]);
  },
};

window.Schema = Schema;
