/* =========================================================================
   Aba CALENDÁRIO: o mês inteiro, de segunda a domingo.
   Os prazos das campanhas aparecem sozinhos, vindos da tabela campanhas.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;

  const TIPOS = [["gravar", "Gravar"], ["editar", "Editar"], ["postar", "Postar"]];
  const ORDEM_TIPO = { gravar: 0, editar: 1, postar: 2, campanha: 3 };
  const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const nomeTipo = (t) => (TIPOS.find((x) => x[0] === t) || [t, t])[1];
  const MAX_POR_DIA = 3;

  function abrirFormulario(item, dataInicial, aoSalvar) {
    const novo = !item;
    const v = item || { titulo: "", marca: "", tipo: "gravar", data: dataInicial || P.hoje(), status: "a fazer" };
    const titulo = h("input", { type: "text", value: v.titulo, maxlength: "200", autocomplete: "off" });
    const marca = h("input", { type: "text", value: v.marca || "", maxlength: "120", placeholder: "Nome da marca (opcional)" });
    const tipo = h("select", null, P.opcoes(TIPOS, v.tipo));
    const data = h("input", { type: "date", value: String(v.data).slice(0, 10) });
    const status = h("select", null, P.opcoes([["a fazer", "A fazer"], ["feito", "Feito"]], v.status));
    const corpo = h("div", null,
      P.campo("O que precisa ser feito", titulo),
      P.campo("Marca", marca),
      h("div", { class: "grade2" }, P.campo("Tipo", tipo), P.campo("Data", data)),
      P.campo("Status", status));
    const botoes = [
      { texto: "Cancelar" },
      { texto: "Salvar", classe: "p", aoClicar: async () => {
        P.erroNoCampo(titulo, ""); P.erroNoCampo(data, "");
        let ok = true;
        if (!titulo.value.trim()) { P.erroNoCampo(titulo, "Escreva o que precisa ser feito."); ok = false; }
        if (!data.value) { P.erroNoCampo(data, "Escolha a data."); ok = false; }
        if (!ok) return false;
        const dados = { titulo: titulo.value.trim(), marca: marca.value.trim() || null, tipo: tipo.value, data: data.value, status: status.value };
        const r = await P.gravar(() => novo ? window.sb.from("calendario").insert(dados) : window.sb.from("calendario").update(dados).eq("id", item.id));
        if (!r.ok) return false;
        P.toast(novo ? "Adicionado ao calendário" : "Salvo");
        aoSalvar();
      } }
    ];
    if (!novo) {
      botoes.unshift({ texto: "Apagar", classe: "perigo", esquerda: true, aoClicar: async () => {
        if (!(await P.confirmar('Apagar "' + item.titulo + '" do calendário?', { botao: "Apagar", perigo: true, titulo: "Apagar item" }))) return false;
        const r = await P.gravar(() => window.sb.from("calendario").delete().eq("id", item.id));
        if (!r.ok) return false;
        P.toast("Item apagado");
        aoSalvar();
      } });
    }
    P.modal({ titulo: novo ? "Adicionar ao calendário" : "Editar item", corpo, botoes });
  }

  P.abas.calendario = {
    async renderizar(raiz) {
      const [rc, rp] = await Promise.all([
        P.carregar("calendario", (t) => t.select("*").order("data", { ascending: true })),
        P.carregar("campanhas", (t) => t.select("id,campanha,cliente,prazo,status").not("prazo", "is", null))
      ]);
      let feitos = rc.dados, campanhas = rp.dados;
      const agora = new Date();
      const estado = { ano: agora.getFullYear(), mes: agora.getMonth(), tipo: "todos" };

      async function recarregar() {
        const r = await P.carregar("calendario", (t) => t.select("*").order("data", { ascending: true }));
        if (r.ok) feitos = r.dados;
        desenhar();
      }
      /* junta os itens do calendário com os prazos das campanhas (que ainda não foram entregues) */
      function todosOsItens() {
        const itens = feitos.map((i) => ({ ...i, data: String(i.data).slice(0, 10), origem: "calendario" }));
        campanhas.filter((c) => c.status !== "Entregue").forEach((c) => {
          itens.push({ id: "camp-" + c.id, titulo: "Prazo: " + c.campanha, marca: c.cliente, tipo: "campanha", data: String(c.prazo).slice(0, 10), status: "a fazer", origem: "campanha" });
        });
        return itens;
      }
      const passaNoFiltro = (i) => estado.tipo === "todos" || i.tipo === estado.tipo;

      function chip(i) {
        const feito = i.status === "feito";
        if (i.origem === "campanha") {
          return h("button", { type: "button", class: "item-cal ic-campanha", title: i.titulo + (i.marca ? " (" + i.marca + ")" : "") + ". Vem da aba Campanhas.",
            onclick: (e) => { e.stopPropagation(); P.ir("campanhas"); } }, i.titulo);
        }
        return h("button", { type: "button", class: "item-cal ic-" + i.tipo + (feito ? " feito" : ""),
          title: nomeTipo(i.tipo) + ": " + i.titulo + (i.marca ? " (" + i.marca + ")" : "") + (feito ? " (feito)" : ""),
          onclick: (e) => { e.stopPropagation(); abrirFormulario(i, null, recarregar); } }, i.titulo);
      }

      function abrirDia(iso, itens) {
        const d = P.paraData(iso);
        const titulo = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
        const lista = h("ul", { class: "lista-dia" });
        itens.forEach((i) => {
          const linha = h("li", null,
            h("span", { class: "pilula " + (i.origem === "campanha" ? "p-publicidade" : "p-" + (i.tipo === "gravar" ? "conteudo" : i.tipo === "editar" ? "s2" : "cliente")), text: i.origem === "campanha" ? "Prazo" : nomeTipo(i.tipo) }),
            h("span", { class: "t", text: i.titulo.replace(/^Prazo: /, "") + (i.marca ? " (" + i.marca + ")" : "") + (i.status === "feito" ? " (feito)" : "") }));
          if (i.origem === "campanha") linha.append(h("button", { type: "button", class: "btn", onclick: () => { modal.fechar(); P.ir("campanhas"); } }, "Ver campanhas"));
          else linha.append(h("button", { type: "button", class: "btn-i", "aria-label": "Editar " + i.titulo, onclick: () => { modal.fechar(); abrirFormulario(i, null, recarregar); } }, P.ic("lapis")));
          lista.append(linha);
        });
        const modal = P.modal({ titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1), corpo: lista,
          botoes: [{ texto: "Fechar" }, { texto: "Adicionar neste dia", classe: "p", fecha: true, aoClicar: () => { setTimeout(() => abrirFormulario(null, iso, recarregar), 0); } }] });
      }

      function celulasDoMes() {
        const primeiro = new Date(estado.ano, estado.mes, 1);
        const desloc = (primeiro.getDay() + 6) % 7;             /* segunda = 0 */
        const dias = new Date(estado.ano, estado.mes + 1, 0).getDate();
        const semanas = Math.ceil((desloc + dias) / 7);
        return Array.from({ length: semanas * 7 }, (_, i) => new Date(estado.ano, estado.mes, 1 - desloc + i));
      }

      function desenharGrade(itensTodos) {
        const hoje = P.hoje();
        const visiveis = itensTodos.filter(passaNoFiltro);
        const porDia = {};
        visiveis.forEach((i) => { (porDia[i.data] = porDia[i.data] || []).push(i); });
        const vazioTotal = !feitos.length && !campanhas.some((c) => c.status !== "Entregue");
        const grade = h("div", { class: "cal-grade" });
        celulasDoMes().forEach((d) => {
          const iso = P.iso(d);
          const fora = d.getMonth() !== estado.mes;
          let itens = (porDia[iso] || []).slice().sort((a, b) => (a.status === "feito") - (b.status === "feito") || ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo]);
          const mostrados = itens.slice(0, MAX_POR_DIA);
          const celula = h("div", { class: "dia" + (fora ? " fora" : "") + (iso === hoje ? " hoje" : ""), role: "gridcell",
            onclick: () => abrirFormulario(null, iso, recarregar) },
            h("span", { class: "n", text: String(d.getDate()) }),
            h("button", { type: "button", class: "mais-novo", title: "Adicionar neste dia", "aria-label": "Adicionar no dia " + P.fmtData(iso),
              onclick: (e) => { e.stopPropagation(); abrirFormulario(null, iso, recarregar); } }, P.ic("mais")),
            mostrados.map(chip));
          if (itens.length > MAX_POR_DIA) {
            celula.append(h("button", { type: "button", class: "mais-itens", onclick: (e) => { e.stopPropagation(); abrirDia(iso, itens); } }, "+" + (itens.length - MAX_POR_DIA) + " mais"));
          }
          if (vazioTotal && iso === hoje) celula.append(h("span", { class: "item-cal ic-exemplo", text: "Exemplo: gravar vídeo", title: "Isto é só um exemplo, não está salvo." }));
          grade.append(celula);
        });
        return h("div", null,
          vazioTotal ? h("p", { class: "aviso-pagina", text: "Seu calendário está vazio. O item pontilhado de hoje é só um exemplo e não está salvo. Clique em um dia para adicionar o primeiro." }) : null,
          h("div", { class: "cal", role: "grid", "aria-label": "Calendário do mês" },
            h("div", { class: "cal-semana" }, SEMANA.map((s) => h("div", { text: s }))), grade),
          h("div", { class: "legenda-cal" },
            h("span", null, h("i", { style: "background:var(--bordo-suave);border:1px solid var(--bordo)" }), "Gravar"),
            h("span", null, h("i", { style: "background:var(--laranja-suave);border:1px solid var(--laranja)" }), "Editar"),
            h("span", null, h("i", { style: "background:var(--verde-suave);border:1px solid var(--verde)" }), "Postar"),
            h("span", null, h("i", { style: "background:var(--ouro-suave);border:1px dashed #6b5300" }), "Prazo de campanha (vem da aba Campanhas, aparece em Todos)")));
      }

      function desenharAtrasados() {
        const hoje = P.hoje();
        const atrasados = feitos.filter((i) => i.status !== "feito" && String(i.data).slice(0, 10) < hoje).sort((a, b) => String(a.data).localeCompare(String(b.data)));
        const corpo = atrasados.length
          ? h("ul", { class: "atrasados" }, atrasados.map((i) => {
              const dias = P.diasEntre(String(i.data).slice(0, 10), hoje);
              return h("li", null,
                h("span", { class: "pilula p-conteudo", text: nomeTipo(i.tipo) }),
                h("span", { class: "t", text: i.titulo + (i.marca ? " (" + i.marca + ")" : "") }),
                h("span", { class: "tag atraso", style: "margin:0", text: "há " + dias + (dias === 1 ? " dia" : " dias") }),
                h("button", { type: "button", class: "btn", onclick: async () => { const r = await P.gravar(() => window.sb.from("calendario").update({ status: "feito" }).eq("id", i.id)); if (r.ok) { P.toast("Marcado como feito"); recarregar(); } } }, P.ic("check"), "Feito"),
                h("button", { type: "button", class: "btn-i", "aria-label": "Editar " + i.titulo, onclick: () => abrirFormulario(i, null, recarregar) }, P.ic("lapis")));
            }))
          : h("div", { class: "corpo" }, h("div", { class: "vazio", text: "Nada ficou para trás. Tudo em dia." }));
        return h("section", { class: "cartao-bloco secao" },
          h("div", { class: "bloco-cab" }, h("h2", { text: "Ficou pra trás" }), atrasados.length ? h("span", { class: "tag atraso", style: "margin:0", text: atrasados.length + (atrasados.length === 1 ? " item" : " itens") }) : null),
          corpo);
      }

      function desenhar() {
        const itens = todosOsItens();
        const mesTexto = new Date(estado.ano, estado.mes, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        const nomeMes = mesTexto.charAt(0).toUpperCase() + mesTexto.slice(1);
        const filtros = h("div", { class: "filtros", role: "group", "aria-label": "Filtrar por tipo" },
          [["todos", "Todos"]].concat(TIPOS).map(([v, t]) => h("button", { type: "button", "aria-pressed": String(estado.tipo === v), text: t, onclick: () => { estado.tipo = v; desenhar(); } })));
        const mover = (n) => { const d = new Date(estado.ano, estado.mes + n, 1); estado.ano = d.getFullYear(); estado.mes = d.getMonth(); desenhar(); };
        P.limpar(raiz).append(
          h("div", { class: "cal-topo" },
            h("button", { type: "button", class: "btn-i", "aria-label": "Mês anterior", onclick: () => mover(-1) }, P.ic("esq")),
            h("h2", { class: "mes", text: nomeMes, "aria-live": "polite" }),
            h("button", { type: "button", class: "btn-i", "aria-label": "Próximo mês", onclick: () => mover(1) }, P.ic("dir")),
            h("button", { type: "button", class: "btn", onclick: () => { const a = new Date(); estado.ano = a.getFullYear(); estado.mes = a.getMonth(); desenhar(); } }, "Este mês"),
            h("span", { class: "espaco", style: "flex:1" }),
            filtros,
            h("button", { type: "button", class: "btn p", onclick: () => abrirFormulario(null, P.hoje(), recarregar) }, P.ic("mais"), "Adicionar")),
          desenharGrade(itens),
          desenharAtrasados());
      }
      desenhar();
    }
  };
})();
