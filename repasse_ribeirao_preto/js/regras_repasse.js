/**
 * ============================================================================
 * MOTOR DE REPASSE
 *
 * Responde: "o convênio pagou R$ X pelo procedimento Y do paciente Z; quem
 * recebe, e quanto?"
 *
 * A resposta depende de três coisas, nesta ordem:
 *
 *   1. QUEM  — a equipe do atendimento, que vem da produção (cirurgião,
 *              auxiliares, anestesista). O demonstrativo não traz isso.
 *
 *   2. COMO A CONTA FOI COBRADA — o "cenário". O mesmo procedimento paga
 *              percentuais diferentes conforme tenha sido cobrado item a item
 *              ou dentro de um pacote fechado:
 *
 *        CONTA_ABERTA             honorário cobrado à parte → 65% do honorário
 *        PACOTE_HONORARIO_FORA    pacote, mas honorário lançado separado → 65%
 *        PACOTE_HONORARIO_DENTRO  honorário embutido no pacote → 17% do pacote
 *                                 (cirurgião), 6% auxiliar, 6% anestesista;
 *                                 no IAMSPE, 21% / 9% / 0%
 *
 *      O cenário é deduzido do próprio demonstrativo — ver `detectarCenario`.
 *
 *   3. O PERCENTUAL DO PROCEDIMENTO — vem da tabela mestra da unidade
 *      (convênio × código TUSS), importada da planilha de regras.
 *
 * Regras que passam por cima de tudo isso:
 *   · SÓCIO — se um sócio aparece na conta, ele recebe seu percentual sobre o
 *     valor INTEGRAL da conta, não item a item.
 *   · CONVÊNIO SEM REPASSE — credenciado direto: o convênio paga o médico.
 *   · EXCEÇÃO DE EXECUÇÃO — quem aparece na conta não é quem executou.
 *
 * Princípio da casa: nada é estimado. A base é sempre o valor LIBERADO no
 * demonstrativo, e item glosado não gera repasse porque não houve pagamento.
 * O que não encontra regra não é descartado em silêncio — vai para a lista de
 * pendências da tela de Repasse.
 * ============================================================================
 */

