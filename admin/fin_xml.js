/* =========================================================================
   Leitor de notas fiscais (XML da NF-e e da NFC-e) e de pastas compactadas (.zip).
   Tudo acontece no seu navegador: os arquivos não vão para nenhum serviço de fora,
   só o resultado da leitura é guardado no banco, quando você confirma.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel;
  const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

  const FORMAS = { "01": "Dinheiro", "02": "Cheque", "03": "Cartão de crédito", "04": "Cartão de débito", "05": "Crédito da loja", "10": "Vale alimentação", "11": "Vale refeição",
    "12": "Vale presente", "13": "Vale combustível", "15": "Boleto", "16": "Depósito", "17": "Pix", "18": "Transferência", "19": "Fidelidade", "90": "Sem pagamento", "99": "Outros" };
  const CFOP_DEVOLUCAO = /^[1256](20\d|41\d)$/;   /* 1201, 5202, 2411 e parecidos: devolução de venda ou de compra */

  const filho = (el, tag) => (el ? el.getElementsByTagNameNS("*", tag)[0] || null : null);
  const texto = (el, tag) => { const n = filho(el, tag); return n ? n.textContent.trim() : ""; };
  const num = (el, tag) => { const v = parseFloat(texto(el, tag)); return isFinite(v) ? v : 0; };
  const dois = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const soDigitos = (s) => String(s || "").replace(/\D/g, "");

  function carregarScript(src, pronto) {
    if (pronto()) return Promise.resolve();
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = src; s.onload = () => (pronto() ? ok() : erro(new Error("biblioteca não iniciou")));
      s.onerror = () => erro(new Error("Não consegui carregar a ferramenta que abre pastas compactadas. Confira a internet."));
      document.head.append(s);
    });
  }

  function decodificar(bytes) {
    const inicio = new TextDecoder("utf-8").decode(bytes.slice(0, 200));
    const m = inicio.match(/encoding=["']([^"']+)["']/i);
    const cod = m ? m[1].toLowerCase() : "utf-8";
    try { return new TextDecoder(cod === "iso-8859-1" || cod === "latin1" ? "windows-1252" : cod).decode(bytes); }
    catch (e) { return new TextDecoder("utf-8").decode(bytes); }
  }

  /* CT-e: conhecimento de transporte (o frete que a transportadora cobra). Guardo só o que serve à gestão: sem CPF nem nome do cliente final. */
  function lerCte(doc, nome) {
    const inf = filho(doc.documentElement, "infCte");
    if (!inf) return { tipo: "erro", nome, motivo: "Não achei os dados do CT-e." };
    const chave = soDigitos((inf.getAttribute("Id") || "").replace(/^CTe/i, ""));
    if (chave.length !== 44) return { tipo: "erro", nome, motivo: "A chave de acesso do CT-e não está completa." };
    const ide = filho(inf, "ide"), emit = filho(inf, "emit"), rem = filho(inf, "rem"), vp = filho(inf, "vPrest");
    const cStat = texto(filho(doc.documentElement, "infProt"), "cStat");
    let status = "autorizado";
    if (cStat) status = ["100", "150"].includes(cStat) ? "autorizado" : ["101", "135", "155"].includes(cStat) ? "cancelado" : "rejeitado";
    const data = (texto(ide, "dhEmi") || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { tipo: "erro", nome, motivo: "Não achei a data de emissão do CT-e." };
    /* quem paga o frete (tomador): informado direto (toma4) ou indicado por um código (0 remetente, 1 expedidor, 2 recebedor, 3 destinatário) */
    let tom = filho(ide, "toma4");
    if (!tom) tom = filho(inf, ["rem", "exped", "receb", "dest"][parseInt(texto(filho(ide, "toma3"), "toma"), 10)] || "rem");
    const nfe = texto(filho(inf, "infNFe"), "chave");
    return {
      tipo: "cte", nome,
      cte: {
        chave, numero: texto(ide, "nCT"), serie: texto(ide, "serie"), data_emissao: data, status,
        emitente_nome: texto(emit, "xNome").slice(0, 200), emitente_doc: soDigitos(texto(emit, "CNPJ") || texto(emit, "CPF")),
        tomador_nome: texto(tom, "xNome").slice(0, 200), tomador_doc: soDigitos(texto(tom, "CNPJ") || texto(tom, "CPF")),
        remetente_nome: texto(rem, "xNome").slice(0, 200), remetente_doc: soDigitos(texto(rem, "CNPJ") || texto(rem, "CPF")),
        destino: (texto(ide, "xMunFim") + (texto(ide, "UFFim") ? "/" + texto(ide, "UFFim") : "")).slice(0, 120),
        valor: dois(num(vp, "vTPrest")), valor_icms: dois(num(filho(inf, "imp"), "vICMS")),
        nfe_chave: soDigitos(nfe).length === 44 ? soDigitos(nfe) : null, nfe_numero: soDigitos(nfe).length === 44 ? String(parseInt(soDigitos(nfe).slice(25, 34), 10)) : null,
        tipo_operacao: null, origem: "xml", empresa_doc: null
      }
    };
  }

  /* Lê UM arquivo XML. Devolve { tipo: "nota" | "evento" | "ignorado" | "erro", ... } */
  function lerXml(conteudo, nome) {
    let doc;
    try { doc = new DOMParser().parseFromString(conteudo, "application/xml"); } catch (e) { return { tipo: "erro", nome, motivo: "Não consegui ler o arquivo." }; }
    if (doc.getElementsByTagName("parsererror").length) return { tipo: "erro", nome, motivo: "O arquivo XML está danificado ou incompleto." };
    const raiz = doc.documentElement ? doc.documentElement.localName : "";

    if (/^(procEventoNFe|envEvento|evento|retEvento)$/.test(raiz)) {
      const ev = filho(doc.documentElement, "infEvento");
      const chave = texto(ev, "chNFe");
      const tp = texto(ev, "tpEvento");
      if (chave && tp === "110111") return { tipo: "evento", nome, chave, evento: "cancelamento" };
      return { tipo: "ignorado", nome, motivo: "Evento da nota (não é uma nota)." };
    }
    if (/^(procEventoCTe|eventoCTe)$/.test(raiz)) {
      const ev = filho(doc.documentElement, "infEvento");
      if (texto(ev, "chCTe") && texto(ev, "tpEvento") === "110111") return { tipo: "evento_cte", nome, chave: texto(ev, "chCTe") };
      return { tipo: "ignorado", nome, motivo: "Evento do CT-e (não é um CT-e)." };
    }
    if (raiz === "cteProc" || raiz === "CTe") return lerCte(doc, nome);
    const inf = filho(doc.documentElement, "infNFe");
    if (!inf) {
      const quem = /nfse|CompNfse|Nfse/i.test(raiz) ? "NFS-e (nota de serviço)" : "tipo de arquivo que ainda não leio";
      return { tipo: "ignorado", nome, motivo: "É um " + quem + ". Por enquanto só leio NF-e e NFC-e de produtos." };
    }

    const chave = soDigitos((inf.getAttribute("Id") || "").replace(/^NFe/i, ""));
    if (chave.length !== 44) return { tipo: "erro", nome, motivo: "A chave de acesso da nota não está completa." };
    const ide = filho(inf, "ide"), emit = filho(inf, "emit"), dest = filho(inf, "dest"), tot = filho(inf, "ICMSTot");
    const prot = filho(doc.documentElement, "infProt");
    const cStat = texto(prot, "cStat");
    let status = "autorizada";
    if (cStat) {
      if (["100", "150"].includes(cStat)) status = "autorizada";
      else if (["101", "151", "135", "155"].includes(cStat)) status = "cancelada";
      else if (["110", "301", "302", "303"].includes(cStat)) status = "denegada";
      else status = "rejeitada";
    }
    const dh = texto(ide, "dhEmi") || texto(ide, "dEmi");
    const dataEmissao = dh.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEmissao)) return { tipo: "erro", nome, motivo: "Não achei a data de emissão da nota." };

    const itens = [];
    Array.from(inf.getElementsByTagNameNS("*", "det")).forEach((det) => {
      const prod = filho(det, "prod");
      if (!prod) return;
      const ean = soDigitos(texto(prod, "cEAN")) || "";
      itens.push({
        codigo: texto(prod, "cProd").slice(0, 60), ean: /^\d{8,14}$/.test(ean) && !/^0+$/.test(ean) ? ean : "",
        descricao: (texto(prod, "xProd") || "Sem descrição").slice(0, 300), ncm: texto(prod, "NCM").slice(0, 10),
        cfop: texto(prod, "CFOP").slice(0, 6), unidade: texto(prod, "uCom").slice(0, 10),
        quantidade: num(prod, "qCom"), valor_unitario: num(prod, "vUnCom"), valor_total: dois(num(prod, "vProd")), desconto: dois(num(prod, "vDesc"))
      });
    });

    const finalidade = texto(ide, "finNFe");
    const devolucao = finalidade === "4" || (itens.length > 0 && itens.every((i) => CFOP_DEVOLUCAO.test(i.cfop)));
    const pagto = filho(inf, "detPag");
    const forma = pagto ? (FORMAS[texto(pagto, "tPag")] || "") : "";
    const docEmit = soDigitos(texto(emit, "CNPJ") || texto(emit, "CPF"));
    const docDest = soDigitos(texto(dest, "CNPJ") || texto(dest, "CPF"));
    return {
      tipo: "nota", nome, itens,
      nota: {
        chave, modelo: texto(ide, "mod"), numero: texto(ide, "nNF"), serie: texto(ide, "serie"), data_emissao: dataEmissao,
        natureza: texto(ide, "natOp").slice(0, 120), devolucao, tpNF: texto(ide, "tpNF"),
        emitente_nome: (texto(emit, "xNome") || texto(emit, "xFant")).slice(0, 200), emitente_doc: docEmit,
        destinatario_nome: texto(dest, "xNome").slice(0, 200), destinatario_doc: docDest,
        valor_produtos: dois(num(tot, "vProd")), valor_frete: dois(num(tot, "vFrete")), valor_desconto: dois(num(tot, "vDesc")),
        valor_outros: dois(num(tot, "vOutro") + num(tot, "vSeg")), valor_total: dois(num(tot, "vNF")),
        valor_icms: dois(num(tot, "vICMS")), valor_pis: dois(num(tot, "vPIS")), valor_cofins: dois(num(tot, "vCOFINS")),
        valor_ipi: dois(num(tot, "vIPI")), valor_tributos: dois(num(tot, "vTotTrib")), forma_pagamento: forma, status
      }
    };
  }

  /* Abre uma lista de arquivos (XML soltos e/ou .zip, inclusive zip dentro de zip) */
  async function lerArquivos(arquivos, aoProgresso) {
    const r = { notas: [], eventos: [], ctes: [], eventosCte: [], ignorados: [], erros: [], outros: [], lidos: 0 };
    const fila = [];
    for (const a of Array.from(arquivos)) fila.push({ nome: a.name, ler: () => a.arrayBuffer() });
    async function tratar(nome, buffer, nivel) {
      const minusculo = nome.toLowerCase();
      if (minusculo.endsWith(".zip")) {
        if (nivel > 3) { r.ignorados.push({ nome, motivo: "Pasta compactada dentro de outra, muitos níveis." }); return; }
        await carregarScript(JSZIP, () => !!window.JSZip);
        const zip = await window.JSZip.loadAsync(buffer);
        const entradas = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(f.name));
        for (const e of entradas) {
          const bytes = await e.async("uint8array");
          await tratar(nome + " / " + e.name, bytes, nivel + 1);
        }
        return;
      }
      if (minusculo.endsWith(".xml")) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const res = lerXml(decodificar(bytes), nome);
        r.lidos++;
        if (res.tipo === "nota") r.notas.push(res); else if (res.tipo === "evento") r.eventos.push(res);
        else if (res.tipo === "cte") r.ctes.push(res); else if (res.tipo === "evento_cte") r.eventosCte.push(res);
        else if (res.tipo === "ignorado") r.ignorados.push(res); else r.erros.push(res);
        if (aoProgresso && r.lidos % 25 === 0) aoProgresso(r.lidos);
        return;
      }
      r.outros.push(nome);
    }
    for (const item of fila) await tratar(item.nome, await item.ler(), 0);
    return r;
  }

  /* Os CNPJs que mais aparecem nas notas (os das suas empresas estão em quase todas), com a quantidade de notas de cada um */
  function sugerirCnpjs(notas) {
    const cont = {};
    notas.forEach((n) => [n.nota.emitente_doc, n.nota.destinatario_doc].forEach((d) => { if (d && d.length === 14) cont[d] = (cont[d] || 0) + 1; }));
    return Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([doc, qtd]) => ({ doc, qtd }));
  }
  /* Tira os CNPJs de um texto (com ou sem pontos e traço, separados por vírgula, espaço ou linha) */
  function lerCnpjs(textoLivre) {
    const achados = String(textoLivre || "").match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
    return Array.from(new Set(achados.map(soDigitos)));
  }

  /* Entrada (compra), saída (venda) ou interna (a nota é entre as suas próprias empresas), olhando quem emitiu e quem recebeu.
     "meus" é a lista de CNPJs das suas empresas (a loja e a outra empresa que emite as vendas). */
  function classificar(res, meus) {
    const n = res.nota, lista = Array.isArray(meus) ? meus : lerCnpjs(meus);
    const emitiuEu = lista.includes(n.emitente_doc), recebeuEu = lista.includes(n.destinatario_doc);
    if (emitiuEu && recebeuEu) return "interna";
    if (emitiuEu) return n.tpNF === "0" ? "entrada" : "saida";
    return "entrada";
  }
  /* De qual das suas empresas é a nota */
  function empresaDaNota(res, meus) {
    const n = res.nota;
    return meus.includes(n.emitente_doc) ? n.emitente_doc : meus.includes(n.destinatario_doc) ? n.destinatario_doc : "";
  }

  P.finXml = { lerArquivos, lerXml, sugerirCnpjs, lerCnpjs, classificar, empresaDaNota, soDigitos };
})();
