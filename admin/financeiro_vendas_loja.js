/* =========================================================================
   Financeiro: RELATÓRIO DE VENDAS DA LOJA (por produto).
   É o relatório do sistema da loja (Olist/Tiny) com as colunas Produto,
   Código (SKU), Quantidade, Valor, Frete e Total. Ele NÃO traz datas dentro
   dele (a data no nome do arquivo é só o dia em que foi baixado), então na
   importação você diz de que período ele é.

   Conferências feitas:
   - o total das vendas contra o "Totalizador Geral" do próprio relatório;
   - as devoluções (aba Devoluções) entram descontadas;
   - relatório do mesmo período já existente (pede confirmação antes de trocar);
   - mesmo arquivo ou mesmo conteúdo já importado em outro período;
   - períodos que se misturam (venda contada duas vezes);
   - produtos iguais em vários relatórios (juntados pelo código ou pelo nome);
   - preços que fogem do normal.

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
    ["Serviços e assistência", /servic|manuten|menuten|desbloque|limpeza|formatac|reparo|conserto|mao de obra/],
    ["Películas", /^pelicula|\bpelicula\b/],
    ["Capas e cases", /\bcapa\b|\bcapinha\b|\bcase\b/],
    ["Cabos e carregadores", /\bcabo\b|carregador|\bfonte\b|power bank|bateria portatil|adaptador/],
    ["Fones e caixas de som", /\bfone\b|caixa de som|headset|alto falante/],
    ["Casa e eletros", /lampada|ventilador|\bferro\b|bebedouro|garrafa/],
    ["Celulares e tablets", /celular|iphone|redmi|redmir|samsung|sansung|\bmoto\b|motorola|xiaomi|multilaser g|tablet|tablat|\bblu\b|smartphone/],
    ["Relógios", /relogio/]
  ];
  F.categoriaLoja = (produto) => { const t = norm(produto); const c = CATEGORIAS.find(([, re]) => re.test(t)); return c ? c[0] : "Outros acessórios"; };
  F.ehServicoLoja = (produto) => F.categoriaLoja(produto) === "Serviços e assistência";

  /* ---------- períodos ---------- */
  const fmtPeriodo = (a, b) => P.fmtData(a) + " a " + P.fmtData(b);
  const nomeBase = (n) => String(n || "").replace(/\.(xlsx?|csv)$/i, "").replace(/\s*\(vendas\)\s*$/i, "").trim().toLowerCase();
  function atalhos() {
    const hoje = F.hoje(), [a, m] = hoje.split("-").map(Number), mes = (mm) => F.limitesDoMes(F.mesesAtras(1, new Date(a, mm, 1))[0]);
    return [
      ["Este mês", { ini: hoje.slice(0, 8) + "01", fim: hoje }],
      ["Mês passado", mes(m - 2)],
      ["Mês retrasado", mes(m - 3)],
      ["Este ano", { ini: a + "-01-01", fim: hoje }]
    ];
  }

  /* ---------- leitura ---------- */
  async function lerLinhas(arquivo) {
    const abas = await F.lerAbas(arquivo);
    let melhor = null;
    abas.forEach((a) => {
      if (/devolu|totalizador/i.test(a.nome)) return;
      const linhas = a.linhas.filter((l) => l.some((v) => String(v).trim() !== ""));
      for (let r = 0; r < Math.min(15, linhas.length); r++) {
        const p = pontosCab(linhas[r].map(String));
        if (p.ok && (!melhor || p.pontos > melhor.pontos)) melhor = { pontos: p.pontos, linhas, cab: r, aba: a.nome, multi: abas.length > 1, abas };
      }
    });
    return melhor;
  }
  function linhasDaAba(abas, re) {
    const a = abas.find((x) => re.test(x.nome));
    return a ? a.linhas.filter((l) => l.some((v) => String(v).trim() !== "")) : [];
  }
  function lerBloco(linhas, cab, sinal) {
    const idx = mapear(linhas[cab].map(String)), cel = (l, k) => (idx[k] === -1 ? "" : l[idx[k]]), lista = [];
    linhas.slice(cab + 1).forEach((l) => {
      const produto = texto(cel(l, "produto"), 300);
      if (!produto || /^total\b/.test(norm(produto))) return;
      const q = numero(cel(l, "quantidade")), valor = numero(cel(l, "valor")), frete = numero(cel(l, "frete"));
      const total = idx.total === -1 ? dois(valor + frete) : numero(cel(l, "total"));
      if (!q && !valor && !total) return;
      const sku = texto(typeof cel(l, "sku") === "number" ? String(cel(l, "sku")) : cel(l, "sku"), 120);
      lista.push({ produto, sku, quantidade: sinal * q, valor: sinal * valor, frete: sinal * frete, total: sinal * total, devolucao: sinal < 0 });
    });
    return lista;
  }
  function montarItens(lido) {
    const mapa = new Map();
    const juntar = (x) => {
      const k = norm(x.produto) + "|" + (x.sku || "") + (x.devolucao ? "|dev" : "");
      const e = mapa.get(k);
      if (e) { e.quantidade += x.quantidade; e.valor = dois(e.valor + x.valor); e.frete = dois(e.frete + x.frete); e.total = dois(e.total + x.total); }
      else mapa.set(k, Object.assign({}, x));
    };
    lerBloco(lido.linhas, lido.cab, 1).forEach(juntar);
    /* aba Devoluções: entra descontando */
    const dev = linhasDaAba(lido.abas || [], /devolu/i);
    let devolucoes = [];
    if (dev.length) {
      let c = 0, melhor = -1;
      for (let r = 0; r < Math.min(10, dev.length); r++) { const p = pontosCab(dev[r].map(String)); if (p.ok && p.pontos > melhor) { melhor = p.pontos; c = r; } }
      if (melhor >= 0) devolucoes = lerBloco(dev, c, -1);
    }
    devolucoes.forEach(juntar);
    /* aba Totalizador Geral: o total que o próprio sistema calculou, para conferir */
    let totalSistema = null;
    linhasDaAba(lido.abas || [], /totalizador/i).forEach((l) => { if (norm(l[0]) === "total geral") totalSistema = numero(l[2]); });
    return { itens: Array.from(mapa.values()), devolucoes, totalSistema };
  }
  const chaveDe = (ini, fim, x) => (ini + "|" + fim + "|" + norm(x.produto).slice(0, 200) + "|" + (x.sku || "") + (x.devolucao ? "|dev" : "")).slice(0, 400);

  /* relatórios já importados, agrupados por período */
  function relatoriosDe(lista) {
    const m = new Map();
    lista.forEach((x) => {
      const k = x.periodo_ini + "|" + x.periodo_fim, r = m.get(k) || { ini: x.periodo_ini, fim: x.periodo_fim, arquivo: x.arquivo || "", criado: x.criado_em || "", linhas: 0, total: 0, qtd: 0 };
      r.linhas++; r.total = dois(r.total + x.total); r.qtd += x.quantidade; m.set(k, r);
    });
    return Array.from(m.values()).sort((a, b) => (a.ini < b.ini ? 1 : a.ini > b.ini ? -1 : 0));
  }

  /* produtos iguais: juntam-se linhas com o mesmo código (SKU) ou o mesmo nome */
  function agruparProdutos(lista) {
    const pai = lista.map((_, i) => i), achar = (i) => { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; };
    const unir = (a, b) => { a = achar(a); b = achar(b); if (a !== b) pai[b] = a; };
    const porSku = new Map(), porNome = new Map();
    lista.forEach((x, i) => {
      if (x.sku) { if (porSku.has(x.sku)) unir(i, porSku.get(x.sku)); else porSku.set(x.sku, i); }
      const n = norm(x.produto); if (porNome.has(n)) unir(i, porNome.get(n)); else porNome.set(n, i);
    });
    const g = new Map();
    lista.forEach((x, i) => {
      const r = achar(i), e = g.get(r) || { nome: x.produto, skus: new Set(), nomes: new Set(), qtd: 0, valor: 0, frete: 0, total: 0, linhas: [] };
      if (x.sku) e.skus.add(x.sku); e.nomes.add(x.produto);
      e.qtd += x.quantidade; e.valor += x.valor; e.frete += x.frete; e.total += x.total; e.linhas.push(x);
      if (x.total > 0 && x.produto.length > e.nome.length) e.nome = x.produto;
      g.set(r, e);
    });
    return Array.from(g.values());
  }
  const mediana = (v) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  /* o que merece uma segunda olhada (não quer dizer que esteja errado) */
  function pontosDeAtencao(lista) {
    const avisos = [];
    const unit = (x) => (x.quantidade > 0 ? x.total / x.quantidade : 0);
    const itens = lista.filter((x) => x.quantidade > 0 && x.total > 0 && !F.ehServicoLoja(x.produto));
    const med = mediana(itens.map(unit)), corte = Math.max(2500, med * 20);
    itens.filter((x) => unit(x) >= corte).sort((a, b) => unit(b) - unit(a)).slice(0, 6).forEach((x) =>
      avisos.push({ tipo: "Preço alto", texto: x.produto + ": " + x.quantidade + " un. por " + F.dinheiro(x.total) + " (" + F.dinheiro(unit(x)) + " cada). Confirme no sistema da loja." }));
    /* mesmo produto com preço muito diferente entre relatórios */
    agruparProdutos(itens).forEach((g) => {
      const us = g.linhas.map(unit).filter((u) => u > 0);
      if (g.linhas.length > 1 && us.length > 1 && Math.max(...us) / Math.min(...us) >= 1.6 && g.total > 300)
        avisos.push({ tipo: "Preço variou", texto: g.nome + ": o preço por unidade foi de " + F.dinheiro(Math.min(...us)) + " a " + F.dinheiro(Math.max(...us)) + " entre as linhas." });
    });
    /* linha idêntica em dois relatórios de períodos diferentes */
    const vistos = new Map();
    lista.forEach((x) => {
      if (x.total <= 0) return;
      const k = norm(x.produto) + "|" + (x.sku || "") + "|" + x.quantidade + "|" + x.total;
      const p = x.periodo_ini + "|" + x.periodo_fim;
      if (vistos.has(k) && vistos.get(k).p !== p && x.total >= 200) avisos.push({ tipo: "Linha repetida", texto: x.produto + " (" + x.quantidade + " un., " + F.dinheiro(x.total) + ") aparece igual em " + fmtPeriodo(vistos.get(k).i, vistos.get(k).f) + " e em " + fmtPeriodo(x.periodo_ini, x.periodo_fim) + "." });
      else if (!vistos.has(k)) vistos.set(k, { p, i: x.periodo_ini, f: x.periodo_fim });
    });
    return avisos;
  }

  /* ---------- importação ---------- */
  F.abrirImportacaoLoja = function (ctx, arquivoPre) {
    let lido = null, nomeArquivo = "";
    const ini = h("input", { type: "date", "aria-label": "Início do período" }), fim = h("input", { type: "date", "aria-label": "Fim do período" });
    const chips = h("div", { class: "fin-chips-cnpj", role: "group", "aria-label": "Períodos prontos" }, atalhos().map(([t, v]) =>
      h("button", { type: "button", class: "btn", text: t, onclick: () => { ini.value = v.ini; fim.value = v.fim; desenhar(); } })));
    const input = h("input", { type: "file", accept: ".xlsx,.xls,.csv,text/csv", id: "finPlanilhaLoja", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finPlanilhaLoja", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha o relatório de vendas ou arraste até aqui" }),
      h("span", { class: "fraco", text: "Excel (.xls ou .xlsx) ou CSV com Produto, Código (SKU), Quantidade, Valor, Frete e Total." }));
    const progresso = h("p", { class: "fraco", role: "status" }), previa = h("div");
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Este relatório NÃO traz as datas das vendas. A data que aparece no nome do arquivo é só o dia em que você baixou, e os números depois dela são a hora do download. Por isso, diga de que dias são as vendas dele. Cada período deve ser importado uma vez só." }),
      h("div", { class: "grade2" }, P.campo("Vendas de", ini), P.campo("até", fim)), chips,
      input, zona, progresso, previa);

    const dados = () => (lido ? montarItens(lido) : { itens: [], devolucoes: [], totalSistema: null });
    const periodoOk = () => !!(ini.value && fim.value && fim.value >= ini.value);

    function desenhar() {
      P.limpar(previa);
      if (!lido) return;
      const { itens, devolucoes, totalSistema } = dados(), ok = periodoOk();
      const totalGeral = dois(soma(itens, (x) => x.total)), qtd = soma(itens, (x) => x.quantidade);
      const serv = itens.filter((x) => F.ehServicoLoja(x.produto)), prods = itens.filter((x) => !F.ehServicoLoja(x.produto));
      const rels = relatoriosDe(ctx.vendasLoja || []);
      const mesmoPeriodo = ok ? rels.find((r) => r.ini === ini.value && r.fim === fim.value) : null;
      const cruzam = ok ? rels.filter((r) => !(r.ini === ini.value && r.fim === fim.value) && r.ini <= fim.value && r.fim >= ini.value) : [];
      const mesmoArquivo = rels.filter((r) => nomeBase(r.arquivo) === nomeBase(nomeArquivo) && !(ok && r.ini === ini.value && r.fim === fim.value));
      const mesmoConteudo = rels.filter((r) => Math.abs(r.total - totalGeral) < 0.01 && r.linhas === itens.length && !(ok && r.ini === ini.value && r.fim === fim.value));
      const confere = totalSistema == null ? null : Math.abs(totalSistema - totalGeral) < 0.01;
      F.anexar(previa,
        h("div", { class: "fin-impo-res", style: "margin-top:12px" },
          h("div", null, h("b", { text: String(itens.length) }), h("span", { text: "linhas" })),
          h("div", null, h("b", { text: String(qtd) }), h("span", { text: "itens vendidos" })),
          h("div", null, h("b", { text: F.dinheiro(soma(prods, (x) => x.total)) }), h("span", { text: "em produtos" })),
          h("div", null, h("b", { text: F.dinheiro(soma(serv, (x) => x.total)) }), h("span", { text: "em serviços" }))),
        h("p", { class: "dica", text: "Total do relatório: " + F.dinheiro(totalGeral) + (devolucoes.length ? " (já descontadas " + devolucoes.length + " devoluções)" : "") + (lido.aba && lido.multi ? ". Aba lida: \"" + lido.aba + "\"" : "") + "." }),
        confere === true ? h("p", { class: "aviso-pagina ok", text: "Conferido: o total bate com o \"Total geral\" do próprio relatório (" + F.dinheiro(totalSistema) + ")." }) : null,
        confere === false ? h("p", { class: "aviso-pagina erro", text: "Atenção: o \"Total geral\" do relatório é " + F.dinheiro(totalSistema) + ", mas a soma das linhas deu " + F.dinheiro(totalGeral) + ". Pode ter linha que não consegui ler." }) : null,
        !ok ? h("p", { class: "aviso-pagina erro", text: "Escolha de que dias são essas vendas (use os botões acima ou as datas) para poder importar." }) : null,
        mesmoPeriodo ? h("p", { class: "aviso-pagina erro", text: "Já existe um relatório para " + fmtPeriodo(mesmoPeriodo.ini, mesmoPeriodo.fim) + (mesmoPeriodo.arquivo ? " (do arquivo " + mesmoPeriodo.arquivo + ")" : "") + " com " + F.dinheiro(mesmoPeriodo.total) + ". Se você importar, ele será SUBSTITUÍDO por este. Se este relatório é de outros dias, mude o período." }) : null,
        cruzam.length ? h("p", { class: "aviso-pagina erro", text: "Este período se mistura com: " + cruzam.map((r) => fmtPeriodo(r.ini, r.fim)).join("; ") + ". Nos dias que se repetem, as vendas seriam contadas duas vezes." }) : null,
        mesmoArquivo.length ? h("p", { class: "aviso-pagina erro", text: "Este mesmo arquivo já foi importado antes, no período " + fmtPeriodo(mesmoArquivo[0].ini, mesmoArquivo[0].fim) + ". Importar de novo em outro período duplica as vendas." }) : null,
        !mesmoArquivo.length && mesmoConteudo.length ? h("p", { class: "aviso-pagina erro", text: "O conteúdo é idêntico ao relatório de " + fmtPeriodo(mesmoConteudo[0].ini, mesmoConteudo[0].fim) + " (mesmo total e mesmo número de linhas). Parece o mesmo relatório baixado de novo." }) : null,
        itens.length ? F.tabela(["Produto", "Categoria", { t: "Qtd.", num: true }, { t: "Total", num: true }],
          itens.slice().sort((a, b) => b.total - a.total).slice(0, 8).map((x) => h("tr", null, h("td", { class: "truncar", text: (x.devolucao ? "(devolução) " : "") + x.produto }), h("td", { class: "truncar", text: F.categoriaLoja(x.produto) }), h("td", { class: "num", text: String(x.quantidade) }), h("td", { class: "num", text: F.dinheiro(x.total) })))) : null,
        itens.length > 8 ? h("p", { class: "dica", text: "Mostrando os 8 maiores de " + itens.length + "." }) : null);
    }
    async function ler(arquivo) {
      if (!arquivo) return;
      progresso.textContent = "Lendo o relatório..."; lido = null; P.limpar(previa);
      try { lido = await lerLinhas(arquivo); }
      catch (e) { progresso.textContent = ""; P.toast(e && /carregar/.test(e.message || "") ? e.message : "Não consegui ler esse arquivo. Confira se é uma planilha Excel ou CSV.", true); return; }
      if (!lido) { progresso.textContent = ""; P.toast("Não achei as colunas Produto, Quantidade e Total nesse arquivo.", true); return; }
      nomeArquivo = arquivo.name;
      progresso.textContent = (lido.linhas.length - lido.cab - 1) + " linha(s) lidas de " + arquivo.name + ".";
      desenhar();
    }
    input.addEventListener("change", () => ler(input.files[0]));
    [ini, fim].forEach((c) => c.addEventListener("change", desenhar));
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));

    P.modal({ titulo: "Importar relatório de vendas da loja", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Importar", classe: "p", aoClicar: async () => {
        const { itens } = dados();
        if (!lido) { P.toast("Escolha o relatório primeiro.", true); return false; }
        if (!periodoOk()) { P.toast("Diga de que dias são essas vendas antes de importar.", true); return false; }
        if (!itens.length) { P.toast("Não há linhas para importar.", true); return false; }
        const existente = relatoriosDe(ctx.vendasLoja || []).find((r) => r.ini === ini.value && r.fim === fim.value);
        if (existente && nomeBase(existente.arquivo) !== nomeBase(nomeArquivo)) {
          const sim = await P.confirmar("Já existe outro relatório (" + (existente.arquivo || "sem nome") + ", " + F.dinheiro(existente.total) + ") em " + fmtPeriodo(ini.value, fim.value) + ". Ele será apagado e trocado por este. Continuar?", { botao: "Trocar", perigo: true });
          if (!sim) return false;
        }
        /* mesmo período: troca o que existe (apaga o antigo e grava o novo) */
        const apagar = await P.gravar(() => window.sb.from("fin_vendas_loja").delete().eq("periodo_ini", ini.value).eq("periodo_fim", fim.value));
        if (!apagar.ok) return false;
        const linhas = itens.map((x) => ({ chave: chaveDe(ini.value, fim.value, x), periodo_ini: ini.value, periodo_fim: fim.value, arquivo: nomeArquivo.slice(0, 200),
          produto: x.produto, sku: x.sku, quantidade: x.quantidade, valor: x.valor, frete: x.frete, total: x.total }));
        let feitas = 0;
        for (let i = 0; i < linhas.length; i += 200) {
          const r = await P.gravar(() => window.sb.from("fin_vendas_loja").insert(linhas.slice(i, i + 200)));
          if (!r.ok) { P.toast("Parei no meio: " + feitas + " linhas salvas. Suba o relatório de novo para refazer o período.", true); ctx.recarregar(); return false; }
          feitas += Math.min(200, linhas.length - i);
        }
        ctx.lojaSel = ini.value + "|" + fim.value;
        P.toast(feitas + " linhas importadas!");
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
    const rels = relatoriosDe(todos);
    const periodos = rels.map((r) => r.ini + "|" + r.fim);
    if (ctx.lojaSel !== "todos" && periodos.indexOf(ctx.lojaSel) === -1) ctx.lojaSel = periodos[0];
    const sel = h("select", { "aria-label": "Relatório", onchange: (e) => { ctx.lojaSel = e.target.value; ctx.desenhar(); } },
      rels.map((r) => h("option", { value: r.ini + "|" + r.fim, text: fmtPeriodo(r.ini, r.fim), selected: r.ini + "|" + r.fim === ctx.lojaSel })),
      rels.length > 1 ? h("option", { value: "todos", text: "Todos os relatórios somados", selected: ctx.lojaSel === "todos" }) : null);
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

    /* o que conferir */
    const avisos = pontosDeAtencao(todos);
    const cruzados = [];
    rels.forEach((a, i) => rels.slice(i + 1).forEach((b) => { if (a.ini <= b.fim && a.fim >= b.ini) cruzados.push(fmtPeriodo(a.ini, a.fim) + " e " + fmtPeriodo(b.ini, b.fim)); }));
    cruzados.forEach((t) => avisos.unshift({ tipo: "Períodos misturados", texto: t + ": as vendas dos dias em comum são contadas duas vezes." }));
    raiz.append(F.cartao("Para conferir" + (avisos.length ? " (" + avisos.length + ")" : ""),
      avisos.length ? h("div", null, h("ul", { class: "fin-lista-avisos" }, avisos.slice(0, 15).map((a) => h("li", null, h("b", { text: a.tipo + ": " }), a.texto))),
        h("p", { class: "fraco", text: "Isso não quer dizer que esteja errado. É só o que foge do normal e vale uma segunda olhada." }))
        : h("p", { class: "fraco", text: "Nada fora do normal nos relatórios importados." })));

    /* relatórios importados */
    raiz.append(F.cartao("Relatórios importados", F.tabela(["Período", "Arquivo", { t: "Linhas", num: true }, { t: "Total", num: true }],
      rels.map((r) => h("tr", null, h("td", { class: "nw", text: fmtPeriodo(r.ini, r.fim) }), h("td", { class: "truncar", text: r.arquivo || "" }), h("td", { class: "num", text: String(r.linhas) }), h("td", { class: "num", text: F.dinheiro(r.total) }))))));

    /* por categoria */
    const cats = new Map();
    dados.forEach((x) => { const c = F.categoriaLoja(x.produto), g = cats.get(c) || { nome: c, total: 0, qtd: 0 }; g.total += x.total; g.qtd += x.quantidade; cats.set(c, g); });
    const lista = Array.from(cats.values()).sort((a, b) => b.total - a.total);
    const fatias = lista.map((g, i) => ({ nome: g.nome, valor: Math.max(0, g.total), cor: F.CORES[i % F.CORES.length] }));
    const donut = F.cartao("Por categoria", h("div", { class: "fin-rosca-caixa" }, F.rosca(fatias, F.curto(totalG), "total"),
      h("ul", { class: "fin-legenda-lista" }, lista.map((g, i) => h("li", null, h("i", { style: "background:" + F.CORES[i % F.CORES.length] }), h("span", { text: g.nome + " (" + g.qtd + ")" }), h("b", { text: F.dinheiro(g.total) }))))));

    /* produtos (iguais juntados pelo código ou pelo nome) */
    const prodsAgrupados = agruparProdutos(dados).sort((a, b) => b.total - a.total);
    const top = prodsAgrupados.slice(0, 10);
    const maisVendidos = F.cartao("O que mais faturou", F.tabela(["Produto", { t: "Qtd.", num: true }, { t: "Total", num: true }],
      top.map((g) => h("tr", null, h("td", { class: "truncar", title: Array.from(g.nomes).join(" | "), text: g.nome }), h("td", { class: "num", text: String(g.qtd) }), h("td", { class: "num", text: F.dinheiro(g.total) })))));
    raiz.append(h("div", { class: "fin-duas" }, donut, maisVendidos));

    /* lista completa */
    ctx.estadoLoja = ctx.estadoLoja || { busca: "" };
    const busca = h("input", { type: "search", placeholder: "Buscar por produto, código ou categoria", value: ctx.estadoLoja.busca, "aria-label": "Buscar" });
    const caixa = h("div");
    function tabela() {
      P.limpar(caixa);
      const q = P.semAcento(ctx.estadoLoja.busca);
      let l = prodsAgrupados.slice();
      if (q) l = l.filter((g) => P.semAcento(Array.from(g.nomes).join(" ") + " " + Array.from(g.skus).join(" ") + " " + F.categoriaLoja(g.nome)).includes(q));
      F.anexar(caixa, F.tabela(["Produto", "Código", "Categoria", { t: "Qtd.", num: true }, { t: "Valor", num: true }, { t: "Frete", num: true }, { t: "Total", num: true }],
        l.slice(0, 300).map((g) => h("tr", null, h("td", { class: "truncar", title: Array.from(g.nomes).join(" | "), text: g.nome }), h("td", { class: "nw", text: Array.from(g.skus).join(", ") }), h("td", { class: "truncar", text: F.categoriaLoja(g.nome) }),
          h("td", { class: "num", text: String(g.qtd) }), h("td", { class: "num", text: F.dinheiro(g.valor) }), h("td", { class: "num", text: F.dinheiro(g.frete) }), h("td", { class: "num", text: F.dinheiro(g.total) }))),
        "Nada encontrado."), l.length > 300 ? h("p", { class: "fraco", text: "Mostrando 300 de " + l.length + ". Use a busca." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { ctx.estadoLoja.busca = busca.value; tabela(); }, 150));
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" }, h("div", { class: "busca" }, P.ic("busca"), busca)), caixa);
    tabela();
    raiz.append(F.aviso("Estes números são só do relatório de vendas da loja e não entram na Visão geral nem na DRE, porque as notas fiscais dessas vendas já entram pelo XML. Assim o faturamento não é contado duas vezes. Produtos com o mesmo código ou o mesmo nome são somados numa linha só. A categoria é escolhida pelo nome do produto."));
    return raiz;
  };
})();
