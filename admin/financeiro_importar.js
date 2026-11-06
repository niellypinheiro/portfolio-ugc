/* =========================================================================
   Financeiro: IMPORTAR (automático).
   Você escolhe qualquer arquivo e o painel descobre sozinho de que tipo é e
   abre a importação certa:
     - planilha de vendas do Mercado Livre      → tela Mercado Livre
     - relatório de vendas da loja (por produto) → tela Vendas da loja
     - planilha "Informe de CT-e" ou XML/ZIP de CT-e → tela Fretes (CT-e)
     - XML/ZIP de notas fiscais                  → Notas fiscais
     - contas a pagar / a receber                → Contas a pagar e a receber
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
    extrato: { nome: "Extrato bancário", onde: "tela Extrato do banco", abrir: (ctx, a) => { ctx.ir("extrato"); F.abrirImportacaoExtrato(ctx, a); } },
    amazon: { nome: "Transações da Amazon", onde: "tela Amazon", abrir: (ctx, a) => { ctx.ir("amazon"); F.abrirImportacaoAmazon(ctx, a[0]); } },
    ml: { nome: "Vendas do Mercado Livre", onde: "tela Mercado Livre", abrir: (ctx, a) => { ctx.ir("ml"); F.abrirImportacaoML(ctx, a[0]); } },
    loja: { nome: "Relatório de vendas da loja (por produto)", onde: "tela Vendas da loja", abrir: (ctx, a) => { ctx.ir("loja"); F.abrirImportacaoLoja(ctx, a[0]); } },
    cte: { nome: "Fretes (CT-e)", onde: "tela Fretes (CT-e)", abrir: (ctx, a) => { ctx.ir("cte"); F.abrirImportacaoCte(ctx, a); } },
    canal: { nome: "Relatório de notas de um canal (Shopee, Amazon, Mercado Livre...)", onde: "tela Canais de venda", abrir: (ctx, a) => { ctx.ir("canais"); F.abrirImportacaoCanal(ctx, a[0]); } },
    boletos: { nome: "Boletos em PDF", onde: "tela Boletos (PDF)", abrir: (ctx, a) => { ctx.ir("boletos"); F.abrirImportacaoBoletos(ctx, a); } },
    notas: { nome: "Notas fiscais (XML)", onde: "tela Notas fiscais", abrir: (ctx, a) => { ctx.ir("notas"); F.abrirImportacao(ctx, a); } },
    pagar: { nome: "Contas a pagar", onde: "tela Contas a pagar", abrir: (ctx, a) => { ctx.ir("pagar"); F.abrirImportacaoPlanilha(ctx, "pagar", a[0]); } },
    receber: { nome: "Contas a receber", onde: "tela Contas a receber", abrir: (ctx, a) => { ctx.ir("receber"); F.abrirImportacaoPlanilha(ctx, "receber", a[0]); } }
  };
  function detectarPlanilha(abas) {
    const todas = abas.map((a) => a.linhas.filter((l) => l.some((v) => String(v).trim() !== "")));
    if (todas.some((l) => F.pareceCte && F.pareceCte(l))) return "cte";
    if (todas.some((l) => F.pareceAmazon && F.pareceAmazon(l))) return "amazon";
    if (todas.some((l) => F.pareceMercadoLivre && F.pareceMercadoLivre(l))) return "ml";
    if (todas.some((l) => F.pareceVendasLoja && F.pareceVendasLoja(l))) return "loja";
    if (todas.some(pareceContas)) return "contas";
    if (todas.some((l) => F.pareceExtrato && F.pareceExtrato(l))) return "extrato";
    if (todas.some((l) => F.pareceRelatorioCanal && F.pareceRelatorioCanal(l))) return "canal";
    return null;
  }

  F.importarPlanilha = function (ctx) {
    const input = h("input", { type: "file", multiple: true, accept: ".xlsx,.xls,.csv,.xml,.zip,.pdf,.ofx,.qfx,text/csv,text/xml,application/zip,application/pdf", id: "finPlanilhaAuto", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finPlanilhaAuto", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha os arquivos ou arraste até aqui" }),
      h("span", { class: "fraco", text: "Planilha (Excel ou CSV), XML, pasta .zip, boleto em PDF ou extrato do banco (OFX, Excel, CSV, PDF). Eu descubro sozinha de que tipo é." }));
    const aviso = h("p", { class: "fraco", role: "status" }), escolhas = h("div", { class: "fin-chips-cnpj" });
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Serve para: vendas do Mercado Livre, transações da Amazon, relatório de vendas da loja, fretes (CT-e), notas fiscais em XML, boletos em PDF, extratos do banco e contas a pagar ou a receber. Cada uma vai para a tela certa do Financeiro." }),
      input, zona, aviso, escolhas);
    let janela = null;

    function irPara(tipo, arquivos) {
      const d = DESTINOS[tipo];
      janela.fechar();
      d.abrir(ctx, arquivos);
    }
    function opcoes(arquivos, tipos) {
      aviso.textContent = "Não reconheci esse tipo de arquivo pelo conteúdo. Escolha para onde ele vai:";
      tipos.forEach((t) => escolhas.append(h("button", { type: "button", class: "btn", text: DESTINOS[t].nome, onclick: () => irPara(t, arquivos) })));
    }
    async function ler(lista) {
      const arquivos = Array.from(lista || []);
      if (!arquivos.length) return;
      P.limpar(escolhas); aviso.textContent = "Lendo os arquivos...";
      const planilhas = arquivos.filter((a) => /\.(xlsx?|csv)$/i.test(a.name)), xmls = arquivos.filter((a) => /\.(xml|zip)$/i.test(a.name));
      const pdfs = arquivos.filter((a) => /\.pdf$/i.test(a.name) || a.type === "application/pdf");

      /* OFX: extrato bancário */
      const ofxs = arquivos.filter((a) => /\.(ofx|qfx)$/i.test(a.name));
      if (ofxs.length) {
        if (ofxs.length !== arquivos.length) { aviso.textContent = "Escolha só extratos (OFX) ou só os outros tipos de arquivo, de cada vez."; return; }
        aviso.textContent = "Identifiquei: extrato bancário. Abrindo..."; irPara("extrato", ofxs); return;
      }
      /* PDF: boleto (tem código de barras) ou extrato bancário (só texto de lançamentos) */
      if (pdfs.length) {
        if (pdfs.length !== arquivos.length) { aviso.textContent = "Escolha só PDFs, ou só os outros tipos de arquivo, de cada vez."; return; }
        aviso.textContent = "Lendo o PDF...";
        let r;
        try { r = await F.lerPdfBoletos(pdfs[0]); }
        catch (e) { aviso.textContent = ""; P.toast(e && /carregar/.test(e.message || "") ? e.message : "Não consegui abrir esse PDF. Se ele tiver senha, salve uma cópia sem senha.", true); return; }
        if (r.boletos.length || r.semTexto) { aviso.textContent = "Identifiquei: boletos em PDF. Abrindo..."; irPara("boletos", pdfs); return; }
        aviso.textContent = "Identifiquei: extrato bancário em PDF. Abrindo..."; irPara("extrato", pdfs); return;
      }

      /* XML e pastas .zip: notas fiscais e/ou CT-e */
      if (xmls.length && !planilhas.length) {
        let r;
        try { r = await P.finXml.lerArquivos(xmls); }
        catch (e) { aviso.textContent = ""; P.toast(e && e.message ? e.message : "Não consegui abrir esses arquivos.", true); return; }
        if (r.notas.length) { aviso.textContent = "Identifiquei: notas fiscais" + (r.ctes.length ? " e fretes (CT-e)" : "") + ". Abrindo..."; irPara("notas", xmls); return; }
        if (r.ctes.length) { aviso.textContent = "Identifiquei: fretes (CT-e). Abrindo..."; irPara("cte", xmls); return; }
        opcoes(xmls, ["notas", "cte"]); return;
      }
      /* planilhas: vale a primeira; CT-e aceita várias planilhas e XML juntos */
      if (planilhas.length) {
        let abas;
        try { abas = await F.lerAbas(planilhas[0]); }
        catch (e) { aviso.textContent = ""; P.toast(e && /carregar/.test(e.message || "") ? e.message : "Não consegui ler esse arquivo. Confira se é uma planilha Excel ou CSV.", true); return; }
        const tipo = detectarPlanilha(abas);
        if (tipo === "cte") { aviso.textContent = "Identifiquei: fretes (CT-e). Abrindo..."; irPara("cte", arquivos); return; }
        if (tipo === "extrato" && !xmls.length) { aviso.textContent = "Identifiquei: extrato bancário. Abrindo..."; irPara("extrato", planilhas); return; }
        if (planilhas.length + xmls.length > 1) { aviso.textContent = "Escolha um tipo de arquivo por vez (ou só CT-e, que aceita planilha e XML juntos)."; return; }
        if (tipo === "contas") { aviso.textContent = "Identifiquei: contas a pagar ou a receber. Abrindo..."; irPara(ctx.tela === "receber" ? "receber" : "pagar", [planilhas[0]]); return; }
        if (tipo) { aviso.textContent = "Identifiquei: " + DESTINOS[tipo].nome + ". Abrindo a " + DESTINOS[tipo].onde + "..."; irPara(tipo, [planilhas[0]]); return; }
        opcoes([planilhas[0]], ["ml", "amazon", "extrato", "loja", "cte", "canal", "pagar", "receber"]);
      }
    }
    input.addEventListener("change", () => ler(input.files));
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files));
    janela = P.modal({ titulo: "Importar arquivos", corpo, botoes: [{ texto: "Cancelar" }] });
  };
})();
