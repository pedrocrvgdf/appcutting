/**
 * ============================================================================
 * BANCO — SQLite rodando dentro do navegador (sql.js / WebAssembly)
 *
 * O banco inteiro vive em memória e é gravado como um arquivo .db dentro do
 * IndexedDB do navegador. Nada sai da máquina do usuário.
 *
 * Consequência prática, que aparece na tela de Backup: os dados pertencem a
 * ESTE navegador, neste computador. Trocar de navegador ou limpar os dados de
 * navegação zera tudo — por isso o backup em arquivo .db não é opcional.
 * ============================================================================
 */

const Banco = {

  db: null,
  IDB_NOME: 'repasse_rp',
  IDB_STORE: 'banco',
  IDB_CHAVE: 'principal',

  _salvarTimer: null,
  _ultimoTamanho: 0,
  _salvando: null,        // gravação em andamento (ver salvar())
  _precisaSalvar: false,  // há estado mais novo esperando gravação

  // ==========================================================================
  // Inicialização
  // ==========================================================================

  async inicializar() {
    if (this.db) return this.db;

    const SQL = await initSqlJs({
      // O binário WASM vem embutido em base64 (libs/sql-wasm-b64.js) porque a
      // ferramenta precisa abrir por duplo clique no index.html, e nesse modo
      // o navegador bloqueia o download de arquivos locais.
      wasmBinary: window.__SQL_WASM_B64 ? this._base64ParaBytes(window.__SQL_WASM_B64) : undefined,
    });

    const salvo = await this._lerDoIndexedDB();
    this.db = salvo ? new SQL.Database(salvo) : new SQL.Database();

    Schema.criar(this.db);
    if (!salvo) await this.salvar({ imediato: true });

    return this.db;
  },

  _base64ParaBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  },

  // ==========================================================================
  // Consultas
  // ==========================================================================

  /** Roda um SELECT e devolve um array de objetos. */
  query(sql, params = []) {
    if (!this.db) return [];
    const stmt = this.db.prepare(sql);
    try {
      if (params && params.length) stmt.bind(params);
      const linhas = [];
      while (stmt.step()) linhas.push(stmt.getAsObject());
      return linhas;
    } finally {
      stmt.free();
    }
  },

  /** Primeira linha do SELECT, ou null. */
  queryUnica(sql, params = []) {
    const r = this.query(sql, params);
    return r.length ? r[0] : null;
  },

  /** Valor da primeira coluna da primeira linha. */
  valor(sql, params = []) {
    const r = this.queryUnica(sql, params);
    if (!r) return null;
    const chaves = Object.keys(r);
    return chaves.length ? r[chaves[0]] : null;
  },

  /** Executa INSERT/UPDATE/DELETE. */
  executar(sql, params = []) {
    if (!this.db) throw new Error('Banco não inicializado');
    const stmt = this.db.prepare(sql);
    try {
      if (params && params.length) stmt.bind(params);
      stmt.step();
    } finally {
      stmt.free();
    }
    this.salvarDebounced();
  },

  /** Id gerado pelo último INSERT. */
  ultimoId() {
    return this.valor('SELECT last_insert_rowid() AS id');
  },

  contar(tabela, where = '', params = []) {
    const sql = `SELECT COUNT(*) AS n FROM ${tabela}` + (where ? ` WHERE ${where}` : '');
    return Number(this.valor(sql, params) || 0);
  },

  /**
   * Roda várias escritas numa transação única.
   * Importações grandes sem isto ficam lentas (cada linha vira um commit) e,
   * pior, podem parar no meio deixando dados pela metade.
   */
  emTransacao(fn) {
    this.db.exec('BEGIN');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch (_) {}
      throw e;
    }
  },

  // ==========================================================================
  // Config (chave/valor)
  // ==========================================================================

  config(chave, padrao = null) {
    const v = this.valor('SELECT valor FROM config WHERE chave = ?', [chave]);
    return v === null || v === undefined ? padrao : v;
  },

  setConfig(chave, valor) {
    this.executar(
      'INSERT INTO config (chave, valor) VALUES (?, ?) ' +
      'ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
      [chave, String(valor)]
    );
  },

  // ==========================================================================
  // Persistência
  // ==========================================================================

  salvarDebounced(ms = 600) {
    clearTimeout(this._salvarTimer);
    this._salvarTimer = setTimeout(() => this.salvar(), ms);
  },

  /**
   * Grava o banco no navegador.
   *
   * As gravações são SERIALIZADAS de propósito. O banco desta unidade passa de
   * 100 MB (a produção tem mais de cem mil linhas), e uma gravação leva alguns
   * segundos. Se duas rodassem em paralelo — o que acontece quando a importação
   * do demonstrativo é seguida da conciliação — a mais antiga poderia terminar
   * por último e apagar o resultado da mais nova. Foi exatamente assim que as
   * conciliações sumiam ao reabrir a ferramenta.
   *
   * Enquanto uma gravação está em andamento, novos pedidos apenas marcam que há
   * algo mais recente a gravar; ao terminar, o laço grava o estado final. Assim
   * o que fica salvo é sempre a última versão, e nunca duas ao mesmo tempo.
   */
  async salvar(opts = {}) {
    if (!this.db) return;
    if (!opts.imediato) clearTimeout(this._salvarTimer);

    this._precisaSalvar = true;
    if (this._salvando) return this._salvando;

    this._salvando = (async () => {
      try {
        while (this._precisaSalvar) {
          this._precisaSalvar = false;
          const bytes = this.db.export();
          this._ultimoTamanho = bytes.length;
          await this._gravarNoIndexedDB(bytes);
        }
      } catch (e) {
        // Falhar aqui significa perder trabalho sem avisar — o usuário precisa saber.
        console.error('Falha ao gravar o banco:', e);
        if (window.Utilidades) {
          Utilidades.toast(
            'Não foi possível gravar os dados no navegador. Exporte um backup agora.',
            'erro', 9000);
        }
        throw e;
      } finally {
        this._salvando = null;
      }
    })();

    return this._salvando;
  },

  /** Exporta o banco como Blob (.db) para download. */
  exportar() {
    const bytes = this.db.export();
    return new Blob([bytes], { type: 'application/x-sqlite3' });
  },

  /** Substitui o banco atual pelo conteúdo de um arquivo .db. */
  async importar(arrayBuffer) {
    const SQL = await initSqlJs({
      wasmBinary: window.__SQL_WASM_B64 ? this._base64ParaBytes(window.__SQL_WASM_B64) : undefined,
    });
    const bytes = new Uint8Array(arrayBuffer);
    // Valida antes de trocar: um arquivo inválido não pode derrubar o banco bom.
    const novo = new SQL.Database(bytes);
    novo.exec('SELECT name FROM sqlite_master LIMIT 1');
    if (this.db) this.db.close();
    this.db = novo;
    Schema.criar(this.db);
    await this.salvar({ imediato: true });
  },

  async resetar() {
    if (this.db) this.db.close();
    const SQL = await initSqlJs({
      wasmBinary: window.__SQL_WASM_B64 ? this._base64ParaBytes(window.__SQL_WASM_B64) : undefined,
    });
    this.db = new SQL.Database();
    Schema.criar(this.db);
    await this.salvar({ imediato: true });
  },

  /** Contagem por tabela — alimenta o painel inicial. */
  resumo() {
    const tabelas = [
      'demonstrativos', 'guias_demonstrativo', 'itens_demonstrativo',
      'linhas_producao', 'conciliacoes', 'de_para_pacientes',
      'tabela_percentuais', 'regras_papel', 'regras_medico', 'medicos',
    ];
    const r = {};
    for (const t of tabelas) {
      try { r[t] = this.contar(t); } catch (_) { r[t] = 0; }
    }
    return r;
  },

  // ── IndexedDB ─────────────────────────────────────────────────────────

  _abrirIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.IDB_NOME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.IDB_STORE)) db.createObjectStore(this.IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async _gravarNoIndexedDB(bytes) {
    const db = await this._abrirIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.IDB_STORE, 'readwrite');
      tx.objectStore(this.IDB_STORE).put(bytes, this.IDB_CHAVE);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },

  async _lerDoIndexedDB() {
    try {
      const db = await this._abrirIDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.IDB_STORE, 'readonly');
        const req = tx.objectStore(this.IDB_STORE).get(this.IDB_CHAVE);
        req.onsuccess = () => { db.close(); resolve(req.result || null); };
        req.onerror = () => { db.close(); reject(req.error); };
      });
    } catch (e) {
      console.warn('Não foi possível ler o banco salvo:', e);
      return null;
    }
  },
};

window.Banco = Banco;
