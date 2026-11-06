/* =========================================================================
   Financeiro: CANAIS DE VENDA (Mercado Livre, Shopee, Amazon, Magalu...).
   Cada nota de venda é ligada a um canal. O canal é descoberto assim:
     1. pelo relatório de notas emitidas de cada canal (o mais seguro): a nota
        que aparece no relatório do Mercado Livre é do Mercado Livre;
     2. pela própria nota, quando ela traz o CNPJ do intermediador ou o número
        de pedido da Amazon;
     3. pelo CT-e: nota enviada pelo Mercado Envios é do Mercado Livre;
     4. à mão, na lista "Notas sem canal".
   Com o canal, a tela mostra faturamento, custo dos produtos, frete e margem
   de cada canal, e de cada uma das suas empresas (Provision e Smart Brand).
   O lucro é uma ESTIMATIVA de gestão (antes de impostos).
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});
  F.telas = F.telas || {};

  F.CANAIS = ["Mercado Livre", "Shopee", "Amazon", "Magalu", "Loja", "Outro"];
  const norm = (s) => P.semAcento(String(s == null ? "" : s)).replace(/[^a-z0-9]+/g, " ").trim();
  const dois = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const digitos = (s) => String(s == null ? "" : s).replace(/\D/g, "");
  const ROTULO_ORIGEM = { relatorio: "pelo relatório do canal", xml: "pela própria nota", manual: "escolhido por você", cte: "pelo frete (Mercado Envios)" };

  /* canal de uma nota: o gravado, ou o do frete do Mercado Envios */
  F.canalDaNota = function (ctx, n) {
    if (n.canal) return { canal: n.canal, origem: n.canal_origem || "manual" };
    if (ctx._cteNotas === undefined || ctx._cteRef !== ctx.ctes) {
      ctx._cteNotas = new Set((ctx.ctes || []).filter((c) => c.nfe_chave && c.status === "autorizado").map((c) => c.nfe_chave)); ctx._cteRef = ctx.ctes;
    }
    if (ctx._cteNotas.has(n.chave)) return { canal: "Mercado Livre", origem: "cte" };
    return null;
  };

  /* nome de cada empresa (pelo emitente das notas de venda) */
  function nomesEmpresas(ctx) {
    const m = new Map();
    F.meusCnpjs(ctx).forEach((d) => m.set(d, F.fmtDoc(d)));
    ctx.notas.forEach((n) => { if (n.tipo === "saida" && n.empresa_doc && n.emitente_nome && n.emitente_doc === n.empresa_doc) m.set(n.empresa_doc, n.emitente_nome); });
    return m;
  }

  /* ---------- grava o canal em várias notas ---------- */
  F.gravarCanal = async function (ctx, ids, canal, origem) {
    for (let i = 0; i < ids.length; i += 100) {
      const r = await P.gravar(() => window.sb.from("fin_notas").update({ canal, canal_origem: origem }).in("id", ids.slice(i, i + 100)));
      if (!r.ok) return false;
    }
    return true;
  };

  /* ---------- importar o relatório de um canal ---------- */
  const palpiteCanal = (nome, abas) => {
    const t = norm(nome + " " + abas.map((a) => a.nome).join(" ") + " " + abas.slice(0, 1).map((a) => a.linhas.slice(0, 6).map((l) => l.join(" ")).join(" ")).join(" "));
    if (/shopee/.test(t)) return "Shopee";
    if (/amazon/.test(t)) return "Amazon";
    if (/magalu|magazine/.test(t)) return "Magalu";
    if (/mercado livre|mercadolivre|mercado envios|meli/.test(t)) return "Mercado Livre";
    return "";
  };
  /* procura nas planilhas: chaves de acesso (44 números) e, se não houver, a coluna com o número da nota */
  function extrairNotas(abas) {
    const chaves = new Set(), numeros = new Set();
    abas.forEach((a) => {
      const linhas = a.linhas.filter((l) => l.some((v) => String(v).trim() !== ""));
      let colNum = -1, ini = 0;
      for (let r = 0; r < Math.min(15, linhas.length); r++) {
        const n = linhas[r].map(norm), i = n.findIndex((c) => /^(numero|n|no)? ?(da |de |do )?(nf ?e?|nota( fiscal)?)$/.test(c));
        if (i !== -1) { colNum = i; ini = r + 1; break; }
      }
      linhas.forEach((l, r) => {
        l.forEach((v) => { const d = digitos(typeof v === "number" ? v.toFixed(0) : v); if (d.length === 44 && /^\d{20}(55|65)/.test(d)) chaves.add(d); });
        if (colNum !== -1 && r >= ini) { const d = digitos(typeof l[colNum] === "number" ? l[colNum].toFixed(0) : l[colNum]); if (d && d.length <= 9) numeros.add(String(parseInt(d, 10))); }
      });
    });
    return { chaves, numeros };
  }
  F.pareceRelatorioCanal = (linhas) => {
    const ex = extrairNotas([{ nome: "", linhas }]);
    return ex.chaves.size >= 1 || ex.numeros.size >= 2;
  };

  F.abrirImportacaoCanal = function (ctx, arquivoPre) {
    let lido = null, nomeArq = "";
    const canalSel = h("select", { "aria-label": "Canal do relatório" }, h("option", { value: "", text: "Escolha o canal" }), F.CANAIS.filter((c) => c !== "Loja").map((c) => h("option", { value: c, text: c })));
    const input = h("input", { type: "file", accept: ".xlsx,.xls,.csv,text/csv", id: "finPlanilhaCanal", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finPlanilhaCanal", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha o relatório de notas emitidas do canal" }),
      h("span", { class: "fraco", text: "Excel (.xlsx) ou CSV baixado no Mercado Livre, na Shopee, na Amazon ou no Magalu." }));
    const progresso = h("p", { class: "fraco", role: "status" }), previa = h("div");
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Suba o relatório de notas emitidas de um canal. Eu procuro a chave da nota (ou o número) no relatório, acho a nota no painel e marco como sendo desse canal. Importe antes os XML das notas." }),
      P.campo("Canal deste relatório", canalSel), input, zona, progresso, previa);

    function plano() {
      const ex = lido.ex, canal = canalSel.value, vendas = ctx.notas.filter((n) => n.tipo === "saida");
      const porChave = new Map(vendas.map((n) => [n.chave, n])), porNumero = new Map();
      vendas.forEach((n) => { const k = String(parseInt(n.numero, 10)); (porNumero.get(k) || porNumero.set(k, []).get(k)).push(n); });
      const achadas = new Map(), semNota = [], ambiguas = [];
      ex.chaves.forEach((c) => { const n = porChave.get(c); if (n) achadas.set(n.id, n); else semNota.push(c.slice(25, 34).replace(/^0+/, "") || c); });
      if (!ex.chaves.size) ex.numeros.forEach((num) => {
        const l = porNumero.get(num) || [];
        if (l.length === 1) achadas.set(l[0].id, l[0]); else if (l.length > 1) ambiguas.push(num); else semNota.push(num);
      });
      const lista = Array.from(achadas.values());
      const jaIgual = lista.filter((n) => n.canal === canal), conflito = lista.filter((n) => n.canal && n.canal !== canal && n.canal_origem === "manual");
      const aplicar = lista.filter((n) => n.canal !== canal && !(n.canal && n.canal_origem === "manual"));
      const porEmpresa = new Map(); lista.forEach((n) => { const k = n.empresa_doc || n.emitente_doc || "?"; porEmpresa.set(k, (porEmpresa.get(k) || 0) + 1); });
      return { lista, jaIgual, conflito, aplicar, semNota, ambiguas, porEmpresa, canal };
    }
    function desenhar() {
      P.limpar(previa);
      if (!lido) return;
      const p = plano(), nomes = nomesEmpresas(ctx);
      F.anexar(previa,
        h("div", { class: "fin-impo-res", style: "margin-top:12px" },
          h("div", null, h("b", { text: String(lido.ex.chaves.size || lido.ex.numeros.size) }), h("span", { text: "notas no relatório" })),
          h("div", null, h("b", { text: String(p.lista.length) }), h("span", { text: "achadas no painel" })),
          h("div", null, h("b", { text: String(p.aplicar.length) }), h("span", { text: "para marcar" })),
          h("div", null, h("b", { text: String(p.semNota.length) }), h("span", { text: "não estão no painel" }))),
        h("p", { class: "dica", text: (lido.ex.chaves.size ? "Achei pela chave de acesso." : "Não achei chaves de acesso, então usei o número da nota.") + (p.porEmpresa.size ? " Por empresa: " + Array.from(p.porEmpresa.entries()).map(([d, q]) => (nomes.get(d) || F.fmtDoc(d)) + " (" + q + ")").join("; ") + "." : "") }),
        !canalSel.value ? h("p", { class: "aviso-pagina erro", text: "Escolha de qual canal é este relatório." }) : null,
        p.jaIgual.length ? h("p", { class: "dica", text: p.jaIgual.length + " nota(s) já estavam marcadas como " + p.canal + "." }) : null,
        p.conflito.length ? h("p", { class: "aviso-pagina", text: p.conflito.length + " nota(s) foram marcadas por você como outro canal e não serão mudadas. Confira em Canais de venda." }) : null,
        p.ambiguas.length ? h("p", { class: "aviso-pagina", text: p.ambiguas.length + " número(s) de nota existem nas duas empresas e não consegui escolher (por exemplo a nota " + p.ambiguas[0] + "). Use um relatório com a chave da nota." }) : null,
        p.semNota.length ? h("p", { class: "aviso-pagina", text: p.semNota.length + " nota(s) do relatório não estão no painel (por exemplo a " + p.semNota[0] + "). Importe os XML delas em Importar notas e suba o relatório de novo." }) : null,
        !ctx.canaisOk ? h("p", { class: "aviso-pagina erro", text: "Falta criar o campo de canal no banco. Use a faixa amarela \"Copiar o SQL\" no topo do Financeiro." }) : null);
    }
    async function ler(arquivo) {
      if (!arquivo) return;
      progresso.textContent = "Lendo o relatório..."; lido = null; P.limpar(previa);
      let abas;
      try { abas = await F.lerAbas(arquivo); }
      catch (e) { progresso.textContent = ""; P.toast(e && /carregar/.test(e.message || "") ? e.message : "Não consegui ler esse arquivo.", true); return; }
      const ex = extrairNotas(abas);
      if (!ex.chaves.size && ex.numeros.size < 1) { progresso.textContent = ""; P.toast("Não achei a chave nem o número das notas nesse relatório. Me mande um exemplo para eu ajustar.", true); return; }
      lido = { ex }; nomeArq = arquivo.name;
      if (!canalSel.value) canalSel.value = palpiteCanal(arquivo.name, abas);
      progresso.textContent = "Relatório lido: " + arquivo.name + ".";
      desenhar();
    }
    input.addEventListener("change", () => ler(input.files[0]));
    canalSel.addEventListener("change", desenhar);
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));

    P.modal({ titulo: "Importar relatório de um canal", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Marcar as notas", classe: "p", aoClicar: async () => {
        if (!lido) { P.toast("Escolha o relatório primeiro.", true); return false; }
        if (!canalSel.value) { P.toast("Escolha de qual canal é este relatório.", true); return false; }
        if (!ctx.canaisOk) { P.toast("Falta criar o campo de canal no banco (SQL).", true); return false; }
        const p = plano();
        if (!p.aplicar.length) { P.toast("Nenhuma nota nova para marcar.", true); return false; }
        if (!(await F.gravarCanal(ctx, p.aplicar.map((n) => n.id), p.canal, "relatorio"))) return false;
        P.toast(p.aplicar.length + " nota(s) marcadas como " + p.canal + "!");
        ctx.recarregar();
      } }
    ] });
    if (arquivoPre) ler(arquivoPre);
  };

  /* ---------- a tela ---------- */
  F.telas.canais = function (ctx) {
    const raiz = h("div"), fx = ctx.faixa;
    if (!ctx.canaisOk) {
      raiz.append(F.aviso("Falta criar o campo de canal nas notas, no Supabase. Use a faixa amarela no topo (\"Copiar o SQL\"), cole no SQL Editor do projeto \"niellypinheiro portfólio\" e clique em Run. Depois atualize esta página.", "erro"));
      return raiz;
    }
    ctx.estadoCanais = ctx.estadoCanais || { empresa: "", sel: new Set() };
    const e = ctx.estadoCanais, nomes = nomesEmpresas(ctx);
    const vendasTodas = ctx.notas.filter((n) => n.tipo === "saida" && !n.devolucao && n.status === "autorizada" && n.data_emissao >= fx.ini && n.data_emissao <= fx.fim);
    const vendas = vendasTodas.filter((n) => !e.empresa || n.empresa_doc === e.empresa);
    const devolucoes = ctx.notas.filter((n) => n.tipo === "entrada" && n.devolucao && n.status === "autorizada" && n.data_emissao >= fx.ini && n.data_emissao <= fx.fim && (!e.empresa || n.empresa_doc === e.empresa));

    /* custo dos produtos vendidos (estimado pelo último custo de compra de cada produto) */
    let custoPorNota = null;
    if (ctx.itens) {
      const prod = F.produtos ? F.produtos(ctx) : null, custo = new Map((prod || []).map((p) => [p.chave, p.custo]));
      custoPorNota = new Map();
      ctx.itens.forEach((i) => { if (i.tipo !== "saida" || i.devolucao) return; const k = i.ean || "d:" + norm(i.descricao); custoPorNota.set(i.nota_id, (custoPorNota.get(i.nota_id) || 0) + i.quantidade * (custo.get(k) || 0)); });
    }
    const fretePorNota = new Map();
    (ctx.ctes || []).forEach((c) => { if (c.nfe_chave && F.cteCusto && F.cteCusto(ctx, c)) fretePorNota.set(c.nfe_chave, (fretePorNota.get(c.nfe_chave) || 0) + c.valor); });
    /* tarifa do marketplace: por enquanto só do Mercado Livre, pelo relatório de vendas dele (comissão e impostos do ML, no período) */
    const tarifaML = (ctx.mlOk && ctx.vendasML ? ctx.vendasML : []).filter((v) => v.data_venda && v.data_venda >= fx.ini && v.data_venda <= fx.fim && !(F.vendaCancelada && F.vendaCancelada(v))).reduce((s, v) => s - v.tarifa_venda, 0);

    const grupos = new Map();
    const grupo = (c) => { let g = grupos.get(c); if (!g) { g = { canal: c, notas: 0, receita: 0, custo: 0, frete: 0, tarifa: 0, semCusto: 0, empresas: new Map() }; grupos.set(c, g); } return g; };
    const semCanal = [];
    vendas.forEach((n) => {
      const c = F.canalDaNota(ctx, n);
      if (!c) { semCanal.push(n); }
      const g = grupo(c ? c.canal : "Sem canal identificado");
      g.notas++; g.receita += n.valor_total; g.frete += fretePorNota.get(n.chave) || 0;
      if (custoPorNota) { const cu = custoPorNota.get(n.id); if (cu == null || cu === 0) g.semCusto++; g.custo += cu || 0; }
      const emp = n.empresa_doc || "?"; g.empresas.set(emp, (g.empresas.get(emp) || 0) + n.valor_total);
    });
    if (grupos.has("Mercado Livre") && tarifaML > 0 && !e.empresa) grupos.get("Mercado Livre").tarifa = tarifaML;
    const lista = Array.from(grupos.values()).map((g) => Object.assign(g, { lucro: custoPorNota ? g.receita - g.custo - g.frete - g.tarifa : null }))
      .sort((a, b) => b.receita - a.receita);

    const receitaTotal = soma(vendas, (n) => n.valor_total), identificada = receitaTotal - soma(semCanal, (n) => n.valor_total);
    /* a margem só é confiável quando quase todas as notas do canal têm custo conhecido dos produtos */
    const confiavel = (g) => g.lucro != null && g.receita > 0 && g.notas > 0 && g.semCusto / g.notas <= 0.2;
    const comMargem = lista.filter((g) => confiavel(g) && g.canal !== "Sem canal identificado");
    const melhor = comMargem.slice().sort((a, b) => b.lucro / b.receita - a.lucro / a.receita)[0], pior = comMargem.slice().sort((a, b) => a.lucro / a.receita - b.lucro / b.receita)[0];

    const seletor = h("select", { "aria-label": "Empresa", onchange: (ev) => { e.empresa = ev.target.value; e.sel = new Set(); ctx.desenhar(); } },
      h("option", { value: "", text: "Todas as empresas" }), Array.from(nomes.entries()).map(([d, n]) => h("option", { value: d, text: n, selected: d === e.empresa })));
    raiz.append(h("div", { class: "ferramentas" }, h("label", { class: "fraco", text: "Empresa:" }), seletor, h("span", { class: "espaco" }),
      h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoCanal(ctx) }, P.ic("subir"), "Importar relatório de um canal")));

    if (!vendas.length) { raiz.append(F.cartao("Sem vendas neste período", h("p", { text: "Não há notas de venda autorizadas neste período. Troque o período lá em cima ou importe as notas em Importar notas." }))); return raiz; }

    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile("t-azul", "Faturamento (notas)", F.dinheiro(receitaTotal), vendas.length + " notas, " + fx.rotulo),
      F.tile("t-ouro", "Canal identificado", F.pct(receitaTotal ? (identificada / receitaTotal) * 100 : 0, 0), semCanal.length ? semCanal.length + " nota(s) ainda sem canal" : "todas com canal"),
      F.tile("t-verde", "Melhor margem", melhor ? melhor.canal : "-", melhor ? F.pct((melhor.lucro / melhor.receita) * 100, 1) + " de margem" : (custoPorNota ? "falta custo dos produtos (importe as notas de compra)" : "calculando custos...")),
      F.tile(pior && pior.lucro < 0 ? "t-vermelho" : "t-vinho", "Pior margem", pior ? pior.canal : "-", pior ? F.pct((pior.lucro / pior.receita) * 100, 1) + " de margem" : "")));

    raiz.append(F.cartao("Resultado por canal", F.tabela(["Canal", { t: "Notas", num: true }, { t: "Faturamento", num: true }, { t: "Custo dos produtos", num: true }, { t: "Frete (CT-e)", num: true }, { t: "Tarifa do canal", num: true }, { t: "Lucro estimado", num: true }, { t: "Margem", num: true }],
      lista.map((g) => {
        const m = confiavel(g) ? (g.lucro / g.receita) * 100 : null;
        return h("tr", null, h("td", { class: "truncar", title: Array.from(g.empresas.entries()).map(([d, v]) => (nomes.get(d) || F.fmtDoc(d)) + ": " + F.dinheiro(v)).join(" | "), text: g.canal }),
          h("td", { class: "num", text: String(g.notas) }), h("td", { class: "num", text: F.dinheiro(g.receita) }),
          h("td", { class: "num", text: custoPorNota ? F.dinheiro(g.custo) + (g.semCusto ? " *" : "") : "..." }), h("td", { class: "num", text: F.dinheiro(g.frete) }),
          h("td", { class: "num", text: g.tarifa ? F.dinheiro(g.tarifa) : "-" }),
          h("td", { class: "num", style: g.lucro != null && g.lucro < 0 ? "color:var(--vermelho);font-weight:600" : "", text: g.lucro == null ? "..." : F.dinheiro(g.lucro) }),
          h("td", { class: "num", title: m == null && custoPorNota ? "Sem custo conhecido para muitos produtos deste canal" : "", text: m == null ? (custoPorNota ? "sem custo" : "...") : F.pct(m, 1) }));
      }), "Nenhuma venda neste período.")));
    const notasCanal = [];
    if (lista.some((g) => g.semCusto)) notasCanal.push("* Algumas notas têm produtos sem custo conhecido (sem nota de compra importada), então o custo delas ficou subestimado e a margem parece maior do que é.");
    if (devolucoes.length) notasCanal.push("Devoluções no período: " + devolucoes.length + " nota(s), " + F.dinheiro(soma(devolucoes, (n) => n.valor_total)) + ". Elas não têm canal e não foram descontadas das linhas acima.");
    notasCanal.push("Lucro estimado = faturamento das notas menos o custo dos produtos (último custo de compra), menos o frete dos CT-e ligados à nota, menos a tarifa do canal. É antes dos impostos." + (grupos.has("Mercado Livre") ? " A tarifa do Mercado Livre vem do relatório de vendas dele (tela Mercado Livre). Shopee, Amazon e Magalu ainda não têm tarifa, então a margem desses canais está maior do que a real." : ""));
    notasCanal.forEach((t) => raiz.append(F.aviso(t)));

    /* notas sem canal: escolher à mão */
    if (semCanal.length) {
      const sel = e.sel, escolha = h("select", { "aria-label": "Canal para as notas marcadas" }, h("option", { value: "", text: "Atribuir canal..." }), F.CANAIS.map((c) => h("option", { value: c, text: c })));
      const tab = h("div");
      const desenharTab = () => {
        P.limpar(tab);
        const l = semCanal.slice().sort((a, b) => (a.data_emissao < b.data_emissao ? 1 : -1)).slice(0, 200);
        const todas = h("input", { type: "checkbox", "aria-label": "Marcar todas", checked: l.length > 0 && l.every((n) => sel.has(n.id)), onchange: (ev) => { l.forEach((n) => (ev.target.checked ? sel.add(n.id) : sel.delete(n.id))); desenharTab(); } });
        F.anexar(tab, F.tabela([{ t: "" }, "Data", "Nota", "Empresa", "Cliente", { t: "Valor", num: true }],
          l.map((n) => h("tr", null, h("td", null, h("input", { type: "checkbox", "aria-label": "Marcar nota " + n.numero, checked: sel.has(n.id), onchange: (ev) => { if (ev.target.checked) sel.add(n.id); else sel.delete(n.id); } })),
            h("td", { class: "nw", text: P.fmtData(n.data_emissao) }), h("td", { class: "nw", text: n.numero }), h("td", { class: "truncar", text: nomes.get(n.empresa_doc) || F.fmtDoc(n.empresa_doc) }),
            h("td", { class: "truncar", text: n.destinatario_nome || "" }), h("td", { class: "num", text: F.dinheiro(n.valor_total) }))), "Nenhuma."),
          h("label", { class: "fraco", style: "display:inline-flex;gap:6px;margin-top:6px" }, todas, "Marcar todas as exibidas"), semCanal.length > 200 ? h("p", { class: "fraco", text: "Mostrando 200 de " + semCanal.length + "." }) : null);
      };
      desenharTab();
      raiz.append(F.cartao("Notas sem canal (" + semCanal.length + ")", h("div", null,
        h("p", { class: "dica", text: "Estas notas não aparecem em nenhum relatório de canal importado e não trazem o canal na própria nota. Importe o relatório de cada canal (botão acima) ou marque à mão aqui." }),
        h("div", { class: "ferramentas" }, escolha, h("button", { type: "button", class: "btn p", onclick: async () => {
          if (!escolha.value) { P.toast("Escolha o canal.", true); return; }
          if (!sel.size) { P.toast("Marque as notas primeiro.", true); return; }
          if (await F.gravarCanal(ctx, Array.from(sel), escolha.value, "manual")) { P.toast(sel.size + " nota(s) marcadas como " + escolha.value + "."); e.sel = new Set(); ctx.recarregar(); }
        } }, "Aplicar às marcadas")), tab)));
    }
    return raiz;
  };
})();
