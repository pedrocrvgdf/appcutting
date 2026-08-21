/**
 * ============================================================================
 * TELA: Importar produção (Excel)
 *
 * Antes de gravar, mostra o de/para de colunas: qual coluna do arquivo virou
 * paciente, cirurgião, convênio. É a defesa contra um relatório em formato
 * diferente entrar torto e o repasse sair no nome errado.
 * ============================================================================
 */

App.telas['importar_producao'] = function () {
  const comps = Banco.query(`
    SELECT competencia, COUNT(*) AS linhas,
           COUNT(DISTINCT cod_admissao) AS atendimentos,
           COUNT(DISTINCT paciente_norm) AS pacientes
      FROM linhas_producao
     WHERE competencia IS NOT NULL AND competencia <> ''
     GROUP BY competencia ORDER BY competencia DESC
  `);

  const ultima = Banco.queryUnica(
    `SELECT * FROM importacoes WHERE tipo = 'PRODUCAO' ORDER BY id DESC LIMIT 1`);

  App.alvoConteudo().innerHTML = `
    <div class="page-content">
      ${App.cabecalho('Relatório de produção',
        'Onde a ferramenta descobre quem atendeu cada paciente do demonstrativo')}

      <div class="card" style="margin-bottom:22px">
        <div class="rp-arquivo" id="pr-solta">
          <div class="rp-arquivo-tit">Selecione o relatório de produção</div>
          <div class="rp-arquivo-txt">
            Arquivo .xlsx exportado do sistema. Precisa ter, no mínimo, a coluna de
            <strong>Paciente</strong>; cirurgião, auxiliares, convênio e data tornam o
            casamento mais seguro.
          </div>
          <input type="file" id="pr-arquivo" accept=".xlsx,.xls,.csv" style="display:none">
          <button class="btn btn-primary" id="pr-escolher">Escolher planilha</button>
        </div>
        <div id="pr-status" style="margin-top:14px"></div>
      </div>

      <div id="pr-previa"></div>

      ${comps.length ? `
        <div class="card">
          <h3 class="card-title">Produção no banco</h3>
          ${ultima ? `<p class="card-subtitle">Última importação: ${Utilidades.esc(ultima.arquivo)} — ${Utilidades.esc(ultima.resumo || '')}</p>` : ''}
          <div class="rp-tabela-wrap" style="margin-top:14px">
            <table class="rp-tabela">
              <thead>
                <tr><th>Competência</th><th class="rp-num">Linhas</th>
                    <th class="rp-num">Atendimentos</th><th class="rp-num">Pacientes</th></tr>
              </thead>
              <tbody>
                ${comps.map(c => `
                  <tr>
                    <td class="rp-forte">${Utilidades.competenciaExtenso(c.competencia)}</td>
                    <td class="rp-num">${Utilidades.formatarNumero(c.linhas, 0)}</td>
                    <td class="rp-num">${Utilidades.formatarNumero(c.atendimentos, 0)}</td>
                    <td class="rp-num">${Utilidades.formatarNumero(c.pacientes, 0)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <p class="small muted" style="margin-top:12px">
            Reimportar uma competência substitui as linhas dela — pode reimportar o
            relatório corrigido sem duplicar nada.
          </p>
        </div>` : ''}
    </div>
  `;

  const input  = document.getElementById('pr-arquivo');
  const status = document.getElementById('pr-status');
  const previa = document.getElementById('pr-previa');
  const solta  = document.getElementById('pr-solta');

  document.getElementById('pr-escolher').onclick = () => input.click();
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

  // ==========================================================================

  async function processar(arquivo) {
    previa.innerHTML = '';
    status.innerHTML = `<div class="rp-aviso">Lendo <strong>${Utilidades.esc(arquivo.name)}</strong>…</div>`;
    await Utilidades.aguardarPintura();

    let lido;
    try {
      lido = await ImportadorProducao.ler(arquivo);
    } catch (e) {
      console.error(e);
      status.innerHTML = `<div class="rp-aviso erro">${Utilidades.esc(e.message).replace(/\n/g, '<br>')}</div>`;
      return;
    }

    status.innerHTML = '';
    mostrarPrevia(lido);
  }

  function mostrarPrevia(lido) {
    const rotulos = {
      paciente: 'Paciente', data_atendimento: 'Data', cod_admissao: 'Atendimento',
      convenio: 'Convênio', cirurgiao: 'Cirurgião', medico: 'Médico',
      auxiliar_1: 'Auxiliar 1', auxiliar_2: 'Auxiliar 2', anestesista: 'Anestesista',
      procedimento: 'Procedimento', valor: 'Valor', indicante: 'Indicante',
      solicitante: 'Solicitante', profissional_admissao: 'Profissional da admissão',
    };

    const mapeadas = Object.entries(lido.mapa.campos)
      .filter(([campo]) => rotulos[campo])
      .map(([campo, idx]) => `
        <tr>
          <td class="rp-forte">${rotulos[campo]}</td>
          <td>${Utilidades.esc(lido.cabecalhos[idx])}</td>
          <td class="small muted">${lido.previa.map(p => Utilidades.esc(String(p[campo] ?? ''))).filter(Boolean).slice(0, 2).join(' · ') || '—'}</td>
        </tr>`).join('');

    const faltando = Object.entries(rotulos)
      .filter(([campo]) => lido.mapa.campos[campo] === undefined)
      .map(([, r]) => r);

    previa.innerHTML = `
      <div class="card" style="margin-bottom:22px">
        <h3 class="card-title">Confira as colunas antes de importar</h3>
        <p class="card-subtitle">
          ${Utilidades.formatarNumero(lido.totalLinhas, 0)} linhas em
          <strong>${Utilidades.esc(lido.arquivo)}</strong>. Veja se cada informação foi
          para o lugar certo.
        </p>

        ${lido.semCirurgiao ? `
          <div class="rp-aviso erro" style="margin-top:14px">
            Não encontrei coluna de <strong>cirurgião</strong> nem de <strong>médico</strong>.
            Sem uma delas o repasse fica sem destinatário.
          </div>` : ''}
        ${lido.semAnestesista ? `
          <div class="rp-aviso" style="margin-top:14px">
            O relatório não traz coluna de <strong>anestesista</strong>. As regras de repasse
            preveem pagamento a anestesista em pacote com honorário dentro — esses casos
            precisarão ser informados à mão na revisão.
          </div>` : ''}

        <div class="rp-tabela-wrap" style="margin-top:14px">
          <table class="rp-tabela">
            <thead><tr><th>Campo usado no repasse</th><th>Coluna do arquivo</th><th>Exemplos</th></tr></thead>
            <tbody>${mapeadas}</tbody>
          </table>
        </div>

        ${faltando.length ? `
          <p class="small muted" style="margin-top:12px">
            Não localizadas (ficam em branco): ${faltando.join(', ')}.
          </p>` : ''}
        ${lido.mapa.naoMapeadas.length ? `
          <p class="small muted" style="margin-top:6px">
            ${lido.mapa.naoMapeadas.length} outras colunas do arquivo serão guardadas junto com cada linha.
          </p>` : ''}

        <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
          <button class="btn btn-primary" id="pr-confirmar">Importar produção</button>
          <button class="btn" id="pr-cancelar">Cancelar</button>
        </div>
      </div>
    `;

    document.getElementById('pr-cancelar').onclick = () => { previa.innerHTML = ''; };
    document.getElementById('pr-confirmar').onclick = () => confirmar(lido);
  }

  async function confirmar(lido) {
    Utilidades.mostrarLoading('Importando produção…');
    await Utilidades.aguardarPintura();

    try {
      const rel = ImportadorProducao.gravar(lido);

      // A produção nova pode resolver casamentos que antes ficaram pendentes.
      let reconciliou = null;
      if (Banco.contar('guias_demonstrativo')) {
        Utilidades.mostrarLoading('Revendo os casamentos com a nova produção…');
        await Utilidades.aguardarPintura();
        reconciliou = Conciliacao.executar({});
      }

      Utilidades.mostrarLoading('Gravando…');
      await Banco.salvar({ imediato: true });

      Utilidades.esconderLoading();
      Utilidades.toast(
        `${Utilidades.formatarNumero(rel.importadas, 0)} linhas importadas` +
        (reconciliou ? ` · ${reconciliou.automatico} guias casadas` : ''),
        'sucesso', 5000);
      App.recarregar();
    } catch (e) {
      Utilidades.esconderLoading();
      console.error(e);
      Utilidades.toast('Erro ao importar: ' + e.message, 'erro', 6000);
    }
  }
};
