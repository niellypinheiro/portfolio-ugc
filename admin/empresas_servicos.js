/* =========================================================================
   Aba EMPRESAS DE SERVIÇOS: as empresas que você (e seu marido) contatam
   para vender os produtos e serviços da SmartBrand Tecnologia (a loja
   física): ar-condicionado, filtros, manutenção e troca de aparelhos.

   Esta aba é separada das abas do seu portfólio de UGC. O banco.sql
   libera ela só para dois e-mails (o seu e o smartbrand1217@gmail.com);
   nenhuma outra aba deste painel muda por causa disso.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;

  const SITUACOES = [["lead", "Lead"], ["email_enviado", "E-mail enviado"], ["conversando", "Conversando"], ["cliente", "Cliente"], ["parada", "Parada"]];
  const nomeSituacao = (s) => (SITUACOES.find((x) => x[0] === s) || [s, s])[1];
  const pilula = (s) => h("span", { class: "pilula p-" + s, text: nomeSituacao(s) });

  function emailOk(v) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  function abrirFormulario(empresa, aoSalvar) {
    const novo = !empresa;
    const e = empresa || { nome_empresa: "", cnpj: "", contato: "", email: "", telefone: "", situacao: "lead", interesse: "", obs: "", ultimo_contato: "" };
    const nome = h("input", { type: "text", value: e.nome_empresa, maxlength: "200", autocomplete: "off" });
    const cnpj = h("input", { type: "text", value: e.cnpj || "", maxlength: "20", placeholder: "00.000.000/0000-00" });
    const contato = h("input", { type: "text", value: e.contato || "", maxlength: "200", placeholder: "Nome de quem você fala na empresa" });
    const email = h("input", { type: "email", value: e.email || "", maxlength: "200", placeholder: "contato@empresa.com.br", autocomplete: "off" });
    const telefone = h("input", { type: "tel", value: e.telefone || "", maxlength: "40", placeholder: "(00) 00000-0000", autocomplete: "off" });
    const situacao = h("select", null, P.opcoes(SITUACOES, e.situacao));
    const interesse = h("input", { type: "text", value: e.interesse || "", maxlength: "200", placeholder: "Ex.: Ar-condicionado, manutenção de celulares" });
    const ultimoContato = h("input", { type: "date", value: e.ultimo_contato ? String(e.ultimo_contato).slice(0, 10) : "" });
    const obs = h("textarea", { maxlength: "3000", placeholder: "Anotações sobre esta empresa" });
    obs.value = e.obs || "";

    const corpo = h("div", null,
      P.campo("Nome da empresa", nome),
      h("div", { class: "grade2" }, P.campo("CNPJ", cnpj), P.campo("Contato (pessoa)", contato)),
      h("div", { class: "grade2" }, P.campo("E-mail", email), P.campo("Telefone", telefone)),
      h("div", { class: "grade2" }, P.campo("Situação", situacao), P.campo("Último contato", ultimoContato)),
      P.campo("Interesse", interesse, "O que ela quer ou pode precisar: um produto, um serviço, ou os dois."),
      P.campo("Observação", obs));

    const botoes = [
      { texto: "Cancelar" },
      { texto: "Salvar", classe: "p", aoClicar: async () => {
        P.erroNoCampo(nome, ""); P.erroNoCampo(email, "");
        let ok = true;
        if (!nome.value.trim()) { P.erroNoCampo(nome, "Escreva o nome da empresa."); ok = false; }
        if (!emailOk(email.value.trim())) P.erroNoCampo(email, "Esse texto não está no formato comum de e-mail, mas isso não impede de salvar.");
        if (!ok) return false;
        const dados = { nome_empresa: nome.value.trim(), cnpj: cnpj.value.trim() || null, contato: contato.value.trim() || null,
          email: email.value.trim() || null, telefone: telefone.value.trim() || null, situacao: situacao.value,
          interesse: interesse.value.trim() || null, obs: obs.value.trim() || null, ultimo_contato: ultimoContato.value || null };
        const r = await P.gravar(() => novo ? window.sb.from("empresas_servicos").insert(dados) : window.sb.from("empresas_servicos").update(dados).eq("id", empresa.id));
        if (!r.ok) return false;
        P.toast(novo ? "Empresa adicionada" : "Empresa salva");
        aoSalvar();
      } }
    ];
    if (!novo) {
      botoes.unshift({ texto: "Apagar", classe: "perigo", esquerda: true, aoClicar: async () => {
        if (!(await P.confirmar('Apagar "' + empresa.nome_empresa + '" da sua base? Isso não dá para desfazer.', { botao: "Apagar", perigo: true, titulo: "Apagar empresa" }))) return false;
        const r = await P.gravar(() => window.sb.from("empresas_servicos").delete().eq("id", empresa.id));
        if (!r.ok) return false;
        P.toast("Empresa apagada");
        aoSalvar();
      } });
    }
    P.modal({ titulo: novo ? "Adicionar empresa" : "Editar empresa", corpo, botoes });
  }

  P.abas.empresas_servicos = {
    async renderizar(raiz) {
      let lista = (await P.carregar("empresas_servicos", (t) => t.select("*").order("criado_em", { ascending: false }))).dados;
      const estado = { busca: "", filtro: "todas", chave: "ultimo_contato", dir: "desc" };

      async function recarregar() {
        const r = await P.carregar("empresas_servicos", (t) => t.select("*").order("criado_em", { ascending: false }));
        if (r.ok) lista = r.dados;
        desenhar();
      }
      function filtrada() {
        const q = P.semAcento(estado.busca);
        let itens = lista.filter((e) => estado.filtro === "todas" || e.situacao === estado.filtro);
        if (q) itens = itens.filter((e) => P.semAcento([e.nome_empresa, e.contato, e.email, e.cnpj].join(" ")).includes(q));
        const valor = {
          nome_empresa: (e) => e.nome_empresa, cnpj: (e) => e.cnpj || null, contato: (e) => e.contato || null, email: (e) => e.email || null,
          telefone: (e) => e.telefone || null, situacao: (e) => SITUACOES.findIndex((s) => s[0] === e.situacao),
          interesse: (e) => e.interesse || null, ultimo_contato: (e) => e.ultimo_contato || null
        }[estado.chave];
        return P.ordenar(itens, valor, estado.dir);
      }
      function baixar() {
        const dados = lista.slice().sort((a, b) => P.comparar(a.nome_empresa, b.nome_empresa));
        P.baixarCSV("empresas-servicos.csv", ["Empresa", "CNPJ", "Contato", "E-mail", "Telefone", "Situação", "Interesse", "Observação", "Último contato"],
          dados.map((e) => [e.nome_empresa, e.cnpj, e.contato, e.email, e.telefone, nomeSituacao(e.situacao), e.interesse, e.obs, P.fmtData(e.ultimo_contato)]));
      }

      const tabelaBox = h("div");
      function desenharTabela() {
        P.limpar(tabelaBox);
        const cab = (r, c, cls) => P.cabecalho(r, c, estado, desenharTabela, cls);
        const thead = h("thead", null, h("tr", null,
          cab("Empresa", "nome_empresa"), cab("CNPJ", "cnpj"), cab("Contato", "contato"), cab("E-mail", "email"), cab("Telefone", "telefone"),
          cab("Situação", "situacao"), cab("Interesse", "interesse"), cab("Último contato", "ultimo_contato")));
        const tbody = h("tbody");
        if (!lista.length) {
          tabelaBox.append(h("p", { class: "aviso-pagina", text: "Sua base de empresas ainda está vazia. A linha abaixo é só um exemplo do formato e some quando você adicionar a primeira." }));
          tbody.append(h("tr", { class: "exemplo" },
            h("td", null, "Nome da empresa", P.etiquetaExemplo()), h("td", { text: "00.000.000/0000-00" }), h("td", { text: "Fulano de Tal" }),
            h("td", { text: "contato@exemplo.com" }), h("td", { text: "(00) 00000-0000" }), h("td", null, pilula("lead")),
            h("td", { text: "Ar-condicionado" }), h("td", { text: P.fmtData(P.hoje()) })));
        } else {
          const itens = filtrada();
          if (!itens.length) tbody.append(h("tr", null, h("td", { colspan: "8", class: "fraco", text: "Nenhuma empresa encontrada com esse filtro ou busca." })));
          itens.forEach((e) => {
            const zap = P.linkWhats(e.telefone);
            const tr = h("tr", { class: "clicavel", tabindex: "0", "aria-label": "Editar " + e.nome_empresa,
              onclick: () => abrirFormulario(e, recarregar),
              onkeydown: (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target === tr) { ev.preventDefault(); abrirFormulario(e, recarregar); } } },
              h("td", { class: "nw" }, h("b", { text: e.nome_empresa, style: "font-weight:500" })),
              h("td", { class: "nw", text: e.cnpj || "" }),
              h("td", { class: "truncar", text: e.contato || "" }),
              h("td", { class: "truncar" }, e.email ? h("a", { href: "mailto:" + e.email, text: e.email, onclick: (ev) => ev.stopPropagation() }) : ""),
              h("td", { class: "nw" }, e.telefone || "", zap ? h("a", { class: "btn-i lig", href: zap, target: "_blank", rel: "noopener noreferrer", title: "Abrir conversa no WhatsApp", "aria-label": "Abrir WhatsApp de " + e.nome_empresa, onclick: (ev) => ev.stopPropagation() }, P.ic("whats")) : ""),
              h("td", null, pilula(e.situacao)),
              h("td", { class: "truncar", title: e.interesse || "", text: e.interesse || "" }),
              h("td", { class: "nw", text: P.fmtData(e.ultimo_contato) }));
            tbody.append(tr);
          });
        }
        tabelaBox.append(h("div", { class: "rolagem" }, h("table", { class: "tabela" }, thead, tbody)));
      }

      function desenhar() {
        const contagem = (s) => lista.filter((e) => e.situacao === s).length;
        const filtros = h("div", { class: "filtros", role: "group", "aria-label": "Filtrar por situação" },
          [["todas", "Todas (" + lista.length + ")"]].concat(SITUACOES.map(([v, t]) => [v, t + " (" + contagem(v) + ")"])).map(([v, t]) =>
            h("button", { type: "button", "aria-pressed": String(estado.filtro === v), text: t,
              onclick: () => { estado.filtro = v; desenhar(); } })));
        const busca = h("input", { type: "search", placeholder: "Buscar por nome, contato, e-mail ou CNPJ", value: estado.busca, "aria-label": "Buscar empresa" });
        busca.addEventListener("input", P.debounce(() => { estado.busca = busca.value; desenharTabela(); }, 150));
        P.limpar(raiz).append(
          h("p", { class: "dica", style: "margin-bottom:12px", text: "Empresas para os produtos e serviços da SmartBrand Tecnologia (loja física): ar-condicionado, filtros, manutenção e troca de aparelhos." }),
          h("div", { class: "ferramentas" },
            h("div", { class: "busca" }, P.ic("busca"), busca),
            filtros,
            h("span", { class: "espaco" }),
            h("button", { type: "button", class: "btn", onclick: baixar, disabled: !lista.length }, P.ic("baixar"), "Baixar CSV"),
            h("button", { type: "button", class: "btn p", onclick: () => abrirFormulario(null, recarregar) }, P.ic("mais"), "Adicionar empresa")),
          tabelaBox);
        desenharTabela();
      }
      desenhar();
    }
  };
})();
