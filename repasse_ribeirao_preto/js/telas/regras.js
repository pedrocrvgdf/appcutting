/**
 * ============================================================================
 * TELA: Regras de repasse
 *
 * Mostra as três camadas que decidem quanto cada um recebe, na ordem em que a
 * ferramenta as consulta:
 *
 *   1. Regras de sócio        — passam por cima de tudo
 *   2. Tabela de percentuais  — convênio × procedimento (a planilha da unidade)
 *   3. Regras por papel       — auxiliar e anestesista, conforme a cobrança
 *
 * Tudo é editável aqui: quando o acordo mudar, muda-se a regra na tela, sem
 * depender de alguém reescrever a ferramenta.
 * ============================================================================
 */

App.telas['regras'] = function () {
  const resumoTabela = ImportadorRegras.resumo();
  const papeis   = Banco.query('SELECT * FROM regras_papel ORDER BY cenario, papel, convenio');
  const medicos  = Banco.query('SELECT * FROM regras_medico ORDER BY medico');
  const excecoes = Banco.query('SELECT * FROM excecoes_execucao ORDER BY convenio');
  const semRep   = Banco.query('SELECT * FROM convenios_sem_repasse ORDER BY convenio');

  const rotuloPapel = { CIRURGIAO: 'Cirurgião', AUXILIAR: 'Auxiliar', ANESTESISTA: 'Anestesista' };

  App.alvoConteudo().innerHTML = `
    <div class="page-content">
      ${App.cabecalho('Regras de repasse', 'O que a ferramenta consulta para chegar em cada valor')}

      <!-- 1. Tabela mestra -->
      <div class="card" style="margin-bottom:20px">
        <h3 class="card-title">Tabela de percentuais por procedimento</h3>
        <p class="card-subtitle">
          A planilha da unidade: para cada convênio e código TUSS, quanto vai para o
          médico responsável. É a primeira fonte consultada no cálculo.
        </p>

        ${resumoTabela ? `
          <div class="rp-kpis" style="margin:16px 0">
            ${App.kpi('Percentuais', Utilidades.formatarNumero(resumoTabela.total, 0), 'linhas cadastradas', 'ok')}
            ${App.kpi('Convênios', String(resumoTabela.convenios.length), 'com tabela própria')}
            ${App.kpi('Importada em',
              resumoTabela.importacao
                ? new Date(resumoTabela.importacao.importado_em).toLocaleDateString('pt-BR') : '—',
              resumoTabela.importacao ? Utilidades.esc(resumoTabela.importacao.arquivo) : '')}
          </div>
          <details style="margin-bottom:14px">
            <summary class="small muted" style="cursor:pointer">Ver convênios cadastrados</summary>
            <div class="rp-tabela-wrap" style="margin-top:10px;max-height:280px;overflow-y:auto">
              <table class="rp-tabela">
                <thead><tr><th>Convênio</th><th class="rp-num">Procedimentos</th></tr></thead>
                <tbody>
                  ${resumoTabela.convenios.map(c => `
                    <tr><td>${Utilidades.esc(c.convenio)}</td>
                        <td class="rp-num">${Utilidades.formatarNumero(c.qtd, 0)}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          </details>
        ` : `
          <div class="rp-aviso erro" style="margin:16px 0">
            Nenhuma tabela de percentuais carregada. Sem ela, o cálculo não sabe quanto
            pagar por cada procedimento.
          </div>`}

        <input type="file" id="rg-arquivo" accept=".xlsx,.xls" style="display:none">
        <button class="btn ${resumoTabela ? '' : 'btn-primary'}" id="rg-importar">
          ${resumoTabela ? 'Substituir planilha de regras' : 'Importar planilha de regras'}
        </button>
        <span class="small muted" style="margin-left:10px">
          Arquivo REGRAS DE REPASSE, aba PORCENTAGEM_PROCEDIMENTO.
        </span>
        <div id="rg-status" style="margin-top:12px"></div>
      </div>

      <!-- 2. Sócios -->
      <div class="card" style="margin-bottom:20px">
        <h3 class="card-title">Regras por profissional</h3>
        <p class="card-subtitle">
          Passam à frente de qualquer outra: quando o nome aparece na conta, o percentual
          incide sobre o valor integral dela, em qualquer papel e convênio.
        </p>
        <div class="rp-tabela-wrap" style="margin-top:14px">
          <table class="rp-tabela">
            <thead><tr><th>Profissional</th><th class="rp-num">Percentual</th><th>Base</th><th>Observação</th><th></th></tr></thead>
            <tbody>
              ${medicos.map(m => `
                <tr>
                  <td class="rp-forte">${Utilidades.esc(m.medico)}</td>
                  <td class="rp-num">${Utilidades.formatarPercentual(m.percentual)}</td>
                  <td>${m.base === 'TOTAL_GUIA' ? 'Valor integral da conta' : 'Item a item'}</td>
                  <td class="small muted">${Utilidades.esc(m.observacao || '')}</td>
                  <td>
                    <button class="btn small" data-med-editar="${m.id}" style="padding:3px 10px">Editar</button>
                    <button class="btn small" data-med-apagar="${m.id}" style="padding:3px 10px;color:var(--danger)">Remover</button>
                  </td>
                </tr>`).join('')}
              ${medicos.length ? '' : '<tr><td colspan="5" class="small muted">Nenhuma regra por profissional.</td></tr>'}
            </tbody>
          </table>
        </div>
        <button class="btn" id="rg-med-novo" style="margin-top:12px">Adicionar profissional</button>
      </div>

      <!-- 3. Papéis -->
      <div class="card" style="margin-bottom:20px">
        <h3 class="card-title">Percentuais por papel e forma de cobrança</h3>
        <p class="card-subtitle">
          O percentual do cirurgião vem da tabela de procedimentos. Auxiliar e anestesista
          dependem de como a conta foi cobrada — é o que está aqui.
        </p>
        <div class="rp-tabela-wrap" style="margin-top:14px">
          <table class="rp-tabela">
            <thead><tr><th>Forma de cobrança</th><th>Convênio</th><th>Papel</th>
                       <th class="rp-num">Percentual</th><th>Observação</th><th></th></tr></thead>
            <tbody>
              ${papeis.map(p => `
                <tr>
                  <td>${RepasseMotor.CENARIOS[p.cenario] || p.cenario}</td>
                  <td>${p.convenio ? Utilidades.esc(p.convenio) : '<span class="small muted">todos</span>'}</td>
                  <td class="rp-forte">${rotuloPapel[p.papel] || p.papel}</td>
                  <td class="rp-num">${Utilidades.formatarPercentual(p.percentual)}</td>
                  <td class="small muted">${Utilidades.esc(p.observacao || '')}</td>
                  <td><button class="btn small" data-papel-editar="${p.id}" style="padding:3px 10px">Editar</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 4. Exceções -->
      <div class="card" style="margin-bottom:20px">
        <h3 class="card-title">Quem executou não é quem está na conta</h3>
        <p class="card-subtitle">
          Casos em que o demonstrativo traz um profissional, mas o procedimento foi feito
          por outro. Sem isto, o repasse iria para a pessoa errada.
        </p>
        <div class="rp-tabela-wrap" style="margin-top:14px">
          <table class="rp-tabela">
            <thead><tr><th>Convênio</th><th>Código</th><th>Aparece na conta</th>
                       <th>Recebe o repasse</th><th>Observação</th></tr></thead>
            <tbody>
              ${excecoes.map(e => `
                <tr>
                  <td>${Utilidades.esc(e.convenio || 'todos')}</td>
                  <td>${Utilidades.esc(e.codigo || 'qualquer')}</td>
                  <td>${Utilidades.esc(e.medico_conta)}</td>
                  <td class="rp-forte">${Utilidades.esc(e.medico_real)}</td>
                  <td class="small muted">${Utilidades.esc(e.observacao || '')}</td>
                </tr>`).join('')}
              ${excecoes.length ? '' : '<tr><td colspan="5" class="small muted">Nenhuma exceção cadastrada.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 5. Sem repasse -->
      <div class="card">
        <h3 class="card-title">Convênios sem repasse pelo hospital</h3>
        <p class="card-subtitle">
          Credenciados diretos: o convênio paga o profissional, então nada é calculado aqui.
        </p>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          ${semRep.map(c => `
            <span class="rp-tag neutro" style="font-size:12px;padding:5px 12px">
              ${Utilidades.esc(c.convenio)}
              <button data-semrep-apagar="${c.id}"
                      style="border:none;background:none;cursor:pointer;color:var(--danger);font-weight:700">×</button>
            </span>`).join('')}
          ${semRep.length ? '' : '<span class="small muted">Nenhum convênio nesta lista.</span>'}
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="text" id="rg-semrep-nome" placeholder="Nome do convênio"
                 style="padding:6px 10px;border:1px solid var(--border-strong);border-radius:4px;font-size:13px">
          <button class="btn" id="rg-semrep-add" style="padding:5px 12px">Adicionar</button>
        </div>
      </div>
    </div>
  `;

  ligarEventos();

  // ==========================================================================

  function ligarEventos() {
    const input = document.getElementById('rg-arquivo');
    document.getElementById('rg-importar').onclick = () => input.click();
    input.onchange = () => { if (input.files[0]) importarRegras(input.files[0]); };

    document.querySelectorAll('[data-papel-editar]').forEach(b => {
      b.onclick = () => {
        const id = Number(b.dataset.papelEditar);
        const p = Banco.queryUnica('SELECT * FROM regras_papel WHERE id = ?', [id]);
        const v = prompt(
          `Percentual para ${rotuloPapel[p.papel] || p.papel} em ` +
          `"${RepasseMotor.CENARIOS[p.cenario] || p.cenario}"` +
          `${p.convenio ? ' (' + p.convenio + ')' : ''}:`,
          String(p.percentual));
        if (v === null) return;
        const n = Utilidades.parseNumBR(v, null);
        if (n === null || n < 0 || n > 100) { Utilidades.toast('Percentual inválido.', 'erro'); return; }
        Banco.executar('UPDATE regras_papel SET percentual = ? WHERE id = ?', [n, id]);
        Utilidades.toast('Percentual atualizado.', 'sucesso');
        App.recarregar();
      };
    });

    document.getElementById('rg-med-novo').onclick = () => {
      const nome = prompt('Nome do profissional (como aparece na produção):');
      if (!nome) return;
      const pct = Utilidades.parseNumBR(prompt('Percentual sobre o valor integral da conta:', '32'), null);
      if (pct === null || pct < 0 || pct > 100) { Utilidades.toast('Percentual inválido.', 'erro'); return; }
      Banco.executar(
        `INSERT INTO regras_medico (medico, medico_norm, percentual, base, observacao)
         VALUES (?,?,?, 'TOTAL_GUIA', ?)`,
        [nome.trim(), Utilidades.normalizar(nome), pct, 'Cadastrado na tela de Regras.']);
      Utilidades.toast('Regra criada.', 'sucesso');
      App.recarregar();
    };

    document.querySelectorAll('[data-med-editar]').forEach(b => {
      b.onclick = () => {
        const id = Number(b.dataset.medEditar);
        const m = Banco.queryUnica('SELECT * FROM regras_medico WHERE id = ?', [id]);
        const v = prompt(`Percentual de ${m.medico}:`, String(m.percentual));
        if (v === null) return;
        const n = Utilidades.parseNumBR(v, null);
        if (n === null || n < 0 || n > 100) { Utilidades.toast('Percentual inválido.', 'erro'); return; }
        Banco.executar('UPDATE regras_medico SET percentual = ? WHERE id = ?', [n, id]);
        App.recarregar();
      };
    });

    document.querySelectorAll('[data-med-apagar]').forEach(b => {
      b.onclick = () => {
        const id = Number(b.dataset.medApagar);
        const m = Banco.queryUnica('SELECT * FROM regras_medico WHERE id = ?', [id]);
        if (!confirm(`Remover a regra de ${m.medico}?`)) return;
        Banco.executar('DELETE FROM regras_medico WHERE id = ?', [id]);
        App.recarregar();
      };
    });

    document.getElementById('rg-semrep-add').onclick = () => {
      const nome = document.getElementById('rg-semrep-nome').value.trim();
      if (!nome) return;
      Banco.executar(
        `INSERT OR IGNORE INTO convenios_sem_repasse (convenio, convenio_norm, observacao)
         VALUES (?,?,?)`,
        [nome, Utilidades.normalizar(nome), 'Cadastrado na tela de Regras.']);
      App.recarregar();
    };

    document.querySelectorAll('[data-semrep-apagar]').forEach(b => {
      b.onclick = () => {
        Banco.executar('DELETE FROM convenios_sem_repasse WHERE id = ?', [Number(b.dataset.semrepApagar)]);
        App.recarregar();
      };
    });
  }

  async function importarRegras(arquivo) {
    const status = document.getElementById('rg-status');
    status.innerHTML = `<div class="rp-aviso">Lendo ${Utilidades.esc(arquivo.name)}… pode levar alguns segundos.</div>`;
    await Utilidades.aguardarPintura();

    try {
      const lido = await ImportadorRegras.ler(arquivo);
      status.innerHTML = `<div class="rp-aviso">Gravando ${Utilidades.formatarNumero(lido.registros.length, 0)} percentuais…</div>`;
      await Utilidades.aguardarPintura();

      const rel = ImportadorRegras.gravar(lido);
      Utilidades.toast(
        `${Utilidades.formatarNumero(rel.registros, 0)} percentuais de ${rel.convenios.length} convênios.`,
        'sucesso', 5000);
      App.recarregar();
    } catch (e) {
      console.error(e);
      status.innerHTML = `<div class="rp-aviso erro">${Utilidades.esc(e.message).replace(/\n/g, '<br>')}</div>`;
    }
  }
};
