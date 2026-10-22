/* =========================================================================
   Aba INSTAGRAM: engajamento, melhores posts, quem mais comenta, quando postar,
   tipos de conteúdo e o público do seu perfil.
   Os dados vêm da API oficial do Instagram, buscados pela função "instagram-sync"
   do Supabase (o token fica só lá, como segredo). Aqui só se lê o que já está guardado
   no banco e se pede para atualizar. Só a Nielly vê esta aba.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;

  const PERIODOS = [[7, "Últimos 7 dias"], [30, "Últimos 30 dias"], [90, "Últimos 90 dias"], [365, "Último ano"]];
  const ORDENS = [["interacoes", "Engajamento (curtidas, comentários, salvos e envios)"], ["alcance", "Alcance"], ["visualizacoes", "Visualizações"],
    ["curtidas", "Curtidas"], ["comentarios", "Comentários"], ["compartilhamentos", "Compartilhamentos"], ["salvos", "Salvamentos"]];
  const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const FAIXAS = ["Madrugada (0h às 6h)", "Manhã (6h às 12h)", "Tarde (12h às 18h)", "Noite (18h às 24h)"];

  const dataHora = (iso) => { try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
  const soData = (iso) => { try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); } catch (e) { return ""; } };
  const soma = (lista, f) => lista.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const media = (lista, f) => (lista.length ? soma(lista, f) / lista.length : 0);
  const arredonda = (n) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);

  function formatoDe(p) {
    if (p.formato === "REELS") return "Reels";
    if (p.tipo === "CAROUSEL_ALBUM") return "Carrossel";
    if (p.tipo === "VIDEO") return "Vídeo";
    if (p.tipo === "IMAGE") return "Foto";
    return p.formato || p.tipo || "Outro";
  }
  /* Engajamento do post: o número que o Instagram dá, ou a soma do que temos */
  const interacoesDe = (p) => (p.interacoes != null ? p.interacoes : (p.curtidas || 0) + (p.comentarios || 0) + (p.salvos || 0) + (p.compartilhamentos || 0));

  function linhasComBarra(pares, rotuloDe) {
    const maior = Math.max(1, ...pares.map((p) => p[1]));
    return h("ul", { class: "origens" }, pares.map(([nome, n, extra]) =>
      h("li", null, h("span", { text: nome }), h("span", { text: rotuloDe ? rotuloDe(n, extra) : P.numero(n) }),
        h("div", { class: "fio" }, h("i", { estilo: { width: Math.round((n / maior) * 100) + "%" } })))));
  }
  function metrica(rotulo, valor, sub) {
    return h("div", { class: "metrica" }, h("div", { class: "rot", text: rotulo }), h("div", { class: "num", text: valor, title: valor }), sub ? h("div", { class: "sub", text: sub }) : null);
  }
  const cartao = (titulo, corpo) => h("section", { class: "cartao-bloco" }, h("div", { class: "bloco-cab" }, h("h2", { text: titulo })), h("div", { class: "corpo" }, corpo));
  const vazio = (t) => h("div", { class: "vazio", text: t });

  /* O banco entrega no máximo 1000 linhas por vez: leio em páginas até acabar */
  async function lerTudo(tabela, montar) {
    let tudo = [];
    for (let i = 0; i < 20; i++) {
      const r = await P.carregar(tabela, (t) => montar(t).range(i * 1000, i * 1000 + 999));
      if (!r.ok) return i ? { dados: tudo, ok: true } : r;
      tudo = tudo.concat(r.dados);
      if (r.dados.length < 1000) break;
    }
    return { dados: tudo, ok: true };
  }

  P.abas.instagram = {
    async renderizar(raiz) {
      let periodo = 30, ordem = "interacoes";
      try {
        const s = parseInt(localStorage.getItem("instagram_periodo"), 10); if (PERIODOS.some((x) => x[0] === s)) periodo = s;
        const o = localStorage.getItem("instagram_ordem"); if (ORDENS.some((x) => x[0] === o)) ordem = o;
      } catch (e) { /* sem armazenamento: usa o padrão */ }

      let posts = [], comentarios = [], dias = [], tabelasOk = true, ultimoAviso = null;
      async function carregar() {
        const [rp, rc, rd, ra] = await Promise.all([
          lerTudo("instagram_posts", (t) => t.select("*").order("publicado_em", { ascending: false })),
          lerTudo("instagram_comentarios", (t) => t.select("*").order("publicado_em", { ascending: false })),
          P.carregar("instagram_dias", (t) => t.select("*").order("dia", { ascending: false }).limit(400)),
          P.carregar("configuracoes", (t) => t.select("valor,atualizado_em").eq("chave", "instagram_webhook_ultimo"))
        ]);
        ultimoAviso = ra.ok && ra.dados.length ? ra.dados[0] : null;
        tabelasOk = rp.ok && rc.ok && rd.ok;
        posts = rp.dados; comentarios = rc.dados; dias = rd.dados;
      }
      await carregar();

      let aviso = null, atualizando = false;
      const ultima = () => posts.reduce((m, p) => (p.atualizado_em > m ? p.atualizado_em : m), "");

      async function atualizar(silencioso) {
        if (atualizando) return;
        atualizando = true; aviso = null; desenhar();
        let resposta;
        try { resposta = await window.sb.functions.invoke("instagram-sync", { body: { limite: 60 } }); }
        catch (e) { resposta = { error: e }; }
        let dados = resposta.data, erroTexto = "";
        if (resposta.error) {
          try { const j = await resposta.error.context.json(); erroTexto = (j && j.erro) || ""; } catch (e) { /* sem detalhe */ }
          if (!erroTexto) erroTexto = "Não consegui falar com a função instagram-sync do Supabase. Confira se ela foi publicada (Edge Functions) e a internet.";
        } else if (dados && dados.ok === false) {
          erroTexto = dados.erro + (dados.passo ? " (etapa: " + dados.passo + ")" : "");
        }
        if (erroTexto) { aviso = { tipo: "erro", texto: erroTexto }; if (!silencioso) P.toast("Não deu para atualizar o Instagram.", true); }
        else {
          /* o aviso de "0 comentários antigos" é esperado (a Meta não entrega o histórico), então não vale mostrar */
          /* sem faixa amarela: avisos técnicos só aparecem rapidinho num toast */
          const extras = (dados.avisos || []).filter((e) => e.indexOf("Comentarios: consultei") !== 0);
          if (!silencioso) P.toast(extras.length ? "Instagram atualizado. Aviso: " + extras[0] : "Instagram atualizado");
        }
        await carregar();
        atualizando = false;
        desenhar();
      }

      function desenhar() {
        const seletor = h("select", { class: "seletor-periodo", id: "seletorIg", style: "max-width:240px", "aria-label": "Período" }, P.opcoes(PERIODOS.map(([v, t]) => [String(v), t]), String(periodo)));
        seletor.addEventListener("change", () => {
          periodo = parseInt(seletor.value, 10);
          try { localStorage.setItem("instagram_periodo", String(periodo)); } catch (e) { /* sem armazenamento */ }
          desenhar(); const n = raiz.querySelector("#seletorIg"); if (n) n.focus();
        });
        const botao = h("button", { type: "button", class: "btn p", disabled: atualizando, onclick: () => atualizar(false) }, atualizando ? "Buscando no Instagram..." : "Atualizar agora");
        const topo = h("div", { class: "ferramentas", style: "margin-bottom:12px" },
          h("label", { class: "fraco", for: "seletorIg", text: "Período:" }), seletor, h("span", { class: "espaco" }),
          posts.length ? h("span", { class: "fraco", text: "Atualizado em " + dataHora(ultima()) }) : null, botao);

        const caixaAviso = aviso ? h("div", { class: "aviso-pagina" + (aviso.tipo === "erro" ? " erro" : ""), role: aviso.tipo === "erro" ? "alert" : "status" },
          h("b", { text: aviso.tipo === "erro" ? "Não consegui buscar os dados do Instagram" : aviso.texto }),
          aviso.tipo === "erro" ? h("p", { text: aviso.texto }) : null,
          (aviso.extras || []).map((e) => h("p", { text: e }))) : null;

        P.limpar(raiz);
        raiz.append(h("p", { class: "dica", style: "margin-bottom:12px", text: "Dados do seu Instagram pela API oficial. O Instagram informa quantas curtidas, envios e salvamentos cada post teve, mas não quem curtiu, enviou ou salvou. Por isso o ranking de pessoas usa os comentários." }), topo);
        if (caixaAviso) raiz.append(caixaAviso);
        raiz.append(h("p", { class: "fraco", style: "margin:0 0 12px;font-size:.85rem", text: ultimoAviso
          ? "Último aviso de comentário vindo do Instagram: " + dataHora(ultimoAviso.atualizado_em) + ". " + ultimoAviso.valor
          : "Ainda nenhum aviso de comentário novo chegou do Instagram." }));

        if (!tabelasOk) return;
        if (!posts.length) {
          raiz.append(h("div", { class: "vazio" },
            h("b", { text: atualizando ? "Buscando os seus posts..." : "Ainda não busquei nada do seu Instagram" }),
            h("p", { text: "Clique em \"Atualizar agora\" para trazer os seus posts, as curtidas, os comentários e os números do perfil. A primeira busca leva alguns segundos." })));
          return;
        }

        const inicio = new Date(); inicio.setDate(inicio.getDate() - (periodo - 1)); inicio.setHours(0, 0, 0, 0);
        const doPeriodo = posts.filter((p) => p.publicado_em && new Date(p.publicado_em) >= inicio);
        const diaAtual = dias[0] || null;
        const meuUsuario = diaAtual && diaAtual.usuario ? String(diaAtual.usuario).toLowerCase() : "";

        /* --- números do topo --- */
        const comAlcance = doPeriodo.filter((p) => p.alcance != null && p.alcance > 0);
        const taxa = comAlcance.length ? (soma(comAlcance, interacoesDe) / soma(comAlcance, (p) => p.alcance)) * 100 : null;
        const antigo = dias.find((d) => new Date(d.dia) <= inicio) || dias[dias.length - 1];
        const crescimento = diaAtual && antigo && antigo.dia !== diaAtual.dia && antigo.seguidores != null && diaAtual.seguidores != null ? diaAtual.seguidores - antigo.seguidores : null;
        const dentro = (c) => c.publicado_em && new Date(c.publicado_em) >= inicio && (!meuUsuario || String(c.usuario || "").toLowerCase() !== meuUsuario);
        const porPessoa = {};
        let semNome = 0;
        comentarios.filter(dentro).forEach((c) => {
          /* o Instagram nem sempre informa o nome de quem comentou: esses não entram no ranking de pessoas */
          if (!c.usuario) { semNome++; return; }
          const u = c.usuario;
          const x = porPessoa[u] || (porPessoa[u] = { n: 0, curtidas: 0, posts: new Set() });
          x.n++; x.curtidas += c.curtidas || 0; x.posts.add(c.post_id);
        });
        const ranking = Object.entries(porPessoa).sort((a, b) => b[1].n - a[1].n || b[1].posts.size - a[1].posts.size);
        const campea = ranking[0];

        raiz.append(h("div", { class: "faixa-metricas" },
          metrica("Seguidores", diaAtual && diaAtual.seguidores != null ? P.numero(diaAtual.seguidores) : "-", crescimento == null ? "" : (crescimento >= 0 ? "+" : "") + P.numero(crescimento) + " no período"),
          metrica("Posts no período", P.numero(doPeriodo.length)),
          metrica("Engajamento médio por post", doPeriodo.length ? P.numero(arredonda(media(doPeriodo, interacoesDe))) : "-", "curtidas, comentários, salvos e envios"),
          metrica("Taxa de engajamento", taxa == null ? "-" : arredonda(taxa) + "%", taxa == null ? "precisa do alcance dos posts" : "engajamento sobre o alcance"),
          metrica("Quem mais engaja", campea ? "@" + campea[0] : "-", campea ? campea[1].n + (campea[1].n === 1 ? " comentário" : " comentários") : (semNome ? "o Instagram não informou o nome de quem comentou" : "ninguém comentou no período"))));

        if (!doPeriodo.length) {
          raiz.append(h("div", { class: "vazio", text: "Você não publicou nada nesse período. Escolha um período maior para ver os posts e os números." }));
        } else {
          /* --- melhores posts --- */
          const seletorOrdem = h("select", { "aria-label": "Ordenar os melhores posts por", style: "max-width:320px" }, P.opcoes(ORDENS, ordem));
          seletorOrdem.addEventListener("change", () => { ordem = seletorOrdem.value; try { localStorage.setItem("instagram_ordem", ordem); } catch (e) { /* sem armazenamento */ } desenhar(); });
          const valorOrdem = (p) => (ordem === "interacoes" ? interacoesDe(p) : (p[ordem] == null ? -1 : p[ordem]));
          const melhores = doPeriodo.slice().sort((a, b) => valorOrdem(b) - valorOrdem(a)).slice(0, 5);
          const num = (v) => (v == null ? "-" : P.numero(v));
          const listaMelhores = h("div", null, melhores.map((p, i) => {
            const img = p.miniatura ? h("img", { src: p.miniatura, alt: "", loading: "lazy", class: "ig-miniatura" }) : h("div", { class: "ig-miniatura" });
            if (p.miniatura) img.addEventListener("error", () => { img.style.visibility = "hidden"; });
            return h("div", { class: "ig-post" }, h("span", { class: "ig-pos", text: String(i + 1) }), img,
              h("div", { class: "ig-corpo" },
                h("div", { class: "ig-linha1" }, h("b", { text: formatoDe(p) }), h("span", { class: "fraco", text: " · " + soData(p.publicado_em) })),
                h("p", { class: "ig-legenda", text: (p.legenda || "(sem legenda)").replace(/\s+/g, " ").slice(0, 110) }),
                h("p", { class: "ig-nums", text: "Curtidas " + num(p.curtidas) + "  ·  Comentários " + num(p.comentarios) + "  ·  Salvos " + num(p.salvos) + "  ·  Envios " + num(p.compartilhamentos) + "  ·  Alcance " + num(p.alcance) + (p.visualizacoes != null ? "  ·  Visualizações " + num(p.visualizacoes) : "") }),
                p.permalink ? h("a", { href: p.permalink, target: "_blank", rel: "noopener noreferrer", text: "Abrir no Instagram" }) : null));
          }));
          raiz.append(h("div", { class: "secao" },
            h("section", { class: "cartao-bloco" }, h("div", { class: "bloco-cab" }, h("h2", { text: "Melhores posts" }), seletorOrdem), h("div", { class: "corpo" }, listaMelhores))));

          /* --- tipos de conteúdo e quando postar --- */
          const grupos = {};
          doPeriodo.forEach((p) => { const f = formatoDe(p); (grupos[f] || (grupos[f] = [])).push(p); });
          const tipos = Object.entries(grupos).map(([f, l]) => [f + " (" + l.length + (l.length === 1 ? " post" : " posts") + ")", arredonda(media(l, interacoesDe))]).sort((a, b) => b[1] - a[1]);
          const semana = Array.from({ length: 7 }, () => []), horario = Array.from({ length: 4 }, () => []);
          posts.forEach((p) => { if (!p.publicado_em) return; const d = new Date(p.publicado_em); semana[(d.getDay() + 6) % 7].push(p); horario[Math.min(3, Math.floor(d.getHours() / 6))].push(p); });
          const mediaDe = (lista) => arredonda(media(lista, interacoesDe));
          const quando = posts.length < 5
            ? vazio("Preciso de mais posts guardados para indicar os melhores dias e horários.")
            : h("div", null,
              h("p", { class: "sub-rotulo", text: "Engajamento médio por dia da semana" }), linhasComBarra(DIAS.map((d, i) => [d, mediaDe(semana[i]), semana[i].length]), (n, q) => P.numero(n) + " (" + q + (q === 1 ? " post)" : " posts)")),
              h("p", { class: "sub-rotulo", text: "Engajamento médio por horário" }), linhasComBarra(FAIXAS.map((f, i) => [f, mediaDe(horario[i]), horario[i].length]), (n, q) => P.numero(n) + " (" + q + (q === 1 ? " post)" : " posts)")),
              h("p", { class: "dica", text: "Considera todos os posts guardados (até 60 mais recentes por busca)." }));
          raiz.append(h("div", { class: "secao duas-colunas" },
            cartao("Que tipo de conteúdo funciona melhor", tipos.length ? h("div", null, linhasComBarra(tipos, (n) => P.numero(n) + " por post"), h("p", { class: "dica", text: "Engajamento médio de cada formato nos posts do período." })) : vazio("Sem posts no período.")),
            cartao("Melhores dias e horários para postar", quando)));
        }

        /* --- pessoas e público --- */
        const rankingTela = ranking.slice(0, 10).map(([u, x]) => ["@" + u, x.n, x.posts.size]);
        const notaSemNome = semNome ? " " + P.numero(semNome) + (semNome === 1 ? " comentário veio" : " comentários vieram") + " sem o nome de quem comentou (o Instagram não informa para todas as contas) e " + (semNome === 1 ? "não entra" : "não entram") + " no ranking." : "";
        const quemComenta = rankingTela.length
          ? h("div", null, linhasComBarra(rankingTela, (n, q) => n + (n === 1 ? " comentário" : " comentários") + " em " + q + (q === 1 ? " post" : " posts")),
              h("p", { class: "dica", text: "Só aparecem comentários dos posts mais recentes buscados. Respostas suas não entram na conta." + notaSemNome }))
          : semNome ? vazio("Os comentários chegaram, mas sem o nome de quem comentou (o Instagram não informa para todas as contas).")
          : vazio(comentarios.length ? "Ninguém comentou nos posts desse período." : "Ainda não há comentários guardados. Se já tem comentários no Instagram, clique em Atualizar agora e confira se o aviso fala de permissão de comentários.");

        const demo = diaAtual && diaAtual.demografia ? diaAtual.demografia : null;
        const listaDemo = (lista, nomeDe) => {
          if (!lista || !lista.length) return null;
          const total = soma(lista, (x) => x.valor) || 1;
          return linhasComBarra(lista.slice().sort((a, b) => b.valor - a.valor).slice(0, 6).map((x) => [nomeDe ? nomeDe(x.nome) : x.nome, x.valor]), (n) => Math.round((n / total) * 100) + "%");
        };
        const nomeGenero = (g) => ({ F: "Mulheres", M: "Homens", U: "Não informado" }[g] || g);
        const publico = demo
          ? h("div", null,
            demo.gender ? [h("p", { class: "sub-rotulo", text: "Gênero" }), listaDemo(demo.gender, nomeGenero)] : null,
            demo.age ? [h("p", { class: "sub-rotulo", text: "Idade" }), listaDemo(demo.age)] : null,
            demo.city ? [h("p", { class: "sub-rotulo", text: "Principais cidades" }), listaDemo(demo.city)] : null)
          : vazio("O Instagram ainda não liberou o público da sua conta (precisa de pelo menos 100 seguidores e de dados suficientes).");

        const evolucao = dias.length >= 2
          ? linhasComBarra(dias.slice(0, 10).map((d) => [soData(d.dia), d.seguidores || 0]), (n) => P.numero(n))
          : vazio("O histórico de seguidores começa hoje. A cada atualização eu guardo o número do dia, e com o tempo aparece aqui a evolução.");
        const contaNums = diaAtual && (diaAtual.alcance_30d != null || diaAtual.visitas_perfil_30d != null || diaAtual.contas_engajadas_30d != null)
          ? h("div", null, linhasComBarra([["Contas alcançadas (30 dias)", diaAtual.alcance_30d || 0], ["Visitas ao perfil (30 dias)", diaAtual.visitas_perfil_30d || 0], ["Contas que interagiram (30 dias)", diaAtual.contas_engajadas_30d || 0]], (n) => P.numero(n)))
          : null;

        raiz.append(h("div", { class: "secao tres-colunas" },
          cartao("Quem mais comenta", quemComenta),
          cartao("Como o público está aderindo", h("div", null, contaNums, h("p", { class: "sub-rotulo", text: "Seguidores, dia a dia" }), evolucao)),
          cartao("Quem é o seu público", publico)));
      }
      desenhar();

      /* atualiza sozinho: ao abrir a aba (se a última busca tem mais de 1 hora) e a cada 30 minutos enquanto ela estiver aberta */
      const u = ultima();
      if (posts.length && u && Date.now() - new Date(u).getTime() > 3600 * 1000) atualizar(true);

      const relogio = setInterval(async () => {
        if (!document.body.contains(raiz)) { clearInterval(relogio); return; }
        if (document.hidden || atualizando) return;
        const u2 = ultima();
        if (!u2 || Date.now() - new Date(u2).getTime() > 29 * 60 * 1000) { atualizar(true); return; }
        /* entre uma busca e outra, só confere se chegou comentário novo (o Instagram avisa na hora) */
        const antes = comentarios.length;
        await carregar();
        if (comentarios.length !== antes && document.body.contains(raiz)) desenhar();
      }, 3 * 60 * 1000);
    }
  };
})();
