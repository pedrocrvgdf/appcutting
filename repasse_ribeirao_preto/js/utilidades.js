/**
 * ============================================================================
 * UTILIDADES
 * Funções de uso geral: normalização de texto, comparação de nomes, formatação
 * e avisos de tela.
 * ============================================================================
 */
const Utilidades = {

  /** Converte número em formato brasileiro ("1.234,56") para Number. */
  parseNumBR(v, padrao = null) {
    if (v === null || v === undefined || v === '') return padrao;
    if (typeof v === 'number') return isNaN(v) ? padrao : v;
    const s = String(v).trim();
    if (!s) return padrao;
    // "1.234,56" (BR) e "1234.56" (US) coexistem nos relatórios exportados.
    const limpo = s.includes(',')
      ? s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
      : s.replace(/[^\d.-]/g, '');
    const n = parseFloat(limpo);
    return isNaN(n) ? padrao : n;
  },

  /**
   * Normaliza texto para comparação: maiúsculas, sem acento, sem pontuação,
   * espaços colapsados. É a base de todo casamento de nomes da ferramenta.
   */
  normalizar(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
      .toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Partículas que não ajudam a identificar uma pessoa e atrapalham a
   * comparação ("MARIA DA SILVA" x "MARIA SILVA" são a mesma pessoa).
   */
  PARTICULAS: new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E', 'DI', 'DEL', 'LA']),

  /** Nome reduzido aos seus tokens significativos. */
  tokensNome(nome) {
    return this.normalizar(nome)
      .split(' ')
      .filter(t => t && !this.PARTICULAS.has(t));
  },

  /**
   * Semelhança entre dois nomes de pessoa, de 0 a 1.
   *
   * Não é uma comparação de strings qualquer: nomes de paciente divergem de
   * forma previsível entre o demonstrativo do convênio e o sistema do
   * hospital — abreviações ("JOSE A. GREGHI"), sobrenome faltando, ordem
   * trocada. Por isso a comparação é por TOKEN, e não caractere a caractere.
   *
   * Exige que primeiro e último nome combinem para pontuar alto: é o que
   * separa "MARIA JOSE BOTTINO" de "MARIA JOSE ROCHA".
   */
  similaridadeNome(a, b) {
    const ta = this.tokensNome(a);
    const tb = this.tokensNome(b);
    if (!ta.length || !tb.length) return 0;

    const casa = (x, y) => {
      if (x === y) return 1;
      // Abreviação: "J" casa com "JOSE"; "ANT" casa com "ANTONIO".
      if (x.length === 1 || y.length === 1) return x[0] === y[0] ? 0.6 : 0;
      if (x.startsWith(y) || y.startsWith(x)) return 0.9;
      const sim = this.similaridade(x, y);
      return sim >= 0.85 ? sim : 0;   // tolera erro de digitação, não nome diferente
    };

    // Cada token do nome mais curto busca seu melhor par no outro nome.
    const menor = ta.length <= tb.length ? ta : tb;
    const maior = ta.length <= tb.length ? tb : ta;
    const usados = new Set();
    let soma = 0;

    for (const t of menor) {
      let melhor = 0, melhorIdx = -1;
      for (let i = 0; i < maior.length; i++) {
        if (usados.has(i)) continue;
        const s = casa(t, maior[i]);
        if (s > melhor) { melhor = s; melhorIdx = i; }
      }
      if (melhorIdx >= 0) { usados.add(melhorIdx); soma += melhor; }
    }

    let score = soma / menor.length;

    // Primeiro e último nome são os âncoras da identidade. Sem eles, o
    // resultado é rebaixado para não virar casamento automático.
    const primeiroBate = casa(ta[0], tb[0]) >= 0.6;
    const ultimoBate   = casa(ta[ta.length - 1], tb[tb.length - 1]) >= 0.6;
    if (!primeiroBate) score *= 0.5;
    if (!ultimoBate)   score *= 0.75;

    return Math.max(0, Math.min(1, score));
  },

  /** Semelhança entre duas strings (0 a 1), por distância de edição. */
  similaridade(a, b) {
    const x = this.normalizar(a);
    const y = this.normalizar(b);
    if (!x && !y) return 1;
    if (!x || !y) return 0;
    if (x === y) return 1;
    const dist = this._levenshtein(x, y);
    return 1 - dist / Math.max(x.length, y.length);
  },

  _levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let anterior = Array.from({ length: n + 1 }, (_, i) => i);
    const atual = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      atual[0] = i;
      for (let j = 1; j <= n; j++) {
        const custo = a[i - 1] === b[j - 1] ? 0 : 1;
        atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
      }
      anterior = atual.slice();
    }
    return anterior[n];
  },

  // ==========================================================================

  formatarMoeda(valor) {
    const n = Number(valor);
    if (!isFinite(n)) return 'R$ 0,00';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  formatarNumero(n, casas = 2) {
    const v = Number(n);
    if (!isFinite(v)) return '0';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  },

  formatarPercentual(p) {
    const n = Number(p);
    if (!isFinite(n)) return '0%';
    return `${this.formatarNumero(n, n % 1 === 0 ? 0 : 2)}%`;
  },

  /** Converte data em ISO (AAAA-MM-DD). Aceita dd/mm/aaaa, Date e serial Excel. */
  dataISO(valor) {
    if (!valor) return null;
    if (valor instanceof Date && !isNaN(valor)) return valor.toISOString().slice(0, 10);
    if (typeof valor === 'number') {
      // Serial do Excel: dias desde 1899-12-30.
      const d = new Date(Math.round((valor - 25569) * 86400 * 1000));
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    }
    const s = String(valor).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  },

  /** Data ISO → dd/mm/aaaa. */
  dataBR(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
  },

  /** Competência (AAAA-MM) de uma data qualquer. */
  competencia(valor) {
    const iso = this.dataISO(valor);
    return iso ? iso.slice(0, 7) : null;
  },

  /** Competência (AAAA-MM) → "Abril/2026". */
  competenciaExtenso(comp) {
    if (!comp) return '';
    const [ano, mes] = String(comp).split('-');
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const nome = meses[Number(mes) - 1];
    return nome ? `${nome}/${ano}` : comp;
  },

  /** Diferença em dias entre duas datas ISO (valor absoluto). */
  diasEntre(isoA, isoB) {
    if (!isoA || !isoB) return null;
    const a = new Date(isoA + 'T00:00:00Z');
    const b = new Date(isoB + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.abs(Math.round((a - b) / 86400000));
  },

  /** Escapa texto para interpolação segura em HTML. */
  esc(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  sanitizarNomeArquivo(nome) {
    return String(nome || 'arquivo')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\-. ]/g, '_').replace(/\s+/g, '_').slice(0, 120);
  },

  // ==========================================================================

  toast(mensagem, tipo = 'info', duracao = 3600) {
    this.garantirEstilos('u-toast', `
      .u-toast-wrap{position:fixed;right:20px;bottom:20px;z-index:9999;display:flex;
        flex-direction:column;gap:8px;pointer-events:none}
      .u-toast{background:#1f2937;color:#fff;padding:12px 16px;border-radius:10px;
        font-size:13.5px;box-shadow:0 8px 28px rgba(0,0,0,.22);max-width:420px;
        animation:u-toast-in .18s ease-out}
      .u-toast.sucesso{background:#12694f}
      .u-toast.erro{background:#9B3A3A}
      .u-toast.aviso{background:#8A6840}
      @keyframes u-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    `);
    let wrap = document.querySelector('.u-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'u-toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = `u-toast ${tipo}`;
    el.textContent = mensagem;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), duracao);
  },

  mostrarLoading(mensagem = 'Carregando') {
    this.garantirEstilos('u-load', `
      .u-load{position:fixed;inset:0;background:rgba(255,255,255,.86);z-index:9998;
        display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px}
      [data-theme="dark"] .u-load{background:rgba(17,24,39,.88)}
      .u-load-sp{width:34px;height:34px;border:3px solid rgba(0,0,0,.12);
        border-top-color:var(--brand,#12694f);border-radius:50%;animation:u-spin .7s linear infinite}
      .u-load-msg{font-size:14px;color:var(--ink-soft,#555)}
      @keyframes u-spin{to{transform:rotate(360deg)}}
    `);
    let el = document.querySelector('.u-load');
    if (!el) {
      el = document.createElement('div');
      el.className = 'u-load';
      el.innerHTML = `<div class="u-load-sp"></div><div class="u-load-msg"></div>`;
      document.body.appendChild(el);
    }
    el.querySelector('.u-load-msg').textContent = mensagem;
    el.style.display = 'flex';
    return el;
  },

  esconderLoading() {
    const el = document.querySelector('.u-load');
    if (el) el.style.display = 'none';
  },

  /** Dá ao navegador a chance de pintar a tela antes de um trabalho pesado. */
  aguardarPintura() {
    return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  },

  garantirEstilos(id, css) {
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  },

  /** Dispara o download de um Blob com o nome informado. */
  baixarArquivo(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },
};

window.Utilidades = Utilidades;
