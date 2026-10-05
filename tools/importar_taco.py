#!/usr/bin/env python3
"""Gera o bloco TACO do index.html a partir da planilha oficial da UNICAMP.

Fonte: Tabela Brasileira de Composição de Alimentos (TACO), 4ª edição ampliada
e revisada, NEPA/UNICAMP, 2011. Planilha oficial em
https://nepa.unicamp.br/publicacoes/tabela-taco-excel/ (cópia em
dados/taco-4ed-unicamp.xlsx). O PDF da obra diz: "É permitida a reprodução
total ou parcial do material, desde que seja citada a fonte."

Uso:  python3 tools/importar_taco.py            # reescreve o bloco no index.html
      python3 tools/importar_taco.py --mostrar  # só imprime o bloco

Precisa de openpyxl (pip install openpyxl). O bloco fica entre os marcadores
/* TACO:INICIO */ e /* TACO:FIM */; tudo entre eles é gerado, não edite à mão.
"""
import json, re, sys, pathlib
import openpyxl

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PLANILHA = RAIZ / "dados" / "taco-4ed-unicamp.xlsx"
INDEX = RAIZ / "index.html"

# colunas da aba "CMVCol taco3": número, descrição, umidade, kcal, kJ, proteína,
# lipídeos, colesterol, carboidrato, fibra, ...
COL = {"num": 0, "nome": 1, "kcal": 3, "p": 5, "g": 6, "c": 8}


def numero(v):
    """'NA', 'Tr' (traço) e '*' viram 0: não há número a inventar."""
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def r1(x):
    return round(x + 1e-9, 1)


def carregar():
    wb = openpyxl.load_workbook(PLANILHA, read_only=True, data_only=True)
    ws = wb["CMVCol taco3"]
    grupo, itens = "", []
    for linha in ws.iter_rows(values_only=True):
        num, nome = linha[COL["num"]], linha[COL["nome"]]
        if not isinstance(num, (int, float)):
            # linha sem número é cabeçalho de grupo ("Cereais e derivados");
            # o cabeçalho das colunas se repete a cada página e não é grupo
            if isinstance(num, str) and num.strip() and nome in (None, "") and not num.startswith("Número"):
                grupo = num.strip()
            continue
        nome = re.sub(r"\s+", " ", str(nome or "")).strip()
        kcal = numero(linha[COL["kcal"]])
        if not nome or kcal <= 0 and numero(linha[COL["p"]]) <= 0 and numero(linha[COL["c"]]) <= 0 and numero(linha[COL["g"]]) <= 0:
            continue
        itens.append({
            "n": nome, "k": round(kcal), "p": r1(numero(linha[COL["p"]])),
            "c": r1(numero(linha[COL["c"]])), "g": r1(numero(linha[COL["g"]])),
            "grupo": grupo, "taco": int(num),
        })
    return itens


def js(itens):
    def obj(i):
        return "{n:%s,k:%d,p:%s,c:%s,g:%s,src:\"taco\"}" % (
            json.dumps(i["n"], ensure_ascii=False), i["k"],
            ("%g" % i["p"]), ("%g" % i["c"]), ("%g" % i["g"]))
    linhas, atual = [], ""
    for i in itens:
        if i["grupo"] != atual:
            atual = i["grupo"]
            linhas.append("  // " + atual)
        linhas.append("  " + obj(i) + ",")
    return "\n".join(linhas)


def main():
    itens = carregar()
    bloco = js(itens)
    if "--mostrar" in sys.argv:
        print(bloco)
        return
    html = INDEX.read_text(encoding="utf-8")
    ini, fim = "/* TACO:INICIO */", "/* TACO:FIM */"
    a, b = html.index(ini) + len(ini), html.index(fim)
    html = html[:a] + "\n" + bloco + "\n" + html[b:]
    INDEX.write_text(html, encoding="utf-8")
    print(f"{len(itens)} alimentos da TACO gravados no index.html")


if __name__ == "__main__":
    main()
