/* =========================================================================
   Aba PROSPECÇÃO: manda o seu e-mail de apresentação para várias marcas de uma vez.
   - Os e-mails vêm da aba Marcas.
   - Quem envia de verdade é a função "enviar-emails" no Supabase (o carteiro).
     A chave do Resend vive só lá, como segredo. NUNCA escreva a chave neste arquivo.
   - O "modo rascunho" funciona sem o Resend: você copia e manda pelo seu Gmail.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;

  const EMAIL_DONA = "niellypinheirougccreator@gmail.com";
  const NOME_DONA = "Nielly Pinheiro";
  const LINK_PORTFOLIO = "https://niellypinheiro.github.io/portfolio-ugc/";
  const LOTE = 100;
  const CHAVE_RASCUNHO = "prospeccao_rascunho_v1";
  const CHAVE_TESTE = "prospeccao_teste_v1";

  const SITUACOES = { lead: "Lead", conversando: "Conversando", cliente: "Cliente", parada: "Parada" };
  const nomeSituacao = (s) => SITUACOES[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : "Sem situação");

  const TEXTO_MODELO = "Oi, {{nome}}! Tudo bem?\n\n" +
    "Eu sou a Nielly Pinheiro, criadora de conteúdo UGC. Faço vídeos e fotos com cara de gente de verdade, que mostram o produto no dia a dia e ajudam a {{marca}} a vender mais.\n\n" +
    "Vi a {{marca}} e senti que o nosso estilo combina muito. Se fizer sentido para vocês, posso mandar algumas ideias de conteúdo pensadas para a marca.\n\n" +
    "Você pode ver o meu portfólio pelo link abaixo.\n\n" +
    "Um abraço,\nNielly Pinheiro";
  const RODAPE = "Se você não quiser receber mais e-mails meus, é só responder SAIR.";

  /* ---------- ferramentas de texto ---------- */
  const escapar = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const trocar = (texto, nome, marca) => String(texto || "").split("{{nome}}").join(nome).split("{{marca}}").join(marca);
  function extrairEmail(v) {
    const m = String(v || "").match(/[^\s@;,<>()"']+@[^\s@;,<>()"']+\.[^\s@;,<>()"']{2,}/);
    return m ? m[0].toLowerCase() : "";
  }
  function assinatura(s) { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return String(x); }
  function guardarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento: segue sem salvar */ } }
  function lerLocal(k) { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  function guardarSessao(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* segue */ } }
  function lerSessao(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  const dataHora = (iso) => { try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
  const traco = "-";

  function linkar(s) {
    return s.replace(/(https?:\/\/[^\s<]+)/g, (u) => {
      let fim = "";
      const m = u.match(/[.,;:!?)]+$/);
      if (m) { fim = m[0]; u = u.slice(0, -fim.length); }
      return '<a href="' + u + '" style="color:#6d2434;">' + u + "</a>" + fim;
    });
  }
  function linkBotaoOk(l) {
    l = String(l || "").trim();
    if (!l) return "";
    if (!/^https?:\/\//i.test(l)) l = "https://" + l;
    return /^https?:\/\/[^\s]+\.[^\s]+/.test(l) ? l : "";
  }

  /* MODO 1: monta o e-mail limpo a partir do texto simples */
  function montarHtmlFacil(est) {
    const paragrafos = String(est.texto || "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/).filter((p) => p.trim())
      .map((p) => '<p style="margin:0 0 16px 0;">' + linkar(escapar(p.trim())).replace(/\n/g, "<br>") + "</p>").join("\n");
    const link = linkBotaoOk(est.botaoLink);
    const textoBotao = String(est.botaoTexto || "").trim();
    const botao = (link && textoBotao)
      ? '<p style="margin:24px 0;"><a href="' + escapar(link) + '" style="display:inline-block;padding:12px 24px;background:#6d2434;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">' + escapar(textoBotao) + "</a></p>"
      : "";
    return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n' +
      '<body style="margin:0;padding:0;background:#ffffff;">\n' +
      '<div style="max-width:560px;margin:0 auto;padding:24px 20px;background:#ffffff;color:#222222;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">\n' +
      paragrafos + "\n" + botao + "\n" +
      '<p style="margin:32px 0 0 0;padding-top:12px;border-top:1px solid #eeeeee;font-size:12px;color:#888888;">' + RODAPE + "</p>\n" +
      "</div>\n</body>\n</html>";
  }

  /* Versão só texto (para o modo rascunho e para copiar) */
  function htmlParaTexto(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("style,script,head").forEach((e) => e.remove());
    doc.querySelectorAll("a[href]").forEach((a) => {
      const t = a.textContent.trim(), u = a.getAttribute("href");
      if (u && t !== u && !/^mailto:/i.test(u)) a.textContent = t + " (" + u + ")";
    });
    doc.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
    doc.querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,li,tr").forEach((e) => e.append("\n\n"));
    return (doc.body.textContent || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  /* ---------- ler tabelas sem quebrar a aba se faltar alguma ---------- */
  async function ler(tabela, montar) {
    try {
      const { data, error } = await montar(window.sb.from(tabela));
      if (error) throw error;
      return { dados: data || [], ok: true };
    } catch (e) {
      console.error(tabela, e);
      return { dados: [], ok: false, erro: e };
    }
  }
  async function lerEnvios() {
    let tudo = [];
    for (let i = 0; i < 10; i++) {
      const r = await ler("email_envios", (t) => t.select("id,marca_id,email,assunto,status,erro,resend_id,criado_em")
        .order("criado_em", { ascending: false }).range(i * 1000, i * 1000 + 999));
      if (!r.ok) return i ? { dados: tudo, ok: true } : r;
      tudo = tudo.concat(r.dados);
      if (r.dados.length < 1000) break;
    }
    return { dados: tudo, ok: true };
  }
  async function carregarDados() {
    const m = await P.carregar("marcas", (t) => t.select("*").order("nome"));
    const e = await lerEnvios();
    const o = await ler("email_optout", (t) => t.select("email,criado_em").order("criado_em", { ascending: false }));
    return { marcas: m.dados, marcasOk: m.ok, envios: e.dados, enviosOk: e.ok, optouts: o.dados, optoutOk: o.ok };
  }

  /* ---------- falar com o carteiro (função enviar-emails) ---------- */
  async function chamarCarteiro(destinatarios, assunto, html, pular) {
    let resposta;
    try {
      resposta = await window.sb.functions.invoke("enviar-emails", { body: { destinatarios, assunto, html, pularJaEnviados: pular } });
    } catch (e) {
      throw new Error("Não consegui falar com o carteiro (a função enviar-emails do Supabase). Confira a internet e se a função foi publicada.");
    }
    if (resposta.error) {
      let msg = "";
      try { const j = await resposta.error.context.json(); msg = (j && j.erro) || ""; } catch (e) { /* sem detalhe */ }
      if (/RESEND_API_KEY/.test(msg)) msg = "Falta colar a chave do Resend nos segredos da função, no painel do Supabase. O passo a passo está no aviso amarelo da aba.";
      throw new Error(msg || "Não consegui falar com o carteiro (a função enviar-emails do Supabase). Confira a internet e se a função foi publicada.");
    }
    return resposta.data || {};
  }

  async function copiarTexto(texto, msgOk) {
    try { await navigator.clipboard.writeText(texto); P.toast(msgOk || "Copiado"); }
    catch (e) { P.toast("Não consegui copiar sozinho. Selecione o texto e use Ctrl+C.", true); }
  }

  /* ---------- a aba ---------- */
  P.abas.prospeccao = {
    async renderizar(raiz) {
      const salvo = lerLocal(CHAVE_RASCUNHO) || {};
      const est = Object.assign({
        modo: "facil", assunto: "Parceria de conteúdo UGC com a {{marca}}", texto: TEXTO_MODELO,
        botaoTexto: "Ver meu portfólio", botaoLink: LINK_PORTFOLIO, html: "",
        dest: "selecionadas", pular: true, envio: "resend"
      }, salvo);
      let D = await carregarDados();
      let ocupado = false;
      let indiceFila = 0;

      /* ----- dados derivados ----- */
      const tabelasOk = () => D.enviosOk && D.optoutOk;
      const optoutSet = () => new Set(D.optouts.map((o) => String(o.email).toLowerCase()));
      const marcasComEmail = () => D.marcas.filter((m) => extrairEmail(m.email));
      const enviosReais = () => D.envios.filter((x) => String(x.email).toLowerCase() !== EMAIL_DONA);
      const okReais = () => enviosReais().filter((x) => x.status === "ok");
      const falhasReais = () => enviosReais().filter((x) => x.status === "erro");
      const marcaPorId = () => new Map(D.marcas.map((m) => [m.id, m]));
      const temColunaSel = () => !D.marcas.length || Object.prototype.hasOwnProperty.call(D.marcas[0], "selecionada");
      const situacoesExistentes = () => {
        const vistos = [];
        D.marcas.forEach((m) => { if (m.situacao && !vistos.includes(m.situacao)) vistos.push(m.situacao); });
        const ordem = Object.keys(SITUACOES);
        return vistos.sort((a, b) => (ordem.indexOf(a) === -1 ? 99 : ordem.indexOf(a)) - (ordem.indexOf(b) === -1 ? 99 : ordem.indexOf(b)));
      };
      const htmlBruto = () => (est.modo === "html" ? est.html : montarHtmlFacil(est));
      const exemplo = () => {
        const m = D.marcas.find((x) => x.selecionada && extrairEmail(x.email)) || marcasComEmail()[0];
        return m ? m.nome : "Lumi Casa";
      };

      function marcasDaOpcao(op) {
        if (op === "selecionadas") return D.marcas.filter((m) => m.selecionada);
        if (op === "todas") return D.marcas.slice();
        if (op.indexOf("sit:") === 0) return D.marcas.filter((m) => m.situacao === op.slice(4));
        return [];
      }
      /* Quem realmente recebe, e quem ficou de fora e por quê */
      function calcularDestinatarios(op) {
        if (op === "teste") {
          const ex = exemplo();
          return { itens: [{ id: null, email: EMAIL_DONA, nome: ex, marca: ex, saudacao: ex }], semEmail: 0, jaReceberam: 0, descadastrados: 0, repetidos: 0, total: 1 };
        }
        const base = marcasDaOpcao(op);
        const opt = optoutSet();
        const jaTem = new Set(D.envios.filter((x) => x.status === "ok").map((x) => String(x.email).toLowerCase() + "|" + x.assunto));
        const vistos = new Set();
        const r = { itens: [], semEmail: 0, jaReceberam: 0, descadastrados: 0, repetidos: 0, total: base.length };
        base.forEach((m) => {
          const e = extrairEmail(m.email);
          if (!e) { r.semEmail++; return; }
          if (vistos.has(e)) { r.repetidos++; return; }
          vistos.add(e);
          if (opt.has(e)) { r.descadastrados++; return; }
          if (est.pular && jaTem.has(e + "|" + trocar(est.assunto.trim(), m.nome, m.nome))) { r.jaReceberam++; return; }
          r.itens.push({ id: m.id, email: e, nome: m.nome, marca: m.nome, saudacao: m.nome });
        });
        return r;
      }
      const nomeDaOpcao = (op) => op === "selecionadas" ? "só as marcas selecionadas" : op === "teste" ? "só eu (teste)" :
        op === "todas" ? "todas as marcas com e-mail" : 'a situação "' + nomeSituacao(op.slice(4)) + '"';

      /* ----- pedaços da tela ----- */
      const capaBox = h("div"), cartoesBox = h("div"), avisoBox = h("div"), corpoBox = h("div"), historicoBox = h("div");
      let opcoesBox, resumoDestBox, envioBox, previaAssunto, previaCorpo, previaAssuntoCheia;
      let botaoTeste, botaoDisparo, notaTeste;

      function desenharCapa() {
        const total = D.enviosOk ? okReais().length : 0;
        P.limpar(capaBox).append(h("section", { class: "prosp-capa" },
          h("div", { class: "prosp-capa-topo" },
            h("div", { class: "prosp-capa-icone" }, P.ic("prospeccao")),
            h("div", { class: "prosp-capa-texto" },
              h("h2", { text: "Prospecção" }),
              h("p", { text: "Mande o seu e-mail de apresentação para várias marcas de uma vez, com o nome de cada uma no texto." })),
            h("div", { class: "prosp-capa-total" },
              h("b", { text: total ? P.numero(total) : traco }),
              h("span", { text: "enviados até agora" }))),
          h("div", { class: "prosp-capa-tags" },
            h("span", { text: "teste antes sempre" }),
            h("span", { text: "a chave vive no Supabase" }),
            h("span", { text: "quem responde SAIR sai da lista" }))));
      }

      function desenharCartoes() {
        const comEmail = marcasComEmail().length;
        const aEnviar = calcularDestinatarios(est.dest).itens.length;
        const cartao = (cor, numero, nome, contexto) => h("div", { class: "stat c-" + cor },
          h("b", { text: numero }), h("span", { class: "stat-nome", text: nome }), h("span", { class: "stat-ctx", text: contexto }));
        const emailsUnicos = (lista) => new Set(lista.map((x) => String(x.email).toLowerCase())).size;
        P.limpar(cartoesBox).append(h("div", { class: "prosp-stats" },
          cartao("main", D.marcasOk ? P.numero(comEmail) : traco, "marcas na minha base com e-mail", "de " + P.numero(D.marcas.length) + " marcas no total"),
          cartao("verde", P.numero(aEnviar), "a enviar", "na lista escolhida agora"),
          cartao("ouro", D.enviosOk ? P.numero(emailsUnicos(okReais())) : traco, "já receberam", "e-mails diferentes, sem contar seus testes"),
          cartao("azul", D.enviosOk ? P.numero(falhasReais().length) : traco, "falhas", "e-mails que não saíram"),
          cartao("verm", D.optoutOk ? P.numero(D.optouts.length) : traco, "descadastrados", "pediram para sair, nunca mais recebem")));
      }

      function copiarDisparoSql() {
        fetch("../disparo.sql", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("sem arquivo"); return r.text(); })
          .then((t) => navigator.clipboard.writeText(t).then(() => P.toast("SQL copiado. Cole no Supabase e clique em Run.")))
          .catch(() => { window.open("../disparo.sql", "_blank", "noopener"); P.toast("Abri o arquivo: aperte Ctrl+A, depois Ctrl+C.", true); });
      }
      function desenharAvisos() {
        P.limpar(avisoBox);
        if (!tabelasOk()) {
          const falta = [!D.enviosOk && '"email_envios"', !D.optoutOk && '"email_optout"'].filter(Boolean).join(" e ");
          avisoBox.append(h("div", { class: "aviso-pagina", role: "alert" },
            h("b", { text: "Falta um passo para o envio funcionar" }),
            h("p", { text: "O seu banco ainda não tem a tabela " + falta + ". É o passo do arquivo disparo.sql, que se faz uma vez só. Enquanto isso, o resto do painel continua funcionando e o envio fica travado (é de propósito, para não mandar sem registrar)." }),
            h("ol", { class: "passos" },
              h("li", null, "Clique em ", h("button", { type: "button", class: "btn", onclick: copiarDisparoSql }, "Copiar o disparo.sql")),
              h("li", null, "Abra o editor do Supabase: ", h("a", { class: "btn", href: window.BANCO.editorSql, target: "_blank", rel: "noopener noreferrer", text: "Abrir o SQL Editor" })),
              h("li", { text: "Clique na caixa grande, cole com Ctrl+V e clique em Run. Deve aparecer Success." }),
              h("li", null, "Volte aqui e clique em ", h("button", { type: "button", class: "btn p", onclick: () => P.ir("prospeccao") }, "Recarregar")))));
        }
        if (D.marcasOk && !temColunaSel()) {
          avisoBox.append(h("div", { class: "aviso-pagina", role: "alert", text: 'A tabela de marcas ainda não tem a coluna "selecionada". Rode o arquivo disparo.sql no Supabase para a seleção funcionar. As outras opções de lista continuam funcionando.' }));
        }
      }

      /* ---------- pré-visualização ---------- */
      function documentoPrevia() {
        const ex = exemplo();
        const html = trocar(htmlBruto(), ex, ex);
        const base = '<base target="_blank">';
        return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + base) : base + html;
      }
      function janelaEmail(id) {
        const ex = exemplo();
        const assunto = trocar(est.assunto, ex, ex).trim();
        const moldura = h("iframe", { class: "prosp-moldura", title: "Como o e-mail vai aparecer", sandbox: "allow-same-origin allow-popups" });
        moldura.addEventListener("load", () => {
          try { moldura.style.height = Math.max(200, moldura.contentDocument.documentElement.scrollHeight + 4) + "px"; } catch (e) { /* mantém a altura padrão */ }
        });
        moldura.srcdoc = documentoPrevia();
        return {
          moldura,
          el: h("div", { class: "prosp-email", id },
            h("div", { class: "prosp-email-cab" },
              h("div", { class: "prosp-avatar", "aria-hidden": "true", text: NOME_DONA.charAt(0) }),
              h("div", { class: "prosp-email-quem" },
                h("b", { class: "prosp-email-assunto", text: assunto || "(sem assunto)" }),
                h("span", { text: NOME_DONA + "  ·  " + EMAIL_DONA }),
                h("span", { class: "fraco", text: "para você" }))),
            h("div", { class: "prosp-email-corpo" }, moldura))
        };
      }
      function atualizarPrevia() {
        if (!previaCorpo) return;
        const j = janelaEmail("previaEmail");
        P.limpar(previaCorpo).append(j.el);
      }
      function abrirTelaCheia() {
        const j = janelaEmail("previaCheia");
        const camada = h("div", { class: "prosp-cheia", role: "dialog", "aria-modal": "true", "aria-label": "E-mail em tela cheia" },
          h("button", { type: "button", class: "btn prosp-fechar", onclick: () => fechar() }, P.ic("x"), "Fechar"),
          h("div", { class: "prosp-cheia-miolo" }, j.el));
        function tecla(e) { if (e.key === "Escape") { e.stopPropagation(); fechar(); } }
        function fechar() { document.removeEventListener("keydown", tecla, true); camada.remove(); }
        camada.addEventListener("mousedown", (e) => { if (e.target === camada || e.target.classList.contains("prosp-cheia-miolo")) fechar(); });
        document.addEventListener("keydown", tecla, true);
        document.body.append(camada);
      }

      /* ---------- destinatários ---------- */
      function opcoesDisponiveis() {
        const lista = [["selecionadas", "Só as marcas selecionadas"], ["teste", "Só eu (teste)"], ["todas", "Todas as marcas com e-mail"]];
        situacoesExistentes().forEach((s) => lista.push(["sit:" + s, "Só as marcas " + nomeSituacao(s).toLowerCase()]));
        return lista;
      }
      function desenharOpcoes() {
        P.limpar(opcoesBox);
        opcoesDisponiveis().forEach(([id, rotulo]) => {
          const r = calcularDestinatarios(id);
          const n = id === "teste" ? 1 : r.itens.length + r.jaReceberam + r.descadastrados;
          const radio = h("input", { type: "radio", name: "prosp-dest", value: id, checked: est.dest === id });
          radio.addEventListener("change", () => { est.dest = id; salvarRascunho(); desenharOpcoes(); aoMudarLista(); });
          opcoesBox.append(h("label", { class: "prosp-opcao" + (est.dest === id ? " marcada" : "") },
            radio, h("span", { class: "prosp-opcao-nome", text: rotulo }),
            h("span", { class: "prosp-opcao-n", text: id === "teste" ? "só você" : P.numero(n) + (n === 1 ? " marca" : " marcas") })));
        });
      }
      function desenharResumoDest() {
        const r = calcularDestinatarios(est.dest);
        P.limpar(resumoDestBox);
        const linhas = [];
        if (r.semEmail) linhas.push(r.semEmail + (r.semEmail === 1 ? " marca fica de fora" : " marcas ficam de fora") + " por falta de e-mail");
        if (r.jaReceberam) linhas.push(r.jaReceberam + (r.jaReceberam === 1 ? " já recebeu" : " já receberam") + " este mesmo assunto");
        if (r.descadastrados) linhas.push(r.descadastrados + (r.descadastrados === 1 ? " pediu" : " pediram") + " para sair");
        if (r.repetidos) linhas.push(r.repetidos + " com e-mail repetido (a agência recebe uma vez só)");
        resumoDestBox.append(h("div", { class: "prosp-contagem" },
          h("b", { text: String(r.itens.length) }),
          h("span", { text: est.dest === "teste" ? " e-mail, para você mesma" : (r.itens.length === 1 ? " marca vai receber" : " marcas vão receber") })));
        if (linhas.length) resumoDestBox.append(h("p", { class: "dica", text: linhas.join(". ") + "." }));
        if (est.dest === "selecionadas" && !marcasDaOpcao("selecionadas").length) {
          resumoDestBox.append(h("div", { class: "aviso-pagina" },
            h("b", { text: "Nenhuma marca selecionada" }),
            h("p", { text: "Vá até a aba Marcas, marque as caixinhas de quem deve receber e volte aqui." }),
            h("button", { type: "button", class: "btn p", onclick: () => P.ir("marcas") }, P.ic("marcas"), "Ir para Marcas")));
        }
      }
      function aoMudarLista() { desenharResumoDest(); desenharCartoes(); atualizarBotoes(); if (est.envio === "rascunho") desenharFila(); }

      /* ---------- editor ---------- */
      const salvarRascunho = P.debounce(() => guardarLocal(CHAVE_RASCUNHO, est), 250);
      function aoDigitar() { salvarRascunho(); atualizarPrevia(); desenharResumoDest(); desenharCartoes(); atualizarBotoes(); if (est.envio === "rascunho") desenharFila(); }

      function inserirNoCursor(campo, texto) {
        const ini = campo.selectionStart == null ? campo.value.length : campo.selectionStart;
        const fim = campo.selectionEnd == null ? ini : campo.selectionEnd;
        campo.setRangeText(texto, ini, fim, "end");
        campo.focus();
        campo.dispatchEvent(new Event("input", { bubbles: true }));
      }
      function botoesVariaveis(campoAlvo) {
        return h("div", { class: "prosp-vars" },
          h("span", { class: "fraco", text: "Clique para colocar no texto:" }),
          h("button", { type: "button", class: "btn", onclick: () => inserirNoCursor(campoAlvo(), "{{nome}}"), text: "{{nome}}" }),
          h("button", { type: "button", class: "btn", onclick: () => inserirNoCursor(campoAlvo(), "{{marca}}"), text: "{{marca}}" }));
      }

      const editorBox = h("div");
      function desenharEditor() {
        const assunto = h("input", { type: "text", value: est.assunto, maxlength: "200", autocomplete: "off", placeholder: "Ex.: Parceria de conteúdo UGC com a {{marca}}" });
        assunto.addEventListener("input", () => { est.assunto = assunto.value; aoDigitar(); });
        const alternar = h("div", { class: "filtros", role: "group", "aria-label": "Jeito de escrever o e-mail" },
          h("button", { type: "button", "aria-pressed": String(est.modo === "facil"), text: "Texto fácil", onclick: () => { est.modo = "facil"; salvarRascunho(); desenharEditor(); atualizarPrevia(); atualizarBotoes(); if (est.envio === "rascunho") desenharFila(); } }),
          h("button", { type: "button", "aria-pressed": String(est.modo === "html"), text: "HTML", onclick: () => { est.modo = "html"; salvarRascunho(); desenharEditor(); atualizarPrevia(); atualizarBotoes(); if (est.envio === "rascunho") desenharFila(); } }));
        let campoTexto;
        let miolo;
        if (est.modo === "facil") {
          campoTexto = h("textarea", { class: "prosp-texto", placeholder: "Escreva aqui o seu e-mail. Uma linha em branco separa os parágrafos.", "aria-label": "Texto do e-mail" });
          campoTexto.value = est.texto;
          campoTexto.addEventListener("input", () => { est.texto = campoTexto.value; aoDigitar(); });
          const bTexto = h("input", { type: "text", value: est.botaoTexto, maxlength: "60", placeholder: "Ex.: Ver meu portfólio" });
          const bLink = h("input", { type: "url", value: est.botaoLink, maxlength: "500", placeholder: "https://..." });
          bTexto.addEventListener("input", () => { est.botaoTexto = bTexto.value; aoDigitar(); });
          bLink.addEventListener("input", () => { est.botaoLink = bLink.value; aoDigitar(); });
          miolo = h("div", null,
            P.campo("Texto do e-mail", campoTexto, "Cada marca recebe o próprio nome onde estiver {{nome}} ou {{marca}}. Links viram clicáveis sozinhos. O aviso para responder SAIR entra no rodapé automaticamente."),
            botoesVariaveis(() => campoTexto),
            h("p", { class: "sub-rotulo", text: "Botão (opcional)" }),
            h("div", { class: "grade2" }, P.campo("Texto do botão", bTexto), P.campo("Link do botão", bLink, "Só aparece se os dois estiverem preenchidos.")));
        } else {
          campoTexto = h("textarea", { class: "prosp-texto prosp-codigo", spellcheck: "false", placeholder: "Cole aqui o HTML do seu e-mail", "aria-label": "HTML do e-mail" });
          campoTexto.value = est.html;
          campoTexto.addEventListener("input", () => { est.html = campoTexto.value; aoDigitar(); });
          miolo = h("div", null,
            h("div", { class: "prosp-modelo" },
              h("button", { type: "button", class: "btn", onclick: async () => {
                if (est.html.trim() && !(await P.confirmar("Isso vai trocar o HTML que está aí pelo modelo pronto. Continuar?", { botao: "Trocar pelo modelo", titulo: "Começar do modelo" }))) return;
                est.html = montarHtmlFacil(est); salvarRascunho(); desenharEditor(); atualizarPrevia(); atualizarBotoes();
              } }, "Começar do modelo pronto")),
            P.campo("HTML do e-mail", campoTexto, "O que você colar sai exatamente assim. {{nome}} e {{marca}} funcionam. Deixe a frase com a palavra SAIR no rodapé, é o jeito de a marca pedir para não receber mais."),
            botoesVariaveis(() => campoTexto));
        }
        P.limpar(editorBox).append(
          h("div", { class: "prosp-modo" }, h("span", { class: "fraco", text: "Como quer escrever?" }), alternar),
          P.campo("Assunto", assunto),
          miolo);
      }

      /* ---------- enviar ---------- */
      const vazioHtml = () => !String(htmlBruto()).trim() || (est.modo === "facil" && !String(est.texto).trim());
      function problemas() {
        const p = [];
        if (!est.assunto.trim()) p.push("Escreva o assunto.");
        if (vazioHtml()) p.push("Escreva o texto do e-mail.");
        return p;
      }
      const assinaturaAtual = () => assinatura(est.assunto.trim() + "\n" + htmlBruto());
      const testeFeito = () => lerSessao(CHAVE_TESTE) === assinaturaAtual();

      function atualizarBotoes() {
        if (!botaoTeste) return;
        const r = calcularDestinatarios(est.dest);
        const erros = problemas();
        const feito = testeFeito();
        botaoTeste.disabled = ocupado || !tabelasOk() || erros.length > 0;
        botaoDisparo.disabled = ocupado || !tabelasOk() || erros.length > 0 || !feito || r.itens.length === 0;
        P.limpar(botaoDisparo).append(P.ic("prospeccao"), est.dest === "teste" ? "Enviar (só para mim)" : "Disparar para " + r.itens.length + (r.itens.length === 1 ? " marca" : " marcas"));
        notaTeste.className = "prosp-nota" + (feito ? " ok" : "");
        notaTeste.textContent = erros.length ? erros[0]
          : feito ? "Teste enviado com este texto. Confira no celular e, se estiver tudo certo, pode disparar."
          : "Antes de disparar, envie um teste para você. Se mudar o texto, envie outro teste.";
      }

      async function enviarTeste() {
        if (ocupado) return;
        ocupado = true; atualizarBotoes();
        const ex = exemplo();
        const inicio = new Date().toISOString();
        try {
          const res = await chamarCarteiro([{ id: null, email: EMAIL_DONA, nome: ex, marca: ex, saudacao: ex }], "[TESTE] " + est.assunto.trim(), htmlBruto(), false);
          if (res.enviados > 0) {
            guardarSessao(CHAVE_TESTE, assinaturaAtual());
            P.toast("Teste enviado para " + EMAIL_DONA + ". Abra no celular para conferir.");
          } else {
            const r = await ler("email_envios", (t) => t.select("erro").eq("email", EMAIL_DONA).gte("criado_em", inicio).order("criado_em", { ascending: false }).limit(1));
            const motivo = r.dados[0] && r.dados[0].erro;
            P.toast("O teste não saiu" + (motivo ? ": " + motivo : ".") + " Veja o histórico abaixo.", true);
          }
        } catch (e) { P.toast(e.message, true); }
        ocupado = false;
        await recarregarDados();
        atualizarBotoes();
      }

      function avisoRodape() {
        if (est.modo !== "html") return true;
        return /\bSAIR\b/i.test(htmlBruto());
      }
      async function disparar() {
        if (ocupado) return;
        const r = calcularDestinatarios(est.dest);
        if (!r.itens.length) { P.toast("Não há ninguém para receber nesta lista.", true); return; }
        if (!testeFeito()) { P.toast("Envie um teste para você com este texto antes de disparar.", true); return; }
        if (!avisoRodape()) {
          if (!(await P.confirmar("O seu HTML não tem a palavra SAIR. Sem ela, quem não quiser receber não sabe como pedir. Quer disparar mesmo assim?", { botao: "Disparar mesmo assim", perigo: true, titulo: "Falta o aviso SAIR" }))) return;
        }
        const ok = await P.confirmar("Vai para " + r.itens.length + (r.itens.length === 1 ? " marca" : " marcas") + ", da lista \"" + nomeDaOpcao(est.dest) + "\". Não dá para desfazer depois que sair. Enviar agora?",
          { botao: "Enviar para " + r.itens.length, titulo: "Confirmar disparo" });
        if (!ok) return;

        ocupado = true; atualizarBotoes();
        const inicio = new Date().toISOString();
        const total = r.itens.length;
        const somas = { enviados: 0, falhas: 0, pulados: 0 };
        let cota = false, restantes = 0, erroGeral = "";
        const barra = h("i"), texto = h("span", { text: "Enviando 0 de " + total + "..." });
        P.limpar(envioBox).append(h("div", { class: "prosp-progresso", role: "status" }, h("div", { class: "prosp-barra" }, barra), texto));
        for (let i = 0; i < total; i += LOTE) {
          const lote = r.itens.slice(i, i + LOTE);
          try {
            const res = await chamarCarteiro(lote, est.assunto.trim(), htmlBruto(), est.pular);
            somas.enviados += res.enviados || 0; somas.falhas += res.falhas || 0; somas.pulados += res.pulados || 0;
            if (res.cotaEsgotada) { cota = true; restantes = ((res.faltando || []).length) + Math.max(0, total - (i + lote.length)); break; }
          } catch (e) { erroGeral = e.message; restantes = total - i; break; }
          const feitos = Math.min(total, i + lote.length);
          barra.style.width = Math.round((feitos / total) * 100) + "%";
          texto.textContent = "Enviando " + feitos + " de " + total + "...";
        }
        await marcarContatoDeHoje(inicio);
        ocupado = false;
        const eraSelecao = est.dest === "selecionadas";
        await recarregarDados();
        desenharEnvio();
        await mostrarResumo(somas, cota, restantes, erroGeral);
        if (eraSelecao && somas.enviados > 0 && await P.confirmar("Quer limpar a seleção de marcas agora? Se ainda vai continuar com elas, deixe como está.", { botao: "Limpar seleção", titulo: "Limpar seleção?" })) {
          const ids = D.marcas.filter((m) => m.selecionada).map((m) => m.id);
          for (let i = 0; i < ids.length; i += 100) await P.gravar(() => window.sb.from("marcas").update({ selecionada: false }).in("id", ids.slice(i, i + 100)));
          await recarregarDados();
          P.toast("Seleção limpa");
        }
      }
      /* Anota nas marcas que receberam hoje (o carteiro já guarda a data do envio; aqui atualizo o "último contato") */
      async function marcarContatoDeHoje(desde) {
        try {
          const r = await ler("email_envios", (t) => t.select("marca_id").eq("status", "ok").gte("criado_em", desde).limit(1000));
          const ids = Array.from(new Set(r.dados.map((x) => x.marca_id).filter(Boolean)));
          for (let i = 0; i < ids.length; i += 100) await window.sb.from("marcas").update({ ultimo_contato: P.hoje() }).in("id", ids.slice(i, i + 100));
        } catch (e) { console.error(e); }
      }
      function mostrarResumo(somas, cota, restantes, erroGeral) {
        return new Promise((resolve) => {
          const corpo = h("div", { class: "prosp-resumo" },
            h("div", { class: "prosp-resumo-num" },
              h("div", { class: "c-verde" }, h("b", { text: String(somas.enviados) }), h("span", { text: "enviados" })),
              h("div", { class: "c-azul" }, h("b", { text: String(somas.falhas) }), h("span", { text: "falharam" })),
              h("div", { class: "c-ouro" }, h("b", { text: String(somas.pulados) }), h("span", { text: "pulados" }))),
            somas.falhas ? h("p", { class: "dica", text: "Os e-mails que falharam ficam no histórico, com o motivo de cada um." }) : null,
            cota ? h("div", { class: "aviso-pagina" },
              h("b", { text: "O limite de e-mails do dia no Resend acabou" }),
              h("p", { text: "Foram " + somas.enviados + " enviados e faltam " + restantes + ". Volte amanhã, cole o mesmo assunto e o mesmo texto e deixe marcada a caixinha \"pular quem já recebeu este mesmo assunto\". Assim, quem já recebeu não recebe de novo." })) : null,
            erroGeral ? h("div", { class: "aviso-pagina erro", role: "alert" }, h("b", { text: "O envio parou" }), h("p", { text: erroGeral + " Faltaram " + restantes + ". O que já saiu está no histórico." })) : null);
          P.modal({ titulo: "Resumo do disparo", corpo, botoes: [{ texto: "Fechar", classe: "p" }], aoFechar: resolve });
        });
      }

      /* ---------- modo rascunho (sem Resend) ---------- */
      const filaBox = h("div");
      function textoDoRascunho(item) {
        const bruto = trocar(htmlBruto(), item.saudacao, item.marca);
        return est.modo === "facil" ? (function () {
          const link = linkBotaoOk(est.botaoLink), tb = String(est.botaoTexto || "").trim();
          return trocar(String(est.texto || "").trim(), item.saudacao, item.marca) + ((link && tb) ? "\n\n" + tb + ": " + link : "") + "\n\n" + RODAPE;
        })() : htmlParaTexto(bruto);
      }
      function desenharFila() {
        P.limpar(filaBox);
        if (est.envio !== "rascunho") return;
        const r = calcularDestinatarios(est.dest);
        const fila = est.dest === "teste" ? [] : r.itens;
        const erros = problemas();
        if (erros.length) { filaBox.append(h("p", { class: "dica", text: erros[0] })); return; }
        if (!fila.length) {
          filaBox.append(h("div", { class: "vazio", text: est.dest === "teste" ? "No modo rascunho, escolha uma lista de marcas (a opção \"só eu\" é só para o teste pelo Resend)."
            : r.jaReceberam ? "Fila vazia: todas as marcas desta lista já receberam este assunto. Escolha outra lista ou mude o assunto."
            : "Ninguém na fila. Escolha uma lista com marcas acima." }));
          return;
        }
        if (indiceFila >= fila.length) indiceFila = fila.length - 1;
        if (indiceFila < 0) indiceFila = 0;
        const item = fila[indiceFila];
        const assuntoFinal = trocar(est.assunto.trim(), item.saudacao, item.marca);
        const textoFinal = textoDoRascunho(item);
        const areaTexto = h("textarea", { class: "prosp-texto", readonly: true, "aria-label": "Texto pronto para copiar" });
        areaTexto.value = textoFinal;
        const linkGmail = "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(item.email) + "&su=" + encodeURIComponent(assuntoFinal) + "&body=" + encodeURIComponent(textoFinal);
        filaBox.append(h("div", { class: "prosp-fila" },
          h("div", { class: "prosp-fila-topo" },
            h("b", { text: "Marca " + (indiceFila + 1) + " de " + fila.length }),
            h("span", { class: "fraco", text: "Cada uma que você marcar como enviada sai da fila." })),
          h("p", { class: "prosp-fila-marca" }, h("b", { text: item.marca }), h("span", { class: "fraco", text: "  " + item.email })),
          P.campo("Assunto", h("input", { type: "text", value: assuntoFinal, readonly: true })),
          P.campo("Texto", areaTexto),
          h("div", { class: "prosp-fila-botoes" },
            h("button", { type: "button", class: "btn", onclick: () => copiarTexto(textoFinal, "Texto copiado") }, P.ic("copiar"), "Copiar texto"),
            h("a", { class: "btn p", href: linkGmail, target: "_blank", rel: "noopener noreferrer" }, P.ic("prospeccao"), "Abrir no Gmail"),
            h("button", { type: "button", class: "btn", onclick: async () => {
              const gravou = await P.gravar(() => window.sb.from("email_envios").insert({ marca_id: item.id, email: item.email, assunto: assuntoFinal, status: "ok", resend_id: "manual" }));
              if (!gravou.ok) return;
              await P.gravar(() => window.sb.from("marcas").update({ ultimo_envio: new Date().toISOString(), ultimo_contato: P.hoje() }).eq("id", item.id));
              P.toast("Marcada como enviada");
              await recarregarDados();
              desenharFila();
            } }, P.ic("check"), "Marcar como enviado"),
            h("button", { type: "button", class: "btn", disabled: fila.length < 2, onclick: () => { indiceFila = (indiceFila + 1) % fila.length; desenharFila(); } }, "Pular esta"))));
      }

      function desenharEnvio() {
        P.limpar(envioBox);
        const alternar = h("div", { class: "filtros", role: "group", "aria-label": "Jeito de enviar" },
          h("button", { type: "button", "aria-pressed": String(est.envio === "resend"), text: "Enviar pelo Resend", onclick: () => { est.envio = "resend"; salvarRascunho(); desenharEnvio(); } }),
          h("button", { type: "button", "aria-pressed": String(est.envio === "rascunho"), text: "Modo rascunho", onclick: () => { est.envio = "rascunho"; salvarRascunho(); desenharEnvio(); } }));
        envioBox.append(h("div", { class: "prosp-modo" }, h("span", { class: "fraco", text: "Como quer enviar?" }), alternar));
        if (est.envio === "resend") {
          botaoTeste = h("button", { type: "button", class: "btn", onclick: enviarTeste }, P.ic("prospeccao"), "Enviar teste pra mim");
          botaoDisparo = h("button", { type: "button", class: "btn p", onclick: disparar });
          notaTeste = h("p", { class: "prosp-nota" });
          envioBox.append(h("div", { class: "prosp-enviar" }, botaoTeste, botaoDisparo), notaTeste,
            h("p", { class: "dica", text: "Sem domínio próprio verificado no Resend, o e-mail só chega para você mesma. Enquanto isso, use o modo rascunho para as marcas." }));
          atualizarBotoes();
        } else {
          botaoTeste = botaoDisparo = notaTeste = null;
          envioBox.append(h("p", { class: "dica", text: "O modo rascunho não usa o Resend. O sistema deixa cada e-mail pronto, um por vez: você copia (ou abre no Gmail já preenchido), envia por lá e marca como enviado." }), filaBox);
          desenharFila();
        }
      }

      /* ---------- descadastrados ---------- */
      const optoutBox = h("div");
      function desenharOptout() {
        P.limpar(optoutBox);
        if (!D.optoutOk) return;
        const campo = h("input", { type: "email", placeholder: "email@marca.com.br", "aria-label": "E-mail de quem pediu para sair", autocomplete: "off" });
        const add = async () => {
          const e = extrairEmail(campo.value);
          if (!e) { P.toast("Escreva um e-mail válido.", true); return; }
          const r = await P.gravar(() => window.sb.from("email_optout").upsert({ email: e }, { onConflict: "email" }));
          if (!r.ok) return;
          P.toast("Pronto: " + e + " nunca mais recebe");
          await recarregarDados(); desenharOptout(); aoMudarLista(); desenharHistorico();
        };
        campo.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); add(); } });
        optoutBox.append(h("section", { class: "cartao-bloco prosp-bloco" },
          h("div", { class: "bloco-cab" }, h("h2", { text: "Quem pediu para sair" })),
          h("div", { class: "corpo" },
            h("p", { class: "dica", text: "Quando alguém responder SAIR, escreva o e-mail aqui. Ele sai da lista e nunca mais recebe, nem nos próximos disparos." }),
            h("div", { class: "prosp-optout-add" }, campo, h("button", { type: "button", class: "btn p", onclick: add }, P.ic("mais"), "Adicionar")),
            D.optouts.length ? h("ul", { class: "prosp-chips" }, D.optouts.map((o) => h("li", null, h("span", { text: o.email }),
              h("button", { type: "button", class: "btn-i", "aria-label": "Tirar " + o.email + " da lista de saída", title: "Tirar da lista de saída", onclick: async () => {
                if (!(await P.confirmar(o.email + " voltará a poder receber seus e-mails. Tem certeza?", { botao: "Tirar da lista", titulo: "Tirar da lista de saída" }))) return;
                const r = await P.gravar(() => window.sb.from("email_optout").delete().eq("email", o.email));
                if (!r.ok) return;
                await recarregarDados(); desenharOptout(); aoMudarLista(); desenharHistorico();
              } }, P.ic("x"))))) : h("p", { class: "fraco", text: "Ninguém pediu para sair até agora." }))));
      }

      /* ---------- histórico ---------- */
      let buscaHist = "", limiteHist = 50;
      function desenharHistorico() {
        P.limpar(historicoBox);
        if (!D.enviosOk) return;
        const q = P.semAcento(buscaHist).trim();
        const marcas = marcaPorId();
        const lista = D.envios.filter((x) => !q || P.semAcento(x.email).includes(q));
        const campo = h("input", { type: "search", value: buscaHist, placeholder: "Buscar por e-mail", "aria-label": "Buscar no histórico por e-mail" });
        campo.addEventListener("input", P.debounce(() => { buscaHist = campo.value; limiteHist = 50; desenharHistorico(); const novo = historicoBox.querySelector("input[type=search]"); if (novo) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); } }, 250));
        const linhas = lista.slice(0, limiteHist).map((x) => h("tr", null,
          h("td", { class: "nw", text: dataHora(x.criado_em) }),
          h("td", { class: "truncar", text: x.email }),
          h("td", { class: "truncar", text: (marcas.get(x.marca_id) || {}).nome || "" }),
          h("td", { class: "truncar", title: x.assunto, text: x.assunto }),
          h("td", null, h("span", { class: "pilula " + (x.status === "ok" ? "p-cliente" : "p-erro"), text: x.status === "ok" ? (x.resend_id === "manual" ? "Enviado à mão" : "Enviado") : "Erro" })),
          h("td", { class: "truncar", title: x.erro || "", text: x.erro || "" })));
        historicoBox.append(h("section", { class: "cartao-bloco prosp-bloco" },
          h("div", { class: "bloco-cab" }, h("h2", { text: "Histórico de envios" }), h("div", { class: "busca-hist" }, campo)),
          h("div", { class: "corpo" },
            !D.envios.length ? h("p", { class: "fraco", text: "Nada enviado ainda. Os envios aparecem aqui, um por linha." })
              : !lista.length ? h("p", { class: "fraco", text: "Nenhum envio com esse e-mail." })
              : h("div", { class: "rolagem" }, h("table", { class: "tabela" },
                  h("thead", null, h("tr", null, ["Quando", "Para", "Marca", "Assunto", "Situação", "Erro"].map((t) => h("th", { text: t })))),
                  h("tbody", null, linhas))),
            lista.length > limiteHist ? h("button", { type: "button", class: "btn", estilo: { "margin-top": "10px" }, onclick: () => { limiteHist += 50; desenharHistorico(); } }, "Mostrar mais (" + (lista.length - limiteHist) + ")") : null)));
      }

      async function recarregarDados() {
        D = await carregarDados();
        desenharCapa(); desenharCartoes(); desenharAvisos();
        if (opcoesBox) { desenharOpcoes(); desenharResumoDest(); }
        desenharHistorico(); desenharOptout();
      }

      /* ---------- monta a página ---------- */
      desenharCapa();
      desenharAvisos();
      desenharCartoes();
      raiz.append(capaBox, avisoBox, cartoesBox);

      if (D.marcasOk && !marcasComEmail().length) {
        raiz.append(h("div", { class: "vazio prosp-sememail" },
          h("b", { text: "Sua base ainda não tem e-mails" }),
          h("p", { text: "Para enviar, as marcas precisam ter e-mail. Vá até a aba Marcas, importe sua planilha ou preencha o e-mail de cada marca." }),
          h("button", { type: "button", class: "btn p", onclick: () => P.ir("marcas") }, P.ic("marcas"), "Ir para Marcas")));
        desenharHistorico(); desenharOptout();
        raiz.append(historicoBox, optoutBox);
        return;
      }

      opcoesBox = h("div", { class: "prosp-opcoes", role: "radiogroup", "aria-label": "Quem vai receber" });
      resumoDestBox = h("div");
      envioBox = h("div");
      previaCorpo = h("div");

      const pularCaixa = h("input", { type: "checkbox", checked: est.pular });
      pularCaixa.addEventListener("change", () => { est.pular = pularCaixa.checked; salvarRascunho(); desenharOpcoes(); aoMudarLista(); });

      desenharOpcoes();
      desenharResumoDest();
      desenharEditor();
      desenharEnvio();
      atualizarPrevia();

      const colunaForm = h("div", { class: "prosp-form" },
        h("section", { class: "cartao-bloco prosp-bloco" },
          h("div", { class: "bloco-cab" }, h("h2", { text: "1. Para quem vai" })),
          h("div", { class: "corpo" },
            h("p", { class: "dica prosp-origem", text: "Os e-mails vêm da sua aba Marcas." }),
            opcoesBox,
            h("label", { class: "marcar" }, pularCaixa, "Pular quem já recebeu este mesmo assunto"),
            resumoDestBox)),
        h("section", { class: "cartao-bloco prosp-bloco" },
          h("div", { class: "bloco-cab" }, h("h2", { text: "2. O e-mail" })),
          h("div", { class: "corpo" }, editorBox)),
        h("section", { class: "cartao-bloco prosp-bloco" },
          h("div", { class: "bloco-cab" }, h("h2", { text: "3. Enviar" })),
          h("div", { class: "corpo" }, envioBox)));

      const colunaPrevia = h("aside", { class: "prosp-previa", "aria-label": "Pré-visualização do e-mail" },
        h("div", { class: "prosp-palco" },
          h("div", { class: "prosp-palco-topo" },
            h("b", { text: "Como vai chegar" }),
            h("button", { type: "button", class: "btn", onclick: abrirTelaCheia }, P.ic("olho"), "ver em tela cheia")),
          previaCorpo),
        h("p", { class: "prosp-lembrete", text: "Antes de disparar, mande o teste para você mesma e abra no celular." }));

      raiz.append(h("div", { class: "prosp-grade" }, colunaForm, colunaPrevia), historicoBox, optoutBox);
      desenharHistorico();
      desenharOptout();
    }
  };
})();
