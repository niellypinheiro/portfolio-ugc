/* =========================================================================
   Financeiro: BOLETOS em PDF.
   Você sobe o PDF do boleto e o painel lê o código (a "linha digitável"),
   descobre o valor e o vencimento, tenta achar o beneficiário e cria a conta
   a pagar. Nada é enviado para fora: o PDF é lido aqui no seu navegador.
   Boleto de banco (47 números) e de conta de consumo/imposto (48 números).
   O PDF em si não fica guardado, só os dados da conta.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});
  F.telas = F.telas || {};

  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const BANCOS = { "001": "Banco do Brasil", "033": "Santander", "070": "BRB", "077": "Inter", "104": "Caixa", "121": "Agibank", "197": "Stone", "208": "BTG", "212": "Banco Original",
    "218": "BS2", "237": "Bradesco", "260": "Nubank", "290": "PagBank", "323": "Mercado Pago", "336": "C6 Bank", "341": "Itaú", "380": "PicPay", "403": "Cora", "422": "Safra",
    "623": "Pan", "633": "Rendimento", "637": "Sofisa", "654": "Digimais", "707": "Daycoval", "745": "Citibank", "748": "Sicredi", "756": "Sicoob", "085": "Ailos" };
  const SEGMENTOS = { "1": "Prefeitura", "2": "Saneamento", "3": "Energia elétrica e gás", "4": "Telecomunicações", "5": "Órgão do governo", "6": "Carnê", "7": "Multa de trânsito", "9": "Outros" };

  /* ---------- números do boleto ---------- */
  const mod10 = (s) => {
    let soma = 0, peso = 2;
    for (let i = s.length - 1; i >= 0; i--) { let p = (+s[i]) * peso; if (p > 9) p = Math.floor(p / 10) + (p % 10); soma += p; peso = peso === 2 ? 1 : 2; }
    return (10 - (soma % 10)) % 10;
  };
  const soma11 = (s) => { let soma = 0, peso = 2; for (let i = s.length - 1; i >= 0; i--) { soma += (+s[i]) * peso; peso = peso === 9 ? 2 : peso + 1; } return soma; };
  const mod11Banco = (s) => { const r = 11 - (soma11(s) % 11); return r === 0 || r === 10 || r === 11 ? 1 : r; };
  const mod11Conv = (s) => { const r = soma11(s) % 11; return r <= 1 ? 0 : 11 - r; };
  const isoDe = (ms) => new Date(ms).toISOString().slice(0, 10);

  /* fator de vencimento: dias desde 07/10/1997. Em 22/02/2025 voltou para 1000, então escolho a data mais perto de hoje */
  function dataDoFator(f) {
    if (!f || f < 1000) return null;
    const base = Date.UTC(1997, 9, 7), hoje = Date.now();
    const cand = [0, 9000].map((k) => base + (f + k) * 864e5);
    return isoDe(cand.sort((a, b) => Math.abs(a - hoje) - Math.abs(b - hoje))[0]);
  }
  function lerBanco(d) {   /* d = 47 números */
    const dvs = mod10(d.slice(0, 9)) === +d[9] && mod10(d.slice(10, 20)) === +d[20] && mod10(d.slice(21, 31)) === +d[31];
    const barra = d.slice(0, 4) + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
    const geral = mod11Banco(barra) === +d[32];
    return { tipo: "banco", digitos: d, confere: dvs && geral, banco: BANCOS[d.slice(0, 3)] || "Banco " + d.slice(0, 3),
      valor: Math.round(parseInt(d.slice(37, 47), 10)) / 100, vencimento: dataDoFator(parseInt(d.slice(33, 37), 10)), segmento: "" };
  }
  function lerConvenio(d) {   /* d = 48 números, começa com 8 */
    const ref = d[2], dv = ref === "8" || ref === "9" ? mod11Conv : mod10;
    const blocos = [0, 12, 24, 36].map((i) => d.slice(i, i + 12));
    const confere = blocos.every((b) => dv(b.slice(0, 11)) === +b[11]);
    const barra = blocos.map((b) => b.slice(0, 11)).join("");
    return { tipo: "convenio", digitos: d, confere, banco: SEGMENTOS[d[1]] || "Conta de consumo ou imposto", valor: Math.round(parseInt(barra.slice(4, 15), 10)) / 100, vencimento: null, segmento: d[1] };
  }
  function acharLinhas(texto) {
    const achados = [], vistos = new Set();
    const add = (r) => { if (!vistos.has(r.digitos)) { vistos.add(r.digitos); achados.push(r); } };
    /* 1) no formato certo, com pontos e espaços */
    const reB = /(?<!\d)(\d{5})[.\s]*(\d{5})\s+(\d{5})[.\s]*(\d{6})\s+(\d{5})[.\s]*(\d{6})\s+(\d)\s+(\d{14})(?!\d)/g;
    let m;
    while ((m = reB.exec(texto))) add(lerBanco(m.slice(1).join("")));
    const reC = /(?<!\d)(\d{11}[\s-]*\d)\s+(\d{11}[\s-]*\d)\s+(\d{11}[\s-]*\d)\s+(\d{11}[\s-]*\d)(?!\d)/g;
    while ((m = reC.exec(texto))) { const d = m.slice(1).join("").replace(/\D/g, ""); if (d.length === 48 && d[0] === "8") add(lerConvenio(d)); }
    /* 2) se não achou, procura qualquer sequência de números que bata com os dígitos verificadores */
    if (!achados.length) {
      (texto.match(/\d[\d.\s-]{40,90}\d/g) || []).forEach((trecho) => {
        const d = trecho.replace(/\D/g, "");
        for (let i = 0; i + 47 <= d.length; i++) { const r = lerBanco(d.slice(i, i + 47)); if (r.confere) { add(r); break; } }
        for (let i = 0; i + 48 <= d.length; i++) { if (d[i] !== "8") continue; const r = lerConvenio(d.slice(i, i + 48)); if (r.confere) { add(r); break; } }
      });
    }
    return achados;
  }

  /* ---------- texto da página ---------- */
  function dataTexto(texto) {
    const m = texto.match(/vencimento[^\d]{0,70}(\d{2})\/(\d{2})\/(\d{4})/i);
    if (!m) return null;
    const dia = +m[1], mes = +m[2], ano = +m[3];
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 2000 || ano > 2100) return null;
    return m[3] + "-" + m[2] + "-" + m[1];
  }
  function valorTexto(texto) {
    const m = texto.match(/valor\s+(?:do\s+documento|cobrado|total|a\s+pagar)[^\d]{0,40}([\d.]+,\d{2})/i);
    return m ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) : NaN;
  }
  const PALAVRAS_ROTULO = /^(ag[eê]ncia|c[oó]digo|cnpj|cpf|vencimento|data|nosso|n[uú]mero|esp[eé]cie|carteira|local|valor|uso|aceite|pagador|sacado|instru)/i;
  function limparNome(s) {
    return String(s || "").replace(/\s+/g, " ")
      .replace(/\s*[-–]?\s*(CNPJ|CPF)\b.*$/i, "").replace(/\s*[-–]?\s*\d{2}\.\d{3}\.\d{3}\/?\d{0,4}.*$/, "").replace(/\s+\d{3,5}[\/-]\d[\d.\-\/]*\s*$/, "")
      .replace(/\s+Ag[eê]ncia.*$/i, "").replace(/^[:\-\s]+|[:\-\s]+$/g, "").slice(0, 90);
  }
  function acharBeneficiario(linhas) {
    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(/^\s*(?:Benefici[aá]rio(?:\s+final)?|Cedente|Favorecido)\b\s*[:\-]?\s*(.*)$/i);
      if (!m) continue;
      let resto = m[1].trim();
      /* o resto pode ser só outros títulos de coluna (Agência, CNPJ...), então o nome está na linha de baixo */
      const palavras = resto.split(/\s+/);
      if (!resto || PALAVRAS_ROTULO.test(resto) || (palavras.length > 1 && palavras.every((w) => PALAVRAS_ROTULO.test(w) || /[\/]/.test(w) || w.length < 3))) resto = linhas[i + 1] || "";
      const nome = limparNome(resto);
      if (nome.length >= 3 && /[a-zA-ZÀ-ú]{3}/.test(nome) && !PALAVRAS_ROTULO.test(nome)) return nome;
    }
    return "";
  }
  function categoriaSugerida(nome, r) {
    const t = P.semAcento(nome || "");
    const lista = F.CATS_PAGAR;
    const tem = (c) => lista.find((x) => x === c) || c;
    if (r.tipo === "convenio") {
      if (["2", "3", "4"].includes(r.segmento)) return tem("Água, energia, internet e telefone");
      if (["1", "5"].includes(r.segmento)) return tem("Impostos");
    }
    if (/energia|enel|cemig|copel|cpfl|light|celpe|equatorial|sabesp|embasa|copasa|saneamento|agua|claro|vivo|telefon|internet|oi s|tim s/.test(t)) return tem("Água, energia, internet e telefone");
    if (/imobili|aluguel|locacao|condominio/.test(t)) return tem("Aluguel");
    if (/receita federal|simples nacional|prefeitura|municipio|estado d|secretaria|fgts|inss|tributo|imposto|darf|das /.test(t)) return tem("Impostos");
    if (/contab|contador|escritorio/.test(t)) return tem("Contabilidade e serviços profissionais");
    if (/frete|transporte|correios|jadlog|loggi|rodovi|logistic/.test(t)) return tem("Frete");
    if (/google|meta |facebook|instagram|publicidade|marketing/.test(t)) return tem("Marketing");
    if (/emprestimo|financiamento|credito/.test(t)) return tem("Empréstimos e financiamentos");
    return tem("Fornecedores e mercadorias");
  }

  /* ---------- leitura do PDF ---------- */
  function carregarScript(src, pronto) {
    if (pronto()) return Promise.resolve();
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = src; s.onload = () => (pronto() ? ok() : erro(new Error("biblioteca não iniciou")));
      s.onerror = () => erro(new Error("Não consegui carregar a ferramenta de leitura de PDF. Confira a internet."));
      document.head.append(s);
    });
  }
  async function linhasDaPagina(pagina) {
    const c = await pagina.getTextContent();
    const bruto = c.items.filter((i) => i.str && i.str.trim() !== "");
    /* alguns PDFs (como o Relatório de Situação Fiscal da Receita) vêm com o texto deitado.
       Descubro para que lado o texto corre e troco os eixos: u = posição ao longo da linha, v = em que linha está */
    let h0 = 0, vcima = 0, vbaixo = 0, h180 = 0;
    bruto.forEach((i) => { const t = i.transform; if (Math.abs(t[1]) > Math.abs(t[0])) { if (t[1] > 0) vcima++; else vbaixo++; } else if (t[0] < 0) h180++; else h0++; });
    const modo = Math.max(h0, vcima, vbaixo, h180) === h0 ? 0 : Math.max(vcima, vbaixo, h180) === vcima ? 90 : Math.max(vbaixo, h180) === vbaixo ? -90 : 180;
    const itens = bruto.map((i) => {
      const x = i.transform[4], y = i.transform[5];
      return { s: i.str.trim(), u: modo === 0 ? x : modo === 90 ? y : modo === -90 ? -y : -x, v: modo === 0 ? -y : modo === 90 ? x : modo === -90 ? -x : y };
    });
    const grupos = [];
    itens.forEach((it) => { const g = grupos.find((k) => Math.abs(k.v - it.v) <= 2.5); if (g) g.p.push(it); else grupos.push({ v: it.v, p: [it] }); });
    grupos.sort((a, b) => a.v - b.v);
    return grupos.map((g) => g.p.sort((a, b) => a.u - b.u).map((i) => i.s).join(" "));
  }
  /* texto de um PDF, linha por linha, página por página (serve também para o extrato bancário em PDF) */
  F.linhasDoPdf = async function (arquivo) {
    await carregarScript(PDFJS, () => !!window.pdfjsLib);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const doc = await window.pdfjsLib.getDocument({ data: await arquivo.arrayBuffer() }).promise;
    const paginas = [];
    for (let n = 1; n <= doc.numPages; n++) paginas.push(await linhasDaPagina(await doc.getPage(n)));
    return paginas;
  };
  /* lê um PDF e devolve { boletos: [...], semTexto: bool } (cada boleto distinto, pela linha digitável) */
  F.lerPdfBoletos = async function (arquivo) {
    await carregarScript(PDFJS, () => !!window.pdfjsLib);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const doc = await window.pdfjsLib.getDocument({ data: await arquivo.arrayBuffer() }).promise;
    const boletos = [], vistos = new Set();
    let temTexto = false;
    for (let n = 1; n <= doc.numPages; n++) {
      const linhas = await linhasDaPagina(await doc.getPage(n));
      if (linhas.length) temTexto = true;
      const texto = linhas.join("\n");
      const benef = acharBeneficiario(linhas), dataT = dataTexto(texto), valorT = valorTexto(texto);
      acharLinhas(texto).forEach((r) => {
        if (vistos.has(r.digitos)) return;
        vistos.add(r.digitos);
        let venc = r.vencimento || dataT;
        let valor = r.valor;
        if ((!valor || valor <= 0) && valorT > 0) valor = valorT;
        boletos.push(Object.assign({}, r, { arquivo: arquivo.name, beneficiario: benef, vencimento: venc || "", valor: valor || 0, vencDoTexto: !r.vencimento && !!dataT }));
      });
    }
    return { boletos, semTexto: !temTexto, paginas: doc.numPages };
  };

  const formatar = (d) => (d.length === 47 ? [d.slice(0, 5) + "." + d.slice(5, 10), d.slice(10, 15) + "." + d.slice(15, 21), d.slice(21, 26) + "." + d.slice(26, 32), d[32], d.slice(33)].join(" ")
    : d.replace(/(\d{12})(?=\d)/g, "$1 "));
  F.formatarLinhaBoleto = formatar;
  const ehBoleto = (l) => l.tipo === "pagar" && (l.forma === "Boleto" || /^Boleto \(PDF\)/.test(l.obs || ""));
  const linhaDaConta = (l) => { const m = String(l.obs || "").match(/linha digitável:\s*(\d{47,48})/i); return m ? m[1] : ""; };

  /* ---------- janela de importação ---------- */
  F.abrirImportacaoBoletos = function (ctx, arquivosPre) {
    let itens = [];            /* boletos lidos, prontos para revisar */
    const falhas = [];         /* arquivos que não deu para ler */
    const nomes = new Set();
    const input = h("input", { type: "file", multiple: true, accept: ".pdf,application/pdf", id: "finBoletosPdf", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finBoletosPdf", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha os PDFs dos boletos ou arraste até aqui" }),
      h("span", { class: "fraco", text: "Pode ser vários de uma vez. Eu leio o código do boleto, o valor e o vencimento." }));
    const progresso = h("p", { class: "fraco", role: "status" }), lista = h("div");
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Os PDFs são lidos aqui no seu computador e não são enviados para lugar nenhum. Só ficam guardados os dados da conta (valor, vencimento, quem recebe e o código do boleto). Confira cada um antes de importar." }),
      input, zona, progresso, lista);

    const jaLancado = (b) => ctx.lancs.find((l) => b.digitos && String(l.obs || "").includes(b.digitos));
    const parecido = (b) => ctx.lancs.find((l) => l.tipo === "pagar" && b.vencimento && Math.abs(Number(l.valor) - Number(b.valor)) < 0.005 && l.vencimento === b.vencimento && !String(l.obs || "").includes(b.digitos || "#"));

    function desenhar() {
      P.limpar(lista);
      const marcados = itens.filter((b) => b.incluir);
      if (falhas.length) lista.append(h("div", { class: "aviso-pagina" }, h("b", { text: falhas.length + " arquivo(s) sem boleto reconhecido" }), falhas.map((t) => h("p", { text: t }))));
      if (!itens.length) return;
      lista.append(h("div", { class: "fin-impo-res", style: "margin-top:12px" },
        h("div", null, h("b", { text: String(itens.length) }), h("span", { text: itens.length === 1 ? "boleto lido" : "boletos lidos" })),
        h("div", null, h("b", { text: String(marcados.length) }), h("span", { text: "para importar" })),
        h("div", null, h("b", { text: F.dinheiro(F.soma(marcados, (b) => Number(b.valor) || 0)) }), h("span", { text: "total a pagar" }))));
      itens.forEach((b) => lista.append(cartao(b)));
    }
    function cartao(b) {
      const marca = h("input", { type: "checkbox", checked: b.incluir, id: "bol_" + b.id, onchange: () => { b.incluir = marca.checked; resumo(); } });
      const desc = h("input", { type: "text", value: b.descricao, maxlength: "200", oninput: () => { b.descricao = desc.value; } });
      const pessoa = h("input", { type: "text", value: b.beneficiario, maxlength: "200", placeholder: "Quem recebe", oninput: () => { b.beneficiario = pessoa.value; } });
      const venc = h("input", { type: "date", value: b.vencimento, oninput: () => { b.vencimento = venc.value; } });
      const valor = h("input", { type: "text", inputmode: "decimal", value: b.valor ? String(b.valor.toFixed(2)).replace(".", ",") : "", placeholder: "0,00", oninput: () => { const v = F.lerValor(valor.value); b.valor = isNaN(v) ? 0 : v; resumo(); } });
      const cats = F.CATS_PAGAR.concat(b.categoria && !F.CATS_PAGAR.includes(b.categoria) ? [b.categoria] : []);
      const cat = h("select", { onchange: () => { b.categoria = cat.value; } }, cats.map((c) => h("option", { value: c, text: c, selected: c === b.categoria })));
      const pago = h("input", { type: "date", value: b.pagamento || "", oninput: () => { b.pagamento = pago.value; } });
      const notas = [];
      if (b.manual) notas.push(["aviso", "Esse PDF é uma imagem (foto ou digitalização), não consegui ler o código. Preencha à mão."]);
      else if (!b.confere) notas.push(["aviso", "Os números do código não bateram na conferência. Confira o valor e o vencimento no PDF."]);
      if (b.ja) notas.push(["ruim", "Este boleto já foi importado antes (" + P.fmtData(b.ja.vencimento) + ", " + F.dinheiro(b.ja.valor) + "). Não vou repetir."]);
      else if (b.parecida) notas.push(["aviso", "Já existe uma conta a pagar de mesmo valor e vencimento (" + b.parecida.descricao + "). Marque só se for outra."]);
      if (b.vencDoTexto) notas.push(["info", "Vencimento tirado do texto do PDF. Confira."]);
      if (b.tipo === "convenio" && !b.vencimento) notas.push(["aviso", "Boleto de conta de consumo: o vencimento não vem no código, escreva a data."]);
      const caixa = h("div", { class: "fin-boleto" + (b.ja ? " repetido" : "") },
        h("div", { class: "fin-boleto-topo" },
          h("label", { class: "fin-boleto-marca", for: "bol_" + b.id }, marca, h("b", { text: b.arquivo })),
          h("span", { class: "pilula fin-p-info", text: b.manual ? "Sem código" : b.banco })),
        b.digitos ? h("code", { class: "fin-boleto-codigo", text: formatar(b.digitos) }) : null,
        P.campo("Descrição", desc),
        h("div", { class: "grade2" }, P.campo("Quem recebe", pessoa), P.campo("Categoria", cat)),
        h("div", { class: "grade2" }, P.campo("Vencimento", venc), P.campo("Valor (R$)", valor)),
        P.campo("Já pagou? Data do pagamento", pago, "Deixe em branco se ainda vai pagar."),
        notas.map(([t, x]) => h("p", { class: "fin-boleto-nota " + t, text: x })));
      return caixa;
    }
    function resumo() { /* atualiza só os números de cima sem perder o que está sendo digitado */
      const topo = lista.querySelector(".fin-impo-res");
      if (!topo) return;
      const marcados = itens.filter((b) => b.incluir), n = topo.querySelectorAll("b");
      n[1].textContent = String(marcados.length); n[2].textContent = F.dinheiro(F.soma(marcados, (b) => Number(b.valor) || 0));
    }

    async function ler(lista_) {
      const arquivos = Array.from(lista_ || []).filter((a) => /\.pdf$/i.test(a.name) || a.type === "application/pdf");
      if (!arquivos.length) { P.toast("Escolha arquivos PDF.", true); return; }
      for (const a of arquivos) {
        const chaveArq = a.name + "|" + a.size + "|" + a.lastModified;
        if (nomes.has(chaveArq)) continue;
        nomes.add(chaveArq);
        progresso.textContent = "Lendo " + a.name + "...";
        let r;
        try { r = await F.lerPdfBoletos(a); }
        catch (e) {
          const senha = e && (e.name === "PasswordException" || /password/i.test(e.message || ""));
          falhas.push(a.name + ": " + (senha ? "o PDF tem senha. Abra no seu leitor de PDF e salve uma cópia sem senha." : e && /carregar/.test(e.message || "") ? e.message : "não consegui abrir esse PDF."));
          continue;
        }
        if (!r.boletos.length) {
          /* PDF sem código legível (imagem): deixa uma linha para ela preencher na mão */
          const base = a.name.replace(/\.pdf$/i, "");
          itens.push({ id: itens.length + 1, manual: true, arquivo: a.name, digitos: "", tipo: "banco", confere: true, banco: "", beneficiario: "", vencimento: "", valor: 0, segmento: "",
            descricao: ("Boleto " + base).slice(0, 200), categoria: F.CATS_PAGAR[0], pagamento: "", incluir: true });
          continue;
        }
        r.boletos.forEach((b) => {
          if (itens.some((x) => x.digitos && x.digitos === b.digitos)) return;
          const ja = jaLancado(b), par = ja ? null : parecido(b);
          itens.push(Object.assign(b, { id: itens.length + 1, ja, parecida: par, pagamento: "", categoria: categoriaSugerida(b.beneficiario, b),
            descricao: ("Boleto " + (b.beneficiario || b.banco || "")).trim().slice(0, 200), incluir: !ja && !par }));
        });
      }
      progresso.textContent = itens.length ? "Revise os dados abaixo e clique em Importar." : "";
      desenhar();
    }
    input.addEventListener("change", () => { ler(input.files); input.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files));

    P.modal({ titulo: "Subir boletos (PDF)", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Importar", classe: "p", aoClicar: async () => {
        const marcados = itens.filter((b) => b.incluir);
        if (!marcados.length) { P.toast("Não há nenhum boleto marcado para importar.", true); return false; }
        const ruins = marcados.filter((b) => !b.descricao.trim() || !(Number(b.valor) > 0) || !b.vencimento);
        if (ruins.length) { P.toast("Faltam dados em " + ruins.length + " boleto(s): confira descrição, valor e vencimento.", true); return false; }
        const linhas = marcados.map((b) => ({ tipo: "pagar", descricao: b.descricao.trim().slice(0, 200), pessoa: (b.beneficiario || "").trim().slice(0, 200) || null,
          categoria: b.categoria, valor: Math.round(Number(b.valor) * 100) / 100, vencimento: b.vencimento, pagamento: b.pagamento || null, forma: "Boleto", conta: null,
          obs: ("Boleto (PDF)" + (b.digitos ? " - linha digitável: " + b.digitos : "") + "\nArquivo: " + b.arquivo).slice(0, 1000) }));
        const r = await P.gravar(() => window.sb.from("fin_lancamentos").insert(linhas));
        if (!r.ok) return false;
        P.toast(linhas.length + (linhas.length === 1 ? " boleto importado" : " boletos importados") + "!");
        ctx.ir("boletos"); ctx.recarregar();
      } }
    ] });
    if (arquivosPre && arquivosPre.length) ler(arquivosPre);
  };

  /* ---------- a tela ---------- */
  F.telas.boletos = function (ctx) {
    const fx = ctx.faixa, todos = ctx.lancs.filter(ehBoleto);
    ctx.estadoBoletos = ctx.estadoBoletos || { filtro: "aberto", busca: "" };
    const e = ctx.estadoBoletos, r = F.resumoContas(todos);
    const raiz = h("div");
    const pagoPer = F.soma(todos.filter((l) => l.pagamento && l.pagamento >= fx.ini && l.pagamento <= fx.fim), (l) => l.valor);
    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile(r.atrasado ? "t-vermelho" : "t-verde", "Boletos atrasados", F.dinheiro(r.atrasado), r.qtdAtrasado + (r.qtdAtrasado === 1 ? " boleto" : " boletos")),
      F.tile("t-ouro", "Vencem hoje", F.dinheiro(r.hoje)),
      F.tile("t-azul", "Próximos 7 dias", F.dinheiro(r.sete), "8 a 30 dias: " + F.dinheiro(r.trinta)),
      F.tile("t-vinho", "Pagos no período", F.dinheiro(pagoPer), "em aberto: " + F.dinheiro(r.total))));

    const busca = h("input", { type: "search", placeholder: "Buscar por quem recebe ou descrição", value: e.busca, "aria-label": "Buscar" });
    const caixa = h("div");
    function marcarPago(l) {
      const data = h("input", { type: "date", value: F.hoje() });
      P.modal({ titulo: "Marcar como pago", corpo: h("div", null, h("p", { text: l.descricao + ", " + F.dinheiro(l.valor) }), P.campo("Data do pagamento", data)),
        botoes: [{ texto: "Cancelar" }, { texto: "Confirmar", classe: "p", aoClicar: async () => {
          if (!data.value) { P.erroNoCampo(data, "Escolha a data."); return false; }
          const rr = await P.gravar(() => window.sb.from("fin_lancamentos").update({ pagamento: data.value }).eq("id", l.id));
          if (!rr.ok) return false;
          P.toast("Boleto pago"); ctx.recarregar();
        } }] });
    }
    async function copiar(cod) {
      try { await navigator.clipboard.writeText(cod); P.toast("Código copiado. É só colar no app do banco."); }
      catch (err) { P.toast("Não consegui copiar sozinho. Código: " + formatar(cod), true); }
    }
    const ROT = { pago: ["Pago", "ok"], atrasado: ["Atrasado", "ruim"], hoje: ["Vence hoje", "aviso"], pendente: ["Pendente", "info"] };
    function tabela() {
      P.limpar(caixa);
      const q = P.semAcento(e.busca);
      let l = todos.filter((x) => e.filtro === "todos" || (e.filtro === "aberto" && !x.pagamento) || (e.filtro === "atrasados" && F.atrasado(x)) || (e.filtro === "pagos" && x.pagamento && x.pagamento >= fx.ini && x.pagamento <= fx.fim));
      if (q) l = l.filter((x) => P.semAcento([x.descricao, x.pessoa, x.categoria].join(" ")).includes(q));
      l = l.slice().sort((a, b) => (e.filtro === "pagos" ? (a.pagamento < b.pagamento ? 1 : -1) : a.vencimento < b.vencimento ? -1 : 1));
      F.anexar(caixa, F.tabela(["Vencimento", "Quem recebe", "Descrição", { t: "Valor", num: true }, "Situação", " "],
        l.slice(0, 400).map((x) => {
          const sit = F.situacaoLanc(x), rot = ROT[sit], cod = linhaDaConta(x);
          return h("tr", { class: "clicavel", onclick: () => F.abrirFormularioConta(ctx, "pagar", x) },
            h("td", { class: "nw", text: P.fmtData(x.vencimento) }), h("td", { class: "truncar", text: x.pessoa || "" }), h("td", { class: "truncar", text: x.descricao }),
            h("td", { class: "num", text: F.dinheiro(x.valor) }), h("td", { class: "nw" }, F.pilulaStatus(rot[0] + (x.pagamento ? " em " + P.fmtData(x.pagamento) : ""), rot[1])),
            h("td", { class: "acoes", onclick: (ev) => ev.stopPropagation() },
              cod ? h("button", { type: "button", class: "btn-i lig", title: "Copiar o código do boleto", "aria-label": "Copiar o código do boleto: " + x.descricao, onclick: () => copiar(cod) }, P.ic("copiar")) : null,
              x.pagamento ? null : h("button", { type: "button", class: "btn-i lig", title: "Marcar como pago", "aria-label": "Marcar como pago: " + x.descricao, onclick: () => marcarPago(x) }, P.ic("checklist"))));
        }), todos.length ? "Nenhum boleto com esse filtro." : "Você ainda não subiu nenhum boleto. Clique em Subir boletos (PDF)."),
        l.length > 400 ? h("p", { class: "fraco", text: "Mostrando 400 de " + l.length + ". Use a busca." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { e.busca = busca.value; tabela(); }, 150));
    const chip = (v, t) => h("button", { type: "button", "aria-pressed": String(e.filtro === v), text: t, onclick: () => { e.filtro = v; ctx.desenhar(); } });
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" },
      h("div", { class: "busca" }, P.ic("busca"), busca),
      h("div", { class: "filtros", role: "group", "aria-label": "Filtrar" }, chip("aberto", "Em aberto"), chip("atrasados", "Atrasados"), chip("pagos", "Pagos no período"), chip("todos", "Todos")),
      h("span", { class: "espaco" }),
      h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoBoletos(ctx) }, P.ic("subir"), "Subir boletos (PDF)")), caixa);
    tabela();
    raiz.append(F.aviso("Cada boleto vira uma conta a pagar (aparece também em Contas a pagar, na DRE e no Fluxo de caixa, pelo mês do vencimento). Use o botão de copiar para levar o código do boleto direto para o app do banco."));
    return raiz;
  };
})();
