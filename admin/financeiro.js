/* =========================================================================
   Aba FINANCEIRO (SmartBrand Tecnologia): visão geral, notas fiscais (XML),
   contas a pagar e a receber, impostos, estoque, DRE, fluxo de caixa,
   fornecedores e clientes, metas.

   Este arquivo tem a base (dados, cálculos, gráficos), a Visão geral, as
   Notas fiscais e a importação de XML/ZIP. As outras telas ficam em
   financeiro_contas.js e financeiro_analise.js e se registram em P.fin.telas.

   Os números são uma ESTIMATIVA de gestão feita com os arquivos que você
   importa e com o que você lança. Não substituem a contabilidade oficial:
   confirme impostos e resultado com o seu contador.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;
  const F = (P.fin = P.fin || {});
  F.telas = F.telas || {};

  /* ---------- listas e cores ---------- */
  F.CATS_PAGAR = ["Fornecedores e mercadorias", "Aluguel", "Água, energia, internet e telefone", "Salários e encargos", "Pró-labore", "Impostos",
    "Contabilidade e serviços profissionais", "Sistemas e assinaturas", "Taxas bancárias e de cartão", "Frete", "Marketing", "Manutenção",
    "Despesas administrativas", "Empréstimos e financiamentos", "Outras despesas"];
  F.CATS_RECEBER = ["Vendas a prazo", "Cartão de crédito", "Marketplace", "Assistência técnica (serviços)", "Pix e dinheiro", "Outras receitas"];
  F.CAT_FORNECEDORES = "Fornecedores e mercadorias";
  F.CAT_IMPOSTOS = "Impostos";
  F.FINANCEIRAS = ["Taxas bancárias e de cartão", "Empréstimos e financiamentos"];
  F.CORES = ["#2e6bd6", "#e8a04c", "#5fb7b0", "#7aa874", "#9b7fc4", "#143d96", "#d9c04c", "#6fa8dc", "#c98aa6", "#7a889e"];

  /* ---------- ferramentas ---------- */
  const dois = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const soma = (lista, f) => lista.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const iso = (d) => P.iso(d);
  F.soma = soma;
  F.dois = dois;
  F.hoje = () => P.hoje();
  F.dinheiro = (n) => P.dinheiro(n);
  F.curto = (n) => {
    const v = Number(n) || 0, a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
    if (a >= 1e3) return (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  };
  F.pct = (n, casas) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas == null ? 1 : casas, maximumFractionDigits: casas == null ? 1 : casas }) + "%";
  F.mesNome = (ym) => { const [a, m] = ym.split("-").map(Number); return ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][m - 1] + "/" + String(a).slice(2); };
  F.mesLongo = (ym) => { const [a, m] = ym.split("-").map(Number); return ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][m - 1] + " de " + a; };
  F.mesesAtras = (n, base) => {   /* lista de "AAAA-MM", do mais antigo ao mais novo, terminando no mês atual */
    const d = base ? new Date(base) : new Date(), r = [];
    for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); r.push(iso(x).slice(0, 7)); }
    return r;
  };
  F.limitesDoMes = (ym) => { const [a, m] = ym.split("-").map(Number); return { ini: iso(new Date(a, m - 1, 1)), fim: iso(new Date(a, m, 0)) }; };
  F.somarDias = (dataIso, n) => { const [a, m, d] = dataIso.split("-").map(Number); return iso(new Date(a, m - 1, d + n)); };
  F.somarMesesData = (dataIso, n) => {
    const [a, m, d] = dataIso.split("-").map(Number);
    const alvo = new Date(a, m - 1 + n, 1), ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    return iso(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d, ultimo)));
  };
  F.fmtDoc = (d) => {
    const s = String(d || "").replace(/\D/g, "");
    if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    return d || "";
  };
  /* CNPJs das suas empresas (a loja e a outra empresa que emite as vendas), guardados em fin_config */
  F.meusCnpjs = (ctx) => String((ctx.cfg && (ctx.cfg.cnpjs_empresa || ctx.cfg.cnpj_empresa)) || "").split(/[,;\s]+/).map((d) => d.replace(/\D/g, "")).filter((d) => d.length === 14);
  F.anexar = (el, ...filhos) => { filhos.forEach((x) => { if (x != null && x !== false) el.append(x); }); return el; };   /* append que ignora os vazios (o append do navegador escreveria "null") */
  F.variacao = (atual, anterior) => (anterior ? ((atual - anterior) / Math.abs(anterior)) * 100 : null);

  /* ---------- períodos ---------- */
  const PERIODOS = [["mes", "Este mês"], ["mes_ant", "Mês anterior"], ["3m", "Últimos 3 meses"], ["ano", "Este ano"], ["ano_ant", "Ano anterior"]];
  F.PERIODOS = PERIODOS;
  F.faixa = function (op, base) {
    const b = base || new Date(), y = b.getFullYear(), m = b.getMonth();
    const mes = (yy, mm) => ({ ini: iso(new Date(yy, mm, 1)), fim: iso(new Date(yy, mm + 1, 0)) });
    const junta = (a, c) => ({ ini: a.ini, fim: c.fim });
    const ano = (yy) => ({ ini: iso(new Date(yy, 0, 1)), fim: iso(new Date(yy, 11, 31)) });
    if (op === "mes_ant") return Object.assign({ ant: mes(y, m - 2), rotulo: "Mês anterior", comp: "o mês antes dele" }, mes(y, m - 1));
    if (op === "3m") return Object.assign({ ant: junta(mes(y, m - 5), mes(y, m - 3)), rotulo: "Últimos 3 meses", comp: "os 3 meses anteriores" }, junta(mes(y, m - 2), mes(y, m)));
    if (op === "ano") return Object.assign({ ant: ano(y - 1), rotulo: "Este ano", comp: "o ano passado" }, ano(y));
    if (op === "ano_ant") return Object.assign({ ant: ano(y - 2), rotulo: "Ano anterior", comp: "o ano retrasado" }, ano(y - 1));
    return Object.assign({ ant: mes(y, m - 1), rotulo: "Este mês", comp: "o mês passado" }, mes(y, m));
  };

  /* ---------- carregar dados (de mil em mil linhas) ---------- */
  async function lerTudo(tabela, colunas, coluna, crescente) {
    let tudo = [];
    for (let i = 0; i < 80; i++) {
      const r = await P.carregar(tabela, (t) => t.select(colunas).order(coluna, { ascending: crescente }).order("id").range(i * 1000, i * 1000 + 999));
      if (!r.ok) return { ok: false, dados: tudo };
      tudo = tudo.concat(r.dados);
      if (r.dados.length < 1000) break;
    }
    return { ok: true, dados: tudo };
  }
  const COLUNAS_NOTA = "id,chave,tipo,modelo,numero,serie,data_emissao,natureza,devolucao,emitente_nome,emitente_doc,destinatario_nome,destinatario_doc,valor_produtos,valor_frete,valor_desconto,valor_outros,valor_total,valor_icms,valor_pis,valor_cofins,valor_ipi,valor_tributos,forma_pagamento,status,conferida,obs,empresa_doc";
  const COLUNAS_ML = "id,chave,numero_venda,data_venda,status,status_desc,unidades,receita_produtos,receita_envio,tarifa_venda,tarifa_envio,cancelamentos,total,sku,anuncio,titulo,preco_unitario,tipo_anuncio,comprador,cidade,uf,forma_entrega";
  function numerar(l, campos) { campos.forEach((c) => { l[c] = Number(l[c]) || 0; }); return l; }

  /* ---------- gráficos (SVG feito à mão, sem biblioteca) ---------- */
  const NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, ...filhos) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v != null) e.setAttribute(k, v); });
    filhos.forEach((f) => { if (f != null) e.append(f.nodeType ? f : document.createTextNode(f)); });
    return e;
  }
  F.barras = function (labels, series, opcoes) {
    const o = Object.assign({ altura: 220 }, opcoes || {});
    const L = 600, A = o.altura, ml = 46, mb = 24, mt = 10, w = L - ml - 8, hh = A - mb - mt;
    const maxV = Math.max(1, ...series.flatMap((s) => s.valores.map((v) => Math.max(0, v))));
    const g = svg("svg", { viewBox: "0 0 " + L + " " + A, class: "fin-svg", role: "img", "aria-label": o.rotulo || "Gráfico de barras" });
    for (let i = 0; i <= 4; i++) {
      const y = mt + hh - (hh * i) / 4;
      g.append(svg("line", { x1: ml, x2: L - 8, y1: y, y2: y, class: "fin-grade" }), svg("text", { x: ml - 6, y: y + 4, "text-anchor": "end", class: "fin-eixo" }, F.curto((maxV * i) / 4)));
    }
    const passo = w / labels.length, larg = Math.min(28, (passo - 8) / series.length);
    labels.forEach((lb, i) => {
      series.forEach((s, k) => {
        const v = Math.max(0, s.valores[i] || 0), alt = (hh * v) / maxV;
        const x = ml + passo * i + (passo - larg * series.length) / 2 + larg * k;
        const barra = svg("rect", { x, y: mt + hh - alt, width: larg - 2, height: Math.max(v ? 1.5 : 0, alt), rx: 4, fill: s.cor });
        barra.append(svg("title", null, s.nome + ", " + lb + ": " + F.dinheiro(s.valores[i] || 0)));
        g.append(barra);
      });
      g.append(svg("text", { x: ml + passo * i + passo / 2, y: A - 6, "text-anchor": "middle", class: "fin-eixo" }, lb));
    });
    return g;
  };
  F.linha = function (labels, valores, cor) {
    const L = 600, A = 200, ml = 46, mb = 24, mt = 12, w = L - ml - 14, hh = A - mb - mt;
    const maxV = Math.max(1, ...valores), minV = Math.min(0, ...valores), faixa = maxV - minV || 1;
    const y = (v) => mt + hh - ((v - minV) / faixa) * hh, x = (i) => ml + (labels.length === 1 ? w / 2 : (w * i) / (labels.length - 1));
    const g = svg("svg", { viewBox: "0 0 " + L + " " + A, class: "fin-svg", role: "img", "aria-label": "Gráfico de linha" });
    for (let i = 0; i <= 4; i++) {
      const yy = mt + hh - (hh * i) / 4;
      g.append(svg("line", { x1: ml, x2: L - 14, y1: yy, y2: yy, class: "fin-grade" }), svg("text", { x: ml - 6, y: yy + 4, "text-anchor": "end", class: "fin-eixo" }, F.curto(minV + (faixa * i) / 4)));
    }
    if (minV < 0) g.append(svg("line", { x1: ml, x2: L - 14, y1: y(0), y2: y(0), class: "fin-zero" }));
    g.append(svg("polyline", { points: valores.map((v, i) => x(i) + "," + y(v)).join(" "), fill: "none", stroke: cor || "#2e6bd6", "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    valores.forEach((v, i) => {
      const p = svg("circle", { cx: x(i), cy: y(v), r: 4, fill: "#fff", stroke: cor || "#2e6bd6", "stroke-width": 2.5 });
      p.append(svg("title", null, labels[i] + ": " + F.dinheiro(v)));
      g.append(p, svg("text", { x: x(i), y: A - 6, "text-anchor": "middle", class: "fin-eixo" }, labels[i]));
    });
    return g;
  };
  F.rosca = function (fatias, centro, sub) {
    const total = soma(fatias, (f) => f.valor) || 1, R = 70, C = 2 * Math.PI * R;
    const g = svg("svg", { viewBox: "0 0 200 200", class: "fin-rosca", role: "img", "aria-label": "Gráfico de rosca" });
    g.append(svg("circle", { cx: 100, cy: 100, r: R, fill: "none", stroke: "#dfeaff", "stroke-width": 28 }));
    let acum = 0;
    fatias.forEach((f) => {
      const frac = f.valor / total, seg = svg("circle", { cx: 100, cy: 100, r: R, fill: "none", stroke: f.cor, "stroke-width": 28,
        "stroke-dasharray": (frac * C).toFixed(2) + " " + (C - frac * C).toFixed(2), "stroke-dashoffset": (-acum * C).toFixed(2), transform: "rotate(-90 100 100)" });
      seg.append(svg("title", null, f.nome + ": " + F.dinheiro(f.valor) + " (" + F.pct(frac * 100, 0) + ")"));
      g.append(seg); acum += frac;
    });
    g.append(svg("text", { x: 100, y: 98, "text-anchor": "middle", class: "fin-rosca-num" }, centro || ""), svg("text", { x: 100, y: 116, "text-anchor": "middle", class: "fin-eixo" }, sub || ""));
    return g;
  };
  F.progresso = (pct, cor) => h("div", { class: "fin-prog", role: "img", "aria-label": F.pct(pct, 0) }, h("i", { style: "width:" + Math.max(0, Math.min(100, pct)) + "%;background:" + (cor || "var(--couro)") }));

  /* ---------- peças de tela ---------- */
  F.tile = function (cor, rotulo, valor, sub, delta, boaQuandoSobe) {
    let sel = null;
    if (delta != null && isFinite(delta)) {
      const bom = boaQuandoSobe === false ? delta <= 0 : delta >= 0;
      sel = h("span", { class: "fin-delta " + (bom ? "bom" : "ruim"), title: "Comparado com o período anterior" }, (delta >= 0 ? "▲ " : "▼ ") + F.pct(Math.abs(delta), 1));
    }
    return h("div", { class: "fin-tile " + cor },
      h("div", { class: "fin-tile-rot", text: rotulo }),
      h("div", { class: "fin-tile-num", text: valor }),
      h("div", { class: "fin-tile-sub" }, sel, sub ? h("span", { text: sub }) : null));
  };
  F.cartao = (titulo, conteudo, extra) => h("section", { class: "fin-cartao" + (extra ? " " + extra : "") },
    titulo ? h("h3", { class: "fin-cartao-tit", text: titulo }) : null, conteudo);
  F.aviso = (texto, tipo) => h("p", { class: "fin-nota" + (tipo ? " " + tipo : ""), text: texto });
  F.pilulaStatus = (texto, tipo) => h("span", { class: "pilula fin-p-" + tipo, text: texto });
  F.tabela = (cabecalhos, linhas, vazio) => {
    if (!linhas.length) return h("p", { class: "fin-vazio", text: vazio || "Nada por aqui ainda." });
    return h("div", { class: "rolagem" }, h("table", { class: "tabela" },
      h("thead", null, h("tr", null, cabecalhos.map((c) => h("th", { class: c && c.num ? "num" : "", text: c && c.t != null ? c.t : c })))),
      h("tbody", null, linhas)));
  };

  /* ---------- cálculos ---------- */
  F.pagar = (ctx) => ctx.lancs.filter((l) => l.tipo === "pagar");
  F.receber = (ctx) => ctx.lancs.filter((l) => l.tipo === "receber");
  F.aberto = (l) => !l.pagamento;
  F.atrasado = (l) => !l.pagamento && l.vencimento < F.hoje();
  F.situacaoLanc = (l) => (l.pagamento ? "pago" : l.vencimento < F.hoje() ? "atrasado" : l.vencimento === F.hoje() ? "hoje" : "pendente");

  /* Resultado do período (DRE simplificada). Tudo é estimativa de gestão. */
  F.metricas = function (ctx, ini, fim) {
    const dentro = (d) => d >= ini && d <= fim;
    const notas = ctx.notas.filter((n) => n.status === "autorizada" && dentro(n.data_emissao));
    const vendas = notas.filter((n) => n.tipo === "saida" && !n.devolucao);
    const devVenda = notas.filter((n) => n.tipo === "entrada" && n.devolucao);
    const compras = notas.filter((n) => n.tipo === "entrada" && !n.devolucao);
    const devCompra = notas.filter((n) => n.tipo === "saida" && n.devolucao);
    const pagarPer = F.pagar(ctx).filter((l) => dentro(l.vencimento));
    const porCat = {};
    pagarPer.forEach((l) => { const c = l.categoria || "Outras despesas"; porCat[c] = (porCat[c] || 0) + l.valor; });
    const receitaBruta = soma(vendas, (n) => n.valor_total), devolucoes = soma(devVenda, (n) => n.valor_total);
    const impostos = porCat[F.CAT_IMPOSTOS] || 0;
    const financeiras = soma(F.FINANCEIRAS, (c) => porCat[c] || 0);
    const fornecedoresLanc = porCat[F.CAT_FORNECEDORES] || 0;
    const operacionais = soma(Object.keys(porCat).filter((c) => c !== F.CAT_IMPOSTOS && c !== F.CAT_FORNECEDORES && !F.FINANCEIRAS.includes(c)), (c) => porCat[c]);
    const comprasLiq = soma(compras, (n) => n.valor_total) - soma(devCompra, (n) => n.valor_total);
    const temCompras = compras.length > 0 || devCompra.length > 0;
    const cmv = temCompras ? comprasLiq : fornecedoresLanc;
    const receitaLiquida = receitaBruta - devolucoes - impostos;
    const lucroBruto = receitaLiquida - cmv;
    const resultadoOper = lucroBruto - operacionais;
    const resultado = resultadoOper - financeiras;
    const recebido = soma(F.receber(ctx).filter((l) => l.pagamento && dentro(l.pagamento)), (l) => l.valor);
    return { vendas, receitaBruta, devolucoes, impostos, financeiras, operacionais, cmv, cmvPelaNota: temCompras, receitaLiquida, lucroBruto, resultadoOper, resultado, recebido,
      despesas: operacionais + financeiras + impostos, porCat, ticket: vendas.length ? receitaBruta / vendas.length : 0, margemBruta: receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0,
      margemLiquida: receitaBruta > 0 ? (resultado / receitaBruta) * 100 : 0 };
  };
  F.saldoAtual = function (ctx) {
    if (ctx.cfg.saldo_inicial == null || ctx.cfg.saldo_inicial === "") return null;
    const d0 = ctx.cfg.saldo_data || "0000-00-00", hoje = F.hoje();
    const ent = soma(F.receber(ctx).filter((l) => l.pagamento && l.pagamento >= d0 && l.pagamento <= hoje), (l) => l.valor);
    const sai = soma(F.pagar(ctx).filter((l) => l.pagamento && l.pagamento >= d0 && l.pagamento <= hoje), (l) => l.valor);
    return (Number(ctx.cfg.saldo_inicial) || 0) + ent - sai;
  };
  F.resumoContas = function (lista) {
    const hoje = F.hoje(), em7 = F.somarDias(hoje, 7), em30 = F.somarDias(hoje, 30);
    const ab = lista.filter(F.aberto);
    return { atrasado: soma(ab.filter((l) => l.vencimento < hoje), (l) => l.valor), hoje: soma(ab.filter((l) => l.vencimento === hoje), (l) => l.valor),
      sete: soma(ab.filter((l) => l.vencimento > hoje && l.vencimento <= em7), (l) => l.valor), trinta: soma(ab.filter((l) => l.vencimento > em7 && l.vencimento <= em30), (l) => l.valor),
      total: soma(ab, (l) => l.valor), qtdAtrasado: ab.filter((l) => l.vencimento < hoje).length };
  };

  /* ---------- alertas (a "inteligência" do guia) ---------- */
  F.alertas = function (ctx, fx) {
    const a = [], m = F.metricas(ctx, fx.ini, fx.fim), ant = F.metricas(ctx, fx.ant.ini, fx.ant.fim);
    const hoje = F.hoje();
    const pagarAtras = F.resumoContas(F.pagar(ctx)), recAtras = F.resumoContas(F.receber(ctx));
    if (pagarAtras.qtdAtrasado) a.push({ n: "ruim", t: pagarAtras.qtdAtrasado + (pagarAtras.qtdAtrasado === 1 ? " conta a pagar está atrasada" : " contas a pagar estão atrasadas") + " (" + F.dinheiro(pagarAtras.atrasado) + ").", tela: "pagar" });
    if (recAtras.qtdAtrasado) a.push({ n: "ruim", t: "Recebíveis atrasados: " + recAtras.qtdAtrasado + " (" + F.dinheiro(recAtras.atrasado) + "). Vale revisar a cobrança.", tela: "receber" });
    if (ant.despesas > 0 && m.despesas > ant.despesas * 1.1) {
      const dif = Object.keys(m.porCat).map((c) => [c, m.porCat[c] - (ant.porCat[c] || 0)]).filter((x) => x[1] > 0 && x[0] !== F.CAT_FORNECEDORES).sort((x, y) => y[1] - x[1]).slice(0, 2);
      a.push({ n: "aviso", t: "As despesas cresceram " + F.pct(F.variacao(m.despesas, ant.despesas), 0) + " em relação a " + fx.comp + (dif.length ? ". O que mais subiu: " + dif.map((x) => x[0]).join(" e ") + "." : "."), tela: "pagar" });
    }
    if (ant.margemBruta > 0 && m.receitaBruta > 0 && m.margemBruta < ant.margemBruta - 5) a.push({ n: "aviso", t: "A margem bruta caiu de " + F.pct(ant.margemBruta, 0) + " para " + F.pct(m.margemBruta, 0) + ". Revise custo, preço e descontos.", tela: "dre" });
    const saldo = F.saldoAtual(ctx);
    if (saldo != null) {
      const em30 = F.somarDias(hoje, 30);
      const proj = saldo + soma(F.receber(ctx).filter((l) => !l.pagamento && l.vencimento <= em30), (l) => l.valor) - soma(F.pagar(ctx).filter((l) => !l.pagamento && l.vencimento <= em30), (l) => l.valor);
      if (proj < 0) a.push({ n: "ruim", t: "O saldo projetado para os próximos 30 dias fica negativo (" + F.dinheiro(proj) + "). Antecipe decisões de caixa.", tela: "caixa" });
    }
    const pend = ctx.notas.filter((n) => n.status === "autorizada" && !n.conferida).length;
    if (pend) a.push({ n: "aviso", t: pend + (pend === 1 ? " nota fiscal ainda não foi conferida." : " notas fiscais ainda não foram conferidas."), tela: "notas" });
    const meta = F.metaDoMes(ctx, hoje.slice(0, 7));
    if (meta && meta.faturamento > 0) {
      const mm = F.metricas(ctx, F.limitesDoMes(hoje.slice(0, 7)).ini, F.limitesDoMes(hoje.slice(0, 7)).fim);
      const pct = (mm.receitaBruta / meta.faturamento) * 100;
      a.push({ n: pct >= 100 ? "bom" : "info", t: "Meta de faturamento do mês: " + F.pct(pct, 0) + " atingida (" + F.dinheiro(mm.receitaBruta) + " de " + F.dinheiro(meta.faturamento) + ").", tela: "metas" });
    }
    if (F.parados) { const p = F.parados(ctx, 60); if (p != null && p > 0) a.push({ n: "aviso", t: p + (p === 1 ? " produto está" : " produtos estão") + " sem vender há mais de 60 dias. Avalie promoção ou liquidação.", tela: "estoque" }); }
    if (!ctx.notas.length) a.push({ n: "info", t: "Comece importando os XML das suas notas fiscais, no botão \"Importar notas\".", tela: "notas" });
    if (!a.length) a.push({ n: "bom", t: "Tudo certo por aqui. Nenhum alerta neste período.", tela: null });
    return a;
  };
  F.metaDoMes = (ctx, ym) => { try { const t = ctx.cfg["meta_" + ym]; return t ? JSON.parse(t) : null; } catch (e) { return null; } };

  /* ---------- VISÃO GERAL ---------- */
  F.telas.geral = function (ctx) {
    const fx = ctx.faixa, m = F.metricas(ctx, fx.ini, fx.fim), ant = F.metricas(ctx, fx.ant.ini, fx.ant.fim);
    const saldo = F.saldoAtual(ctx);
    const pagar = F.resumoContas(F.pagar(ctx)), receber = F.resumoContas(F.receber(ctx));
    const raiz = h("div", { class: "fin-geral" });

    raiz.append(h("div", { class: "fin-tiles" },
      F.tile("t-rosa", "Faturamento bruto", F.dinheiro(m.receitaBruta), m.vendas.length + (m.vendas.length === 1 ? " nota de venda" : " notas de venda"), F.variacao(m.receitaBruta, ant.receitaBruta)),
      F.tile("t-verde", "Vendas recebidas", F.dinheiro(m.recebido), "dinheiro que entrou", F.variacao(m.recebido, ant.recebido)),
      F.tile("t-coral", "Despesas totais", F.dinheiro(m.despesas), "sem contar as mercadorias", F.variacao(m.despesas, ant.despesas), false),
      F.tile("t-vinho", "Custo das mercadorias", F.dinheiro(m.cmv), m.cmvPelaNota ? "compras do período" : "contas de fornecedores", F.variacao(m.cmv, ant.cmv), false),
      F.tile("t-azul", "Lucro bruto", F.dinheiro(m.lucroBruto), "margem " + F.pct(m.margemBruta, 0), F.variacao(m.lucroBruto, ant.lucroBruto)),
      F.tile(m.resultado >= 0 ? "t-verde" : "t-vermelho", "Lucro líquido (estimado)", F.dinheiro(m.resultado), "margem " + F.pct(m.margemLiquida, 0), F.variacao(m.resultado, ant.resultado)),
      F.tile("t-ouro", "Impostos lançados", F.dinheiro(m.impostos), "guias do período", F.variacao(m.impostos, ant.impostos), false),
      F.tile("t-azul", "Saldo bancário", saldo == null ? "Defina" : F.dinheiro(saldo), saldo == null ? "em Fluxo de caixa" : "conforme os lançamentos", null)));

    /* gráfico dos últimos 6 meses */
    const meses = F.mesesAtras(6);
    const fat = [], gas = [];
    meses.forEach((ym) => { const l = F.limitesDoMes(ym), mm = F.metricas(ctx, l.ini, l.fim); fat.push(mm.receitaBruta - mm.devolucoes); gas.push(mm.cmv + mm.despesas); });
    const graf = F.cartao("Faturamento e custos nos últimos 6 meses", h("div", null, F.barras(meses.map(F.mesNome), [{ nome: "Faturamento", cor: "#2e6bd6", valores: fat }, { nome: "Custos e despesas", cor: "#e8a04c", valores: gas }], { rotulo: "Faturamento e custos" }),
      h("div", { class: "fin-legenda" }, h("span", null, h("i", { style: "background:#2e6bd6" }), "Faturamento"), h("span", null, h("i", { style: "background:#e8a04c" }), "Custos e despesas"))));

    /* despesas por categoria */
    const cats = Object.entries(m.porCat).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const fatias = cats.slice(0, 7).map((x, i) => ({ nome: x[0], valor: x[1], cor: F.CORES[i % F.CORES.length] }));
    if (cats.length > 7) fatias.push({ nome: "Outras", valor: soma(cats.slice(7), (x) => x[1]), cor: "#c7b6ba" });
    const totalCats = soma(cats, (x) => x[1]);
    const donut = F.cartao("Despesas por categoria", fatias.length ? h("div", { class: "fin-rosca-caixa" }, F.rosca(fatias, F.curto(totalCats), "total"),
      h("ul", { class: "fin-legenda-lista" }, fatias.map((f) => h("li", null, h("i", { style: "background:" + f.cor }), h("span", { text: f.nome }), h("b", { text: F.dinheiro(f.valor) }))))) : F.aviso("Sem despesas lançadas neste período. Cadastre em Contas a pagar."));
    raiz.append(h("div", { class: "fin-duas" }, graf, donut));

    /* saúde financeira + contas + alertas */
    const est = F.estoqueResumo ? F.estoqueResumo(ctx) : null;
    const saude = F.cartao("Saúde financeira da empresa", h("ul", { class: "fin-saude" },
      h("li", null, h("span", { text: "Quanto faturou" }), h("b", { text: F.dinheiro(m.receitaBruta) })),
      h("li", null, h("span", { text: "Quanto gastou (mercadorias + despesas)" }), h("b", { text: F.dinheiro(m.cmv + m.despesas) })),
      h("li", null, h("span", { text: "Investido em estoque" }), h("b", { text: est ? F.dinheiro(est.valor) : ctx.itens === null ? "carregando..." : "sem dados" })),
      h("li", null, h("span", { text: "Deve (contas a pagar em aberto)" }), h("b", { class: "ruim", text: F.dinheiro(pagar.total) })),
      h("li", null, h("span", { text: "Tem a receber" }), h("b", { class: "bom", text: F.dinheiro(receber.total) })),
      h("li", null, h("span", { text: "Quanto realmente lucrou (estimado)" }), h("b", { class: m.resultado >= 0 ? "bom" : "ruim", text: F.dinheiro(m.resultado) }))),
      "fin-cartao-saude");
    const quadro = (rot, r, cor) => h("div", { class: "fin-quadro" }, h("div", { class: "fin-quadro-tit", text: rot }),
      h("div", { class: "fin-quadro-grade" },
        h("div", null, h("span", { text: "Atrasado" }), h("b", { class: r.atrasado ? "ruim" : "", text: F.dinheiro(r.atrasado) })),
        h("div", null, h("span", { text: "Vence hoje" }), h("b", { text: F.dinheiro(r.hoje) })),
        h("div", null, h("span", { text: "Próximos 7 dias" }), h("b", { text: F.dinheiro(r.sete) })),
        h("div", null, h("span", { text: "8 a 30 dias" }), h("b", { text: F.dinheiro(r.trinta) }))));
    const contas = F.cartao("Contas a pagar e a receber", h("div", null, quadro("A pagar", pagar), quadro("A receber", receber)));
    const alertas = F.alertas(ctx, fx);
    const lista = F.cartao("Alertas e atenção", h("ul", { class: "fin-alertas" }, alertas.slice(0, 8).map((al) => h("li", { class: al.n },
      h("span", { class: "fin-bolinha" }), h("span", { class: "fin-alerta-txt", text: al.t }),
      al.tela ? h("button", { type: "button", class: "btn-i fin-ir", title: "Abrir", "aria-label": "Abrir a tela", onclick: () => ctx.ir(al.tela) }, "›") : null))));
    raiz.append(h("div", { class: "fin-tres" }, saude, contas, lista));
    raiz.append(F.aviso("Os números são uma estimativa de gestão feita com os arquivos importados e os lançamentos. Confirme impostos e resultado com o seu contador. Período: " + fx.rotulo.toLowerCase() + ", comparado com " + fx.comp + "."));
    return raiz;
  };

  /* ---------- NOTAS FISCAIS ---------- */
  function nomeParte(n) { return n.tipo === "saida" ? (n.destinatario_nome || "Consumidor") : (n.emitente_nome || "Fornecedor"); }
  function rotuloTipo(n) { return n.devolucao ? (n.tipo === "saida" ? "Devolução de compra" : "Devolução de venda") : n.tipo === "saida" ? "Venda (saída)" : "Compra (entrada)"; }

  async function abrirNota(ctx, n) {
    const corpo = h("div", null, h("p", { class: "fraco", text: "Carregando os itens..." }));
    const botoes = [{ texto: "Fechar" }];
    botoes.unshift({ texto: "Apagar nota", classe: "perigo", esquerda: true, aoClicar: async () => {
      if (!(await P.confirmar("Apagar a nota " + (n.numero || "") + " do painel? Os itens dela também saem. Isso não dá para desfazer (você pode importar o XML de novo).", { botao: "Apagar", perigo: true, titulo: "Apagar nota" }))) return false;
      const r = await P.gravar(() => window.sb.from("fin_notas").delete().eq("id", n.id));
      if (!r.ok) return false;
      P.toast("Nota apagada"); ctx.recarregar();
    } });
    botoes.push({ texto: n.conferida ? "Desmarcar conferência" : "Marcar como conferida", classe: "p", aoClicar: async () => {
      const r = await P.gravar(() => window.sb.from("fin_notas").update({ conferida: !n.conferida }).eq("id", n.id));
      if (!r.ok) return false;
      P.toast(n.conferida ? "Conferência desmarcada" : "Nota conferida"); ctx.recarregar();
    } });
    P.modal({ titulo: "Nota " + (n.numero || "") + (n.serie ? " (série " + n.serie + ")" : ""), corpo, botoes, larga: true });
    const r = await P.carregar("fin_nota_itens", (t) => t.select("*").eq("nota_id", n.id).order("descricao"));
    const itens = r.ok ? r.dados : [];
    P.limpar(corpo).append(
      h("div", { class: "fin-det" },
        h("div", null, h("span", { text: "Tipo" }), h("b", { text: rotuloTipo(n) })),
        h("div", null, h("span", { text: "Emissão" }), h("b", { text: P.fmtData(n.data_emissao) })),
        h("div", null, h("span", { text: n.tipo === "saida" ? "Cliente" : "Fornecedor" }), h("b", { text: nomeParte(n) })),
        h("div", null, h("span", { text: "Documento" }), h("b", { text: F.fmtDoc(n.tipo === "saida" ? n.destinatario_doc : n.emitente_doc) || "não informado" })),
        h("div", null, h("span", { text: "Valor total" }), h("b", { text: F.dinheiro(n.valor_total) })),
        h("div", null, h("span", { text: "Pagamento" }), h("b", { text: n.forma_pagamento || "não informado" })),
        h("div", null, h("span", { text: "Frete / descontos" }), h("b", { text: F.dinheiro(n.valor_frete) + " / " + F.dinheiro(n.valor_desconto) })),
        h("div", null, h("span", { text: "Tributos destacados" }), h("b", { text: F.dinheiro(n.valor_icms + n.valor_pis + n.valor_cofins + n.valor_ipi) })),
        h("div", null, h("span", { text: "Situação" }), h("b", { text: n.status })),
        h("div", null, h("span", { text: "Natureza" }), h("b", { text: n.natureza || "" }))),
      h("p", { class: "fin-chave", text: "Chave de acesso: " + n.chave }),
      F.tabela(["Produto", "NCM", "CFOP", { t: "Qtd", num: true }, { t: "Valor unitário", num: true }, { t: "Total", num: true }],
        itens.map((i) => h("tr", null, h("td", { text: i.descricao }), h("td", { class: "nw", text: i.ncm || "" }), h("td", { class: "nw", text: i.cfop || "" }),
          h("td", { class: "num", text: P.numero(Number(i.quantidade)) }), h("td", { class: "num", text: F.dinheiro(i.valor_unitario) }), h("td", { class: "num", text: F.dinheiro(i.valor_total) }))),
        "Esta nota não tem itens guardados (notas canceladas não guardam itens)."));
  }

  F.telas.notas = function (ctx) {
    const fx = ctx.faixa, raiz = h("div");
    const e = ctx.estadoNotas || (ctx.estadoNotas = { busca: "", tipo: "todas", status: "todas", empresa: "todas" });
    /* quando há notas de mais de uma empresa (a loja e a outra que emite as vendas), dá para filtrar por empresa */
    const empresas = new Map();
    ctx.notas.forEach((n) => { if (n.empresa_doc && !empresas.has(n.empresa_doc)) empresas.set(n.empresa_doc, (n.emitente_doc === n.empresa_doc ? n.emitente_nome : n.destinatario_nome) || F.fmtDoc(n.empresa_doc)); });
    const nomeEmpresa = (n) => (n.empresa_doc && empresas.get(n.empresa_doc)) || "";
    const doPeriodo = ctx.notas.filter((n) => n.data_emissao >= fx.ini && n.data_emissao <= fx.fim && (e.empresa === "todas" || n.empresa_doc === e.empresa));
    const resumo = (tipo) => {
      const l = doPeriodo.filter((n) => n.tipo === tipo), aut = l.filter((n) => n.status === "autorizada"), canc = l.filter((n) => n.status !== "autorizada");
      return h("div", { class: "fin-nfcartao" },
        h("div", { class: "fin-nfcartao-tit", text: tipo === "entrada" ? "Notas recebidas (compras)" : "Notas emitidas (vendas)" }),
        h("div", { class: "fin-nfcartao-lin" }, h("span", { text: "Total de notas" }), h("b", { text: String(l.length) })),
        h("div", { class: "fin-nfcartao-lin" }, h("span", { text: "Autorizadas" }), h("b", { class: "bom", text: String(aut.length) })),
        h("div", { class: "fin-nfcartao-lin" }, h("span", { text: "Canceladas ou recusadas" }), h("b", { class: canc.length ? "ruim" : "", text: String(canc.length) })),
        h("div", { class: "fin-nfcartao-val" }, h("span", { text: "Valor autorizado" }), h("b", { text: F.dinheiro(soma(aut, (n) => n.valor_total)) })));
    };
    raiz.append(h("div", { class: "fin-duas igual" }, resumo("entrada"), resumo("saida")));

    const busca = h("input", { type: "search", placeholder: "Buscar por número, nome, documento ou chave", value: e.busca, "aria-label": "Buscar nota" });
    const tabelaBox = h("div");
    const filtro = (rot, chave, valor, lista) => h("div", { class: "filtros", role: "group", "aria-label": rot },
      lista.map(([v, t]) => h("button", { type: "button", "aria-pressed": String(e[chave] === v), text: t, onclick: () => { e[chave] = v; ctx.desenhar(); } })));
    function desenharTabela() {
      P.limpar(tabelaBox);
      const q = P.semAcento(e.busca);
      let l = doPeriodo.filter((n) => (e.tipo === "todas" || n.tipo === e.tipo) && (e.status === "todas" || (e.status === "pend" ? n.status === "autorizada" && !n.conferida : n.status === e.status)));
      if (q) l = l.filter((n) => P.semAcento([n.numero, n.emitente_nome, n.destinatario_nome, n.emitente_doc, n.destinatario_doc, n.chave].join(" ")).includes(q));
      l = l.slice().sort((a, b) => (a.data_emissao < b.data_emissao ? 1 : -1));
      F.anexar(tabelaBox, F.tabela(["Data", "Tipo", "Número", "Cliente / fornecedor", { t: "Valor", num: true }, "Pagamento", "Situação", "Conferida"].concat(empresas.size > 1 ? ["Empresa"] : []),
        l.slice(0, 300).map((n) => h("tr", { class: "clicavel", onclick: () => abrirNota(ctx, n) },
          h("td", { class: "nw", text: P.fmtData(n.data_emissao) }), h("td", { class: "nw", text: rotuloTipo(n) }), h("td", { class: "nw", text: n.numero || "" }),
          h("td", { class: "truncar", title: nomeParte(n), text: nomeParte(n) }), h("td", { class: "num", text: F.dinheiro(n.valor_total) }),
          h("td", { class: "nw", text: n.forma_pagamento || "" }),
          h("td", null, F.pilulaStatus(n.status === "autorizada" ? "Autorizada" : n.status === "cancelada" ? "Cancelada" : n.status === "denegada" ? "Denegada" : "Recusada", n.status === "autorizada" ? "ok" : "ruim")),
          h("td", null, n.conferida ? F.pilulaStatus("Conferida", "ok") : F.pilulaStatus("Pendente", "aviso")),
          empresas.size > 1 ? h("td", { class: "truncar", style: "max-width:160px", title: nomeEmpresa(n), text: nomeEmpresa(n) }) : null)),
        doPeriodo.length ? "Nenhuma nota com esse filtro." : "Nenhuma nota neste período. Use o botão Importar notas para trazer os XML."),
        l.length > 300 ? h("p", { class: "fraco", text: "Mostrando as 300 notas mais recentes de " + l.length + ". Use a busca ou mude o período." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { e.busca = busca.value; desenharTabela(); }, 150));
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" },
      h("div", { class: "busca" }, P.ic("busca"), busca),
      filtro("Tipo", "tipo", e.tipo, [["todas", "Todas"], ["entrada", "Compras"], ["saida", "Vendas"]]),
      filtro("Situação", "status", e.status, [["todas", "Todas"], ["pend", "Pendentes de conferência"], ["cancelada", "Canceladas"]]),
      empresas.size > 1 ? h("select", { "aria-label": "Empresa", onchange: (ev) => { e.empresa = ev.target.value; ctx.desenhar(); } },
        h("option", { value: "todas", text: "As duas empresas juntas", selected: e.empresa === "todas" }),
        Array.from(empresas.entries()).map(([doc, nome]) => h("option", { value: doc, text: nome + " (" + F.fmtDoc(doc) + ")", selected: e.empresa === doc }))) : null,
      h("span", { class: "espaco" }),
      h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacao(ctx) }, P.ic("subir"), "Importar notas")),
      tabelaBox);
    desenharTabela();
    return raiz;
  };

  /* ---------- IMPORTAÇÃO (XML soltos e pastas .zip) ---------- */
  F.abrirImportacao = function (ctx) {
    const X = P.finXml;
    let lido = null;   /* resultado da leitura dos arquivos */
    const input = h("input", { type: "file", multiple: true, accept: ".xml,.zip,application/zip,text/xml,application/xml", id: "finArquivos", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finArquivos", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha os arquivos ou arraste até aqui" }),
      h("span", { class: "fraco", text: "XML das notas fiscais e pastas compactadas (.zip), de uma vez só. Pode ser a pasta inteira que você manda para a contabilidade." }));
    const campoCnpj = h("textarea", { rows: "2", placeholder: "00.000.000/0000-00", "aria-label": "CNPJs das suas empresas", style: "min-height:0" });
    campoCnpj.value = F.meusCnpjs(ctx).map(F.fmtDoc).join("\n");
    const chipsCnpj = h("div", { class: "fin-chips-cnpj" });
    const resumoBox = h("div"), cnpjBox = h("div"), progresso = h("p", { class: "fraco", role: "status" });
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Tudo é lido aqui no seu navegador. Só o resultado (dados das notas e dos produtos) é guardado no painel." }),
      input, zona, progresso, cnpjBox, resumoBox);

    const meusCnpjs = () => X.lerCnpjs(campoCnpj.value);
    function plano() {
      /* o que vai ser importado, com a classificação atual dos CNPJs */
      const meus = meusCnpjs();
      const jaTem = new Set(ctx.notas.map((n) => n.chave));
      const vistos = new Set(), candidatas = [], repetidas = [];
      lido.notas.forEach((r) => {
        if (vistos.has(r.nota.chave)) { repetidas.push(r); return; }
        vistos.add(r.nota.chave);
        if (jaTem.has(r.nota.chave)) repetidas.push(r); else candidatas.push(r);
      });
      const cancel = new Set(lido.eventos.map((e) => e.chave));
      const novas = [], internas = [];
      candidatas.forEach((r) => {
        r.tipoFinal = meus.length ? X.classificar(r, meus) : "entrada";
        r.empresa = X.empresaDaNota(r, meus);
        if (cancel.has(r.nota.chave)) r.nota.status = "cancelada";
        if (r.tipoFinal === "interna") internas.push(r); else novas.push(r);
      });
      const cancelarExistentes = ctx.notas.filter((n) => cancel.has(n.chave) && n.status !== "cancelada");
      return { novas, repetidas, internas, cancelarExistentes, meus };
    }
    function desenharResumo() {
      P.limpar(resumoBox);
      if (!lido) return;
      const p = plano();
      const entr = p.novas.filter((r) => r.tipoFinal === "entrada"), sai = p.novas.filter((r) => r.tipoFinal === "saida");
      const agrup = {};
      lido.ignorados.forEach((i) => { agrup[i.motivo] = (agrup[i.motivo] || 0) + 1; });
      F.anexar(resumoBox,
        h("div", { class: "fin-impo-res" },
          h("div", null, h("b", { text: String(lido.notas.length) }), h("span", { text: "notas lidas" })),
          h("div", null, h("b", { text: String(p.novas.length) }), h("span", { text: "novas para importar" })),
          h("div", null, h("b", { text: String(entr.length) }), h("span", { text: "compras (entrada)" })),
          h("div", null, h("b", { text: String(sai.length) }), h("span", { text: "vendas (saída)" })),
          h("div", null, h("b", { text: String(p.repetidas.length) }), h("span", { text: "já estavam aqui" }))),
        p.internas.length ? h("p", { class: "dica", text: p.internas.length + (p.internas.length === 1 ? " nota é" : " notas são") + " entre as suas próprias empresas (transferência). Elas não entram no faturamento nem nas compras, então não serão importadas." }) : null,
        !p.meus.length ? h("p", { class: "aviso-pagina erro", text: "Informe acima o CNPJ das suas empresas para eu separar o que é compra e o que é venda." }) : null,
        p.cancelarExistentes.length || lido.eventos.length ? h("p", { class: "dica", text: lido.eventos.length + " aviso(s) de cancelamento encontrados" + (p.cancelarExistentes.length ? ". " + p.cancelarExistentes.length + " nota(s) que já estão no painel serão marcadas como canceladas." : ".") }) : null,
        Object.keys(agrup).length ? h("div", { class: "aviso-pagina" }, Object.keys(agrup).map((m) => h("p", { text: agrup[m] + " arquivo(s) não importado(s): " + m }))) : null,
        lido.outros.length ? h("p", { class: "dica", text: lido.outros.length + " arquivo(s) que não são XML (como PDF) foram ignorados: o painel guarda só os dados das notas." }) : null,
        lido.erros.length ? h("div", { class: "aviso-pagina erro" }, h("b", { text: lido.erros.length + " arquivo(s) com problema" }), lido.erros.slice(0, 5).map((e) => h("p", { text: e.nome.split(" / ").pop() + ": " + e.motivo })), lido.erros.length > 5 ? h("p", { text: "e mais " + (lido.erros.length - 5) + "..." }) : null) : null,
        p.novas.length ? F.tabela(["Data", "Tipo", "Número", "Cliente / fornecedor", { t: "Valor", num: true }],
          p.novas.slice(0, 8).map((r) => h("tr", null, h("td", { class: "nw", text: P.fmtData(r.nota.data_emissao) }), h("td", { class: "nw", text: r.nota.devolucao ? "Devolução" : r.tipoFinal === "saida" ? "Venda" : "Compra" }),
            h("td", { class: "nw", text: r.nota.numero }), h("td", { class: "truncar", text: (r.tipoFinal === "saida" ? r.nota.destinatario_nome : r.nota.emitente_nome) || "" }), h("td", { class: "num", text: F.dinheiro(r.nota.valor_total) })))) : null,
        p.novas.length > 8 ? h("p", { class: "dica", text: "Mostrando 8 de " + p.novas.length + "." }) : null);
    }
    campoCnpj.addEventListener("input", P.debounce(() => { if (lido) desenharResumo(); }, 250));
    async function ler(arquivos) {
      if (!arquivos || !arquivos.length) return;
      progresso.textContent = "Lendo os arquivos...";
      try {
        lido = await X.lerArquivos(arquivos, (n) => { progresso.textContent = "Lendo os arquivos... " + n + " já lidos"; });
      } catch (err) { progresso.textContent = ""; P.toast(err && err.message ? err.message : "Não consegui abrir esses arquivos.", true); return; }
      progresso.textContent = lido.lidos + " arquivo(s) XML lidos.";
      const sugeridos = X.sugerirCnpjs(lido.notas);
      if (!meusCnpjs().length && sugeridos.length) campoCnpj.value = F.fmtDoc(sugeridos[0].doc);
      P.limpar(chipsCnpj);
      if (sugeridos.length) {
        chipsCnpj.append(h("span", { class: "fraco", text: "CNPJs que aparecem nas notas (clique para incluir):" }));
        sugeridos.forEach((s) => chipsCnpj.append(h("button", { type: "button", class: "fin-chip-cnpj", title: "Incluir na lista das suas empresas",
          onclick: () => { if (!meusCnpjs().includes(s.doc)) { campoCnpj.value = (campoCnpj.value.trim() ? campoCnpj.value.trim() + "\n" : "") + F.fmtDoc(s.doc); desenharResumo(); } } },
          F.fmtDoc(s.doc) + " (" + s.qtd + ")")));
      }
      if (!cnpjBox.firstChild) cnpjBox.append(h("div", { class: "campo", style: "margin-top:12px" }, h("label", { text: "CNPJ das suas empresas" }), campoCnpj, chipsCnpj,
        h("p", { class: "dica", text: "Coloque só os CNPJs das suas empresas, a SmartBrand e a outra que emite as vendas (um por linha). Não inclua fornecedores nem clientes. Tudo o que essas empresas emitem ou recebem entra aqui como da SmartBrand. É assim que eu separo venda (você emitiu) de compra (você recebeu). Notas entre as duas empresas são ignoradas, para não contar duas vezes." })));
      desenharResumo();
    }
    input.addEventListener("change", () => ler(input.files));
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files));

    P.modal({ titulo: "Importar notas fiscais", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Importar", classe: "p", aoClicar: async () => {
        if (!lido) { P.toast("Escolha os arquivos primeiro.", true); return false; }
        const p = plano();
        if (!p.meus.length) { P.toast("Informe o CNPJ das suas empresas (14 números cada).", true); return false; }
        if (!p.novas.length && !p.cancelarExistentes.length) { P.toast("Não há nada novo para importar.", true); return false; }
        if (p.meus.join(",") !== F.meusCnpjs(ctx).join(",")) {
          if (!(await ctx.salvarCfg("cnpjs_empresa", p.meus.join(",")))) return false;
        }
        let feitas = 0;
        for (let i = 0; i < p.novas.length; i += 100) {
          const pedaco = p.novas.slice(i, i + 100);
          const linhas = pedaco.map((r) => { const n = Object.assign({}, r.nota, { tipo: r.tipoFinal, empresa_doc: r.empresa || null }); delete n.tpNF; return n; });
          const rn = await P.gravar(() => window.sb.from("fin_notas").insert(linhas).select("id,chave"));
          if (!rn.ok) { P.toast("Parei no meio: " + feitas + " notas já foram guardadas. Rode a importação de novo para continuar.", true); ctx.recarregar(); return false; }
          const idPorChave = new Map((rn.data || []).map((x) => [x.chave, x.id]));
          const itens = [];
          pedaco.forEach((r) => {
            if (r.nota.status !== "autorizada") return;
            const id = idPorChave.get(r.nota.chave);
            if (id) r.itens.forEach((it) => itens.push(Object.assign({ nota_id: id, tipo: r.tipoFinal, devolucao: r.nota.devolucao, data_emissao: r.nota.data_emissao }, it)));
          });
          for (let k = 0; k < itens.length; k += 500) {
            const ri = await P.gravar(() => window.sb.from("fin_nota_itens").insert(itens.slice(k, k + 500)));
            if (!ri.ok) { P.toast("Guardei as notas, mas não os itens de algumas. Apague essas notas e importe de novo.", true); ctx.recarregar(); return false; }
          }
          feitas += pedaco.length;
        }
        for (const n of p.cancelarExistentes) {
          await P.gravar(() => window.sb.from("fin_notas").update({ status: "cancelada" }).eq("id", n.id));
          await P.gravar(() => window.sb.from("fin_nota_itens").delete().eq("nota_id", n.id));
        }
        P.toast(feitas + (feitas === 1 ? " nota importada" : " notas importadas") + (p.cancelarExistentes.length ? " e " + p.cancelarExistentes.length + " cancelada(s)" : "") + "!");
        ctx.recarregar(true);
      } }
    ] });
  };

  /* ---------- a aba ---------- */
  const TELAS = [["geral", "Visão geral"], ["notas", "Notas fiscais"], ["ml", "Mercado Livre"], ["loja", "Vendas da loja"], ["pagar", "Contas a pagar"], ["receber", "Contas a receber"], ["impostos", "Impostos"],
    ["estoque", "Estoque e custos"], ["dre", "DRE e lucratividade"], ["caixa", "Fluxo de caixa"], ["parceiros", "Fornecedores e clientes"], ["metas", "Metas e indicadores"]];
  const lerLocal = (k, padrao) => { try { return localStorage.getItem(k) || padrao; } catch (e) { return padrao; } };
  const guardarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } };

  P.abas.financeiro = {
    async renderizar(raiz) {
      const ctx = { notas: [], lancs: [], itens: null, cfg: {}, tela: lerLocal("fin_tela", "geral"), periodo: lerLocal("fin_periodo", "mes") };
      if (!TELAS.some((t) => t[0] === ctx.tela)) ctx.tela = "geral";
      if (!PERIODOS.some((t) => t[0] === ctx.periodo)) ctx.periodo = "mes";
      let carregandoItens = false;
      const area = h("div", { class: "fin-area" });

      async function carregar() {
        const [rn, rl, rc, rm, rv] = await Promise.all([
          lerTudo("fin_notas", COLUNAS_NOTA, "data_emissao", false),
          lerTudo("fin_lancamentos", "*", "vencimento", true),
          P.carregar("fin_config", (t) => t.select("chave,valor")),
          lerTudo("fin_vendas_ml", COLUNAS_ML, "data_venda", false),
          lerTudo("fin_vendas_loja", "id,periodo_ini,periodo_fim,produto,sku,quantidade,valor,frete,total", "periodo_ini", false)
        ]);
        ctx.lojaOk = rv.ok;   /* idem: tabela separada, só a tela dela avisa se faltar */
        ctx.vendasLoja = rv.dados.map((v) => numerar(v, ["quantidade", "valor", "frete", "total"]));
        ctx.tabelasOk = rn.ok && rl.ok && rc.ok;
        ctx.mlOk = rm.ok;   /* a tabela do Mercado Livre é separada: se faltar, só a tela dela avisa */
        ctx.vendasML = rm.dados.map((v) => numerar(v, ["receita_produtos", "receita_envio", "tarifa_venda", "tarifa_envio", "cancelamentos", "total", "unidades"]));
        ctx.notas = rn.dados.map((n) => numerar(n, ["valor_produtos", "valor_frete", "valor_desconto", "valor_outros", "valor_total", "valor_icms", "valor_pis", "valor_cofins", "valor_ipi", "valor_tributos"]));
        ctx.lancs = rl.dados.map((l) => numerar(l, ["valor"]));
        ctx.cfg = {}; (rc.ok ? rc.dados : []).forEach((c) => { ctx.cfg[c.chave] = c.valor; });
      }
      async function carregarItens() {
        if (carregandoItens || ctx.itens !== null || !ctx.tabelasOk) return;
        carregandoItens = true;
        const r = await lerTudo("fin_nota_itens", "id,nota_id,tipo,devolucao,data_emissao,codigo,ean,descricao,quantidade,valor_unitario,valor_total,desconto", "data_emissao", true);
        ctx.itens = r.ok ? r.dados.map((i) => numerar(i, ["quantidade", "valor_unitario", "valor_total", "desconto"])) : [];
        carregandoItens = false;
        desenharTela();
      }
      ctx.recarregar = async (itensTambem) => { if (itensTambem) ctx.itens = null; await carregar(); desenhar(); };
      ctx.desenhar = () => desenhar();
      ctx.ir = (t) => { ctx.tela = t; guardarLocal("fin_tela", t); desenhar(); };
      ctx.salvarCfg = async (chave, valor) => {
        const r = await P.gravar(() => window.sb.from("fin_config").upsert({ chave, valor: String(valor) }, { onConflict: "chave" }));
        if (r.ok) ctx.cfg[chave] = String(valor);
        return r.ok;
      };

      function desenharTela() {
        ctx.faixa = F.faixa(ctx.periodo);
        P.limpar(area);
        const fn = F.telas[ctx.tela];
        if (!fn) { area.append(F.aviso("Esta tela ainda não foi carregada. Atualize a página (Ctrl+F5).", "erro")); return; }
        if (["estoque", "geral", "metas", "parceiros"].includes(ctx.tela) && ctx.itens === null) carregarItens();
        try { area.append(fn(ctx)); } catch (e) { console.error(e); area.append(F.aviso("Esta tela encontrou um problema e não abriu direito. As outras continuam funcionando.", "erro")); }
      }
      function desenhar() {
        if (!ctx.tabelasOk) {
          P.limpar(raiz).append(h("div", { class: "aviso-pagina erro", role: "alert" }, h("b", { text: "Falta criar as tabelas do Financeiro no Supabase" }),
            h("p", { text: "Abra o SQL Editor do projeto \"niellypinheiro portfólio\", cole o arquivo supabase/financeiro.sql (o Claude te passa o texto) e clique em Run. Depois atualize esta página." })));
          return;
        }
        const seletor = h("select", { class: "fin-periodo", "aria-label": "Período", onchange: (e) => { ctx.periodo = e.target.value; guardarLocal("fin_periodo", ctx.periodo); desenharTela(); } },
          PERIODOS.map(([v, t]) => h("option", { value: v, text: t, selected: v === ctx.periodo })));
        const menu = h("div", { class: "ig-chips fin-menu", role: "group", "aria-label": "Telas do financeiro" }, TELAS.map(([v, t]) =>
          h("button", { type: "button", class: "ig-chip", "aria-pressed": String(v === ctx.tela), text: t, onclick: () => ctx.ir(v) })));
        P.limpar(raiz).append(h("div", { class: "fin-topo" }, menu,
          h("div", { class: "fin-topo-dir" }, h("label", { class: "fraco", for: "finPeriodoSel", text: "Período:" }), seletor,
            h("button", { type: "button", class: "btn", onclick: () => F.importarPlanilha(ctx) }, P.ic("subir"), "Importar planilha"),
            h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacao(ctx) }, P.ic("subir"), "Importar notas"))), area);
        seletor.id = "finPeriodoSel";
        desenharTela();
      }
      await carregar();
      desenhar();
    }
  };
})();
