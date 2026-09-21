/* =========================================================================
   Aba TRANSCRIÇÕES
   Você cola o link de um vídeo (YouTube, Instagram ou TikTok), o vídeo aparece para assistir,
   o painel transcreve o áudio ali mesmo (sem mandar você para outro site) e você guarda
   o roteiro e as suas observações.

   A transcrição usa o serviço Supadata. A chave dele fica guardada só no SEU banco
   (tabela "configuracoes", que só você lê) e nunca em arquivo do site.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;

  const PLATAFORMAS = [["youtube", "YouTube"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["outro", "Outro"]];
  const nomePlataforma = (p) => (PLATAFORMAS.find((x) => x[0] === p) || ["outro", "Outro"])[1];
  const CHAVE_CONFIG = "supadata_api_key";
  const SERVICO = "https://api.supadata.ai";

  /* ---------- links ---------- */
  function arrumarLink(texto) {
    let s = String(texto || "").trim();
    if (s && !/^https?:\/\//i.test(s)) s = "https://" + s;
    return s;
  }
  const linkValido = (s) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(s);
  function detectarPlataforma(link) {
    try {
      const host = new URL(arrumarLink(link)).hostname.replace(/^www\./, "").toLowerCase();
      if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
      if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
      if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
    } catch (e) { /* link incompleto */ }
    return "outro";
  }
  const idYoutube = (l) => { const m = String(l).match(/(?:shorts\/|[?&]v=|youtu\.be\/|embed\/)([\w-]{11})/); return m ? m[1] : null; };
  const idTiktok = (l) => { const m = String(l).match(/\/video\/(\d{8,})/); return m ? m[1] : null; };
  const codigoInstagram = (l) => { const m = String(l).match(/instagram\.com\/(?:[^/?#]+\/)?(reels?|p|tv)\/([\w-]+)/i); return m ? { tipo: m[1].toLowerCase() === "p" ? "p" : "reel", cod: m[2] } : null; };

  /* O player que aparece dentro do conteúdo. Devolve null quando não dá para mostrar o vídeo aqui. */
  function montarPlayer(t) {
    const caixa = (ratio, src, titulo) => h("div", { class: "player", estilo: { "aspect-ratio": ratio } },
      h("iframe", { src, title: titulo, loading: "lazy", allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: "", referrerpolicy: "strict-origin-when-cross-origin" }));
    if (t.plataforma === "youtube") {
      const id = idYoutube(t.link);
      if (id) return caixa(/\/shorts\//.test(t.link) ? "9 / 16" : "16 / 9", "https://www.youtube-nocookie.com/embed/" + id, "Vídeo do YouTube");
    } else if (t.plataforma === "tiktok") {
      const id = idTiktok(t.link);
      if (id) return caixa("9 / 16", "https://www.tiktok.com/embed/v2/" + id, "Vídeo do TikTok");
    } else if (t.plataforma === "instagram") {
      const c = codigoInstagram(t.link);
      if (c) return caixa("9 / 16", "https://www.instagram.com/" + c.tipo + "/" + c.cod + "/embed", "Vídeo do Instagram");
    }
    return null;
  }

  /* ---------- o serviço de transcrição ---------- */
  class ErroTranscricao extends Error {}
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  async function pedir(caminho, chave) {
    const ctrl = new AbortController();
    const relogio = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(SERVICO + caminho, { headers: { "x-api-key": chave }, signal: ctrl.signal });
      let corpo = null;
      try { corpo = await r.json(); } catch (e) { /* sem corpo */ }
      return { status: r.status, corpo };
    } catch (e) {
      throw new ErroTranscricao("Não consegui falar com o serviço de transcrição. Confira a internet e tente de novo.");
    } finally { clearTimeout(relogio); }
  }
  function mensagemDeErro(status, corpo) {
    if (status === 401) return "A chave do Supadata não foi aceita. Confira a chave em \"Configurar transcrição\".";
    if (status === 402) return "Os créditos do seu plano no Supadata acabaram. Eles voltam no começo do próximo mês.";
    if (status === 403) return "Este vídeo exige login ou é restrito, então não dá para transcrever.";
    if (status === 404) return "Não encontrei este vídeo. Ele pode ser privado ou o link pode estar errado.";
    if (status === 429) return "Muitos pedidos de uma vez, ou o limite do mês acabou. Espere um pouco e tente de novo.";
    const detalhe = corpo && (corpo.message || corpo.details || corpo.error);
    return "Não consegui transcrever agora." + (detalhe ? " (" + String(detalhe).slice(0, 110) + ")" : "");
  }
  const tempo = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function formatar(content) {
    if (Array.isArray(content)) {
      const linhas = content.filter((c) => c && String(c.text || "").trim()).map((c) => tempo(c.offset || 0) + "  " + String(c.text).replace(/\s+/g, " ").trim());
      return linhas.join("\n");
    }
    return String(content || "").trim();
  }
  /* Pede a transcrição. Vídeos sem legenda são transcritos pelo áudio, o que pode levar um pouco (o painel espera). */
  async function transcrever(chave, link, aoStatus) {
    aoStatus("Pedindo a transcrição...");
    let r = await pedir("/v1/transcript?url=" + encodeURIComponent(link) + "&text=false&chunkSize=240&mode=auto", chave);
    if (r.status === 202 && r.corpo && r.corpo.jobId) {
      const job = r.corpo.jobId, inicio = Date.now();
      for (;;) {
        if (Date.now() - inicio > 180000) throw new ErroTranscricao("A transcrição está demorando demais. Tente de novo em alguns minutos.");
        await esperar(2000);
        aoStatus("Transcrevendo o áudio do vídeo... " + Math.round((Date.now() - inicio) / 1000) + "s");
        r = await pedir("/v1/transcript/" + encodeURIComponent(job), chave);
        if (r.status !== 200) throw new ErroTranscricao(mensagemDeErro(r.status, r.corpo));
        if (r.corpo && r.corpo.status === "failed") throw new ErroTranscricao("O serviço não conseguiu transcrever este vídeo.");
        if (r.corpo && r.corpo.status === "completed") break;
      }
    }
    if (r.status !== 200) throw new ErroTranscricao(mensagemDeErro(r.status, r.corpo));
    const texto = formatar(r.corpo && r.corpo.content);
    if (!texto) throw new ErroTranscricao("Não encontrei fala neste vídeo (pode ter só música).");
    return texto;
  }

  async function copiar(texto, msg) {
    try { await navigator.clipboard.writeText(texto); P.toast(msg); }
    catch (e) { P.toast("Não consegui copiar sozinho. Selecione o texto e use Ctrl+C.", true); }
  }
  const palavras = (t) => (String(t || "").trim() ? String(t).trim().split(/\s+/).length : 0);

  P.abas.transcricoes = {
    async renderizar(raiz) {
      const [rl, rc] = await Promise.all([
        P.carregar("transcricoes", (t) => t.select("*").order("criado_em", { ascending: false })),
        P.carregar("configuracoes", (t) => t.select("chave,valor").eq("chave", CHAVE_CONFIG))
      ]);
      let lista = rl.dados;
      let chaveServico = (rc.dados[0] && rc.dados[0].valor) || "";
      const cartoes = new Map();          /* id -> { el, dados } */
      let idAberto = null;

      /* ---------- configurar a transcrição (a chave do Supadata) ---------- */
      const estadoCfg = h("span");
      function atualizarEstadoCfg() {
        P.limpar(estadoCfg).append(chaveServico
          ? h("span", { class: "pilula p-cliente", text: "Transcrição pronta" })
          : h("span", { class: "pilula p-lead", text: "Falta configurar a transcrição" }));
      }
      function abrirConfiguracao(aviso) {
        const campo = h("input", { type: "password", autocomplete: "off", placeholder: chaveServico ? "Chave já guardada (termina em " + chaveServico.slice(-4) + "). Cole outra para trocar." : "Cole aqui a chave (API key) do Supadata" });
        const corpo = h("div", null,
          aviso ? h("p", { class: "aviso-pagina", text: aviso }) : null,
          h("p", { text: "Para transcrever aqui dentro, o painel usa o serviço Supadata, que entende YouTube, Instagram e TikTok. Você faz isso uma vez só:" }),
          h("ol", { class: "passos" },
            h("li", null, "Crie uma conta grátis em ", h("a", { href: "https://supadata.ai", target: "_blank", rel: "noopener noreferrer", text: "supadata.ai" }), " (100 transcrições por mês, sem cartão)."),
            h("li", { text: "Copie a sua chave (API key) que aparece no painel deles." }),
            h("li", { text: "Cole a chave aqui embaixo e salve." })),
          P.campo("Chave do Supadata", campo, "Ela fica guardada só no seu banco, onde só você lê. Nunca aparece no site público."),
          h("p", { class: "fraco", style: "font-size:12.5px", text: "Custo: 1 crédito por vídeo que já tem legenda e 2 créditos por minuto quando o serviço precisa ouvir o áudio. Os créditos e o plano você acompanha na conta do Supadata." }));
        const botoes = [{ texto: "Cancelar" }, { texto: "Salvar a chave", classe: "p", aoClicar: async () => {
          const v = campo.value.trim();
          if (!v) { P.erroNoCampo(campo, "Cole a chave para salvar."); return false; }
          const r = await P.gravar(() => window.sb.from("configuracoes").upsert({ chave: CHAVE_CONFIG, valor: v, atualizado_em: new Date().toISOString() }, { onConflict: "chave" }));
          if (!r.ok) return false;
          chaveServico = v; atualizarEstadoCfg(); P.toast("Chave salva. Já dá para transcrever.");
        } }];
        if (chaveServico) botoes.unshift({ texto: "Remover a chave", classe: "perigo", esquerda: true, aoClicar: async () => {
          const r = await P.gravar(() => window.sb.from("configuracoes").delete().eq("chave", CHAVE_CONFIG));
          if (!r.ok) return false;
          chaveServico = ""; atualizarEstadoCfg(); P.toast("Chave removida.");
        } });
        P.modal({ titulo: "Configurar transcrição", corpo, botoes });
      }

      /* ---------- guardar um conteúdo novo ---------- */
      const campoLink = h("input", { type: "url", placeholder: "Cole o link do YouTube, Instagram ou TikTok", autocomplete: "off", "aria-label": "Link do vídeo" });
      const erroLink = h("div", { class: "erro", role: "alert" });
      const botaoGuardar = h("button", { type: "button", class: "btn p", text: "Guardar" });
      async function guardar() {
        erroLink.textContent = "";
        const l = arrumarLink(campoLink.value);
        if (!linkValido(l)) { erroLink.textContent = "Cole um link válido, começando com https://"; campoLink.focus(); return; }
        const repetido = lista.find((t) => t.link === l);
        if (repetido) { P.toast("Este link já estava guardado. Abri ele para você."); abrirCartao(repetido.id, true); return; }
        const plat = detectarPlataforma(l);
        botaoGuardar.disabled = true;
        const r = await P.gravar(() => window.sb.from("transcricoes").insert({ link: l, plataforma: plat,
          titulo: "Vídeo do " + nomePlataforma(plat) + ", " + P.fmtData(P.hoje()), atualizado_em: new Date().toISOString() }));
        botaoGuardar.disabled = false;
        if (!r.ok) return;
        campoLink.value = "";
        const novo = await P.carregar("transcricoes", (t) => t.select("*").order("criado_em", { ascending: false }));
        if (novo.ok) {
          const conhecidos = new Set(lista.map((t) => t.id));
          lista = novo.dados;
          const criada = lista.find((t) => !conhecidos.has(t.id));
          if (criada) { adicionarCartao(criada, true); abrirCartao(criada.id, true); }
        }
        P.toast("Conteúdo guardado");
        desenharVazio(); aplicarBusca();
      }
      botaoGuardar.addEventListener("click", guardar);
      campoLink.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } });

      /* ---------- busca e lista ---------- */
      const busca = h("input", { type: "search", placeholder: "Buscar por título, roteiro ou anotação", "aria-label": "Buscar conteúdo" });
      const areaLista = h("div", { class: "lista-conteudos" });
      const areaVazio = h("div");
      function aplicarBusca() {
        const q = P.semAcento(busca.value);
        let visiveis = 0;
        cartoes.forEach(({ el, dados }) => {
          const ok = !q || P.semAcento([dados.titulo, dados.link, dados.transcricao, dados.observacoes].join(" ")).includes(q);
          el.hidden = !ok; if (ok) visiveis++;
        });
        semResultado.hidden = !(cartoes.size && q && visiveis === 0);
      }
      busca.addEventListener("input", P.debounce(aplicarBusca, 150));
      const semResultado = h("div", { class: "vazio", hidden: true, text: "Nenhum conteúdo encontrado com essa busca." });
      function desenharVazio() {
        P.limpar(areaVazio);
        if (cartoes.size) return;
        areaVazio.append(
          h("div", { class: "vazio", style: "text-align:center", text: "Você ainda não guardou nenhum conteúdo. Cole o primeiro link aí em cima. A ideia é juntar os vídeos que te inspiram com o roteiro deles escrito, para consultar na hora de gravar o seu." }),
          h("div", { class: "cartao-conteudo exemplo", style: "margin-top:12px", "aria-disabled": "true" },
            h("div", { class: "cab", style: "cursor:default" },
              h("span", { class: "pilula p-youtube", text: "YouTube" }), P.etiquetaExemplo(),
              h("span", { class: "titulo-c", text: "Vídeo de exemplo que eu gosto" }),
              h("span", { class: "trecho", text: "Aqui aparece o começo do roteiro, para você reconhecer o vídeo sem abrir." }))));
      }

      /* ---------- um conteúdo guardado ---------- */
      function abrirCartao(id, rolar) {
        if (idAberto && idAberto !== id && cartoes.has(idAberto)) cartoes.get(idAberto).alternar(false);
        const c = cartoes.get(id);
        if (!c) return;
        c.alternar(true); idAberto = id;
        if (rolar) c.el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      function adicionarCartao(t, noTopo) {
        const dados = Object.assign({}, t);
        const cab = h("button", { type: "button", class: "cab", "aria-expanded": "false" });
        const corpo = h("div", { class: "corpo-conteudo", hidden: true });
        const el = h("article", { class: "cartao-conteudo" }, cab, corpo);
        let montado = false, aberto = false;
        function pintarCab() {
          P.limpar(cab).append(
            h("span", { class: "pilula p-" + dados.plataforma, text: nomePlataforma(dados.plataforma) }),
            h("span", { class: "data", text: P.fmtData(dados.criado_em) }),
            h("span", { class: "titulo-c", text: dados.titulo || "Sem título" }),
            h("span", { class: "trecho", text: dados.transcricao ? dados.transcricao.replace(/\s+/g, " ").slice(0, 150) : "Ainda sem roteiro. Abra e clique em Transcrever." }),
            h("span", { class: "seta-c" }, P.ic("baixo")));
        }
        function montarCorpo() {
          montado = true;
          const player = montarPlayer(dados);
          const titulo = h("input", { type: "text", value: dados.titulo || "", maxlength: "200" });
          const roteiro = h("textarea", { class: "grande", placeholder: "O roteiro (a transcrição) aparece aqui quando você clicar em Transcrever. Você também pode colar ou escrever." });
          roteiro.value = dados.transcricao || "";
          const obs = h("textarea", { class: "medio", placeholder: "O que você achou legal neste vídeo? O que dá para aproveitar no seu conteúdo?" });
          obs.value = dados.observacoes || "";
          const contagem = h("span", { class: "fraco", style: "font-size:12.5px" });
          const status = h("span", { class: "status-transc", role: "status" });
          const sujo = h("span", { class: "tag exemplo", style: "margin:0", hidden: true, text: "alterações não salvas" });
          const botaoTranscrever = h("button", { type: "button", class: "btn p" }, P.ic("transcricao"), "Transcrever o roteiro");
          const botaoSalvar = h("button", { type: "button", class: "btn" }, "Salvar");
          const marcarSujo = () => { sujo.hidden = false; };
          const contar = () => { const n = palavras(roteiro.value); contagem.textContent = n + (n === 1 ? " palavra" : " palavras"); };
          [titulo, roteiro, obs].forEach((x) => x.addEventListener("input", marcarSujo));
          roteiro.addEventListener("input", contar); contar();

          async function salvar(silencioso) {
            const r = await P.gravar(() => window.sb.from("transcricoes").update({ titulo: titulo.value.trim() || dados.titulo, transcricao: roteiro.value.trim() || null,
              observacoes: obs.value.trim() || null, atualizado_em: new Date().toISOString() }).eq("id", dados.id));
            if (!r.ok) return false;
            Object.assign(dados, { titulo: titulo.value.trim() || dados.titulo, transcricao: roteiro.value.trim() || null, observacoes: obs.value.trim() || null });
            cartoes.get(dados.id).dados = dados; sujo.hidden = true; pintarCab();
            if (!silencioso) P.toast("Salvo");
            return true;
          }
          botaoSalvar.addEventListener("click", () => salvar(false));

          botaoTranscrever.addEventListener("click", async () => {
            if (!chaveServico) { abrirConfiguracao("Ainda falta a chave do serviço de transcrição. É um passo só, e depois tudo acontece aqui dentro."); return; }
            if (roteiro.value.trim() && !(await P.confirmar("Já existe um roteiro escrito. Substituir pela nova transcrição?", { botao: "Substituir", titulo: "Substituir o roteiro" }))) return;
            botaoTranscrever.disabled = true; status.className = "status-transc"; status.textContent = "";
            try {
              const texto = await transcrever(chaveServico, dados.link, (m) => { status.textContent = m; });
              roteiro.value = texto; contar();
              status.textContent = "Pronto. Transcrição guardada.";
              await salvar(true);
            } catch (e) {
              status.className = "status-transc erro";
              status.textContent = e instanceof ErroTranscricao ? e.message : "Não consegui transcrever agora. Tente de novo.";
            } finally { botaoTranscrever.disabled = false; }
          });

          corpo.append(
            h("div", { class: "coluna-video" },
              player || h("div", { class: "vazio", text: "Não consegui mostrar este vídeo aqui dentro (o link pode ser encurtado ou de um site sem player). A transcrição ainda funciona." }),
              h("div", { class: "linha-botoes", style: "margin-top:10px" },
                h("a", { class: "btn", href: dados.link, target: "_blank", rel: "noopener noreferrer", text: "Abrir o vídeo" }),
                h("button", { type: "button", class: "btn", onclick: () => copiar(dados.link, "Link copiado") }, P.ic("copiar"), "Copiar o link"))),
            h("div", { class: "coluna-texto" },
              P.campo("Título", titulo),
              h("div", { class: "linha-botoes", style: "justify-content:space-between;margin-bottom:6px" },
                h("label", { style: "font-size:12.5px;font-weight:500;color:var(--tinta-2)", text: "Roteiro (transcrição)" }), botaoTranscrever),
              status, roteiro,
              h("div", { class: "linha-botoes", style: "justify-content:space-between;margin:2px 0 12px" }, contagem,
                h("button", { type: "button", class: "btn", onclick: () => (roteiro.value.trim() ? copiar(roteiro.value, "Roteiro copiado") : P.toast("Ainda não tem roteiro para copiar.", true)) }, P.ic("copiar"), "Copiar o roteiro")),
              P.campo("Minhas observações", obs),
              h("div", { class: "linha-botoes" }, botaoSalvar, sujo,
                h("span", { style: "flex:1" }),
                h("button", { type: "button", class: "btn perigo", onclick: async () => {
                  if (!(await P.confirmar('Apagar "' + (dados.titulo || "este conteúdo") + '"? Isso não dá para desfazer.', { botao: "Apagar", perigo: true, titulo: "Apagar conteúdo" }))) return;
                  const r = await P.gravar(() => window.sb.from("transcricoes").delete().eq("id", dados.id));
                  if (!r.ok) return;
                  el.remove(); cartoes.delete(dados.id); lista = lista.filter((x) => x.id !== dados.id); if (idAberto === dados.id) idAberto = null;
                  desenharVazio(); aplicarBusca(); P.toast("Conteúdo apagado");
                } }, P.ic("lixeira"), "Apagar"))));
        }
        function alternar(abrir) {
          aberto = abrir;
          cab.setAttribute("aria-expanded", String(abrir));
          el.classList.toggle("aberto", abrir);
          if (abrir && !montado) montarCorpo();
          corpo.hidden = !abrir;
        }
        cab.addEventListener("click", () => { if (aberto) { alternar(false); if (idAberto === dados.id) idAberto = null; } else abrirCartao(dados.id, false); });
        pintarCab();
        cartoes.set(dados.id, { el, dados, alternar });
        if (noTopo) areaLista.prepend(el); else areaLista.append(el);
      }

      /* ---------- montagem da página ---------- */
      atualizarEstadoCfg();
      lista.forEach((t) => adicionarCartao(t, false));
      raiz.append(
        h("div", { class: "transc-topo" },
          h("p", { text: "Os conteúdos que você gosta, com o roteiro salvo e as suas anotações." }),
          h("div", { class: "cfg-estado" }, estadoCfg,
            h("button", { type: "button", class: "btn", onclick: () => abrirConfiguracao() }, "Configurar transcrição"))),
        h("section", { class: "cartao-bloco novo-conteudo" },
          h("div", { class: "rotulo", text: "Guardar um conteúdo novo" }),
          h("div", { class: "novo-linha" }, campoLink, botaoGuardar),
          erroLink,
          h("ol", { class: "passos-transc" },
            h("li", null, h("span", { class: "n", text: "1" }), h("span", { text: "Cole o link aqui em cima e clique em Guardar. O vídeo já aparece para você assistir." })),
            h("li", null, h("span", { class: "n", text: "2" }), h("span", { text: "Dentro do conteúdo, clique em \"Transcrever o roteiro\". A transcrição aparece ali mesmo, sem sair do painel." })),
            h("li", null, h("span", { class: "n", text: "3" }), h("span", { text: "Confira o roteiro, escreva as suas observações e salve." })))),
        h("div", { class: "busca-conteudos" }, P.ic("busca"), busca),
        areaVazio, semResultado, areaLista);
      desenharVazio();
    }
  };
})();
