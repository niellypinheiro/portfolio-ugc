/* =========================================================================
   Aba PORTFÓLIO: números do site + a tabela dos vídeos que aparecem nele
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;

  const FORMATOS = [["video", "Vídeo vertical (9:16)"], ["foto", "Foto (4:5)"]];
  const nomeFormato = (f) => (f === "foto" ? "Foto" : "Vídeo");

  function hostDoLink(link) {
    try { return new URL(link).hostname.replace(/^www\./, ""); } catch (e) { return "abrir"; }
  }
  function arrumarLink(texto) {
    let s = String(texto || "").trim();
    if (s && !/^https?:\/\//i.test(s)) s = "https://" + s;
    return s;
  }

  /* ---------- números das visitas ---------- */
  function calcular(visitas, videos) {
    const hoje = P.hoje();
    const dias = [];
    const base = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      dias.push({ iso: P.iso(d), n: 0 });
    }
    const porDia = Object.fromEntries(dias.map((d) => [d.iso, d]));
    const origens = {};
    let total = 0, deHoje = 0;
    visitas.forEach((v) => {
      const dia = porDia[P.iso(new Date(v.data))];
      if (!dia) return;
      dia.n++; total++;
      if (dia.iso === hoje) deHoje++;
      const o = String(v.origem || "direto").trim().toLowerCase() || "direto";
      origens[o] = (origens[o] || 0) + 1;
    });
    const listaOrigens = Object.entries(origens).sort((a, b) => b[1] - a[1]);

    const noAr = videos.filter((v) => v.visivel);
    const porNicho = {};
    noAr.forEach((v) => { porNicho[v.nicho] = (porNicho[v.nicho] || 0) + 1; });
    const forte = Object.entries(porNicho).sort((a, b) => b[1] - a[1])[0];
    return { dias, total, deHoje, listaOrigens, noAr: noAr.length, forte };
  }

  function metrica(rotulo, valor, sub) {
    return h("div", { class: "metrica" }, h("div", { class: "rot", text: rotulo }),
      h("div", { class: "num", text: valor, title: valor }), sub ? h("div", { class: "sub", text: sub }) : null);
  }

  function desenharGrafico(r) {
    if (r.total === 0) {
      return h("div", { class: "vazio", text: "Quando as pessoas começarem a visitar o seu portfólio, aqui aparece um gráfico de barras com o número de visitas de cada um dos últimos 14 dias." });
    }
    const maior = Math.max(1, ...r.dias.map((d) => d.n));
    return h("div", { class: "barras", role: "img", "aria-label": "Visitas por dia nos últimos 14 dias" },
      r.dias.map((d) => h("div", { class: "barra" + (d.iso === P.hoje() ? " hoje" : ""), title: P.fmtData(d.iso) + ": " + d.n + (d.n === 1 ? " visita" : " visitas") },
        h("span", { class: "v", text: d.n ? String(d.n) : "" }),
        h("div", { class: "col" + (d.n ? "" : " zero"), estilo: { height: d.n ? Math.max(4, Math.round((d.n / maior) * 100)) + "%" : "2px" } }),
        h("span", { class: "d", text: d.iso.slice(8) }))));
  }
  function desenharOrigens(r) {
    if (!r.listaOrigens.length) {
      return h("div", { class: "vazio", text: "Aqui vai aparecer por onde as pessoas chegaram ao seu site (Instagram, Google, link direto e outros), assim que as visitas começarem." });
    }
    return h("ul", { class: "origens" }, r.listaOrigens.slice(0, 6).map(([nome, n]) => {
      const pct = r.total ? Math.round((n / r.total) * 100) : 0;
      return h("li", null, h("span", { text: nome }), h("span", { text: n + " (" + pct + "%)" }),
        h("div", { class: "fio" }, h("i", { estilo: { width: pct + "%" } })));
    }));
  }

  /* ---------- formulário de vídeo ---------- */
  function abrirFormulario(video, aoSalvar, videos) {
    const novo = !video;
    const v = video || { titulo: "", link: "", nicho: "casa", formato: "video", marca: "", destaque: "", visivel: true };
    const titulo = h("input", { type: "text", value: v.titulo, maxlength: "200", autocomplete: "off" });
    const link = h("input", { type: "url", value: v.link, placeholder: "https://youtube.com/shorts/...", autocomplete: "off" });
    const nicho = h("select", null, P.opcoes(P.NICHOS.map((n) => [n.id, n.nome]), v.nicho));
    const formato = h("select", null, P.opcoes(FORMATOS, v.formato));
    const marca = h("input", { type: "text", value: v.marca || "", maxlength: "120", placeholder: "Nome da marca" });
    const destaque = h("input", { type: "text", value: v.destaque || "", maxlength: "60", placeholder: "Ex.: 2,4M views" });
    const visivel = h("input", { type: "checkbox", checked: !!v.visivel, id: "cvis" });

    const corpo = h("div", null,
      P.campo("Título", titulo, "Como esse vídeo se chama para você."),
      P.campo("Link", link, "Cole o link do YouTube (Shorts ou vídeo comum). No YouTube ele precisa estar Público ou Não listado."),
      h("div", { class: "grade2" }, P.campo("Nicho", nicho), P.campo("Formato", formato)),
      h("div", { class: "grade2" }, P.campo("Marca", marca), P.campo("Destaque", destaque, "Opcional. Aparece no cartão do site.")),
      h("label", { class: "marcar", for: "cvis" }, visivel, "Mostrar no site"));

    P.modal({
      titulo: novo ? "Adicionar vídeo" : "Editar vídeo", corpo,
      botoes: [
        { texto: "Cancelar" },
        { texto: "Salvar", classe: "p", aoClicar: async () => {
          P.erroNoCampo(titulo, ""); P.erroNoCampo(link, "");
          const t = titulo.value.trim(), l = arrumarLink(link.value);
          let ok = true;
          if (!t) { P.erroNoCampo(titulo, "Escreva um título."); ok = false; }
          if (!l || !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(l)) { P.erroNoCampo(link, "Cole um link válido, começando com https://"); ok = false; }
          if (!ok) return false;
          const dados = { titulo: t, link: l, nicho: nicho.value, formato: formato.value,
            marca: marca.value.trim() || null, destaque: destaque.value.trim() || null, visivel: visivel.checked };
          if (novo || nicho.value !== v.nicho) {
            const mesmos = videos.filter((x) => x.nicho === nicho.value && (!video || x.id !== video.id));
            dados.ordem = mesmos.reduce((m, x) => Math.max(m, x.ordem || 0), 0) + 10;
          }
          const r = await P.gravar(() => novo ? window.sb.from("videos").insert(dados) : window.sb.from("videos").update(dados).eq("id", video.id));
          if (!r.ok) return false;
          P.toast(novo ? "Vídeo adicionado" : "Vídeo salvo");
          aoSalvar();
        } }
      ]
    });
  }

  /* ---------- arrastar pela alça (mouse e dedo) e pelas setas do teclado ---------- */
  function ligarArrasto(alca, tr, tbody, salvar) {
    const irmaos = () => [...tbody.querySelectorAll('tr[data-id][data-nicho="' + tr.dataset.nicho + '"]')];
    alca.addEventListener("pointerdown", (ev) => {
      if (ev.button > 0) return;
      ev.preventDefault();
      alca.setPointerCapture(ev.pointerId);
      tr.classList.add("arrastando");
      const mover = (e) => {
        for (const outro of irmaos()) {
          if (outro === tr) continue;
          const r = outro.getBoundingClientRect();
          if (e.clientY > r.top && e.clientY < r.bottom) {
            if (e.clientY < r.top + r.height / 2) outro.before(tr); else outro.after(tr);
            break;
          }
        }
      };
      const soltar = () => {
        alca.removeEventListener("pointermove", mover);
        alca.removeEventListener("pointerup", soltar);
        alca.removeEventListener("pointercancel", soltar);
        tr.classList.remove("arrastando");
        salvar(irmaos().map((x) => x.dataset.id), tr.dataset.nicho);
      };
      alca.addEventListener("pointermove", mover);
      alca.addEventListener("pointerup", soltar);
      alca.addEventListener("pointercancel", soltar);
    });
    alca.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
      ev.preventDefault();
      const lista = irmaos(), i = lista.indexOf(tr);
      if (ev.key === "ArrowUp" && i > 0) lista[i - 1].before(tr);
      else if (ev.key === "ArrowDown" && i < lista.length - 1) lista[i + 1].after(tr);
      else return;
      alca.focus();
      clearTimeout(alca._t);
      alca._t = setTimeout(() => salvar(irmaos().map((x) => x.dataset.id), tr.dataset.nicho), 500);
    });
  }

  /* ---------- mais números: quando visitam, o que fazem, páginas ----------
     Visitas e ações ficam na mesma tabela "visitas". As ações têm um prefixo no campo "pagina":
     "clique:whatsapp", "clique:email", "clique:instagram" e "video:Nome do vídeo". */
  const ehAcao = (v) => /^(clique|video):/.test(String(v.pagina || ""));
  const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const FAIXAS = ["Madrugada (0h às 6h)", "Manhã (6h às 12h)", "Tarde (12h às 18h)", "Noite (18h às 24h)"];
  const nomePagina = (p) => (p === "/" || /\/portfolio-ugc\/?$/.test(p) ? "Página inicial" : p);

  function extras(visitas) {
    const semana = [0, 0, 0, 0, 0, 0, 0], faixas = [0, 0, 0, 0], paginas = {}, cliques = {}, videosVistos = {};
    let reais = 0, plays = 0;
    visitas.forEach((v) => {
      const p = String(v.pagina || "/");
      if (p.startsWith("clique:")) { const k = p.slice(7); cliques[k] = (cliques[k] || 0) + 1; return; }
      if (p.startsWith("video:")) { const k = p.slice(6) || "sem nome"; videosVistos[k] = (videosVistos[k] || 0) + 1; plays++; return; }
      const d = new Date(v.data);
      if (isNaN(d.getTime())) return;
      reais++;
      semana[(d.getDay() + 6) % 7]++;                      /* segunda = 0 */
      faixas[Math.min(3, Math.floor(d.getHours() / 6))]++;
      paginas[p] = (paginas[p] || 0) + 1;
    });
    const ordenar = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    return { reais, semana, faixas, paginas: ordenar(paginas).slice(0, 6), cliques, plays, topVideos: ordenar(videosVistos).slice(0, 5) };
  }
  /* lista com barrinha; "base" é o total para a porcentagem (0 = sem porcentagem) */
  function linhasComBarra(pares, base) {
    const maior = Math.max(1, ...pares.map((p) => p[1]));
    return h("ul", { class: "origens" }, pares.map(([nome, n]) => {
      const pct = base ? Math.round((n / base) * 100) : 0;
      return h("li", null, h("span", { text: nome }), h("span", { text: n + (base ? " (" + pct + "%)" : "") }),
        h("div", { class: "fio" }, h("i", { estilo: { width: Math.round((n / maior) * 100) + "%" } })));
    }));
  }
  function desenharExtras(visitas) {
    const e = extras(visitas);
    const cartao = (titulo, corpo) => h("section", { class: "cartao-bloco" }, h("div", { class: "bloco-cab" }, h("h2", { text: titulo })), h("div", { class: "corpo" }, corpo));
    const vazio = (t) => h("div", { class: "vazio", text: t });
    const quando = e.reais === 0
      ? vazio("Quando as pessoas começarem a visitar o site, aqui aparece em quais dias da semana e em quais horários elas mais entram.")
      : h("div", null,
          h("p", { class: "sub-rotulo", text: "Por dia da semana" }), linhasComBarra(DIAS.map((d, i) => [d, e.semana[i]]), e.reais),
          h("p", { class: "sub-rotulo", text: "Por horário" }), linhasComBarra(FAIXAS.map((f, i) => [f, e.faixas[i]]), e.reais));
    const totalCliques = Object.values(e.cliques).reduce((s, n) => s + n, 0);
    const fazem = (totalCliques + e.plays === 0)
      ? vazio("Aqui vai aparecer quantas pessoas clicam no WhatsApp, no e-mail e no Instagram, e quais vídeos elas mais assistem.")
      : h("div", null,
          linhasComBarra([["Clicaram no WhatsApp", e.cliques.whatsapp || 0], ["Clicaram no e-mail", e.cliques.email || 0], ["Clicaram no Instagram", e.cliques.instagram || 0], ["Assistiram a vídeos", e.plays]], 0),
          e.topVideos.length ? [h("p", { class: "sub-rotulo", text: "Vídeos mais assistidos" }), linhasComBarra(e.topVideos, e.plays)] : null);
    const paginas = e.reais === 0
      ? vazio("Aqui vai aparecer quais páginas do seu site as pessoas mais abrem.")
      : linhasComBarra(e.paginas.map(([p, n]) => [nomePagina(p), n]), e.reais);
    return h("div", { class: "secao" },
      h("h2", { class: "titulo-secao", text: "Mais números (últimos 30 dias)" }),
      h("div", { class: "tres-colunas" }, cartao("Quando as pessoas visitam", quando), cartao("O que as pessoas fazem", fazem), cartao("Páginas mais vistas", paginas)));
  }

  P.abas.portfolio = {
    async renderizar(raiz) {
      const desde = new Date(); desde.setDate(desde.getDate() - 29); desde.setHours(0, 0, 0, 0);
      const [rv, rvis] = await Promise.all([
        P.carregar("videos", (t) => t.select("*").order("ordem", { ascending: true })),
        P.carregar("visitas", (t) => t.select("data,origem,pagina").gte("data", desde.toISOString()).order("data", { ascending: false }).limit(20000))
      ]);
      let videos = rv.dados;
      const visitas = rvis.dados;

      async function recarregar() {
        const r = await P.carregar("videos", (t) => t.select("*").order("ordem", { ascending: true }));
        if (r.ok) videos = r.dados;
        desenhar();
      }
      async function mudar(fazer, msg) {
        const r = await P.gravar(fazer);
        if (r.ok) { if (msg) P.toast(msg); await recarregar(); }
      }
      async function salvarOrdem(ids) {
        const r = await P.gravar(async () => {
          const rs = await Promise.all(ids.map((id, i) => window.sb.from("videos").update({ ordem: (i + 1) * 10 }).eq("id", id)));
          const erro = rs.find((x) => x.error);
          return { data: null, error: erro ? erro.error : null };
        });
        if (r.ok) { P.toast("Ordem salva"); await recarregar(); } else desenhar();
      }

      function tabelaDeVideos() {
        if (!videos.length) {
          return h("div", null,
            h("p", { class: "aviso-pagina", text: "Você ainda não tem vídeos aqui. A linha abaixo é só um exemplo do formato e some quando você adicionar o primeiro." }),
            h("div", { class: "rolagem" }, h("table", { class: "tabela" },
              h("thead", null, h("tr", null, ["Título", "Marca", "Formato", "Destaque", "Link"].map((t) => h("th", { text: t })))),
              h("tbody", null, h("tr", { class: "exemplo" },
                h("td", null, "Vídeo de exemplo", P.etiquetaExemplo()), h("td", { text: "Nome da marca" }), h("td", { text: "Vídeo" }),
                h("td", { text: "2,4M views" }), h("td", { text: "youtube.com" }))))));
        }
        const tbody = h("tbody");
        const grupos = P.NICHOS.map((n) => ({ id: n.id, nome: n.nome, itens: videos.filter((v) => v.nicho === n.id) }));
        const outros = videos.filter((v) => !P.NICHOS.some((n) => n.id === v.nicho));
        if (outros.length) grupos.push({ id: "outros", nome: "Outros", itens: outros });
        grupos.filter((g) => g.itens.length).forEach((g) => {
          tbody.append(h("tr", { class: "grupo" }, h("td", { colspan: "7", text: g.nome + " (" + g.itens.length + ")" })));
          g.itens.forEach((v) => {
            const tr = h("tr", { class: v.visivel ? "" : "escondida", "data-id": v.id, "data-nicho": g.id });
            const alca = h("button", { type: "button", class: "btn-i alca", "aria-label": "Mudar a ordem de " + v.titulo + ". Arraste ou use as setas para cima e para baixo." }, P.ic("alca", true));
            ligarArrasto(alca, tr, tbody, salvarOrdem);
            tr.append(
              h("td", { style: "width:1%" }, alca),
              h("td", null, h("b", { text: v.titulo, style: "font-weight:500" })),
              h("td", { text: v.marca || "", class: v.marca ? "" : "fraco" }),
              h("td", { text: nomeFormato(v.formato) }),
              h("td", { text: v.destaque || "", class: "nw" + (v.destaque ? "" : " fraco") }),
              h("td", { class: "nw" }, h("a", { href: v.link, target: "_blank", rel: "noopener noreferrer", text: hostDoLink(v.link) })),
              h("td", { class: "acoes" },
                h("button", { type: "button", class: "btn-i" + (v.visivel ? " lig" : ""), title: v.visivel ? "Aparece no site. Clique para esconder." : "Escondido do site. Clique para mostrar.",
                  "aria-label": (v.visivel ? "Esconder do site: " : "Mostrar no site: ") + v.titulo, "aria-pressed": String(!!v.visivel),
                  onclick: () => mudar(() => window.sb.from("videos").update({ visivel: !v.visivel }).eq("id", v.id), v.visivel ? "Escondido do site" : "Agora aparece no site") },
                  P.ic(v.visivel ? "olho" : "olhoFechado")),
                h("button", { type: "button", class: "btn-i", title: "Editar", "aria-label": "Editar " + v.titulo, onclick: () => abrirFormulario(v, recarregar, videos) }, P.ic("lapis")),
                h("button", { type: "button", class: "btn-i", title: "Apagar", "aria-label": "Apagar " + v.titulo,
                  onclick: async () => { if (await P.confirmar('Apagar o vídeo "' + v.titulo + '"? Isso não dá para desfazer.', { botao: "Apagar", perigo: true, titulo: "Apagar vídeo" })) mudar(() => window.sb.from("videos").delete().eq("id", v.id), "Vídeo apagado"); } },
                  P.ic("lixeira"))));
            tbody.append(tr);
          });
        });
        return h("div", { class: "rolagem" }, h("table", { class: "tabela" },
          h("thead", null, h("tr", null, [" ", "Título", "Marca", "Formato", "Destaque", "Link", " "].map((t, i) => h("th", { text: t.trim(), "aria-label": i === 0 ? "Mudar a ordem" : null })))), tbody));
      }

      function desenhar() {
        const r = calcular(visitas.filter((v) => !ehAcao(v)), videos);   /* as ações (cliques e vídeos) não contam como visita */
        P.limpar(raiz).append(
          h("div", { class: "faixa-metricas" },
            metrica("Visitas em 14 dias", P.numero(r.total)),
            metrica("Visitas hoje", P.numero(r.deHoje)),
            metrica("Vídeos no ar", P.numero(r.noAr), videos.length - r.noAr > 0 ? (videos.length - r.noAr) + " escondido(s)" : ""),
            metrica("Nicho mais forte", r.forte ? P.nomeNicho(r.forte[0]) : "Nenhum ainda", r.forte ? r.forte[1] + (r.forte[1] === 1 ? " vídeo" : " vídeos") : "Aparece com os vídeos"),
            metrica("De onde mais vêm", r.listaOrigens.length ? r.listaOrigens[0][0] : "Sem visitas ainda", r.listaOrigens.length ? r.listaOrigens[0][1] + (r.listaOrigens[0][1] === 1 ? " visita" : " visitas") : "")),
          h("div", { class: "secao duas-colunas" },
            h("section", { class: "cartao-bloco" }, h("div", { class: "bloco-cab" }, h("h2", { text: "Visitas nos últimos 14 dias" })), h("div", { class: "corpo" }, desenharGrafico(r))),
            h("section", { class: "cartao-bloco" }, h("div", { class: "bloco-cab" }, h("h2", { text: "Por onde chegaram" })), h("div", { class: "corpo" }, desenharOrigens(r)))),
          desenharExtras(visitas),
          h("div", { class: "secao" },
            h("div", { class: "ferramentas" },
              h("h2", { text: "Meus vídeos", style: "font-size:14px;font-weight:600;flex:1" }),
              h("button", { type: "button", class: "btn p", onclick: () => abrirFormulario(null, recarregar, videos) }, P.ic("mais"), "Adicionar vídeo")),
            tabelaDeVideos()));
      }
      desenhar();
    }
  };
})();
