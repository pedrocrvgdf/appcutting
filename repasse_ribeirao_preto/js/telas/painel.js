/**
 * ============================================================================
 * TELA: Painel
 *
 * Responde de relance: o mês fecha? O painel é organizado como a rotina do
 * setor — carregar regras, carregar produção, importar o demonstrativo,
 * conferir o que não casou, calcular. Cada passo mostra se está pronto ou o que
 * falta, para que ninguém descubra no fim do mês que faltava um arquivo.
 * ============================================================================
 */

App.telas['painel'] = function () {
  const r = Banco.resumo();
  const temRegras   = r.tabela_percentuais > 0;
  const temProducao = r.linhas_producao > 0;
  const temDemo     = r.demonstrativos > 0;

  const stats = Conciliacao.estatisticas();
  const pendentes = (stats.porStatus['PENDENTE']?.qtd || 0)
                  + (stats.porStatus['SEM_CORRESPONDENCIA']?.qtd || 0)
                  + (stats.porStatus['NAO_PROCESSADO']?.qtd || 0);
  const casados = (stats.porStatus['AUTOMATICO']?.qtd || 0)
                + (stats.porStatus['CONFIRMADO']?.qtd || 0);

  const totalPago = Number(Banco.valor('SELECT SUM(total_liberado) FROM demonstrativos') || 0);
  const totalGlosa = Number(Banco.valor('SELECT SUM(total_glosa) FROM demonstrativos') || 0);

  let repasse = null;
  if (temDemo && casados) {
    try { repasse = RepasseMotor.calcular({}); } catch (e) { console.warn(e); }
  }

  const passo = (n, titulo, texto, pronto, acao) => `
    <div class="rp-passo ${pronto ? 'feito' : 'pendente'}">
      <div class="rp-passo-num">${pronto ? '✓' : n}</div>
      <div style="flex:1">
        <div class="rp-passo-tit">${titulo}</div>
        <div class="rp-passo-txt">${texto}</div>
      </div>
      ${acao ? `<div>${acao}</div>` : ''}
    </div>`;

  App.alvoConteudo().innerHTML = `
    <div class="page-content">
      ${App.cabecalho(
        'Painel',
        'Hospital Oftalmológico Ribeirão Preto — repasse a partir do demonstrativo de pagamento'
      )}

      <div class="rp-kpis">
        ${App.kpi('Pago pelos convênios', Utilidades.formatarMoeda(totalPago),
                  `${r.guias_demonstrativo} guias em ${r.demonstrativos} demonstrativo(s)`, 'destaque')}
        ${App.kpi('Glosado', Utilidades.formatarMoeda(totalGlosa),
                  totalPago + totalGlosa > 0
                    ? `${Utilidades.formatarPercentual(totalGlosa / (totalPago + totalGlosa) * 100)} do faturado`
                    : 'sem demonstrativos', totalGlosa > 0 ? 'alerta' : '')}
        ${App.kpi('Repasse calculado',
                  repasse ? Utilidades.formatarMoeda(repasse.totais.totalRepasse) : '—',
                  repasse ? `${repasse.totais.medicos} profissionais · ${Utilidades.formatarPercentual(repasse.totais.percentualMedio)} do pago` : 'aguardando dados',
                  repasse ? 'ok' : '')}
        ${App.kpi('A conferir', String(pendentes),
                  pendentes ? 'guias sem casamento confirmado' : 'nada pendente',
                  pendentes ? 'perigo' : 'ok')}
      </div>

      <div class="card" style="margin-bottom:22px">
        <h3 class="card-title">Como fechar o mês</h3>
        <p class="card-subtitle">A ordem importa: as regras e a produção precisam estar no lugar antes de o demonstrativo ser processado.</p>
        <div class="rp-passos" style="margin-top:16px">
          ${passo(1, 'Tabela de regras carregada',
            temRegras
              ? `${Utilidades.formatarNumero(r.tabela_percentuais, 0)} percentuais cadastrados (convênio × procedimento).`
              : 'Importe a planilha REGRAS DE REPASSE — é ela que diz o percentual de cada procedimento.',
            temRegras,
            `<a class="btn ${temRegras ? '' : 'btn-primary'}" href="#regras">${temRegras ? 'Ver regras' : 'Importar regras'}</a>`)}

          ${passo(2, 'Produção importada',
            temProducao
              ? `${Utilidades.formatarNumero(r.linhas_producao, 0)} linhas — é onde a ferramenta descobre quem atendeu cada paciente.`
              : 'Importe o relatório de produção do período. Sem ele, o pagamento não tem médico.',
            temProducao,
            `<a class="btn ${temProducao ? '' : 'btn-primary'}" href="#importar_producao">${temProducao ? 'Atualizar' : 'Importar produção'}</a>`)}

          ${passo(3, 'Demonstrativo de pagamento importado',
            temDemo
              ? `${r.demonstrativos} demonstrativo(s) · ${r.guias_demonstrativo} guias lidas do PDF.`
              : 'Importe o PDF do demonstrativo enviado pelo convênio.',
            temDemo,
            `<a class="btn ${temDemo ? '' : 'btn-primary'}" href="#importar_demonstrativo">${temDemo ? 'Importar outro' : 'Importar PDF'}</a>`)}

          ${passo(4, 'Casamentos conferidos',
            pendentes
              ? `${pendentes} guia(s) esperando conferência — o repasse delas fica de fora até alguém decidir.`
              : (casados ? `${casados} guias casadas com a produção.` : 'Nada para conferir ainda.'),
            temDemo && !pendentes,
            `<a class="btn ${pendentes ? 'btn-primary' : ''}" href="#conciliacao">Revisar</a>`)}

          ${passo(5, 'Repasse calculado',
            repasse
              ? `${Utilidades.formatarMoeda(repasse.totais.totalRepasse)} para ${repasse.totais.medicos} profissionais.`
              : 'Disponível assim que houver guias casadas.',
            !!repasse,
            `<a class="btn ${repasse ? 'btn-primary' : ''}" href="#repasse">Abrir repasse</a>`)}
        </div>
      </div>

      ${repasse && repasse.alertas.length ? `
        <div class="card" style="margin-bottom:22px;border-color:var(--warning)">
          <h3 class="card-title">Pontos de atenção (${repasse.alertas.length})</h3>
          <p class="card-subtitle">Situações que a ferramenta não resolve sozinha — nada aqui foi calculado por conta própria.</p>
          <div style="margin-top:14px">
            ${repasse.alertas.slice(0, 8).map(a => `
              <div class="rp-aviso">${Utilidades.esc(a.texto)}</div>
            `).join('')}
            ${repasse.alertas.length > 8
              ? `<div class="small muted" style="margin-top:8px">e mais ${repasse.alertas.length - 8}. A lista completa está na tela de Repasse.</div>`
              : ''}
          </div>
        </div>` : ''}

      ${repasse && repasse.porMedico.length ? `
        <div class="card">
          <h3 class="card-title">Repasse por profissional</h3>
          <p class="card-subtitle">Consolidado de tudo que já está conciliado.</p>
          <div class="rp-tabela-wrap" style="margin-top:14px">
            <table class="rp-tabela">
              <thead>
                <tr>
                  <th>Profissional</th><th>Pacientes</th><th>Itens</th><th class="rp-num">Repasse</th>
                </tr>
              </thead>
              <tbody>
                ${repasse.porMedico.slice(0, 12).map(m => `
                  <tr>
                    <td class="rp-forte">${Utilidades.esc(m.medico)}</td>
                    <td>${m.pacientes}</td>
                    <td>${m.itens}</td>
                    <td class="rp-num rp-forte">${Utilidades.formatarMoeda(m.repasse)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

      <div class="card" style="margin-top:22px;background:var(--warning-soft);border-color:var(--warning)">
        <h3 class="card-title">Onde seus dados ficam</h3>
        <p class="card-subtitle">
          Tudo é gravado <strong>apenas neste navegador, neste computador</strong> — nada sai para a internet.
          Limpar os dados de navegação apaga o banco. Exporte um backup ao fim de cada fechamento.
        </p>
        <div style="margin-top:12px"><a class="btn" href="#backup">Fazer backup</a></div>
      </div>
    </div>
  `;
};
