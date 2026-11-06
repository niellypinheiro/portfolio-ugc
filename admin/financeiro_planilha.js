/* =========================================================================
   Financeiro: importar planilha (Excel .xlsx/.xls ou CSV) de contas a pagar
   e a receber. Reconhece as colunas pelo título da primeira linha, mostra
   uma prévia e não duplica o que já está lançado.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});

  const ALIAS = {
    descricao: ["descricao", "historico", "lancamento", "despesa", "conta", "item", "nome", "detalhe", "referente", "titulo"],
    pessoa: ["fornecedor", "cliente", "favorecido", "pessoa", "beneficiario", "pagador", "origem", "empresa", "pagar a", "receber de"],
    categoria: ["categoria", "grupo", "classificacao", "tipo de despesa", "tipo de receita", "centro de custo", "natureza"],
    valor: ["valor", "valor total", "total", "quantia", "montante", "vlr", "valor da parcela", "parcela"],
    vencimento: ["vencimento", "data de vencimento", "data vencimento", "vcto", "venc", "data venc", "dt vencimento"],
    pagamento: ["pagamento", "data de pagamento", "data pagamento", "pago em", "recebimento", "data de recebimento", "data recebimento", "baixa", "quitacao", "data da baixa"],
    forma: ["forma de pagamento", "forma", "meio de pagamento", "meio"],
    banco: ["banco", "conta bancaria", "conta corrente", "caixa"],
    obs: ["obs", "observacao", "observacoes", "anotacao", "anotacoes", "nota", "notas", "comentario"],
    situacao: ["situacao", "status", "pago", "quitado"],
    tipo: ["tipo", "pagar/receber", "pagar ou receber", "entrada/saida", "movimento", "operacao"],
    data: ["data", "dia", "data do lancamento", "data lancamento"]
  };
  const ORDEM = ["vencimento", "pagamento", "forma", "banco", "valor", "pessoa", "categoria", "obs", "situacao", "tipo", "descricao", "data"];

  const norm = (s) => P.semAcento(String(s == null ? "" : s)).replace(/\s+/g, " ").trim();
  function carregarScript(src, pronto) {
    if (pronto()) return Promise.resolve();
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = src; s.onload = () => (pronto() ? ok() : erro(new Error("biblioteca não iniciou")));
      s.onerror = () => erro(new Error("Não consegui carregar a ferramenta de leitura de Excel. Confira a internet."));
      document.head.append(s);
    });
  }

  function achar(cab, chave, usadas) {
    const n = cab.map(norm);
    for (const a of ALIAS[chave]) { const i = n.indexOf(a); if (i !== -1 && !usadas.has(i)) return i; }
    for (const a of ALIAS[chave]) { const i = n.findIndex((c, k) => !usadas.has(k) && c.length && c.includes(a)); if (i !== -1) return i; }
    return -1;
  }
  /* A linha de títulos nem sempre é a primeira (planilhas costumam ter um título em cima) */
  function acharCabecalho(linhas) {
    let melhor = 0, pontos = -1;
    for (let r = 0; r < Math.min(10, linhas.length); r++) {
      const n = linhas[r].map(norm);
      const p = n.filter((c) => c && Object.values(ALIAS).some((l) => l.includes(c))).length;
      if (p > pontos) { pontos = p; melhor = r; }
    }
    return pontos >= 2 ? melhor : 0;
  }

  function dataIso(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") {
      if (v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
      return null;
    }
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) {
      const ano = m[3].length === 2 ? "20" + m[3] : m[3], mes = +m[2], dia = +m[1];
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      return ano + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
    }
    return null;
  }
  function valorNum(v) {
    if (typeof v === "number") return isFinite(v) ? Math.round(Math.abs(v) * 100) / 100 : NaN;
    let s = String(v == null ? "" : v).replace(/[R$\s]/g, "").replace(/[()]/g, "").replace(/^-/, "");
    if (!s) return NaN;
    if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const x = parseFloat(s);
    return isFinite(x) ? Math.round(x * 100) / 100 : NaN;
  }
  /* Casa o que está escrito com as categorias que o painel conhece (ou mantém o texto da planilha) */
  function categoriaDe(texto, tipo, padrao) {
    const t = norm(texto);
    if (!t) return padrao;
    const lista = tipo === "pagar" ? F.CATS_PAGAR : F.CATS_RECEBER;
    const palavras = t.split(" ").filter((w) => w.length >= 4);
    const ex = lista.find((c) => norm(c) === t) || lista.find((c) => norm(c).includes(t)) ||
      (palavras.length ? lista.find((c) => palavras.every((w) => norm(c).includes(w))) : null);
    return ex || String(texto).trim().slice(0, 80);
  }
  function tipoDaLinha(v, padrao) {
    const t = norm(v);
    if (/pag|saida|despesa|custo|gasto|debito/.test(t)) return "pagar";
    if (/receb|entrada|receita|venda|credito/.test(t)) return "receber";
    return padrao;
  }

  async function lerArquivo(arquivo) {
    let linhas;
    if (/\.xlsx?$/i.test(arquivo.name)) {
      await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => !!window.XLSX);
      const livro = window.XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
      let nome = livro.SheetNames[0];
      linhas = window.XLSX.utils.sheet_to_json(livro.Sheets[nome], { header: 1, defval: "", raw: true });
      return { linhas: linhas.filter((l) => l.some((v) => String(v).trim() !== "")), aba: livro.SheetNames.length > 1 ? nome : "" };
    }
    linhas = P.lerCSV(await P.lerArquivoTexto(arquivo));
    return { linhas: linhas.filter((l) => l.some((v) => String(v).trim() !== "")), aba: "" };
  }

  F.abrirImportacaoPlanilha = function (ctx, tipoPadrao, arquivoPre) {
    let lido = null;
    const input = h("input", { type: "file", accept: ".xlsx,.xls,.csv,text/csv", id: "finPlanilha", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finPlanilha", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha a planilha ou arraste até aqui" }),
      h("span", { class: "fraco", text: "Excel (.xlsx) ou CSV. A primeira linha precisa ter os títulos das colunas." }));
    const tipoSel = h("select", { "aria-label": "Tipo das contas" },
      h("option", { value: "pagar", text: "Contas a pagar (despesas)", selected: tipoPadrao !== "receber" }),
      h("option", { value: "receber", text: "Contas a receber (receitas)", selected: tipoPadrao === "receber" }));
    const catSel = h("select", { "aria-label": "Categoria padrão" });
    function pintarCategorias() {
      const lista = tipoSel.value === "pagar" ? F.CATS_PAGAR : F.CATS_RECEBER;
      P.limpar(catSel).append(...lista.map((c, i) => h("option", { value: c, text: c, selected: i === lista.length - 1 })));
    }
    pintarCategorias();
    const previa = h("div"), progresso = h("p", { class: "fraco", role: "status" });
    const modelo = h("button", { type: "button", class: "btn", onclick: () => P.baixarCSV("modelo-contas.csv",
      ["Descrição", "Fornecedor ou cliente", "Categoria", "Valor", "Vencimento", "Pagamento", "Forma de pagamento", "Banco", "Observação"],
      [["Aluguel da loja", "Imobiliária Central", "Aluguel", "2800,00", "10/11/2026", "", "Pix", "Banco do Brasil", ""],
       ["Energia elétrica", "Companhia de Energia", "Água, energia, internet e telefone", "420,50", "15/11/2026", "15/11/2026", "Boleto", "", "Já paga"]]) }, P.ic("baixar"), "Baixar um modelo de planilha");

    const corpo = h("div", null,
      h("p", { class: "dica", text: "Traga despesas ou recebimentos que hoje estão numa planilha. Eu reconheço as colunas pelo título (descrição, fornecedor ou cliente, categoria, valor, vencimento, pagamento, forma, banco, observação) e não repito o que já está lançado." }),
      h("div", { class: "grade2" }, P.campo("Esta planilha é de", tipoSel, "Se a planilha tiver uma coluna \"Tipo\" com pagar/receber (ou entrada/saída), uso a coluna em cada linha."), P.campo("Categoria das linhas sem categoria", catSel)),
      input, zona, h("div", { style: "margin-top:8px" }, modelo), progresso, previa);

    function montar() {
      const tipoBase = tipoSel.value, padraoCat = catSel.value;
      const linhas = lido.linhas, ic = acharCabecalho(linhas), cab = linhas[ic].map((c) => String(c));
      const usadas = new Set(), idx = {};
      ORDEM.forEach((k) => { idx[k] = achar(cab, k, usadas); if (idx[k] !== -1) usadas.add(idx[k]); });
      if (idx.vencimento === -1 && idx.data !== -1) idx.vencimento = idx.data;
      const celula = (l, k) => (idx[k] === -1 ? "" : l[idx[k]]);
      const ok = [], invalidas = [];
      linhas.slice(ic + 1).forEach((l, n) => {
        const desc = String(celula(l, "descricao") == null ? "" : celula(l, "descricao")).trim();
        const valor = valorNum(celula(l, "valor")), venc = dataIso(celula(l, "vencimento")), pago = dataIso(celula(l, "pagamento"));
        const num = ic + 2 + n;   /* número da linha na planilha */
        if (!desc && isNaN(valor) && !venc) return;
        if (/^total/.test(norm(desc))) return;
        if (!desc) { invalidas.push("Linha " + num + ": falta a descrição."); return; }
        if (isNaN(valor)) { invalidas.push("Linha " + num + " (" + desc.slice(0, 30) + "): valor não entendido."); return; }
        if (!venc && !pago) { invalidas.push("Linha " + num + " (" + desc.slice(0, 30) + "): falta a data de vencimento."); return; }
        const tipo = idx.tipo !== -1 ? tipoDaLinha(celula(l, "tipo"), tipoBase) : tipoBase;
        let pagamento = pago;
        const sit = norm(celula(l, "situacao"));
        if (!pagamento && idx.situacao !== -1 && /^(pago|paga|recebido|recebida|quitado|quitada|sim|ok)$/.test(sit)) pagamento = venc;
        ok.push({ tipo, descricao: desc.slice(0, 200), pessoa: String(celula(l, "pessoa") || "").trim().slice(0, 200) || null,
          categoria: categoriaDe(celula(l, "categoria"), tipo, tipo === tipoBase ? padraoCat : (tipo === "pagar" ? F.CATS_PAGAR : F.CATS_RECEBER).slice(-1)[0]), valor, vencimento: venc || pago, pagamento: pagamento || null,
          forma: String(celula(l, "forma") || "").trim().slice(0, 40) || null, conta: String(celula(l, "banco") || "").trim().slice(0, 80) || null,
          obs: String(celula(l, "obs") || "").trim().slice(0, 1000) || null });
      });
      const chave = (x) => [x.tipo, norm(x.descricao), x.valor.toFixed(2), x.vencimento].join("|");
      const ja = new Set(ctx.lancs.map((x) => chave(x))), vistos = new Set(), novas = [], repetidas = [];
      ok.forEach((x) => { const k = chave(x); if (ja.has(k) || vistos.has(k)) repetidas.push(x); else { vistos.add(k); novas.push(x); } });
      lido.plano = { novas, repetidas, invalidas, idx, cab };
      desenharPrevia();
    }
    function desenharPrevia() {
      P.limpar(previa);
      if (!lido || !lido.plano) return;
      const p = lido.plano, reconhecidas = Object.entries(p.idx).filter(([k, i]) => i !== -1 && k !== "data").map(([k]) => k);
      const NOMES = { descricao: "descrição", pessoa: "fornecedor/cliente", categoria: "categoria", valor: "valor", vencimento: "vencimento", pagamento: "pagamento", forma: "forma", banco: "banco", obs: "observação", situacao: "situação", tipo: "tipo" };
      const pagar = p.novas.filter((x) => x.tipo === "pagar"), receber = p.novas.filter((x) => x.tipo === "receber");
      F.anexar(previa,
        h("div", { class: "fin-impo-res", style: "margin-top:12px" },
          h("div", null, h("b", { text: String(p.novas.length) }), h("span", { text: "novas para importar" })),
          h("div", null, h("b", { text: String(pagar.length) }), h("span", { text: "a pagar (" + F.dinheiro(F.soma(pagar, (x) => x.valor)) + ")" })),
          h("div", null, h("b", { text: String(receber.length) }), h("span", { text: "a receber (" + F.dinheiro(F.soma(receber, (x) => x.valor)) + ")" })),
          h("div", null, h("b", { text: String(p.repetidas.length) }), h("span", { text: "já estavam lançadas" }))),
        h("p", { class: "dica", text: "Colunas que reconheci: " + (reconhecidas.map((k) => NOMES[k]).join(", ") || "nenhuma") + "." + (lido.aba ? " (aba \"" + lido.aba + "\")" : "") }),
        p.idx.valor === -1 || (p.idx.vencimento === -1 && p.idx.pagamento === -1) ? h("p", { class: "aviso-pagina erro", text: "Não achei a coluna de valor ou de vencimento. Confira os títulos da primeira linha (por exemplo: Valor e Vencimento) ou baixe o modelo." }) : null,
        p.invalidas.length ? h("div", { class: "aviso-pagina" }, h("b", { text: p.invalidas.length + " linha(s) não serão importadas" }), p.invalidas.slice(0, 5).map((t) => h("p", { text: t })), p.invalidas.length > 5 ? h("p", { text: "e mais " + (p.invalidas.length - 5) + "..." }) : null) : null,
        p.novas.length ? F.tabela(["Vencimento", "Descrição", "Tipo", "Categoria", { t: "Valor", num: true }, "Pago em"],
          p.novas.slice(0, 8).map((x) => h("tr", null, h("td", { class: "nw", text: P.fmtData(x.vencimento) }), h("td", { class: "truncar", text: x.descricao }), h("td", { class: "nw", text: x.tipo === "pagar" ? "A pagar" : "A receber" }),
            h("td", { class: "truncar", text: x.categoria || "" }), h("td", { class: "num", text: F.dinheiro(x.valor) }), h("td", { class: "nw", text: x.pagamento ? P.fmtData(x.pagamento) : "" })))) : null,
        p.novas.length > 8 ? h("p", { class: "dica", text: "Mostrando 8 de " + p.novas.length + "." }) : null);
    }
    async function ler(arquivo) {
      if (!arquivo) return;
      progresso.textContent = "Lendo a planilha...";
      try { lido = await lerArquivo(arquivo); }
      catch (e) { progresso.textContent = ""; P.toast(e && /carregar/.test(e.message || "") ? e.message : "Não consegui ler esse arquivo. Confira se é uma planilha Excel ou CSV.", true); return; }
      if (lido.linhas.length < 2) { progresso.textContent = ""; lido = null; P.toast("Não encontrei linhas com contas nessa planilha.", true); return; }
      progresso.textContent = (lido.linhas.length - 1) + " linha(s) lidas de " + arquivo.name + ".";
      if (F.pareceMercadoLivre && F.pareceMercadoLivre(lido.linhas)) {
        lido = null; P.limpar(previa);
        progresso.textContent = "Essa planilha parece ser de vendas do Mercado Livre. Feche esta janela, abra a tela \"Mercado Livre\" aqui no Financeiro e use o botão de importar vendas.";
        return;
      }
      montar();
    }
    input.addEventListener("change", () => ler(input.files[0]));
    tipoSel.addEventListener("change", () => { pintarCategorias(); if (lido) montar(); });
    catSel.addEventListener("change", () => { if (lido) montar(); });
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));

    P.modal({ titulo: "Importar planilha de contas", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Importar", classe: "p", aoClicar: async () => {
        if (!lido || !lido.plano) { P.toast("Escolha a planilha primeiro.", true); return false; }
        const novas = lido.plano.novas;
        if (!novas.length) { P.toast("Não há nenhuma conta nova para importar.", true); return false; }
        let feitas = 0;
        for (let i = 0; i < novas.length; i += 200) {
          const r = await P.gravar(() => window.sb.from("fin_lancamentos").insert(novas.slice(i, i + 200)));
          if (!r.ok) { P.toast("Parei no meio: " + feitas + " contas foram importadas. Rode de novo para continuar (as repetidas são puladas).", true); ctx.recarregar(); return false; }
          feitas += Math.min(200, novas.length - i);
        }
        P.toast(feitas + (feitas === 1 ? " conta importada" : " contas importadas") + "!");
        ctx.recarregar();
      } }
    ] });
    if (arquivoPre) ler(arquivoPre);
  };
})();
