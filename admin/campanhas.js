/* =========================================================================
   Aba CAMPANHAS: os trabalhos que você faz para as marcas
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;

  /* O funil, na ordem: ordenar por status segue ESTA ordem, nunca a alfabética */
  const STATUS = ["Briefing", "Roteiro", "Aprovação Roteiro", "Gravação", "Edição", "Aprovado", "Entregue"];
  const TIPOS = ["Conteúdo", "Publicidade"];
  const PAGAMENTOS = [["pendente", "Pendente"], ["pago", "Pago"]];
  P.STATUS_CAMPANHA = STATUS;

  const indiceStatus = (s) => STATUS.indexOf(s);
  const pilulaStatus = (s) => h("span", { class: "pilula p-s" + Math.max(0, indiceStatus(s)), text: s });
  const pilulaTipo = (t) => h("span", { class: "pilula " + (t === "Publicidade" ? "p-publicidade" : "p-conteudo"), text: t });

  /* Etiqueta do prazo: vermelha se atrasou, amarela se vence em até 3 dias. Entregue não recebe aviso. */
  function etiquetaPrazo(c) {
    if (!c.prazo || c.status === "Entregue") return null;
    const d = P.diasEntre(P.hoje(), c.prazo);
    if (d < 0) return h("span", { class: "tag atraso", text: -d + (d === -1 ? " dia de atraso" : " dias de atraso") });
    if (d === 0) return h("span", { class: "tag perto", text: "Vence hoje" });
    if (d === 1) return h("span", { class: "tag perto", text: "Vence amanhã" });
    if (d <= 3) return h("span", { class: "tag perto", text: "Vence em " + d + " dias" });
    return null;
  }

  function abrirFormulario(c, aoSalvar) {
    const novo = !c;
    const v = c || { campanha: "", cliente: "", tipo: "Conteúdo", status: "Briefing", qtd: 1, valor: 0, prazo: "", pagamento: "pendente", ativa: true, favorita: false };
    const campanha = h("input", { type: "text", value: v.campanha, maxlength: "200", autocomplete: "off" });
    const cliente = h("input", { type: "text", value: v.cliente || "", maxlength: "200", placeholder: "Nome da marca ou cliente", autocomplete: "off" });
    const tipo = h("select", null, P.opcoes(TIPOS.map((t) => [t, t]), v.tipo));
    const status = h("select", null, P.opcoes(STATUS.map((s) => [s, s]), v.status));
    const qtd = h("input", { type: "number", min: "0", step: "1", value: String(v.qtd) });
    const valor = h("input", { type: "text", inputmode: "decimal", value: v.valor ? String(v.valor).replace(".", ",") : "", placeholder: "0,00" });
    const prazo = h("input", { type: "date", value: v.prazo ? String(v.prazo).slice(0, 10) : "" });
    const pagamento = h("select", null, P.opcoes(PAGAMENTOS, v.pagamento));
    const ativa = h("input", { type: "checkbox", checked: !!v.ativa, id: "cativa" });
    const favorita = h("input", { type: "checkbox", checked: !!v.favorita, id: "cfav" });
    /* Ao marcar "Entregue", a campanha deixa de ser ativa (dá para mudar depois) */
    let statusAnterior = v.status;
    status.addEventListener("change", () => {
      if (status.value === "Entregue") ativa.checked = false;
      else if (statusAnterior === "Entregue") ativa.checked = true;
      statusAnterior = status.value;
    });

    const corpo = h("div", null,
      P.campo("Campanha", campanha),
      P.campo("Cliente", cliente),
      h("div", { class: "grade2" }, P.campo("Tipo", tipo), P.campo("Status", status)),
      h("div", { class: "grade2" }, P.campo("Quantidade de vídeos", qtd), P.campo("Valor (R$)", valor, "O valor da campanha inteira.")),
      h("div", { class: "grade2" }, P.campo("Prazo de entrega", prazo), P.campo("Pagamento", pagamento)),
      h("label", { class: "marcar", for: "cativa" }, ativa, "Campanha ativa"),
      h("label", { class: "marcar", for: "cfav" }, favorita, "Favorita (fica destacada na lista)"));

    const botoes = [
      { texto: "Cancelar" },
      { texto: "Salvar", classe: "p", aoClicar: async () => {
        P.erroNoCampo(campanha, "");
        if (!campanha.value.trim()) { P.erroNoCampo(campanha, "Escreva o nome da campanha."); return false; }
        const dados = { campanha: campanha.value.trim(), cliente: cliente.value.trim() || null, tipo: tipo.value, status: status.value,
          qtd: Math.max(0, parseInt(qtd.value, 10) || 0), valor: Math.max(0, P.lerValor(valor.value)), prazo: prazo.value || null,
          pagamento: pagamento.value, ativa: ativa.checked, favorita: favorita.checked };
        const r = await P.gravar(() => novo ? window.sb.from("campanhas").insert(dados) : window.sb.from("campanhas").update(dados).eq("id", c.id));
        if (!r.ok) return false;
        P.toast(novo ? "Campanha adicionada" : "Campanha salva");
        aoSalvar();
      } }
    ];
    if (!novo) {
      botoes.unshift({ texto: "Apagar", classe: "perigo", esquerda: true, aoClicar: async () => {
        if (!(await P.confirmar('Apagar a campanha "' + c.campanha + '"? Isso não dá para desfazer.', { botao: "Apagar", perigo: true, titulo: "Apagar campanha" }))) return false;
        const r = await P.gravar(() => window.sb.from("campanhas").delete().eq("id", c.id));
        if (!r.ok) return false;
        P.toast("Campanha apagada");
        aoSalvar();
      } });
    }
    P.modal({ titulo: novo ? "Adicionar campanha" : "Editar campanha", corpo, botoes });
  }

  P.abas.campanhas = {
    async renderizar(raiz) {
      const ler = () => P.carregar("campanhas", (t) => t.select("*").order("criado_em", { ascending: false }));
      let lista = (await ler()).dados;
      const estado = { busca: "", filtro: "todas", chave: "prazo", dir: "asc" };

      async function recarregar() { const r = await ler(); if (r.ok) lista = r.dados; desenhar(); }
      async function alterar(id, campos) {
        const r = await P.gravar(() => window.sb.from("campanhas").update(campos).eq("id", id));
        if (r.ok) await recarregar();
      }

      function filtrada() {
        const q = P.semAcento(estado.busca);
        let itens = lista.filter((c) => estado.filtro === "todas" || (estado.filtro === "ativas" ? c.ativa : !c.ativa));
        if (q) itens = itens.filter((c) => P.semAcento(c.campanha + " " + (c.cliente || "")).includes(q));
        const valor = {
          favorita: (c) => (c.favorita ? 0 : 1), campanha: (c) => c.campanha, cliente: (c) => c.cliente || null, tipo: (c) => c.tipo,
          status: (c) => indiceStatus(c.status), qtd: (c) => Number(c.qtd) || 0, valor: (c) => Number(c.valor) || 0,
          prazo: (c) => c.prazo || null, pagamento: (c) => (c.pagamento === "pago" ? 1 : 0)
        }[estado.chave];
        return P.ordenar(itens, valor, estado.dir);
      }
      function baixar() {
        P.baixarCSV("minhas-campanhas.csv", ["Favorita", "Campanha", "Cliente", "Tipo", "Status", "Qtd", "Valor", "Prazo", "Pagamento", "Ativa"],
          lista.map((c) => [c.favorita ? "sim" : "", c.campanha, c.cliente, c.tipo, c.status, c.qtd, String(c.valor).replace(".", ","),
            P.fmtData(c.prazo), c.pagamento === "pago" ? "Pago" : "Pendente", c.ativa ? "sim" : "não"]));
      }

      const tabelaBox = h("div");
      function desenharTabela() {
        P.limpar(tabelaBox);
        const cab = (r, c, cls) => P.cabecalho(r, c, estado, desenharTabela, cls);
        const thead = h("thead", null, h("tr", null,
          cab("Favorita", "favorita"), cab("Campanha", "campanha"), cab("Cliente", "cliente"), cab("Tipo", "tipo"), cab("Status", "status"),
          cab("Qtd", "qtd", "num"), cab("Valor", "valor", "num"), cab("Prazo", "prazo"), cab("Pagamento", "pagamento")));
        const tbody = h("tbody");
        if (!lista.length) {
          tabelaBox.append(h("p", { class: "aviso-pagina", text: "Você ainda não cadastrou campanhas. A linha abaixo é só um exemplo do formato e some quando você adicionar a primeira. Os números lá em cima ficam em zero até lá." }));
          tbody.append(h("tr", { class: "exemplo" },
            h("td", null, h("span", { class: "estrela" }, P.ic("estrela"))),
            h("td", null, "Campanha de exemplo", P.etiquetaExemplo()), h("td", { text: "Nome do cliente" }), h("td", null, pilulaTipo("Conteúdo")), h("td", null, pilulaStatus("Briefing")),
            h("td", { class: "num", text: "3" }), h("td", { class: "num", text: P.dinheiro(1500) }), h("td", { text: "00/00/0000" }), h("td", null, h("span", { class: "pilula p-pendente", text: "Pendente" }))));
        } else {
          const itens = filtrada();
          if (!itens.length) tbody.append(h("tr", null, h("td", { colspan: "9", class: "fraco", text: "Nenhuma campanha encontrada com esse filtro ou busca." })));
          itens.forEach((c) => {
            const tag = etiquetaPrazo(c);
            const tr = h("tr", { class: "clicavel" + (c.favorita ? " destaque-linha" : ""), tabindex: "0", "aria-label": "Editar " + c.campanha,
              onclick: () => abrirFormulario(c, recarregar),
              onkeydown: (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === tr) { e.preventDefault(); abrirFormulario(c, recarregar); } } },
              h("td", null, h("button", { type: "button", class: "btn-i estrela" + (c.favorita ? " lig" : ""), title: c.favorita ? "Tirar dos favoritos" : "Marcar como favorita",
                "aria-label": (c.favorita ? "Tirar dos favoritos: " : "Marcar como favorita: ") + c.campanha, "aria-pressed": String(!!c.favorita),
                onclick: (e) => { e.stopPropagation(); alterar(c.id, { favorita: !c.favorita }); } }, P.ic("estrela"))),
              h("td", { class: "nw" }, h("b", { text: c.campanha, style: "font-weight:500" })),
              h("td", { text: c.cliente || "", class: c.cliente ? "" : "fraco" }),
              h("td", null, pilulaTipo(c.tipo)),
              h("td", null, pilulaStatus(c.status)),
              h("td", { class: "num", text: String(c.qtd) }),
              h("td", { class: "num", text: P.dinheiro(c.valor) }),
              h("td", { class: "nw" }, c.prazo ? P.fmtData(c.prazo) : h("span", { class: "fraco", text: "sem prazo" }), tag),
              h("td", null, h("button", { type: "button", class: "pilula p-" + c.pagamento, style: "border:0;cursor:pointer;font-family:inherit",
                title: "Clique para marcar como " + (c.pagamento === "pago" ? "pendente" : "pago"), "aria-label": "Pagamento " + c.pagamento + ". Clique para mudar.",
                onclick: (e) => { e.stopPropagation(); alterar(c.id, { pagamento: c.pagamento === "pago" ? "pendente" : "pago" }); },
                text: c.pagamento === "pago" ? "Pago" : "Pendente" })));
            tbody.append(tr);
          });
        }
        tabelaBox.append(h("div", { class: "rolagem" }, h("table", { class: "tabela" }, thead, tbody)));
      }

      function desenhar() {
        const totalValor = lista.reduce((s, c) => s + (Number(c.valor) || 0), 0);
        const totalVideos = lista.reduce((s, c) => s + (Number(c.qtd) || 0), 0);
        const ticket = totalVideos > 0 ? totalValor / totalVideos : 0;
        const receber = lista.filter((c) => c.pagamento !== "pago").reduce((s, c) => s + (Number(c.valor) || 0), 0);
        const recebido = totalValor - receber;
        const ativas = lista.filter((c) => c.ativa).length;
        const metrica = (rot, num, sub) => h("div", { class: "metrica" }, h("div", { class: "rot", text: rot }), h("div", { class: "num", text: num }), h("div", { class: "sub", text: sub || " " }));

        const filtros = h("div", { class: "filtros", role: "group", "aria-label": "Filtrar campanhas" },
          [["todas", "Todas"], ["ativas", "Ativas"], ["finalizadas", "Finalizadas"]].map(([v, t]) =>
            h("button", { type: "button", "aria-pressed": String(estado.filtro === v), text: t, onclick: () => { estado.filtro = v; desenhar(); } })));
        const busca = h("input", { type: "search", placeholder: "Buscar campanha ou cliente", value: estado.busca, "aria-label": "Buscar campanha" });
        busca.addEventListener("input", P.debounce(() => { estado.busca = busca.value; desenharTabela(); }, 150));

        P.limpar(raiz).append(
          h("div", { class: "faixa-metricas" },
            metrica("Total de campanhas", P.numero(lista.length)),
            metrica("Campanhas ativas", P.numero(ativas)),
            metrica("Valor total", P.dinheiro(totalValor), "Ticket médio por vídeo: " + P.dinheiro(ticket)),
            metrica("A receber", P.dinheiro(receber), "Já recebido: " + P.dinheiro(recebido))),
          h("div", { class: "ferramentas secao" },
            filtros, h("div", { class: "busca" }, P.ic("busca"), busca), h("span", { class: "espaco" }),
            h("button", { type: "button", class: "btn", onclick: baixar, disabled: !lista.length }, P.ic("baixar"), "Baixar CSV"),
            h("button", { type: "button", class: "btn p", onclick: () => abrirFormulario(null, recarregar) }, P.ic("mais"), "Adicionar campanha")),
          tabelaBox);
        desenharTabela();
      }
      desenhar();
    }
  };
})();
