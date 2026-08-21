/**
 * ============================================================================
 * CONCILIAÇÃO — liga o PAGAMENTO à PRODUÇÃO pelo nome do paciente
 *
 * É o miolo da ferramenta desta unidade. Como aqui não existe setor de
 * quitação, o demonstrativo do convênio é a única prova de pagamento, e ele
 * não diz quem operou — diz apenas o nome do beneficiário. Quem sabe o médico
 * é o relatório de produção. Casar os dois é o que torna o repasse possível.
 *
 * O casamento NÃO é só comparar texto. Nome de paciente se repete, vem
 * abreviado e vem grafado diferente nos dois sistemas. Então cada candidato é
 * pontuado por vários sinais independentes:
 *
 *   guia   — número da guia do prestador bate: prova documental, decide sozinho
 *   carteira — número da carteirinha bate: idem
 *   nome   — semelhança entre os nomes (comparação por token, não por letra)
 *   data   — proximidade entre a data do item pago e a do atendimento
 *   convênio — o convênio da produção é o do demonstrativo
 *
 * O resultado é classificado em três situações, e só a primeira dispensa
 * conferência humana:
 *
 *   AUTOMATICO          casamento forte e sem concorrente à altura
 *   PENDENTE            há candidato, mas fraco ou empatado → tela de revisão
 *   SEM_CORRESPONDENCIA nada parecido na produção → tela de revisão
 *
 * A régua é deliberadamente conservadora: repassar para o médico errado custa
 * mais caro do que pedir uma conferência a mais.
 * ============================================================================
 */

