/* =========================================================================
   Financeiro: IMPORTAR PLANILHA (automático).
   Você escolhe qualquer planilha e o painel descobre sozinho de que tipo ela
   é e abre a importação certa:
     - vendas do Mercado Livre   → tela Mercado Livre
     - relatório de vendas da loja (por produto) → tela Vendas da loja
     - contas a pagar / a receber → Contas a pagar e a receber
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});

  const norm = (s) => P.semAcento(String(s == null ? "" : s)).replace(/[^a-z0-9]+/g, " ").trim();
  function carregarScript(src, pronto) {
    if (pronto()) return Promise.resolve();
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = src; s.onload = () => (pronto() ? ok() : erro(new Error("biblioteca não iniciou")));
      s.onerror = () => erro(new Error("Não consegui carregar a ferramenta de leitura de Excel. Confira a internet."));
      document.head.append(s);
    });
  }
  /* devolve as abas da planilha: [{ nome, linhas }] (CSV tem uma aba só; acentos do Windows são tratados) */
  F.lerAbas = async function (arquivo) {
    if (/\.xlsx?$/i.test(arquivo.name)) {
      await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => !!window.XLSX);
      const livro = window.XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
      return livro.SheetNames.map((nome) => ({ nome, linhas: window.XLSX.utils.sheet_to_json(livro.Sheets[nome], { header: 1, defval: "", raw: true }) }));
    }
    return [{ nome: "", linhas: P.lerCSV(await P.lerArquivoTexto(arquivo)) }];
  };

  const pareceContas = (linhas) => linhas.slice(0, 15).some((l) => {
    const c = l.map(norm);
    return c.some((x) => /^(data de |data )?(vencimento|vcto|venc)$/.test(x)) && c.some((x) => /valor|total|parcela/.test(x));
  });
  const DESTINOS = {
    ml: { nome: "Vendas do Mercado Livre", onde: "tela Mercado Livre", abrir: (ctx, a) => { ctx.ir("ml"); F.abrirImportacaoML(ctx, a); } },
    loja: { nome: "Relatório de vendas da loja (por produto)", onde: "tela Vendas da loja", abrir: (ctx, a) => { ctx.ir("loja"); F.abrirImportacaoLoja(ctx, a); } },
    pagar: { nome: "Contas a pagar", onde: "tela Contas a pagar", abrir: (ctx, a) => { ctx.ir("pagar"); F.abrirImportacaoPlanilha(ctx, "pagar", a); } },
    receber: { nome: "Contas a receber", onde: "tela Contas a receber", abrir: (ctx, a) => { ctx.ir("receber"); F.abrirImportacaoPlanilha(ctx, "receber", a); } }
  };
  function detectar(abas) {
    const todas = abas.map((a) => a.linhas.filter((l) => l.some((v) => String(v).trim() !== "")));
    if (todas.some((l) => F.pareceMercadoLivre && F.pareceMercadoLivre(l))) return "ml";
    if (todas.some((l) => F.pareceVendasLoja && F.pareceVendasLoja(l))) return "loja";
    if (todas.some(pareceContas)) return "contas";
    return null;
  }

  F.importarPlanilha = function (ctx) {
    const input = h("input", { type: "file", accept: ".xlsx,.xls,.csv,text/csv", id: "finPlanilhaAuto", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finPlanilhaAuto", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha a planilha ou arraste até aqui" }),
      h("span", { class: "fraco", text: "Excel (.xlsx) ou CSV. Eu descubro sozinha de que tipo ela é." }));
    const aviso = h("p", { class: "fraco", role: "status" }), escolhas = h("div", { class: "fin-chips-cnpj" });
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Serve para: vendas do Mercado Livre, relatório de vendas da loja (por produto) e contas a pagar ou a receber. Cada uma vai para a tela certa do Financeiro." }),
      input, zona, aviso, escolhas);
    let janela = null;

    function irPara(tipo, arquivo) {
      const d = DESTINOS[tipo];
      janela.fechar();
      d.abrir(ctx, arquivo);
    }
    async function ler(arquivo) {
      if (!arquivo) return;
      P.limpar(escolhas); aviso.textContent = "Lendo a planilha...";
      let abas;
      try { abas = await F.lerAbas(arquivo); }
      catch (e) { aviso.textContent = ""; P.toast(e && /carregar/.test(e.message || "") ? e.message : "Não consegui ler esse arquivo. Confira se é uma planilha Excel ou CSV.", true); return; }
      const tipo = detectar(abas);
      if (tipo === "contas") {
        /* contas pode ser a pagar ou a receber: o painel de contas usa a coluna "Tipo" da planilha, e senão o que for escolhido ali */
        aviso.textContent = "Identifiquei: contas a pagar ou a receber. Abrindo...";
        irPara(ctx.tela === "receber" ? "receber" : "pagar", arquivo);
        return;
      }
      if (tipo) { aviso.textContent = "Identifiquei: " + DESTINOS[tipo].nome + ". Abrindo a " + DESTINOS[tipo].onde + "..."; irPara(tipo, arquivo); return; }
      aviso.textContent = "Não reconheci esse tipo de planilha pelos títulos das colunas. Escolha para onde ela vai:";
      ["ml", "loja", "pagar", "receber"].forEach((t) => escolhas.append(h("button", { type: "button", class: "btn", text: DESTINOS[t].nome, onclick: () => irPara(t, arquivo) })));
    }
    input.addEventListener("change", () => ler(input.files[0]));
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
    janela = P.modal({ titulo: "Importar planilha", corpo, botoes: [{ texto: "Cancelar" }] });
  };
})();
