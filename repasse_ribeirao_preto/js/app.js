/**
 * ============================================================================
 * APP — navegação e inicialização
 *
 * Cada tela é uma função registrada em App.telas['nome'] que desenha a si
 * mesma dentro da área de conteúdo. Trocar de tela é chamar App.ir('nome').
 * ============================================================================
 */

const App = {

  telas: {},
  telaAtual: null,

  MENU: [
    { grupo: 'Acompanhar', itens: [
      { id: 'painel',      rotulo: 'Painel',            icone: '◱' },
      { id: 'repasse',     rotulo: 'Repasse',           icone: '∑' },
    ]},
    { grupo: 'Entrada de dados', itens: [
      { id: 'importar_demonstrativo', rotulo: 'Demonstrativo (PDF)', icone: '↓' },
      { id: 'importar_producao',      rotulo: 'Produção (Excel)',    icone: '↓' },
    ]},
    { grupo: 'Conferência', itens: [
      { id: 'conciliacao', rotulo: 'Revisão de casamentos', icone: '⇄', badge: 'pendentes' },
      { id: 'guias',       rotulo: 'Guias pagas',           icone: '☰' },
    ]},
    { grupo: 'Configuração', itens: [
      { id: 'regras',      rotulo: 'Regras de repasse', icone: '§' },
      { id: 'backup',      rotulo: 'Backup',            icone: '⛁' },
    ]},
  ],

  // ==========================================================================

  async iniciar() {
    try {
      await Banco.inicializar();
    } catch (e) {
      document.getElementById('app').innerHTML = `
        <div style="padding:40px;font-family:system-ui">
          <h2>Não foi possível abrir o banco de dados</h2>
          <p>${Utilidades.esc(e.message)}</p>
          <p class="small muted">Confira se a pasta <strong>libs</strong> está junto do index.html.</p>
        </div>`;
      return;
    }

    this._desenharEstrutura();
    const inicial = (location.hash || '').replace('#', '') || 'painel';
    this.ir(this.telas[inicial] ? inicial : 'painel');

    window.addEventListener('hashchange', () => {
      const alvo = (location.hash || '').replace('#', '');
      if (alvo && alvo !== this.telaAtual) this.ir(alvo);
    });
  },

  _desenharEstrutura() {
    document.getElementById('app').innerHTML = `
      <div class="rp-shell">
        <aside class="rp-menu">
          <div class="rp-marca">
            <div class="rp-marca-nome">Repasse Médico</div>
            <div class="rp-marca-unid" id="rp-unidade">Ribeirão Preto</div>
          </div>
          <nav id="rp-nav"></nav>
          <div class="rp-rodape">
            <div class="rp-rodape-txt">Dados guardados neste navegador</div>
          </div>
        </aside>
        <main class="rp-conteudo" id="rp-conteudo"></main>
      </div>
    `;
    this._desenharMenu();
  },

  _desenharMenu() {
    const pendentes = this._qtdPendentes();
    const html = this.MENU.map(grupo => `
      <div class="rp-menu-grupo">
        <div class="rp-menu-titulo">${grupo.grupo}</div>
        ${grupo.itens.map(item => `
          <a class="rp-menu-item ${this.telaAtual === item.id ? 'ativo' : ''}"
             href="#${item.id}" data-tela="${item.id}">
            <span class="rp-menu-ico">${item.icone}</span>
            <span>${item.rotulo}</span>
            ${item.badge === 'pendentes' && pendentes
              ? `<span class="rp-badge">${pendentes}</span>` : ''}
          </a>
        `).join('')}
      </div>
    `).join('');
    document.getElementById('rp-nav').innerHTML = html;
  },

  _qtdPendentes() {
    try {
      return Banco.contar('conciliacoes', "status IN ('PENDENTE','SEM_CORRESPONDENCIA')");
    } catch (_) { return 0; }
  },

  alvoConteudo() {
    return document.getElementById('rp-conteudo');
  },

  ir(tela) {
    const fn = this.telas[tela];
    if (!fn) {
      this.alvoConteudo().innerHTML = `
        <div class="page-content">
          <div class="card">
            <h3 class="card-title">Tela não encontrada</h3>
            <p class="card-subtitle">A tela <code>${Utilidades.esc(tela)}</code> não está registrada.</p>
          </div>
        </div>`;
      return;
    }
    this.telaAtual = tela;
    if (location.hash !== '#' + tela) location.hash = tela;
    this._desenharMenu();
    try {
      fn();
    } catch (e) {
      console.error(e);
      this.alvoConteudo().innerHTML = `
        <div class="page-content">
          <div class="card" style="border-color:#9B3A3A">
            <h3 class="card-title">Erro ao abrir a tela</h3>
            <p class="card-subtitle">${Utilidades.esc(e.message)}</p>
          </div>
        </div>`;
    }
    this.alvoConteudo().scrollTop = 0;
  },

  /** Redesenha a tela atual (após uma alteração de dados). */
  recarregar() {
    if (this.telaAtual) this.ir(this.telaAtual);
  },

  // ==========================================================================
  // Componentes reutilizados pelas telas
  // ==========================================================================

  cabecalho(titulo, subtitulo, acoesHtml = '') {
    return `
      <header class="page-header">
        <div>
          <h2>${titulo}</h2>
          ${subtitulo ? `<div class="subtitle">${subtitulo}</div>` : ''}
        </div>
        ${acoesHtml ? `<div class="page-acoes">${acoesHtml}</div>` : ''}
      </header>`;
  },

  kpi(rotulo, valor, detalhe = '', variante = '') {
    return `
      <div class="rp-kpi ${variante}">
        <div class="rp-kpi-lbl">${rotulo}</div>
        <div class="rp-kpi-val">${valor}</div>
        ${detalhe ? `<div class="rp-kpi-det">${detalhe}</div>` : ''}
      </div>`;
  },

  vazio(titulo, texto, acaoHtml = '') {
    return `
      <div class="rp-vazio">
        <div class="rp-vazio-tit">${titulo}</div>
        <div class="rp-vazio-txt">${texto}</div>
        ${acaoHtml ? `<div style="margin-top:16px">${acaoHtml}</div>` : ''}
      </div>`;
  },

  /** Lista de competências presentes no banco (para os seletores). */
  competencias() {
    return Banco.query(`
      SELECT DISTINCT competencia FROM guias_demonstrativo
       WHERE competencia IS NOT NULL AND competencia <> ''
       ORDER BY competencia DESC
    `).map(l => l.competencia);
  },
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => App.iniciar());
