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
  /* Períodos que dá para escolher. O número é a quantidade de dias, contando hoje (1 = só hoje). */
  const PERIODOS = [[1, "Hoje"], [7, "Últimos 7 dias"], [14, "Últimos 14 dias"], [30, "Últimos 30 dias"], [90, "Últimos 90 dias"], [180, "Últimos 180 dias"]];
  const nomePeriodo = (p) => (PERIODOS.find((x) => x[0] === p) || [p, "Últimos " + p + " dias"])[1];
  const inicioDoPeriodo = (p) => { const d = new Date(); d.setDate(d.getDate() - (p - 1)); d.setHours(0, 0, 0, 0); return d; };

  /* As barras do gráfico: por hora (hoje), por dia (até 31 dias) ou por semana (períodos maiores) */
  function montarBarras(visitas, periodo) {
    const base = new Date();
    const hoje0 = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    if (periodo === 1) {
      const horas = Array.from({ length: 24 }, (_, i) => ({ n: 0, rotulo: String(i), dica: i + "h às " + (i + 1) + "h", hoje: i === base.getHours() }));
      visitas.forEach((v) => { const d = new Date(v.data); if (P.iso(d) === P.iso(hoje0)) horas[d.getHours()].n++; });
      return { barras: horas, por: "hora" };
    }
    const dias = [];
    for (let i = periodo - 1; i >= 0; i--) dias.push({ iso: P.iso(new Date(hoje0.getFullYear(), hoje0.getMonth(), hoje0.getDate() - i)), n: 0 });
    const porDia = Object.fromEntries(dias.map((d) => [d.iso, d]));
    visitas.forEach((v) => { const dia = porDia[P.iso(new Date(v.data))]; if (dia) dia.n++; });
    if (periodo <= 31) return { barras: dias.map((d) => ({ n: d.n, rotulo: d.iso.slice(8), dica: P.fmtData(d.iso), hoje: d.iso === P.hoje() })), por: "dia" };
    const semanas = [];
    for (let i = 0; i < dias.length; i += 7) {
      const g = dias.slice(i, i + 7);
      semanas.push({ n: g.reduce((s, d) => s + d.n, 0), rotulo: g[0].iso.slice(8) + "/" + g[0].iso.slice(5, 7), dica: P.fmtData(g[0].iso) + " a " + P.fmtData(g[g.length - 1].iso), hoje: g.some((d) => d.iso === P.hoje()) });
    }
    return { barras: semanas, por: "semana" };
  }

  /* "visitas" já vem só com o período escolhido; "todasAsVisitas" serve para contar as de hoje */
  function calcular(visitas, videos, periodo, todasAsVisitas) {
    const hoje = P.hoje();
    const { barras, por } = montarBarras(visitas, periodo);
    const origens = {};
    visitas.forEach((v) => {
      const o = String(v.origem || "direto").trim().toLowerCase() || "direto";
      origens[o] = (origens[o] || 0) + 1;
    });
    const total = visitas.length;
    const deHoje = todasAsVisitas.filter((v) => P.iso(new Date(v.data)) === hoje).length;
    const listaOrigens = Object.entries(origens).sort((a, b) => b[1] - a[1]);

    const noAr = videos.filter((v) => v.visivel);
    const porNicho = {};
    noAr.forEach((v) => { porNicho[v.nicho] = (porNicho[v.nicho] || 0) + 1; });
    const forte = Object.entries(porNicho).sort((a, b) => b[1] - a[1])[0];
    return { barras, por, total, deHoje, listaOrigens, noAr: noAr.length, forte };
  }

  function metrica(rotulo, valor, sub) {
    return h("div", { class: "metrica" }, h("div", { class: "rot", text: rotulo }),
      h("div", { class: "num", text: valor, title: valor }), sub ? h("div", { class: "sub", text: sub }) : null);
  }

  function desenharGrafico(r, periodo) {
    if (r.total === 0) {
      return h("div", { class: "vazio", text: periodo === 1 ? "Ainda não houve visitas hoje. Quando houver, aqui aparece o gráfico por horário." : "Não houve visitas neste período. Quando houver, aqui aparece o gráfico de barras." });
    }
    const maior = Math.max(1, ...r.barras.map((d) => d.n));
    const passo = Math.max(1, Math.ceil(r.barras.length / 12));   /* mostra só alguns rótulos quando são muitas barras */
    const unidade = r.por === "hora" ? "por hora" : r.por === "semana" ? "por semana" : "por dia";
    return h("div", { class: "barras", role: "img", "aria-label": "Visitas " + unidade + ", " + nomePeriodo(periodo).toLowerCase() },
      r.barras.map((d, i) => h("div", { class: "barra" + (d.hoje ? " hoje" : ""), title: d.dica + ": " + d.n + (d.n === 1 ? " visita" : " visitas") },
        h("span", { class: "v", text: d.n && r.barras.length <= 31 ? String(d.n) : "" }),
        h("div", { class: "col" + (d.n ? "" : " zero"), estilo: { height: d.n ? Math.max(4, Math.round((d.n / maior) * 100)) + "%" : "2px" } }),
        h("span", { class: "d", text: i % passo === 0 ? d.rotulo : "" }))));
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
    const nicho = h("select", null,
      P.opcoes(P.NICHOS.map((n) => [n.id, n.nome]), v.nicho),
      h("option", { value: "outro", text: "Nenhum (fica só em Cases de sucesso)", selected: v.nicho === "outro" }));
    const formato = h("select", null, P.opcoes(FORMATOS, v.formato));
    const marca = h("input", { type: "text", value: v.marca || "", maxlength: "120", placeholder: "Nome da marca" });
    const destaque = h("input", { type: "text", value: v.destaque || "", maxlength: "60", placeholder: "Ex.: 2,4M views" });
    const visivel = h("input", { type: "checkbox", checked: !!v.visivel, id: "cvis" });

    const corpo = h("div", null,
      P.campo("Título", titulo, "Como esse vídeo se chama para você."),
      P.campo("Link", link, "Cole o link do YouTube (Shorts ou vídeo comum). No YouTube ele precisa estar Público ou Não listado."),
      h("div", { class: "grade2" }, P.campo("Nicho", nicho, "\"Nenhum\" é para um vídeo que você quer só em Cases de sucesso, sem entrar na galeria por nicho do site."), P.campo("Formato", formato)),
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

  /* ---------- adicionar vários vídeos de uma vez, colando a lista ----------
     O formato é o da sua lista: uma linha com o nome do nicho (ex.: MODA, BELEZA, HAIR CARE) e, embaixo,
     uma linha por vídeo com o nome da marca e o link. Os números na frente e os dois-pontos são ignorados. */
  const APELIDOS_NICHO = {
    tech: "tech", tecnologia: "tech", casa: "casa", casaedecoracao: "casa", decoracao: "casa",
    gastronomia: "gastronomia", comida: "gastronomia", haircare: "cabelo", cabelo: "cabelo", cabelos: "cabelo",
    beleza: "bodycare", bodycare: "bodycare", moda: "moda", entretenimento: "entretenimento"
  };
  const soLetras = (s) => P.semAcento(s).replace(/[^a-z0-9]/g, "");
  const idDoYoutube = (l) => { const m = String(l || "").match(/(?:shorts\/|youtu\.be\/|[?&]v=)([\w-]{6,})/); return m ? m[1] : ""; };

  function lerListaDeVideos(texto, videos) {
    const itens = [], avisos = [];
    const jaTem = new Set(videos.map((v) => idDoYoutube(v.link)).filter(Boolean));
    const contagem = {};   /* quantos vídeos cada marca já tem, para numerar "Vídeo 2", "Vídeo 3"... */
    videos.forEach((v) => { const k = soLetras(v.marca); if (k) contagem[k] = (contagem[k] || 0) + 1; });
    let nicho = null;
    String(texto || "").split(/\r?\n/).forEach((linha) => {
      const bruta = linha.trim();
      if (!bruta) return;
      const achou = bruta.match(/https?:\/\/\S+/);
      if (!achou) {
        const k = soLetras(bruta.replace(/[:\-\u2013\u2014]+$/, "")).replace(/^nicho/, "");
        if (APELIDOS_NICHO[k]) nicho = APELIDOS_NICHO[k];
        else { nicho = null; avisos.push('Não conheço o nicho "' + bruta + '". Os vídeos dele foram ignorados.'); }
        return;
      }
      let link = achou[0].replace(/[?&]feature=share/i, "").replace(/[)\].,;]+$/, "");
      const marca = bruta.slice(0, achou.index).replace(/^\s*\d+\s*[-.:)\u2013\u2014]*\s*/, "").replace(/[\s:\-\u2013\u2014]+$/, "").trim();
      if (!nicho) { avisos.push("Pulei um link que estava sem nicho em cima: " + link); return; }
      const id = idDoYoutube(link);
      if (id && jaTem.has(id)) { avisos.push((marca || "Um vídeo") + ": esse link já está no seu portfólio, então não repeti."); return; }
      if (id) jaTem.add(id);
      const nome = (marca || "SEM NOME").toLocaleUpperCase("pt-BR");
      const k = soLetras(nome);
      contagem[k] = (contagem[k] || 0) + 1;
      itens.push({ nicho, marca: nome, titulo: "Vídeo " + contagem[k], link, formato: "video", visivel: true });
    });
    return { itens, avisos };
  }

  function abrirAdicionarVarios(videos, aoSalvar) {
    const area = h("textarea", { rows: "10", placeholder: "MODA\n1 NOME DA MARCA https://youtube.com/shorts/...\n2 OUTRA MARCA https://youtube.com/shorts/...\n\nBELEZA\n1 MARCA https://youtube.com/shorts/...", style: "width:100%;font-family:inherit" });
    const previa = h("div", { style: "margin-top:12px" });
    function desenharPrevia() {
      P.limpar(previa);
      const { itens, avisos } = lerListaDeVideos(area.value, videos);
      if (!area.value.trim()) return;
      previa.append(h("p", null, "Encontrei ", h("b", { text: String(itens.length) }), itens.length === 1 ? " vídeo novo." : " vídeos novos."));
      avisos.forEach((a) => previa.append(h("p", { class: "dica", text: a })));
      if (itens.length) {
        previa.append(h("div", { class: "rolagem" }, h("table", { class: "tabela" },
          h("thead", null, h("tr", null, ["Nicho", "Marca", "Título", "Link"].map((t) => h("th", { text: t })))),
          h("tbody", null, itens.map((i) => h("tr", null, h("td", { text: P.nomeNicho(i.nicho) }), h("td", { text: i.marca }), h("td", { text: i.titulo }), h("td", { class: "truncar", text: i.link })))))));
      }
    }
    area.addEventListener("input", P.debounce(desenharPrevia, 200));
    const corpo = h("div", null,
      h("p", { class: "dica", text: "Cole a sua lista: o nome do nicho numa linha (Moda, Beleza, Gastronomia, Hair care, Casa e decoração, Tech ou Entretenimento) e, embaixo, uma linha por vídeo com a marca e o link. Vídeos de uma marca que já existe viram \"Vídeo 2\", \"Vídeo 3\" e assim por diante." }),
      area, previa);
    P.modal({
      titulo: "Adicionar vários vídeos", larga: true, corpo,
      botoes: [
        { texto: "Cancelar" },
        { texto: "Adicionar vídeos", classe: "p", aoClicar: async () => {
          const { itens } = lerListaDeVideos(area.value, videos);
          if (!itens.length) { P.toast("Não encontrei nenhum vídeo novo na lista.", true); return false; }
          const proxima = {};
          const linhas = itens.map((i) => {
            if (proxima[i.nicho] == null) proxima[i.nicho] = videos.filter((x) => x.nicho === i.nicho).reduce((m, x) => Math.max(m, x.ordem || 0), 0);
            proxima[i.nicho] += 10;
            return Object.assign({}, i, { ordem: proxima[i.nicho] });
          });
          const r = await P.gravar(() => window.sb.from("videos").insert(linhas));
          if (!r.ok) return false;
          P.toast(linhas.length + (linhas.length === 1 ? " vídeo adicionado" : " vídeos adicionados"));
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
      /* Os ouvintes ficam no documento (e não na alça): ao trocar a linha de lugar, a alça sai e volta na página,
         e o navegador soltaria o "dedo" preso nela, parando o arrasto na primeira troca. */
      tr.classList.add("arrastando");
      document.body.classList.add("arrastando-linha");
      let y = ev.clientY;
      const mover = (e) => {
        y = e.clientY;
        for (const outro of irmaos()) {
          if (outro === tr) continue;
          const r = outro.getBoundingClientRect();
          if (y > r.top && y < r.bottom) {
            if (y < r.top + r.height / 2) outro.before(tr); else outro.after(tr);
            break;
          }
        }
      };
      /* perto da borda da tela, a página rola sozinha para dar para levar o vídeo mais longe */
      const rolar = setInterval(() => {
        if (y < 90) { window.scrollBy(0, -14); mover({ clientY: y }); }
        else if (y > window.innerHeight - 90) { window.scrollBy(0, 14); mover({ clientY: y }); }
      }, 16);
      const soltar = () => {
        document.removeEventListener("pointermove", mover);
        document.removeEventListener("pointerup", soltar);
        document.removeEventListener("pointercancel", soltar);
        clearInterval(rolar);
        tr.classList.remove("arrastando");
        document.body.classList.remove("arrastando-linha");
        salvar(irmaos().map((x) => x.dataset.id), tr.dataset.nicho);
      };
      document.addEventListener("pointermove", mover);
      document.addEventListener("pointerup", soltar);
      document.addEventListener("pointercancel", soltar);
    });    alca.addEventListener("keydown", (ev) => {
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
  function desenharExtras(visitas, periodo) {
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
      h("h2", { class: "titulo-secao", text: "Mais números (" + nomePeriodo(periodo).toLowerCase() + ")" }),
      h("div", { class: "tres-colunas" }, cartao("Quando as pessoas visitam", quando), cartao("O que as pessoas fazem", fazem), cartao("Páginas mais vistas", paginas)));
  }

  P.abas.portfolio = {
    async renderizar(raiz) {
      /* As visitas vêm em páginas de 1000 (é o máximo que o banco entrega de uma vez), até acabarem */
      async function buscarVisitas(dias) {
        const desde = inicioDoPeriodo(dias);
        let tudo = [];
        for (let i = 0; i < 40; i++) {
          const r = await P.carregar("visitas", (t) => t.select("data,origem,pagina").gte("data", desde.toISOString())
            .order("data", { ascending: false }).range(i * 1000, i * 1000 + 999));
          if (!r.ok) return i ? { dados: tudo, ok: true } : r;
          tudo = tudo.concat(r.dados);
          if (r.dados.length < 1000) break;
        }
        return { dados: tudo, ok: true };
      }
      let periodo = 30;
      try { const s = parseInt(localStorage.getItem("portfolio_periodo"), 10); if (PERIODOS.some((x) => x[0] === s)) periodo = s; } catch (e) { /* sem armazenamento: usa 30 dias */ }
      let carregadoDias = periodo;
      const [rv, rvis] = await Promise.all([
        P.carregar("videos", (t) => t.select("*").order("ordem", { ascending: true })),
        buscarVisitas(periodo)
      ]);
      let videos = rv.dados;
      let visitas = rvis.dados;
      async function mudarPeriodo(novo) {
        if (novo > carregadoDias) {
          P.toast("Carregando as visitas desse período...");
          const r = await buscarVisitas(novo);
          if (!r.ok) { P.toast("Não consegui carregar esse período agora.", true); desenhar(); return; }
          visitas = r.dados; carregadoDias = novo;
        }
        periodo = novo;
        try { localStorage.setItem("portfolio_periodo", String(novo)); } catch (e) { /* sem armazenamento */ }
        desenhar();
        const sel = raiz.querySelector("select.seletor-periodo");
        if (sel) sel.focus();
      }

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
        const inicio = inicioDoPeriodo(periodo);
        const doPeriodo = visitas.filter((v) => new Date(v.data) >= inicio);
        const soVisitas = visitas.filter((v) => !ehAcao(v));
        const r = calcular(doPeriodo.filter((v) => !ehAcao(v)), videos, periodo, soVisitas);   /* as ações (cliques e vídeos) não contam como visita */
        const seletor = h("select", { class: "seletor-periodo", id: "seletorPeriodo", style: "max-width:260px", "aria-label": "Período das estatísticas" }, P.opcoes(PERIODOS.map(([v, t]) => [String(v), t]), String(periodo)));
        seletor.addEventListener("change", () => mudarPeriodo(parseInt(seletor.value, 10)));
        P.limpar(raiz).append(
          h("div", { class: "ferramentas", style: "margin-bottom:14px" },
            h("label", { class: "fraco", for: "seletorPeriodo", text: "Período das estatísticas:" }), seletor),
          h("div", { class: "faixa-metricas" },
            metrica(periodo === 1 ? "Visitas hoje" : "Visitas em " + periodo + " dias", P.numero(r.total)),
            periodo === 1 ? null : metrica("Visitas hoje", P.numero(r.deHoje)),
            metrica("Vídeos no ar", P.numero(r.noAr), videos.length - r.noAr > 0 ? (videos.length - r.noAr) + " escondido(s)" : ""),
            metrica("Nicho mais forte", r.forte ? P.nomeNicho(r.forte[0]) : "Nenhum ainda", r.forte ? r.forte[1] + (r.forte[1] === 1 ? " vídeo" : " vídeos") : "Aparece com os vídeos"),
            metrica("De onde mais vêm", r.listaOrigens.length ? r.listaOrigens[0][0] : "Sem visitas ainda", r.listaOrigens.length ? r.listaOrigens[0][1] + (r.listaOrigens[0][1] === 1 ? " visita" : " visitas") : "")),
          h("div", { class: "secao duas-colunas" },
            h("section", { class: "cartao-bloco" }, h("div", { class: "bloco-cab" }, h("h2", { text: periodo === 1 ? "Visitas hoje, por horário" : "Visitas " + (periodo <= 31 ? "por dia" : "por semana") + " (" + nomePeriodo(periodo).toLowerCase() + ")" })), h("div", { class: "corpo" }, desenharGrafico(r, periodo))),
            h("section", { class: "cartao-bloco" }, h("div", { class: "bloco-cab" }, h("h2", { text: "Por onde chegaram" })), h("div", { class: "corpo" }, desenharOrigens(r)))),
          desenharExtras(doPeriodo, periodo),
          h("div", { class: "secao" },
            h("div", { class: "ferramentas" },
              h("h2", { text: "Meus vídeos", style: "font-size:14px;font-weight:600;flex:1" }),
              h("button", { type: "button", class: "btn", onclick: () => abrirAdicionarVarios(videos, recarregar) }, P.ic("subir"), "Adicionar vários"),
              h("button", { type: "button", class: "btn p", onclick: () => abrirFormulario(null, recarregar, videos) }, P.ic("mais"), "Adicionar vídeo")),
            tabelaDeVideos()));
      }
      desenhar();
    }
  };
})();