const Conciliacao = {

  /** A partir daqui um casamento é aceito sem conferência humana. */
  LIMIAR_AUTOMATICO: 0.90,

  /** Vantagem mínima sobre o 2º colocado para não ser considerado empate. */
  MARGEM_MINIMA: 0.08,

  /** Abaixo disto o candidato nem é mostrado como sugestão. */
  LIMIAR_SUGESTAO: 0.55,

  /** Janela de datas (em dias) dentro da qual o atendimento ainda é plausível. */
  JANELA_DIAS: 120,

  // ==========================================================================

  /**
   * Concilia as guias e grava o resultado.
   * @param {object} opts { demonstrativoId?, refazerConfirmados? }
   */
  executar(opts = {}) {
    const guias = this._guiasParaConciliar(opts);
    const indice = this._indexarProducao();
    const dePara = this._carregarDePara();

    const resumo = {
      total: guias.length,
      automatico: 0,
      pendente: 0,
      semCorrespondencia: 0,
      preservados: 0,
    };

    Banco.emTransacao(() => {
      for (const guia of guias) {
        const atual = Banco.queryUnica(
          'SELECT status FROM conciliacoes WHERE guia_id = ?', [guia.id]);

        // Decisão humana não é sobrescrita por um novo processamento.
        if (atual && (atual.status === 'CONFIRMADO' || atual.status === 'IGNORADO')
            && !opts.refazerConfirmados) {
          resumo.preservados++;
          continue;
        }

        const r = this.avaliarGuia(guia, indice, dePara);

        const e = r.escolhido;
        Banco.db.run(
          `INSERT INTO conciliacoes
             (guia_id, producao_id, cod_admissao, status, score, motivo, candidatos,
              cirurgiao, auxiliar_1, auxiliar_2, anestesista, decidido_em)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(guia_id) DO UPDATE SET
             producao_id  = excluded.producao_id,
             cod_admissao = excluded.cod_admissao,
             status       = excluded.status,
             score        = excluded.score,
             motivo       = excluded.motivo,
             candidatos   = excluded.candidatos,
             cirurgiao    = excluded.cirurgiao,
             auxiliar_1   = excluded.auxiliar_1,
             auxiliar_2   = excluded.auxiliar_2,
             anestesista  = excluded.anestesista,
             decidido_em  = excluded.decidido_em`,
          [
            guia.id,
            e ? e.producao_id : null,
            e ? e.cod_admissao : null,
            r.status,
            r.score,
            r.motivo,
            JSON.stringify(r.candidatos.slice(0, 6)),
            e ? e.cirurgiao : null,
            e ? e.auxiliar_1 : null,
            e ? e.auxiliar_2 : null,
            e ? e.anestesista : null,
            new Date().toISOString(),
          ]
        );

        if (r.status === 'AUTOMATICO') resumo.automatico++;
        else if (r.status === 'PENDENTE') resumo.pendente++;
        else resumo.semCorrespondencia++;
      }
    });

    Banco.salvar({ imediato: true });
    return resumo;
  },

  /**
   * Avalia UMA guia contra a produção. Função pura em relação ao banco
   * (recebe o índice pronto), o que a torna fácil de testar.
   */
  avaliarGuia(guia, indice, dePara) {
    // Uma correção de nome já feita pelo operador vale como nome oficial.
    const nomeBusca = dePara[guia.beneficiario_norm] || guia.beneficiario_norm;

    const candidatos = [];
    for (const atendimento of this._candidatosDe(nomeBusca, indice)) {
      const aval = this._pontuar(guia, atendimento, nomeBusca);
      if (aval.score >= this.LIMIAR_SUGESTAO) candidatos.push(aval);
    }

    candidatos.sort((a, b) => b.score - a.score);

    if (!candidatos.length) {
      return {
        status: 'SEM_CORRESPONDENCIA',
        score: 0,
        motivo: 'Nenhum paciente parecido no relatório de produção.',
        candidatos: [],
        escolhido: null,
      };
    }

    const melhor = candidatos[0];
    const segundo = candidatos[1];
    const margem = segundo ? melhor.score - segundo.score : 1;
    const aceitar = (motivo) => ({
      status: 'AUTOMATICO', score: melhor.score, motivo, candidatos, escolhido: melhor,
    });

    // Prova documental (guia ou carteira) dispensa a análise de margem: mesmo
    // que dois pacientes se chamem igual, o número não mente.
    if (melhor.provaDocumental) return aceitar(melhor.motivo);

    // Data exata e única.
    //
    // Pacientes crônicos voltam muitas vezes ao mesmo hospital — injeções
    // mensais, retornos, o mesmo procedimento no outro olho. Cada retorno vira
    // um candidato com nome idêntico, e olhar só a diferença de pontuação faria
    // a ferramenta pedir conferência para praticamente todo paciente recorrente.
    // A data de realização que o convênio imprime é a data do atendimento: se um
    // único candidato bate exatamente nela, ele é o atendimento — os outros são
    // as demais idas do paciente ao hospital.
    const comDataExata = candidatos.filter(c => c.dias === 0);
    if (melhor.dias === 0 && comDataExata.length === 1 && melhor.simNome >= 0.9) {
      return aceitar(melhor.motivo);
    }

    if (melhor.score >= this.LIMIAR_AUTOMATICO && margem >= this.MARGEM_MINIMA) {
      return aceitar(melhor.motivo);
    }

    // Empate que não muda o resultado.
    //
    // Quando os candidatos empatados são do mesmo paciente e têm a MESMA equipe
    // — o que é a regra nos retornos, atendidos sempre pelo mesmo médico — o
    // repasse sai igual seja qual for o escolhido. Pedir conferência aqui seria
    // gastar o tempo do operador para decidir algo que não altera um centavo.
    const empatados = candidatos.filter(c => melhor.score - c.score < this.MARGEM_MINIMA);
    if (empatados.length > 1 && this._mesmaEquipe(empatados)) {
      return aceitar(
        `${melhor.motivo}. Havia ${empatados.length} atendimentos igualmente prováveis do mesmo ` +
        `paciente, todos com a mesma equipe — o repasse é o mesmo em qualquer um deles.`);
    }

    const motivo = margem < this.MARGEM_MINIMA
      ? `Atendimentos igualmente prováveis com equipes diferentes ` +
        `(${melhor.cirurgiao || 'sem cirurgião'} em ${Utilidades.dataBR(melhor.data_atendimento)} × ` +
        `${segundo.cirurgiao || 'sem cirurgião'} em ${Utilidades.dataBR(segundo.data_atendimento)}) — ` +
        `escolher errado paga o médico errado.`
      : `Semelhança insuficiente para casar sozinho (${Math.round(melhor.score * 100)}%).`;

    return { status: 'PENDENTE', score: melhor.score, motivo, candidatos, escolhido: null };
  },

  /** Todos os candidatos têm a mesma equipe? */
  _mesmaEquipe(candidatos) {
    const chave = (c) => [c.cirurgiao, c.auxiliar_1, c.auxiliar_2, c.anestesista]
      .map(n => Utilidades.normalizar(n)).join('|');
    const primeira = chave(candidatos[0]);
    if (!Utilidades.normalizar(candidatos[0].cirurgiao)) return false;  // sem equipe não há equivalência
    return candidatos.every(c => chave(c) === primeira);
  },

  // ==========================================================================
  // Pontuação
  // ==========================================================================

  _pontuar(guia, atendimento, nomeBusca) {
    const simNome = Utilidades.similaridadeNome(nomeBusca, atendimento.paciente_norm);

    const guiaBate = !!(guia.numero_guia_prestador && atendimento.guias
      && atendimento.guias.includes(String(guia.numero_guia_prestador).trim()));

    const carteiraBate = !!(guia.carteira && atendimento.carteiras
      && atendimento.carteiras.includes(this._soDigitos(guia.carteira)));

    const dias = Utilidades.diasEntre(guia.data_atendimento, atendimento.data_atendimento);
    const mesmaData = dias === 0;
    const dentroJanela = dias === null || dias <= this.JANELA_DIAS;

    const convenioBate = this._convenioCompativel(guia.convenio, atendimento.convenio);

    // Peso base: o nome responde pela maior parte, os demais sinais confirmam.
    let score = simNome * 0.72;

    // A data separa um atendimento do outro quando o paciente é o mesmo. Por
    // isso a data exata vale bem mais do que "quase a mesma data": um retorno
    // três dias depois é outro atendimento, com outra conta.
    if (mesmaData)            score += 0.20;
    else if (dias <= 3)       score += 0.08;
    else if (dias <= 30)      score += 0.03;
    else if (dentroJanela)    score += 0;
    else                      score -= 0.20;   // fora da janela: outro atendimento

    if (convenioBate === true)  score += 0.10;
    if (convenioBate === false) score -= 0.12;

    const motivos = [];
    if (guiaBate)     motivos.push('número da guia idêntico');
    if (carteiraBate) motivos.push('carteirinha idêntica');
    motivos.push(simNome === 1 ? 'nome idêntico' : `nome ${Math.round(simNome * 100)}% semelhante`);
    if (mesmaData) motivos.push('mesma data');
    else if (dias !== null) motivos.push(`${dias} dia(s) de diferença`);
    if (convenioBate === true) motivos.push('mesmo convênio');

    const provaDocumental = (guiaBate || carteiraBate) && simNome >= 0.6;
    if (provaDocumental) score = Math.max(score, 0.97);

    return {
      producao_id: atendimento.producao_id,
      cod_admissao: atendimento.cod_admissao,
      paciente: atendimento.paciente,
      paciente_norm: atendimento.paciente_norm,
      cirurgiao: atendimento.cirurgiao,
      auxiliar_1: atendimento.auxiliar_1,
      auxiliar_2: atendimento.auxiliar_2,
      anestesista: atendimento.anestesista,
      medico: atendimento.cirurgiao,
      procedimento: atendimento.procedimento,
      convenio: atendimento.convenio,
      data_atendimento: atendimento.data_atendimento,
      simNome,
      dias,
      provaDocumental,
      score: Math.max(0, Math.min(1, score)),
      motivo: motivos.join(' · '),
    };
  },

  /**
   * Compara convênios de origens diferentes.
   * Devolve true (compatível), false (claramente diferente) ou null (não dá
   * para afirmar) — o "não sei" existe para não punir produção sem convênio.
   */
  _convenioCompativel(convenioDemonstrativo, convenioProducao) {
    const a = Utilidades.normalizar(convenioDemonstrativo);
    const b = Utilidades.normalizar(convenioProducao);
    if (!a || !b) return null;
    if (a === b) return true;
    // "CASSI" x "CASSI (SP)" — um contém o outro.
    if (a.includes(b) || b.includes(a)) return true;
    const primeiroA = a.split(' ')[0];
    const primeiroB = b.split(' ')[0];
    if (primeiroA && primeiroA === primeiroB) return true;
    return false;
  },

  _soDigitos(v) {
    return String(v || '').replace(/\D/g, '');
  },

  // ==========================================================================
  // Índice da produção
  // ==========================================================================

  /**
   * Agrupa a produção por ATENDIMENTO (não por linha).
   *
   * Um mesmo atendimento aparece em várias linhas do relatório — uma por
   * procedimento, material ou taxa. Comparar guia contra linha faria o mesmo
   * paciente concorrer consigo mesmo dezenas de vezes e transformaria todo
   * casamento em "empate". Por isso o índice trabalha no nível do atendimento.
   *
   * Os nomes ficam em "gavetas" (primeiro nome e último nome) para que cada
   * guia compare-se apenas com quem tem chance real de ser, em vez de varrer
   * o relatório inteiro.
   */
  _indexarProducao() {
    const linhas = Banco.query(`
      SELECT id, cod_admissao, data_atendimento, paciente, paciente_norm, carteira,
             guia, convenio, procedimento, medico, cirurgiao, auxiliar_1, auxiliar_2,
             anestesista, profissional_admissao, indicante, solicitante,
             especialidade, valor
        FROM linhas_producao
       WHERE paciente_norm IS NOT NULL AND paciente_norm <> ''
    `);

    const atendimentos = new Map();

    for (const l of linhas) {
      // Sem código de admissão, o atendimento é identificado por paciente+data.
      const chave = l.cod_admissao
        ? `A:${l.cod_admissao}`
        : `P:${l.paciente_norm}|${l.data_atendimento || ''}`;

      let a = atendimentos.get(chave);
      if (!a) {
        a = {
          chave,
          producao_id: l.id,
          cod_admissao: l.cod_admissao,
          data_atendimento: l.data_atendimento,
          paciente: l.paciente,
          paciente_norm: l.paciente_norm,
          convenio: l.convenio,
          cirurgiao: null,
          auxiliar_1: null,
          auxiliar_2: null,
          anestesista: null,
          procedimento: l.procedimento,
          guias: [],
          carteiras: [],
          valor: 0,
        };
        atendimentos.set(chave, a);
      }

      if (l.guia && !a.guias.includes(String(l.guia).trim())) a.guias.push(String(l.guia).trim());
      const cart = this._soDigitos(l.carteira);
      if (cart && !a.carteiras.includes(cart)) a.carteiras.push(cart);
      a.valor += Number(l.valor || 0);

      // O atendimento aparece em muitas linhas (procedimento, materiais, taxas)
      // e nem todas trazem a equipe preenchida — a linha do material costuma vir
      // sem cirurgião. Por isso a equipe é montada a partir da PRIMEIRA linha que
      // informar cada papel, em vez de sair da linha que por acaso veio primeiro.
      if (!a.cirurgiao)   a.cirurgiao   = ImportadorProducao.medicoResponsavel(l);
      if (!a.auxiliar_1)  a.auxiliar_1  = l.auxiliar_1;
      if (!a.auxiliar_2)  a.auxiliar_2  = l.auxiliar_2;
      if (!a.anestesista) a.anestesista = l.anestesista;
      if (!a.procedimento && l.procedimento) a.procedimento = l.procedimento;
      if (!a.convenio && l.convenio) a.convenio = l.convenio;
      if (!a.data_atendimento && l.data_atendimento) a.data_atendimento = l.data_atendimento;
    }

    const lista = Array.from(atendimentos.values());
    const porToken = new Map();
    const guardar = (token, at) => {
      if (!token) return;
      if (!porToken.has(token)) porToken.set(token, []);
      porToken.get(token).push(at);
    };

    for (const at of lista) {
      const tokens = Utilidades.tokensNome(at.paciente_norm);
      if (!tokens.length) continue;
      guardar(tokens[0].slice(0, 3), at);                      // início do 1º nome
      guardar('Z' + tokens[tokens.length - 1].slice(0, 4), at); // último sobrenome
    }

    return { lista, porToken };
  },

  /** Candidatos plausíveis para um nome, usando as gavetas do índice. */
  _candidatosDe(nomeNorm, indice) {
    const tokens = Utilidades.tokensNome(nomeNorm);
    if (!tokens.length) return [];

    const vistos = new Set();
    const saida = [];
    const juntar = (lista) => {
      for (const at of (lista || [])) {
        if (vistos.has(at.chave)) continue;
        vistos.add(at.chave);
        saida.push(at);
      }
    };

    juntar(indice.porToken.get(tokens[0].slice(0, 3)));
    juntar(indice.porToken.get('Z' + tokens[tokens.length - 1].slice(0, 4)));

    // Nome muito curto ou fora do padrão: vale varrer tudo, é raro e barato.
    if (!saida.length && indice.lista.length <= 20000) return indice.lista;
    return saida;
  },

  _carregarDePara() {
    const mapa = {};
    for (const l of Banco.query('SELECT nome_demo_norm, nome_producao_norm FROM de_para_pacientes')) {
      if (l.nome_demo_norm) mapa[l.nome_demo_norm] = l.nome_producao_norm;
    }
    return mapa;
  },

  _guiasParaConciliar(opts) {
    const where = [];
    const params = [];
    if (opts.demonstrativoId) {
      where.push('g.demonstrativo_id = ?');
      params.push(opts.demonstrativoId);
    }
    return Banco.query(`
      SELECT g.*, d.convenio, d.operadora
        FROM guias_demonstrativo g
        JOIN demonstrativos d ON d.id = g.demonstrativo_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY g.id
    `, params);
  },

  // ==========================================================================
  // Decisões manuais (tela de revisão)
  // ==========================================================================

  /**
   * Confirma manualmente qual atendimento pertence a esta guia.
   * @param {boolean} aprender grava o de/para de nomes para as próximas vezes
   */
  confirmar(guiaId, producaoId, aprender = true) {
    const prod = Banco.queryUnica('SELECT * FROM linhas_producao WHERE id = ?', [producaoId]);
    if (!prod) throw new Error('Linha de produção não encontrada.');

    // A equipe vem do ATENDIMENTO inteiro, não só da linha escolhida: a linha
    // clicada pode ser a de um material, que não traz cirurgião.
    const equipe = this._equipeDoAtendimento(prod);

    Banco.executar(
      `INSERT INTO conciliacoes
         (guia_id, producao_id, cod_admissao, status, score, motivo,
          cirurgiao, auxiliar_1, auxiliar_2, anestesista, decidido_em)
       VALUES (?,?,?,'CONFIRMADO',1,?,?,?,?,?,?)
       ON CONFLICT(guia_id) DO UPDATE SET
         producao_id = excluded.producao_id, cod_admissao = excluded.cod_admissao,
         status = 'CONFIRMADO', score = 1, motivo = excluded.motivo,
         cirurgiao = excluded.cirurgiao, auxiliar_1 = excluded.auxiliar_1,
         auxiliar_2 = excluded.auxiliar_2, anestesista = excluded.anestesista,
         decidido_em = excluded.decidido_em`,
      [guiaId, producaoId, prod.cod_admissao || null, 'Confirmado manualmente.',
       equipe.cirurgiao, equipe.auxiliar_1, equipe.auxiliar_2, equipe.anestesista,
       new Date().toISOString()]
    );

    if (aprender) {
      const guia = Banco.queryUnica('SELECT * FROM guias_demonstrativo WHERE id = ?', [guiaId]);
      if (guia && guia.beneficiario_norm && guia.beneficiario_norm !== prod.paciente_norm) {
        this.aprenderDePara(guia.beneficiario, prod.paciente);
      }
    }
  },

  /**
   * Equipe de um atendimento, varrendo todas as linhas dele.
   * Materiais e taxas entram no relatório sem equipe preenchida; olhar uma
   * linha só deixaria o repasse sem cirurgião.
   */
  _equipeDoAtendimento(prod) {
    const linhas = prod.cod_admissao
      ? Banco.query('SELECT * FROM linhas_producao WHERE cod_admissao = ?', [prod.cod_admissao])
      : [prod];

    const equipe = { cirurgiao: null, auxiliar_1: null, auxiliar_2: null, anestesista: null };
    for (const l of linhas) {
      if (!equipe.cirurgiao)   equipe.cirurgiao   = ImportadorProducao.medicoResponsavel(l);
      if (!equipe.auxiliar_1)  equipe.auxiliar_1  = l.auxiliar_1;
      if (!equipe.auxiliar_2)  equipe.auxiliar_2  = l.auxiliar_2;
      if (!equipe.anestesista) equipe.anestesista = l.anestesista;
    }
    return equipe;
  },

  /** Ajusta a equipe à mão, quando a produção não bate com o que aconteceu. */
  definirEquipe(guiaId, equipe) {
    Banco.executar(
      `UPDATE conciliacoes
          SET cirurgiao = ?, auxiliar_1 = ?, auxiliar_2 = ?, anestesista = ?,
              equipe_manual = 1, decidido_em = ?
        WHERE guia_id = ?`,
      [equipe.cirurgiao || null, equipe.auxiliar_1 || null, equipe.auxiliar_2 || null,
       equipe.anestesista || null, new Date().toISOString(), guiaId]
    );
  },

  /** Registra que dois nomes diferentes são a mesma pessoa. */
  aprenderDePara(nomeDemonstrativo, nomeProducao) {
    Banco.executar(
      `INSERT INTO de_para_pacientes
         (nome_demonstrativo, nome_demo_norm, nome_producao, nome_producao_norm, criado_em)
       VALUES (?,?,?,?,?)
       ON CONFLICT(nome_demo_norm) DO UPDATE SET
         nome_producao = excluded.nome_producao,
         nome_producao_norm = excluded.nome_producao_norm`,
      [
        nomeDemonstrativo, Utilidades.normalizar(nomeDemonstrativo),
        nomeProducao, Utilidades.normalizar(nomeProducao),
        new Date().toISOString(),
      ]
    );
  },

  /** Marca a guia como sem correspondência na produção (decisão do operador). */
  marcarSemCorrespondencia(guiaId, observacao) {
    Banco.executar(
      `INSERT INTO conciliacoes (guia_id, status, score, motivo, decidido_em)
       VALUES (?,'SEM_CORRESPONDENCIA',0,?,?)
       ON CONFLICT(guia_id) DO UPDATE SET
         status='SEM_CORRESPONDENCIA', producao_id=NULL, cirurgiao=NULL,
         auxiliar_1=NULL, auxiliar_2=NULL, anestesista=NULL,
         motivo=excluded.motivo, decidido_em=excluded.decidido_em`,
      [guiaId, observacao || 'Marcado manualmente: sem correspondência.', new Date().toISOString()]
    );
  },

  /** Tira a guia do repasse (ex.: paciente que não gera repasse médico). */
  ignorar(guiaId, observacao) {
    Banco.executar(
      `INSERT INTO conciliacoes (guia_id, status, score, motivo, decidido_em)
       VALUES (?,'IGNORADO',0,?,?)
       ON CONFLICT(guia_id) DO UPDATE SET
         status='IGNORADO', motivo=excluded.motivo, decidido_em=excluded.decidido_em`,
      [guiaId, observacao || 'Ignorado manualmente.', new Date().toISOString()]
    );
  },

  /** Devolve a guia para a fila de revisão. */
  reabrir(guiaId) {
    Banco.executar(
      `UPDATE conciliacoes SET status='PENDENTE', decidido_em=? WHERE guia_id=?`,
      [new Date().toISOString(), guiaId]
    );
  },

  /** Números para o painel e para a tela de revisão. */
  estatisticas(demonstrativoId) {
    const filtro = demonstrativoId ? 'WHERE g.demonstrativo_id = ?' : '';
    const params = demonstrativoId ? [demonstrativoId] : [];
    const linhas = Banco.query(`
      SELECT COALESCE(c.status, 'NAO_PROCESSADO') AS status,
             COUNT(*) AS qtd,
             SUM(g.total_liberado) AS liberado
        FROM guias_demonstrativo g
        LEFT JOIN conciliacoes c ON c.guia_id = g.id
        ${filtro}
       GROUP BY COALESCE(c.status, 'NAO_PROCESSADO')
    `, params);

    const r = { total: 0, totalLiberado: 0, porStatus: {} };
    for (const l of linhas) {
      r.porStatus[l.status] = { qtd: Number(l.qtd), liberado: Number(l.liberado || 0) };
      r.total += Number(l.qtd);
      r.totalLiberado += Number(l.liberado || 0);
    }
    return r;
  },
};

window.Conciliacao = Conciliacao;
