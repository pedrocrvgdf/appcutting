/**
 * ============================================================================
 * TELA: Guias pagas
 *
 * A consulta do dia a dia — "esse paciente foi pago?". Lista todas as guias dos
 * demonstrativos importados, com o que foi liberado, o que foi glosado, a
 * equipe encontrada e, item a item, o que o convênio aceitou e o que recusou.
 * É o trabalho que hoje é feito folheando o PDF.
 * ============================================================================
 */

App.telas['guias'] = function () {
  const estado = App.telas['guias']._estado || {};
  const busca = estado.busca || '';
  const competencia = estado.competencia || '';

  const where = [];
  const params = [];
  if (busca) {
    where.push('(g.beneficiario_norm LIKE ? OR g.numero_guia_prestador LIKE ?)');
    params.push(`%${Utilidades.normalizar(busca)}%`, `%${busca.trim()}%`);
  }
  if (competencia) { where.push('g.competencia = ?'); params.push(competencia); }

  const guias = Banco.query(`
    SELECT g.*, d.convenio, d.numero AS demo_numero,
           COALESCE(c.status,'NAO_PROCESSADO') AS status,
           c.cirurgiao, c.auxiliar_1, c.auxiliar_2
      FROM guias_demonstrativo g
      JOIN demonstrativos d ON d.id = g.demonstrativo_id
      LEFT JOIN conciliacoes c ON c.guia_id = g.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY g.data_atendimento DESC, g.beneficiario
     LIMIT 300
  `, params);

  App.alvoConteudo().innerHTML = `
    <div class="page-content">
      ${App.cabecalho('Guias pagas', 'Consulta rápida: o que o convênio pagou de cada paciente')}

      <div class="rp-filtros">
        <input type="text" id="gu-busca" placeholder="Nome do paciente ou número da guia…"
               value="${Utilidades.esc(busca)}" style="flex:1;min-width:260px">
        <label>Competência:</label>
        <select id="gu-comp">
          <option value="">Todas</option>
          ${App.competencias().map(c => `
            <option value="${c}" ${c === competencia ? 'selected' : ''}>
              ${Utilidades.competenciaExtenso(c)}
            </option>`).join('')}
        </select>
      </div>

      ${guias.length ? `
        <div class="rp-tabela-wrap">
          <table class="rp-tabela">
            <thead>
              <tr>
                <th>Paciente</th><th>Guia</th><th>Data</th><th>Convênio</th>
                <th>Equipe</th><th>Cobrança</th>
                <th class="rp-num">Faturado</th><th class="rp-num">Pago</th><th class="rp-num">Glosado</th>
              </tr>
            </thead>
            <tbody>
              ${guias.map(g => `
                <tr data-guia="${g.id}" style="cursor:pointer">
                  <td class="rp-forte">${Utilidades.esc(g.beneficiario)}</td>
                  <td>${Utilidades.esc(g.numero_guia_prestador)}</td>
                  <td>${Utilidades.dataBR(g.data_atendimento)}</td>
                  <td>${Utilidades.esc(g.convenio)}</td>
                  <td>${g.cirurgiao
                        ? Utilidades.esc(g.cirurgiao) + (g.auxiliar_1 ? `<br><span class="small muted">aux. ${Utilidades.esc(g.auxiliar_1)}</span>` : '')
                        : '<span class="rp-tag alerta">não casada</span>'}</td>
                  <td><span class="small">${RepasseMotor.CENARIOS[g.cenario] || '—'}</span></td>
                  <td class="rp-num">${Utilidades.formatarMoeda(g.total_informado)}</td>
                  <td class="rp-num rp-forte">${Utilidades.formatarMoeda(g.total_liberado)}</td>
                  <td class="rp-num" style="color:${g.total_glosa > 0 ? 'var(--danger)' : 'inherit'}">
                    ${Utilidades.formatarMoeda(g.total_glosa)}</td>
                </tr>
                <tr data-itens="${g.id}" style="display:none">
                  <td colspan="9" style="background:var(--bg-sunken);padding:0"></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="small muted" style="margin-top:10px">
          Clique numa linha para ver item a item o que foi pago e o que foi glosado.
          ${guias.length >= 300 ? ' Mostrando as 300 primeiras — use os filtros para refinar.' : ''}
        </p>
      ` : App.vazio('Nenhuma guia encontrada',
            busca || competencia
              ? 'Tente outro nome ou competência.'
              : 'Importe um demonstrativo de pagamento para começar.',
            `<a class="btn btn-primary" href="#importar_demonstrativo">Importar demonstrativo</a>`)}
    </div>
  `;

  const inpBusca = document.getElementById('gu-busca');
  let timer;
  inpBusca.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      App.telas['guias']._estado = { busca: inpBusca.value, competencia };
      App.recarregar();
      const novo = document.getElementById('gu-busca');
      novo.focus();
      novo.setSelectionRange(novo.value.length, novo.value.length);
    }, 400);
  };

  document.getElementById('gu-comp').onchange = (e) => {
    App.telas['guias']._estado = { busca, competencia: e.target.value };
    App.recarregar();
  };

  document.querySelectorAll('[data-guia]').forEach(tr => {
    tr.onclick = () => {
      const id = tr.dataset.guia;
      const linhaItens = document.querySelector(`[data-itens="${id}"]`);
      const celula = linhaItens.querySelector('td');

      if (linhaItens.style.display !== 'none') { linhaItens.style.display = 'none'; return; }

      if (!celula.dataset.carregado) {
        const itens = Banco.query(
          'SELECT * FROM itens_demonstrativo WHERE guia_id = ? ORDER BY valor_liberado DESC, id',
          [Number(id)]);

        celula.innerHTML = `
          <table class="rp-tabela" style="margin:0">
            <thead>
              <tr><th>Item</th><th>Código</th><th>Tipo</th>
                  <th class="rp-num">Faturado</th><th class="rp-num">Pago</th>
                  <th class="rp-num">Glosado</th><th>Glosa</th></tr>
            </thead>
            <tbody>
              ${itens.map(i => `
                <tr>
                  <td>${Utilidades.esc(i.descricao)}</td>
                  <td>${Utilidades.esc(i.codigo)}</td>
                  <td><span class="rp-tag ${i.gera_repasse ? 'info' : 'neutro'}">${Utilidades.esc(i.tipo)}</span></td>
                  <td class="rp-num">${Utilidades.formatarMoeda(i.valor_informado)}</td>
                  <td class="rp-num rp-forte" style="color:${i.valor_liberado > 0 ? 'var(--success)' : 'inherit'}">
                    ${Utilidades.formatarMoeda(i.valor_liberado)}</td>
                  <td class="rp-num" style="color:${i.valor_glosa > 0 ? 'var(--danger)' : 'inherit'}">
                    ${Utilidades.formatarMoeda(i.valor_glosa)}</td>
                  <td class="small muted">${Utilidades.esc(i.codigo_glosa || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table>`;
        celula.dataset.carregado = '1';
      }
      linhaItens.style.display = '';
    };
  });
};
