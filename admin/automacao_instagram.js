/* =========================================================================
   Aba AUTOMAÇÃO INSTAGRAM: quando alguém comenta a palavra-chave num post,
   a pessoa recebe o link por mensagem privada (DM) e o comentário é
   respondido sozinho. Quem faz o envio é a função instagram-webhook do
   Supabase; esta aba só cadastra as palavras e mostra o que foi enviado.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;

  const RESPOSTA_PADRAO = "Deixei o link na sua DM 💌";
  const normalizar = (s) => P.semAcento(s).replace(/[^a-z0-9]+/g, " ").trim();
  const quando = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };
  const linkOk = (v) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v);
  const arrumarLink = (t) => { let s = String(t || "").trim(); if (s && !/^https?:\/\//i.test(s)) s = "https://" + s; return s; };

  const NOME_DM = { enviado: "DM enviada", erro: "DM com erro", enviando: "Enviando..." };
  const NOME_COM = { enviado: "Comentário respondido", nao_enviado: "Sem resposta no comentário", erro: "Erro no comentário" };
  const pilulaStatus = (valor, nomes) => {
    const bom = valor === "enviado", ruim = valor === "erro";
    return h("span", { class: "pilula", style: bom ? "background:#e3f3e6;color:#1f6b33" : ruim ? "background:var(--vermelho-suave);color:var(--vermelho)" : "", text: nomes[valor] || valor || "" });
  };

  function abrirFormulario(auto, aoSalvar, existentes) {
    const novo = !auto;
    const a = auto || { palavra: "", link: "", mensagem: "", resposta_comentario: RESPOSTA_PADRAO, responder_no_comentario: true, link_no_comentario_se_dm_falhar: false, ativo: true };
    const palavra = h("input", { type: "text", value: a.palavra, maxlength: "60", placeholder: "Ex.: coco", autocomplete: "off" });
    const link = h("input", { type: "url", value: a.link, placeholder: "https://...", autocomplete: "off" });
    const mensagem = h("textarea", { maxlength: "800", rows: "3", placeholder: "Ex.: Oi! Aqui está o link da promoção do coco:" });
    mensagem.value = a.mensagem || "";
    const resposta = h("input", { type: "text", value: a.resposta_comentario || "", maxlength: "300", placeholder: RESPOSTA_PADRAO });
    const respCom = h("input", { type: "checkbox", checked: !!a.responder_no_comentario, id: "aiRespCom" });
    const plano = h("input", { type: "checkbox", checked: !!a.link_no_comentario_se_dm_falhar, id: "aiPlano" });
    const ativo = h("input", { type: "checkbox", checked: !!a.ativo, id: "aiAtivo" });

    const corpo = h("div", null,
      P.campo("Palavra-chave", palavra, "A pessoa escreve essa palavra no comentário. Maiúscula e acento não fazem diferença, e vale se ela escrever junto com outras palavras (ex.: \"quero coco\")."),
      P.campo("Link que será enviado", link, "O link da promoção deste vídeo."),
      P.campo("Mensagem da DM", mensagem, "O texto que vem antes do link. Se deixar em branco, uso: \"Oi! Aqui está o link que você pediu:\"."),
      P.campo("Resposta no comentário", resposta, "O que aparece como resposta pública, logo depois que a DM é enviada."),
      h("label", { class: "marcar", for: "aiRespCom" }, respCom, "Responder o comentário quando a DM for enviada"),
      h("label", { class: "marcar", for: "aiPlano", style: "display:block;margin-top:6px" }, plano, "Se a DM não puder ser enviada, responder com o link no próprio comentário"),
      h("label", { class: "marcar", for: "aiAtivo", style: "display:block;margin-top:6px" }, ativo, "Automação ligada"));

    const botoes = [
      { texto: "Cancelar" },
      { texto: "Salvar", classe: "p", aoClicar: async () => {
        P.erroNoCampo(palavra, ""); P.erroNoCampo(link, "");
        const p = normalizar(palavra.value), l = arrumarLink(link.value);
        let ok = true;
        if (!p) { P.erroNoCampo(palavra, "Escreva a palavra-chave."); ok = false; }
        else if (existentes.some((x) => normalizar(x.palavra) === p && (!auto || x.id !== auto.id))) { P.erroNoCampo(palavra, "Já existe uma automação com essa palavra."); ok = false; }
        if (!l || !linkOk(l)) { P.erroNoCampo(link, "Cole um link válido, começando com https://"); ok = false; }
        if (!ok) return false;
        const dados = { palavra: p, link: l, mensagem: mensagem.value.trim() || null,
          resposta_comentario: resposta.value.trim() || null, responder_no_comentario: respCom.checked,
          link_no_comentario_se_dm_falhar: plano.checked, ativo: ativo.checked };
        const r = await P.gravar(() => novo ? window.sb.from("instagram_automacoes").insert(dados) : window.sb.from("instagram_automacoes").update(dados).eq("id", auto.id));
        if (!r.ok) return false;
        P.toast(novo ? "Automação criada" : "Automação salva");
        aoSalvar();
      } }
    ];
    if (!novo) {
      botoes.unshift({ texto: "Apagar", classe: "perigo", esquerda: true, aoClicar: async () => {
        if (!(await P.confirmar('Apagar a automação "' + auto.palavra + '"? O histórico dela continua. Isso não dá para desfazer.', { botao: "Apagar", perigo: true, titulo: "Apagar automação" }))) return false;
        const r = await P.gravar(() => window.sb.from("instagram_automacoes").delete().eq("id", auto.id));
        if (!r.ok) return false;
        P.toast("Automação apagada");
        aoSalvar();
      } });
    }
    P.modal({ titulo: novo ? "Nova automação" : "Editar automação", corpo, botoes });
  }

  P.abas.instagram_automacao = {
    async renderizar(raiz) {
      const pegar = async () => {
        const [ra, rl] = await Promise.all([
          P.carregar("instagram_automacoes", (t) => t.select("*").order("criado_em", { ascending: false })),
          P.carregar("instagram_automacoes_log", (t) => t.select("*").order("criado_em", { ascending: false }).limit(40))
        ]);
        return { autos: ra.ok ? ra.dados : [], log: rl.ok ? rl.dados : [], tabelasOk: ra.ok && rl.ok };
      };
      let { autos, log, tabelasOk } = await pegar();

      async function recarregar() {
        ({ autos, log, tabelasOk } = await pegar());
        desenhar();
      }
      async function alternar(a) {
        const r = await P.gravar(() => window.sb.from("instagram_automacoes").update({ ativo: !a.ativo }).eq("id", a.id));
        if (!r.ok) return;
        P.toast(a.ativo ? "Automação desligada" : "Automação ligada");
        recarregar();
      }

      function tabelaAutomacoes() {
        const cab = h("thead", null, h("tr", null, ["Palavra", "Link enviado", "Mensagem da DM", "Resposta no comentário", "Ligada", " "].map((t) => h("th", { text: t.trim() }))));
        const tbody = h("tbody");
        if (!autos.length) {
          tbody.append(h("tr", { class: "exemplo" },
            h("td", null, "COCO", P.etiquetaExemplo()), h("td", { text: "https://..." }), h("td", { text: "Oi! Aqui está o link da promoção do coco:" }),
            h("td", { text: RESPOSTA_PADRAO }), h("td", { text: "Sim" }), h("td")));
        }
        autos.forEach((a) => {
          tbody.append(h("tr", { class: (a.ativo ? "" : "escondida") + " clicavel", onclick: () => abrirFormulario(a, recarregar, autos) },
            h("td", { class: "nw" }, h("b", { text: String(a.palavra).toUpperCase(), style: "font-weight:600" })),
            h("td", { class: "truncar", style: "max-width:240px" }, h("a", { href: a.link, target: "_blank", rel: "noopener noreferrer", text: a.link, onclick: (e) => e.stopPropagation() })),
            h("td", { class: "truncar", style: "max-width:260px", title: a.mensagem || "", text: a.mensagem || "Oi! Aqui está o link que você pediu:" }),
            h("td", { class: "truncar", style: "max-width:220px", text: a.responder_no_comentario ? (a.resposta_comentario || RESPOSTA_PADRAO) : "Não responde" }),
            h("td", null, h("button", { type: "button", class: "btn-i" + (a.ativo ? " lig" : ""), title: a.ativo ? "Ligada. Clique para desligar." : "Desligada. Clique para ligar.",
              "aria-label": (a.ativo ? "Desligar " : "Ligar ") + a.palavra, "aria-pressed": String(!!a.ativo),
              onclick: (e) => { e.stopPropagation(); alternar(a); } }, P.ic(a.ativo ? "olho" : "olhoFechado"))),
            h("td", { class: "acoes" }, h("button", { type: "button", class: "btn-i", title: "Editar", "aria-label": "Editar " + a.palavra,
              onclick: (e) => { e.stopPropagation(); abrirFormulario(a, recarregar, autos); } }, P.ic("lapis")))));
        });
        return h("div", { class: "rolagem" }, h("table", { class: "tabela" }, cab, tbody));
      }

      function tabelaHistorico() {
        if (!log.length) return h("p", { class: "fraco", text: "Ainda não houve nenhuma resposta automática. Quando alguém comentar uma palavra-chave, aparece aqui." });
        const cab = h("thead", null, h("tr", null, ["Quando", "Pessoa", "Palavra", "Mensagem privada", "Comentário", "Detalhe do erro"].map((t) => h("th", { text: t }))));
        const tbody = h("tbody", null, log.map((l) => h("tr", null,
          h("td", { class: "nw", text: quando(l.criado_em) }),
          h("td", { class: "nw", text: l.usuario ? "@" + l.usuario : "(sem nome)" }),
          h("td", { class: "nw", text: String(l.palavra || "").toUpperCase() }),
          h("td", null, pilulaStatus(l.dm_status, NOME_DM)),
          h("td", null, pilulaStatus(l.comentario_status, NOME_COM)),
          h("td", { class: "truncar", style: "max-width:320px", title: l.erro || "", text: l.erro || "" }))));
        return h("div", { class: "rolagem" }, h("table", { class: "tabela" }, cab, tbody));
      }

      function desenhar() {
        if (!tabelasOk) {
          P.limpar(raiz).append(h("div", { class: "aviso-pagina erro", role: "alert" },
            h("b", { text: "Falta criar as tabelas desta aba no Supabase" }),
            h("p", { text: "Abra o SQL Editor do projeto \"niellypinheiro portfólio\", cole o arquivo supabase/instagram_automacao.sql (o Claude te passa o texto) e clique em Run. Depois atualize esta página." })));
          return;
        }
        const falhas = log.filter((l) => l.dm_status === "erro").length;
        P.limpar(raiz).append(
          h("p", { class: "dica", style: "margin-bottom:12px", text: "Quando alguém comentar a palavra-chave num post seu, a pessoa recebe o link por mensagem privada e o comentário dela é respondido. Comentários sem palavra-chave não recebem nada: você responde na mão." }),
          h("details", { class: "aviso-pagina", style: "background:var(--cartao);color:var(--tinta-2);border-color:var(--linha)" },
            h("summary", { text: "Antes de usar: o que precisa estar ligado na Meta e no Instagram", style: "cursor:pointer;font-weight:600" }),
            h("ol", { class: "passos" },
              h("li", { text: "No painel da Meta, no seu app, adicione a permissão instagram_business_manage_messages." }),
              h("li", { text: "No Instagram do celular: Configurações > Mensagens e respostas dos stories > Controles de mensagens > ligue \"Permitir acesso às mensagens\" para ferramentas conectadas." }),
              h("li", { text: "Gere o token de novo marcando as permissões de mensagens e de comentários e cole no segredo INSTAGRAM_TOKEN do Supabase." }),
              h("li", { text: "Faça o deploy da função instagram-webhook com o código novo (o Claude te passa)." }),
              h("li", { text: "Teste comentando a palavra com uma segunda conta que seja testadora do app. Para qualquer seguidor receber a DM, a Meta pode exigir a revisão do app." }))),
          h("div", { class: "ferramentas" },
            h("h2", { text: "Minhas automações", style: "font-size:14px;font-weight:600;flex:1" }),
            h("button", { type: "button", class: "btn p", onclick: () => abrirFormulario(null, recarregar, autos) }, P.ic("mais"), "Nova automação")),
          tabelaAutomacoes(),
          h("div", { class: "ferramentas", style: "margin-top:22px" },
            h("h2", { text: "Últimas respostas automáticas", style: "font-size:14px;font-weight:600;flex:1" }),
            falhas ? h("span", { class: "fraco", text: falhas + (falhas === 1 ? " com erro" : " com erro") }) : null,
            h("button", { type: "button", class: "btn", onclick: recarregar }, "Atualizar")),
          tabelaHistorico());
      }
      desenhar();
    }
  };
})();
