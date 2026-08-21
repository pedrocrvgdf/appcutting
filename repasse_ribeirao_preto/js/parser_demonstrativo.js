/**
 * ============================================================================
 * PARSER do DEMONSTRATIVO DE PAGAMENTO (padrão TISS)
 *
 * Lê o "Demonstrativo de Análise de Conta" que a operadora envia em PDF e
 * devolve uma estrutura navegável: protocolos → guias → itens.
 *
 * Por que este módulo existe
 * --------------------------
 * No CBV existe um setor de quitação: o recebimento é baixado no sistema e a
 * ferramenta consome um relatório de RECEBIDOS. Nesta unidade não há quitação —
 * a única prova de que o convênio pagou é o demonstrativo. Então este parser
 * ocupa o lugar daquele relatório: é ele que responde "o que foi efetivamente
 * pago, e de qual paciente".
 *
 * Como o PDF é lido
 * -----------------
 * O texto do PDF NÃO é lido na ordem em que aparece no arquivo — essa ordem
 * embaralha as colunas numéricas (o valor liberado gruda no fim da descrição).
 * Em vez disso, cada fragmento de texto é posicionado pelas coordenadas que o
 * próprio PDF informa, as linhas são remontadas por coordenada e cada valor é
 * atribuído à coluna cujo cabeçalho o contém. É isso que garante que
 * "Valor Liberado" nunca seja confundido com "Valor Glosa".
 *
 * Atenção: nestes demonstrativos a página vem ROTACIONADA em 90°. O que o PDF
 * chama de eixo X é a LINHA (de cima para baixo) e o eixo Y é a COLUNA (da
 * esquerda para a direita). O parser trabalha nesse sistema de coordenadas.
 *
 * Entrada esperada (independente de biblioteca de PDF):
 *   paginas = [ [ {x, y, str}, ... ], ... ]
 *
 * Este módulo é PURO: não toca no banco, não toca na tela. Isso o torna
 * testável fora do navegador.
 * ============================================================================
 */
