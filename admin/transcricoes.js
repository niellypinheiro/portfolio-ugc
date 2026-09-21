/* =========================================================================
   Aba TRANSCRIÇÕES: guarda os vídeos que você gosta (YouTube, Instagram, TikTok...)
   com o link, a transcrição (o roteiro) e as suas observações.
   A transcrição em si é feita no TokScript (site ou extensão do Chrome); aqui você cola e guarda.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;

  const PLATAFORMAS = [["youtube", "YouTube"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["outro", "Outro"]];
  const nomePlataforma = (p) => (PLATAFORMAS.find((x) => x[0] === p) || ["outro", "Outro"])[1];
  const TOKSCRIPT = [
    ["Site do TokScript", "https://tokscript.com"],
    ["Transcrição de Instagram", "https://tokscript.com/instagram-transcript-generator"],
    ["Conectar no Claude (MCP)", "https://tokscript.com/mcp"],
    ["Extensão do Chrome", "https://tokscript.com/chrome-extension"]
  ];

  function arrumarLink(texto) {
    let s = String(texto || "").trim();
    if (s && !/^https?:\/\//i.test(s)) s = "https://" + s;
    return s;
  }
  function linkValido(s) { return /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(s); }
  function detectarPlataforma(link) {
    try {
      const host = new URL(arrumarLink(link)).hostname.replace(/^www\./, "").toLowerCase();
      if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
      if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
      if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
    } catch (e) { /* link ainda incompleto */ }
    return "outro";
  }
  async function copiar(texto, msg) {
    try { await navigator.clipboard.writeText(texto); P.toast(msg); }
    catch (e) { P.toast("Não consegui copiar sozinho. Selecione o texto e use Ctrl+C.", true); }
  }
  const palavras = (t) => (String(t || "").trim() ? String(t).trim().split(/\s+/).length : 0);

  P.abas.transcricoes = {
    async renderizar(raiz) {
      const ler = () => P.carregar("transcricoes", (t) => t.select("*").order("criado_em", { ascending: false }));
      let lista = (await ler()).dados;
      const est = { busca: "", plat: "todas", sel: null, sujo: false };   /* sel: id, "novo" ou null */

      let alvoItens = null;
      const colLista = h("div", { class: "transc-col-lista" });
      const colEditor = h("div", { class: "transc-col-editor" });
      const caixa = h("div", { class: "transc" }, colLista, colEditor);
      raiz.append(caixa);

      async function recarregar(selecionarNovo) {
        const r = await ler();
        if (r.ok) lista = r.dados;
        if (selecionarNovo && lista.length) est.sel = lista[0].id;   /* o mais novo vem primeiro */
        desenhar();
      }
      async function abrir(id) {
        if (est.sujo && !(await P.confirmar("Você tem alterações que ainda não foram salvas. Sair sem salvar?", { botao: "Sair sem salvar", perigo: true, titulo: "Alterações não salvas" }))) return;
        est.sel = id; est.sujo = false;
        desenhar();
      }

      /* ---------- lista da esquerda ---------- */
      function filtrada() {
        const q = P.semAcento(est.busca);
        return lista.filter((t) => (est.plat === "todas" || t.plataforma === est.plat) &&
          (!q || P.semAcento([t.titulo, t.link, t.transcricao, t.observacoes].join(" ")).includes(q)));
      }
      function desenharLista() {
        const busca = h("input", { type: "search", placeholder: "Buscar em títulos, transcrições e observações", value: est.busca, "aria-label": "Buscar transcrição" });
        busca.addEventListener("input", P.debounce(() => { est.busca = busca.value; desenharItens(); }, 150));
        const filtros = h("div", { class: "filtros", role: "group", "aria-label": "Filtrar por plataforma" },
          [["todas", "Todas"]].concat(PLATAFORMAS.filter(([v]) => v === "youtube" || v === "instagram" || v === "tiktok" || lista.some((t) => t.plataforma === v))).map(([v, t]) =>
            h("button", { type: "button", "aria-pressed": String(est.plat === v), text: t, onclick: () => { est.plat = v; desenharLista(); } })));
        const itens = h("div", { class: "transc-lista" });
        alvoItens = itens;
        P.limpar(colLista).append(
          h("div", { class: "ferramentas" },
            h("button", { type: "button", class: "btn p", onclick: () => abrir("novo") }, P.ic("mais"), "Nova transcrição")),
          h("div", { class: "busca-transc" }, busca),
          h("div", { style: "margin:8px 0 10px" }, filtros),
          itens);
        desenharItens();
      }
      function desenharItens() {
        const alvo = alvoItens;
        if (!alvo) return;
        P.limpar(alvo);
        if (!lista.length) {
          alvo.append(
            h("div", { class: "aviso-pagina", text: "Você ainda não guardou nenhuma transcrição. O cartão abaixo é só um exemplo do formato e some quando você guardar a primeira." }),
            h("div", { class: "item-transc exemplo", "aria-disabled": "true" },
              h("span", { class: "pilula p-youtube", text: "YouTube" }), P.etiquetaExemplo(),
              h("b", { text: "Vídeo de exemplo que eu gosto" }),
              h("span", { class: "trecho", text: "Aqui aparece o começo da transcrição, para você reconhecer o vídeo sem abrir." })));
          return;
        }
        const itens = filtrada();
        if (!itens.length) { alvo.append(h("div", { class: "vazio", text: "Nenhuma transcrição encontrada com essa busca ou filtro." })); return; }
        itens.forEach((t) => {
          alvo.append(h("button", { type: "button", class: "item-transc", "aria-current": String(est.sel === t.id), onclick: () => abrir(t.id) },
            h("span", { class: "pilula p-" + t.plataforma, text: nomePlataforma(t.plataforma) }),
            h("span", { class: "data", text: " " + P.fmtData(t.criado_em) }),
            h("b", { text: t.titulo || "Sem título" }),
            h("span", { class: "trecho", text: t.transcricao ? t.transcricao.trim().slice(0, 140) : "Ainda sem transcrição" })));
        });
      }

      /* ---------- editor / leitor da direita ---------- */
      function desenharEditor() {
        P.limpar(colEditor);
        if (est.sel === null) {
          colEditor.append(h("div", { class: "cartao-bloco corpo" },
            h("div", { class: "vazio", text: lista.length ? "Escolha uma transcrição da lista para ler, ou clique em Nova transcrição." : "Clique em Nova transcrição para guardar o primeiro vídeo: você cola o link, a transcrição e as suas observações." })));
          return;
        }
        const novo = est.sel === "novo";
        const t = novo ? { titulo: "", link: "", plataforma: "outro", transcricao: "", observacoes: "" } : lista.find((x) => x.id === est.sel);
        if (!t) { est.sel = null; desenharEditor(); return; }

        const link = h("input", { type: "url", value: t.link, placeholder: "Cole aqui o link do vídeo (YouTube, Instagram, TikTok...)", autocomplete: "off" });
        const titulo = h("input", { type: "text", value: t.titulo || "", maxlength: "200", placeholder: "Um nome para você reconhecer este vídeo" });
        const plataforma = h("select", null, P.opcoes(PLATAFORMAS, t.plataforma));
        const transcricao = h("textarea", { class: "grande", placeholder: "Cole aqui a transcrição (o roteiro) do vídeo" });
        transcricao.value = t.transcricao || "";
        const obs = h("textarea", { class: "medio", placeholder: "O que você achou legal neste vídeo? O que dá para aproveitar no seu conteúdo?" });
        obs.value = t.observacoes || "";
        const contagem = h("span", { class: "fraco", style: "font-size:12.5px" });
        const aviso = h("span", { class: "tag exemplo", style: "margin:0", hidden: !est.sujo, text: "alterações não salvas" });
        const abrirVideo = h("a", { class: "btn", target: "_blank", rel: "noopener noreferrer", text: "Abrir o vídeo" });
        let platManual = !novo;   /* só detecta a plataforma sozinho em item novo */

        function marcarSujo() { est.sujo = true; aviso.hidden = false; }
        function atualizarLink() {
          const l = arrumarLink(link.value);
          if (linkValido(l)) { abrirVideo.href = l; abrirVideo.removeAttribute("aria-disabled"); abrirVideo.style.opacity = ""; abrirVideo.style.pointerEvents = ""; }
          else { abrirVideo.removeAttribute("href"); abrirVideo.setAttribute("aria-disabled", "true"); abrirVideo.style.opacity = ".5"; abrirVideo.style.pointerEvents = "none"; }
          if (!platManual) plataforma.value = detectarPlataforma(link.value);
        }
        function atualizarContagem() { const n = palavras(transcricao.value); contagem.textContent = n + (n === 1 ? " palavra" : " palavras"); }
        link.addEventListener("input", () => { marcarSujo(); atualizarLink(); });
        plataforma.addEventListener("change", () => { platManual = true; marcarSujo(); });
        titulo.addEventListener("input", marcarSujo);
        obs.addEventListener("input", marcarSujo);
        transcricao.addEventListener("input", () => { marcarSujo(); atualizarContagem(); });
        atualizarLink(); atualizarContagem();
        if (!novo) platManual = true;

        const ajuda = h("details", { class: "ajuda-transc", open: novo && !t.transcricao },
          h("summary", { text: "Como transcrever um vídeo" }),
          h("div", { class: "corpo-ajuda" },
            h("ol", { class: "passos" },
              h("li", null, "Copie o link do vídeo e abra o TokScript: ",
                h("button", { type: "button", class: "btn", onclick: async () => { if (link.value.trim()) await copiar(arrumarLink(link.value), "Link copiado. Cole no TokScript."); window.open("https://tokscript.com", "_blank", "noopener"); } }, "Copiar o link e abrir o TokScript")),
              h("li", { text: "No TokScript, cole o link e gere a transcrição." }),
              h("li", { text: "Copie o texto e cole no campo Transcrição aqui embaixo." })),
            h("p", { class: "sub-rotulo", text: "Ferramentas do TokScript" }),
            h("div", { class: "links-toks" }, TOKSCRIPT.map(([nome, url]) => h("a", { class: "btn", href: url, target: "_blank", rel: "noopener noreferrer", text: nome })))));

        async function salvar(botao) {
          P.erroNoCampo(link, "");
          const l = arrumarLink(link.value);
          if (!linkValido(l)) { P.erroNoCampo(link, "Cole um link válido, começando com https://"); link.focus(); return; }
          const plat = plataforma.value;
          const dados = { link: l, plataforma: plat, titulo: titulo.value.trim() || ("Vídeo do " + nomePlataforma(plat) + ", " + P.fmtData(P.hoje())),
            transcricao: transcricao.value.trim() || null, observacoes: obs.value.trim() || null, atualizado_em: new Date().toISOString() };
          botao.disabled = true;
          const r = await P.gravar(() => novo ? window.sb.from("transcricoes").insert(dados) : window.sb.from("transcricoes").update(dados).eq("id", t.id));
          botao.disabled = false;
          if (!r.ok) return;
          P.toast("Transcrição salva");
          est.sujo = false;
          await recarregar(novo);
        }
        const botaoSalvar = h("button", { type: "button", class: "btn p", onclick: (e) => salvar(e.currentTarget) }, "Salvar");
        colEditor.append(h("div", { class: "cartao-bloco corpo editor-transc" },
          h("div", { class: "editor-topo" },
            h("button", { type: "button", class: "btn voltar-transc", onclick: () => abrir(null) }, P.ic("esq"), "Voltar à lista"),
            h("h2", { text: novo ? "Nova transcrição" : "Transcrição" }), aviso),
          ajuda,
          P.campo("Link do vídeo", link),
          h("div", { class: "linha-botoes" },
            abrirVideo,
            h("button", { type: "button", class: "btn", onclick: () => copiar(arrumarLink(link.value), "Link copiado") }, P.ic("copiar"), "Copiar o link")),
          h("div", { class: "grade2", style: "margin-top:12px" }, P.campo("Título", titulo), P.campo("Plataforma", plataforma)),
          P.campo("Transcrição (o roteiro do vídeo)", transcricao),
          h("div", { class: "linha-botoes", style: "margin:-4px 0 12px;justify-content:space-between" }, contagem,
            h("button", { type: "button", class: "btn", onclick: () => (transcricao.value.trim() ? copiar(transcricao.value, "Transcrição copiada") : P.toast("Ainda não tem transcrição para copiar.", true)) }, P.ic("copiar"), "Copiar a transcrição")),
          P.campo("Minhas observações", obs),
          h("div", { class: "linha-botoes", style: "margin-top:6px" },
            botaoSalvar,
            novo ? null : h("button", { type: "button", class: "btn perigo", onclick: async () => {
              if (!(await P.confirmar('Apagar "' + (t.titulo || "esta transcrição") + '"? Isso não dá para desfazer.', { botao: "Apagar", perigo: true, titulo: "Apagar transcrição" }))) return;
              const r = await P.gravar(() => window.sb.from("transcricoes").delete().eq("id", t.id));
              if (!r.ok) return;
              P.toast("Transcrição apagada"); est.sel = null; est.sujo = false; await recarregar(false);
            } }, P.ic("lixeira"), "Apagar"))));
      }

      function desenhar() {
        caixa.classList.toggle("detalhe", est.sel !== null);
        desenharLista();
        desenharEditor();
      }
      desenhar();
    }
  };
})();
