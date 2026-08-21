/**
 * ============================================================================
 * IMPORTADOR do RELATÓRIO DE PRODUÇÃO (Excel/CSV)
 *
 * A produção é a metade da ferramenta que sabe QUEM atendeu. O demonstrativo
 * diz quanto o convênio pagou e para qual paciente; é aqui que esse paciente
 * ganha cirurgião, auxiliares, procedimento e convênio.
 *
 * O importador não exige um cabeçalho exato: cada campo tem uma lista de nomes
 * aceitos e as colunas que sobram são guardadas em `extras` (JSON), de modo que
 * nada do relatório original se perde. O único campo indispensável é o NOME DO
 * PACIENTE — sem ele não existe casamento com o demonstrativo.
 * ============================================================================
 */

const ImportadorProducao = {

  /**
   * Nomes de coluna aceitos para cada campo, em ordem de preferência.
   * A comparação é normalizada (sem acento nem pontuação), então "Cód. Admissão"
   * e "COD ADMISSAO" caem no mesmo lugar.
   */
  ALIASES: {
    cod_admissao:     ['COD ADMISSAO', 'CODIGO ADMISSAO', 'ADMISSAO', 'COD ATENDIMENTO',
                       'ATENDIMENTO', 'CONTA'],
    data_atendimento: ['DATA ADMISSAO', 'DATA ATENDIMENTO', 'DATA CIRURGIA',
                       'DATA REALIZACAO', 'DATA PROCEDIMENTO', 'DATA'],
    paciente:         ['PACIENTE', 'NOME PACIENTE', 'NOME DO PACIENTE', 'BENEFICIARIO',
                       'NOME BENEFICIARIO'],
    cod_paciente:     ['COD PACIENTE', 'CODIGO PACIENTE'],
    carteira:         ['CARTEIRA', 'NUMERO CARTEIRA', 'MATRICULA', 'N CARTEIRA'],
    guia:             ['GUIA', 'NUMERO GUIA', 'N GUIA', 'GUIA PRESTADOR', 'NUMERO DA GUIA'],
    convenio:         ['CONVENIO', 'OPERADORA'],
    plano:            ['PLANO'],
    tipo_recebimento: ['TIPO RECEBIMENTO'],
    procedimento:     ['PROCEDIMENTO PRINCIPAL', 'PROCEDIMENTO', 'CIRURGIA',
                       'DESCRICAO PROCEDIMENTO'],
    produto:          ['PRODUTO'],
    categoria:        ['CATEGORIA'],
    classificacao_produto: ['CLASSIFICACAO PRODUTO'],
    especialidade:    ['ESPECIALIDADE'],
    unidade:          ['UNID FATURAMENTO', 'UNID ATENDIMENTO', 'UNIDADE ATENDIMENTO', 'UNIDADE'],
    status:           ['STATUS ADMISSAO', 'STATUS', 'SITUACAO'],

    // Papéis — é daqui que sai o repasse.
    cirurgiao:        ['CIRURGIAO', 'MEDICO CIRURGIAO'],
    medico:           ['MEDICO', 'MEDICO EXECUTANTE', 'EXECUTANTE', 'MEDICO ASSISTENTE'],
    profissional_admissao: ['PROFISSIONAL ADMISSAO', 'PROFISSIONAL'],
    indicante:        ['INDICANTE', 'MEDICO INDICANTE'],
    solicitante:      ['SOLICITANTE', 'MEDICO SOLICITANTE'],
    auxiliar_1:       ['AUXILIAR 1', '1 AUXILIAR', 'AUXILIAR'],
    auxiliar_2:       ['AUXILIAR 2', '2 AUXILIAR'],
    anestesista:      ['ANESTESISTA', 'MEDICO ANESTESISTA'],
    instrumentador:   ['INSTRUMENTADOR'],

    quantidade:       ['QTD', 'QUANTIDADE', 'QTDE'],
    valor:            ['VALOR R', 'VALOR', 'VALOR TOTAL', 'VALOR PROCEDIMENTO'],
  },

  CAMPOS_DATA:   ['data_atendimento'],
  CAMPOS_NUMERO: ['quantidade', 'valor'],

  // ==========================================================================

  /**
   * Lê o arquivo e devolve o que foi entendido, SEM gravar.
   * A tela mostra esse de/para de colunas antes de confirmar — é a defesa
   * contra importar um relatório em que o cirurgião foi para a coluna errada.
   */
  async ler(arquivo) {
    if (!arquivo) throw new Error('Nenhum arquivo informado.');

    const buffer = await arquivo.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    const linhaHeader = this._acharCabecalho(matriz);
    if (linhaHeader < 0) {
      throw new Error(
        'Não foi possível localizar o cabeçalho do relatório.\n\n' +
        'A ferramenta procura, nas primeiras linhas, uma coluna de PACIENTE ' +
        '(ou "Nome do Paciente"/"Beneficiário"). Confira se o arquivo é o ' +
        'relatório de produção.'
      );
    }

    const cabecalhos = (matriz[linhaHeader] || []).map(c => String(c === null ? '' : c).trim());
    const mapa = this._mapearColunas(cabecalhos);

    if (mapa.campos.paciente === undefined) {
      throw new Error(
        'O relatório não tem uma coluna de PACIENTE.\n\n' +
        'É por ela que o pagamento do convênio encontra quem atendeu — sem ela ' +
        'não há como calcular o repasse.\n\n' +
        `Cabeçalhos encontrados: ${cabecalhos.filter(Boolean).slice(0, 15).join(', ')}`
      );
    }

    const dados = matriz.slice(linhaHeader + 1)
      .filter(l => l && l.some(c => c !== null && c !== ''));

    return {
      arquivo: arquivo.name,
      cabecalhos,
      linhaHeader,
      mapa,
      linhas: dados,
      totalLinhas: dados.length,
      previa: dados.slice(0, 5).map(l => this._montarRegistro(l, mapa, cabecalhos)),
      semCirurgiao: mapa.campos.cirurgiao === undefined && mapa.campos.medico === undefined,
      semAnestesista: mapa.campos.anestesista === undefined,
    };
  },

  async importar(arquivo) {
    return this.gravar(await this.ler(arquivo));
  },

  /**
   * Grava as linhas lidas.
   * Reimportar a mesma competência SUBSTITUI o que havia: reimportar o
   * relatório corrigido é o caminho normal de correção, e produção duplicada
   * viraria repasse duplicado.
   */
  gravar(lido, aoProgredir) {
    const relatorio = {
      arquivo: lido.arquivo,
      lidas: lido.linhas.length,
      importadas: 0,
      semPaciente: 0,
      semData: 0,
      competencias: new Set(),
      profissionais: new Set(),
    };

    const registros = [];
    for (let i = 0; i < lido.linhas.length; i++) {
      const reg = this._montarRegistro(lido.linhas[i], lido.mapa, lido.cabecalhos);
      reg.linha_origem = lido.linhaHeader + 2 + i;
      reg.arquivo = lido.arquivo;

      if (!reg.paciente_norm) { relatorio.semPaciente++; continue; }
      if (!reg.competencia) relatorio.semData++;

      registros.push(reg);
      if (reg.competencia) relatorio.competencias.add(reg.competencia);
      if (reg.cirurgiao) relatorio.profissionais.add(reg.cirurgiao);
    }

    const colunas = [
      'competencia', 'linha_origem', 'arquivo', 'cod_admissao', 'data_atendimento',
      'paciente', 'paciente_norm', 'cod_paciente', 'carteira', 'guia', 'convenio',
      'plano', 'procedimento', 'produto', 'categoria', 'classificacao_produto',
      'tipo_recebimento', 'status', 'medico', 'medico_norm', 'cirurgiao', 'indicante',
      'solicitante', 'auxiliar_1', 'auxiliar_2', 'anestesista', 'instrumentador',
      'profissional_admissao', 'especialidade', 'unidade', 'quantidade', 'valor', 'extras',
    ];
    const sql = `INSERT INTO linhas_producao (${colunas.join(', ')})
                 VALUES (${colunas.map(() => '?').join(', ')})`;

    Banco.emTransacao(() => {
      for (const comp of relatorio.competencias) {
        Banco.db.run('DELETE FROM linhas_producao WHERE competencia = ?', [comp]);
      }
      const stmt = Banco.db.prepare(sql);
      try {
        for (const reg of registros) {
          stmt.run(colunas.map(c => (reg[c] === undefined ? null : reg[c])));
          relatorio.importadas++;
          if (aoProgredir && relatorio.importadas % 5000 === 0) {
            aoProgredir(relatorio.importadas, registros.length);
          }
        }
      } finally {
        stmt.free();
      }

      Banco.db.run(
        `INSERT INTO importacoes (tipo, arquivo, competencia, qtd_linhas, resumo, importado_em)
         VALUES ('PRODUCAO', ?, ?, ?, ?, ?)`,
        [
          lido.arquivo,
          Array.from(relatorio.competencias).sort().join(', '),
          relatorio.importadas,
          `${relatorio.importadas} linhas · ${relatorio.profissionais.size} cirurgiões`,
          new Date().toISOString(),
        ]
      );
    });

    Banco.salvar({ imediato: true });

    return {
      ...relatorio,
      competencias: Array.from(relatorio.competencias).sort(),
      profissionais: relatorio.profissionais.size,
    };
  },

  // ==========================================================================

  _acharCabecalho(matriz) {
    const limite = Math.min(matriz.length, 15);
    for (let i = 0; i < limite; i++) {
      const linha = (matriz[i] || []).map(c => Utilidades.normalizar(c));
      if (linha.some(c => this.ALIASES.paciente.includes(c))) return i;
    }
    return -1;
  },

  _mapearColunas(cabecalhos) {
    const normalizados = cabecalhos.map(c => Utilidades.normalizar(c));
    const campos = {};
    const usados = new Set();

    for (const [campo, aliases] of Object.entries(this.ALIASES)) {
      for (const alias of aliases) {
        const idx = normalizados.findIndex((c, i) => c === alias && !usados.has(i));
        if (idx >= 0) { campos[campo] = idx; usados.add(idx); break; }
      }
    }

    const naoMapeadas = cabecalhos
      .map((c, i) => ({ nome: c, idx: i }))
      .filter(c => c.nome && !usados.has(c.idx));

    return { campos, naoMapeadas };
  },

  _montarRegistro(linha, mapa, cabecalhos) {
    const reg = {};
    for (const [campo, idx] of Object.entries(mapa.campos)) {
      let v = linha[idx];
      if (this.CAMPOS_DATA.includes(campo))        v = Utilidades.dataISO(v);
      else if (this.CAMPOS_NUMERO.includes(campo)) v = Utilidades.parseNumBR(v, null);
      else v = (v === null || v === undefined) ? null : String(v).trim() || null;
      reg[campo] = v;
    }

    reg.paciente_norm = Utilidades.normalizar(reg.paciente);
    reg.medico_norm   = Utilidades.normalizar(this.medicoResponsavel(reg));
    reg.competencia   = reg.data_atendimento ? reg.data_atendimento.slice(0, 7) : null;

    const extras = {};
    for (const col of mapa.naoMapeadas) {
      const v = linha[col.idx];
      if (v !== null && v !== undefined && v !== '') {
        extras[cabecalhos[col.idx]] = v instanceof Date ? Utilidades.dataISO(v) : String(v).trim();
      }
    }
    reg.extras = Object.keys(extras).length ? JSON.stringify(extras) : null;

    return reg;
  },

  /**
   * Quem responde pelo atendimento.
   * O cirurgião manda quando existe — é ele quem executa o procedimento pago.
   * Em consultas e exames, onde não há cirurgião, vale a coluna de médico e,
   * por último, o profissional registrado na admissão.
   */
  medicoResponsavel(reg) {
    return reg.cirurgiao || reg.medico || reg.profissional_admissao || reg.solicitante || null;
  },
};

window.ImportadorProducao = ImportadorProducao;
