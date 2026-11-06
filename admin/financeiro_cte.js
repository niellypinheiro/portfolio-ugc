/* =========================================================================
   Financeiro: FRETES (CT-e, conhecimento de transporte eletrônico).
   É o documento da transportadora (por exemplo o Mercado Envios) que cobra o
   frete das suas vendas. Pode vir de dois jeitos, e os dois podem ser
   importados juntos sem repetir:
     - XML dentro de uma pasta .zip (traz tudo: quem paga, destino, ICMS);
     - planilha "Informe de CT-e" (Excel), com o valor, a chave e a nota de origem.
   A chave do CT-e (44 números) é única, então o mesmo CT-e nunca entra duas vezes.

   O custo dos fretes entra na DRE como despesa "Frete (CT-e)".
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});
  F.telas = F.telas || {};

  const norm = (s) => P.semAcento(String(s == null ? "" : s)).replace(/[^a-z0-9]+/g, " ").trim();
  const dois = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const digitos = (s) => String(s == null ? "" : s).replace(/\D/g, "");

  /* nome da transportadora: o do XML, ou o conhecido pelo CNPJ (o Mercado Livre emite os CT-e do Mercado Envios) */
  const EMISSORES = { "03007331022030": "EBAZARCOMBR LTDA (Mercado Livre)" };
  F.nomeEmitenteCte = (c) => c.emitente_nome || EMISSORES[c.emitente_doc] || F.fmtDoc(c.emitente_doc) || "Sem nome";

  /* ---------- de quem é o custo ---------- */
  /* O frete é seu quando quem paga (tomador) é uma das suas empresas. Se o arquivo não diz quem paga (planilha), vale a empresa do relatório. */
  F.cteEhMeu = function (ctx, c) {
    const meus = F.meusCnpjs(ctx);
    if (!meus.length) return true;
    if (c.tomador_doc) return meus.includes(c.tomador_doc);
    if (c.empresa_doc) return meus.includes(c.empresa_doc);
    return true;
  };
  F.cteCusto = (ctx, c) => c.status === "autorizado" && F.cteEhMeu(ctx, c);
  /* total do frete autorizado no período (usado na DRE) */
  F.custoCte = function (ctx, ini, fim) {
    return soma((ctx.ctes || []).filter((c) => c.data_emissao >= ini && c.data_emissao <= fim && F.cteCusto(ctx, c)), (c) => c.valor);
  };

  /* ---------- planilha "Informe de CT-e" ---------- */
  const COLUNAS = {
    data: ["data da emissao", "data de emissao", "emissao"],
    tipo: ["tipo do ct e"],
    status: ["status do ct e", "status"],
    operacao: ["tipo de operacao"],
    emissor: ["cnpj do emissor", "cnpj emissor"],
    valor: ["valor do ct e", "valor do frete", "valor"],
    numero: ["numero do ct e"],
    serie: ["serie do ct e"],
    chave: ["chave do ct e", "chave de acesso do ct e", "chave"],
    nfeNumero: ["numero do documento de origem"],
    nfeChave: ["chave do documento de origem"]
  };
  function mapear(cab) {
    const n = cab.map(norm), usadas = new Set(), idx = {};
    Object.keys(COLUNAS).forEach((k) => {
      let i = -1;
      for (const a of COLUNAS[k]) { i = n.findIndex((c, j) => !usadas.has(j) && c === a); if (i !== -1) break; }
      idx[k] = i; if (i !== -1) usadas.add(i);
    });
    return idx;
  }
  const cabOk = (cab) => { const i = mapear(cab); return i.chave !== -1 && i.data !== -1 && i.valor !== -1; };
  F.pareceCte = (linhas) => linhas.slice(0, 12).some((l) => cabOk(l.map(String)));

  function dataBr(v) {
    if (typeof v === "number") return v > 20000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10) : null;
    const s = String(v == null ? "" : v).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0");
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + "-" + m[2] + "-" + m[3] : null;
  }
  function numeroBr(v) {
    if (typeof v === "number") return isFinite(v) ? dois(v) : 0;
    let s = String(v == null ? "" : v).replace(/[^\d.,]/g, "");
    if (!s) return 0;
    if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    const x = parseFloat(s);
    return isFinite(x) ? dois(x) : 0;
  }
  const textoId = (v) => (typeof v === "number" ? v.toFixed(0) : String(v == null ? "" : v).trim());

  /* lê uma planilha (todas as abas) e devolve os CT-e */
  function ctesDaPlanilha(abas, nomeArquivo) {
    const ctes = [], invalidas = [];
    abas.forEach((a) => {
      const linhas = a.linhas.filter((l) => l.some((v) => String(v).trim() !== ""));
      let c = -1;
      for (let r = 0; r < Math.min(12, linhas.length); r++) if (cabOk(linhas[r].map(String))) { c = r; break; }
      if (c === -1) return;
      /* acima dos títulos vem o nome e o CNPJ da empresa a que o relatório pertence */
      let empresa = "";
      linhas.slice(0, c).forEach((l) => l.forEach((cel) => { const m = String(cel).match(/(?:cpf\s*\/\s*cnpj|cnpj)\D*(\d{14})/i); if (m) empresa = m[1]; }));
      const idx = mapear(linhas[c].map(String)), cel = (l, k) => (idx[k] === -1 ? "" : l[idx[k]]);
      linhas.slice(c + 1).forEach((l, n) => {
        const chave = digitos(textoId(cel(l, "chave")));
        if (!chave) return;
        if (chave.length < 30) return;   /* linha de explicação das colunas, não é um CT-e */
        if (chave.length !== 44) { invalidas.push("Linha " + (c + 2 + n) + ": a chave do CT-e não tem 44 números."); return; }
        const data = dataBr(cel(l, "data"));
        if (!data) { invalidas.push("Linha " + (c + 2 + n) + ": não entendi a data."); return; }
        const st = norm(cel(l, "status")), nfe = digitos(textoId(cel(l, "nfeChave")));
        ctes.push({
          chave, numero: textoId(cel(l, "numero")).slice(0, 20) || null, serie: textoId(cel(l, "serie")).slice(0, 10) || null, data_emissao: data,
          status: /cancel/.test(st) ? "cancelado" : /rejeit|deneg/.test(st) ? "rejeitado" : "autorizado",
          emitente_nome: null, emitente_doc: digitos(textoId(cel(l, "emissor"))).slice(0, 20) || chave.slice(6, 20), tomador_nome: null, tomador_doc: null, remetente_nome: null, remetente_doc: null, destino: null,
          valor: numeroBr(cel(l, "valor")), valor_icms: 0, nfe_chave: nfe.length === 44 ? nfe : null, nfe_numero: textoId(cel(l, "nfeNumero")).slice(0, 20) || null,
          tipo_operacao: texto(cel(l, "operacao"), 60), origem: "planilha", empresa_doc: empresa || null
        });
      });
    });
    return { ctes, invalidas };
  }
  const texto = (v, max) => { const s = String(v == null ? "" : v).trim(); return s ? s.slice(0, max) : null; };

  /* ---------- gravar (usado pela janela de CT-e e pela janela de notas) ---------- */
  F.planoCtes = function (ctx, lista, cancelados) {
    const ja = new Map((ctx.ctes || []).map((c) => [c.chave, c])), mapa = new Map();
    /* o mesmo CT-e em mais de um arquivo: o XML (mais completo) ganha da planilha */
    lista.forEach((c) => { const e = mapa.get(c.chave); if (!e || (e.origem !== "xml" && c.origem === "xml")) mapa.set(c.chave, Object.assign({}, c)); });
    const canc = new Set(cancelados || []);
    mapa.forEach((c) => { if (canc.has(c.chave)) c.status = "cancelado"; });
    const todos = Array.from(mapa.values()), novos = [], atualizar = [], iguais = [];
    todos.forEach((c) => {
      const e = ja.get(c.chave);
      if (!e) novos.push(c);
      else if ((c.origem === "xml" && e.origem !== "xml") || (c.status !== e.status && c.status === "cancelado")) atualizar.push(c);
      else iguais.push(c);
    });
    return { todos, novos, atualizar, iguais, repetidosNoArquivo: lista.length - mapa.size };
  };
  F.gravarCtes = async function (ctx, plano, arquivo) {
    const enviar = plano.novas ? plano.novas : plano.novos.concat(plano.atualizar);
    for (let i = 0; i < enviar.length; i += 200) {
      const lote = enviar.slice(i, i + 200).map((c) => Object.assign({ arquivo: arquivo ? String(arquivo).slice(0, 200) : null }, c));
      const r = await P.gravar(() => window.sb.from("fin_cte").upsert(lote, { onConflict: "chave" }));
      if (!r.ok) return { ok: false, feitas: i };
    }
    return { ok: true, feitas: enviar.length };
  };

  /* ---------- janela de importação de fretes ---------- */
  F.abrirImportacaoCte = function (ctx, arquivosPre) {
    const X = P.finXml;
    let lido = null;   /* { lista, eventos, invalidas, arquivos, outros } */
    const input = h("input", { type: "file", multiple: true, accept: ".zip,.xml,.xlsx,.xls,.csv,application/zip,text/xml,text/csv", id: "finArquivosCte", style: "display:none" });
    const zona = h("label", { class: "fin-zona", for: "finArquivosCte", tabindex: "0" },
      h("div", { class: "fin-zona-ic" }, P.ic("subir")),
      h("b", { text: "Escolha os arquivos de CT-e ou arraste até aqui" }),
      h("span", { class: "fraco", text: "Pasta .zip com os XML, XML soltos e/ou a planilha \"Informe de CT-e\" (Excel). Pode juntar tudo de uma vez." }));
    const progresso = h("p", { class: "fraco", role: "status" }), previa = h("div");
    const corpo = h("div", null,
      h("p", { class: "dica", text: "CT-e é o documento do frete cobrado pelo transportador (como o Mercado Envios). Se o mesmo CT-e vier no ZIP e na planilha, ele entra uma vez só, pela chave. O que vem no XML (quem paga, destino, ICMS) completa o que veio só na planilha." }),
      input, zona, progresso, previa);

    const plano = () => F.planoCtes(ctx, lido.lista, lido.eventos);
    function desenhar() {
      P.limpar(previa);
      if (!lido) return;
      const p = plano(), meus = F.meusCnpjs(ctx);
      const foraEmpresa = p.todos.filter((c) => !F.cteEhMeu(ctx, c));
      const cancel = p.todos.filter((c) => c.status === "cancelado"), validos = p.todos.filter((c) => c.status === "autorizado" && F.cteEhMeu(ctx, c));
      const datas = p.todos.map((c) => c.data_emissao).sort(), notasConhecidas = new Set((ctx.notas || []).map((n) => n.chave));
      const semNota = p.novos.filter((c) => c.nfe_chave && !notasConhecidas.has(c.nfe_chave)).length;
      const porEmit = new Map();
      validos.forEach((c) => { const k = F.nomeEmitenteCte(c), e = porEmit.get(k) || { qtd: 0, valor: 0 }; e.qtd++; e.valor += c.valor; porEmit.set(k, e); });
      F.anexar(previa,
        h("div", { class: "fin-impo-res", style: "margin-top:12px" },
          h("div", null, h("b", { text: String(p.todos.length) }), h("span", { text: "CT-e lidos" })),
          h("div", null, h("b", { text: String(p.novos.length) }), h("span", { text: "novos" })),
          h("div", null, h("b", { text: String(p.atualizar.length) }), h("span", { text: "para completar" })),
          h("div", null, h("b", { text: String(p.iguais.length) }), h("span", { text: "já estavam aqui" }))),
        h("p", { class: "dica", text: "Frete dos CT-e válidos: " + F.dinheiro(soma(validos, (c) => c.valor)) + (datas.length ? ", emitidos de " + P.fmtData(datas[0]) + " a " + P.fmtData(datas[datas.length - 1]) : "") + "." }),
        p.repetidosNoArquivo ? h("p", { class: "dica", text: p.repetidosNoArquivo + " CT-e apareciam mais de uma vez nos arquivos (ZIP e planilha, por exemplo). Contei uma vez só." }) : null,
        porEmit.size ? h("p", { class: "dica", text: "Transportadora: " + Array.from(porEmit.entries()).map(([k, e]) => k + " (" + e.qtd + ", " + F.dinheiro(e.valor) + ")").join("; ") + "." }) : null,
        cancel.length ? h("p", { class: "aviso-pagina", text: cancel.length + " CT-e cancelado(s). Eles ficam guardados mas não entram no custo." }) : null,
        foraEmpresa.length ? h("p", { class: "aviso-pagina erro", text: foraEmpresa.length + " CT-e têm como pagador outra empresa que não está na sua lista de CNPJs (" + meus.map(F.fmtDoc).join(", ") + "). Eles ficam guardados mas não entram no seu custo." }) : null,
        semNota ? h("p", { class: "dica", text: semNota + " CT-e se referem a notas fiscais que ainda não estão no painel. É normal se essas notas são de outro período." }) : null,
        lido.invalidas.length ? h("div", { class: "aviso-pagina" }, h("b", { text: lido.invalidas.length + " linha(s) não serão importadas" }), lido.invalidas.slice(0, 5).map((t) => h("p", { text: t }))) : null,
        lido.outros ? h("p", { class: "dica", text: lido.outros + " arquivo(s) que não são XML nem planilha (como PDF) foram ignorados." }) : null,
        p.todos.length ? F.tabela(["Data", "CT-e", "Para", "Nota", { t: "Frete", num: true }, "Situação"],
          p.todos.slice().sort((a, b) => (a.data_emissao < b.data_emissao ? 1 : -1)).slice(0, 8).map((c) => h("tr", null, h("td", { class: "nw", text: P.fmtData(c.data_emissao) }), h("td", { class: "nw", text: c.numero || "" }),
            h("td", { class: "truncar", text: c.destino || "" }), h("td", { class: "nw", text: c.nfe_numero || "" }), h("td", { class: "num", text: F.dinheiro(c.valor) }), h("td", { class: "nw", text: c.status })))) : null,
        p.todos.length > 8 ? h("p", { class: "dica", text: "Mostrando 8 de " + p.todos.length + "." }) : null);
    }
    async function ler(arquivos) {
      arquivos = Array.from(arquivos || []);
      if (!arquivos.length) return;
      progresso.textContent = "Lendo os arquivos...";
      const r = { lista: [], eventos: [], invalidas: [], arquivos: arquivos.length, nomes: arquivos.map((a) => a.name).join(", ").slice(0, 200), outros: 0 };
      try {
        const planilhas = arquivos.filter((a) => /\.(xlsx?|csv)$/i.test(a.name)), xmls = arquivos.filter((a) => !/\.(xlsx?|csv)$/i.test(a.name));
        for (const a of planilhas) {
          const q = ctesDaPlanilha(await F.lerAbas(a), a.name);
          r.lista = r.lista.concat(q.ctes); r.invalidas = r.invalidas.concat(q.invalidas);
        }
        if (xmls.length) {
          const x = await X.lerArquivos(xmls, (n) => { progresso.textContent = "Lendo os arquivos... " + n + " já lidos"; });
          r.lista = r.lista.concat(x.ctes.map((c) => c.cte)); r.eventos = x.eventosCte.map((e) => e.chave); r.outros = x.outros.length;
          r.invalidas = r.invalidas.concat(x.erros.map((e) => e.nome.split(" / ").pop() + ": " + e.motivo));
        }
      } catch (err) { progresso.textContent = ""; P.toast(err && err.message ? err.message : "Não consegui abrir esses arquivos.", true); return; }
      if (!r.lista.length) { progresso.textContent = ""; P.toast("Não achei nenhum CT-e nesses arquivos.", true); return; }
      lido = r;
      progresso.textContent = r.lista.length + " CT-e lidos de " + arquivos.length + " arquivo(s).";
      desenhar();
    }
    input.addEventListener("change", () => ler(input.files));
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("sobre"); }));
    zona.addEventListener("drop", (e) => ler(e.dataTransfer && e.dataTransfer.files));

    P.modal({ titulo: "Importar fretes (CT-e)", larga: true, corpo, botoes: [
      { texto: "Cancelar" },
      { texto: "Importar", classe: "p", aoClicar: async () => {
        if (!lido) { P.toast("Escolha os arquivos primeiro.", true); return false; }
        const p = plano();
        if (!p.novos.length && !p.atualizar.length) { P.toast("Todos esses CT-e já estavam no painel.", true); return false; }
        const r = await F.gravarCtes(ctx, p, lido.nomes);
        if (!r.ok) { P.toast("Parei no meio: " + r.feitas + " CT-e foram guardados. Importe de novo para continuar (os repetidos são pulados).", true); ctx.recarregar(); return false; }
        P.toast(p.novos.length + " novo(s) e " + p.atualizar.length + " completado(s)!");
        ctx.recarregar();
      } }
    ] });
    if (arquivosPre && arquivosPre.length) ler(arquivosPre);
  };

  /* ---------- a tela ---------- */
  F.telas.cte = function (ctx) {
    const raiz = h("div"), fx = ctx.faixa;
    if (!ctx.cteOk) {
      raiz.append(F.aviso("A tabela dos fretes (CT-e) ainda não existe no Supabase. Use a faixa amarela no topo (\"Copiar o SQL\"), cole no SQL Editor do projeto \"niellypinheiro portfólio\" e clique em Run. Depois atualize esta página.", "erro"));
      return raiz;
    }
    const todos = ctx.ctes || [];
    if (!todos.length) {
      raiz.append(F.cartao("Nenhum CT-e importado ainda", h("div", null,
        h("p", { text: "Importe a pasta .zip com os XML dos CT-e e/ou a planilha \"Informe de CT-e\". Eu somo o custo do frete por período, mostro por transportadora e já lanço na DRE como despesa de frete." }),
        h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoCte(ctx) }, P.ic("subir"), "Importar CT-e"))));
      return raiz;
    }
    ctx.estadoCte = ctx.estadoCte || { busca: "" };
    const noPer = (c, a, b) => c.data_emissao >= a && c.data_emissao <= b;
    const per = todos.filter((c) => noPer(c, fx.ini, fx.fim)), ant = todos.filter((c) => noPer(c, fx.ant.ini, fx.ant.fim));
    const custo = (l) => l.filter((c) => F.cteCusto(ctx, c));
    const pc = custo(per), ac = custo(ant);
    const total = soma(pc, (c) => c.valor), totalAnt = soma(ac, (c) => c.valor);
    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile("t-azul", "Frete no período", F.dinheiro(total), fx.rotulo, F.variacao(total, totalAnt), false),
      F.tile("t-ouro", "CT-e emitidos", String(pc.length), per.length - pc.length ? (per.length - pc.length) + " fora do custo (cancelados ou de outra empresa)" : "todos válidos", F.variacao(pc.length, ac.length), false),
      F.tile("t-vinho", "Média por CT-e", F.dinheiro(pc.length ? total / pc.length : 0), pc.length ? "de " + F.dinheiro(Math.min(...pc.map((c) => c.valor))) + " a " + F.dinheiro(Math.max(...pc.map((c) => c.valor))) : ""),
      F.tile("t-verde", "ICMS destacado", F.dinheiro(soma(pc, (c) => c.valor_icms)), "só dos CT-e em XML")));

    /* últimos 6 meses */
    const meses = F.mesesAtras(6);
    const porMes = meses.map((m) => dois(soma(custo(todos).filter((c) => c.data_emissao.slice(0, 7) === m), (c) => c.valor)));
    const graf = F.cartao("Frete nos últimos 6 meses", F.barras(meses.map(F.mesNome), [{ nome: "Frete", cor: F.CORES[0], valores: porMes }]));

    /* por transportadora */
    const emit = new Map();
    pc.forEach((c) => { const k = F.nomeEmitenteCte(c), e = emit.get(k) || { qtd: 0, valor: 0 }; e.qtd++; e.valor += c.valor; emit.set(k, e); });
    const transp = F.cartao("Por transportadora", F.tabela(["Transportadora", { t: "CT-e", num: true }, { t: "Frete", num: true }],
      Array.from(emit.entries()).sort((a, b) => b[1].valor - a[1].valor).map(([nome, e]) => h("tr", null, h("td", { class: "truncar", text: nome }), h("td", { class: "num", text: String(e.qtd) }), h("td", { class: "num", text: F.dinheiro(e.valor) }))),
      "Nenhum CT-e neste período."));
    raiz.append(h("div", { class: "fin-duas" }, graf, transp));

    /* conferência */
    const avisos = [];
    const porNota = new Map();
    custo(todos).forEach((c) => { if (c.nfe_chave) { const l = porNota.get(c.nfe_chave) || []; l.push(c); porNota.set(c.nfe_chave, l); } });
    const duplic = Array.from(porNota.values()).filter((l) => l.length > 1);
    duplic.slice(0, 6).forEach((l) => avisos.push("A nota " + (l[0].nfe_numero || "?") + " tem " + l.length + " CT-e (" + l.map((c) => F.dinheiro(c.valor)).join(" + ") + "). Confirme se não é frete cobrado em duplicidade."));
    const conhecidas = new Set((ctx.notas || []).map((n) => n.chave));
    const semNota = pc.filter((c) => c.nfe_chave && ctx.notas.length && !conhecidas.has(c.nfe_chave)).length;
    if (semNota) avisos.push(semNota + " CT-e do período se referem a notas fiscais que não estão no painel. Importe as notas desse mês em Importar notas.");
    const caros = pc.length > 4 ? pc.filter((c) => c.valor >= Math.max(50, (total / pc.length) * 5)).sort((a, b) => b.valor - a.valor).slice(0, 4) : [];
    caros.forEach((c) => avisos.push("CT-e " + (c.numero || "") + " de " + P.fmtData(c.data_emissao) + " custou " + F.dinheiro(c.valor) + (c.destino ? " (" + c.destino + ")" : "") + ", bem acima da média de " + F.dinheiro(total / pc.length) + "."));
    const fora = per.filter((c) => c.status === "autorizado" && !F.cteEhMeu(ctx, c)).length;
    if (fora) avisos.push(fora + " CT-e do período têm outra empresa como pagadora e não entram no seu custo.");
    raiz.append(F.cartao("Para conferir" + (avisos.length ? " (" + avisos.length + ")" : ""), avisos.length ? h("ul", { class: "fin-lista-avisos" }, avisos.map((t) => h("li", { text: t }))) : h("p", { class: "fraco", text: "Nada fora do normal neste período." })));

    /* lista */
    const busca = h("input", { type: "search", placeholder: "Buscar por nº do CT-e, nota, destino ou chave", value: ctx.estadoCte.busca, "aria-label": "Buscar" });
    const caixa = h("div");
    function tabela() {
      P.limpar(caixa);
      const q = P.semAcento(ctx.estadoCte.busca);
      let l = per.slice().sort((a, b) => (a.data_emissao < b.data_emissao ? 1 : a.data_emissao > b.data_emissao ? -1 : 0));
      if (q) l = l.filter((c) => P.semAcento([c.numero, c.nfe_numero, c.destino, c.chave, c.emitente_nome].join(" ")).includes(q));
      F.anexar(caixa, F.tabela(["Data", "CT-e", "Transportadora", "Destino", "Nota", { t: "Frete", num: true }, "Situação"],
        l.slice(0, 300).map((c) => h("tr", null, h("td", { class: "nw", text: P.fmtData(c.data_emissao) }), h("td", { class: "nw", text: c.numero || "" }), h("td", { class: "truncar", text: F.nomeEmitenteCte(c) }),
          h("td", { class: "truncar", text: c.destino || "" }), h("td", { class: "nw", text: c.nfe_numero || "" }), h("td", { class: "num", text: F.dinheiro(c.valor) }),
          h("td", { class: "nw" }, F.pilulaStatus(c.status === "autorizado" ? (F.cteEhMeu(ctx, c) ? "Autorizado" : "Outra empresa") : c.status === "cancelado" ? "Cancelado" : "Rejeitado", c.status === "autorizado" && F.cteEhMeu(ctx, c) ? "ok" : "ruim")))),
        "Nenhum CT-e neste período."), l.length > 300 ? h("p", { class: "fraco", text: "Mostrando 300 de " + l.length + ". Use a busca." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { ctx.estadoCte.busca = busca.value; tabela(); }, 150));
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" }, h("div", { class: "busca" }, P.ic("busca"), busca), h("span", { class: "espaco" }),
      h("button", { type: "button", class: "btn p", onclick: () => F.abrirImportacaoCte(ctx) }, P.ic("subir"), "Importar CT-e")), caixa);
    tabela();
    raiz.append(F.aviso("O custo dos fretes entra na DRE como despesa \"Frete (CT-e)\", pelo mês de emissão do CT-e. Se você também lança esse mesmo frete em Contas a pagar, não lance duas vezes. Os dados do cliente final (nome e CPF) não são guardados."));
    return raiz;
  };
})();
