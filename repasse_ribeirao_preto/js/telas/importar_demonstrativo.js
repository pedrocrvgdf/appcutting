/**
 * ============================================================================
 * TELA: Importar demonstrativo de pagamento (PDF)
 *
 * O PDF é lido e MOSTRADO antes de ser gravado. O operador confere guia a guia
 * o que a ferramenta entendeu — inclusive a conferência automática contra os
 * totais impressos pelo próprio convênio — e só então confirma.
 * ============================================================================
 */

App.telas['importar_demonstrativo'] = function () {
  const historico = Banco.query(`
    SELECT * FROM demonstrativos ORDER BY importado_em DESC LIMIT 20
  `);

  App.alvoConteudo().innerHTML = `
    <div class="page-content">
      ${App.cabecalho('Demonstrativo de pagamento',
        'O PDF que o convênio envia — é ele que prova o que foi pago e de qual paciente')}

      <div class="card" style="margin-bottom:22px">
        <div class="rp-arquivo" id="dm-solta">
          <div class="rp-arquivo-tit">Selecione o PDF do demonstrativo</div>
          <div class="rp-arquivo-txt">
            "Demonstrativo de Análise de Conta" (padrão TISS). Arraste o arquivo aqui ou clique no botão.
          </div>
          <input type="file" id="dm-arquivo" accept=".pdf" style="display:none">
          <button class="btn btn-primary" id="dm-escolher">Escolher arquivo PDF</button>
        </div>
        <div id="dm-status" style="margin-top:14px"></div>
      </div>

      <div id="dm-previa"></div>

      ${historico.length ? `
        <div class="card">
          <h3 class="card-title">Demonstrativos importados</h3>
          <div class="rp-tabela-wrap" style="margin-top:14px">
            <table class="rp-tabela">
              <thead>
                <tr>
                  <th>Número</th><th>Convênio</th><th>Competência</th><th>Guias</th>
                  <th class="rp-num">Liberado</th><th class="rp-num">Glosa</th><th></th>
                </tr>
              </thead>
              <tbody>
                ${historico.map(d => `
                  <tr>
                    <td class="rp-forte">${Utilidades.esc(d.numero)}</td>
                    <td>${Utilidades.esc(d.convenio || d.operadora)}</td>
                    <td>${Utilidades.competenciaExtenso(d.competencia)}</td>
                    <td>${d.qtd_guias}</td>
                    <td class="rp-num">${Utilidades.formatarMoeda(d.total_liberado)}</td>
                    <td class="rp-num">${Utilidades.formatarMoeda(d.total_glosa)}</td>
                    <td><button class="btn small" data-apagar="${d.id}"
                          style="color:var(--danger);padding:3px 10px">Apagar</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
    </div>
  `;

  const input   = document.getElementById('dm-arquivo');
  const status  = document.getElementById('dm-status');
  const previa  = document.getElementById('dm-previa');
  const solta   = document.getElementById('dm-solta');

  document.getElementById('dm-escolher').onclick = () => input.click();
  input.onchange = () => { if (input.files[0]) processar(input.files[0]); };

  ['dragover', 'dragenter'].forEach(ev => solta.addEventListener(ev, e => {
    e.preventDefault(); solta.classList.add('sobre');
  }));
  ['dragleave', 'drop'].forEach(ev => solta.addEventListener(ev, e => {
    e.preventDefault(); solta.classList.remove('sobre');
  }));
  solta.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0];
    if (f) processar(f);
  });

  document.querySelectorAll('[data-apagar]').forEach(b => {
    b.onclick = () => {
      const id = Number(b.dataset.apagar);
      const d = Banco.queryUnica('SELECT * FROM demonstrativos WHERE id = ?', [id]);
      if (!confirm(`Apagar o demonstrativo ${d.numero} (${d.qtd_guias} guias) e as conciliações dele?`)) return;
      ImportadorDemonstrativo.apagar(id);
      Utilidades.toast('Demonstrativo apagado.', 'sucesso');
      App.recarregar();
    };
  });

  // ==========================================================================

  async function processar(arquivo) {
    previa.innerHTML = '';
    status.innerHTML = `<div class="rp-aviso">Lendo <strong>${Utilidades.esc(arquivo.name)}</strong>…</div>`;
    await Utilidades.aguardarPintura();

    let doc;
    try {
      doc = await ImportadorDemonstrativo.ler(arquivo, (p, total) => {
        status.innerHTML = `<div class="rp-aviso">Lendo página ${p} de ${total}…</div>`;
      });
    } catch (e) {
      console.error(e);
      status.innerHTML = `<div class="rp-aviso erro">${Utilidades.esc(e.message).replace(/\n/g, '<br>')}</div>`;
      return;
    }

    status.innerHTML = '';
    mostrarPrevia(doc);
  }

  function mostrarPrevia(doc) {
    const total = doc.totalGeral || { informado: 0, liberado: 0, glosa: 0 };
    const somaItens = doc.guias
      .flatMap(g => g.itens)
      .reduce((a, i) => a + i.valorLiberado, 0);
    const confere = Math.abs(somaItens - total.liberado) < 0.05;

    previa.innerHTML = `
      <div class="card" style="margin-bottom:22px;border-color:${confere ? 'var(--success)' : 'var(--danger)'}">
        <h3 class="card-title">Confira antes de importar</h3>
        <p class="card-subtitle">
          ${Utilidades.esc(doc.cabecalho.operadora || '')} ·
          demonstrativo ${Utilidades.esc(doc.cabecalho.numeroDemonstrativo || '')} ·
          emitido em ${Utilidades.esc(doc.cabecalho.dataEmissao || '—')}
        </p>

        <div class="rp-kpis" style="margin:16px 0">
          ${App.kpi('Guias', String(doc.guias.length), Utilidades.competenciaExtenso(doc.competencia))}
          ${App.kpi('Liberado', Utilidades.formatarMoeda(total.liberado), 'o que o convênio pagou', 'ok')}
          ${App.kpi('Glosa', Utilidades.formatarMoeda(total.glosa), 'não pago', total.glosa > 0 ? 'alerta' : '')}
          ${App.kpi('Conferência', confere ? 'Bateu' : 'Divergiu',
                    confere ? 'a soma dos itens é igual ao total impresso'
                            : `soma dos itens: ${Utilidades.formatarMoeda(somaItens)}`,
                    confere ? 'ok' : 'perigo')}
        </div>

        ${doc.avisos.length ? `
          <div style="margin-bottom:14px">
            ${doc.avisos.map(a => `<div class="rp-aviso">${Utilidades.esc(a)}</div>`).join('')}
          </div>` : ''}

        <div class="rp-tabela-wrap">
          <table class="rp-tabela">
            <thead>
              <tr>
                <th>Paciente</th><th>Guia</th><th>Data</th><th>Cobrança</th>
                <th>Itens pagos</th><th class="rp-num">Liberado</th><th class="rp-num">Glosa</th>
              </tr>
            </thead>
            <tbody>
              ${doc.guias.map(g => {
                const pagos = g.itens.filter(i => i.valorLiberado > 0);
                const honorarios = pagos.filter(i => i.geraRepasse);
                const cenario = RepasseMotor.detectarCenario(
                  g.itens.map(i => ({ tipo: i.tipo, valor_liberado: i.valorLiberado })));
                const datas = g.itens.map(i => i.data).filter(Boolean);
                return `
                  <tr>
                    <td class="rp-forte">${Utilidades.esc(g.beneficiario)}</td>
                    <td>${Utilidades.esc(g.numeroGuiaPrestador)}</td>
                    <td>${Utilidades.esc(datas[0] || '')}</td>
                    <td><span class="rp-tag info">${RepasseMotor.CENARIOS[cenario] || cenario}</span></td>
                    <td>
                      ${honorarios.length
                        ? honorarios.map(i => `${Utilidades.esc(i.descricao.slice(0, 46))} <span class="small muted">(${Utilidades.esc(i.codigo)})</span>`).join('<br>')
                        : `<span class="small muted">${pagos.length} item(ns), nenhum honorário médico</span>`}
                    </td>
                    <td class="rp-num">${Utilidades.formatarMoeda(g.totais ? g.totais.liberado : 0)}</td>
                    <td class="rp-num">${Utilidades.formatarMoeda(g.totais ? g.totais.glosa : 0)}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="display:flex;gap:10px;margin-top:18px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary" id="dm-confirmar">Importar e casar com a produção</button>
          <button class="btn" id="dm-cancelar">Cancelar</button>
          <span class="small muted">A importação já procura cada paciente no relatório de produção.</span>
        </div>
      </div>
    `;

    document.getElementById('dm-cancelar').onclick = () => { previa.innerHTML = ''; };
    document.getElementById('dm-confirmar').onclick = () => confirmar(doc);
  }

  async function confirmar(doc) {
    Utilidades.mostrarLoading('Gravando demonstrativo…');
    await Utilidades.aguardarPintura();

    try {
      const rel = ImportadorDemonstrativo.gravar(doc);

      Utilidades.mostrarLoading('Procurando os pacientes na produção…');
      await Utilidades.aguardarPintura();

      const demo = Banco.queryUnica(
        'SELECT id FROM demonstrativos ORDER BY id DESC LIMIT 1');
      const conc = Conciliacao.executar({ demonstrativoId: demo.id });

      // Espera a gravação terminar antes de sair da tela: o banco é grande e o
      // usuário pode fechar a janela achando que já acabou.
      Utilidades.mostrarLoading('Gravando…');
      await Banco.salvar({ imediato: true });

      Utilidades.esconderLoading();

      const precisaConferir = conc.pendente + conc.semCorrespondencia;
      Utilidades.toast(
        `${rel.guias} guias importadas · ${conc.automatico} casadas automaticamente`,
        'sucesso', 5000);

      App.ir(precisaConferir ? 'conciliacao' : 'repasse');
    } catch (e) {
      Utilidades.esconderLoading();
      console.error(e);
      previa.innerHTML = `<div class="card" style="border-color:var(--danger)">
        <h3 class="card-title">Não foi possível importar</h3>
        <p class="card-subtitle">${Utilidades.esc(e.message)}</p></div>`;
    }
  }
};
