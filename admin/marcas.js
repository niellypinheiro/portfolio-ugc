/* =========================================================================
   Aba MARCAS: a sua base de contatos de empresa, em formato de planilha
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;

  const SITUACOES = [["lead", "Lead"], ["conversando", "Conversando"], ["cliente", "Cliente"], ["parada", "Parada"]];
  const nomeSituacao = (s) => (SITUACOES.find((x) => x[0] === s) || [s, s])[1];
  const pilula = (s) => h("span", { class: "pilula p-" + s, text: nomeSituacao(s) });

  function emailOk(v) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  function abrirFormulario(marca, aoSalvar) {
    const novo = !marca;
    const m = marca || { nome: "", instagram: "", email: "", telefone: "", situacao: "lead", obs: "", ultimo_contato: "" };
    const nome = h("input", { type: "text", value: m.nome, maxlength: "200", autocomplete: "off" });
    const instagram = h("input", { type: "text", value: m.instagram || "", maxlength: "100", placeholder: "@nomedamarca", autocomplete: "off" });
    const email = h("input", { type: "email", value: m.email || "", maxlength: "200", placeholder: "contato@marca.com.br", autocomplete: "off" });
    const telefone = h("input", { type: "tel", value: m.telefone || "", maxlength: "40", placeholder: "(00) 00000-0000", autocomplete: "off" });
    const situacao = h("select", null, P.opcoes(SITUACOES, m.situacao));
    const contato = h("input", { type: "date", value: m.ultimo_contato ? String(m.ultimo_contato).slice(0, 10) : "" });
    const obs = h("textarea", { maxlength: "3000", placeholder: "Anotações sobre essa marca" });
    obs.value = m.obs || "";

    const corpo = h("div", null,
      P.campo("Nome da marca", nome),
      h("div", { class: "grade2" }, P.campo("Instagram", instagram), P.campo("Telefone", telefone)),
      P.campo("E-mail", email),
      h("div", { class: "grade2" }, P.campo("Situação", situacao), P.campo("Último contato", contato)),
      P.campo("Observação", obs));

    const botoes = [
      { texto: "Cancelar" },
      { texto: "Salvar", classe: "p", aoClicar: async () => {
        P.erroNoCampo(nome, ""); P.erroNoCampo(email, "");
        let ok = true;
        if (!nome.value.trim()) { P.erroNoCampo(nome, "Escreva o nome da marca."); ok = false; }
        if (!emailOk(email.value.trim())) { P.erroNoCampo(email, "Esse e-mail não parece certo."); ok = false; }
        if (!ok) return false;
        const dados = { nome: nome.value.trim(), instagram: P.arroba(instagram.value) || null, email: email.value.trim() || null,
          telefone: telefone.value.trim() || null, situacao: situacao.value, obs: obs.value.trim() || null, ultimo_contato: contato.value || null };
        const r = await P.gravar(() => novo ? window.sb.from("marcas").insert(dados) : window.sb.from("marcas").update(dados).eq("id", marca.id));
        if (!r.ok) return false;
        P.toast(novo ? "Marca adicionada" : "Marca salva");
        aoSalvar();
      } }
    ];
    if (!novo) {
      botoes.unshift({ texto: "Apagar", classe: "perigo", esquerda: true, aoClicar: async () => {
        if (!(await P.confirmar('Apagar "' + marca.nome + '" da sua base? Isso não dá para desfazer.', { botao: "Apagar", perigo: true, titulo: "Apagar marca" }))) return false;
        const r = await P.gravar(() => window.sb.from("marcas").delete().eq("id", marca.id));
        if (!r.ok) return false;
        P.toast("Marca apagada");
        aoSalvar();
      } });
    }
    P.modal({ titulo: novo ? "Adicionar marca" : "Editar marca", corpo, botoes });
  }

  /* ---------- importar planilha (CSV) de leads ---------- */
  const ALIASES = {
    nome: ["nome", "marca", "empresa", "nome da marca", "cliente", "nome do cliente", "razao social"],
    instagram: ["instagram", "insta", "@", "rede social", "usuario", "perfil"],
    email: ["email", "e-mail", "e mail", "mail"],
    telefone: ["telefone", "fone", "celular", "whatsapp", "contato", "numero", "numero de contato"],
    situacao: ["situacao", "status", "etapa", "fase"],
    obs: ["obs", "observacao", "observacoes", "anotacao", "anotacoes", "nota", "notas", "comentario", "comentarios"],
    ultimo_contato: ["ultimo contato", "data", "data do contato", "ultimo contato em", "contato em", "data de contato"]
  };
  function acharColuna(cabecalhos, chave) {
    const normalizados = cabecalhos.map((c) => P.semAcento(c).trim());
    for (const alias of ALIASES[chave]) { const i = normalizados.indexOf(alias); if (i !== -1) return i; }
    for (const alias of ALIASES[chave]) { const i = normalizados.findIndex((c) => c.includes(alias)); if (i !== -1) return i; }
    return -1;
  }
  function converterData(s) {
    s = String(s || "").trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0].slice(0, 10);
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    return null;
  }
  function situacaoDoTexto(s) {
    const n = P.semAcento(s || "").trim();
    if (!n) return "lead";
    const achada = SITUACOES.find(([cod, rot]) => cod === n || P.semAcento(rot) === n);
    return achada ? achada[0] : "lead";
  }

  function abrirImportacao(lista, recarregar) {
    const input = h("input", { type: "file", accept: ".csv,text/csv", hidden: true });
    input.addEventListener("change", async () => {
      const arquivo = input.files[0];
      input.remove();
      if (!arquivo) return;
      let linhas;
      try {
        const texto = await P.lerArquivoTexto(arquivo);
        linhas = P.lerCSV(texto).filter((l) => l.some((v) => v !== ""));
      } catch (e) { P.toast("Não consegui ler esse arquivo. Confira se é uma planilha em CSV.", true); return; }
      if (linhas.length < 2) { P.toast("Não encontrei linhas com marcas nesse arquivo.", true); return; }

      const cabecalhos = linhas[0];
      const idx = { nome: acharColuna(cabecalhos, "nome"), instagram: acharColuna(cabecalhos, "instagram"),
        email: acharColuna(cabecalhos, "email"), telefone: acharColuna(cabecalhos, "telefone"),
        situacao: acharColuna(cabecalhos, "situacao"), obs: acharColuna(cabecalhos, "obs"),
        ultimo_contato: acharColuna(cabecalhos, "ultimo_contato") };
      if (idx.nome === -1) idx.nome = 0;   /* sem coluna de nome identificada: usa a primeira coluna */

      const linhasDados = linhas.slice(1);
      const registros = [];
      linhasDados.forEach((linha) => {
        const nome = (linha[idx.nome] || "").trim();
        if (!nome) return;
        registros.push({
          nome,
          instagram: idx.instagram !== -1 ? (P.arroba(linha[idx.instagram]) || null) : null,
          email: idx.email !== -1 ? ((linha[idx.email] || "").trim() || null) : null,
          telefone: idx.telefone !== -1 ? ((linha[idx.telefone] || "").trim() || null) : null,
          situacao: idx.situacao !== -1 ? situacaoDoTexto(linha[idx.situacao]) : "lead",
          obs: idx.obs !== -1 ? ((linha[idx.obs] || "").trim() || null) : null,
          ultimo_contato: idx.ultimo_contato !== -1 ? converterData(linha[idx.ultimo_contato]) : null
        });
      });

      const chave = (m) => P.semAcento(m.nome).trim();
      const existentes = new Set(lista.map(chave));
      const vistos = new Set();
      const prontos = [], repetidos = [];
      registros.forEach((r) => {
        const k = chave(r);
        if (!k || existentes.has(k) || vistos.has(k)) repetidos.push(r); else { vistos.add(k); prontos.push(r); }
      });

      const corpo = h("div", null,
        h("p", null, "Encontrei ", h("b", { text: String(registros.length) }), " marca" + (registros.length === 1 ? "" : "s") + " nesse arquivo."),
        repetidos.length ? h("p", { class: "dica", text: repetidos.length + " já estão na sua base (mesmo nome) e não serão duplicadas." }) : null,
        prontos.length ? h("div", { class: "rolagem" }, h("table", { class: "tabela" },
          h("thead", null, h("tr", null, h("th", { text: "Marca" }), h("th", { text: "Instagram" }), h("th", { text: "E-mail" }), h("th", { text: "Telefone" }), h("th", { text: "Situação" }))),
          h("tbody", null, prontos.slice(0, 25).map((r) => h("tr", null,
            h("td", { text: r.nome }), h("td", { text: r.instagram || "" }), h("td", { text: r.email || "" }), h("td", { text: r.telefone || "" }), h("td", null, pilula(r.situacao))))))) : null,
        prontos.length > 25 ? h("p", { class: "dica", text: "Mostrando as 25 primeiras. As outras " + (prontos.length - 25) + " também entram na importação." }) : null,
        !prontos.length ? h("p", { class: "aviso-pagina", text: "Nenhuma marca nova para importar: todas já estão na sua base ou o arquivo não tem nome de marca." }) : null);

      P.modal({
        titulo: "Importar planilha de marcas", larga: true, corpo,
        botoes: prontos.length ? [
          { texto: "Cancelar" },
          { texto: "Importar " + prontos.length + (prontos.length === 1 ? " marca" : " marcas"), classe: "p", aoClicar: async () => {
            const LOTE = 80;
            let importados = 0, falhou = false;
            for (let i = 0; i < prontos.length && !falhou; i += LOTE) {
              const pedaco = prontos.slice(i, i + LOTE);
              const r = await P.gravar(() => window.sb.from("marcas").insert(pedaco));
              if (r.ok) importados += pedaco.length; else falhou = true;
            }
            if (importados) P.toast(importados + " marca" + (importados === 1 ? "" : "s") + " importada" + (importados === 1 ? "" : "s") + "!");
            recarregar();
          } }
        ] : [{ texto: "Fechar" }]
      });
    });
    document.body.append(input);
    input.click();
  }

  P.abas.marcas = {
    async renderizar(raiz) {
      let lista = (await P.carregar("marcas", (t) => t.select("*").order("criado_em", { ascending: false }))).dados;
      const estado = { busca: "", filtro: "todas", chave: "ultimo_contato", dir: "desc" };

      async function recarregar() {
        const r = await P.carregar("marcas", (t) => t.select("*").order("criado_em", { ascending: false }));
        if (r.ok) lista = r.dados;
        desenhar();
      }
      function filtrada() {
        const q = P.semAcento(estado.busca).replace(/^@/, "");
        let itens = lista.filter((m) => estado.filtro === "todas" || m.situacao === estado.filtro);
        if (q) itens = itens.filter((m) => P.semAcento([m.nome, m.instagram, m.email].join(" ")).includes(q));
        const valor = {
          nome: (m) => m.nome, instagram: (m) => m.instagram || null, email: (m) => m.email || null, telefone: (m) => m.telefone || null,
          situacao: (m) => SITUACOES.findIndex((s) => s[0] === m.situacao), obs: (m) => m.obs || null, ultimo_contato: (m) => m.ultimo_contato || null
        }[estado.chave];
        return P.ordenar(itens, valor, estado.dir);
      }
      function baixar() {
        const dados = lista.slice().sort((a, b) => P.comparar(a.nome, b.nome));
        P.baixarCSV("minhas-marcas.csv", ["Marca", "Instagram", "E-mail", "Telefone", "Situação", "Observação", "Último contato"],
          dados.map((m) => [m.nome, m.instagram, m.email, m.telefone, nomeSituacao(m.situacao), m.obs, P.fmtData(m.ultimo_contato)]));
      }

      const tabelaBox = h("div");
      function desenharTabela() {
        P.limpar(tabelaBox);
        const cab = (r, c, cls) => P.cabecalho(r, c, estado, desenharTabela, cls);
        const thead = h("thead", null, h("tr", null,
          cab("Marca", "nome"), cab("Instagram", "instagram"), cab("E-mail", "email"), cab("Telefone", "telefone"),
          cab("Situação", "situacao"), cab("Observação", "obs"), cab("Último contato", "ultimo_contato")));
        const tbody = h("tbody");
        if (!lista.length) {
          tabelaBox.append(h("p", { class: "aviso-pagina", text: "Sua base ainda está vazia. A linha abaixo é só um exemplo do formato e some quando você adicionar a primeira marca. Os contatos que chegam pelo formulário do site entram aqui sozinhos, como Lead." }));
          tbody.append(h("tr", { class: "exemplo" },
            h("td", null, "Nome da marca", P.etiquetaExemplo()), h("td", { text: "@nomedamarca" }), h("td", { text: "contato@exemplo.com" }),
            h("td", { text: "(00) 00000-0000" }), h("td", null, pilula("lead")), h("td", { text: "Chegou pelo formulário do site" }), h("td", { text: P.fmtData(P.hoje()) })));
        } else {
          const itens = filtrada();
          if (!itens.length) tbody.append(h("tr", null, h("td", { colspan: "7", class: "fraco", text: "Nenhuma marca encontrada com esse filtro ou busca." })));
          itens.forEach((m) => {
            const zap = P.linkWhats(m.telefone), insta = P.linkInsta(m.instagram);
            const tr = h("tr", { class: "clicavel", tabindex: "0", "aria-label": "Editar " + m.nome,
              onclick: () => abrirFormulario(m, recarregar),
              onkeydown: (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === tr) { e.preventDefault(); abrirFormulario(m, recarregar); } } },
              h("td", { class: "nw" }, h("b", { text: m.nome, style: "font-weight:500" })),
              h("td", { class: "nw" }, insta ? h("a", { href: insta, target: "_blank", rel: "noopener noreferrer", text: P.arroba(m.instagram), onclick: (e) => e.stopPropagation() }) : ""),
              h("td", { class: "truncar" }, m.email ? h("a", { href: "mailto:" + m.email, text: m.email, onclick: (e) => e.stopPropagation() }) : ""),
              h("td", { class: "nw" }, m.telefone || "", zap ? h("a", { class: "btn-i lig", href: zap, target: "_blank", rel: "noopener noreferrer", title: "Abrir conversa no WhatsApp", "aria-label": "Abrir WhatsApp de " + m.nome, onclick: (e) => e.stopPropagation() }, P.ic("whats")) : ""),
              h("td", null, pilula(m.situacao)),
              h("td", { class: "truncar", title: m.obs || "", text: m.obs || "" }),
              h("td", { class: "nw", text: P.fmtData(m.ultimo_contato) }));
            tbody.append(tr);
          });
        }
        tabelaBox.append(h("div", { class: "rolagem" }, h("table", { class: "tabela" }, thead, tbody)));
      }

      function desenhar() {
        const contagem = (s) => lista.filter((m) => m.situacao === s).length;
        const filtros = h("div", { class: "filtros", role: "group", "aria-label": "Filtrar por situação" },
          [["todas", "Todas (" + lista.length + ")"]].concat(SITUACOES.map(([v, t]) => [v, t + " (" + contagem(v) + ")"])).map(([v, t]) =>
            h("button", { type: "button", "aria-pressed": String(estado.filtro === v), text: t,
              onclick: () => { estado.filtro = v; desenhar(); } })));
        const busca = h("input", { type: "search", placeholder: "Buscar por nome, @ ou e-mail", value: estado.busca, "aria-label": "Buscar marca" });
        busca.addEventListener("input", P.debounce(() => { estado.busca = busca.value; desenharTabela(); }, 150));
        P.limpar(raiz).append(
          h("div", { class: "ferramentas" },
            h("div", { class: "busca" }, P.ic("busca"), busca),
            filtros,
            h("span", { class: "espaco" }),
            h("button", { type: "button", class: "btn", onclick: () => abrirImportacao(lista, recarregar) }, P.ic("subir"), "Importar planilha"),
            h("button", { type: "button", class: "btn", onclick: baixar, disabled: !lista.length }, P.ic("baixar"), "Baixar CSV"),
            h("button", { type: "button", class: "btn p", onclick: () => abrirFormulario(null, recarregar) }, P.ic("mais"), "Adicionar marca")),
          tabelaBox);
        desenharTabela();
      }
      desenhar();
    }
  };
})();
