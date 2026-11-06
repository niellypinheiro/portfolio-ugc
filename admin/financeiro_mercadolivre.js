/* =========================================================================
   Financeiro: vendas do MERCADO LIVRE.
   Você baixa a planilha de vendas no Mercado Livre (Excel) e sobe aqui. As
   informações ficam guardadas no painel (tabela fin_vendas_ml) e a planilha
   não precisa ser aberta. Subir de novo a mesma planilha não repete nada:
   as vendas que já existem são conferidas e só o que mudou é atualizado
   (por exemplo, uma venda que passou de "A caminho" para "Entregue").

   Esses números ficam numa tela própria (Mercado Livre) e NÃO entram na
   DRE nem na Visão geral, porque a nota fiscal dessas vendas já entra pelo
   XML. Assim a receita não é contada duas vezes.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});
  F.telas = F.telas || {};

  const norm = (s) => P.semAcento(String(s == null ? "" : s)).replace(/[^a-z0-9]+/g, " ").trim();
  const dois = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);

  /* Títulos de coluna que o Mercado Livre usa (e variações comuns). Já sem acento e sem pontuação. */
  const COLUNAS = {
    numero: ["n de venda", "n da venda", "numero de venda", "numero da venda", "n do pedido", "numero do pedido", "id da venda", "id do pedido", "pedido"],
    data: ["data da venda", "data do pedido", "data de criacao", "data da compra"],
    status: ["estado", "status", "situacao"],
    status_desc: ["descricao do status"],
    unidades: ["unidades", "quantidade", "qtd"],
    receita_produtos: ["receita por produtos brl", "receita por produtos", "valor dos produtos"],
    receita_envio: ["receita por envio brl", "receita por envio"],
    tarifa_venda: ["tarifa de venda e impostos", "tarifa de venda", "tarifas de venda", "comissao"],
    tarifa_envio: ["tarifas de envio brl", "tarifas de envio", "tarifa de envio"],
    cancelamentos: ["cancelamentos e reembolsos brl", "cancelamentos e reembolsos", "reembolsos"],
    total: ["total brl", "total"],
    sku: ["sku"],
    anuncio: ["de anuncio", "numero do anuncio", "id do anuncio", "codigo do anuncio"],
    titulo: ["titulo do anuncio", "titulo", "produto", "nome do produto"],
    preco_unitario: ["preco unitario de venda do anuncio brl", "preco unitario"],
    tipo_anuncio: ["tipo de anuncio"],
    comprador: ["comprador", "nome do comprador"],
    cidade: ["cidade", "municipio"],
    forma_entrega: ["forma de entrega", "tipo de envio"]
  };
  const CHAVES = Object.keys(COLUNAS);
  const NOMES = { numero: "nº da venda", data: "data", status: "estado", status_desc: "descrição do status", unidades: "unidades", receita_produtos: "receita dos produtos",
    receita_envio: "receita do envio", tarifa_venda: "tarifa de venda", tarifa_envio: "tarifa de envio", cancelamentos: "cancelamentos e reembolsos", total: "total",
    sku: "SKU", anuncio: "nº do anúncio", titulo: "título", preco_unitario: "preço unitário", tipo_anuncio: "tipo de anúncio", comprador: "comprador", cidade: "cidade", uf: "estado (UF)", forma_entrega: "forma de entrega" };
  const PESSOAL = /cpf|cnpj|documento|endereco|cep|telefone|fone|e mail|email|comprador|domicilio|rua|bairro|inscricao|contribuinte|dados pessoais|complemento|destinatario|nome|referencia/;

  /* acha a coluna de cada informação: primeiro título igual, depois título que começa igual */
  function mapear(cab) {
    const n = cab.map(norm), usadas = new Set(), idx = {};
    CHAVES.forEach((k) => {
      let i = -1;
      for (const a of COLUNAS[k]) { i = n.findIndex((c, j) => !usadas.has(j) && c === a); if (i !== -1) break; }
      if (i === -1) for (const a of COLUNAS[k]) { i = n.findIndex((c, j) => !usadas.has(j) && c.length && c.startsWith(a + " ")); if (i !== -1) break; }
      idx[k] = i; if (i !== -1) usadas.add(i);
    });
    /* o Mercado Livre tem duas colunas "Estado": a primeira é a situação da venda, a segunda é o estado (UF) do comprador */
    idx.uf = n.findIndex((c, j) => !usadas.has(j) && (c === "estado" || c === "uf" || c === "estado do comprador"));
    if (idx.uf !== -1) usadas.add(idx.uf);
    return { idx, usadas };
  }
  function pontuar(cab) { const { idx } = mapear(cab); return { pontos: CHAVES.filter((k) => idx[k] !== -1).length, ok: idx.numero !== -1 && (idx.total !== -1 || idx.receita_produtos !== -1 || idx.data !== -1) }; }
  F.pareceMercadoLivre = (linhas) => linhas.slice(0, 25).some((l) => pontuar(l.map((c) => String(c))).ok && norm(l.join(" ")).includes("venda"));

  /* ---------- leitura de valores ---------- */
  function numero(v) {   /* mantém o sinal: tarifas vêm negativas */
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
  const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  function dataVenda(v) {   /* "5 de novembro de 2026 14:32 hs.", 05/11/2026, 2026-11-05 ou número do Excel */
    if (v == null || v === "") return null;
    if (typeof v === "number") return v > 20000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10) : null;
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) { const a = m[3].length === 2 ? "20" + m[3] : m[3]; return a + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0"); }
    m = norm(s).match(/^(\d{1,2}) de ([a-z]+) de (\d{4})/);
    if (m && MESES[m[2]]) return m[3] + "-" + String(MESES[m[2]]).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0");
    return F.dataPtExtenso ? F.dataPtExtenso(s) : null;   /* meses abreviados ("set.") e fuso GMT */
  }
  const texto = (v, max) => { const s = (typeof v === "number" ? String(v) : String(v == null ? "" : v)).trim(); return s ? s.slice(0, max) : null; };
  const textoId = (v) => (typeof v === "number" ? v.toFixed(0) : String(v == null ? "" : v).trim());
  F.vendaCancelada = (x) => /cancel|devolv|devoluc|reembols|reclama/.test(norm((x.status || "") + " " + (x.status_desc || "")));

  /* ---------- ler o arquivo (Excel ou CSV) ---------- */
  function carregarScript(src, pronto) {
    if (pronto()) return Promise.resolve();
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = src; s.onload = () => (pronto() ? ok() : erro(new Error("biblioteca não iniciou")));
      s.onerror = () => erro(new Error("Não consegui carregar a ferramenta de leitura de Excel. Confira a internet."));
      document.head.append(s);
    });
  }
  async function lerArquivo(arquivo) {
    let abas;
    if (/\.xlsx?$/i.test(arquivo.name)) {
      await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => !!window.XLSX);
      const livro = window.XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
      abas = livro.SheetNames.map((nome) => ({ nome, linhas: window.XLSX.utils.sheet_to_json(livro.Sheets[nome], { header: 1, defval: "", raw: true }) }));
    } else {
      abas = [{ nome: "", linhas: P.lerCSV(await P.lerArquivoTexto(arquivo)) }];
    }
    /* o Mercado Livre põe títulos soltos no alto e às vezes várias abas: escolho a aba e a linha de títulos que mais parecem uma lista de vendas */
    let melhor = null;
    abas.forEach((a) => {
      const linhas = a.linhas.filter((l) => l.some((v) => String(v).trim() !== ""));
      for (let r = 0; r < Math.min(25, linhas.length); r++) {
        const p = pontuar(linhas[r].map((c) => String(c)));
        if (p.ok && (!melhor || p.pontos > melhor.pontos)) melhor = { pontos: p.pontos, aba: a.nome, linhas, cab: r, multi: abas.length > 1 };
      }
    });
    return melhor;
  }

  /* ---------- transformar as linhas em vendas ---------- */
  function montarVendas(lido) {
    const cab = lido.linhas[lido.cab].map((c) => String(c)), { idx, usadas } = mapear(cab);
    const cel = (l, k) => (idx[k] === -1 ? "" : l[idx[k]]);
    const vendas = [], invalidas = [], vistos = new Map();
    lido.linhas.slice(lido.cab + 1).forEach((l, n) => {
      const num = textoId(cel(l, "numero"));
      if (!num) return;
      if (!/\d/.test(num)) return;   /* linhas de resumo e títulos repetidos */
      const data = dataVenda(cel(l, "data"));
      const titulo = texto(cel(l, "titulo"), 300), anuncio = texto(textoId(cel(l, "anuncio")), 80), sku = texto(textoId(cel(l, "sku")), 120);
      if (!data) { invalidas.push("Linha " + (lido.cab + 2 + n) + " (venda " + num + "): não entendi a data."); return; }
      let chave = num + "|" + (anuncio || sku || norm(titulo).slice(0, 40));
      const c = (vistos.get(chave) || 0) + 1; vistos.set(chave, c);
      if (c > 1) chave += "#" + c;
      const dados = {};
      cab.forEach((nome, i) => {
        if (usadas.has(i) || !nome.trim() || PESSOAL.test(norm(nome))) return;
        const v = l[i]; if (v === "" || v == null) return;
        dados[nome.trim().slice(0, 80)] = typeof v === "number" ? v : String(v).slice(0, 120);
      });
      const un = parseInt(cel(l, "unidades"), 10);
      vendas.push({
        chave: chave.slice(0, 240), numero_venda: num.slice(0, 80), data_venda: data,
        status: texto(cel(l, "status"), 160), status_desc: texto(cel(l, "status_desc"), 300), unidades: isFinite(un) ? un : null,
        receita_produtos: numero(cel(l, "receita_produtos")), receita_envio: numero(cel(l, "receita_envio")),
        tarifa_venda: numero(cel(l, "tarifa_venda")), tarifa_envio: numero(cel(l, "tarifa_envio")),
        cancelamentos: numero(cel(l, "cancelamentos")), total: numero(cel(l, "total")),
        sku, anuncio, titulo, preco_unitario: idx.preco_unitario === -1 ? null : numero(cel(l, "preco_unitario")), tipo_anuncio: texto(cel(l, "tipo_anuncio"), 80),
        comprador: texto(cel(l, "comprador"), 200), cidade: texto(cel(l, "cidade"), 120), uf: texto(cel(l, "uf"), 60), forma_entrega: texto(cel(l, "forma_entrega"), 160),
        dados: Object.keys(dados).length ? dados : null
      });
    });
    return { vendas, invalidas, idx };
  }
  const CAMPOS_COMPARAR = ["status", "status_desc", "receita_produtos", "receita_envio", "tarifa_venda", "tarifa_envio", "cancelamentos", "total", "unidades"];
  const igual = (a, b) => CAMPOS_COMPARAR.every((k) => (typeof a[k] === "number" || typeof b[k] === "number" ? dois(a[k]) === dois(b[k]) : (a[k] || "") === (b[k] || "")));

  /* ---------- janela de importação ---------- */
  F.abrirImportacaoML = function (ctx, arquivoPre) {
    let lido = null, plano = null;
    const input = h("input", { type: "file", accept: ".xlsx,.xls,.csv,text/csv", id: "finPlanilhaML", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finPlanilhaML", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha a planilha de vendas ou arraste até aqui" }),
      h("span", { class: "fraco", text: "O arquivo Excel (.xlsx) que você baixa em Vendas, no Mercado Livre." }));
    const progresso = h("p", { class: "fraco", role: "status" }), previa = h("div");
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Suba aqui a planilha de vendas do Mercado Livre. Eu guardo as informações no painel e você não precisa abrir a planilha. Se subir a mesma planilha de novo, nada se repete: só o que mudou é atualizado, como uma venda que foi entregue ou cancelada." }),
      input, zona, progresso, previa);

    function montar() {
      const r = montarVendas(lido), ja = new Map((ctx.vendasML || []).map((x) => [x.chave, x]));
      const novas = [], atualizar = [], iguais = [];
      r.vendas.forEach((v) => { const e = ja.get(v.chave); if (!e) novas.push(v); else if (!igual(e, v)) atualizar.push(v); else iguais.push(v); });
      plano = { novas, atualizar, iguais, invalidas: r.invalidas, idx: r.idx, todas: r.vendas };
      desenhar();
    }
    function desenhar() {
      P.limpar(previa);
      if (!plano) return;
      const validas = plano.todas.filter((v) => !F.vendaCancelada(v)), canc = plano.todas.length - validas.length;
      const reconhecidas = CHAVES.concat(["uf"]).filter((k) => plano.idx[k] !== -1).map((k) => NOMES[k]);
      F.anexar(previa,
        h("div", { class: "fin-impo-res", style: "margin-top:12px" },
          h("div", null, h("b", { text: String(plano.novas.length) }), h("span", { text: "vendas novas" })),
          h("div", null, h("b", { text: String(plano.atualizar.length) }), h("span", { text: "para atualizar" })),
          h("div", null, h("b", { text: String(plano.iguais.length) }), h("span", { text: "já estavam iguais" })),
          h("div", null, h("b", { text: String(canc) }), h("span", { text: "canceladas ou devolvidas" }))),
        h("p", { class: "dica", text: "Na planilha: " + validas.length + " vendas válidas, produtos " + F.dinheiro(soma(validas, (v) => v.receita_produtos)) + ", total líquido " + F.dinheiro(soma(validas, (v) => v.total)) + "." + (lido.aba && lido.multi ? " (aba \"" + lido.aba + "\")" : "") }),
        h("p", { class: "dica", text: "Colunas que reconheci: " + (reconhecidas.join(", ") || "nenhuma") + "." }),
        plano.idx.data === -1 ? h("p", { class: "aviso-pagina erro", text: "Não achei a coluna da data da venda, então não consigo importar." }) : null,
        plano.invalidas.length ? h("div", { class: "aviso-pagina" }, h("b", { text: plano.invalidas.length + " linha(s) não serão importadas" }), plano.invalidas.slice(0, 5).map((t) => h("p", { text: t })), plano.invalidas.length > 5 ? h("p", { text: "e mais " + (plano.invalidas.length - 5) + "..." }) : null) : null,
        plano.novas.length ? F.tabela(["Data", "Venda", "Produto", { t: "Un.", num: true }, { t: "Total", num: true }, "Situação"],
          plano.novas.slice(0, 8).map((v) => h("tr", null, h("td", { class: "nw", text: P.fmtData(v.data_venda) }), h("td", { class: "nw", text: v.numero_venda }), h("td", { class: "truncar", text: v.titulo || "" }),
            h("td", { class: "num", text: v.unidades == null ? "" : String(v.unidades) }), h("td", { class: "num", text: F.dinheiro(v.total) }), h("td", { class: "truncar", text: v.status || "" })))) : null,
        plano.novas.length > 8 ? h("p", { class: "dica", text: "Mostrando 8 de " + plano.novas.length + "." }) : null);
    }
    async function ler(arquivo) {
      if (!arquivo) return;
      progresso.textContent = "Lendo a planilha..."; lido = null; plano = null; P.limpar(previa);
      try { lido = await lerArquivo(arquivo); }
      catch (e) { progresso.textContent = ""; P.toast(e && /carregar/.test(e.message || "") ? e.message : "Não consegui ler esse arquivo. Confira se é uma planilha Excel ou CSV.", true); return; }
      if (!lido) {
        progresso.textContent = "";
        P.toast("Não achei a lista de vendas nessa planilha. Ela precisa ter colunas como \"N.º de venda\" e \"Data da venda\". Me mande um exemplo para eu ajustar.", true);
        return;
      }
      progresso.textContent = (lido.linhas.length - lido.cab - 1) + " linha(s) lidas de " + arquivo.name + ".";
      montar();
    }
    input.addEventListener("change", () => ler(input.files[0]));
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));

    P.modal({ titulo: "Importar vendas do Mercado Livre", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Importar", classe: "p", aoClicar: async () => {
        if (!plano) { P.toast("Escolha a planilha primeiro.", true); return false; }
        const enviar = plano.novas.concat(plano.atualizar);
        if (!enviar.length) { P.toast("Tudo isso já estava no painel. Não há nada novo.", true); return false; }
        let feitas = 0;
        for (let i = 0; i < enviar.length; i += 200) {
          const r = await P.gravar(() => window.sb.from("fin_vendas_ml").upsert(enviar.slice(i, i + 200), { onConflict: "chave" }));
          if (!r.ok) { P.toast("Parei no meio: " + feitas + " vendas foram salvas. Suba a planilha de novo para continuar (o que já entrou não repete).", true); ctx.recarregar(); return false; }
          feitas += Math.min(200, enviar.length - i);
        }
        P.toast(plano.novas.length + " nova(s) e " + plano.atualizar.length + " atualizada(s)!");
        ctx.recarregar();
      } }
    ] });
    if (arquivoPre) ler(arquivoPre);
  };

  /* ---------- a tela ---------- */
  F.telas.ml = function (ctx) {
    const raiz = h("div"), fx = ctx.faixa;
    if (!ctx.mlOk) {
      raiz.append(F.aviso("A tabela das vendas do Mercado Livre ainda não existe no Supabase. Use a faixa amarela no topo (\"Copiar o SQL\"), cole no SQL Editor do projeto \"niellypinheiro portfólio\" e clique em Run. Depois atualize esta página.", "erro"));
      return raiz;
    }
    ctx.estadoML = ctx.estadoML || { filtro: "validas", busca: "" };
    const e = ctx.estadoML, todas = ctx.vendasML || [];
    const dentro = (x, a, b) => x.data_venda && x.data_venda >= a && x.data_venda <= b;
    const per = todas.filter((x) => dentro(x, fx.ini, fx.fim)), ant = todas.filter((x) => dentro(x, fx.ant.ini, fx.ant.fim));
    const val = (l) => l.filter((x) => !F.vendaCancelada(x));
    const pv = val(per), av = val(ant);
    const fat = soma(pv, (x) => x.receita_produtos), fatAnt = soma(av, (x) => x.receita_produtos);
    const tarifas = Math.abs(soma(pv, (x) => x.tarifa_venda + x.tarifa_envio)), liq = soma(pv, (x) => x.total), liqAnt = soma(av, (x) => x.total);
    const cancelados = per.length - pv.length;

    if (!todas.length) {
      raiz.append(F.cartao("Nenhuma venda importada ainda", h("div", null,
        h("p", { text: "No Mercado Livre, vá em Vendas, baixe a planilha (Excel) e clique em Importar vendas aqui em cima. Você não precisa abrir a planilha: as informações ficam guardadas no painel." }),
        h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoML(ctx) }, P.ic("subir"), "Importar vendas"))));
      return raiz;
    }

    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile("t-azul", "Vendas", String(pv.length), cancelados ? cancelados + " cancelada(s) ou devolvida(s)" : fx.rotulo, F.variacao(pv.length, av.length)),
      F.tile("t-ouro", "Faturamento (produtos)", F.dinheiro(fat), "unidades: " + soma(pv, (x) => x.unidades || 0), F.variacao(fat, fatAnt)),
      F.tile("t-vinho", "Tarifas e frete", F.dinheiro(tarifas), fat ? F.pct((tarifas / fat) * 100, 1) + " do faturamento" : "", null),
      F.tile("t-verde", "Líquido a receber", F.dinheiro(liq), fat ? F.pct((liq / fat) * 100, 1) + " do faturamento" : "", F.variacao(liq, liqAnt))));

    /* últimos 6 meses */
    const meses = F.mesesAtras(6);
    const porMes = (campo) => meses.map((m) => dois(soma(val(todas).filter((x) => x.data_venda && x.data_venda.slice(0, 7) === m), campo)));
    const graf = F.cartao("Últimos 6 meses", F.barras(meses.map(F.mesNome), [
      { nome: "Faturamento", cor: F.CORES[0], valores: porMes((x) => x.receita_produtos) },
      { nome: "Líquido", cor: F.CORES[2], valores: porMes((x) => x.total) }]));

    /* produtos que mais vendem no período */
    const grupos = new Map();
    pv.forEach((x) => {
      const k = x.anuncio || x.sku || x.titulo || "Sem nome";
      const g = grupos.get(k) || { nome: x.titulo || x.sku || k, un: 0, fat: 0, liq: 0 };
      g.un += x.unidades || 0; g.fat += x.receita_produtos; g.liq += x.total; grupos.set(k, g);
    });
    const top = Array.from(grupos.values()).sort((a, b) => b.fat - a.fat).slice(0, 8);
    const prod = F.cartao("Produtos que mais vendem", F.tabela(["Produto", { t: "Un.", num: true }, { t: "Faturamento", num: true }, { t: "Líquido", num: true }],
      top.map((g) => h("tr", null, h("td", { class: "truncar", text: g.nome }), h("td", { class: "num", text: String(g.un) }), h("td", { class: "num", text: F.dinheiro(g.fat) }), h("td", { class: "num", text: F.dinheiro(g.liq) }))),
      "Nenhuma venda neste período."));
    raiz.append(h("div", { class: "fin-duas" }, graf, prod));

    /* lista de vendas */
    const busca = h("input", { type: "search", placeholder: "Buscar por produto, nº da venda ou SKU", value: e.busca, "aria-label": "Buscar" });
    const tabelaBox = h("div");
    function desenharTabela() {
      P.limpar(tabelaBox);
      const q = P.semAcento(e.busca);
      let l = per.filter((x) => e.filtro === "todas" || (e.filtro === "validas" ? !F.vendaCancelada(x) : F.vendaCancelada(x)));
      if (q) l = l.filter((x) => P.semAcento([x.titulo, x.numero_venda, x.sku, x.anuncio].join(" ")).includes(q));
      l = l.slice().sort((a, b) => (a.data_venda < b.data_venda ? 1 : a.data_venda > b.data_venda ? -1 : 0));
      F.anexar(tabelaBox, F.tabela(["Data", "Venda", "Produto", { t: "Un.", num: true }, { t: "Produtos", num: true }, { t: "Tarifas e frete", num: true }, { t: "Total", num: true }, "Situação"],
        l.slice(0, 300).map((x) => {
          const canc = F.vendaCancelada(x), entregue = /entreg/.test(P.semAcento(x.status || ""));
          return h("tr", null, h("td", { class: "nw", text: P.fmtData(x.data_venda) }), h("td", { class: "nw", text: x.numero_venda }), h("td", { class: "truncar", text: x.titulo || "" }),
            h("td", { class: "num", text: x.unidades == null ? "" : String(x.unidades) }), h("td", { class: "num", text: F.dinheiro(x.receita_produtos) }),
            h("td", { class: "num", text: F.dinheiro(Math.abs(x.tarifa_venda + x.tarifa_envio)) }), h("td", { class: "num", text: F.dinheiro(x.total) }),
            h("td", { class: "nw" }, F.pilulaStatus(x.status || "Sem estado", canc ? "ruim" : entregue ? "ok" : "info")));
        }), "Nenhuma venda com esse filtro neste período."),
        l.length > 300 ? h("p", { class: "fraco", text: "Mostrando 300 de " + l.length + ". Use a busca." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { e.busca = busca.value; desenharTabela(); }, 150));
    const chip = (v, t) => h("button", { type: "button", "aria-pressed": String(e.filtro === v), text: t, onclick: () => { e.filtro = v; ctx.desenhar(); } });
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" },
      h("div", { class: "busca" }, P.ic("busca"), busca),
      h("div", { class: "filtros", role: "group", "aria-label": "Filtrar" }, chip("validas", "Válidas"), chip("canceladas", "Canceladas ou devolvidas"), chip("todas", "Todas"))), tabelaBox);
    desenharTabela();
    raiz.append(F.aviso("Estes números são só do Mercado Livre e não entram na Visão geral nem na DRE, porque a nota fiscal dessas vendas já entra pelo XML. Assim o faturamento não é somado duas vezes. Os dados pessoais do comprador (CPF, endereço, telefone) não são guardados."));
    return raiz;
  };
})();
