/**
 * ============================================================================
 * TELA: Revisão de casamentos
 *
 * A fila de trabalho do setor. Cada cartão é uma guia paga que a ferramenta não
 * conseguiu casar com segurança: ou o nome do paciente diverge, ou há mais de
 * um atendimento igualmente provável, ou ele não está na produção.
 *
 * A decisão é sempre de uma pessoa. O que a ferramenta faz é preparar o
 * terreno: mostra os candidatos ordenados, explica por que cada um pontuou o
 * que pontuou e guarda a correção de nome para que a mesma pergunta não volte
 * no mês seguinte.
 * ============================================================================
 */

App.telas['conciliacao'] = function () {
  const filtro = App.telas['conciliacao']._filtro || 'PENDENTES';

  const condicao = {
    PENDENTES: "COALESCE(c.status,'NAO_PROCESSADO') IN ('PENDENTE','SEM_CORRESPONDENCIA','NAO_PROCESSADO')",
    CASADAS:   "c.status IN ('AUTOMATICO','CONFIRMADO')",
    IGNORADAS: "c.status = 'IGNORADO'",
    TODAS:     '1=1',
  }[filtro];

  const guias = Banco.query(`
    SELECT g.*, d.convenio, d.numero AS demo_numero,
           COALESCE(c.status,'NAO_PROCESSADO') AS status,
           c.score, c.motivo, c.candidatos, c.cirurgiao, c.auxiliar_1,
           c.auxiliar_2, c.anestesista, c.producao_id
      FROM guias_demonstrativo g
      JOIN demonstrativos d ON d.id = g.demonstrativo_id
      LEFT JOIN conciliacoes c ON c.guia_id = g.id
     WHERE ${condicao}
     ORDER BY g.total_liberado DESC
     LIMIT 200
  `);

  const stats = Conciliacao.estatisticas();
  const cont = (s) => stats.porStatus[s]?.qtd || 0;

  App.alvoConteudo().innerHTML = `
    <div class="page-content">
      ${App.cabecalho('Revisão de casamentos',
        'Guias pagas que precisam de uma decisão humana antes de virar repasse',
        `<button class="btn" id="cn-reprocessar">Reprocessar tudo</button>`)}

      <div class="rp-kpis">
        ${App.kpi('Casadas', String(cont('AUTOMATICO') + cont('CONFIRMADO')),
                  'prontas para o repasse', 'ok')}
        ${App.kpi('A conferir', String(cont('PENDENTE') + cont('NAO_PROCESSADO')),
                  'candidato fraco ou empate',
                  cont('PENDENTE') + cont('NAO_PROCESSADO') ? 'alerta' : '')}
        ${App.kpi('Sem correspondência', String(cont('SEM_CORRESPONDENCIA')),
                  'paciente não achado na produção',
                  cont('SEM_CORRESPONDENCIA') ? 'perigo' : '')}
        ${App.kpi('Fora do repasse', String(cont('IGNORADO')), 'marcadas para ignorar')}
      </div>

      <div class="rp-filtros">
        <label>Mostrar:</label>
        ${['PENDENTES', 'CASADAS', 'IGNORADAS', 'TODAS'].map(f => `
          <button class="btn ${filtro === f ? 'btn-primary' : ''}" data-filtro="${f}"
                  style="padding:5px 12px">${f.charAt(0) + f.slice(1).toLowerCase()}</button>
        `).join('')}
      </div>

      <div id="cn-lista">
        ${guias.length ? guias.map(cartao).join('')
          : App.vazio('Nada nesta lista',
              filtro === 'PENDENTES'
                ? 'Todas as guias pagas já estão casadas com a produção.'
                : 'Nenhuma guia neste filtro.')}
      </div>
    </div>
  `;

  ligarEventos();

  // ==========================================================================

  function cartao(g) {
    let candidatos = [];
    try { candidatos = JSON.parse(g.candidatos || '[]'); } catch (_) {}

    const casada = g.status === 'AUTOMATICO' || g.status === 'CONFIRMADO';
    const tag = {
      AUTOMATICO:          ['ok', 'Casada automaticamente'],
      CONFIRMADO:          ['ok', 'Confirmada por você'],
      PENDENTE:            ['alerta', 'Precisa conferir'],
      SEM_CORRESPONDENCIA: ['perigo', 'Sem correspondência'],
      NAO_PROCESSADO:      ['neutro', 'Não processada'],
      IGNORADO:            ['neutro', 'Fora do repasse'],
    }[g.status] || ['neutro', g.status];

    return `
      <div class="rp-caso" data-guia="${g.id}">
        <div class="rp-caso-topo">
          <div>
            <div class="rp-caso-pac">${Utilidades.esc(g.beneficiario)}</div>
            <div class="rp-caso-meta">
              ${Utilidades.esc(g.convenio)} · guia ${Utilidades.esc(g.numero_guia_prestador)} ·
              atendimento em ${Utilidades.dataBR(g.data_atendimento) || '—'} ·
              carteira ${Utilidades.esc(g.carteira || '—')}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--font-mono);font-size:17px;font-weight:600">
              ${Utilidades.formatarMoeda(g.total_liberado)}
            </div>
            <span class="rp-tag ${tag[0]}">${tag[1]}</span>
          </div>
        </div>

        <div class="rp-caso-corpo">
          ${casada ? `
            <div class="rp-aviso ok">
              Equipe: <strong>${Utilidades.esc(g.cirurgiao || 'sem cirurgião')}</strong>
              ${g.auxiliar_1 ? ` · auxiliar ${Utilidades.esc(g.auxiliar_1)}` : ''}
              ${g.auxiliar_2 ? ` · auxiliar ${Utilidades.esc(g.auxiliar_2)}` : ''}
              ${g.anestesista ? ` · anestesista ${Utilidades.esc(g.anestesista)}` : ''}
              <br><span class="small">${Utilidades.esc(g.motivo || '')}</span>
            </div>
            <button class="btn" data-reabrir="${g.id}" style="padding:4px 12px">Rever este casamento</button>
          ` : `
            ${g.motivo ? `<div class="rp-caso-motivo">${Utilidades.esc(g.motivo)}</div>` : ''}

            ${candidatos.length ? `
              <div class="small muted" style="margin-bottom:8px">
                Atendimentos parecidos na produção — escolha o correto:
              </div>
              ${candidatos.map(c => `
                <div class="rp-cand">
                  <div class="rp-cand-info">
                    <div class="rp-cand-nome">${Utilidades.esc(c.paciente)}</div>
                    <div class="rp-cand-det">
                      ${Utilidades.esc(c.cirurgiao || 'sem cirurgião')} ·
                      ${Utilidades.dataBR(c.data_atendimento) || 'sem data'} ·
                      ${Utilidades.esc(c.convenio || 'convênio não informado')}<br>
                      ${Utilidades.esc(c.procedimento || '')}<br>
                      <span class="muted">${Utilidades.esc(c.motivo || '')}</span>
                    </div>
                  </div>
                  <div style="text-align:right">
                    <div class="rp-cand-score">${Math.round((c.score || 0) * 100)}%</div>
                    <button class="btn btn-primary" data-confirmar="${g.id}"
                            data-producao="${c.producao_id}" style="padding:4px 12px;margin-top:4px">
                      É esta
                    </button>
                  </div>
                </div>`).join('')}
            ` : `
              <div class="small muted" style="margin-bottom:10px">
                Nenhum atendimento parecido foi encontrado na produção importada.
              </div>`}

            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
              <input type="text" placeholder="Buscar paciente na produção…"
                     data-busca="${g.id}" style="flex:1;min-width:240px;padding:6px 10px;
                     border:1px solid var(--border-strong);border-radius:4px;font-size:13px">
              <button class="btn" data-buscar="${g.id}" style="padding:5px 12px">Buscar</button>
              <button class="btn" data-ignorar="${g.id}" style="padding:5px 12px">Não gera repasse</button>
            </div>
            <div data-resultado="${g.id}"></div>
          `}
        </div>
      </div>`;
  }

  function ligarEventos() {
    document.querySelectorAll('[data-filtro]').forEach(b => {
      b.onclick = () => {
        App.telas['conciliacao']._filtro = b.dataset.filtro;
        App.recarregar();
      };
    });

    const rep = document.getElementById('cn-reprocessar');
    if (rep) rep.onclick = async () => {
      Utilidades.mostrarLoading('Refazendo os casamentos…');
      await Utilidades.aguardarPintura();
      const r = Conciliacao.executar({});
      Utilidades.esconderLoading();
      Utilidades.toast(
        `${r.automatico} automáticas · ${r.pendente + r.semCorrespondencia} a conferir · ` +
        `${r.preservados} decisões suas mantidas`, 'sucesso', 5000);
      App.recarregar();
    };

    document.querySelectorAll('[data-confirmar]').forEach(b => {
      b.onclick = () => {
        Conciliacao.confirmar(Number(b.dataset.confirmar), Number(b.dataset.producao), true);
        Utilidades.toast('Casamento confirmado.', 'sucesso');
        App.recarregar();
      };
    });

    document.querySelectorAll('[data-ignorar]').forEach(b => {
      b.onclick = () => {
        Conciliacao.ignorar(Number(b.dataset.ignorar), 'Marcada na revisão como sem repasse.');
        Utilidades.toast('Guia marcada como fora do repasse.', 'sucesso');
        App.recarregar();
      };
    });

    document.querySelectorAll('[data-reabrir]').forEach(b => {
      b.onclick = () => {
        Conciliacao.reabrir(Number(b.dataset.reabrir));
        App.recarregar();
      };
    });

    document.querySelectorAll('[data-buscar]').forEach(b => {
      b.onclick = () => buscar(Number(b.dataset.buscar));
    });
    document.querySelectorAll('[data-busca]').forEach(inp => {
      inp.onkeydown = (e) => { if (e.key === 'Enter') buscar(Number(inp.dataset.busca)); };
    });
  }

  /** Busca livre na produção, para quando o casamento automático não achou nada. */
  function buscar(guiaId) {
    const inp = document.querySelector(`[data-busca="${guiaId}"]`);
    const alvo = document.querySelector(`[data-resultado="${guiaId}"]`);
    const termo = Utilidades.normalizar(inp.value);

    if (termo.length < 3) {
      alvo.innerHTML = `<div class="rp-aviso">Digite ao menos 3 letras do nome.</div>`;
      return;
    }

    const linhas = Banco.query(`
      SELECT id, paciente, cod_admissao, data_atendimento, convenio, procedimento,
             cirurgiao, medico, profissional_admissao
        FROM linhas_producao
       WHERE paciente_norm LIKE ?
       GROUP BY COALESCE(cod_admissao, paciente_norm || data_atendimento)
       ORDER BY data_atendimento DESC
       LIMIT 25
    `, [`%${termo}%`]);

    if (!linhas.length) {
      alvo.innerHTML = `<div class="rp-aviso">Nenhum paciente com esse nome na produção importada.</div>`;
      return;
    }

    alvo.innerHTML = linhas.map(l => `
      <div class="rp-cand">
        <div class="rp-cand-info">
          <div class="rp-cand-nome">${Utilidades.esc(l.paciente)}</div>
          <div class="rp-cand-det">
            ${Utilidades.esc(l.cirurgiao || l.medico || l.profissional_admissao || 'sem profissional')} ·
            ${Utilidades.dataBR(l.data_atendimento) || 'sem data'} ·
            ${Utilidades.esc(l.convenio || 'convênio não informado')}<br>
            ${Utilidades.esc(l.procedimento || '')}
          </div>
        </div>
        <button class="btn btn-primary" data-confirmar="${guiaId}" data-producao="${l.id}"
                style="padding:4px 12px">É esta</button>
      </div>`).join('');

    alvo.querySelectorAll('[data-confirmar]').forEach(b => {
      b.onclick = () => {
        Conciliacao.confirmar(Number(b.dataset.confirmar), Number(b.dataset.producao), true);
        Utilidades.toast('Casamento confirmado e nome memorizado.', 'sucesso');
        App.recarregar();
      };
    });
  }
};