const RepasseMotor = {

  CENARIOS: {
    CONTA_ABERTA: 'Conta aberta',
    PACOTE_HONORARIO_FORA: 'Pacote com honorário fora',
    PACOTE_HONORARIO_DENTRO: 'Pacote com honorário dentro',
  },

  PAPEIS: ['CIRURGIAO', 'AUXILIAR', 'ANESTESISTA'],

  // ==========================================================================

  /**
   * @param {object} filtros { competencia?, demonstrativoId?, incluirPendentes? }
   */
  calcular(filtros = {}) {
    const guias = this._guiasConciliadas(filtros);
    const cfg = this._carregarConfiguracao();

    const linhas = [];
    const alertas = [];

    for (const guia of guias) {
      const itens = Banco.query(
        'SELECT * FROM itens_demonstrativo WHERE guia_id = ? AND valor_liberado > 0 ORDER BY id',
        [guia.id]
      );
      if (!itens.length) continue;

      const cenario = guia.cenario_manual && guia.cenario
        ? guia.cenario
        : this.detectarCenario(itens);

      const equipe = this._equipe(guia, itens, cfg, alertas);
      const totalGuia = itens.reduce((a, i) => a + Number(i.valor_liberado || 0), 0);

      // ── Convênio de credenciado direto ───────────────────────────────────
      // Nesses convênios o próprio plano paga o profissional; o hospital só
      // repassa a lista de exceções acordada. Então nada é calculado por regra
      // geral aqui — pagam apenas os itens que tenham percentual explicitamente
      // cadastrado para esse convênio.
      const somenteExcecoes = this._semRepasse(guia.convenio, cfg);
      if (somenteExcecoes) {
        alertas.push({
          tipo: 'CONVENIO_SEM_REPASSE',
          guiaId: guia.id,
          paciente: guia.beneficiario,
          convenio: guia.convenio,
          texto: `${guia.beneficiario} (${guia.convenio}): credenciado direto — só entram os ` +
                 `procedimentos com percentual cadastrado para este convênio.`,
        });
      }

      const contexto = { guia, cenario, totalGuia, itens, cfg, somenteExcecoes };
      const jaPagos = new Set();

      // ── 1. Sócios: percentual sobre o valor integral da conta ────────────
      for (const membro of (somenteExcecoes ? [] : equipe)) {
        const regra = this.regraDoMedico(membro.nome, cfg);
        if (!regra) continue;

        linhas.push(this._linha(contexto, {
          medico: membro.nome,
          papel: membro.papel,
          base: totalGuia,
          percentual: regra.percentual,
          regra: `Sócio — ${Utilidades.formatarPercentual(regra.percentual)} do valor integral da conta`,
          origem: 'SOCIO',
          codigo: '',
          descricao: `Conta completa (${itens.length} ${itens.length === 1 ? 'item pago' : 'itens pagos'})`,
        }));
        jaPagos.add(membro.chave);
      }

      // ── 2. Demais profissionais: item a item ─────────────────────────────
      for (const item of itens) {
        if (!this._itemGeraHonorario(item, cenario)) continue;

        for (const membro of equipe) {
          if (jaPagos.has(membro.chave)) continue;

          const pct = this._percentual(item, membro.papel, contexto);

          // Em convênio de credenciado direto, item fora da lista de exceções
          // simplesmente não gera repasse — é o esperado, não uma pendência.
          if (pct === null && contexto.somenteExcecoes) continue;

          if (pct === null) {
            alertas.push({
              tipo: 'SEM_PERCENTUAL',
              guiaId: guia.id,
              paciente: guia.beneficiario,
              convenio: guia.convenio,
              codigo: item.codigo,
              descricao: item.descricao,
              valor: item.valor_liberado,
              texto: `Sem percentual cadastrado para ${guia.convenio} · código ${item.codigo}.`,
            });
            continue;
          }
          if (!pct) continue;   // 0% é regra válida: exame já incluso no pacote

          linhas.push(this._linha(contexto, {
            medico: membro.nome,
            papel: membro.papel,
            base: Number(item.valor_liberado || 0),
            percentual: pct,
            regra: this._nomeRegra(membro.papel, cenario, pct),
            origem: 'TABELA',
            codigo: item.codigo,
            descricao: item.descricao,
          }));
        }
      }
    }

    return {
      linhas,
      porMedico: this._agruparPorMedico(linhas),
      totais: this._totais(linhas, guias),
      alertas,
    };
  },

  // ==========================================================================
  // Cenário de cobrança
  // ==========================================================================

  /**
   * Deduz como a conta foi cobrada olhando os itens PAGOS.
   *
   * A leitura é a mesma que o setor faz a olho: se existe um pacote e nenhum
   * honorário avulso ao lado dele, o honorário está dentro do pacote. Se o
   * honorário aparece em linha própria, está fora. Sem pacote nenhum, é conta
   * aberta.
   */
  detectarCenario(itens) {
    const pagos = itens.filter(i => Number(i.valor_liberado) > 0);
    const temPacote     = pagos.some(i => i.tipo === 'PACOTE');
    const temHonorario  = pagos.some(i => i.tipo === 'PROCEDIMENTO');

    if (temPacote && temHonorario) return 'PACOTE_HONORARIO_FORA';
    if (temPacote)                 return 'PACOTE_HONORARIO_DENTRO';
    return 'CONTA_ABERTA';
  },

  /** Grava o cenário detectado (ou ajustado à mão) na guia. */
  definirCenario(guiaId, cenario, manual = true) {
    Banco.executar(
      'UPDATE guias_demonstrativo SET cenario = ?, cenario_manual = ? WHERE id = ?',
      [cenario, manual ? 1 : 0, guiaId]
    );
  },

  /**
   * Um item gera honorário médico?
   * Procedimento e pacote sim; material, medicamento, OPME e taxa são do
   * hospital. No pacote com honorário dentro, só o próprio pacote conta — os
   * itens avulsos ao lado dele já estão pagos por ele.
   */
  _itemGeraHonorario(item, cenario) {
    if (cenario === 'PACOTE_HONORARIO_DENTRO') return item.tipo === 'PACOTE';
    return item.tipo === 'PROCEDIMENTO' || item.tipo === 'PACOTE';
  },

  // ==========================================================================
  // Percentuais
  // ==========================================================================

  /**
   * Percentual de um profissional para um item.
   * Cirurgião: manda a tabela mestra (é ela que conhece cada procedimento).
   * Auxiliar e anestesista: dependem do cenário, não do procedimento.
   * Devolve null quando não há regra — o que vira pendência, nunca zero mudo.
   */
  _percentual(item, papel, contexto) {
    if (papel === 'CIRURGIAO') {
      const daTabela = this.percentualDaTabela(
        contexto.guia.convenio, item.codigo, item.descricao, contexto.cenario);
      if (daTabela !== null) return daTabela;
      if (contexto.somenteExcecoes) return null;
      // Sem o procedimento na tabela, o cenário ainda dá a regra do cirurgião
      // (é o caso dos pacotes, cujo percentual não varia por código).
      return this._percentualPapel('CIRURGIAO', contexto);
    }

    // Nos convênios de credenciado direto, o acordo de exceção cobre o
    // procedimento do executante. Estender isso a auxiliar e anestesista seria
    // criar repasse que ninguém acordou.
    if (contexto.somenteExcecoes) return null;

    return this._percentualPapel(papel, contexto);
  },

  /**
   * Consulta a tabela mestra (convênio × código TUSS).
   * Quando o mesmo código tem percentuais diferentes por cenário, escolhe o do
   * cenário da conta; sem essa marcação, o percentual é único.
   */
  percentualDaTabela(convenio, codigo, descricao, cenario) {
    const conv = this._normConvenio(convenio);
    const cod = String(codigo || '').trim();
    if (!conv || !cod) return null;

    const linhas = Banco.query(
      `SELECT percentual, cenario FROM tabela_percentuais
        WHERE convenio_norm = ? AND codigo = ?`, [conv, cod]);

    if (!linhas.length) return this._percentualPorDescricao(conv, descricao);

    const doCenario = linhas.find(l => l.cenario === cenario);
    if (doCenario) return Number(doCenario.percentual);

    const semCenario = linhas.find(l => !l.cenario);
    if (semCenario) return Number(semCenario.percentual);

    return Number(linhas[0].percentual);
  },

  /**
   * Alguns convênios cadastram a regra pela descrição, sem código (é o caso
   * dos pacotes cirúrgicos do SASSOM).
   */
  _percentualPorDescricao(convNorm, descricao) {
    const desc = Utilidades.normalizar(descricao);
    if (!desc) return null;

    const candidatas = Banco.query(
      `SELECT percentual, descricao_norm FROM tabela_percentuais
        WHERE convenio_norm = ? AND (codigo IS NULL OR codigo = '')`, [convNorm]);

    for (const c of candidatas) {
      if (c.descricao_norm && desc.includes(c.descricao_norm)) return Number(c.percentual);
    }
    return null;
  },

  /** Percentual do papel conforme o cenário (e o convênio, quando há exceção). */
  _percentualPapel(papel, contexto) {
    const conv = this._normConvenio(contexto.guia.convenio);
    const doCenario = contexto.cfg.regrasPapel.filter(
      r => r.cenario === contexto.cenario && r.papel === papel);

    // Exceção específica do convênio vence a regra geral.
    const especifica = doCenario.find(r => r.convenio && this._convenioBate(r.convenio, conv));
    if (especifica) return Number(especifica.percentual);

    const geral = doCenario.find(r => !r.convenio);
    return geral ? Number(geral.percentual) : null;
  },

  _nomeRegra(papel, cenario, pct) {
    const rotuloPapel = { CIRURGIAO: 'Cirurgião', AUXILIAR: 'Auxiliar', ANESTESISTA: 'Anestesista' }[papel] || papel;
    return `${rotuloPapel} · ${this.CENARIOS[cenario] || cenario} · ${Utilidades.formatarPercentual(pct)}`;
  },

  // ==========================================================================
  // Equipe
  // ==========================================================================

  /**
   * Monta a equipe da guia a partir da conciliação, aplicando as exceções em
   * que o profissional da conta não é quem executou.
   */
  _equipe(guia, itens, cfg, alertas) {
    const equipe = [];
    const juntar = (nome, papel) => {
      const limpo = String(nome || '').trim();
      if (!limpo) return;
      const chave = papel + '|' + Utilidades.normalizar(limpo);
      if (equipe.some(m => m.chave === chave)) return;
      equipe.push({ nome: limpo, papel, chave });
    };

    juntar(this._aplicarExcecao(guia, itens, guia.cirurgiao, cfg, alertas), 'CIRURGIAO');
    juntar(guia.auxiliar_1, 'AUXILIAR');
    juntar(guia.auxiliar_2, 'AUXILIAR');
    juntar(guia.anestesista, 'ANESTESISTA');

    if (!equipe.length) {
      alertas.push({
        tipo: 'SEM_EQUIPE',
        guiaId: guia.id,
        paciente: guia.beneficiario,
        texto: `${guia.beneficiario}: a produção não informou cirurgião para este atendimento.`,
      });
    }
    return equipe;
  },

  /**
   * Regra que segue a pessoa (sócio), localizada pelo nome.
   *
   * A comparação NÃO pode ser exata. O documento de regras traz o nome civil
   * completo ("NILTON CLAUDIO TOKUNAGA"), enquanto o sistema de produção grava
   * o nome de uso ("NILTON TOKUNAGA"). Exigindo igualdade literal, a regra do
   * sócio simplesmente não dispararia — e ele receberia o percentual comum em
   * vez do seu, silenciosamente.
   */
  regraDoMedico(nome, cfg) {
    const norm = Utilidades.normalizar(nome);
    if (!norm) return null;

    const exata = cfg.regrasMedico.get(norm);
    if (exata) return exata;

    for (const regra of cfg.regrasMedico.values()) {
      if (Utilidades.similaridadeNome(norm, regra.medico_norm) >= 0.9) return regra;
    }
    return null;
  },

  /**
   * Troca o executante quando há exceção cadastrada.
   * O caso conhecido: as OCTs do SASSOM saem na conta como do Dr. Nilton, mas
   * quem realiza é a Dra. Fernanda — repassar pelo nome da conta pagaria a
   * pessoa errada.
   */
  _aplicarExcecao(guia, itens, cirurgiao, cfg, alertas) {
    if (!cirurgiao) return cirurgiao;
    const nomeNorm = Utilidades.normalizar(cirurgiao);

    for (const ex of cfg.excecoes) {
      if (ex.convenio && !this._convenioBate(ex.convenio, this._normConvenio(guia.convenio))) continue;
      // Mesma tolerância de nome usada nas regras de sócio: os sistemas grafam
      // o nome do profissional de formas diferentes.
      if (Utilidades.similaridadeNome(ex.medico_conta, nomeNorm) < 0.9) continue;
      if (ex.codigo && !itens.some(i => String(i.codigo).trim() === String(ex.codigo).trim())) continue;

      alertas.push({
        tipo: 'EXCECAO_EXECUTANTE',
        guiaId: guia.id,
        paciente: guia.beneficiario,
        texto: `${guia.beneficiario}: repasse direcionado a ${ex.medico_real} ` +
               `(a conta traz ${ex.medico_conta}). ${ex.observacao || ''}`.trim(),
      });
      return ex.medico_real;
    }
    return cirurgiao;
  },

  // ==========================================================================

  _linha(contexto, dados) {
    const valor = dados.base * (dados.percentual / 100);
    return {
      guiaId: contexto.guia.id,
      competencia: contexto.guia.competencia,
      convenio: contexto.guia.convenio,
      demonstrativo: contexto.guia.demonstrativo_numero,
      guia: contexto.guia.numero_guia_prestador,
      paciente: contexto.guia.beneficiario,
      data: contexto.guia.data_atendimento,
      cenario: contexto.cenario,
      cenarioRotulo: this.CENARIOS[contexto.cenario] || contexto.cenario,
      codigo: dados.codigo,
      descricao: dados.descricao,
      papel: dados.papel,
      medico: dados.medico,
      base: dados.base,
      percentual: dados.percentual,
      regra: dados.regra,
      origem: dados.origem,
      repasse: Math.round(valor * 100) / 100,
      totalGuia: contexto.totalGuia,
      statusConciliacao: contexto.guia.status_conciliacao,
    };
  },

  _agruparPorMedico(linhas) {
    const mapa = new Map();
    for (const l of linhas) {
      const chave = Utilidades.normalizar(l.medico);
      let m = mapa.get(chave);
      if (!m) {
        m = { medico: l.medico, itens: 0, pacientes: new Set(), repasse: 0, porPapel: {} };
        mapa.set(chave, m);
      }
      m.itens++;
      m.pacientes.add(l.paciente);
      m.repasse += l.repasse;
      m.porPapel[l.papel] = (m.porPapel[l.papel] || 0) + l.repasse;
    }
    return Array.from(mapa.values())
      .map(m => ({ ...m, pacientes: m.pacientes.size }))
      .sort((a, b) => b.repasse - a.repasse);
  },

  _totais(linhas, guias) {
    const repasse = linhas.reduce((a, l) => a + l.repasse, 0);
    const pago = guias.reduce((a, g) => a + Number(g.total_liberado || 0), 0);
    return {
      guias: guias.length,
      linhas: linhas.length,
      medicos: new Set(linhas.map(l => Utilidades.normalizar(l.medico))).size,
      totalPago: pago,
      totalRepasse: repasse,
      percentualMedio: pago ? (repasse / pago) * 100 : 0,
      retidoHospital: pago - repasse,
    };
  },

  // ==========================================================================

  _guiasConciliadas(filtros) {
    const where = ["c.status IN ('AUTOMATICO','CONFIRMADO'" +
                   (filtros.incluirPendentes ? ",'PENDENTE'" : '') + ')'];
    const params = [];
    if (filtros.competencia)     { where.push('g.competencia = ?'); params.push(filtros.competencia); }
    if (filtros.demonstrativoId) { where.push('d.id = ?'); params.push(filtros.demonstrativoId); }

    return Banco.query(`
      SELECT g.*, d.convenio, d.numero AS demonstrativo_numero,
             c.status AS status_conciliacao, c.cirurgiao, c.auxiliar_1,
             c.auxiliar_2, c.anestesista, c.producao_id
        FROM guias_demonstrativo g
        JOIN demonstrativos d ON d.id = g.demonstrativo_id
        JOIN conciliacoes c   ON c.guia_id = g.id
       WHERE ${where.join(' AND ')}
       ORDER BY g.competencia, g.beneficiario
    `, params);
  },

  _carregarConfiguracao() {
    const regrasMedico = new Map();
    for (const r of Banco.query('SELECT * FROM regras_medico WHERE ativa = 1')) {
      regrasMedico.set(r.medico_norm, r);
    }
    return {
      regrasPapel: Banco.query('SELECT * FROM regras_papel'),
      regrasMedico,
      excecoes: Banco.query('SELECT * FROM excecoes_execucao WHERE ativa = 1'),
      semRepasse: Banco.query('SELECT * FROM convenios_sem_repasse'),
    };
  },

  _semRepasse(convenio, cfg) {
    const conv = this._normConvenio(convenio);
    return cfg.semRepasse.some(c => this._convenioBate(c.convenio_norm, conv));
  },

  /**
   * Nome do convênio reduzido à forma comparável.
   * A produção escreve "CASSI (HORP)", o demonstrativo escreve "CASSI" e a
   * planilha de regras escreve "CASSI" — o sufixo da unidade é ruído.
   */
  _normConvenio(nome) {
    return Utilidades.normalizar(String(nome || '').replace(/\(.*?\)/g, ''));
  },

  _convenioBate(a, b) {
    const x = this._normConvenio(a);
    const y = this._normConvenio(b);
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  },
};

window.RepasseMotor = RepasseMotor;
