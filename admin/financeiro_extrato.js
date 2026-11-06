/* =========================================================================
   Financeiro: EXTRATO BANCÁRIO.
   Você sobe o extrato da conta (OFX, Excel, CSV ou PDF) e o painel separa
   cada lançamento por categoria: o que entrou (vendas de cada canal, Pix,
   antecipação, empréstimo...) e o que saiu (boletos, peças e telas,
   impostos, parcelas de empréstimo, custo de antecipação, tarifas...).
   Dá para ver o balanço do período e se a antecipação está valendo a pena.

   O painel tenta classificar sozinho pelo texto de cada lançamento. Quando
   você corrige um, ele aprende ("sempre que aparecer isto, é aquilo") e
   usa a regra nos próximos extratos. As transferências entre as suas contas
   ficam de fora das somas, para não contar o mesmo dinheiro duas vezes.

   Esses lançamentos ficam numa tela própria e NÃO entram na DRE (a DRE já
   usa as notas e as contas a pagar), para nada ser contado duas vezes.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});
  F.telas = F.telas || {};

  const norm = (s) => P.semAcento(String(s == null ? "" : s)).replace(/[^a-z0-9]+/g, " ").trim();
  const dois = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);

  /* ---------- categorias ---------- */
  F.CATS_EXTRATO_ENTRADA = ["Vendas Mercado Livre", "Vendas Amazon", "Vendas Shopee", "Vendas Magalu", "Vendas TikTok Shop", "Cartão (maquininha)", "Pix e transferências recebidas",
    "Assistência técnica (serviços)", "Antecipação recebida", "Empréstimo recebido", "Estornos e reembolsos recebidos", "Rendimentos", "Outras entradas"];
  F.CATS_EXTRATO_SAIDA = ["Fornecedores e mercadorias", "Peças e telas (assistência)", "Boletos e contas", "Aluguel", "Água, energia, internet e telefone", "Impostos", "Salários e pró-labore",
    "Parcela de empréstimo", "Custo de antecipação", "Tarifas, juros e IOF", "Frete", "Marketing", "Sistemas e assinaturas", "Estornos e devoluções", "Retirada dos sócios", "Outras saídas"];
  const NEUTRA = "Transferência entre contas", PENDENTE = "A classificar";
  const ANTEC_REC = "Antecipação recebida", ANTEC_CUSTO = "Custo de antecipação", EMP_REC = "Empréstimo recebido", EMP_PARC = "Parcela de empréstimo", TARIFAS = "Tarifas, juros e IOF";

  /* [padrão (texto sem acento), só entradas "+" / só saídas "-" / ambos "*", categoria]. A primeira que servir ganha. */
  const REGRAS = [
    [/antecip/, "+", ANTEC_REC], [/antecip/, "-", ANTEC_CUSTO],
    [/transferencia entre contas|mesma titularidade|transf entre conta|resgate (de )?(cdb|investimento|rdb)|aplicacao (automatica|cdb|rdb)/, "*", NEUTRA],
    [/smart ?brand|provision services|nielly pinheiro/, "*", NEUTRA],
    [/emprestimo|financiamento|capital de giro|credito pessoal|\bcdc\b|consignado/, "+", EMP_REC], [/emprestimo|financiamento|capital de giro|credito pessoal|\bcdc\b|consignado/, "-", EMP_PARC],
    [/mercado livre|mercadolivre|mercado libre|ebazar|liberacao de dinheiro|venda de produto|credito por venda/, "+", "Vendas Mercado Livre"],
    [/amazon/, "+", "Vendas Amazon"], [/shopee/, "+", "Vendas Shopee"], [/magalu|magazine luiza/, "+", "Vendas Magalu"], [/tiktok/, "+", "Vendas TikTok Shop"],
    [/stone|cielo|getnet|redecard|rede card|pagseguro|pagbank|sumup|infinitepay|safrapay/, "+", "Cartão (maquininha)"],
    [/estorno|reembolso|devolucao|cancelamento/, "+", "Estornos e reembolsos recebidos"], [/estorno|reembolso|devolucao|cancelamento/, "-", "Estornos e devoluções"],
    [/rendimento|rend pago|remuneracao/, "+", "Rendimentos"],
    [/tarifa|\btar\b|\biof\b|anuidade|cesta de servicos|manutencao de conta|pacote de servicos|encargo|juros|multa|\bmora\b|\btaxa\b/, "-", TARIFAS],
    [/\bdas\b|simples nacional|darf|\bgps\b|fgts|inss|receita federal|imposto|tributo|\biss\b|icms|prefeitura|sefaz|\bdae\b/, "-", "Impostos"],
    [/folha|salario|\b13o\b|ferias|pro labore|prolabore|rescisao/, "-", "Salários e pró-labore"],
    [/aluguel|imobiliaria|locacao|condominio/, "-", "Aluguel"],
    [/\benel\b|cemig|copel|cpfl|light s a|equatorial|celpe|energisa|neoenergia|sabesp|embasa|copasa|sanepar|\bagua\b|saneamento|\bclaro\b|\bvivo\b|tim s a|telefonica|\boi s a\b|internet|fibra/, "-", "Água, energia, internet e telefone"],
    [/correios|jadlog|loggi|transportadora|\bfrete\b|sedex|total express|azul cargo|latam cargo/, "-", "Frete"],
    [/google|meta ads|facebook|instagram|publicidade|marketing|tiktok ads/, "-", "Marketing"],
    [/olist|\btiny\b|bling|contabil|assinatura|software|hospedagem|dominio|adobe|microsoft|canva|openai|chatgpt|notion|\bzoom\b/, "-", "Sistemas e assinaturas"],
    [/\btelas?\b|display|\blcd\b|oled|bateria|\bpecas?\b|componente|conector de carga|reparo/, "-", "Peças e telas (assistência)"],
    [/boleto|pagamento de titulo|pag titulo|pagto titulo|cobranca|pagamento de conta|convenio/, "-", "Boletos e contas"],
    [/ltda|eireli|\bme\b|\bs a\b|comercio|distribuidora|importadora|atacad|industria/, "-", "Fornecedores e mercadorias"],
    [/pix|transferencia recebida|ted recebida|doc recebido|deposito|dinheiro recebido|recebimento/, "+", "Pix e transferências recebidas"]
  ];
  /* texto "chave" de um lançamento, usado para aprender regras (sem números, só as primeiras palavras) */
  const chaveRegra = (desc) => norm(desc).split(" ").filter((w) => w.length > 1 && !/^\d+$/.test(w)).slice(0, 5).join(" ");
  F.categorizarExtrato = function (desc, valor, regrasUsuario) {
    const n = norm(desc);
    const mias = (regrasUsuario || []).slice().sort((a, b) => b.padrao.length - a.padrao.length);
    for (const r of mias) if (n.includes(r.padrao)) return { categoria: r.categoria, origem: "regra" };
    for (const [re, s, c] of REGRAS) {
      if (s === "+" && valor <= 0) continue;
      if (s === "-" && valor >= 0) continue;
      if (re.test(n)) return { categoria: c, origem: "auto" };
    }
    return { categoria: PENDENTE, origem: "auto" };
  };

  /* ---------- números e datas ---------- */
  function parseValor(v) {   /* devolve { n, explicito }: explicito = o texto já dizia se é crédito ou débito */
    if (typeof v === "number") return { n: isFinite(v) ? dois(v) : 0, explicito: v < 0 };
    const s = String(v == null ? "" : v).trim();
    if (!s) return { n: 0, explicito: false };
    const neg = /^[-−–]/.test(s) || /^\(.*\)$/.test(s) || /[-−–]$/.test(s) || /\bD$/i.test(s) || /^R\$\s*[-−–]/.test(s);
    const pos = /\bC$/i.test(s);
    let t = s.replace(/[^\d.,]/g, "");
    if (!t) return { n: 0, explicito: false };
    if (t.indexOf(",") !== -1) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    const x = parseFloat(t);
    if (!isFinite(x)) return { n: 0, explicito: false };
    return { n: dois(neg ? -x : x), explicito: neg || pos };
  }
  function parseData(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v > 20000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10) : null;
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) {
      const a = m[3].length === 2 ? "20" + m[3] : m[3], mes = +m[2], dia = +m[1];
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      return a + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
    }
    return F.dataPtExtenso ? F.dataPtExtenso(s) : null;
  }
  const texto = (v, max) => { const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim(); return s.slice(0, max); };

  /* ---------- planilhas (Excel e CSV) ---------- */
  const ALIAS = {
    data: ["data", "data lancamento", "data do lancamento", "data movimento", "data do movimento", "data da transacao", "data transacao", "dt lancamento", "date", "release date", "data de lancamento", "data da operacao", "data operacao", "data e hora", "data contabil"],
    valor: ["valor", "valor r", "valor brl", "valor da transacao", "amount", "transaction net amount", "valor liquido", "valor do lancamento", "valor movimento", "valor total"],
    credito: ["credito", "creditos", "entrada", "entradas", "valor credito", "credit", "creditos r"],
    debito: ["debito", "debitos", "saida", "saidas", "valor debito", "debit", "debitos r"],
    saldo: ["saldo", "saldo r", "saldo parcial", "partial balance", "saldo apos", "saldo final", "balance", "saldo brl"],
    desc: ["descricao", "historico", "lancamento", "descritivo", "memo", "detalhe", "detalhes", "descricao do lancamento", "descricao da transacao", "historico do lancamento", "transaction type", "tipo de transacao", "nome"],
    tipo: ["tipo", "d c", "dc", "natureza", "tipo de lancamento", "credito debito"],
    id: ["id da operacao", "id operacao", "documento", "numero do documento", "reference id", "n documento", "identificador", "id da transacao", "codigo da operacao"]
  };
  const ORDEM = ["data", "valor", "credito", "debito", "saldo", "desc", "tipo", "id"];
  function mapear(cab) {
    const n = cab.map(norm), idx = {}, usadas = new Set();
    ORDEM.forEach((k) => { const i = n.findIndex((c, j) => !usadas.has(j) && ALIAS[k].includes(c)); idx[k] = i; if (i !== -1) usadas.add(i); });
    return idx;
  }
  const PALAVRAS_DE_CONTAS = /vencimento|fornecedor|cliente|categoria|forma de pagamento|centro de custo/;
  function ehCabecalho(linha) {
    const cab = linha.map((c) => String(c)), idx = mapear(cab);
    if (norm(cab.join(" ")).match(PALAVRAS_DE_CONTAS)) return false;
    return idx.data !== -1 && idx.desc !== -1 && (idx.valor !== -1 || (idx.credito !== -1 && idx.debito !== -1));
  }
  F.pareceExtrato = (linhas) => linhas.slice(0, 40).some(ehCabecalho);
  const SALDO_LINHA = /^(saldo|sdo)\b|saldo (anterior|do dia|final|inicial|parcial|total)|total (de )?(entradas|saidas|creditos|debitos)/;

  function itensDePlanilha(abas) {
    for (const a of abas) {
      const linhas = a.linhas.filter((l) => l.some((v) => String(v).trim() !== ""));
      const c = linhas.findIndex((l, i) => i < 40 && ehCabecalho(l));
      if (c === -1) continue;
      const idx = mapear(linhas[c].map((x) => String(x))), itens = [], invalidas = [];
      const cel = (l, k) => (idx[k] === -1 ? "" : l[idx[k]]);
      linhas.slice(c + 1).forEach((l, n) => {
        const bruta = cel(l, "data"), desc = texto(cel(l, "desc"), 300);
        if ((bruta === "" || bruta == null) && !desc) return;
        const data = parseData(bruta);
        if (!data) { if (desc || String(bruta).trim()) { if (!SALDO_LINHA.test(norm(desc + " " + bruta))) invalidas.push("Linha " + (c + 2 + n) + ": data \"" + String(bruta).slice(0, 30) + "\" não entendida."); } return; }
        if (SALDO_LINHA.test(norm(desc))) return;
        let v;
        if (idx.valor !== -1) {
          const r = parseValor(cel(l, "valor")); v = r.n;
          if (!r.explicito && idx.tipo !== -1) { const t = norm(cel(l, "tipo")); if (/^d\b|^deb|^saida|^pagamento/.test(t)) v = -Math.abs(v); else if (/^c\b|^cred|^entrada|^receb/.test(t)) v = Math.abs(v); }
        } else v = dois(Math.abs(parseValor(cel(l, "credito")).n) - Math.abs(parseValor(cel(l, "debito")).n));
        if (!v) return;
        const sd = idx.saldo === -1 ? null : parseValor(cel(l, "saldo")), id = idx.id === -1 ? "" : texto(cel(l, "id"), 60);
        itens.push({ data, descricao: desc || "(sem descrição)", valor: v, saldo: sd && String(cel(l, "saldo")).trim() !== "" ? sd.n : null, id });
      });
      return { itens, invalidas, formato: "planilha" + (a.nome && abas.length > 1 ? " (aba " + a.nome + ")" : "") };
    }
    return null;
  }

  /* ---------- OFX (o arquivo que quase todo banco oferece) ---------- */
  const BANCOS = { "001": "Banco do Brasil", "033": "Santander", "077": "Inter", "104": "Caixa", "260": "Nubank", "290": "PagBank", "323": "Mercado Pago", "336": "C6 Bank", "341": "Itaú", "237": "Bradesco", "756": "Sicoob", "748": "Sicredi", "422": "Safra", "380": "PicPay", "403": "Cora" };
  function itensDeOfx(txt) {
    if (!/<OFX>|OFXHEADER/i.test(txt)) return null;
    const tag = (b, t) => { const m = b.match(new RegExp("<" + t + ">\\s*([^<\\r\\n]*)", "i")); return m ? m[1].trim() : ""; };
    const itens = [], invalidas = [];
    const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi;
    let m;
    while ((m = re.exec(txt))) {
      const b = m[1], dt = tag(b, "DTPOSTED").replace(/\D/g, "").slice(0, 8), amt = parseFloat(tag(b, "TRNAMT").replace(",", "."));
      if (dt.length < 8 || !isFinite(amt)) { invalidas.push("Um lançamento do OFX sem data ou valor foi ignorado."); continue; }
      const nome = tag(b, "NAME"), memo = tag(b, "MEMO"), desc = texto(nome && memo && !norm(memo).includes(norm(nome)) && !norm(nome).includes(norm(memo)) ? nome + " " + memo : (memo.length >= nome.length ? memo : nome), 300);
      if (!dois(amt)) continue;
      itens.push({ data: dt.slice(0, 4) + "-" + dt.slice(4, 6) + "-" + dt.slice(6, 8), descricao: desc || "(sem descrição)", valor: dois(amt), saldo: null, id: texto(tag(b, "FITID"), 60) });
    }
    const banco = tag(txt, "BANKID").replace(/^0+(?=\d{3})/, ""), org = tag(txt, "ORG"), acct = tag(txt, "ACCTID");
    const nomeBanco = BANCOS[banco.padStart(3, "0")] || org || (banco ? "Banco " + banco : "");
    return { itens, invalidas, formato: "OFX", contaSugerida: (nomeBanco + (acct.replace(/\D/g, "").length >= 4 ? " final " + acct.replace(/\D/g, "").slice(-4) : "")).trim() };
  }

  /* ---------- PDF (melhor esforço: cada banco imprime de um jeito) ---------- */
  const RE_VALOR = /-?\s?(?:R\$)?\s?\d{1,3}(?:\.\d{3})*,\d{2}\s?[CD]?-?/g;
  function itensDePdf(paginas) {
    const todas = paginas.flat(), txt = todas.join("\n");
    const per = txt.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(?:a|at[eé]|-|–)\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    const anoFim = per ? +per[6] : new Date().getFullYear(), mesFim = per ? +per[5] : 12;
    const itens = [], invalidas = [];
    todas.forEach((linha) => {
      const m = linha.match(/^\s*(\d{2})[\/\-](\d{2})(?:[\/\-](\d{2,4}))?\s+(.*)$/);
      if (!m) return;
      const resto = m[4], valores = resto.match(RE_VALOR);
      if (!valores || !valores.length) return;
      const dia = +m[1], mes = +m[2];
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return;
      let ano = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : (mes > mesFim ? anoFim - 1 : anoFim);
      const desc = texto(resto.slice(0, resto.indexOf(valores[0])), 300).replace(/\s[\d.\-\/]{6,}$/, "");
      if (!desc || SALDO_LINHA.test(norm(desc))) return;
      const v = parseValor(valores.length >= 2 ? valores[valores.length - 2] : valores[0]), s = valores.length >= 2 ? parseValor(valores[valores.length - 1]).n : null;
      itens.push({ data: ano + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0"), descricao: desc, valor: v.n, saldo: s, id: "", explicito: v.explicito });
    });
    /* o sinal: pela variação do saldo, quando o extrato mostra o saldo; senão pelo "-" ou "D" escrito */
    itens.forEach((x, i) => {
      if (x.saldo != null && i > 0 && itens[i - 1].saldo != null) {
        const d = dois(x.saldo - itens[i - 1].saldo);
        if (Math.abs(Math.abs(d) - Math.abs(x.valor)) < 0.02) { x.valor = d < 0 ? -Math.abs(x.valor) : Math.abs(x.valor); x.explicito = true; }
      }
    });
    const sem = itens.filter((x) => !x.explicito && x.valor > 0).length;
    return { itens: itens.filter((x) => x.valor), invalidas: sem && itens.length && sem === itens.filter((x) => x.valor > 0).length && !itens.some((x) => x.valor < 0)
      ? ["O PDF não mostra se cada valor é entrada ou saída. Prefira o arquivo OFX ou o Excel do seu banco."] : invalidas, formato: "PDF" };
  }

  /* ---------- ler um arquivo qualquer ---------- */
  async function lerArquivo(arquivo) {
    const nome = arquivo.name;
    if (/\.(ofx|qfx)$/i.test(nome)) return itensDeOfx(await P.lerArquivoTexto(arquivo));
    if (/\.pdf$/i.test(nome) || arquivo.type === "application/pdf") { if (!F.linhasDoPdf) throw new Error("leitor de PDF não carregou"); return itensDePdf(await F.linhasDoPdf(arquivo)); }
    if (/\.xlsx?$/i.test(nome)) return itensDePlanilha(await F.lerAbas(arquivo));
    const txt = await P.lerArquivoTexto(arquivo);
    return itensDeOfx(txt) || itensDePlanilha([{ nome: "", linhas: P.lerCSV(txt) }]);
  }
  function sugerirConta(nomeArquivo, lido) {
    if (lido && lido.contaSugerida) return lido.contaSugerida;
    const n = norm(nomeArquivo);
    for (const b of ["mercado pago", "mercadopago", "nubank", "inter", "itau", "bradesco", "santander", "caixa", "sicoob", "sicredi", "c6", "pagbank", "pagseguro", "stone", "cora", "banco do brasil"]) if (n.includes(b)) return b.replace("mercadopago", "mercado pago").replace(/\b\w/g, (c) => c.toUpperCase());
    return "";
  }

  /* ---------- confere o saldo do extrato com os valores ---------- */
  function conferirSaldo(itens) {
    const com = itens.filter((x) => x.saldo != null);
    if (com.length < 3) return null;
    const testa = (lista) => { let ok = 0; for (let i = 1; i < lista.length; i++) if (Math.abs(dois(lista[i].saldo - lista[i - 1].saldo) - lista[i].valor) < 0.02) ok++; return ok / (lista.length - 1); };
    const frente = testa(com), tras = testa(com.slice().reverse());
    return Math.max(frente, tras);
  }

  /* ---------- janela de importação ---------- */
  F.abrirImportacaoExtrato = function (ctx, arquivosPre) {
    const lidos = [];   /* { nome, lido } */
    const falhas = [];
    let plano = null;
    const input = h("input", { type: "file", multiple: true, accept: ".ofx,.qfx,.xlsx,.xls,.csv,.pdf,text/csv,application/pdf", id: "finExtratoArq", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finExtratoArq", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha os extratos ou arraste até aqui" }),
      h("span", { class: "fraco", text: "OFX (o melhor), Excel, CSV ou PDF. Pode subir vários meses de uma vez." }));
    const contasExistentes = Array.from(new Set((ctx.extrato || []).map((x) => x.conta)));
    const lista = h("datalist", { id: "finExtratoContas" }, contasExistentes.map((c) => h("option", { value: c })));
    const conta = h("input", { type: "text", maxlength: "80", list: "finExtratoContas", placeholder: "Ex.: Mercado Pago, Banco do Brasil", autocomplete: "off" });
    const progresso = h("p", { class: "fraco", role: "status" }), previa = h("div");
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Suba o extrato da conta (do Mercado Pago, do banco, da maquininha...). Eu separo o que entrou e o que saiu e tento classificar cada lançamento. O mesmo lançamento nunca entra duas vezes, então pode subir extratos que se sobrepõem." }),
      P.campo("Nome da conta", conta, "Para separar uma conta da outra. Use sempre o mesmo nome para a mesma conta."), lista, input, zona, progresso, previa);

    function montar() {
      const nomeConta = conta.value.trim();
      const regras = ctx.regrasExtrato || [], ja = new Set((ctx.extrato || []).map((x) => x.chave));
      const itens = [], vistos = new Map();
      lidos.forEach(({ nome, lido }) => lido.itens.forEach((x) => {
        let chave = [nomeConta, x.data, x.valor.toFixed(2), norm(x.descricao).slice(0, 80), x.id || ""].join("|");
        const c = (vistos.get(chave) || 0) + 1; vistos.set(chave, c);
        if (c > 1) chave += "#" + c;
        const cat = F.categorizarExtrato(x.descricao, x.valor, regras);
        itens.push({ chave: chave.slice(0, 500), conta: nomeConta, data: x.data, descricao: x.descricao, valor: x.valor, saldo: x.saldo, categoria: cat.categoria, categoria_origem: cat.origem, arquivo: nome.slice(0, 200) });
      }));
      const novas = itens.filter((x) => !ja.has(x.chave)), repetidas = itens.length - novas.length;
      plano = { itens, novas, repetidas };
      desenhar();
    }
    function desenhar() {
      P.limpar(previa);
      if (!plano) return;
      const mov = plano.novas.filter((x) => x.categoria !== NEUTRA), entrou = soma(mov.filter((x) => x.valor > 0), (x) => x.valor), saiu = -soma(mov.filter((x) => x.valor < 0), (x) => x.valor);
      const datas = plano.itens.map((x) => x.data).sort(), pend = plano.novas.filter((x) => x.categoria === PENDENTE).length;
      const confere = lidos.length === 1 ? conferirSaldo(lidos[0].lido.itens) : null;
      F.anexar(previa,
        h("div", { class: "fin-impo-res", style: "margin-top:12px" },
          h("div", null, h("b", { text: String(plano.novas.length) }), h("span", { text: "lançamentos novos" })),
          h("div", null, h("b", { text: String(plano.repetidas) }), h("span", { text: "já estavam no painel" })),
          h("div", null, h("b", { text: F.dinheiro(entrou) }), h("span", { text: "entrou" })),
          h("div", null, h("b", { text: F.dinheiro(saiu) }), h("span", { text: "saiu" }))),
        datas.length ? h("p", { class: "dica", text: "Período: " + P.fmtData(datas[0]) + " a " + P.fmtData(datas[datas.length - 1]) + ". " + (pend ? pend + " lançamento(s) eu não soube classificar, você escolhe depois. " : "Consegui classificar todos. ") + "Transferências entre as suas contas ficam de fora das somas." }) : null,
        confere != null ? h("p", { class: "fin-boleto-nota " + (confere >= 0.9 ? "info" : "aviso"), text: confere >= 0.9 ? "O saldo do extrato bate com os valores. Está tudo certo." : "Os valores não batem com o saldo do extrato. Confira se o arquivo está completo." }) : null,
        falhas.length ? h("div", { class: "aviso-pagina" }, h("b", { text: "Arquivo(s) com problema" }), falhas.map((t) => h("p", { text: t }))) : null,
        lidos.some((l) => l.lido.invalidas.length) ? h("div", { class: "aviso-pagina" }, h("b", { text: "Linhas ignoradas" }), lidos.flatMap((l) => l.lido.invalidas).slice(0, 5).map((t) => h("p", { text: t }))) : null,
        plano.novas.length ? F.tabela(["Data", "Descrição", "Categoria", { t: "Valor", num: true }],
          plano.novas.slice(0, 10).map((x) => h("tr", null, h("td", { class: "nw", text: P.fmtData(x.data) }), h("td", { class: "truncar", text: x.descricao }), h("td", { class: "truncar", text: x.categoria }),
            h("td", { class: "num " + (x.valor < 0 ? "neg" : ""), text: F.dinheiro(x.valor) })))) : null,
        plano.novas.length > 10 ? h("p", { class: "dica", text: "Mostrando 10 de " + plano.novas.length + "." }) : null);
    }
    async function ler(arquivos) {
      const lista_ = Array.from(arquivos || []);
      if (!lista_.length) return;
      for (const a of lista_) {
        progresso.textContent = "Lendo " + a.name + "...";
        if (lidos.some((l) => l.nome === a.name)) continue;
        let lido;
        try { lido = await lerArquivo(a); }
        catch (e) { falhas.push(a.name + ": " + (e && /carregar|PDF/i.test(e.message || "") ? e.message : "não consegui abrir o arquivo.")); continue; }
        if (!lido || !lido.itens.length) { falhas.push(a.name + ": não achei lançamentos de extrato (precisa de data, descrição e valor)." + (/\.pdf$/i.test(a.name) ? " Se for PDF escaneado (foto), não dá para ler: baixe o OFX ou o Excel." : "")); continue; }
        lidos.push({ nome: a.name, lido });
        if (!conta.value.trim()) conta.value = sugerirConta(a.name, lido);
      }
      progresso.textContent = lidos.length ? lidos.reduce((s, l) => s + l.lido.itens.length, 0) + " lançamento(s) lidos de " + lidos.length + " arquivo(s)." : "";
      if (lidos.length) montar(); else { plano = null; desenhar(); }
    }
    input.addEventListener("change", () => { ler(input.files); input.value = ""; });
    conta.addEventListener("input", P.debounce(() => { if (lidos.length) montar(); }, 250));
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files));

    P.modal({ titulo: "Importar extrato", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Importar", classe: "p", aoClicar: async () => {
        P.erroNoCampo(conta, "");
        if (!plano) { P.toast("Escolha o extrato primeiro.", true); return false; }
        if (!conta.value.trim()) { P.erroNoCampo(conta, "Escreva o nome da conta."); return false; }
        if (!plano.novas.length) { P.toast("Tudo isso já estava no painel. Não há nada novo.", true); return false; }
        let feitas = 0;
        for (let i = 0; i < plano.novas.length; i += 200) {
          const r = await P.gravar(() => window.sb.from("fin_extrato").upsert(plano.novas.slice(i, i + 200), { onConflict: "chave", ignoreDuplicates: true }));
          if (!r.ok) { P.toast("Parei no meio: " + feitas + " lançamentos foram salvos. Suba de novo para continuar (o que já entrou não repete).", true); ctx.recarregar(); return false; }
          feitas += Math.min(200, plano.novas.length - i);
        }
        P.toast(feitas + " lançamento(s) importados!");
        ctx.ir("extrato"); ctx.recarregar();
      } }
    ] });
    if (arquivosPre && arquivosPre.length) ler(arquivosPre);
  };

  /* ---------- classificar um lançamento (e ensinar o painel) ---------- */
  function classificar(ctx, x) {
    const sel = h("select", null,
      h("optgroup", { label: "Entradas" }, F.CATS_EXTRATO_ENTRADA.map((c) => h("option", { value: c, text: c, selected: c === x.categoria }))),
      h("optgroup", { label: "Saídas" }, F.CATS_EXTRATO_SAIDA.map((c) => h("option", { value: c, text: c, selected: c === x.categoria }))),
      h("optgroup", { label: "Fora das somas" }, h("option", { value: NEUTRA, text: NEUTRA + " (suas contas, não é entrada nem saída)", selected: x.categoria === NEUTRA })));
    if (x.categoria === PENDENTE) sel.prepend(h("option", { value: "", text: "Escolha uma categoria", selected: true }));
    const chave = chaveRegra(x.descricao);
    const parecidos = chave.length >= 3 ? (ctx.extrato || []).filter((y) => y.id !== x.id && y.categoria_origem !== "manual" && norm(y.descricao).includes(chave)) : [];
    const aprender = h("input", { type: "checkbox", checked: chave.length >= 3, id: "extAprender" });
    const corpo = h("div", null,
      h("p", null, h("b", { text: x.descricao }), h("br"), h("span", { class: "fraco", text: P.fmtData(x.data) + ", " + x.conta + ", " + F.dinheiro(x.valor) })),
      P.campo("Categoria", sel),
      chave.length >= 3 ? h("label", { class: "fin-boleto-marca", for: "extAprender", style: "margin-top:8px" }, aprender,
        h("span", { text: "Usar a mesma categoria para todos que contêm \"" + chave + "\"" + (parecidos.length ? " (" + parecidos.length + " outro(s) agora)" : "") + " e lembrar nos próximos extratos." })) : null);
    P.modal({ titulo: "Classificar lançamento", corpo, botoes: [{ texto: "Cancelar" }, { texto: "Salvar", classe: "p", aoClicar: async () => {
      if (!sel.value) { P.toast("Escolha uma categoria.", true); return false; }
      const outros = aprender.checked ? parecidos : [], alvo = [x].concat(outros);
      const r1 = await P.gravar(() => window.sb.from("fin_extrato").update({ categoria: sel.value, categoria_origem: "manual" }).eq("id", x.id));
      if (!r1.ok) return false;
      for (let i = 0; i < outros.length; i += 100) {
        const ids = outros.slice(i, i + 100).map((y) => y.id);
        const r = await P.gravar(() => window.sb.from("fin_extrato").update({ categoria: sel.value, categoria_origem: "regra" }).in("id", ids));
        if (!r.ok) return false;
      }
      if (aprender.checked && chave.length >= 3) {
        const r2 = await P.gravar(() => window.sb.from("fin_extrato_regras").upsert({ padrao: chave, categoria: sel.value }, { onConflict: "padrao" }));
        if (!r2.ok) return false;
      }
      P.toast(alvo.length > 1 ? alvo.length + " lançamentos classificados" : "Classificado"); ctx.recarregar();
    } }] });
  }

  /* ---------- a tela ---------- */
  F.telas.extrato = function (ctx) {
    const raiz = h("div"), fx = ctx.faixa;
    if (!ctx.extratoOk) {
      raiz.append(F.aviso("As tabelas do extrato ainda não existem no Supabase. Use a faixa amarela no topo (\"Copiar o SQL\"), cole no SQL Editor do projeto \"niellypinheiro portfólio\" e clique em Run. Depois atualize esta página.", "erro"));
      return raiz;
    }
    ctx.estadoExtrato = ctx.estadoExtrato || { filtro: "todos", busca: "", conta: "", cat: "" };
    const e = ctx.estadoExtrato, todos = ctx.extrato || [];
    if (!todos.length) {
      raiz.append(F.cartao("Nenhum extrato importado ainda", h("div", null,
        h("p", { text: "Baixe o extrato da conta no app ou no site do banco (de preferência em OFX, ou Excel/CSV/PDF) e clique em Importar extrato. Eu separo o que entrou e o que saiu, classifico cada lançamento e mostro o balanço, inclusive quanto custou antecipar o dinheiro." }),
        h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoExtrato(ctx) }, P.ic("subir"), "Importar extrato"))));
      return raiz;
    }
    const contas = Array.from(new Set(todos.map((x) => x.conta))).sort();
    if (e.conta && !contas.includes(e.conta)) e.conta = "";
    const base = todos.filter((x) => !e.conta || x.conta === e.conta);
    const dentro = (x, a, b) => x.data >= a && x.data <= b;
    const per = base.filter((x) => dentro(x, fx.ini, fx.fim)), ant = base.filter((x) => dentro(x, fx.ant.ini, fx.ant.fim));
    const mov = (l) => l.filter((x) => x.categoria !== NEUTRA);
    const entrou = (l) => soma(mov(l).filter((x) => x.valor > 0), (x) => x.valor), saiu = (l) => -soma(mov(l).filter((x) => x.valor < 0), (x) => x.valor);
    const E = entrou(per), S = saiu(per), res = E - S, Ea = entrou(ant), Sa = saiu(ant);
    const porCat = (l, sinal) => { const g = new Map(); l.filter((x) => x.categoria !== NEUTRA && (sinal > 0 ? x.valor > 0 : x.valor < 0)).forEach((x) => g.set(x.categoria || PENDENTE, (g.get(x.categoria || PENDENTE) || 0) + Math.abs(x.valor))); return Array.from(g, ([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total); };
    const custoFin = soma(per.filter((x) => x.valor < 0 && (x.categoria === ANTEC_CUSTO || x.categoria === TARIFAS)), (x) => -x.valor);

    /* filtro de conta + importar */
    const selConta = h("select", { "aria-label": "Conta", onchange: (ev) => { e.conta = ev.target.value; ctx.desenhar(); } }, h("option", { value: "", text: "Todas as contas" }), contas.map((c) => h("option", { value: c, text: c, selected: c === e.conta })));
    raiz.append(h("div", { class: "ferramentas" }, selConta, h("span", { class: "espaco" }), h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoExtrato(ctx) }, P.ic("subir"), "Importar extrato")));

    raiz.append(h("div", { class: "fin-tiles quatro", style: "margin-top:12px" },
      F.tile("t-verde", "Entrou", F.dinheiro(E), (() => { const ae = soma(per.filter((x) => x.valor > 0 && (x.categoria === ANTEC_REC || x.categoria === EMP_REC)), (x) => x.valor); return ae ? "inclui " + F.dinheiro(ae) + " de antecipação e empréstimo" : per.length + " lançamento(s) no período"; })(), F.variacao(E, Ea)),
      F.tile("t-vinho", "Saiu", F.dinheiro(S), fx.rotulo, F.variacao(S, Sa)),
      F.tile(res >= 0 ? "t-azul" : "t-vermelho", "Sobrou (entrou menos saiu)", F.dinheiro(res), "sem transferências entre contas", null),
      F.tile("t-ouro", "Custo de antecipar e tarifas", F.dinheiro(custoFin), E ? F.pct((custoFin / E) * 100, 1) + " do que entrou" : "", null)));

    /* balanço: de onde veio e para onde foi */
    const ent = porCat(per, 1), sai = porCat(per, -1);
    const tabCat = (l, total, titulo) => F.cartao(titulo, F.tabela(["Categoria", { t: "Valor", num: true }, { t: "%", num: true }],
      l.map((g) => h("tr", { class: g.nome === PENDENTE ? "clicavel" : "", onclick: g.nome === PENDENTE ? () => { e.filtro = "pendentes"; ctx.desenhar(); } : null },
        h("td", { class: "truncar", text: g.nome }), h("td", { class: "num", text: F.dinheiro(g.total) }), h("td", { class: "num", text: total ? F.pct((g.total / total) * 100, 0) : "" }))), "Nada neste período."), "fin-cartao-tab");
    raiz.append(h("div", { class: "fin-duas igual" }, tabCat(ent, E, "De onde veio o dinheiro"), tabCat(sai, S, "Para onde foi o dinheiro")));

    const fatias = sai.map((g, i) => ({ nome: g.nome, valor: g.total, cor: F.CORES[i % F.CORES.length] }));
    const graf6 = (() => { const meses = F.mesesAtras(6); return F.cartao("Entrou e saiu nos últimos 6 meses", F.barras(meses.map(F.mesNome), [
      { nome: "Entrou", cor: "#7aa874", valores: meses.map((m) => dois(entrou(base.filter((x) => x.data.slice(0, 7) === m)))) },
      { nome: "Saiu", cor: "#e8a04c", valores: meses.map((m) => dois(saiu(base.filter((x) => x.data.slice(0, 7) === m)))) }])); })();
    raiz.append(h("div", { class: "fin-duas" }, graf6, F.cartao("Saídas por categoria", fatias.length ? h("div", { class: "fin-rosca-caixa" }, F.rosca(fatias, F.curto(S), "saiu"),
      h("ul", { class: "fin-legenda-lista" }, sai.slice(0, 10).map((g, i) => h("li", null, h("i", { style: "background:" + F.CORES[i % F.CORES.length] }), h("span", { text: g.nome }), h("b", { text: F.dinheiro(g.total) }))))) : h("p", { class: "fraco", text: "Sem saídas neste período." }))));

    /* antecipação e empréstimo */
    const antRec = soma(per.filter((x) => x.categoria === ANTEC_REC && x.valor > 0), (x) => x.valor), antCusto = soma(per.filter((x) => x.categoria === ANTEC_CUSTO && x.valor < 0), (x) => -x.valor);
    const empRec = soma(per.filter((x) => x.categoria === EMP_REC && x.valor > 0), (x) => x.valor), empParc = soma(per.filter((x) => x.categoria === EMP_PARC && x.valor < 0), (x) => -x.valor);
    const taxa = antRec > 0 ? (antCusto / antRec) * 100 : null;
    const antecip = F.cartao("Antecipação: está valendo a pena?", antRec || antCusto ? h("div", null,
      h("ul", { class: "fin-saude" },
        h("li", null, h("span", { text: "Antecipação recebida" }), h("b", { text: F.dinheiro(antRec) })),
        h("li", null, h("span", { text: "Custo para antecipar" }), h("b", { text: F.dinheiro(antCusto) })),
        h("li", null, h("span", { text: "Custo sobre o que foi antecipado" }), h("b", { text: taxa == null ? "-" : F.pct(taxa, 2) }))),
      h("p", { class: "dica", text: taxa == null ? "Achei o custo, mas nenhuma antecipação recebida no período. Se o extrato só mostra o valor líquido, me mande um exemplo para eu calcular o custo." : "Cada R$ 100 antecipados custaram R$ " + (taxa).toFixed(2).replace(".", ",") + ". Compare com o que você ganharia esperando o prazo normal e com o lucro que o dinheiro antecipado rendeu." }))
      : h("p", { class: "fraco", text: "Não achei antecipação neste período. Quando aparecer um lançamento com \"antecipação\" na descrição, ele entra aqui sozinho. Se tiver aparecido com outro nome, classifique-o como \"Antecipação recebida\" ou \"Custo de antecipação\"." }));
    const emprestimo = F.cartao("Empréstimos", empRec || empParc ? h("ul", { class: "fin-saude" },
      h("li", null, h("span", { text: "Empréstimo recebido" }), h("b", { text: F.dinheiro(empRec) })),
      h("li", null, h("span", { text: "Parcelas pagas" }), h("b", { text: F.dinheiro(empParc) }))) : h("p", { class: "fraco", text: "Sem empréstimo neste período." }));
    raiz.append(h("div", { class: "fin-duas" }, antecip, emprestimo));

    /* lista */
    const pend = base.filter((x) => x.categoria === PENDENTE || !x.categoria);
    if (pend.length) raiz.append(h("p", { class: "aviso-pagina" }, h("b", { text: pend.length + " lançamento(s) sem categoria. " }), "Clique em um lançamento para classificar. O painel aprende e usa a mesma categoria nos parecidos.",
      h("button", { type: "button", class: "btn", style: "margin-left:8px", onclick: () => { e.filtro = "pendentes"; ctx.desenhar(); } }, "Ver só esses")));
    const busca = h("input", { type: "search", placeholder: "Buscar na descrição", value: e.busca, "aria-label": "Buscar" });
    const catSel = h("select", { "aria-label": "Categoria", onchange: (ev) => { e.cat = ev.target.value; ctx.desenhar(); } }, h("option", { value: "", text: "Todas as categorias" }),
      F.CATS_EXTRATO_ENTRADA.concat(F.CATS_EXTRATO_SAIDA, [NEUTRA, PENDENTE]).map((c) => h("option", { value: c, text: c, selected: c === e.cat })));
    const caixa = h("div");
    function tabela() {
      P.limpar(caixa);
      const q = P.semAcento(e.busca);
      let l = per.filter((x) => e.filtro === "todos" || (e.filtro === "entradas" && x.valor > 0) || (e.filtro === "saidas" && x.valor < 0) || (e.filtro === "pendentes" && (x.categoria === PENDENTE || !x.categoria)));
      if (e.filtro === "pendentes") l = base.filter((x) => x.categoria === PENDENTE || !x.categoria);
      if (e.cat) l = l.filter((x) => x.categoria === e.cat);
      if (q) l = l.filter((x) => P.semAcento(x.descricao).includes(q));
      l = l.slice().sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
      F.anexar(caixa, F.tabela(["Data", "Descrição", "Conta", "Categoria", { t: "Valor", num: true }],
        l.slice(0, 300).map((x) => h("tr", { class: "clicavel", onclick: () => classificar(ctx, x) },
          h("td", { class: "nw", text: P.fmtData(x.data) }), h("td", { class: "truncar", text: x.descricao }), h("td", { class: "truncar", text: x.conta }),
          h("td", { class: "nw" }, F.pilulaStatus(x.categoria || PENDENTE, x.categoria === PENDENTE ? "aviso" : x.categoria === NEUTRA ? "info" : x.valor > 0 ? "ok" : "info")),
          h("td", { class: "num", style: x.valor < 0 ? "color:var(--vermelho)" : "", text: F.dinheiro(x.valor) }))), "Nada com esse filtro neste período."),
        l.length > 300 ? h("p", { class: "fraco", text: "Mostrando 300 de " + l.length + ". Use a busca." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { e.busca = busca.value; tabela(); }, 150));
    const chip = (v, t) => h("button", { type: "button", "aria-pressed": String(e.filtro === v), text: t, onclick: () => { e.filtro = v; ctx.desenhar(); } });
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" }, h("div", { class: "busca" }, P.ic("busca"), busca),
      h("div", { class: "filtros", role: "group", "aria-label": "Filtrar" }, chip("todos", "Todos"), chip("entradas", "Entradas"), chip("saidas", "Saídas"), chip("pendentes", "Sem categoria")), catSel), caixa);
    tabela();
    raiz.append(F.aviso("Transferências entre as suas contas ficam fora das somas (não são entrada nem saída). O extrato fica separado da DRE, que já usa as notas e as contas a pagar, para nada ser contado duas vezes. Os dados são só o que o extrato mostra: data, descrição e valor."));
    return raiz;
  };
})();
