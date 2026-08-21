/**
 * ============================================================================
 * IMPORTADOR do DEMONSTRATIVO DE PAGAMENTO (PDF)
 *
 * Faz a ponte entre o PDF e o banco:
 *   PDF → pdf.js (fragmentos posicionados) → ParserDemonstrativo → tabelas
 *
 * Reimportar o mesmo demonstrativo SOBRESCREVE o anterior (mesmo número de
 * demonstrativo + mesmo prestador). Isso permite reimportar sem medo quando o
 * convênio reenvia o arquivo corrigido.
 * ============================================================================
 */

const ImportadorDemonstrativo = {

  /** Carrega o pdf.js sob demanda e devolve a biblioteca pronta para uso. */
  _pdfjs() {
    const lib = window.pdfjsLib;
    if (!lib) {
      throw new Error(
        'A biblioteca de leitura de PDF não carregou.\n\n' +
        'Confira se a pasta "libs" está junto do index.html.'
      );
    }
    if (!lib.GlobalWorkerOptions.workerSrc) {
      // Abrindo por duplo clique (file://) o navegador recusa criar um Worker
      // a partir de arquivo local. O pdf.js detecta isso sozinho e passa a
      // processar na própria página — mais lento, mas funciona offline.
      lib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
    }
    return lib;
  },

  /**
   * Lê o PDF e devolve a estrutura do demonstrativo, SEM gravar no banco.
   * Serve para a pré-visualização: o operador confere o que foi lido antes de
   * confirmar a importação.
   */
  async ler(arquivo, aoProgredir) {
    if (!arquivo) throw new Error('Nenhum arquivo informado.');

    const pdfjsLib = this._pdfjs();
    const buffer = await arquivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

    const paginas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const pagina = await pdf.getPage(p);
      const conteudo = await pagina.getTextContent();
      paginas.push(conteudo.items.map(it => ({
        x: it.transform[4],
        y: it.transform[5],
        str: it.str,
      })));
      if (aoProgredir) aoProgredir(p, pdf.numPages);
    }

    const doc = ParserDemonstrativo.parsear(paginas);

    if (!doc.guias.length) {
      throw new Error(
        'Nenhuma guia foi encontrada neste PDF.\n\n' +
        'A ferramenta espera um "Demonstrativo de Análise de Conta" no padrão TISS. ' +
        'Se o arquivo for um PDF digitalizado (foto/scan), o texto não pode ser lido — ' +
        'peça o arquivo original ao convênio.'
      );
    }

    doc.arquivo = arquivo.name;
    doc.convenio = this.nomeCurtoConvenio(doc.cabecalho.operadora);
    doc.competencia = this._competenciaPredominante(doc);
    return doc;
  },

  /**
   * Lê e grava. Devolve um relatório do que entrou.
   */
  async importar(arquivo, aoProgredir) {
    const doc = await this.ler(arquivo, aoProgredir);
    return this.gravar(doc);
  },

  /** Grava no banco uma estrutura já lida (e conferida) pelo parser. */
  gravar(doc) {
    const agora = new Date().toISOString();
    const relatorio = {
      numero: doc.cabecalho.numeroDemonstrativo || '(sem número)',
      convenio: doc.convenio,
      competencia: doc.competencia,
      guias: doc.guias.length,
      itens: 0,
      itensPagos: 0,
      totalLiberado: 0,
      totalGlosa: 0,
      substituiu: false,
      avisos: doc.avisos.slice(),
    };

    Banco.emTransacao(() => {
      // Sobrescreve uma importação anterior do mesmo demonstrativo.
      const anterior = Banco.queryUnica(
        'SELECT id FROM demonstrativos WHERE numero = ? AND codigo_prestador = ?',
        [doc.cabecalho.numeroDemonstrativo || '', doc.cabecalho.codigoPrestador || '']
      );
      if (anterior) {
        relatorio.substituiu = true;
        this._apagarDemonstrativo(anterior.id);
      }

      Banco.db.run(
        `INSERT INTO demonstrativos
           (numero, operadora, convenio, registro_ans, cnpj_operadora, data_emissao,
            codigo_prestador, prestador, cnes, competencia, arquivo, importado_em,
            total_informado, total_processado, total_liberado, total_glosa, qtd_guias)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          doc.cabecalho.numeroDemonstrativo || '',
          doc.cabecalho.operadora || '',
          doc.convenio || '',
          doc.cabecalho.registroAns || '',
          doc.cabecalho.cnpjOperadora || '',
          Utilidades.dataISO(doc.cabecalho.dataEmissao) || '',
          doc.cabecalho.codigoPrestador || '',
          doc.cabecalho.nomePrestador || '',
          doc.cabecalho.cnes || '',
          doc.competencia || '',
          doc.arquivo || '',
          agora,
          doc.totalGeral ? doc.totalGeral.informado : 0,
          doc.totalGeral ? doc.totalGeral.processado : 0,
          doc.totalGeral ? doc.totalGeral.liberado : 0,
          doc.totalGeral ? doc.totalGeral.glosa : 0,
          doc.guias.length,
        ]
      );
      const demonstrativoId = Banco.ultimoId();

      for (const guia of doc.guias) {
        const datas = guia.itens.map(i => Utilidades.dataISO(i.data)).filter(Boolean).sort();
        const dataAtendimento = datas[0] || '';
        const totais = guia.totais || { informado: 0, processado: 0, liberado: 0, glosa: 0 };

        // O cenário de cobrança (conta aberta / pacote) é deduzido já na
        // importação: ele muda o percentual de repasse e o operador precisa
        // poder conferi-lo antes de fechar o mês.
        const cenario = RepasseMotor.detectarCenario(guia.itens.map(i => ({
          tipo: i.tipo, valor_liberado: i.valorLiberado,
        })));

        Banco.db.run(
          `INSERT INTO guias_demonstrativo
             (demonstrativo_id, numero_guia_prestador, numero_guia_operadora, senha,
              beneficiario, beneficiario_norm, carteira, numero_protocolo, numero_lote,
              data_atendimento, competencia, cenario,
              total_informado, total_processado, total_liberado, total_glosa)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            demonstrativoId,
            guia.numeroGuiaPrestador || '',
            guia.numeroGuiaOperadora || '',
            guia.senha || '',
            guia.beneficiario || '',
            Utilidades.normalizar(guia.beneficiario),
            guia.carteira || '',
            guia.numeroProtocolo || '',
            guia.numeroLote || '',
            dataAtendimento,
            dataAtendimento ? dataAtendimento.slice(0, 7) : (doc.competencia || ''),
            cenario,
            totais.informado, totais.processado, totais.liberado, totais.glosa,
          ]
        );
        const guiaId = Banco.ultimoId();

        for (const item of guia.itens) {
          Banco.db.run(
            `INSERT INTO itens_demonstrativo
               (guia_id, demonstrativo_id, data_realizacao, tabela, codigo, descricao,
                grau_participacao, tipo, lio, gera_repasse,
                valor_informado, quantidade, valor_processado, valor_liberado,
                valor_glosa, codigo_glosa, centro_consumo)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              guiaId, demonstrativoId,
              Utilidades.dataISO(item.data) || '',
              item.tabela || '', item.codigo || '', item.descricao || '',
              item.grauParticipacao || '', item.tipo || '',
              item.lio ? 1 : 0, item.geraRepasse ? 1 : 0,
              item.valorInformado, item.quantidade, item.valorProcessado,
              item.valorLiberado, item.valorGlosa,
              item.codigoGlosa || '', item.centroConsumo || '',
            ]
          );
          relatorio.itens++;
          if (item.valorLiberado > 0) relatorio.itensPagos++;
          relatorio.totalLiberado += item.valorLiberado;
          relatorio.totalGlosa += item.valorGlosa;
        }
      }

      Banco.db.run(
        `INSERT INTO importacoes (tipo, arquivo, competencia, qtd_linhas, resumo, importado_em)
         VALUES ('DEMONSTRATIVO', ?, ?, ?, ?, ?)`,
        [
          doc.arquivo || '', doc.competencia || '', relatorio.guias,
          `${relatorio.guias} guias · ${Utilidades.formatarMoeda(relatorio.totalLiberado)} liberados`,
          agora,
        ]
      );
    });

    Banco.salvar({ imediato: true });
    return relatorio;
  },

  /** Remove um demonstrativo e tudo que depende dele. */
  _apagarDemonstrativo(id) {
    Banco.db.run(
      `DELETE FROM conciliacoes WHERE guia_id IN
         (SELECT id FROM guias_demonstrativo WHERE demonstrativo_id = ?)`, [id]);
    Banco.db.run('DELETE FROM itens_demonstrativo WHERE demonstrativo_id = ?', [id]);
    Banco.db.run('DELETE FROM guias_demonstrativo WHERE demonstrativo_id = ?', [id]);
    Banco.db.run('DELETE FROM demonstrativos WHERE id = ?', [id]);
  },

  /** Apaga um demonstrativo importado (usado na tela de histórico). */
  apagar(id) {
    Banco.emTransacao(() => this._apagarDemonstrativo(id));
    Banco.salvar({ imediato: true });
  },

  /**
   * Nome curto do convênio, que é como as regras de repasse se referem a ele.
   * "CASSI - Caixa de Assistência dos Funcionários..." → "CASSI"
   */
  nomeCurtoConvenio(operadora) {
    const s = String(operadora || '').trim();
    if (!s) return '';
    const corte = s.split(/\s+[-–]\s+/)[0].trim();
    return (corte || s).slice(0, 40).toUpperCase();
  },

  /** Competência com mais atendimentos no demonstrativo. */
  _competenciaPredominante(doc) {
    const contagem = {};
    for (const guia of doc.guias) {
      for (const item of guia.itens) {
        const comp = Utilidades.competencia(item.data);
        if (comp) contagem[comp] = (contagem[comp] || 0) + 1;
      }
    }
    const ordenado = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
    return ordenado.length ? ordenado[0][0] : '';
  },
};

window.ImportadorDemonstrativo = ImportadorDemonstrativo;
