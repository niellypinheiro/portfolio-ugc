/* =========================================================================
   Financeiro: transações da AMAZON.
   Você baixa na Amazon o relatório "Todas as transações" (CSV ou Excel) e sobe
   aqui. As informações ficam guardadas no painel (tabela fin_vendas_amazon).
   Subir o mesmo relatório de novo não repete nada: o que já existe é
   conferido e só o que mudou é atualizado (por exemplo, um pedido "Diferido"
   que passou a "Liberado").

   Esse relatório não tem uma coluna de data comum: a data vem escrita por
   extenso, como "11 de set. de 2026 09:45:13 GMT-7". O painel entende esse
   formato (e o horário, que vem no fuso dos EUA, é convertido para Brasília).

   Esses números ficam numa tela própria (Amazon) e NÃO entram na DRE nem na
   Visão geral, porque a nota fiscal dessas vendas já entra pelo XML. A tarifa
   da Amazon entra na tela Canais de venda, para calcular o lucro do canal.
   (Relatório de exemplo testado: "Todas as transações" da Amazon Brasil, agosto a outubro de 2026.)
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});
  F.telas = F.telas || {};

  const norm = (s) => P.semAcento(String(s == null ? "" : s)).replace(/[^a-z0-9]+/g, " ").trim();
  const dois = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);

  /* ---------- datas escritas por extenso (serve para qualquer planilha) ---------- */
  const MES3 = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12, feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12 };
  /* "11 de set. de 2026 09:45:13 GMT-7", "5 de novembro de 2026 14:32 hs.", "Oct 3, 2026". Devolve AAAA-MM-DD (já no horário de Brasília, se vier o fuso GMT) ou null */
  F.dataPtExtenso = function (v) {
    if (v == null || v === "") return null;
    const s = P.semAcento(String(v)).toLowerCase().trim();
    let m = s.match(/^(\d{1,2})\s+de\s+([a-z]{3,9})\.?\s+de\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*gmt\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?)?/);
    let dia, mes, ano, hh = 0, mm = 0, ss = 0, desl = null;
    if (m) {
      dia = +m[1]; mes = MES3[m[2].slice(0, 3)]; ano = +m[3];
      if (m[4] != null) { hh = +m[4]; mm = +m[5]; ss = +(m[6] || 0); }
      if (m[7]) desl = (m[7] === "-" ? -1 : 1) * (+m[8] + (+(m[9] || 0)) / 60);
    } else {
      m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);   /* formato em inglês: Oct 3, 2026 */
      if (!m || !MES3[m[1].slice(0, 3)]) return null;
      mes = MES3[m[1].slice(0, 3)]; dia = +m[2]; ano = +m[3];
    }
    if (!mes || dia < 1 || dia > 31 || ano < 2000 || ano > 2100) return null;
    if (desl !== null) {   /* troca o fuso do relatório (GMT-7, GMT-8...) pelo de Brasília (GMT-3) */
      const ms = Date.UTC(ano, mes - 1, dia, hh, mm, ss) - desl * 3600000 - 3 * 3600000;
      return new Date(ms).toISOString().slice(0, 10);
    }
    return ano + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
  };

  /* ---------- colunas (em português ou em inglês) ---------- */
  const COLUNAS = {
    data: ["data hora", "date time"], liquidacao: ["id de liquidacao", "settlement id"], tipo: ["tipo", "type"], pedido: ["id do pedido", "order id"],
    sku: ["sku"], descricao: ["descricao", "description"], quantidade: ["quantidade", "quantity"], atendimento: ["atendimento", "fulfillment"],
    cidade: ["cidade do pedido", "order city"], uf: ["estado do pedido", "order state"],
    vendas_produto: ["vendas do produto", "product sales"], creditos_remessa: ["creditos de remessa", "shipping credits"],
    creditos_presente: ["creditos de embalagem de presente", "gift wrap credits"], descontos: ["descontos promocionais", "promotional rebates"],
    imposto_coletado: ["imposto de vendas coletados", "sales tax collected"], tarifas_venda: ["tarifas de venda", "selling fees"], tarifas_fba: ["taxas fba", "fba fees"],
    outras_taxas: ["taxas de outras transacoes", "other transaction fees"], outro: ["outro", "other"], total: ["total"],
    status: ["status da transacao", "transaction status"], liberacao: ["data de liberacao da transacao", "transaction release date"]
  };
  const CHAVES = Object.keys(COLUNAS);
  const NOMES = { data: "data/hora", liquidacao: "id de liquidação", tipo: "tipo", pedido: "id do pedido", sku: "SKU", descricao: "descrição", quantidade: "quantidade", atendimento: "atendimento",
    cidade: "cidade", uf: "estado", vendas_produto: "vendas do produto", creditos_remessa: "créditos de remessa", creditos_presente: "créditos de embalagem", descontos: "descontos",
    imposto_coletado: "imposto coletado", tarifas_venda: "tarifas de venda", tarifas_fba: "taxas FBA", outras_taxas: "outras taxas", outro: "outro", total: "total", status: "status", liberacao: "data de liberação" };

  function mapear(cab) {
    const n = cab.map(norm), idx = {};
    CHAVES.forEach((k) => { idx[k] = n.findIndex((c) => COLUNAS[k].includes(c)); });
    return idx;
  }
  const ehCabecalho = (linha) => { const idx = mapear(linha.map((c) => String(c))); return idx.data !== -1 && idx.tipo !== -1 && idx.total !== -1 && (idx.pedido !== -1 || idx.liquidacao !== -1); };
  /* a planilha começa com um monte de explicações: acho a linha dos títulos */
  F.pareceAmazon = (linhas) => linhas.slice(0, 40).some((l) => ehCabecalho(l));

  /* ---------- leitura de valores ---------- */
  function numero(v) {   /* mantém o sinal: tarifas vêm negativas. Aceita "1.234,56", "-16,49" e 1234.56 */
    if (typeof v === "number") return isFinite(v) ? dois(v) : 0;
    let s = String(v == null ? "" : v).trim();
    if (!s) return 0;
    const neg = /^[-−]/.test(s) || /^\(.*\)$/.test(s) || /^R\$\s*[-−]/.test(s);
    s = s.replace(/[^\d.,]/g, "");
    if (!s) return 0;
    if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const x = parseFloat(s);
    return isFinite(x) ? dois(neg ? -x : x) : 0;
  }
  const texto = (v, max) => { const s = (typeof v === "number" ? String(v) : String(v == null ? "" : v)).trim(); return s ? s.slice(0, max) : null; };
  const textoId = (v) => (typeof v === "number" ? v.toFixed(0) : String(v == null ? "" : v).trim());
  function categoriaDe(tipo) {
    const t = norm(tipo);
    if (/^(pedido|order)/.test(t)) return "pedido";
    if (/reembols|refund|devolu|estorno de pedido/.test(t)) return "reembolso";
    if (/transfer/.test(t)) return "repasse";
    if (/tarifa|taxa|servic|fee|ajuste|adjust|assinatura|armazen|storage|fba|anuncio|advertising/.test(t)) return "taxa";
    return "outro";
  }
  F.amazonLiquidoDeLinha = (x) => (x.categoria === "repasse" ? 0 : Number(x.total) || 0);
  const taxasDeLinha = (x) => (x.categoria === "repasse" ? 0 : -((Number(x.tarifas_venda) || 0) + (Number(x.tarifas_fba) || 0) + (Number(x.outras_taxas) || 0)) - (x.categoria === "taxa" ? (Number(x.outro) || 0) : 0));
  F.amazonTarifas = (lista) => soma(lista, taxasDeLinha);
  const aLiberar = (x) => /^diferid|^deferred|^pendente/.test(norm(x.status || ""));

  /* ---------- ler o arquivo (Excel ou CSV) ---------- */
  async function lerArquivo(arquivo) {
    const abas = await F.lerAbas(arquivo);
    for (const a of abas) {
      const linhas = a.linhas.filter((l) => l.some((v) => String(v).trim() !== ""));
      const c = linhas.findIndex((l, i) => i < 40 && ehCabecalho(l));
      if (c !== -1) return { linhas, cab: c, aba: a.nome, multi: abas.length > 1 };
    }
    return null;
  }

  function montarLinhas(lido, nomeArquivo) {
    const cab = lido.linhas[lido.cab].map((c) => String(c)), idx = mapear(cab);
    const cel = (l, k) => (idx[k] === -1 ? "" : l[idx[k]]);
    const itens = [], invalidas = [], vistos = new Map();
    lido.linhas.slice(lido.cab + 1).forEach((l, n) => {
      const bruta = cel(l, "data"), tipo = texto(cel(l, "tipo"), 80);
      if ((bruta === "" || bruta == null) && !tipo) return;
      const data = F.dataPtExtenso(bruta) || (typeof bruta === "number" || /^\d/.test(String(bruta)) ? dataSimples(bruta) : null);
      if (!data) { invalidas.push("Linha " + (lido.cab + 2 + n) + ": não entendi a data \"" + String(bruta).slice(0, 40) + "\"."); return; }
      const pedido = textoId(cel(l, "pedido")), sku = textoId(cel(l, "sku")), desc = texto(cel(l, "descricao"), 300), total = numero(cel(l, "total"));
      let chave = [String(bruta).trim(), textoId(cel(l, "liquidacao")), tipo || "", pedido, sku, (desc || "").slice(0, 60), total.toFixed(2)].join("|");
      const c = (vistos.get(chave) || 0) + 1; vistos.set(chave, c);
      if (c > 1) chave += "#" + c;
      const q = parseInt(cel(l, "quantidade"), 10), lib = cel(l, "liberacao");
      itens.push({
        chave: chave.slice(0, 400), data, liberacao: lib === "" || lib == null ? null : F.dataPtExtenso(lib) || dataSimples(lib), liquidacao: texto(textoId(cel(l, "liquidacao")), 40), tipo,
        categoria: categoriaDe(tipo), pedido: texto(pedido, 40), sku: texto(sku, 120), descricao: desc, quantidade: isFinite(q) ? q : null, atendimento: texto(cel(l, "atendimento"), 60),
        cidade: texto(cel(l, "cidade"), 120), uf: texto(cel(l, "uf"), 20),
        vendas_produto: numero(cel(l, "vendas_produto")), creditos_remessa: numero(cel(l, "creditos_remessa")), creditos_presente: numero(cel(l, "creditos_presente")),
        descontos: numero(cel(l, "descontos")), imposto_coletado: numero(cel(l, "imposto_coletado")), tarifas_venda: numero(cel(l, "tarifas_venda")), tarifas_fba: numero(cel(l, "tarifas_fba")),
        outras_taxas: numero(cel(l, "outras_taxas")), outro: numero(cel(l, "outro")), total, status: texto(cel(l, "status"), 40), arquivo: String(nomeArquivo || "").slice(0, 200)
      });
    });
    return { itens, invalidas, idx };
  }
  function dataSimples(v) {   /* 05/11/2026, 2026-11-05 ou número do Excel */
    if (typeof v === "number") return v > 20000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10) : null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
    return m ? m[3] + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0") : null;
  }
  const COMPARAR = ["vendas_produto", "creditos_remessa", "creditos_presente", "descontos", "imposto_coletado", "tarifas_venda", "tarifas_fba", "outras_taxas", "outro", "total"];
  const igual = (a, b) => COMPARAR.every((k) => dois(a[k]) === dois(b[k])) && (a.status || "") === (b.status || "") && (a.liberacao || "") === (b.liberacao || "") && a.data === b.data;

  /* ---------- janela de importação ---------- */
  F.abrirImportacaoAmazon = function (ctx, arquivoPre) {
    let lido = null, plano = null, nome = "";
    const input = h("input", { type: "file", accept: ".xlsx,.xls,.csv,text/csv", id: "finPlanilhaAmazon", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finPlanilhaAmazon", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha o relatório da Amazon ou arraste até aqui" }),
      h("span", { class: "fraco", text: "O CSV \"Todas as transações\" (Relatórios, Pagamentos, na Central de Vendedores)." }));
    const progresso = h("p", { class: "fraco", role: "status" }), previa = h("div");
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Suba aqui o relatório de transações da Amazon. As datas vêm escritas por extenso (como \"11 de set. de 2026\") e eu entendo sozinha. Se subir o mesmo relatório de novo, nada se repete: só o que mudou é atualizado." }),
      input, zona, progresso, previa);

    function montar() {
      const r = montarLinhas(lido, nome), ja = new Map((ctx.vendasAmazon || []).map((x) => [x.chave, x]));
      const novas = [], atualizar = [], iguais = [];
      r.itens.forEach((v) => { const e = ja.get(v.chave); if (!e) novas.push(v); else if (!igual(e, v)) atualizar.push(v); else iguais.push(v); });
      plano = { novas, atualizar, iguais, invalidas: r.invalidas, idx: r.idx, todas: r.itens };
      desenhar();
    }
    function desenhar() {
      P.limpar(previa);
      if (!plano) return;
      const t = plano.todas, pedidos = t.filter((x) => x.categoria === "pedido");
      const datas = t.map((x) => x.data).sort(), reconhecidas = CHAVES.filter((k) => plano.idx[k] !== -1).map((k) => NOMES[k]);
      F.anexar(previa,
        h("div", { class: "fin-impo-res", style: "margin-top:12px" },
          h("div", null, h("b", { text: String(plano.novas.length) }), h("span", { text: "linhas novas" })),
          h("div", null, h("b", { text: String(plano.atualizar.length) }), h("span", { text: "para atualizar" })),
          h("div", null, h("b", { text: String(plano.iguais.length) }), h("span", { text: "já estavam iguais" })),
          h("div", null, h("b", { text: String(new Set(pedidos.map((x) => x.pedido)).size) }), h("span", { text: "pedidos" }))),
        datas.length ? h("p", { class: "dica", text: "Período do relatório: " + P.fmtData(datas[0]) + " a " + P.fmtData(datas[datas.length - 1]) + " (datas no horário de Brasília). Vendas " + F.dinheiro(soma(pedidos, (x) => x.vendas_produto)) +
          ", tarifas e taxas " + F.dinheiro(F.amazonTarifas(t)) + ", líquido " + F.dinheiro(soma(t, F.amazonLiquidoDeLinha)) + "." + (lido.aba && lido.multi ? " (aba \"" + lido.aba + "\")" : "") }) : null,
        h("p", { class: "dica", text: "Colunas que reconheci: " + (reconhecidas.join(", ") || "nenhuma") + "." }),
        plano.invalidas.length ? h("div", { class: "aviso-pagina" }, h("b", { text: plano.invalidas.length + " linha(s) não serão importadas" }), plano.invalidas.slice(0, 5).map((x) => h("p", { text: x })), plano.invalidas.length > 5 ? h("p", { text: "e mais " + (plano.invalidas.length - 5) + "..." }) : null) : null,
        plano.novas.length ? F.tabela(["Data", "Pedido", "Tipo", "Produto", { t: "Total", num: true }, "Status"],
          plano.novas.slice(0, 8).map((v) => h("tr", null, h("td", { class: "nw", text: P.fmtData(v.data) }), h("td", { class: "nw", text: v.pedido || "" }), h("td", { class: "truncar", text: v.tipo || "" }),
            h("td", { class: "truncar", text: v.descricao || "" }), h("td", { class: "num", text: F.dinheiro(v.total) }), h("td", { class: "nw", text: v.status || "" })))) : null,
        plano.novas.length > 8 ? h("p", { class: "dica", text: "Mostrando 8 de " + plano.novas.length + "." }) : null);
    }
    async function ler(arquivo) {
      if (!arquivo) return;
      progresso.textContent = "Lendo o relatório..."; lido = null; plano = null; nome = arquivo.name; P.limpar(previa);
      try { lido = await lerArquivo(arquivo); }
      catch (e) { progresso.textContent = ""; P.toast(e && /carregar/.test(e.message || "") ? e.message : "Não consegui ler esse arquivo. Confira se é um CSV ou Excel.", true); return; }
      if (!lido) { progresso.textContent = ""; P.toast("Não achei a lista de transações da Amazon nesse arquivo. Ela precisa ter as colunas \"data/hora\", \"tipo\", \"id do pedido\" e \"total\".", true); return; }
      progresso.textContent = (lido.linhas.length - lido.cab - 1) + " linha(s) lidas de " + arquivo.name + ".";
      montar();
    }
    input.addEventListener("change", () => ler(input.files[0]));
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));

    P.modal({ titulo: "Importar transações da Amazon", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Importar", classe: "p", aoClicar: async () => {
        if (!plano) { P.toast("Escolha o relatório primeiro.", true); return false; }
        const enviar = plano.novas.concat(plano.atualizar);
        if (!enviar.length) { P.toast("Tudo isso já estava no painel. Não há nada novo.", true); return false; }
        let feitas = 0;
        for (let i = 0; i < enviar.length; i += 200) {
          const r = await P.gravar(() => window.sb.from("fin_vendas_amazon").upsert(enviar.slice(i, i + 200), { onConflict: "chave" }));
          if (!r.ok) { P.toast("Parei no meio: " + feitas + " linhas foram salvas. Suba o relatório de novo para continuar (o que já entrou não repete).", true); ctx.recarregar(); return false; }
          feitas += Math.min(200, enviar.length - i);
        }
        P.toast(plano.novas.length + " nova(s) e " + plano.atualizar.length + " atualizada(s)!");
        ctx.ir("amazon"); ctx.recarregar();
      } }
    ] });
    if (arquivoPre) ler(arquivoPre);
  };

  /* ---------- a tela ---------- */
  F.telas.amazon = function (ctx) {
    const raiz = h("div"), fx = ctx.faixa;
    if (!ctx.amazonOk) {
      raiz.append(F.aviso("A tabela da Amazon ainda não existe no Supabase. Use a faixa amarela no topo (\"Copiar o SQL\"), cole no SQL Editor do projeto \"niellypinheiro portfólio\" e clique em Run. Depois atualize esta página.", "erro"));
      return raiz;
    }
    ctx.estadoAmazon = ctx.estadoAmazon || { filtro: "pedido", busca: "" };
    const e = ctx.estadoAmazon, todas = ctx.vendasAmazon || [];
    const dentro = (x, a, b) => x.data && x.data >= a && x.data <= b;
    const per = todas.filter((x) => dentro(x, fx.ini, fx.fim)), ant = todas.filter((x) => dentro(x, fx.ant.ini, fx.ant.fim));
    if (!todas.length) {
      raiz.append(F.cartao("Nenhuma transação importada ainda", h("div", null,
        h("p", { text: "Na Central de Vendedores da Amazon, baixe o relatório \"Todas as transações\" e clique em Importar relatório aqui. As datas vêm escritas por extenso e eu entendo sozinha." }),
        h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoAmazon(ctx) }, P.ic("subir"), "Importar relatório"))));
      return raiz;
    }
    const pedidos = (l) => l.filter((x) => x.categoria === "pedido"), reemb = (l) => l.filter((x) => x.categoria === "reembolso"), rep = (l) => l.filter((x) => x.categoria === "repasse");
    const fat = soma(pedidos(per), (x) => x.vendas_produto), fatAnt = soma(pedidos(ant), (x) => x.vendas_produto);
    const taxas = F.amazonTarifas(per), liq = soma(per, F.amazonLiquidoDeLinha), liqAnt = soma(ant, F.amazonLiquidoDeLinha);
    const nPed = new Set(pedidos(per).map((x) => x.pedido)).size, nPedAnt = new Set(pedidos(ant).map((x) => x.pedido)).size;
    const aLib = soma(per.filter(aLiberar), (x) => x.total), repassado = -soma(rep(per), (x) => x.total), devolvido = -soma(reemb(per), (x) => x.total);

    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile("t-azul", "Pedidos", String(nPed), "unidades: " + soma(pedidos(per), (x) => x.quantidade || 0) + (reemb(per).length ? ", " + reemb(per).length + " reembolso(s)" : ""), F.variacao(nPed, nPedAnt)),
      F.tile("t-ouro", "Vendas (produtos)", F.dinheiro(fat), devolvido ? "reembolsado: " + F.dinheiro(devolvido) : fx.rotulo, F.variacao(fat, fatAnt)),
      F.tile("t-vinho", "Tarifas e taxas", F.dinheiro(taxas), fat ? F.pct((taxas / fat) * 100, 1) + " das vendas" : "", null),
      F.tile("t-verde", "Líquido", F.dinheiro(liq), (aLib ? "a liberar: " + F.dinheiro(aLib) + ". " : "") + "repassado ao banco: " + F.dinheiro(repassado), F.variacao(liq, liqAnt))));

    const meses = F.mesesAtras(6);
    const porMes = (f) => meses.map((m) => dois(soma(todas.filter((x) => x.data && x.data.slice(0, 7) === m), f)));
    const graf = F.cartao("Últimos 6 meses", F.barras(meses.map(F.mesNome), [
      { nome: "Vendas", cor: F.CORES[0], valores: porMes((x) => (x.categoria === "pedido" ? x.vendas_produto : 0)) },
      { nome: "Líquido", cor: F.CORES[2], valores: porMes(F.amazonLiquidoDeLinha) }]));
    const grupos = new Map();
    pedidos(per).forEach((x) => {
      const k = x.sku || x.descricao || "Sem nome", g = grupos.get(k) || { nome: x.descricao || x.sku || k, un: 0, fat: 0, liq: 0 };
      g.un += x.quantidade || 0; g.fat += x.vendas_produto; g.liq += x.total; grupos.set(k, g);
    });
    const top = Array.from(grupos.values()).sort((a, b) => b.fat - a.fat).slice(0, 8);
    raiz.append(h("div", { class: "fin-duas" }, graf, F.cartao("Produtos que mais vendem", F.tabela(["Produto", { t: "Un.", num: true }, { t: "Vendas", num: true }, { t: "Líquido", num: true }],
      top.map((g) => h("tr", null, h("td", { class: "truncar", text: g.nome }), h("td", { class: "num", text: String(g.un) }), h("td", { class: "num", text: F.dinheiro(g.fat) }), h("td", { class: "num", text: F.dinheiro(g.liq) }))), "Nenhuma venda neste período."))));

    const busca = h("input", { type: "search", placeholder: "Buscar por produto, pedido ou SKU", value: e.busca, "aria-label": "Buscar" });
    const caixa = h("div");
    function tabela() {
      P.limpar(caixa);
      const q = P.semAcento(e.busca);
      let l = per.filter((x) => e.filtro === "todas" || x.categoria === e.filtro || (e.filtro === "taxa" && x.categoria === "outro"));
      if (q) l = l.filter((x) => P.semAcento([x.descricao, x.pedido, x.sku, x.tipo].join(" ")).includes(q));
      l = l.slice().sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
      F.anexar(caixa, F.tabela(["Data", "Pedido", "Tipo", "Produto ou descrição", { t: "Vendas", num: true }, { t: "Tarifas e taxas", num: true }, { t: "Total", num: true }, "Status"],
        l.slice(0, 300).map((x) => h("tr", null, h("td", { class: "nw", text: P.fmtData(x.data) }), h("td", { class: "nw", text: x.pedido || "" }), h("td", { class: "truncar", text: x.tipo || "" }),
          h("td", { class: "truncar", text: x.descricao || "" }), h("td", { class: "num", text: x.vendas_produto ? F.dinheiro(x.vendas_produto) : "" }),
          h("td", { class: "num", text: taxasDeLinha(x) ? F.dinheiro(taxasDeLinha(x)) : "" }), h("td", { class: "num", text: F.dinheiro(x.total) }),
          h("td", { class: "nw" }, x.status ? F.pilulaStatus(x.status, aLiberar(x) ? "aviso" : "ok") : null))), "Nada com esse filtro neste período."),
        l.length > 300 ? h("p", { class: "fraco", text: "Mostrando 300 de " + l.length + ". Use a busca." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { e.busca = busca.value; tabela(); }, 150));
    const chip = (v, t) => h("button", { type: "button", "aria-pressed": String(e.filtro === v), text: t, onclick: () => { e.filtro = v; ctx.desenhar(); } });
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" },
      h("div", { class: "busca" }, P.ic("busca"), busca),
      h("div", { class: "filtros", role: "group", "aria-label": "Filtrar" }, chip("pedido", "Pedidos"), chip("reembolso", "Reembolsos"), chip("taxa", "Tarifas e outros"), chip("repasse", "Repasses ao banco"), chip("todas", "Todas")),
      h("span", { class: "espaco" }),
      h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoAmazon(ctx) }, P.ic("subir"), "Importar relatório")), caixa);
    tabela();
    raiz.append(F.aviso("Estes números são só da Amazon e não entram na Visão geral nem na DRE, porque a nota fiscal dessas vendas já entra pelo XML. A tarifa da Amazon entra na tela Canais de venda. As datas estão no horário de Brasília (o relatório vem no horário dos EUA). Pedido \"Diferido\" ainda não foi liberado pela Amazon."));
    return raiz;
  };
})();
