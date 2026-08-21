/**
 * ============================================================================
 * TELA: Repasse
 *
 * O resultado do mês: quanto cada profissional recebe, com o caminho completo
 * de cada centavo — paciente, guia, procedimento, valor pago pelo convênio,
 * regra aplicada e percentual. Quem receber esse relatório consegue refazer a
 * conta na mão se quiser, que é o que dá confiança para pagar.
 * ============================================================================
 */

App.telas['repasse'] = function () {
  const estado = App.telas['repasse']._estado || {};
  const competencias = App.competencias();
  const competencia = estado.competencia || '';

  let r;
  try {
    r = RepasseMotor.calcular({ competencia: competencia || undefined });
  } catch (e) {
    console.error(e);
    App.alvoConteudo().innerHTML = `
      <div class="page-content">
        <div class="card" style="border-color:var(--danger)">
          <h3 class="card-title">Não foi possível calcular</h3>
          <p class="card-subtitle">${Utilidades.esc(e.message)}</p>
        </div>
      </div>`;
    return;
  }

  const semPercentual = r.alertas.filter(a => a.tipo === 'SEM_PERCENTUAL');
  const outrosAlertas = r.alertas.filter(a => a.tipo !== 'SEM_PERCENTUAL');

  App.alvoConteudo().innerHTML = `
    <div class="page-content">
      ${App.cabecalho('Repasse', 'Calculado sobre o que o convênio efetivamente pagou',
        `<button class="btn btn-primary" id="rp-exportar">Exportar para Excel</button>`)}

      <div class="rp-filtros">
        <label>Competência:</label>
        <select id="rp-comp">
          <option value="">Todas</option>
          ${competencias.map(c => `
            <option value="${c}" ${c === competencia ? 'selected' : ''}>
              ${Utilidades.competenciaExtenso(c)}
            </option>`).join('')}
        </select>
        <span class="small muted">
          Só entram guias já casadas com a produção. As pendentes ficam na tela de revisão.
        </span>
      </div>

      <div class="rp-kpis">
        ${App.kpi('Pago pelo convênio', Utilidades.formatarMoeda(r.totais.totalPago),
                  `${r.totais.guias} guias conciliadas`, 'destaque')}
        ${App.kpi('Repasse aos médicos', Utilidades.formatarMoeda(r.totais.totalRepasse),
                  `${r.totais.medicos} profissionais`, 'ok')}
        ${App.kpi('Fica no hospital', Utilidades.formatarMoeda(r.totais.retidoHospital),
                  `repasse médio de ${Utilidades.formatarPercentual(r.totais.percentualMedio)}`)}
        ${App.kpi('Pontos de atenção', String(r.alertas.length),
                  r.alertas.length ? 'confira antes de pagar' : 'nenhum',
                  r.alertas.length ? 'alerta' : 'ok')}
      </div>

      ${semPercentual.length ? `
        <div class="card" style="margin-bottom:20px;border-color:var(--danger)">
          <h3 class="card-title">Procedimentos pagos sem percentual cadastrado (${semPercentual.length})</h3>
          <p class="card-subtitle">
            O convênio pagou, mas a tabela de regras não tem esse código — nada foi
            calculado para eles. Cadastre o percentual ou confirme que não há repasse.
          </p>
          <div class="rp-tabela-wrap" style="margin-top:14px">
            <table class="rp-tabela">
              <thead><tr><th>Paciente</th><th>Convênio</th><th>Código</th><th>Procedimento</th><th class="rp-num">Pago</th></tr></thead>
              <tbody>
                ${semPercentual.slice(0, 25).map(a => `
                  <tr>
                    <td>${Utilidades.esc(a.paciente)}</td>
                    <td>${Utilidades.esc(a.convenio)}</td>
                    <td class="rp-forte">${Utilidades.esc(a.codigo)}</td>
                    <td>${Utilidades.esc(a.descricao)}</td>
                    <td class="rp-num">${Utilidades.formatarMoeda(a.valor)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

      ${outrosAlertas.length ? `
        <div class="card" style="margin-bottom:20px;border-color:var(--warning)">
          <h3 class="card-title">Avisos (${outrosAlertas.length})</h3>
          <div style="margin-top:12px">
            ${outrosAlertas.slice(0, 15).map(a => `<div class="rp-aviso">${Utilidades.esc(a.texto)}</div>`).join('')}
          </div>
        </div>` : ''}

      ${r.porMedico.length ? `
        <div class="card" style="margin-bottom:20px">
          <h3 class="card-title">Por profissional</h3>
          <div class="rp-tabela-wrap" style="margin-top:14px">
            <table class="rp-tabela">
              <thead>
                <tr><th>Profissional</th><th>Pacientes</th><th>Itens</th>
                    <th class="rp-num">Cirurgião</th><th class="rp-num">Auxiliar</th>
                    <th class="rp-num">Anestesista</th><th class="rp-num">Total</th></tr>
              </thead>
              <tbody>
                ${r.porMedico.map(m => `
                  <tr>
                    <td class="rp-forte">${Utilidades.esc(m.medico)}</td>
                    <td>${m.pacientes}</td>
                    <td>${m.itens}</td>
                    <td class="rp-num">${m.porPapel.CIRURGIAO ? Utilidades.formatarMoeda(m.porPapel.CIRURGIAO) : '—'}</td>
                    <td class="rp-num">${m.porPapel.AUXILIAR ? Utilidades.formatarMoeda(m.porPapel.AUXILIAR) : '—'}</td>
                    <td class="rp-num">${m.porPapel.ANESTESISTA ? Utilidades.formatarMoeda(m.porPapel.ANESTESISTA) : '—'}</td>
                    <td class="rp-num rp-forte">${Utilidades.formatarMoeda(m.repasse)}</td>
                  </tr>`).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="6">Total</td>
                  <td class="rp-num">${Utilidades.formatarMoeda(r.totais.totalRepasse)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">Detalhamento (${r.linhas.length} linhas)</h3>
          <p class="card-subtitle">Cada linha mostra de onde veio o valor e por qual regra.</p>
          <div class="rp-tabela-wrap" style="margin-top:14px;max-height:640px;overflow-y:auto">
            <table class="rp-tabela">
              <thead>
                <tr>
                  <th>Paciente</th><th>Data</th><th>Convênio</th><th>Procedimento</th>
                  <th>Cobrança</th><th>Profissional</th><th>Papel</th>
                  <th class="rp-num">Pago</th><th class="rp-num">%</th><th class="rp-num">Repasse</th>
                </tr>
              </thead>
              <tbody>
                ${r.linhas.slice(0, 400).map(l => `
                  <tr>
                    <td>${Utilidades.esc(l.paciente)}</td>
                    <td>${Utilidades.dataBR(l.data)}</td>
                    <td>${Utilidades.esc(l.convenio)}</td>
                    <td>${Utilidades.esc((l.descricao || '').slice(0, 44))}
                        ${l.codigo ? `<span class="small muted">(${Utilidades.esc(l.codigo)})</span>` : ''}</td>
                    <td><span class="rp-tag ${l.origem === 'SOCIO' ? 'info' : 'neutro'}">${l.origem === 'SOCIO' ? 'Sócio' : l.cenarioRotulo}</span></td>
                    <td class="rp-forte">${Utilidades.esc(l.medico)}</td>
                    <td>${({ CIRURGIAO: 'Cirurgião', AUXILIAR: 'Auxiliar', ANESTESISTA: 'Anestesista' })[l.papel] || l.papel}</td>
                    <td class="rp-num">${Utilidades.formatarMoeda(l.base)}</td>
                    <td class="rp-num">${Utilidades.formatarPercentual(l.percentual)}</td>
                    <td class="rp-num rp-forte">${Utilidades.formatarMoeda(l.repasse)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${r.linhas.length > 400
            ? `<p class="small muted" style="margin-top:10px">
                 Mostrando as 400 primeiras. O Excel sai completo.</p>` : ''}
        </div>
      ` : App.vazio('Nada calculado ainda',
          'O repasse aparece quando houver demonstrativo importado e guias casadas com a produção.',
          `<a class="btn btn-primary" href="#importar_demonstrativo">Importar demonstrativo</a>`)}
    </div>
  `;

  document.getElementById('rp-comp').onchange = (e) => {
    App.telas['repasse']._estado = { competencia: e.target.value };
    App.recarregar();
  };

  document.getElementById('rp-exportar').onclick = () => exportar(r, competencia);

  // ==========================================================================

  function exportar(r, competencia) {
    if (!r.linhas.length) {
      Utilidades.toast('Não há repasse calculado para exportar.', 'aviso');
      return;
    }

    const wb = XLSX.utils.book_new();

    const resumo = r.porMedico.map(m => ({
      'Profissional': m.medico,
      'Pacientes': m.pacientes,
      'Itens': m.itens,
      'Cirurgião (R$)': m.porPapel.CIRURGIAO || 0,
      'Auxiliar (R$)': m.porPapel.AUXILIAR || 0,
      'Anestesista (R$)': m.porPapel.ANESTESISTA || 0,
      'Total (R$)': m.repasse,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Por profissional');

    const detalhe = r.linhas.map(l => ({
      'Competência': l.competencia,
      'Convênio': l.convenio,
      'Demonstrativo': l.demonstrativo,
      'Guia': l.guia,
      'Paciente': l.paciente,
      'Data': Utilidades.dataBR(l.data),
      'Código': l.codigo,
      'Procedimento': l.descricao,
      'Forma de cobrança': l.origem === 'SOCIO' ? 'Regra de sócio' : l.cenarioRotulo,
      'Profissional': l.medico,
      'Papel': ({ CIRURGIAO: 'Cirurgião', AUXILIAR: 'Auxiliar', ANESTESISTA: 'Anestesista' })[l.papel] || l.papel,
      'Base de cálculo (R$)': l.base,
      'Percentual (%)': l.percentual,
      'Repasse (R$)': l.repasse,
      'Regra aplicada': l.regra,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), 'Detalhamento');

    if (r.alertas.length) {
      const alertas = r.alertas.map(a => ({
        'Tipo': a.tipo,
        'Paciente': a.paciente || '',
        'Convênio': a.convenio || '',
        'Código': a.codigo || '',
        'Procedimento': a.descricao || '',
        'Valor pago (R$)': a.valor || '',
        'Observação': a.texto,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(alertas), 'Pontos de atenção');
    }

    const nome = Utilidades.sanitizarNomeArquivo(
      `repasse_${competencia || 'geral'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    XLSX.writeFile(wb, nome);
    Utilidades.toast('Planilha gerada.', 'sucesso');
  }
};
