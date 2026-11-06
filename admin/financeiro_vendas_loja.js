/* =========================================================================
   Financeiro: RELATÓRIO DE VENDAS DA LOJA (por produto).
   É o relatório do sistema da loja com as colunas Produto, Código (SKU),
   Quantidade, Valor, Frete e Total. Ele não traz datas, então na importação
   você diz de que período ele é. Subir de novo o mesmo período substitui os
   valores (não soma duas vezes).

   Esses números ficam numa tela própria e NÃO entram na DRE nem na Visão
   geral, porque as notas fiscais dessas vendas já entram pelo XML.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});
  F.telas = F.telas || {};

  const norm = (s) => P.semAcento(String(s == null ? "" : s)).replace(/[^a-z0-9]+/g, " ").trim();
  const dois = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);

  const COLUNAS = {
    produto: ["produto", "nome do produto", "descricao do produto", "descricao", "item"],
    sku: ["codigo sku", "codigo", "sku", "cod", "referencia"],
    quantidade: ["quantidade", "qtd", "qtde", "quant"],
    valor: ["valor", "valor dos produtos", "valor unitario", "subtotal"],
    frete: ["frete", "valor do frete"],
    total: ["total", "valor total"]
  };
  function mapear(cab) {
    const n = cab.map(norm), usadas = new Set(), idx = {};
    Object.keys(COLUNAS).forEach((k) => {
      let i = -1;
      for (const a of COLUNAS[k]) { i = n.findIndex((c, j) => !usadas.has(j) && (c === a || c.startsWith(a + " "))); if (i !== -1) break; }
      idx[k] = i; if (i !== -1) usadas.add(i);
    });
    return idx;
  }
  const pontosCab = (cab) => { const i = mapear(cab); return { ok: i.produto !== -1 && i.quantidade !== -1 && (i.total !== -1 || i.valor !== -1), pontos: Object.values(i).filter((x) => x !== -1).length }; };
  /* usado pelo importador automático para reconhecer este tipo de planilha */
  F.pareceVendasLoja = (linhas) => linhas.slice(0, 15).some((l) => {
    const c = l.map((x) => norm(x));
    return pontosCab(l.map(String)).ok && !c.some((x) => /vencimento|n de venda|data da venda/.test(x));
  });

  function numero(v) {
    if (typeof v === "number") return isFinite(v) ? dois(v) : 0;
    let s = String(v == null ? "" : v).trim();
    if (!s) return 0;
    const neg = /^[-−]/.test(s);
    s = s.replace(/[^\d.,]/g, "");
    if (!s) return 0;
    if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const x = parseFloat(s);
    return isFinite(x) ? dois(neg ? -x : x) : 0;
  }
  const texto = (v, max) => { const s = (typeof v === "number" ? String(v) : String(v == null ? "" : v)).trim(); return s ? s.slice(0, max) : null; };

  /* ---------- tipo e categoria do produto (pelo nome) ---------- */
  const CATEGORIAS = [
    ["Serviços e assistência", /servic|manuten|desbloque|limpeza|formatac|reparo|conserto|mao de obra/],
    ["Películas", /^pelicula|\bpelicula\b/],
    ["Capas e cases", /\bcapa\b|\bcapinha\b|\bcase\b/],
    ["Cabos e carregadores", /\bcabo\b|carregador|\bfonte\b|power bank|bateria portatil|adaptador/],
    ["Fones e caixas de som", /\bfone\b|caixa de som|headset/],
    ["Casa e eletros", /lampada|ventilador|\bferro\b|bebedouro|garrafa/],
    ["Celulares e tablets", /celular|iphone|redmi|redmir|samsung|sansung|\bmoto\b|motorola|xiaomi|multilaser g|tablet|tablat|\bblu\b/],
    ["Relógios", /relogio/]
  ];
  F.categoriaLoja = (produto) => { const t = norm(produto); const c = CATEGORIAS.find(([, re]) => re.test(t)); return c ? c[0] : "Outros acessórios"; };
  F.ehServicoLoja = (produto) => F.categoriaLoja(produto) === "Serviços e assistência";

  /* ---------- importação ---------- */
  function palpitePeriodo(nomeArquivo) {   /* relatorio-de-vendas_05-11-2026-15-59-34 → do dia 1 do mês até o dia 5 */
    const m = String(nomeArquivo || "").match(/(\d{2})-(\d{2})-(\d{4})/);
    if (!m) { const hoje = F.hoje(); return { ini: hoje.slice(0, 8) + "01", fim: hoje }; }
    return { ini: m[3] + "-" + m[2] + "-01", fim: m[3] + "-" + m[2] + "-" + m[1] };
  }
  async function lerLinhas(arquivo) {
    const abas = await F.lerAbas(arquivo);
    let melhor = null;
    abas.forEach((a) => {
      const linhas = a.linhas.filter((l) => l.some((v) => String(v).trim() !== ""));
      for (let r = 0; r < Math.min(15, linhas.length); r++) {
        const p = pontosCab(linhas[r].map(String));
        if (p.ok && (!melhor || p.pontos > melhor.pontos)) melhor = { pontos: p.pontos, linhas, cab: r, aba: a.nome, multi: abas.length > 1 };
      }
    });
    return melhor;
  }
  function montarItens(lido) {
    const idx = mapear(lido.linhas[lido.cab].map(String)), cel = (l, k) => (idx[k] === -1 ? "" : l[idx[k]]);
    const mapa = new Map(), invalidas = [];
    lido.linhas.slice(lido.cab + 1).forEach((l, n) => {
      const produto = texto(cel(l, "produto"), 300);
      if (!produto) return;
      if (/^total\b/.test(norm(produto))) return;
      const q = numero(cel(l, "quantidade")), valor = numero(cel(l, "valor")), frete = numero(cel(l, "frete"));
      let total = idx.total === -1 ? dois(valor + frete) : numero(cel(l, "total"));
      if (!q && !valor && !total) return;
      const sku = texto(typeof cel(l, "sku") === "number" ? String(cel(l, "sku")) : cel(l, "sku"), 120);
      const k = norm(produto) + "|" + (sku || "");
      const e = mapa.get(k);
      if (e) { e.quantidade += q; e.valor = dois(e.valor + valor); e.frete = dois(e.frete + frete); e.total = dois(e.total + total); }
      else mapa.set(k, { produto, sku, quantidade: q, valor, frete, total });
    });
    return { itens: Array.from(mapa.values()), invalidas, idx };
  }
  const chaveDe = (ini, fim, x) => (ini + "|" + fim + "|" + norm(x.produto).slice(0, 200) + "|" + (x.sku || "")).slice(0, 400);
  const fmtPeriodo = (a, b) => P.fmtData(a) + " a " + P.fmtData(b);

  F.abrirImportacaoLoja = function (ctx, arquivoPre) {
    let lido = null, nomeArquivo = "";
    const palpite = palpitePeriodo(arquivoPre && arquivoPre.name);
    const ini = h("input", { type: "date", value: palpite.ini, "aria-label": "Início do período" }), fim = h("input", { type: "date", value: palpite.fim, "aria-label": "Fim do período" });
    const input = h("input", { type: "file", accept: ".xlsx,.xls,.csv,text/csv", id: "finPlanilhaLoja", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finPlanilhaLoja", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha o relatório de vendas ou arraste até aqui" }),
      h("span", { class: "fraco", text: "Excel (.xlsx) ou CSV com Produto, Código (SKU), Quantidade, Valor, Frete e Total." }));
    const progresso = h("p", { class: "fraco", role: "status" }), previa = h("div");
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Este relatório não traz datas dentro dele. Por isso, diga de que dias ele é. Se você subir de novo o mesmo período, os valores são substituídos, não somados." }),
      h("div", { class: "grade2" }, P.campo("Período: de", ini), P.campo("até", fim)),
      input, zona, progresso, previa);

    function atual() {
      const itens = lido ? montarItens(lido).itens : [];
      return { itens, ok: !!lido && ini.value && fim.value && fim.value >= ini.value };
    }
    function desenhar() {
      P.limpar(previa);
      if (!lido) return;
      const { itens, ok } = atual(), totalGeral = soma(itens, (x) => x.total);
      const serv = itens.filter((x) => F.ehServicoLoja(x.produto)), prods = itens.filter((x) => !F.ehServicoLoja(x.produto));
      const ja = (ctx.vendasLoja || []);
      const iguais = ok ? ja.filter((x) => x.periodo_ini === ini.value && x.periodo_fim === fim.value) : [];
      const cruzam = ok ? Array.from(new Set(ja.filter((x) => !(x.periodo_ini === ini.value && x.periodo_fim === fim.value) && x.periodo_ini <= fim.value && x.periodo_fim >= ini.value).map((x) => fmtPeriodo(x.periodo_ini, x.periodo_fim)))) : [];
      F.anexar(previa,
        h("div", { class: "fin-impo-res", style: "margin-top:12px" },
          h("div", null, h("b", { text: String(itens.length) }), h("span", { text: "produtos e serviços" })),
          h("div", null, h("b", { text: String(soma(itens, (x) => x.quantidade)) }), h("span", { text: "itens vendidos" })),
          h("div", null, h("b", { text: F.dinheiro(soma(prods, (x) => x.total)) }), h("span", { text: "em produtos" })),
          h("div", null, h("b", { text: F.dinheiro(soma(serv, (x) => x.total)) }), h("span", { text: "em serviços" }))),
        h("p", { class: "dica", text: "Total do relatório: " + F.dinheiro(totalGeral) + (lido.aba && lido.multi ? " (aba \"" + lido.aba + "\")" : "") + "." }),
        !ok ? h("p", { class: "aviso-pagina erro", text: "Confira o período: a data final precisa ser igual ou depois da inicial." }) : null,
        iguais.length ? h("p", { class: "aviso-pagina", text: "Já existe um relatório deste mesmo período (" + fmtPeriodo(ini.value, fim.value) + "). Ao importar, os valores dele serão substituídos pelos desta planilha." }) : null,
        cruzam.length ? h("p", { class: "aviso-pagina erro", text: "Atenção: este período se mistura com relatório(s) já importado(s): " + cruzam.join("; ") + ". Se os dias se repetem, as vendas contam duas vezes. Ajuste o período ou apague o outro relatório antes." }) : null,
        itens.length ? F.tabela(["Produto", "Categoria", { t: "Qtd.", num: true }, { t: "Total", num: true }],
          itens.slice(0, 8).map((x) => h("tr", null, h("td", { class: "truncar", text: x.produto }), h("td", { class: "truncar", text: F.categoriaLoja(x.produto) }), h("td", { class: "num", text: String(x.quantidade) }), h("td", { class: "num", text: F.dinheiro(x.total) })))) : null,
        itens.length > 8 ? h("p", { class: "dica", text: "Mostrando 8 de " + itens.length + "." }) : null);
    }
    async function ler(arquivo) {
      if (!arquivo) return;
      progresso.textContent = "Lendo o relatório..."; lido = null; P.limpar(previa);
      try { lido = await lerLinhas(arquivo); }
      catch (e) { progresso.textContent = ""; P.toast(e && /carregar/.test(e.message || "") ? e.message : "Não consegui ler esse arquivo. Confira se é uma planilha Excel ou CSV.", true); return; }
      if (!lido) { progresso.textContent = ""; P.toast("Não achei as colunas Produto, Quantidade e Total nesse arquivo.", true); return; }
      nomeArquivo = arquivo.name;
      const p = palpitePeriodo(arquivo.name); if (!ini.dataset.mexeu) { ini.value = p.ini; fim.value = p.fim; }
      progresso.textContent = (lido.linhas.length - lido.cab - 1) + " linha(s) lidas de " + arquivo.name + ".";
      desenhar();
    }
    input.addEventListener("change", () => ler(input.files[0]));
    [ini, fim].forEach((c) => c.addEventListener("change", () => { ini.dataset.mexeu = "1"; desenhar(); }));
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));

    P.modal({ titulo: "Importar relatório de vendas da loja", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Importar", classe: "p", aoClicar: async () => {
        const { itens, ok } = atual();
        if (!lido) { P.toast("Escolha o relatório primeiro.", true); return false; }
        if (!ok) { P.toast("Confira o período do relatório.", true); return false; }
        if (!itens.length) { P.toast("Não há linhas para importar.", true); return false; }
        /* mesmo período: troca o que existe (apaga o antigo e grava o novo) */
        const apagar = await P.gravar(() => window.sb.from("fin_vendas_loja").delete().eq("periodo_ini", ini.value).eq("periodo_fim", fim.value));
        if (!apagar.ok) return false;
        const linhas = itens.map((x) => Object.assign({ chave: chaveDe(ini.value, fim.value, x), periodo_ini: ini.value, periodo_fim: fim.value, arquivo: nomeArquivo.slice(0, 200) }, x));
        let feitas = 0;
        for (let i = 0; i < linhas.length; i += 200) {
          const r = await P.gravar(() => window.sb.from("fin_vendas_loja").insert(linhas.slice(i, i + 200)));
          if (!r.ok) { P.toast("Parei no meio: " + feitas + " linhas salvas. Suba o relatório de novo para refazer o período.", true); ctx.recarregar(); return false; }
          feitas += Math.min(200, linhas.length - i);
        }
        ctx.lojaSel = ini.value + "|" + fim.value;
        P.toast(feitas + " produtos e serviços importados!");
        ctx.recarregar();
      } }
    ] });
    if (arquivoPre) ler(arquivoPre);
  };

  /* ---------- a tela ---------- */
  F.telas.loja = function (ctx) {
    const raiz = h("div");
    if (!ctx.lojaOk) {
      raiz.append(F.aviso("A tabela do relatório de vendas da loja ainda não existe no Supabase. Use a faixa amarela no topo (\"Copiar o SQL\"), cole no SQL Editor do projeto \"niellypinheiro portfólio\" e clique em Run. Depois atualize esta página.", "erro"));
      return raiz;
    }
    const todos = ctx.vendasLoja || [];
    if (!todos.length) {
      raiz.append(F.cartao("Nenhum relatório de vendas da loja ainda", h("div", null,
        h("p", { text: "Importe aqui o relatório de vendas por produto do sistema da loja (Produto, Código, Quantidade, Valor, Frete e Total). Eu agrupo por categoria, separo produtos de serviços e mostro o que mais vende." }),
        h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoLoja(ctx) }, P.ic("subir"), "Importar relatório"))));
      return raiz;
    }
    const periodos = Array.from(new Set(todos.map((x) => x.periodo_ini + "|" + x.periodo_fim))).sort().reverse();
    if (ctx.lojaSel !== "todos" && periodos.indexOf(ctx.lojaSel) === -1) ctx.lojaSel = periodos[0];
    const sel = h("select", { "aria-label": "Relatório", onchange: (e) => { ctx.lojaSel = e.target.value; ctx.desenhar(); } },
      periodos.map((p) => { const [a, b] = p.split("|"); return h("option", { value: p, text: fmtPeriodo(a, b), selected: p === ctx.lojaSel }); }),
      h("option", { value: "todos", text: "Todos os relatórios somados", selected: ctx.lojaSel === "todos" }));
    const dados = ctx.lojaSel === "todos" ? todos : todos.filter((x) => x.periodo_ini + "|" + x.periodo_fim === ctx.lojaSel);

    raiz.append(h("div", { class: "ferramentas" }, h("label", { class: "fraco", text: "Relatório:" }), sel, h("span", { class: "espaco" }),
      ctx.lojaSel === "todos" ? null : h("button", { type: "button", class: "btn", onclick: async () => {
        const [a, b] = ctx.lojaSel.split("|");
        if (!(await P.confirmar("Apagar o relatório de " + fmtPeriodo(a, b) + "? As linhas dele saem do painel. Você pode importar a planilha de novo depois.", { botao: "Apagar", perigo: true }))) return;
        const r = await P.gravar(() => window.sb.from("fin_vendas_loja").delete().eq("periodo_ini", a).eq("periodo_fim", b));
        if (r.ok) { P.toast("Relatório apagado"); ctx.recarregar(); }
      } }, P.ic("lixeira"), "Apagar este relatório")));

    const servicos = dados.filter((x) => F.ehServicoLoja(x.produto)), prods = dados.filter((x) => !F.ehServicoLoja(x.produto));
    const totalG = soma(dados, (x) => x.total), qtd = soma(dados, (x) => x.quantidade);
    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile("t-azul", "Total vendido", F.dinheiro(totalG), qtd + " itens"),
      F.tile("t-ouro", "Produtos", F.dinheiro(soma(prods, (x) => x.total)), totalG ? F.pct((soma(prods, (x) => x.total) / totalG) * 100, 0) + " do total" : ""),
      F.tile("t-verde", "Serviços e assistência", F.dinheiro(soma(servicos, (x) => x.total)), totalG ? F.pct((soma(servicos, (x) => x.total) / totalG) * 100, 0) + " do total" : ""),
      F.tile("t-vinho", "Frete cobrado", F.dinheiro(soma(dados, (x) => x.frete)), "dentro do total")));

    /* por categoria */
    const cats = new Map();
    dados.forEach((x) => { const c = F.categoriaLoja(x.produto), g = cats.get(c) || { nome: c, total: 0, qtd: 0 }; g.total += x.total; g.qtd += x.quantidade; cats.set(c, g); });
    const lista = Array.from(cats.values()).sort((a, b) => b.total - a.total);
    const fatias = lista.map((g, i) => ({ nome: g.nome, valor: Math.max(0, g.total), cor: F.CORES[i % F.CORES.length] }));
    const donut = F.cartao("Por categoria", h("div", { class: "fin-rosca-caixa" }, F.rosca(fatias, F.curto(totalG), "total"),
      h("ul", { class: "fin-legenda-lista" }, lista.map((g, i) => h("li", null, h("i", { style: "background:" + F.CORES[i % F.CORES.length] }), h("span", { text: g.nome + " (" + g.qtd + ")" }), h("b", { text: F.dinheiro(g.total) }))))));

    /* mais vendidos */
    const top = dados.slice().sort((a, b) => b.total - a.total).slice(0, 10);
    const maisVendidos = F.cartao("O que mais faturou", F.tabela(["Produto", { t: "Qtd.", num: true }, { t: "Total", num: true }],
      top.map((x) => h("tr", null, h("td", { class: "truncar", text: x.produto }), h("td", { class: "num", text: String(x.quantidade) }), h("td", { class: "num", text: F.dinheiro(x.total) })))));
    raiz.append(h("div", { class: "fin-duas" }, donut, maisVendidos));

    /* lista completa */
    ctx.estadoLoja = ctx.estadoLoja || { busca: "" };
    const busca = h("input", { type: "search", placeholder: "Buscar por produto, código ou categoria", value: ctx.estadoLoja.busca, "aria-label": "Buscar" });
    const caixa = h("div");
    function tabela() {
      P.limpar(caixa);
      const q = P.semAcento(ctx.estadoLoja.busca);
      let l = dados.slice().sort((a, b) => b.total - a.total);
      if (q) l = l.filter((x) => P.semAcento([x.produto, x.sku, F.categoriaLoja(x.produto)].join(" ")).includes(q));
      F.anexar(caixa, F.tabela(["Produto", "Código", "Categoria", { t: "Qtd.", num: true }, { t: "Valor", num: true }, { t: "Frete", num: true }, { t: "Total", num: true }],
        l.slice(0, 300).map((x) => h("tr", null, h("td", { class: "truncar", text: x.produto }), h("td", { class: "nw", text: x.sku || "" }), h("td", { class: "truncar", text: F.categoriaLoja(x.produto) }),
          h("td", { class: "num", text: String(x.quantidade) }), h("td", { class: "num", text: F.dinheiro(x.valor) }), h("td", { class: "num", text: F.dinheiro(x.frete) }), h("td", { class: "num", text: F.dinheiro(x.total) }))),
        "Nada encontrado."), l.length > 300 ? h("p", { class: "fraco", text: "Mostrando 300 de " + l.length + ". Use a busca." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { ctx.estadoLoja.busca = busca.value; tabela(); }, 150));
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" }, h("div", { class: "busca" }, P.ic("busca"), busca)), caixa);
    tabela();
    raiz.append(F.aviso("Estes números são só do relatório de vendas da loja e não entram na Visão geral nem na DRE, porque as notas fiscais dessas vendas já entram pelo XML. Assim o faturamento não é contado duas vezes. A categoria é escolhida pelo nome do produto."));
    return raiz;
  };
})();
