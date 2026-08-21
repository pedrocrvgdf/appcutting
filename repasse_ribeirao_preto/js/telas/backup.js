/**
 * ============================================================================
 * TELA: Backup
 *
 * Os dados vivem no navegador desta máquina. Isso mantém tudo offline e sem
 * servidor, mas significa que limpar os dados de navegação apaga o banco.
 * Exportar o .db ao fim de cada fechamento é o que separa "refazer um clique"
 * de "refazer o mês".
 * ============================================================================
 */

App.telas['backup'] = function () {
  const r = Banco.resumo();
  const rotulos = {
    demonstrativos: 'Demonstrativos importados',
    guias_demonstrativo: 'Guias',
    itens_demonstrativo: 'Itens de guia',
    linhas_producao: 'Linhas de produção',
    conciliacoes: 'Casamentos registrados',
    tabela_percentuais: 'Percentuais de repasse',
    regras_papel: 'Regras por papel',
    regras_medico: 'Regras por profissional',
    de_para_pacientes: 'Correções de nome aprendidas',
    medicos: 'Médicos cadastrados',
  };

  const importacoes = Banco.query(
    'SELECT * FROM importacoes ORDER BY id DESC LIMIT 15');

  App.alvoConteudo().innerHTML = `
    <div class="page-content">
      ${App.cabecalho('Backup', 'Uma cópia do banco em arquivo, guardada onde você escolher')}

      <div class="card" style="margin-bottom:20px;background:var(--warning-soft);border-color:var(--warning)">
        <h3 class="card-title">Leia antes</h3>
        <p class="card-subtitle">
          Os dados ficam <strong>apenas neste navegador, neste computador</strong>. Outro
          navegador, outra máquina ou uma limpeza de dados de navegação não enxergam nada
          do que está aqui. Exporte o arquivo <code>.db</code> ao fim de cada fechamento e
          guarde-o numa pasta de rede ou no OneDrive.
        </p>
      </div>

      <div class="card" style="margin-bottom:20px">
        <h3 class="card-title">O que existe no banco</h3>
        <div class="rp-tabela-wrap" style="margin-top:14px">
          <table class="rp-tabela">
            <thead><tr><th>Conteúdo</th><th class="rp-num">Registros</th></tr></thead>
            <tbody>
              ${Object.entries(rotulos).map(([t, rot]) => `
                <tr>
                  <td>${rot}</td>
                  <td class="rp-num">${Utilidades.formatarNumero(r[t] || 0, 0)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <h3 class="card-title">Exportar</h3>
        <p class="card-subtitle">Gera um arquivo .db com absolutamente tudo — dados, regras e decisões de conciliação.</p>
        <div style="margin-top:14px">
          <button class="btn btn-primary" id="bk-exportar">Exportar arquivo .db</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <h3 class="card-title">Restaurar</h3>
        <p class="card-subtitle">
          Substitui o banco atual pelo conteúdo de um arquivo .db. O que estiver aqui agora
          será perdido — exporte antes, se ainda não exportou.
        </p>
        <div style="margin-top:14px">
          <input type="file" id="bk-arquivo" accept=".db,.sqlite,.sqlite3" style="display:none">
          <button class="btn" id="bk-importar">Escolher arquivo .db</button>
        </div>
      </div>

      ${importacoes.length ? `
        <div class="card" style="margin-bottom:20px">
          <h3 class="card-title">Histórico de importações</h3>
          <div class="rp-tabela-wrap" style="margin-top:14px">
            <table class="rp-tabela">
              <thead><tr><th>Quando</th><th>Tipo</th><th>Arquivo</th><th>Resumo</th></tr></thead>
              <tbody>
                ${importacoes.map(i => `
                  <tr>
                    <td>${new Date(i.importado_em).toLocaleString('pt-BR')}</td>
                    <td><span class="rp-tag neutro">${Utilidades.esc(i.tipo)}</span></td>
                    <td>${Utilidades.esc(i.arquivo)}</td>
                    <td class="small muted">${Utilidades.esc(i.resumo || '')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

      <div class="card" style="border-color:var(--danger)">
        <h3 class="card-title">Apagar tudo</h3>
        <p class="card-subtitle">Zera o banco e recria as regras iniciais. Não tem volta sem um backup.</p>
        <div style="margin-top:14px">
          <button class="btn" id="bk-resetar" style="color:var(--danger);border-color:var(--danger)">
            Apagar tudo e recomeçar
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('bk-exportar').onclick = () => {
    const blob = Banco.exportar();
    const nome = `repasse_horp_${new Date().toISOString().slice(0, 10)}.db`;
    Utilidades.baixarArquivo(blob, nome);
    Utilidades.toast('Backup gerado.', 'sucesso');
  };

  const input = document.getElementById('bk-arquivo');
  document.getElementById('bk-importar').onclick = () => input.click();
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    if (!confirm(`Restaurar a partir de "${f.name}"?\n\nTudo que está no banco agora será substituído.`)) return;

    Utilidades.mostrarLoading('Restaurando banco…');
    try {
      await Banco.importar(await f.arrayBuffer());
      Utilidades.esconderLoading();
      Utilidades.toast('Banco restaurado.', 'sucesso');
      App.ir('painel');
    } catch (e) {
      Utilidades.esconderLoading();
      console.error(e);
      Utilidades.toast('Arquivo inválido: ' + e.message, 'erro', 6000);
    }
  };

  document.getElementById('bk-resetar').onclick = async () => {
    if (!confirm('Apagar TODOS os dados desta ferramenta?')) return;
    if (!confirm('Confirma? Demonstrativos, produção, regras e conciliações serão perdidos.')) return;

    Utilidades.mostrarLoading('Apagando…');
    await Banco.resetar();
    Utilidades.esconderLoading();
    Utilidades.toast('Banco zerado.', 'sucesso');
    App.ir('painel');
  };
};
