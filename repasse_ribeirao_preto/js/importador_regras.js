/**
 * ============================================================================
 * IMPORTADOR da PLANILHA DE REGRAS (percentuais por convênio e procedimento)
 *
 * Carrega a aba "PORCENTAGEM_PROCEDIMENTO": convênio × código TUSS × percentual.
 * São dezenas de milhares de linhas — é a tabela que responde, para cada
 * procedimento pago, qual fatia vai para o médico responsável.
 *
 * Um detalhe importante do arquivo: alguns códigos aparecem DUAS vezes para o
 * mesmo convênio, com percentuais diferentes (17% e 65%). Não é erro de
 * digitação — é a diferença entre a cirurgia cobrada como pacote fechado (com
 * o honorário embutido, 17%) e a mesma cirurgia cobrada em conta aberta (65%).
 * O importador marca cada linha com o cenário a que pertence, e o motor de
 * repasse escolhe a certa conforme a conta que está calculando. Sem isso, o
 * repasse dessas cirurgias sairia com quase quatro vezes o valor devido — ou
 * com um quarto dele.
 * ============================================================================
 */

const ImportadorRegras = {

  ABA_PERCENTUAIS: 'PORCENTAGEM_PROCEDIMENTO',

  /** Percentual usado pelos pacotes com honorário embutido. */
  PCT_PACOTE_HONORARIO_DENTRO: 17,

  /**
   * Lê a planilha e devolve o que será gravado, sem tocar no banco.
   */
  async ler(arquivo) {
    if (!arquivo) throw new Error('Nenhum arquivo informado.');

    const buffer = await arquivo.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });

    const nomeAba = wb.SheetNames.find(
      n => Utilidades.normalizar(n) === Utilidades.normalizar(this.ABA_PERCENTUAIS)
    );
    if (!nomeAba) {
      throw new Error(
        `A planilha não tem a aba "${this.ABA_PERCENTUAIS}".\n\n` +
        `Abas encontradas: ${wb.SheetNames.join(', ')}`
      );
    }

    const matriz = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, defval: null });
    const linhaHeader = this._acharCabecalho(matriz);
    if (linhaHeader < 0) {
      throw new Error(
        'Não foi possível localizar o cabeçalho da aba de percentuais.\n\n' +
        'Esperado uma linha com CONVÊNIO, CÓDIGO, DESCRIÇÃO e % REPASSE.'
      );
    }

    const cab = (matriz[linhaHeader] || []).map(c => Utilidades.normalizar(c));
    const col = {
      convenio:   cab.findIndex(c => c.startsWith('CONVENIO')),
      codigo:     cab.findIndex(c => c.startsWith('CODIGO')),
      descricao:  cab.findIndex(c => c.startsWith('DESCRICAO')),
      percentual: cab.findIndex(c => c.includes('REPASSE')),
    };

    const registros = [];
    const convenios = new Set();

    for (const linha of matriz.slice(linhaHeader + 1)) {
      if (!linha) continue;
      const convenio = this._texto(linha[col.convenio]);
      const codigo   = this._texto(linha[col.codigo]);
      const descricao = this._texto(linha[col.descricao]);
      if (!convenio && !codigo) continue;
      if (!convenio) continue;

      const pct = this._percentual(linha[col.percentual]);
      if (pct === null) continue;

      registros.push({
        convenio,
        convenio_norm: this._normConvenio(convenio),
        codigo,
        descricao,
        descricao_norm: Utilidades.normalizar(descricao),
        percentual: pct,
        cenario: '',
      });
      convenios.add(convenio);
    }

    this._marcarCenarios(registros);

    return {
      arquivo: arquivo.name,
      aba: nomeAba,
      registros,
      convenios: Array.from(convenios).sort(),
      qtdPorCenario: registros.reduce((acc, r) => {
        const k = r.cenario || 'qualquer cenário';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    };
  },

  /**
   * Marca o cenário nas linhas em que o mesmo convênio+código tem percentuais
   * diferentes: o de 17% é o pacote com honorário dentro; o outro vale para
   * conta aberta e pacote com honorário fora.
   */
  _marcarCenarios(registros) {
    const porChave = new Map();
    for (const r of registros) {
      if (!r.codigo) continue;
      const chave = r.convenio_norm + '|' + r.codigo;
      if (!porChave.has(chave)) porChave.set(chave, []);
      porChave.get(chave).push(r);
    }

    for (const grupo of porChave.values()) {
      const distintos = new Set(grupo.map(r => r.percentual));
      if (distintos.size < 2) continue;   // repetição de descrição, não conflito

      for (const r of grupo) {
        r.cenario = r.percentual === this.PCT_PACOTE_HONORARIO_DENTRO
          ? 'PACOTE_HONORARIO_DENTRO'
          : '';
      }
    }
  },

  /** Grava, substituindo a tabela anterior por inteiro. */
  gravar(lido) {
    const total = lido.registros.length;

    Banco.emTransacao(() => {
      // Preserva as linhas que vêm do documento de regras (as exceções da
      // Unimed, que não estão na planilha) — sem isso, reimportar a planilha
      // apagaria em silêncio regras que ninguém teria como recadastrar.
      Banco.db.run('DELETE FROM tabela_percentuais WHERE origem IS NULL OR origem <> ?',
                   [Schema.ORIGEM_DOCUMENTO]);
      const stmt = Banco.db.prepare(`
        INSERT INTO tabela_percentuais
          (convenio, convenio_norm, codigo, descricao, descricao_norm, percentual, cenario, origem)
        VALUES (?,?,?,?,?,?,?,?)
      `);
      try {
        for (const r of lido.registros) {
          stmt.run([r.convenio, r.convenio_norm, r.codigo, r.descricao,
                    r.descricao_norm, r.percentual, r.cenario, lido.arquivo]);
        }
      } finally {
        stmt.free();
      }

      Banco.db.run(
        `INSERT INTO importacoes (tipo, arquivo, competencia, qtd_linhas, resumo, importado_em)
         VALUES ('REGRAS', ?, '', ?, ?, ?)`,
        [lido.arquivo, total,
         `${total} percentuais · ${lido.convenios.length} convênios`,
         new Date().toISOString()]
      );
    });

    Banco.salvar({ imediato: true });

    return {
      arquivo: lido.arquivo,
      registros: total,
      convenios: lido.convenios,
      qtdPorCenario: lido.qtdPorCenario,
    };
  },

  async importar(arquivo) {
    return this.gravar(await this.ler(arquivo));
  },

  // ==========================================================================

  _acharCabecalho(matriz) {
    for (let i = 0; i < Math.min(matriz.length, 20); i++) {
      const linha = (matriz[i] || []).map(c => Utilidades.normalizar(c));
      if (linha.some(c => c.startsWith('CONVENIO')) && linha.some(c => c.includes('REPASSE'))) {
        return i;
      }
    }
    return -1;
  },

  _texto(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  },

  /**
   * A planilha grava o percentual como fração (0,65). Aceita também "65%" e
   * 65, porque a mesma coluna costuma ser editada à mão.
   */
  _percentual(v) {
    if (v === null || v === undefined || v === '') return null;
    let n = Utilidades.parseNumBR(String(v).replace('%', ''), null);
    if (n === null) return null;
    if (n > 0 && n <= 1) n = n * 100;      // fração → percentual
    if (n < 0 || n > 100) return null;
    return Math.round(n * 100) / 100;
  },

  _normConvenio(nome) {
    return Utilidades.normalizar(String(nome || '').replace(/\(.*?\)/g, ''));
  },

  /** Resumo para as telas. */
  resumo() {
    const total = Banco.contar('tabela_percentuais');
    if (!total) return null;
    return {
      total,
      convenios: Banco.query(
        `SELECT convenio, COUNT(*) AS qtd FROM tabela_percentuais
          GROUP BY convenio ORDER BY convenio`),
      importacao: Banco.queryUnica(
        `SELECT * FROM importacoes WHERE tipo = 'REGRAS'
          ORDER BY id DESC LIMIT 1`),
    };
  },
};

window.ImportadorRegras = ImportadorRegras;
