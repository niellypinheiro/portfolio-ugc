/* =========================================================================
   app.js  |  Liga tudo: menu, abas, gaveta no celular e botão Sair.
   Cada aba abre separada: se uma tiver problema, as outras continuam.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;
  const ABAS = [
    ["portfolio", "Portfólio", "portfolio"],
    ["marcas", "Marcas", "marcas"],
    ["prospeccao", "Prospecção", "prospeccao"],
    ["calendario", "Calendário", "calendario"],
    ["campanhas", "Campanhas", "campanhas"],
    ["checklist", "Checklist portfólio", "checklist"],
    ["transcricoes", "Transcrições", "transcricao"],
    ["empresas_servicos", "Empresas de Serviços", "empresas_servicos"],
    ["prospeccao_smartbrand", "Prospecção", "prospeccao"]
  ];
  /* Abas que o e-mail da SmartBrand (data-aba fora deste e-mail) pode ver.
     O resto do painel (Portfólio, Marcas etc.) fica escondido para ele aqui,
     e o banco.sql também recusa esses dados para o e-mail dele, então a
     trava de verdade não depende só desta lista. */
  const ABAS_RESTRITAS = ["empresas_servicos", "prospeccao_smartbrand"];
  const $ = (id) => document.getElementById(id);
  let abaAtual = "portfolio";
  let ficha = 0;
  let restrito = false;

  function fecharGaveta() {
    $("lateral").classList.remove("aberta");
    $("fundoGaveta").classList.remove("aberto");
    $("botaoMenu").setAttribute("aria-expanded", "false");
  }
  function abrirGaveta() {
    $("lateral").classList.add("aberta");
    $("fundoGaveta").classList.add("aberto");
    $("botaoMenu").setAttribute("aria-expanded", "true");
  }

  async function ir(nome) {
    if (!P.abas[nome] || (restrito && !ABAS_RESTRITAS.includes(nome))) nome = restrito ? "empresas_servicos" : "portfolio";
    abaAtual = nome;
    if (location.hash !== "#" + nome) history.replaceState(null, "", "#" + nome);
    const def = ABAS.find((a) => a[0] === nome);
    $("tituloAba").textContent = def[1];
    document.title = def[1] + " | Painel";
    document.querySelectorAll("#menu .item").forEach((b) => {
      if (b.dataset.aba === nome) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    fecharGaveta();
    P.limparAvisos();

    const minha = ++ficha;
    const alvo = $("conteudo");
    P.limpar(alvo).append(h("p", { class: "fraco", text: "Carregando..." }));
    const raiz = h("div");
    try {
      await P.abas[nome].renderizar(raiz);
      if (minha !== ficha) return;
      P.limpar(alvo).append(raiz);
    } catch (e) {
      console.error(e);
      if (minha !== ficha) return;
      P.limpar(alvo).append(
        h("div", { class: "aviso-pagina erro", role: "alert",
          text: "Esta aba encontrou um problema e não abriu direito. As outras abas continuam funcionando." }),
        h("button", { type: "button", class: "btn", onclick: () => ir(nome) }, "Tentar de novo"));
    }
    window.scrollTo(0, 0);
  }
  P.ir = ir;

  /* Só começa depois de duas coisas: a sessão confirmada e todos os arquivos carregados */
  const paginaCarregada = new Promise((ok) => {
    if (document.readyState === "complete") ok(); else window.addEventListener("load", ok);
  });
  Promise.all([P.sessaoPronta, paginaCarregada]).then(([sessao]) => {
    const email = (sessao && sessao.user && sessao.user.email) || "";
    $("emailLogado").textContent = email;
    $("emailLogado").title = email;
    restrito = email.toLowerCase() !== window.BANCO.emailDaDona.toLowerCase();

    const menu = $("menu");
    if (restrito) {
      /* tira do menu tudo que não é a aba liberada para este e-mail */
      menu.querySelectorAll(".item").forEach((b) => { if (!ABAS_RESTRITAS.includes(b.dataset.aba)) b.remove(); });
      /* e some com os títulos de grupo que ficaram sem nenhuma aba embaixo */
      menu.querySelectorAll(".lateral-grupo").forEach((rotulo) => {
        let prox = rotulo.nextElementSibling, temItem = false;
        while (prox && !prox.classList.contains("lateral-grupo")) { if (prox.classList.contains("item")) temItem = true; prox = prox.nextElementSibling; }
        if (!temItem) rotulo.remove();
      });
    }
    menu.querySelectorAll(".item").forEach((b) => {
      const def = ABAS.find((a) => a[0] === b.dataset.aba);
      b.append(P.ic(def[2]), h("span", { text: def[1] }));
      b.addEventListener("click", () => ir(def[0]));
    });
    $("botaoMenu").append(P.ic("menu"));
    $("botaoSair").append(P.ic("sair"), "Sair");
    $("botaoSair").addEventListener("click", async () => {
      try { await window.sb.auth.signOut(); } catch (e) { /* mesmo assim volta ao login */ }
      location.replace("../login/");
    });
    $("botaoMenu").addEventListener("click", () => ($("lateral").classList.contains("aberta") ? fecharGaveta() : abrirGaveta()));
    $("fundoGaveta").addEventListener("click", fecharGaveta);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharGaveta(); });
    window.addEventListener("resize", () => { if (window.innerWidth > 860) fecharGaveta(); });
    window.addEventListener("hashchange", () => ir(location.hash.slice(1)));

    /* Agora sim o painel aparece */
    document.body.classList.remove("carregando");
    ir(restrito ? "empresas_servicos" : (location.hash.slice(1) || "portfolio"));
  });
})();