(function (raiz) {
  'use strict';

  /** Tolerância (em unidades do PDF) para considerar dois fragmentos na mesma linha. */
  const TOLERANCIA_LINHA = 3;

  /** Rótulos que marcam cada bloco do demonstrativo. */
  const MARCA = {
    GUIA:            'dados da guia',
    TOTAL_GUIA:      'total da guia',
    TOTAL_PROTOCOLO: 'total do protocolo',
    TOTAL_GERAL:     'total geral',
    LOTE:            'dados do lote',
    PRESTADOR:       'dados do prestador',
  };

  const ParserDemonstrativo = {

    /**
     * Ponto de entrada.
     * @param {Array<Array<{x:number,y:number,str:string}>>} paginas
     * @returns {object} demonstrativo estruturado
     */
    parsear(paginas) {
      if (!Array.isArray(paginas) || !paginas.length) {
        throw new Error('Nenhuma página foi lida do PDF.');
      }

      // Remonta as linhas de todas as páginas numa sequência única. O
      // demonstrativo é um fluxo contínuo: uma guia começa numa página e
      // termina na seguinte, então o parser não pode raciocinar página a página.
      const linhas = [];
      for (const itens of paginas) linhas.push(...this._montarLinhas(itens));

      const doc = {
        cabecalho: {},
        protocolos: [],
        guias: [],
        totalGeral: null,
        avisos: [],
      };

      let protocoloAtual = null;
      let guiaAtual = null;
      let colunasItens = null;   // fronteiras da tabela de itens (muda a cada página)
      let ultimoItem = null;     // para colar as continuações da descrição

      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const texto = linha.texto.toLowerCase();
        const proxima = linhas[i + 1] || null;

        // ── Cabeçalho do documento ────────────────────────────────────────
        if (texto.includes('demonstrativo de análise de conta') ||
            texto.includes('demonstrativo de analise de conta')) {
          const numero = this._acharDepois(linha, /^\d{4,}$/);
          if (numero && !doc.cabecalho.numeroDemonstrativo) {
            doc.cabecalho.numeroDemonstrativo = numero;
          }
          continue;
        }

        if (texto.includes('registro ans') && proxima) {
          const v = this._valoresPorRotulo(linha, proxima);
          doc.cabecalho.registroAns   = doc.cabecalho.registroAns   || v[0] || '';
          doc.cabecalho.operadora     = doc.cabecalho.operadora     || v[1] || '';
          doc.cabecalho.cnpjOperadora = doc.cabecalho.cnpjOperadora || v[2] || '';
          doc.cabecalho.dataEmissao   = doc.cabecalho.dataEmissao   || v[3] || '';
          i++;
          continue;
        }

        if (texto.includes('código na operadora') && proxima) {
          const v = this._valoresPorRotulo(linha, proxima);
          doc.cabecalho.codigoPrestador = doc.cabecalho.codigoPrestador || v[0] || '';
          doc.cabecalho.nomePrestador   = doc.cabecalho.nomePrestador   || v[1] || '';
          doc.cabecalho.cnes            = doc.cabecalho.cnes            || v[2] || '';
          i++;
          continue;
        }

        // ── Lote / protocolo ──────────────────────────────────────────────
        if (texto.includes('número do lote') && proxima) {
          const v = this._valoresPorRotulo(linha, proxima);
          protocoloAtual = {
            numeroLote:         v[0] || '',
            numeroProtocolo:    v[1] || '',
            dataProtocolo:      v[2] || '',
            codigoGlosa:        v[3] || '',
            codigoSituacao:     v[4] || '',
            guias:              [],
            totais:             null,
          };
          doc.protocolos.push(protocoloAtual);
          i++;
          continue;
        }

        // ── Identificação da guia ─────────────────────────────────────────
        if (texto.includes('número da guia no prestador') && proxima) {
          const v = this._valoresPorRotulo(linha, proxima);
          guiaAtual = {
            numeroGuiaPrestador: v[0] || '',
            numeroGuiaOperadora: v[1] || '',
            senha:               v[2] || '',
            beneficiario:        '',
            carteira:            '',
            dataInicioFaturamento: '',
            dataFimFaturamento:    '',
            codigoGlosaGuia:     '',
            codigoSituacaoGuia:  '',
            numeroProtocolo:     protocoloAtual ? protocoloAtual.numeroProtocolo : '',
            numeroLote:          protocoloAtual ? protocoloAtual.numeroLote : '',
            itens:               [],
            totais:              null,
          };
          doc.guias.push(guiaAtual);
          if (protocoloAtual) protocoloAtual.guias.push(guiaAtual);
          ultimoItem = null;
          i++;
          continue;
        }

        if (texto.includes('nome do beneficiário') || texto.includes('nome do beneficiario')) {
          if (guiaAtual && proxima) {
            const v = this._valoresPorRotulo(linha, proxima);
            guiaAtual.beneficiario = v[0] || '';
            guiaAtual.carteira     = v[1] || '';
            i++;
          }
          continue;
        }

        if (texto.includes('data do início do faturamento') ||
            texto.includes('data do inicio do faturamento')) {
          if (guiaAtual && proxima) {
            const v = this._valoresPorRotulo(linha, proxima);
            guiaAtual.dataInicioFaturamento = v[0] || '';
            guiaAtual.dataFimFaturamento    = v[2] || '';
            guiaAtual.codigoGlosaGuia       = v[4] || '';
            guiaAtual.codigoSituacaoGuia    = v[5] || '';
            i++;
          }
          continue;
        }

        // ── Cabeçalho da tabela de itens ──────────────────────────────────
        // Redefine as colunas a cada ocorrência: o cabeçalho se repete em toda
        // página e as coordenadas variam ligeiramente entre elas.
        if (texto.includes('data de realização') || texto.includes('data de realizacao')) {
          colunasItens = this._colunasDaTabelaItens(linha, linhas[i + 1]);
          ultimoItem = null;
          continue;
        }

        // ── Totais ────────────────────────────────────────────────────────
        if (texto.includes('valor informado da guia') && proxima) {
          const v = this._valoresPorRotulo(linha, proxima).map(this._num);
          if (guiaAtual) {
            guiaAtual.totais = {
              informado:  v[0] || 0,
              processado: v[1] || 0,
              liberado:   v[2] || 0,
              glosa:      v[3] || 0,
            };
          }
          ultimoItem = null;
          i++;
          continue;
        }

        if (texto.includes('valor informado do protocolo') && proxima) {
          const v = this._valoresPorRotulo(linha, proxima).map(this._num);
          if (protocoloAtual) {
            protocoloAtual.totais = {
              informado:  v[0] || 0,
              processado: v[1] || 0,
              liberado:   v[2] || 0,
              glosa:      v[3] || 0,
            };
          }
          i++;
          continue;
        }

        if (texto.includes('valor informado geral') && proxima) {
          const v = this._valoresPorRotulo(linha, proxima).map(this._num);
          doc.totalGeral = {
            informado:  v[0] || 0,
            processado: v[1] || 0,
            liberado:   v[2] || 0,
            glosa:      v[3] || 0,
          };
          i++;
          continue;
        }

        // Linhas puramente estruturais não geram item.
        if (texto === MARCA.GUIA || texto === MARCA.TOTAL_GUIA ||
            texto === MARCA.TOTAL_PROTOCOLO || texto === MARCA.TOTAL_GERAL ||
            texto.startsWith(MARCA.LOTE) || texto.startsWith(MARCA.PRESTADOR) ||
            texto.includes('observação / justificativa') ||
            texto.includes('observacao / justificativa')) {
          continue;
        }

        // ── Itens da guia ─────────────────────────────────────────────────
        if (guiaAtual && colunasItens) {
          const celulas = this._distribuirEmColunas(linha, colunasItens);

          // Uma linha de item começa com a data de realização na 1ª coluna.
          if (/^\d{2}\/\d{2}\/\d{4}$/.test((celulas[0] || '').trim())) {
            ultimoItem = this._montarItem(celulas);
            guiaAtual.itens.push(ultimoItem);
            continue;
          }

          // Sem data e com texto apenas na coluna da descrição: é a continuação
          // da descrição do item anterior (descrições longas quebram em várias
          // linhas no PDF).
          if (ultimoItem && celulas[3] && !celulas[0] && !celulas[1] && !celulas[2]) {
            ultimoItem.descricao = (ultimoItem.descricao + ' ' + celulas[3]).trim();
            continue;
          }
        }
      }

      this._conferir(doc);
      return doc;
    },

    // ========================================================================
    // Montagem das linhas a partir dos fragmentos posicionados
    // ========================================================================

    /**
     * Agrupa fragmentos que estão na mesma linha visual.
     * Lembre: nestes PDFs a página é rotacionada, então "x" é a linha.
     */
    _montarLinhas(itens) {
      const uteis = (itens || [])
        .filter(it => it && it.str && it.str.trim())
        .map(it => ({ x: it.x, y: it.y, s: it.str.trim() }))
        .sort((a, b) => a.x - b.x || a.y - b.y);

      const linhas = [];
      let atual = null;

      for (const it of uteis) {
        if (!atual || Math.abs(it.x - atual.x) > TOLERANCIA_LINHA) {
          atual = { x: it.x, celulas: [] };
          linhas.push(atual);
        }
        atual.celulas.push({ y: it.y, s: it.s });
      }

      for (const linha of linhas) {
        linha.celulas.sort((a, b) => a.y - b.y);
        linha.texto = linha.celulas.map(c => c.s).join(' ');
      }
      return linhas;
    },

    /**
     * Lê os valores de uma linha de dados usando a linha de RÓTULOS logo acima
     * como gabarito de colunas.
     *
     * O demonstrativo sempre imprime "rótulo em cima, valor embaixo". Cada
     * rótulo abre uma coluna que vai até o início do rótulo seguinte; o valor
     * cai na coluna que o contém. É assim que campos vazios (comuns aqui:
     * datas de faturamento em branco) não deslocam os demais.
     */
    _valoresPorRotulo(linhaRotulos, linhaValores) {
      const fronteiras = linhaRotulos.celulas.map(c => c.y);
      const valores = new Array(fronteiras.length).fill('');

      for (const cel of linhaValores.celulas) {
        const idx = this._colunaDe(cel.y, fronteiras);
        if (idx < 0) continue;
        valores[idx] = valores[idx] ? valores[idx] + ' ' + cel.s : cel.s;
      }
      return valores;
    },

    /**
     * Fronteiras das colunas da tabela de itens.
     * O cabeçalho ocupa duas linhas ("27-Código do / procedimento / Item"), mas
     * só a primeira abre colunas — a segunda é continuação de rótulo e seria
     * lida como coluna fantasma se entrasse na conta.
     */
    _colunasDaTabelaItens(linhaCabecalho) {
      return linhaCabecalho.celulas.map(c => c.y);
    },

    /** Distribui os fragmentos de uma linha nas colunas da tabela de itens. */
    _distribuirEmColunas(linha, fronteiras) {
      const celulas = new Array(fronteiras.length).fill('');
      for (const cel of linha.celulas) {
        const idx = this._colunaDe(cel.y, fronteiras);
        if (idx < 0) continue;
        celulas[idx] = celulas[idx] ? celulas[idx] + ' ' + cel.s : cel.s;
      }
      return celulas;
    },

    /**
     * Índice da coluna que contém a posição informada.
     * Uma coluna vai do início do seu rótulo até o início do rótulo seguinte.
     * Os números do demonstrativo são alinhados à direita, então o fragmento
     * começa depois do rótulo — mas sempre antes do rótulo seguinte.
     */
    _colunaDe(y, fronteiras) {
      // Margem à esquerda: a 1ª coluna aceita valores que comecem um pouco
      // antes do rótulo (acontece com campos centralizados).
      if (y < fronteiras[0] - 30) return -1;
      for (let i = fronteiras.length - 1; i >= 0; i--) {
        if (y >= fronteiras[i] - 30) return i;
      }
      return 0;
    },

    // ========================================================================
    // Item da guia
    // ========================================================================

    /**
     * Colunas da tabela de itens, na ordem do padrão TISS:
     *   0 data · 1 tabela · 2 código · 3 descrição · 4 grau de participação
     *   5 valor informado · 6 quantidade · 7 processado · 8 liberado
     *   9 glosa · 10 código da glosa · 11 centro de consumo
     */
    _montarItem(celulas) {
      const codigo  = (celulas[2] || '').trim();
      const tabela  = (celulas[1] || '').trim();
      const item = {
        data:            (celulas[0] || '').trim(),
        tabela:          tabela,
        codigo:          codigo,
        descricao:       (celulas[3] || '').trim(),
        grauParticipacao:(celulas[4] || '').trim(),
        valorInformado:  this._num(celulas[5]),
        quantidade:      this._num(celulas[6]),
        valorProcessado: this._num(celulas[7]),
        valorLiberado:   this._num(celulas[8]),
        valorGlosa:      this._num(celulas[9]),
        codigoGlosa:     (celulas[10] || '').trim(),
        centroConsumo:   (celulas[11] || '').trim(),
      };
      item.tipo = this.classificar(tabela, codigo, item.descricao);
      // Honorário médico é o que sai de procedimento e pacote. Material,
      // medicamento e OPME também são pagos pelo convênio, mas são custo do
      // hospital — só entram no repasse se a unidade tiver regra para eles
      // (a LIO é o caso clássico), e quem decide isso é o motor de regras.
      item.geraRepasse = (item.tipo === 'PROCEDIMENTO' || item.tipo === 'PACOTE');
      item.lio  = this.ehLio(item.descricao);
      item.pago = item.valorLiberado > 0;
      return item;
    },

    /**
     * Classifica o item pela tabela TISS, pelo código e, em último caso, pela
     * descrição.
     *   22 procedimentos · 98 pacotes · 19 materiais · 20 medicamentos
     *   18 taxas/diárias · 00 tabela própria
     *
     * O código manda mais que a tabela quando os dois discordam: o mesmo
     * "KIT DE BOMBA" (código 70358273, um OPME) aparece ora na tabela 19, ora
     * na tabela 00 dentro do MESMO demonstrativo. O prefixo do código TUSS é
     * mais confiável que a tabela declarada.
     */
    classificar(tabela, codigo, descricao) {
      const t = String(tabela || '').replace(/^0+/, '');
      const c = String(codigo || '').trim();

      if (t === '22') return 'PROCEDIMENTO';
      if (t === '98') return 'PACOTE';
      if (t === '20') return 'MEDICAMENTO';
      if (t === '18') return 'TAXA';

      if (/^\d{8}$/.test(c)) {
        if (c[0] === '3' || c[0] === '4') return 'PROCEDIMENTO';
        if (c[0] === '7') return 'OPME';
        if (c[0] === '6') return 'TAXA';
      }

      // Lente intraocular costuma vir na tabela própria, com código Simpro que
      // não segue o padrão TUSS. Sem este reconhecimento ela cairia em "OUTRO"
      // e ficaria fora de qualquer regra de repasse de LIO.
      if (this.ehLio(descricao)) return 'OPME';

      if (t === '19') return 'MATERIAL';
      if (/^\d{9,}$/.test(c)) return 'MATERIAL';
      return 'OUTRO';
    },

    /** Reconhece uma lente intraocular pela descrição. */
    ehLio(descricao) {
      const d = String(descricao || '')
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return /LENTE\s+INTRA\s*-?\s*OCULAR|LENTE\s+INTRAOCULAR|\bLIO\b/.test(d);
    },

    // ========================================================================

    /**
     * Confere o que foi lido contra os totais impressos pelo próprio
     * demonstrativo. Divergência aqui significa item perdido ou coluna trocada —
     * e é melhor o operador saber disso na hora da importação do que descobrir
     * num repasse errado no fim do mês.
     */
    _conferir(doc) {
      for (const guia of doc.guias) {
        if (!guia.totais) {
          doc.avisos.push(`Guia ${guia.numeroGuiaPrestador} (${guia.beneficiario}): sem linha de total.`);
          continue;
        }
        const soma = guia.itens.reduce((acc, it) => acc + (it.valorLiberado || 0), 0);
        if (Math.abs(soma - guia.totais.liberado) > 0.05) {
          doc.avisos.push(
            `Guia ${guia.numeroGuiaPrestador} (${guia.beneficiario}): a soma dos itens ` +
            `(${soma.toFixed(2)}) não bate com o total liberado impresso ` +
            `(${guia.totais.liberado.toFixed(2)}).`
          );
        }
      }

      if (doc.totalGeral) {
        const soma = doc.guias.reduce((acc, g) => acc + (g.totais ? g.totais.liberado : 0), 0);
        if (Math.abs(soma - doc.totalGeral.liberado) > 0.05) {
          doc.avisos.push(
            `O total liberado das guias (${soma.toFixed(2)}) não bate com o Total Geral ` +
            `do demonstrativo (${doc.totalGeral.liberado.toFixed(2)}).`
          );
        }
      }
    },

    /** Converte número em formato brasileiro ("1.476,70") para Number. */
    _num(v) {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'number') return v;
      const s = String(v).trim();
      if (!s) return 0;
      const limpo = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
      const n = parseFloat(limpo);
      return isNaN(n) ? 0 : n;
    },

    /** Primeiro fragmento da linha que casa com o padrão informado. */
    _acharDepois(linha, padrao) {
      for (const cel of linha.celulas) {
        if (padrao.test(cel.s)) return cel.s;
      }
      return null;
    },
  };

  raiz.ParserDemonstrativo = ParserDemonstrativo;

  // Permite testar fora do navegador (Node), sem alterar o uso no browser.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParserDemonstrativo;
  }

})(typeof window !== 'undefined' ? window : globalThis);
