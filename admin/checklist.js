/* =========================================================================
   Aba CHECKLIST PORTFÓLIO
   O conteúdo vem do arquivo js/biblioteca.js (window.Biblioteca), sem mudar nada.
   O que você marca no checklist do portfólio fica salvo na tabela "marcados".
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;
  /* anexa itens soltos ou listas de itens (ignora vazios) */
  const juntar = (alvo, ...itens) => { itens.flat(Infinity).forEach((i) => { if (i != null && i !== false) alvo.append(i); }); return alvo; };

  const CORES = {
    coral: ["#f08a74", "#b8483a"], rosa: ["#e98db0", "#a63c68"], mostarda: ["#e6b73c", "#9a7010"],
    terra: ["#c47a4a", "#74391f"], oliva: ["#93a05a", "#4a5636"], areia: ["#d8c299", "#9c7e55"]
  };
  const SUBABAS = [["checklist", "Checklist do portfólio"], ["referencias", "Referências de vídeo"], ["roteiros", "Roteiros"], ["ideias", "Ideias por nicho"], ["revisar", "Revisar meu roteiro"]];

  /* chave de texto estável para cada item marcado (não muda se a ordem mudar) */
  const chaveDoItem = (secao, item) => "checklist:" + secao.id + ":" + P.semAcento(item.t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  const html = (el, texto) => { el.innerHTML = P.htmlSeguro(texto); return el; };
  const embutido = (tag, props, texto) => html(h(tag, props), texto);

  /* seção que abre e fecha */
  function sanfona({ emoji, titulo, resumo, contagem, progresso, corpo, aberta }) {
    const cab = h("button", { type: "button", class: "sanfona-cab", "aria-expanded": String(!!aberta) },
      emoji ? h("span", { class: "emoji", "aria-hidden": "true", text: emoji }) : null,
      h("span", { class: "txt" }, h("b", { text: titulo }), resumo ? h("span", { text: resumo }) : null),
      contagem ? h("span", { class: "cont", text: contagem }) : null,
      h("span", { class: "seta" }, P.ic("baixo")));
    const area = h("div", { class: "sanfona-corpo", hidden: !aberta }, corpo);
    cab.addEventListener("click", () => {
      const abrir = cab.getAttribute("aria-expanded") !== "true";
      cab.setAttribute("aria-expanded", String(abrir));
      area.hidden = !abrir;
    });
    const raiz = h("div", { class: "sanfona" }, cab, progresso ? h("div", { style: "padding:0 14px 10px" }, progresso) : null, area);
    return raiz;
  }
  const barra = (feitos, total) => h("div", { class: "progresso", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(feitos) },
    h("i", { estilo: { width: (total ? Math.round((feitos / total) * 100) : 0) + "%" } }));

  /* ---------- 1. checklist do portfólio ---------- */
  function abaChecklist(alvo, B, marcados) {
    const secoes = B.CHECKLIST || [];
    const total = secoes.reduce((s, x) => s + x.itens.length, 0);
    function desenhar() {
      const feitosGeral = secoes.reduce((s, x) => s + x.itens.filter((i) => marcados.has(chaveDoItem(x, i))).length, 0);
      juntar(P.limpar(alvo),
        h("div", { class: "cartao-bloco geral" },
          h("div", { class: "linha" }, h("b", { text: "Progresso geral" }), h("span", { text: feitosGeral + " de " + total + " itens (" + (total ? Math.round((feitosGeral / total) * 100) : 0) + "%)" })),
          barra(feitosGeral, total)),
        secoes.map((sec) => {
          const feitos = sec.itens.filter((i) => marcados.has(chaveDoItem(sec, i))).length;
          const corpo = h("div", null,
            h("p", { class: "porque" }, h("b", { text: "Por que importa: " }), sec.porque),
            sec.itens.map((item) => {
              const chave = chaveDoItem(sec, item), id = "ck-" + chave;
              const caixa = h("input", { type: "checkbox", id, checked: marcados.has(chave) });
              caixa.addEventListener("change", async () => {
                const ligado = caixa.checked;
                const r = await P.gravar(() => window.sb.from("marcados").upsert({ chave, marcado: ligado, atualizado_em: new Date().toISOString() }, { onConflict: "chave" }));
                if (!r.ok) { caixa.checked = !ligado; return; }
                if (ligado) marcados.add(chave); else marcados.delete(chave);
                estadoAberto[sec.id] = true;
                desenhar();
              });
              return h("div", { class: "check" + (caixa.checked ? " ok" : "") }, caixa, h("label", { for: id }, h("b", { text: item.t }), h("span", { text: item.d })));
            }));
          const s = sanfona({ emoji: sec.emoji, titulo: sec.nome, resumo: sec.resumo, contagem: feitos + "/" + sec.itens.length, progresso: barra(feitos, sec.itens.length), corpo, aberta: !!estadoAberto[sec.id] });
          s.querySelector(".sanfona-cab").addEventListener("click", () => { estadoAberto[sec.id] = s.querySelector(".sanfona-cab").getAttribute("aria-expanded") === "true"; });
          return s;
        }));
    }
    const estadoAberto = {};
    desenhar();
  }

  /* ---------- 2. referências de vídeo ---------- */
  function fichaReferencia(r) {
    const bloco = (rot, texto) => (texto ? [h("h3", { text: rot }), h("p", { text: texto })] : null);
    const corpo = h("div", { class: "ficha" },
      h("p", null, [r.estilo, r.audiencia, r.marca, r.duracao].filter(Boolean).map((t) => h("span", { class: "pilula p-conteudo", style: "margin:0 6px 4px 0", text: t }))),
      bloco("Gancho", r.gancho), bloco("Por que funciona", r.porque), bloco("O diferencial", r.diferencial), bloco("Erro comum", r.erro),
      h("h3", { text: "Roteiro em blocos de tempo" }),
      (r.roteiro || []).map((b) => h("div", { class: "bloco-tempo" }, h("span", { class: "t", text: b.t }), embutido("span", null, b.o))));
    P.modal({ titulo: (r.emoji ? r.emoji + " " : "") + r.titulo, corpo, larga: true,
      botoes: [{ texto: "Fechar" }, r.youtube ? { texto: "Assistir o vídeo", classe: "p", fecha: false, aoClicar: () => { window.open(r.youtube, "_blank", "noopener"); return false; } } : null].filter(Boolean) });
  }
  function abaReferencias(alvo, B) {
    const lista = B.REFERENCIAS || [];
    P.limpar(alvo).append(h("div", { class: "grade-cartoes" }, lista.map((r) => {
      const [c1, c2] = CORES[r.cor] || CORES.areia;
      return h("button", { type: "button", class: "ref", "aria-label": "Abrir a ficha: " + r.titulo, onclick: () => fichaReferencia(r) },
        h("div", { class: "capa", estilo: { "--c1": c1, "--c2": c2 } }, h("span", { "aria-hidden": "true", text: r.emoji || "" }), r.duracao ? h("small", { text: r.duracao }) : null),
        h("div", { class: "info" }, h("b", { text: r.titulo }), h("span", { text: [r.estilo, r.marca].filter(Boolean).join(" · ") })));
    })));
  }

  /* ---------- 3. roteiros ---------- */
  function abaRoteiros(alvo, B) {
    juntar(P.limpar(alvo), (B.TIPOS || []).map((t) => sanfona({
      emoji: t.emoji, titulo: t.nome, resumo: t.duracao,
      corpo: h("div", { class: "ficha" },
        h("h3", { text: "Quando usar" }), h("p", { text: t.porque }),
        h("h3", { text: "Blocos de tempo" }),
        (t.beats || []).map((b) => h("div", { class: "bloco-tempo" }, h("span", { class: "t", text: b.t }), embutido("span", null, b.o))),
        (t.erros && t.erros.length) ? [h("h3", { text: "Erros comuns" }), h("ul", { class: "erros" }, t.erros.map((e) => h("li", { text: e })))] : null)
    })));
  }

  /* ---------- 4. ideias por nicho ---------- */
  function abaIdeias(alvo, B) {
    const dicas = B.COMO_USAR || [];
    juntar(P.limpar(alvo),
      dicas.length ? sanfona({ titulo: "Como usar os ganchos", resumo: "Leia antes de gravar", corpo: h("ul", { class: "lista-simples" }, dicas.map((d) => h("li", { text: d }))) }) : null,
      (B.NICHOS || []).map((n) => sanfona({
        emoji: n.emoji, titulo: n.nome, resumo: (n.ideias || []).length + " ideias",
        corpo: h("div", { class: "ficha" }, (n.ideias || []).map((i) => h("div", { style: "padding:8px 0;border-top:1px solid var(--linha)" },
          h("b", { text: i.t, style: "font-weight:500" }), h("span", { class: "gancho", text: "“" + i.gancho + "”" }))))
      })));
  }

  /* ---------- 5. revisar meu roteiro (só nesta tela, não salva nada) ---------- */
  function abaRevisar(alvo, B) {
    const marcadas = new Set();
    const roteiro = h("textarea", { placeholder: "Cole aqui o seu roteiro para revisar", style: "min-height:150px", "aria-label": "Seu roteiro" });
    const resumo = h("span", { class: "fraco", style: "font-size:13px" });
    const area = h("div");
    function conta() { const n = roteiro.value.trim() ? roteiro.value.trim().split(/\s+/).length : 0; resumo.textContent = n + (n === 1 ? " palavra" : " palavras"); }
    roteiro.addEventListener("input", conta);
    function desenhar() {
      juntar(P.limpar(area), (B.REVISAO || []).map((bl, bi) => {
        const feitos = bl.itens.filter((_, ii) => marcadas.has(bi + ":" + ii)).length;
        return sanfona({ emoji: bl.emoji, titulo: bl.bloco, contagem: feitos + "/" + bl.itens.length, progresso: barra(feitos, bl.itens.length), aberta: true,
          corpo: bl.itens.map((it, ii) => {
            const k = bi + ":" + ii, id = "rv-" + k;
            const caixa = h("input", { type: "checkbox", id, checked: marcadas.has(k) });
            caixa.addEventListener("change", () => { if (caixa.checked) marcadas.add(k); else marcadas.delete(k); desenhar(); });
            return h("div", { class: "check" + (caixa.checked ? " ok" : "") }, caixa, h("label", { for: id }, h("b", { text: it.t }), h("span", { text: it.d })));
          }) });
      }));
    }
    P.limpar(alvo).append(
      h("div", { class: "cartao-bloco corpo" }, roteiro,
        h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap" }, resumo,
          h("button", { type: "button", class: "btn", onclick: () => { roteiro.value = ""; marcadas.clear(); conta(); desenhar(); } }, "Limpar tudo"))),
      h("div", { class: "secao" }, area));
    conta(); desenhar();
  }

  P.abas.checklist = {
    async renderizar(raiz) {
      const B = window.Biblioteca;
      if (!B) {
        raiz.append(h("div", { class: "aviso-pagina erro", role: "alert", text: "Não encontrei o arquivo js/biblioteca.js, então o conteúdo desta aba não carregou. Confira se ele está na pasta js do site." }));
        return;
      }
      const r = await P.carregar("marcados", (t) => t.select("chave,marcado"));
      const marcados = new Set(r.dados.filter((x) => x.marcado).map((x) => x.chave));
      let atual = "checklist";
      const conteudo = h("div");
      const abas = h("div", { class: "subabas", role: "tablist" });
      const desenhar = { checklist: abaChecklist, referencias: abaReferencias, roteiros: abaRoteiros, ideias: abaIdeias, revisar: abaRevisar };
      function abrir(nome) {
        atual = nome;
        abas.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === nome)));
        desenhar[nome](conteudo, B, marcados);
      }
      SUBABAS.forEach(([v, t]) => abas.append(h("button", { type: "button", role: "tab", "data-aba": v, "aria-selected": String(v === atual), text: t, onclick: () => abrir(v) })));
      raiz.append(abas, conteudo);
      abrir("checklist");
    }
  };
})();
