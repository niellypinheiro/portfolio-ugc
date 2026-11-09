/* =========================================================================
   Financeiro: DÍVIDAS E IMPOSTOS EM ABERTO (as pendências da contabilidade).
   Você sobe o PDF que a contabilidade mandou (da Provision e da Smart Brand)
   e o painel lê cada pendência: qual imposto, de que mês, quando venceu e
   quanto é. Tudo fica separado por empresa, e dá para ver quanto cada uma
   está devendo, o que já venceu e o que vence logo.

   O painel descobre de qual empresa é o PDF pelo CNPJ ou pelo nome escrito
   nele. Cada pendência aparece numa prévia para você conferir e corrigir
   antes de importar. O PDF em si não é guardado, só os dados.
   Fica numa tela própria e não entra na DRE.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});
  F.telas = F.telas || {};

  const norm = (s) => P.semAcento(String(s == null ? "" : s)).replace(/[^a-z0-9]+/g, " ").trim();
  const dois = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const SITUACOES = { aberta: "Em aberto", parcelada: "Parcelada", paga: "Paga" };
  const TRIBUTOS = ["DAS (Simples Nacional)", "DARF", "IRPJ", "CSLL", "PIS", "COFINS", "ICMS", "ISS", "INSS / GPS", "FGTS", "IPI", "Parcelamento", "Dívida ativa", "Multa", "Outro imposto"];
  const TIPOS = [
    [/parcelamento|\bparcela\b/, "Parcelamento"], [/divida ativa|pgfn|inscricao/, "Dívida ativa"],
    [/simples nacional|\bdas\b|pgdas|das mei|\bmei\b/, "DAS (Simples Nacional)"], [/\bdarf\b/, "DARF"], [/\birpj\b|imposto de renda/, "IRPJ"], [/\bcsll\b|contribuicao social/, "CSLL"],
    [/\bpis\b|pasep/, "PIS"], [/cofins/, "COFINS"], [/\bicms\b/, "ICMS"], [/\biss\b|issqn/, "ISS"], [/\binss\b|\bgps\b|previdenci/, "INSS / GPS"], [/fgts/, "FGTS"], [/\bipi\b/, "IPI"],
    [/multa|dctf|defis|sped|declaracao|obrigacao acessoria/, "Multa"]
  ];
  const tributoDe = (t) => { const n = norm(t); for (const [re, nome] of TIPOS) if (re.test(n)) return nome; return ""; };

  /* ---------- ler o PDF ---------- */
  const RE_VALOR = /\d{1,3}(?:\.\d{3})*,\d{2}/g, RE_DATA = /(\d{2})\/(\d{2})\/(\d{4})/g, RE_COMP = /(?<![\d\/])(0[1-9]|1[0-2])\/(20\d{2})(?![\d\/])/;
  const valorNum = (s) => parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  const isoData = (d, m, a) => (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31 ? a + "-" + m + "-" + d : null);

  /* de qual empresa é o PDF: pelo CNPJ (inteiro ou só a raiz) ou pelo nome escrito nele */
  function empresaDoTexto(ctx, texto, nomeArquivo) {
    const t = texto, tn = norm(texto), nomes = F.nomesEmpresas ? F.nomesEmpresas(ctx) : new Map();
    const digArq = String(nomeArquivo || "").replace(/\D/g, ""), nomeArq = norm(nomeArquivo || "");
    let melhor = "", pontos = 0;
    F.meusCnpjs(ctx).forEach((d) => {
      let p = 0;
      /* aceita o CNPJ com ou sem pontos, barra e traço (alguns PDFs perdem o traço) */
      const sep = "\\D{0,2}", raiz = d.slice(0, 2) + sep + d.slice(2, 5) + sep + d.slice(5, 8);
      if (new RegExp(raiz + sep + d.slice(8, 12) + sep + d.slice(12)).test(t)) p += 10;
      else if (new RegExp(raiz).test(t)) p += 6;
      if (digArq.includes(d)) p += 10;
      const nome = norm(nomes.get(d) || "").replace(/\b(ltda|me|eireli|epp|s a)\b/g, "").trim();
      if (nome.length >= 5 && tn.includes(nome)) p += 6;
      const primeira = nome.split(" ")[0];
      if (primeira && primeira.length >= 5 && nomeArq.includes(primeira)) p += 3;
      if (p > pontos) { pontos = p; melhor = d; }
    });
    return melhor;
  }

  /* ---- os formatos de PDF que a contabilidade e os órgãos mandam ---- */
  const VAL = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}", DT = "\\d{2}\\/\\d{2}\\/\\d{4}";
  const RE_SIEF = new RegExp("^(?:\\d{4}-\\d{2}\\s*-?\\s*)?(.*?)\\s*(?<![\\d\\/])(0[1-9]|1[0-2])\\/(20\\d{2})\\s+(" + DT + ")\\s+((?:" + VAL + "\\s*){2,})(.*)$");
  const RE_MUN_EX = new RegExp("^(\\d{3,4})\\s*[–-]\\s*(.+?)\\s+\\d{3,}\\/\\d{4}\\s+\\d{1,3}\\s+(" + DT + ")\\s+(.*?)((?:" + VAL + "\\s*){2,})$");
  const RE_MUN_DA = new RegExp("^(\\d{5,7})\\s+\\d{3,}\\/\\d{4}\\s+(" + DT + ")\\s+((?:" + VAL + "\\s*){3,})$");
  const RE_PGFN = /^(\d{2}\.\d\.\d{2}\.\d{6}-?)\s*(.*)$/;
  const RE_PARC = new RegExp("^(\\d{1,3})\\s+(" + DT + ")\\s+(.*?)((?:" + VAL + "\\s*)+)\\s*(Vencido|A\\s*Vencer|Pago|Quitado)?\\s*$", "i");
  const soValores = (s) => (String(s).match(RE_VALOR) || []);
  const dataIsoDe = (s) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s); return m ? isoData(m[1], m[2], m[3]) || "" : ""; };
  function nomeTributo(txt) {
    const bruto = String(txt || "").replace(/^\d{4}-\d{2}\s*-?\s*/, "").replace(/\s+/g, " ").trim(), n = norm(bruto);
    if (/^simples( nac\w*)?$/.test(n) || /simples nac/.test(n)) return "DAS (Simples Nacional)";
    if (/cp segur/.test(n)) return "CP-Segurados (INSS)";
    if (/cp patron/.test(n)) return "CP-Patronal (INSS)";
    return tributoDe(bruto) || bruto;
  }

  /* leitura "inteligente": reconhece as linhas de tabela dos formatos que já vi.
     Devolve null se não achar nenhuma, e aí vale a leitura genérica abaixo. */
  function pendenciasEstruturadas(paginas) {
    const linhas = paginas.flat().map((l) => String(l).replace(/\s+/g, " ").trim()).filter(Boolean);
    const itens = [], totais = [];
    let nomeMun = "", tituloDA = "";
    linhas.forEach((t, i) => {
      const n = norm(t), prox = linhas[i + 1] || "";
      if (/^total\b/.test(n)) { soValores(t).forEach((v) => totais.push(dois(valorNum(v)))); return; }
      /* títulos de seção */
      let m = /^d[ií]vida ativa municipal\s*[–-]\s*(.+)$/i.exec(t); if (m) { tituloDA = m[1]; return; }
      m = /^(\d{4})\s*([A-Za-zÀ-ú].*)$/.exec(t); if (m && !/\d,\d{2}/.test(t) && !/\d{2}\/\d{2}\/\d{4}/.test(t)) { nomeMun = m[2].trim(); return; }
      const sit = /\b(pago|paga|quitad|liquidad)/.test(n) ? "paga" : "aberta";
      /* Receita Federal: tributo, competência (PA), vencimento e valores; o último valor é o saldo consolidado */
      m = RE_SIEF.exec(t);
      if (m) {
        let nome = m[1].replace(/\s+/g, " ").trim();
        if (/^simples$/i.test(nome) && /^nacional$/i.test(prox)) nome = "Simples Nacional";
        const vs = soValores(m[5]), cons = dois(valorNum(vs[vs.length - 1]));
        if (cons > 0) itens.push({ tributo: nomeTributo(nome) || "Imposto federal", descricao: [nome, m[6] && m[6].trim(), vs.length >= 5 ? "original " + vs[0] + ", multa " + vs[2] + ", juros " + vs[3] : ""].filter(Boolean).join(" | ").slice(0, 300), competencia: m[3] + "-" + m[2], vencimento: dataIsoDe(m[4]), valor: cons, situacao: sit });
        return;
      }
      /* Prefeitura: tributos do exercício (a segunda linha completa o nome) */
      m = RE_MUN_EX.exec(t);
      if (m) {
        let nome = m[2].trim();
        if (prox && !/\d{2}\/\d{2}\/\d{4}|\d,\d{2}/.test(prox) && prox.split(" ").length <= 5) nome += " " + prox.replace(/\bvencer\b/i, "").trim();
        const vs = soValores(m[5]), tot = dois(valorNum(vs[vs.length - 1]));
        if (tot > 0) itens.push({ tributo: (tributoDe(nome) || nome.replace(/\s+/g, " ").trim()) + " (Prefeitura)", descricao: "Código " + m[1] + " - " + nome.trim(), competencia: "", vencimento: dataIsoDe(m[3]), valor: tot, situacao: sit });
        return;
      }
      /* Prefeitura: dívida ativa */
      m = RE_MUN_DA.exec(t);
      if (m) {
        const vs = soValores(m[3]), tot = dois(valorNum(vs[vs.length - 1]));
        if (tot > 0) itens.push({ tributo: "Dívida ativa municipal (Prefeitura)", descricao: ("Inscrição " + m[1] + (tituloDA ? " - " + tituloDA : "")).slice(0, 300), competencia: "", vencimento: dataIsoDe(m[2]), valor: tot, situacao: sit });
        return;
      }
      /* PGFN: inscrições em dívida ativa da União (o valor é o último número da linha) */
      m = RE_PGFN.exec(t);
      if (m) {
        const vs = soValores(t), tot = vs.length ? dois(valorNum(vs[vs.length - 1])) : 0, suf = /^(\d{1,2})\b/.exec(prox);
        const natureza = (m[2].split(/\s+\d{3,4}\s*[–-]/)[0] || "").trim();
        if (tot > 0) itens.push({ tributo: "Dívida ativa (PGFN)", descricao: ("Inscrição " + m[1] + (suf && /-$/.test(m[1]) ? suf[1] : "") + (natureza ? " - " + natureza : "")).slice(0, 300), competencia: "", vencimento: "", valor: tot, situacao: sit });
        return;
      }
      /* parcelas do extrato da Prefeitura: nº da parcela, vencimento, valores e situação */
      m = RE_PARC.exec(t);
      if (m && nomeMun) {
        const vs = soValores(m[4]), tot = vs.length ? dois(valorNum(vs[vs.length - 1])) : 0;
        if (tot > 0) itens.push({ tributo: nomeMun.replace(/\s+/g, " ").trim() + " (Prefeitura)", descricao: "Parcela " + m[1], competencia: "", vencimento: dataIsoDe(m[2]), valor: tot, situacao: m[5] && /pago|quitado/i.test(m[5]) ? "paga" : sit });
      }
    });
    return itens.length ? { itens, totais } : null;
  }

  /* leitura genérica (para PDFs de outro formato): cada linha com valor em reais e (uma data ou uma competência ou o nome de um imposto) */
  function pendenciasDasLinhas(paginas) {
    const est = pendenciasEstruturadas(paginas);
    if (est) return { itens: est.itens, totais: est.totais };
    const r = pendenciasGenericas(paginas);
    return { itens: r.itens, totais: r.totalPdf != null ? [r.totalPdf] : [] };
  }
  function pendenciasGenericas(paginas) {
    const linhas = paginas.flat(), itens = [];
    let totalPdf = null;
    linhas.forEach((linha, i) => {
      const vals = linha.match(RE_VALOR);
      if (!vals) return;
      const n = norm(linha);
      if (/^total\b|\btotal geral\b|total (devedor|da divida|do debito|a pagar)/.test(n)) { totalPdf = valorNum(vals[vals.length - 1]); return; }
      if (/^(saldo|valor) (original|principal)?\s*$/.test(n)) return;
      const datas = []; let m; RE_DATA.lastIndex = 0;
      while ((m = RE_DATA.exec(linha))) { const iso = isoData(m[1], m[2], m[3]); if (iso) datas.push(iso); }
      const semDatas = linha.replace(RE_DATA, " "), comp = semDatas.match(RE_COMP), tipo = tributoDe(linha);
      if (!datas.length && !comp && !tipo) return;
      if (/\b(cnpj|cpf|pagina|emitido|data de emissao|consulta|impresso)\b/.test(n) && !tipo) return;
      let desc = linha.replace(RE_DATA, " ").replace(RE_VALOR, " ").replace(RE_COMP, " ").replace(/\bR\$/g, " ").replace(/\s+/g, " ").trim();
      if (desc.length < 3 && i > 0) desc = linhas[i - 1].replace(RE_VALOR, " ").replace(/\s+/g, " ").trim();
      const valor = dois(valorNum(vals[vals.length - 1]));
      if (!(valor > 0)) return;
      const situacao = /\b(pago|paga|quitad|liquidad)/.test(n) ? "paga" : /parcelad/.test(n) ? "parcelada" : "aberta";
      itens.push({ tributo: tipo || (desc.slice(0, 60) || "Imposto"), descricao: desc.slice(0, 300), competencia: comp ? comp[2] + "-" + comp[1] : "", vencimento: datas.length ? datas[datas.length - 1] : "", valor, situacao });
    });
    return { itens, totalPdf };
  }
  /* o painel usa isto para saber se um PDF parece ser de pendências (e não boleto nem extrato) */
  F.pareceDividaPdf = function (paginas) {
    const txt = norm(paginas.flat().join(" "));
    const palavras = (txt.match(/pendencia|situacao fiscal|debito|saldo devedor|em aberto|divida ativa|parcelamento|darf|\bdas\b|competencia|periodo de apuracao|simples nacional|receita federal|pgfn|a recolher/g) || []).length;
    const extratoLike = paginas.flat().filter((l) => /^\s*\d{2}[\/\-]\d{2}(?:[\/\-]\d{2,4})?\s+.*\d,\d{2}\s+-?\d[\d.]*,\d{2}\s*$/.test(l)).length;
    return palavras >= 2 && extratoLike < 3;
  };

  /* ---------- janela de importação ---------- */
  F.abrirImportacaoDividas = function (ctx, arquivosPre) {
    const nomes = F.nomesEmpresas ? F.nomesEmpresas(ctx) : new Map();
    const lidos = [];   /* { nome, doc, itens, totalPdf, vazio } */
    const falhas = [];
    const input = h("input", { type: "file", multiple: true, accept: ".pdf,application/pdf", id: "finDividasPdf", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finDividasPdf", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha os PDFs das pendências ou arraste até aqui" }),
      h("span", { class: "fraco", text: "Pode subir o da Provision e o da Smart Brand juntos. Eu descubro a empresa de cada um." }));
    const progresso = h("p", { class: "fraco", role: "status" }), lista = h("div");
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Suba o PDF de pendências que a contabilidade mandou (impostos em aberto, parcelamentos, DAS, DARF...). Eu leio cada pendência e separo por empresa. O PDF é lido no seu computador e não é guardado, só os dados. Confira tudo antes de importar." }),
      input, zona, progresso, lista);
    const chave = (it) => [it.empresa_doc || "", norm(it.tributo), it.competencia || "", it.vencimento || "", it.valor.toFixed(2)].join("|");
    const jaTem = new Set((ctx.pendencias || []).map((x) => [x.empresa_doc || "", norm(x.tributo), x.competencia || "", x.vencimento || "", Number(x.valor).toFixed(2)].join("|")));

    function opcoesEmpresa(sel, valor) {
      return [h("option", { value: "", text: "Escolha a empresa", selected: !valor })].concat(Array.from(nomes.entries()).map(([d, n]) => h("option", { value: d, text: n, selected: d === valor })));
    }
    /* compara a soma lida com os totais que o próprio PDF informa */
    function conferencia(arq) {
      const lidas = soma(arq.itens.filter((x) => x.valor > 0), (x) => x.valor), tot = arq.totais || [];
      if (!tot.length || !lidas) return null;
      const bate = tot.find((t) => Math.abs(t - lidas) < 0.02);
      if (bate != null) return h("p", { class: "fin-boleto-nota info", text: "Conferido: as pendências lidas somam " + F.dinheiro(lidas) + ", o mesmo total que está no PDF." });
      const unicos = Array.from(new Set(tot)).slice(0, 6).map((t) => F.dinheiro(t)).join(", ");
      return h("p", { class: "fin-boleto-nota aviso", text: "As pendências lidas somam " + F.dinheiro(lidas) + ". Os totais que aparecem no PDF são: " + unicos + ". Se nenhum for igual, olhe se faltou ou sobrou alguma linha." });
    }
    function desenhar() {
      P.limpar(lista);
      if (falhas.length) lista.append(h("div", { class: "aviso-pagina" }, h("b", { text: "Arquivo(s) com problema" }), falhas.map((t) => h("p", { text: t }))));
      lidos.forEach((arq) => {
        const selEmp = h("select", { "aria-label": "Empresa do arquivo " + arq.nome, onchange: () => { arq.doc = selEmp.value; arq.itens.forEach((it) => { it.empresa_doc = arq.doc; it.dup = jaTem.has(chave(it)); it.incluir = !it.dup; }); desenhar(); } }, opcoesEmpresa(null, arq.doc));
        const marcados = arq.itens.filter((x) => x.incluir);
        lista.append(h("div", { class: "fin-divida-arq" },
          h("div", { class: "fin-boleto-topo" }, h("b", { text: arq.nome }), h("span", { class: "fraco", text: arq.itens.length + " pendência(s), " + F.dinheiro(soma(marcados, (x) => x.valor)) + " para importar" })),
          h("div", { class: "grade2" }, P.campo("Empresa deste arquivo", selEmp, arq.doc ? "Reconheci pelo CNPJ ou pelo nome no PDF." : "Não consegui descobrir a empresa pelo PDF. Escolha.")),
          conferencia(arq),
          arq.vazio ? h("p", { class: "fin-boleto-nota aviso", text: "Não consegui separar as pendências desse PDF (ou ele é uma imagem). Preencha à mão a linha abaixo e use \"Adicionar outra\". Se quiser, me mande o PDF que eu ajusto a leitura." }) : null,
          arq.itens.map((it) => cartao(it, arq)),
          h("button", { type: "button", class: "btn", style: "margin-top:8px", onclick: () => { arq.itens.push(novoItem(arq)); desenhar(); } }, P.ic("mais"), "Adicionar outra")));
      });
    }
    let seq = 0;
    function novoItem(arq) { return { id: ++seq, arquivo: arq.nome, empresa_doc: arq.doc, tributo: "", descricao: "", competencia: "", vencimento: "", valor: 0, situacao: "aberta", incluir: true, dup: false }; }
    function cartao(it, arq) {
      const marca = h("input", { type: "checkbox", checked: it.incluir, id: "div_" + it.id, onchange: () => { it.incluir = marca.checked; } });
      const trib = h("input", { type: "text", value: it.tributo, maxlength: "120", list: "finTributos", placeholder: "Qual imposto ou dívida", oninput: () => { it.tributo = trib.value; it.dup = jaTem.has(chave(it)); } });
      const comp = h("input", { type: "month", value: it.competencia, oninput: () => { it.competencia = comp.value; } });
      const venc = h("input", { type: "date", value: it.vencimento, oninput: () => { it.vencimento = venc.value; } });
      const valor = h("input", { type: "text", inputmode: "decimal", value: it.valor ? it.valor.toFixed(2).replace(".", ",") : "", placeholder: "0,00", oninput: () => { const v = F.lerValor(valor.value); it.valor = isNaN(v) ? 0 : v; } });
      const sit = h("select", { onchange: () => { it.situacao = sit.value; } }, Object.entries(SITUACOES).map(([v, t]) => h("option", { value: v, text: t, selected: v === it.situacao })));
      return h("div", { class: "fin-boleto" + (it.dup ? " repetido" : "") },
        h("label", { class: "fin-boleto-marca", for: "div_" + it.id }, marca, h("span", { text: "Importar esta pendência" })),
        P.campo("Imposto ou dívida", trib),
        h("div", { class: "fin-divida-grade" }, P.campo("Competência (mês)", comp), P.campo("Vencimento", venc), P.campo("Valor (R$)", valor), P.campo("Situação", sit)),
        it.descricao ? h("p", { class: "fraco", style: "margin:6px 0 0;font-size:12.5px", text: "Linha do PDF: " + it.descricao }) : null,
        it.dup ? h("p", { class: "fin-boleto-nota ruim", text: "Esta pendência já foi importada antes. Não vou repetir." }) : null,
        !it.empresa_doc ? h("p", { class: "fin-boleto-nota aviso", text: "Escolha a empresa deste arquivo lá em cima." }) : null);
    }
    corpo.append(h("datalist", { id: "finTributos" }, TRIBUTOS.map((t) => h("option", { value: t }))));

    async function ler(arquivos) {
      const pdfs = Array.from(arquivos || []).filter((a) => /\.pdf$/i.test(a.name) || a.type === "application/pdf");
      if (!pdfs.length) { P.toast("Escolha arquivos PDF.", true); return; }
      for (const a of pdfs) {
        if (lidos.some((l) => l.nome === a.name)) continue;
        progresso.textContent = "Lendo " + a.name + "...";
        let paginas;
        try { paginas = await F.linhasDoPdf(a); }
        catch (e) { const senha = e && (e.name === "PasswordException" || /password/i.test(e.message || "")); falhas.push(a.name + ": " + (senha ? "o PDF tem senha. Salve uma cópia sem senha." : e && /carregar/.test(e.message || "") ? e.message : "não consegui abrir esse PDF.")); continue; }
        if (!paginas.flat().length) { falhas.push(a.name + ": o PDF parece ser uma imagem (sem texto). Não dá para ler sozinho. Peça à contabilidade o PDF original ou preencha à mão."); lidos.push({ nome: a.name, doc: "", itens: [], totais: [], vazio: true }); lidos[lidos.length - 1].itens.push(novoItem(lidos[lidos.length - 1])); continue; }
        const doc = empresaDoTexto(ctx, paginas.flat().join("\n"), a.name), r = pendenciasDasLinhas(paginas);
        const arq = { nome: a.name, doc, itens: [], totais: r.totais, vazio: !r.itens.length };
        r.itens.forEach((x) => { const it = Object.assign(novoItem(arq), x); it.dup = jaTem.has(chave(it)); it.incluir = !it.dup; arq.itens.push(it); });
        if (!arq.itens.length) arq.itens.push(novoItem(arq));
        lidos.push(arq);
      }
      progresso.textContent = lidos.length ? "Revise as pendências abaixo e clique em Importar." : "";
      desenhar();
    }
    input.addEventListener("change", () => { ler(input.files); input.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files));

    P.modal({ titulo: "Subir pendências (PDF)", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Importar", classe: "p", aoClicar: async () => {
        /* linhas em branco (as que eu deixo para preencher à mão) são ignoradas, não travam nada */
        const marcados = lidos.flatMap((a) => a.itens).filter((x) => x.incluir);
        const preenchidos = marcados.filter((x) => x.valor > 0 || x.tributo.trim());
        preenchidos.forEach((x) => { if (!x.tributo.trim()) x.tributo = (x.descricao || "Imposto").slice(0, 60); });
        const semValor = preenchidos.filter((x) => !(x.valor > 0));
        const todos = preenchidos.filter((x) => x.valor > 0);
        if (!todos.length) { P.toast("Não há nenhuma pendência com valor marcada para importar.", true); return false; }
        /* a única coisa que não dá para adivinhar é a empresa: aponto qual arquivo precisa */
        const semEmpresa = lidos.filter((a) => a.itens.some((x) => todos.includes(x) && !x.empresa_doc));
        if (semEmpresa.length) { P.toast("Falta escolher a empresa de: " + semEmpresa.map((a) => a.nome).join(", ") + ". É só escolher na lista \"Empresa deste arquivo\".", true); return false; }
        const linhas = [], vistos = new Set();
        todos.forEach((x) => { const k = chave(x); if (vistos.has(k) || jaTem.has(k)) return; vistos.add(k);
          linhas.push({ chave: k.slice(0, 400), empresa_doc: x.empresa_doc, empresa_nome: (nomes.get(x.empresa_doc) || "").slice(0, 200), tributo: x.tributo.trim().slice(0, 120), descricao: (x.descricao || "").slice(0, 300) || null,
            competencia: x.competencia || null, vencimento: x.vencimento || null, valor: dois(x.valor), situacao: x.situacao, pagamento: null, origem: "pdf", arquivo: x.arquivo.slice(0, 200) }); });
        if (!linhas.length) { P.toast("Tudo isso já estava no painel.", true); return false; }
        const r = await P.gravar(() => window.sb.from("fin_pendencias").upsert(linhas, { onConflict: "chave", ignoreDuplicates: true }));
        if (!r.ok) return false;
        P.toast(linhas.length + " pendência(s) importadas!" + (semValor.length ? " (" + semValor.length + " sem valor ficaram de fora)" : "")); ctx.ir("dividas"); ctx.recarregar();
      } }
    ] });
    if (arquivosPre && arquivosPre.length) ler(arquivosPre);
  };

  /* ---------- editar ou adicionar à mão ---------- */
  function formulario(ctx, x) {
    const novo = !x, nomes = F.nomesEmpresas ? F.nomesEmpresas(ctx) : new Map();
    const l = x || { empresa_doc: "", tributo: "", descricao: "", competencia: "", vencimento: "", valor: "", situacao: "aberta", pagamento: "", obs: "" };
    const emp = h("select", null, h("option", { value: "", text: "Escolha a empresa", selected: !l.empresa_doc }), Array.from(nomes.entries()).map(([d, n]) => h("option", { value: d, text: n, selected: d === l.empresa_doc })));
    const trib = h("input", { type: "text", value: l.tributo, maxlength: "120", list: "finTributos2", placeholder: "Ex.: DAS (Simples Nacional)" });
    const comp = h("input", { type: "month", value: l.competencia || "" });
    const venc = h("input", { type: "date", value: l.vencimento || "" });
    const valor = h("input", { type: "text", inputmode: "decimal", value: l.valor === "" ? "" : String(l.valor).replace(".", ","), placeholder: "0,00" });
    const sit = h("select", null, Object.entries(SITUACOES).map(([v, t]) => h("option", { value: v, text: t, selected: v === l.situacao })));
    const pago = h("input", { type: "date", value: l.pagamento || "" });
    const obs = h("textarea", { maxlength: "1000", placeholder: "Anotações (opcional)" }); obs.value = l.obs || "";
    const corpo = h("div", null, P.campo("Empresa", emp), P.campo("Imposto ou dívida", trib), h("datalist", { id: "finTributos2" }, TRIBUTOS.map((t) => h("option", { value: t }))),
      h("div", { class: "grade2" }, P.campo("Competência (mês)", comp), P.campo("Vencimento", venc)),
      h("div", { class: "grade2" }, P.campo("Valor (R$)", valor), P.campo("Situação", sit)),
      P.campo("Data do pagamento", pago, "Só se já estiver paga."), P.campo("Observação", obs));
    const botoes = [{ texto: "Cancelar" }, { texto: "Salvar", classe: "p", aoClicar: async () => {
      [emp, trib, valor].forEach((c) => P.erroNoCampo(c, ""));
      const v = F.lerValor(valor.value); let ok = true;
      if (!emp.value) { P.erroNoCampo(emp, "Escolha a empresa."); ok = false; }
      if (!trib.value.trim()) { P.erroNoCampo(trib, "Escreva qual imposto ou dívida."); ok = false; }
      if (isNaN(v) || v <= 0) { P.erroNoCampo(valor, "Escreva o valor, por exemplo 1500,00."); ok = false; }
      if (!ok) return false;
      const base = { empresa_doc: emp.value, empresa_nome: (nomes.get(emp.value) || "").slice(0, 200), tributo: trib.value.trim(), competencia: comp.value || null, vencimento: venc.value || null, valor: v, situacao: sit.value,
        pagamento: sit.value === "paga" ? (pago.value || F.hoje()) : (pago.value || null), obs: obs.value.trim() || null };
      const r = novo ? await P.gravar(() => window.sb.from("fin_pendencias").insert(Object.assign(base, { chave: "manual|" + Date.now() + "|" + Math.random().toString(36).slice(2, 8), origem: "manual" })))
        : await P.gravar(() => window.sb.from("fin_pendencias").update(base).eq("id", x.id));
      if (!r.ok) return false;
      P.toast(novo ? "Pendência adicionada" : "Pendência salva"); ctx.recarregar();
    } }];
    if (!novo) botoes.unshift({ texto: "Apagar", classe: "perigo", esquerda: true, aoClicar: async () => {
      if (!(await P.confirmar('Apagar "' + x.tributo + '"? Isso não dá para desfazer.', { botao: "Apagar", perigo: true, titulo: "Apagar pendência" }))) return false;
      const r = await P.gravar(() => window.sb.from("fin_pendencias").delete().eq("id", x.id));
      if (!r.ok) return false;
      P.toast("Pendência apagada"); ctx.recarregar();
    } });
    P.modal({ titulo: novo ? "Nova pendência" : "Editar pendência", corpo, botoes });
  }

  /* ---------- a tela ---------- */
  F.telas.dividas = function (ctx) {
    const raiz = h("div"), hoje = F.hoje();
    if (!ctx.pendOk) {
      raiz.append(F.aviso("A tabela das dívidas e impostos ainda não existe no Supabase. Use a faixa amarela no topo (\"Copiar o SQL\"), cole no SQL Editor do projeto \"niellypinheiro portfólio\" e clique em Run. Depois atualize esta página.", "erro"));
      return raiz;
    }
    ctx.estadoDividas = ctx.estadoDividas || { empresa: "", filtro: "aberto", busca: "" };
    const e = ctx.estadoDividas, todas = ctx.pendencias || [], nomes = F.nomesEmpresas ? F.nomesEmpresas(ctx) : new Map();
    const nomeEmp = (d) => nomes.get(d) || (d ? F.fmtDoc(d) : "Sem empresa");
    const devendo = (x) => x.situacao !== "paga", vencida = (x) => devendo(x) && x.vencimento && x.vencimento < hoje;
    const doTexto = (x) => !e.empresa || x.empresa_doc === e.empresa;
    const abertas = todas.filter((x) => devendo(x) && doTexto(x));

    raiz.append(h("div", { class: "ferramentas" }, h("label", { class: "fraco", text: "Empresa:" }),
      h("select", { "aria-label": "Empresa", onchange: (ev) => { e.empresa = ev.target.value; ctx.desenhar(); } }, h("option", { value: "", text: "Todas as empresas" }),
        Array.from(new Set(Array.from(nomes.keys()).concat(todas.map((x) => x.empresa_doc || "")))).map((d) => h("option", { value: d, text: nomeEmp(d), selected: d === e.empresa }))),
      h("span", { class: "espaco" }),
      h("button", { type: "button", class: "btn", onclick: () => formulario(ctx, null) }, P.ic("mais"), "Adicionar à mão"),
      h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoDividas(ctx) }, P.ic("subir"), "Subir pendências (PDF)")));

    if (!todas.length) {
      raiz.append(F.cartao("Nenhuma pendência ainda", h("p", { text: "Suba o PDF de pendências que a contabilidade mandou, da Provision e da Smart Brand. Eu separo por empresa e mostro quanto você deve de imposto, o que já venceu e o que vence logo." })));
      return raiz;
    }
    const total = soma(abertas, (x) => x.valor), venc = soma(abertas.filter(vencida), (x) => x.valor);
    const em30 = soma(abertas.filter((x) => x.vencimento && x.vencimento >= hoje && x.vencimento <= F.somarMesesData(hoje, 1)), (x) => x.valor);
    const porEmp = new Map();
    todas.filter(devendo).forEach((x) => { const d = x.empresa_doc || ""; const g = porEmp.get(d) || { d, total: 0, venc: 0, n: 0 }; g.total += x.valor; g.n++; if (vencida(x)) g.venc += x.valor; porEmp.set(d, g); });
    const empList = Array.from(porEmp.values()).sort((a, b) => b.total - a.total);
    const tilesEmp = empList.slice(0, 2).map((g, i) => F.tile(i ? "t-azul" : "t-ouro", nomeEmp(g.d), F.dinheiro(g.total), g.n + " pendência(s)" + (g.venc ? ", vencido " + F.dinheiro(g.venc) : "")));
    raiz.append(h("div", { class: "fin-tiles quatro", style: "margin-top:12px" },
      F.tile(venc ? "t-vermelho" : "t-verde", "Total devendo", F.dinheiro(total), abertas.length + " pendência(s)" + (e.empresa ? " (" + nomeEmp(e.empresa) + ")" : "")),
      F.tile(venc ? "t-vermelho" : "t-verde", "Já vencido", F.dinheiro(venc), "multa e juros podem estar correndo"), tilesEmp[0] || F.tile("t-azul", "Vence em 30 dias", F.dinheiro(em30)), tilesEmp[1] || F.tile("t-vinho", "Vence em 30 dias", F.dinheiro(em30))));

    /* por imposto e por empresa */
    const colunas = Array.from(new Set(abertas.map((x) => x.empresa_doc || "")));
    const porTrib = new Map();
    abertas.forEach((x) => { const g = porTrib.get(x.tributo) || { nome: x.tributo, por: new Map(), total: 0 }; g.por.set(x.empresa_doc || "", (g.por.get(x.empresa_doc || "") || 0) + x.valor); g.total += x.valor; porTrib.set(x.tributo, g); });
    const linhas = Array.from(porTrib.values()).sort((a, b) => b.total - a.total);
    raiz.append(F.cartao("Quanto deve de cada imposto", F.tabela(["Imposto ou dívida"].concat(colunas.map((d) => ({ t: nomeEmp(d), num: true })), [{ t: "Total", num: true }]),
      linhas.map((g) => h("tr", null, h("td", { class: "truncar", text: g.nome }), colunas.map((d) => h("td", { class: "num", text: g.por.get(d) ? F.dinheiro(g.por.get(d)) : "-" })), h("td", { class: "num", style: "font-weight:600", text: F.dinheiro(g.total) }))), "Nada em aberto."), "fin-cartao-tab"));

    /* lista */
    const busca = h("input", { type: "search", placeholder: "Buscar por imposto ou observação", value: e.busca, "aria-label": "Buscar" });
    const caixa = h("div");
    function tabela() {
      P.limpar(caixa);
      const q = P.semAcento(e.busca);
      let l = todas.filter(doTexto).filter((x) => e.filtro === "todas" || (e.filtro === "aberto" && devendo(x)) || (e.filtro === "vencidas" && vencida(x)) || (e.filtro === "pagas" && x.situacao === "paga"));
      if (q) l = l.filter((x) => P.semAcento([x.tributo, x.descricao, x.obs].join(" ")).includes(q));
      l = l.slice().sort((a, b) => (a.empresa_doc || "") < (b.empresa_doc || "") ? -1 : (a.empresa_doc || "") > (b.empresa_doc || "") ? 1 : ((a.vencimento || "9") < (b.vencimento || "9") ? -1 : 1));
      F.anexar(caixa, F.tabela(["Empresa", "Imposto ou dívida", "Competência", "Vencimento", { t: "Valor", num: true }, "Situação"],
        l.slice(0, 400).map((x) => h("tr", { class: "clicavel", onclick: () => formulario(ctx, x) },
          h("td", { class: "truncar", text: nomeEmp(x.empresa_doc) }), h("td", { class: "truncar", text: x.tributo }), h("td", { class: "nw", text: x.competencia ? x.competencia.slice(5) + "/" + x.competencia.slice(0, 4) : "" }),
          h("td", { class: "nw", text: x.vencimento ? P.fmtData(x.vencimento) : "" }), h("td", { class: "num", text: F.dinheiro(x.valor) }),
          h("td", { class: "nw" }, F.pilulaStatus(vencida(x) ? "Vencida" : SITUACOES[x.situacao], vencida(x) ? "ruim" : x.situacao === "paga" ? "ok" : x.situacao === "parcelada" ? "info" : "aviso")))), "Nenhuma pendência com esse filtro."),
        l.length > 400 ? h("p", { class: "fraco", text: "Mostrando 400 de " + l.length + ". Use a busca." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { e.busca = busca.value; tabela(); }, 150));
    const chip = (v, t) => h("button", { type: "button", "aria-pressed": String(e.filtro === v), text: t, onclick: () => { e.filtro = v; ctx.desenhar(); } });
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" }, h("div", { class: "busca" }, P.ic("busca"), busca),
      h("div", { class: "filtros", role: "group", "aria-label": "Filtrar" }, chip("aberto", "Devendo"), chip("vencidas", "Vencidas"), chip("pagas", "Pagas"), chip("todas", "Todas"))), caixa);
    tabela();
    raiz.append(F.aviso("Clique numa pendência para corrigir, marcar como paga (ou parcelada) ou apagar. Esses valores ficam só nesta tela: não entram na DRE nem nas contas a pagar, para nada ser contado duas vezes. O valor pode estar sem multa e juros do dia: confira com a contabilidade antes de pagar."));
    return raiz;
  };
})();
