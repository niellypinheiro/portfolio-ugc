/* =========================================================================
   Financeiro: estoque e custos, DRE, fornecedores e clientes, metas.
   O estoque é ESTIMADO: entradas menos saídas das notas que você importou.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});
  F.telas = F.telas || {};
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const norm = (s) => P.semAcento(s).replace(/[^a-z0-9]+/g, " ").trim();

  /* ---------- produtos (a partir dos itens das notas) ---------- */
  function produtos(ctx) {
    if (!ctx.itens) return null;
    if (ctx._prodRef === ctx.itens) return ctx._prod;
    const mapa = new Map(), hoje = F.hoje(), limite90 = F.somarDias(hoje, -90);
    ctx.itens.forEach((i) => {
      const chave = i.ean || "d:" + norm(i.descricao);
      let p = mapa.get(chave);
      if (!p) { p = { chave, descricao: i.descricao, ean: i.ean, entrou: 0, saiu: 0, vendQtd: 0, vendValor: 0, compQtd: 0, compValor: 0, ultVenda: "", ultCompra: "", custoUlt: 0, vend90: 0 }; mapa.set(chave, p); }
      const q = i.quantidade;
      if (i.tipo === "entrada") {
        p.entrou += q;
        if (!i.devolucao) { p.compQtd += q; p.compValor += i.valor_total; if (i.data_emissao >= p.ultCompra) { p.ultCompra = i.data_emissao; p.custoUlt = i.valor_unitario; } }
        else { p.vendQtd -= q; p.vendValor -= i.valor_total; }
      } else {
        p.saiu += q;
        if (!i.devolucao) {
          p.vendQtd += q; p.vendValor += i.valor_total; if (i.data_emissao > p.ultVenda) { p.ultVenda = i.data_emissao; p.descricao = i.descricao; }
          if (i.data_emissao >= limite90) p.vend90 += q;
        } else { p.compQtd -= q; p.compValor -= i.valor_total; }
      }
    });
    const lista = Array.from(mapa.values()).map((p) => {
      p.estoque = p.entrou - p.saiu;
      p.preco = p.vendQtd > 0 ? p.vendValor / p.vendQtd : 0;
      p.custo = p.custoUlt || (p.compQtd > 0 ? p.compValor / p.compQtd : 0);
      p.margem = p.preco > 0 && p.custo > 0 ? ((p.preco - p.custo) / p.preco) * 100 : null;
      const porDia = p.vend90 / 90;
      p.cobertura = porDia > 0 && p.estoque > 0 ? Math.round(p.estoque / porDia) : null;
      const ref = p.ultVenda || p.ultCompra;
      p.diasSemVenda = ref ? Math.round((new Date(hoje) - new Date(ref)) / 86400000) : null;
      p.valorParado = Math.max(0, p.estoque) * p.custo;
      if (p.estoque < 0) p.status = ["Confira (saiu mais do que entrou)", "aviso"];
      else if (p.estoque === 0) p.status = ["Em falta", "ruim"];
      else if (p.cobertura != null && p.cobertura < 15) p.status = ["Estoque baixo", "aviso"];
      else if (p.diasSemVenda != null && p.diasSemVenda > 60) p.status = ["Parado há " + p.diasSemVenda + " dias", "aviso"];
      else p.status = ["Disponível", "ok"];
      return p;
    });
    ctx._prodRef = ctx.itens; ctx._prod = lista;
    return lista;
  }
  F.produtos = produtos;
  F.estoqueResumo = function (ctx) {
    const l = produtos(ctx);
    if (!l || !l.length) return null;
    return { cadastrados: l.length, itens: soma(l, (p) => Math.max(0, p.estoque)), emFalta: l.filter((p) => p.estoque === 0 && p.entrou > 0).length, valor: soma(l, (p) => p.valorParado) };
  };
  F.parados = function (ctx, dias) {
    const l = produtos(ctx);
    if (!l) return null;
    return l.filter((p) => p.estoque > 0 && p.diasSemVenda != null && p.diasSemVenda > dias).length;
  };

  /* ---------- ESTOQUE E CUSTOS ---------- */
  F.telas.estoque = function (ctx) {
    const raiz = h("div");
    if (ctx.itens === null) { raiz.append(F.aviso("Carregando os produtos das notas...")); return raiz; }
    const lista = produtos(ctx), r = F.estoqueResumo(ctx);
    if (!r) {
      raiz.append(F.cartao("Estoque e custos", h("p", { text: "Ainda não há produtos. Importe os XML das notas de compra (entrada) e de venda (saída): com eles o painel calcula o estoque, o custo e a margem de cada produto." })));
      return raiz;
    }
    const e = ctx.estadoEstoque || (ctx.estadoEstoque = { busca: "", status: "todos", ordem: "vendidos" });
    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile("t-azul", "Produtos cadastrados", P.numero(r.cadastrados), "nas notas importadas"),
      F.tile("t-verde", "Itens em estoque", P.numero(r.itens), "estimado"),
      F.tile(r.emFalta ? "t-vermelho" : "t-verde", "Produtos em falta", P.numero(r.emFalta), "estoque zerado"),
      F.tile("t-ouro", "Valor em estoque", F.dinheiro(r.valor), "pelo último custo de compra")));

    const topV = lista.filter((p) => p.vendQtd > 0).sort((a, b) => b.vendValor - a.vendValor).slice(0, 5);
    const baixas = lista.filter((p) => p.margem != null && p.margem < 15 && p.vendQtd > 0).sort((a, b) => a.margem - b.margem).slice(0, 5);
    raiz.append(h("div", { class: "fin-duas igual" },
      F.cartao("Mais vendidos (em valor)", F.tabela(["Produto", { t: "Vendido", num: true }, { t: "Margem", num: true }],
        topV.map((p) => h("tr", null, h("td", { class: "truncar", style: "max-width:260px", title: p.descricao, text: p.descricao }), h("td", { class: "num", text: F.dinheiro(p.vendValor) }), h("td", { class: "num", text: p.margem == null ? "" : F.pct(p.margem, 0) }))), "Nenhuma venda importada."), "fin-cartao-tab"),
      F.cartao("Margem baixa ou negativa", F.tabela(["Produto", { t: "Custo", num: true }, { t: "Preço médio", num: true }, { t: "Margem", num: true }],
        baixas.map((p) => h("tr", null, h("td", { class: "truncar", style: "max-width:220px", title: p.descricao, text: p.descricao }), h("td", { class: "num", text: F.dinheiro(p.custo) }), h("td", { class: "num", text: F.dinheiro(p.preco) }),
          h("td", { class: "num ruim", text: F.pct(p.margem, 0) }))), "Nenhum produto com margem abaixo de 15%."), "fin-cartao-tab")));

    const tabelaBox = h("div"), busca = h("input", { type: "search", placeholder: "Buscar produto", value: e.busca, "aria-label": "Buscar produto" });
    function desenharTabela() {
      P.limpar(tabelaBox);
      const q = P.semAcento(e.busca);
      let l = lista.filter((p) => (e.status === "todos" || (e.status === "falta" && p.estoque <= 0) || (e.status === "baixo" && p.status[0] === "Estoque baixo") ||
        (e.status === "parado" && p.status[0].indexOf("Parado") === 0) || (e.status === "ok" && p.status[1] === "ok")) && (!q || P.semAcento(p.descricao + " " + p.ean).includes(q)));
      const ord = { vendidos: (a, b) => b.vendValor - a.vendValor, margem: (a, b) => (b.margem == null ? -1e9 : b.margem) - (a.margem == null ? -1e9 : a.margem),
        margem_baixa: (a, b) => (a.margem == null ? 1e9 : a.margem) - (b.margem == null ? 1e9 : b.margem), parado: (a, b) => b.valorParado - a.valorParado, nome: (a, b) => P.comparar(a.descricao, b.descricao) }[e.ordem];
      l = l.slice().sort(ord);
      F.anexar(tabelaBox, F.tabela(["Produto", { t: "Estoque", num: true }, { t: "Custo", num: true }, { t: "Preço médio", num: true }, { t: "Margem", num: true }, { t: "Vendidos", num: true }, "Última venda", "Situação"],
        l.slice(0, 200).map((p) => h("tr", null, h("td", { class: "truncar", style: "max-width:280px", title: p.descricao + (p.ean ? " (EAN " + p.ean + ")" : ""), text: p.descricao }),
          h("td", { class: "num", text: P.numero(Math.round(p.estoque * 100) / 100) }), h("td", { class: "num", text: p.custo ? F.dinheiro(p.custo) : "" }), h("td", { class: "num", text: p.preco ? F.dinheiro(p.preco) : "" }),
          h("td", { class: "num " + (p.margem != null && p.margem < 15 ? "ruim" : ""), text: p.margem == null ? "" : F.pct(p.margem, 0) }), h("td", { class: "num", text: P.numero(Math.round(p.vendQtd * 100) / 100) }),
          h("td", { class: "nw", text: p.ultVenda ? P.fmtData(p.ultVenda) : "" }), h("td", { class: "nw" }, F.pilulaStatus(p.status[0], p.status[1])))), "Nenhum produto com esse filtro."),
        l.length > 200 ? h("p", { class: "fraco", text: "Mostrando 200 de " + l.length + ". Use a busca." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { e.busca = busca.value; desenharTabela(); }, 150));
    const chip = (v, t) => h("button", { type: "button", "aria-pressed": String(e.status === v), text: t, onclick: () => { e.status = v; ctx.desenhar(); } });
    const ordem = h("select", { "aria-label": "Ordenar", onchange: (ev) => { e.ordem = ev.target.value; desenharTabela(); } },
      [["vendidos", "Mais vendidos"], ["margem", "Maior margem"], ["margem_baixa", "Menor margem"], ["parado", "Mais dinheiro parado"], ["nome", "Nome"]].map(([v, t]) => h("option", { value: v, text: t, selected: v === e.ordem })));
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" }, h("div", { class: "busca" }, P.ic("busca"), busca),
      h("div", { class: "filtros", role: "group", "aria-label": "Situação" }, chip("todos", "Todos"), chip("ok", "Disponíveis"), chip("baixo", "Estoque baixo"), chip("falta", "Em falta"), chip("parado", "Parados")), ordem), tabelaBox);
    desenharTabela();
    raiz.append(F.aviso("O estoque é uma ESTIMATIVA: soma das compras (entrada) menos as vendas (saída) das notas que você importou. Se o estoque já existia antes da primeira nota importada, ele pode aparecer menor ou negativo. O painel junta os produtos pelo código de barras (EAN) ou, sem ele, pelo nome. Uma diferença de preço de venda e custo não é lucro líquido: ainda há impostos, taxas e despesas."));
    return raiz;
  };

  /* ---------- DRE ---------- */
  F.telas.dre = function (ctx) {
    const raiz = h("div"), e = ctx.estadoDre || (ctx.estadoDre = { meses: 6 });
    const meses = F.mesesAtras(e.meses), cols = meses.map((ym) => { const l = F.limitesDoMes(ym); return F.metricas(ctx, l.ini, l.fim); });
    const total = F.metricas(ctx, F.limitesDoMes(meses[0]).ini, F.limitesDoMes(meses[meses.length - 1]).fim);
    const linhas = [
      ["Receita bruta", "receitaBruta", 1], ["(-) Devoluções", "devolucoes", -1], ["(-) Impostos sobre vendas (guias lançadas)", "impostos", -1], ["Receita líquida", "receitaLiquida", 2],
      ["(-) Custo das mercadorias vendidas (estimado pelas compras)", "cmv", -1], ["Lucro bruto", "lucroBruto", 2], ["(-) Despesas operacionais", "operacionais", -1],
      ["Resultado operacional", "resultadoOper", 2], ["(-) Despesas financeiras", "financeiras", -1], ["Resultado final (estimado)", "resultado", 3]];
    const cel = (v, tipo) => h("td", { class: "num " + (tipo >= 2 ? "fin-forte " : "") + (tipo >= 2 && v < 0 ? "ruim" : ""), text: F.dinheiro(v) });
    const cab = [{ t: "Linha da DRE" }].concat(meses.map((ym) => ({ t: F.mesNome(ym), num: true })), [{ t: "Total", num: true }]);
    const corpo = linhas.map(([rot, k, tipo]) => h("tr", { class: tipo >= 2 ? "fin-linha-forte" : "" }, h("td", { text: rot }), cols.map((c) => cel(c[k], tipo)), cel(total[k], tipo)));
    corpo.push(h("tr", null, h("td", { text: "Margem bruta" }), cols.map((c) => h("td", { class: "num", text: F.pct(c.margemBruta, 0) })), h("td", { class: "num", text: F.pct(total.margemBruta, 0) })));
    corpo.push(h("tr", null, h("td", { text: "Margem líquida" }), cols.map((c) => h("td", { class: "num", text: F.pct(c.margemLiquida, 0) })), h("td", { class: "num", text: F.pct(total.margemLiquida, 0) })));
    const chip = (n) => h("button", { type: "button", "aria-pressed": String(e.meses === n), text: n + " meses", onclick: () => { e.meses = n; ctx.desenhar(); } });
    raiz.append(h("div", { class: "ferramentas" }, h("div", { class: "filtros", role: "group", "aria-label": "Quantidade de meses" }, chip(6), chip(12))));
    raiz.append(F.cartao("DRE mês a mês", F.tabela(cab, corpo, ""), "fin-cartao-tab"));
    raiz.append(h("div", { class: "fin-duas igual" },
      F.cartao("Resultado final por mês", F.linha(meses.map(F.mesNome), cols.map((c) => c.resultado), "#cf5a70")),
      F.cartao("Receita líquida e lucro bruto", h("div", null, F.barras(meses.map(F.mesNome), [{ nome: "Receita líquida", cor: "#cf5a70", valores: cols.map((c) => c.receitaLiquida) }, { nome: "Lucro bruto", cor: "#7aa874", valores: cols.map((c) => c.lucroBruto) }]),
        h("div", { class: "fin-legenda" }, h("span", null, h("i", { style: "background:#cf5a70" }), "Receita líquida"), h("span", null, h("i", { style: "background:#7aa874" }), "Lucro bruto"))))));
    const fx = ctx.faixa, m = F.metricas(ctx, fx.ini, fx.fim);
    const cats = Object.entries(m.porCat).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
    raiz.append(F.cartao("Despesas do período (" + fx.rotulo.toLowerCase() + ")", F.tabela(["Categoria", { t: "Valor", num: true }, { t: "% do faturamento", num: true }],
      cats.map((c) => h("tr", null, h("td", { text: c[0] }), h("td", { class: "num", text: F.dinheiro(c[1]) }), h("td", { class: "num", text: m.receitaBruta ? F.pct((c[1] / m.receitaBruta) * 100, 1) : "" }))), "Sem despesas lançadas neste período."), "fin-cartao-tab"));
    raiz.append(F.aviso("Como o painel monta a DRE: a receita vem das notas de venda autorizadas; o custo das mercadorias vem das notas de compra do período (se não houver notas de compra, usa as contas de \"Fornecedores e mercadorias\"); as despesas e os impostos vêm de Contas a pagar, pelo mês do vencimento. É uma DRE de gestão, para acompanhar. A DRE oficial e a apuração de impostos são do seu contador."));
    return raiz;
  };

  /* ---------- FORNECEDORES E CLIENTES ---------- */
  F.telas.parceiros = function (ctx) {
    const fx = ctx.faixa, raiz = h("div");
    const notas = ctx.notas.filter((n) => n.status === "autorizada" && n.data_emissao >= fx.ini && n.data_emissao <= fx.fim);
    function agrupar(lista, doc, nome) {
      const m = new Map();
      lista.forEach((n) => {
        const k = doc(n) || nome(n) || "sem identificação";
        const x = m.get(k) || { nome: nome(n) || "Sem nome", doc: doc(n), total: 0, qtd: 0, ultima: "" };
        x.total += n.valor_total; x.qtd++; if (n.data_emissao > x.ultima) x.ultima = n.data_emissao;
        m.set(k, x);
      });
      return Array.from(m.values()).sort((a, b) => b.total - a.total);
    }
    const compras = notas.filter((n) => n.tipo === "entrada" && !n.devolucao), vendas = notas.filter((n) => n.tipo === "saida" && !n.devolucao);
    const forn = agrupar(compras, (n) => n.emitente_doc, (n) => n.emitente_nome), cli = agrupar(vendas, (n) => n.destinatario_doc, (n) => n.destinatario_nome || "Consumidor final");
    const totF = soma(forn, (x) => x.total), totC = soma(cli, (x) => x.total);
    const tab = (lista, tot, rotulo) => F.tabela([rotulo, "Documento", { t: "Notas", num: true }, { t: "Total", num: true }, { t: "% do total", num: true }, "Última"],
      lista.slice(0, 20).map((x) => h("tr", null, h("td", { class: "truncar", style: "max-width:220px", title: x.nome, text: x.nome }), h("td", { class: "nw", text: F.fmtDoc(x.doc) }), h("td", { class: "num", text: String(x.qtd) }),
        h("td", { class: "num", text: F.dinheiro(x.total) }), h("td", { class: "num", text: tot ? F.pct((x.total / tot) * 100, 0) : "" }), h("td", { class: "nw", text: P.fmtData(x.ultima) }))), "Nenhuma nota neste período.");
    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile("t-vinho", "Compras no período", F.dinheiro(totF), forn.length + (forn.length === 1 ? " fornecedor" : " fornecedores")),
      F.tile("t-rosa", "Vendas no período", F.dinheiro(totC), vendas.length + (vendas.length === 1 ? " nota" : " notas")),
      F.tile("t-azul", "Ticket médio", F.dinheiro(vendas.length ? totC / vendas.length : 0), "por nota de venda"),
      F.tile(forn[0] && totF && forn[0].total / totF > 0.5 ? "t-vermelho" : "t-verde", "Maior fornecedor", forn[0] && totF ? F.pct((forn[0].total / totF) * 100, 0) : "0%", "das compras")));
    if (forn[0] && totF && forn[0].total / totF > 0.5) raiz.append(F.aviso("Mais da metade das suas compras está em um só fornecedor (" + forn[0].nome + "). Concentrar demais aumenta o risco de falta e de aumento de preço.", "aviso"));
    raiz.append(h("div", { class: "fin-duas igual" }, F.cartao("Fornecedores (quem você mais compra)", tab(forn, totF, "Fornecedor"), "fin-cartao-tab"), F.cartao("Clientes (quem mais comprou)", tab(cli, totC, "Cliente"), "fin-cartao-tab")));
    raiz.append(F.aviso("Os dados vêm das notas fiscais importadas no período escolhido. Cadastro completo de contatos e histórico de preços ficam para uma próxima etapa."));
    return raiz;
  };

  /* ---------- METAS E INDICADORES ---------- */
  F.telas.metas = function (ctx) {
    const raiz = h("div"), e = ctx.estadoMetas || (ctx.estadoMetas = { mes: F.hoje().slice(0, 7) });
    const ym = e.mes, lim = F.limitesDoMes(ym), m = F.metricas(ctx, lim.ini, lim.fim);
    const antYm = F.limitesDoMes(F.somarMesesData(lim.ini, -1).slice(0, 7)), ant = F.metricas(ctx, antYm.ini, antYm.fim);
    const meta = F.metaDoMes(ctx, ym) || {};
    const meses = F.mesesAtras(12).reverse();
    const seletor = h("select", { "aria-label": "Mês da meta", style: "width:auto;min-width:0;max-width:260px", onchange: (ev) => { e.mes = ev.target.value; ctx.desenhar(); } }, meses.map((x) => h("option", { value: x, text: F.mesLongo(x), selected: x === ym })));

    const campo = (rot, chave, dica) => { const i = h("input", { type: "text", inputmode: "decimal", value: meta[chave] != null ? String(meta[chave]).replace(".", ",") : "", placeholder: "0" }); i.dataset.chave = chave; return { el: P.campo(rot, i, dica), i }; };
    const cF = campo("Faturamento do mês (R$)", "faturamento"), cL = campo("Lucro líquido (R$)", "lucro"), cM = campo("Margem líquida (%)", "margem"),
      cD = campo("Redução de despesas (%)", "despesas", "Em relação ao mês anterior."), cC = campo("Crescimento das vendas (%)", "crescimento", "Em relação ao mês anterior.");
    const salvar = async () => {
      const novo = {};
      [cF, cL, cM, cD, cC].forEach((c) => { const v = F.lerValor(c.i.value); if (!isNaN(v)) novo[c.i.dataset.chave] = v; });
      if (await ctx.salvarCfg("meta_" + ym, JSON.stringify(novo))) { P.toast("Metas salvas"); ctx.desenhar(); }
    };
    raiz.append(h("div", { class: "ferramentas" }, h("label", { class: "fraco", text: "Mês:" }), seletor));

    const linhaMeta = (rot, alvo, real, fmt, menosEhMelhor) => {
      const pct = alvo > 0 ? Math.max(0, (real / alvo) * 100) : 0;
      const bom = menosEhMelhor ? real <= alvo : real >= alvo;
      return h("div", { class: "fin-meta" }, h("div", { class: "fin-meta-cab" }, h("b", { text: rot }), h("span", { class: bom ? "bom" : "", text: alvo > 0 ? F.pct(pct, 0) + " da meta" : "sem meta" })),
        alvo > 0 ? F.progresso(pct, bom ? "#5fa86b" : "var(--couro)") : null,
        h("div", { class: "fin-meta-val" }, h("span", { text: "Realizado: " + fmt(real) }), h("span", { text: alvo > 0 ? "Meta: " + fmt(alvo) + (real < alvo && !menosEhMelhor ? " (faltam " + fmt(alvo - real) + ")" : "") : "" })));
    };
    const cresc = ant.receitaBruta ? F.variacao(m.receitaBruta, ant.receitaBruta) : 0, reducao = ant.despesas ? -F.variacao(m.despesas, ant.despesas) : 0;
    raiz.append(h("div", { class: "fin-duas" },
      F.cartao("Meta x realizado em " + F.mesLongo(ym), h("div", null,
        linhaMeta("Faturamento", meta.faturamento || 0, m.receitaBruta, F.dinheiro), linhaMeta("Lucro líquido (estimado)", meta.lucro || 0, m.resultado, F.dinheiro),
        linhaMeta("Margem líquida", meta.margem || 0, m.margemLiquida, (v) => F.pct(v, 1)), linhaMeta("Redução de despesas", meta.despesas || 0, reducao, (v) => F.pct(v, 1)),
        linhaMeta("Crescimento das vendas", meta.crescimento || 0, cresc, (v) => F.pct(v, 1)))),
      F.cartao("Definir as metas do mês", h("div", null, cF.el, cL.el, cM.el, cD.el, cC.el, h("button", { type: "button", class: "btn p", onclick: salvar }, "Salvar metas")))));

    const alvoF = meta.faturamento || 0, alvoL = meta.lucro || 0;
    if (alvoF || alvoL) raiz.append(F.cartao("Meta contra realizado", h("div", null, F.barras(["Faturamento", "Lucro líquido"], [{ nome: "Meta", cor: "#e8b25c", valores: [alvoF, alvoL] }, { nome: "Realizado", cor: "#8d7a80", valores: [Math.max(0, m.receitaBruta), Math.max(0, m.resultado)] }]),
      h("div", { class: "fin-legenda" }, h("span", null, h("i", { style: "background:#e8b25c" }), "Meta"), h("span", null, h("i", { style: "background:#8d7a80" }), "Realizado")))));

    /* indicadores indispensáveis do guia */
    const receber = F.resumoContas(F.receber(ctx)), pagar = F.resumoContas(F.pagar(ctx));
    const variaveis = m.cmv + m.impostos + (m.porCat["Taxas bancárias e de cartão"] || 0) + (m.porCat["Frete"] || 0);
    const fixas = m.operacionais - (m.porCat["Frete"] || 0) + (m.porCat["Empréstimos e financiamentos"] || 0);
    const mcPct = m.receitaBruta > 0 ? ((m.receitaBruta - variaveis) / m.receitaBruta) * 100 : 0;
    const pe = mcPct > 0 ? fixas / (mcPct / 100) : null;
    const saldo = F.saldoAtual(ctx);
    const ate30 = F.somarDias(F.hoje(), 30);
    const giro = saldo == null ? null : saldo + soma(F.receber(ctx).filter((l) => !l.pagamento && l.vencimento <= ate30), (l) => l.valor) - soma(F.pagar(ctx).filter((l) => !l.pagamento && l.vencimento <= ate30), (l) => l.valor);
    const ind = (rot, val, def) => h("div", { class: "fin-ind" }, h("div", { class: "fin-ind-rot", text: rot }), h("div", { class: "fin-ind-val", text: val }), h("div", { class: "fin-ind-def", text: def }));
    raiz.append(F.cartao("Indicadores de " + F.mesLongo(ym), h("div", { class: "fin-ind-grade" },
      ind("Faturamento", F.dinheiro(m.receitaBruta), "Quanto a empresa vende."), ind("Lucro líquido (estimado)", F.dinheiro(m.resultado), "Quanto sobra depois dos gastos considerados."),
      ind("Margem líquida", F.pct(m.margemLiquida, 1), "Parte da receita que vira resultado."), ind("Margem de contribuição", F.pct(mcPct, 1), "Receita menos custos e despesas variáveis (mercadorias, impostos, taxas e frete)."),
      ind("Ponto de equilíbrio", pe == null ? "sem dados" : F.dinheiro(pe), "Vendas necessárias no mês para cobrir os custos fixos."), ind("Ticket médio", F.dinheiro(m.ticket), "Valor médio por nota de venda."),
      ind("Inadimplência", receber.total ? F.pct((receber.atrasado / receber.total) * 100, 0) : "0%", "Parte dos recebíveis em aberto que já venceu."),
      ind("Endividamento", F.dinheiro(pagar.total), "Total de contas a pagar em aberto."), ind("Capital de giro (30 dias)", giro == null ? "defina o saldo" : F.dinheiro(giro), "Saldo + a receber − a pagar nos próximos 30 dias."),
      ind("Carga tributária efetiva", m.receitaBruta ? F.pct((m.impostos / m.receitaBruta) * 100, 1) : "0%", "Guias lançadas ÷ faturamento. O critério final é do contador."))));
    raiz.append(F.aviso("Todos os indicadores são calculados com o que está no painel (notas importadas e contas lançadas). Quanto mais completo o lançamento, mais confiável o número."));
    return raiz;
  };
})();
