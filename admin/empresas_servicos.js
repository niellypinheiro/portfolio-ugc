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
    const e = empresa || { nome_empresa: "", cnpj: "", contato: "", email: "", telefone: "", endereco: "", situacao: "lead", interesse: "", obs: "", ultimo_contato: "" };
    const nome = h("input", { type: "text", value: e.nome_empresa, maxlength: "200", autocomplete: "off" });
    const cnpj = h("input", { type: "text", value: e.cnpj || "", maxlength: "20", placeholder: "00.000.000/0000-00" });
    const contato = h("input", { type: "text", value: e.contato || "", maxlength: "200", placeholder: "Nome de quem você fala na empresa" });
    const email = h("input", { type: "email", value: e.email || "", maxlength: "200", placeholder: "contato@empresa.com.br", autocomplete: "off" });
    const telefone = h("input", { type: "tel", value: e.telefone || "", maxlength: "40", placeholder: "(00) 00000-0000", autocomplete: "off" });
    const endereco = h("input", { type: "text", value: e.endereco || "", maxlength: "300", placeholder: "Rua, número, bairro, cidade", autocomplete: "off" });
    const situacao = h("select", null, P.opcoes(SITUACOES, e.situacao));
    const interesse = h("input", { type: "text", value: e.interesse || "", maxlength: "200", placeholder: "Ex.: Ar-condicionado, manutenção de celulares" });
    const ultimoContato = h("input", { type: "date", value: e.ultimo_contato ? String(e.ultimo_contato).slice(0, 10) : "" });
    const obs = h("textarea", { maxlength: "3000", placeholder: "Anotações sobre esta empresa" });
    obs.value = e.obs || "";

    const corpo = h("div", null,
      P.campo("Nome da empresa", nome),
      h("div", { class: "grade2" }, P.campo("CNPJ", cnpj), P.campo("Contato (pessoa)", contato)),
      h("div", { class: "grade2" }, P.campo("E-mail", email), P.campo("Telefone", telefone)),
      P.campo("Endereço", endereco, "Para quando precisar ir pessoalmente até a empresa."),
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
          email: email.value.trim() || null, telefone: telefone.value.trim() || null, endereco: endereco.value.trim() || null, situacao: situacao.value,
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

  /* ---------- importar planilha (CSV ou Excel) de empresas, no mesmo jeito da aba Marcas ---------- */
  const ALIASES = {
    ultimo_contato: ["ultimo contato", "data do contato", "data de contato", "ultimo contato em", "contato em", "data"],
    nome_empresa: ["nome da empresa", "empresa", "nome fantasia", "razao social", "nome", "cliente", "nome do cliente"],
    cnpj: ["cnpj", "cpf/cnpj", "cnpj/cpf", "cpf"],
    email: ["email", "e-mail", "e mail", "mail"],
    telefone: ["telefone", "fone", "celular", "whatsapp", "tel", "numero", "numero de contato"],
    endereco: ["endereco", "endereco completo", "logradouro", "rua", "localizacao", "local", "onde fica"],
    situacao: ["situacao", "status", "etapa", "fase"],
    interesse: ["interesse", "produto", "produtos", "servico", "servicos", "segmento", "ramo", "atividade", "categoria"],
    obs: ["obs", "observacao", "observacoes", "anotacao", "anotacoes", "nota", "notas", "comentario", "comentarios"],
    contato: ["contato", "pessoa de contato", "nome do contato", "responsavel", "pessoa", "falar com", "comprador"]
  };
  function acharColuna(cabecalhos, chave, usadas) {
    const normalizados = cabecalhos.map((c) => P.semAcento(String(c)).trim());
    for (const alias of ALIASES[chave]) { const i = normalizados.indexOf(alias); if (i !== -1 && !usadas.has(i)) return i; }
    for (const alias of ALIASES[chave]) { const i = normalizados.findIndex((c, k) => !usadas.has(k) && c.includes(alias)); if (i !== -1) return i; }
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
  function carregarScript(src, pronto) {
    if (pronto()) return Promise.resolve();
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = src; s.onload = () => (pronto() ? ok() : erro(new Error("biblioteca não iniciou")));
      s.onerror = () => erro(new Error("Não consegui carregar a ferramenta de leitura de Excel. Confira a internet."));
      document.head.append(s);
    });
  }

  function abrirImportacao(lista, recarregar) {
    const input = h("input", { type: "file", accept: ".csv,.xlsx,.xls,text/csv", hidden: true });
    input.addEventListener("change", async () => {
      const arquivo = input.files[0];
      input.remove();
      if (!arquivo) return;
      let linhas;
      try {
        if (/\.xlsx?$/i.test(arquivo.name)) {
          await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => !!window.XLSX);
          const livro = window.XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
          linhas = window.XLSX.utils.sheet_to_json(livro.Sheets[livro.SheetNames[0]], { header: 1, defval: "", raw: false });
        } else {
          linhas = P.lerCSV(await P.lerArquivoTexto(arquivo));
        }
        linhas = linhas.map((l) => l.map((v) => String(v == null ? "" : v).trim())).filter((l) => l.some((v) => v !== ""));
      } catch (e) { P.toast(e.message && /carregar/.test(e.message) ? e.message : "Não consegui ler esse arquivo. Confira se é uma planilha Excel ou CSV.", true); return; }
      if (linhas.length < 2) { P.toast("Não encontrei linhas com empresas nesse arquivo.", true); return; }

      const cabecalhos = linhas[0];
      const usadas = new Set(), idx = {};
      ["ultimo_contato", "nome_empresa", "cnpj", "email", "telefone", "endereco", "situacao", "interesse", "obs", "contato"].forEach((k) => {
        idx[k] = acharColuna(cabecalhos, k, usadas);
        if (idx[k] !== -1) usadas.add(idx[k]);
      });
      if (idx.nome_empresa === -1) idx.nome_empresa = 0;   /* sem coluna de nome identificada: usa a primeira coluna */

      /* Mesmos limites do formulário "Adicionar empresa". Se algum texto passar do limite, guardo o texto
         inteiro em Observação (para não perder nada) e encurto só o campo que ia travar a importação. */
      const LIMITES = { nome_empresa: 200, cnpj: 20, contato: 200, email: 200, telefone: 40, endereco: 300, interesse: 200, obs: 3000 };
      function limitar(valor, max) {
        if (!valor) return { curto: null, sobra: null };
        if (valor.length <= max) return { curto: valor, sobra: null };
        return { curto: valor.slice(0, max).trim(), sobra: valor };
      }
      const SEM_VALOR = ["nao encontrado", "n/a", "na", "-", "--", "sem contato", "sem informacao", "desconhecido", "nao informado", "nao tem"];
      function valorOuVazio(v) {
        const t = String(v || "").trim();
        return t && !SEM_VALOR.includes(P.semAcento(t)) ? t : "";
      }
      const pega = (linha, k) => (idx[k] !== -1 ? valorOuVazio(linha[idx[k]]) : "");

      const registros = [];
      let comSobra = 0;
      linhas.slice(1).forEach((linha) => {
        const nomeBruto = pega(linha, "nome_empresa");
        if (!nomeBruto) return;
        const campos = {};
        ["nome_empresa", "cnpj", "contato", "email", "telefone", "endereco", "interesse"].forEach((k) => { campos[k] = limitar(k === "nome_empresa" ? nomeBruto : (pega(linha, k) || null), LIMITES[k]); });
        const rotulos = { nome_empresa: "Nome completo", cnpj: "CNPJ completo", contato: "Contato completo", email: "E-mail completo", telefone: "Telefone completo", endereco: "Endereço completo", interesse: "Interesse completo" };
        const extras = Object.keys(rotulos).filter((k) => campos[k].sobra).map((k) => rotulos[k] + ": " + campos[k].sobra);
        if (extras.length) comSobra++;
        const obs = limitar([pega(linha, "obs")].concat(extras).filter(Boolean).join(" | ") || null, LIMITES.obs);
        registros.push({
          nome_empresa: campos.nome_empresa.curto, cnpj: campos.cnpj.curto, contato: campos.contato.curto,
          email: campos.email.curto, telefone: campos.telefone.curto, endereco: campos.endereco.curto, interesse: campos.interesse.curto,
          situacao: idx.situacao !== -1 ? situacaoDoTexto(linha[idx.situacao]) : "lead",
          obs: obs.curto, ultimo_contato: idx.ultimo_contato !== -1 ? converterData(linha[idx.ultimo_contato]) : null
        });
      });

      /* repetida = mesmo CNPJ (só números) ou mesmo nome que já está na base ou aparece duas vezes na planilha */
      const soNumeros = (v) => String(v || "").replace(/\D/g, "");
      const chaveNome = (e) => P.semAcento(e.nome_empresa).trim();
      const nomesJa = new Set(lista.map(chaveNome));
      const cnpjsJa = new Set(lista.map((e) => soNumeros(e.cnpj)).filter((c) => c.length >= 11));
      const vistosNome = new Set(), vistosCnpj = new Set();
      const prontos = [], repetidos = [];
      registros.forEach((r) => {
        const k = chaveNome(r), c = soNumeros(r.cnpj).length >= 11 ? soNumeros(r.cnpj) : "";
        if (!k || nomesJa.has(k) || vistosNome.has(k) || (c && (cnpjsJa.has(c) || vistosCnpj.has(c)))) repetidos.push(r);
        else { vistosNome.add(k); if (c) vistosCnpj.add(c); prontos.push(r); }
      });

      const tbody = h("tbody");
      tbody.append(...prontos.slice(0, 25).map((r) => h("tr", null,
        h("td", { text: r.nome_empresa }), h("td", { text: r.cnpj || "" }), h("td", { text: r.contato || "" }), h("td", { text: r.email || "" }),
        h("td", { text: r.telefone || "" }), h("td", { text: r.endereco || "" }), h("td", null, pilula(r.situacao)), h("td", { text: r.interesse || "" }))));

      const corpo = h("div", null,
        h("p", null, "Encontrei ", h("b", { text: String(registros.length) }), " empresa" + (registros.length === 1 ? "" : "s") + " nesse arquivo."),
        repetidos.length ? h("p", { class: "dica", text: repetidos.length + " já estão na sua base (mesmo nome ou CNPJ) e não serão duplicadas." }) : null,
        comSobra ? h("p", { class: "dica", text: "Em " + comSobra + " empresa" + (comSobra === 1 ? "" : "s") + ", um campo estava comprido demais; guardei o texto inteiro na Observação e encurtei só o campo." }) : null,
        prontos.length ? h("div", { class: "rolagem" }, h("table", { class: "tabela" },
          h("thead", null, h("tr", null, ["Empresa", "CNPJ", "Contato", "E-mail", "Telefone", "Endereço", "Situação", "Interesse"].map((t) => h("th", { text: t })))),
          tbody)) : null,
        prontos.length > 25 ? h("p", { class: "dica", text: "Mostrando as 25 primeiras. As outras " + (prontos.length - 25) + " também entram na importação." }) : null,
        !prontos.length ? h("p", { class: "aviso-pagina", text: "Nenhuma empresa nova para importar: todas já estão na sua base ou o arquivo não tem nome de empresa." }) : null);

      P.modal({
        titulo: "Importar planilha de empresas", larga: true, corpo,
        botoes: prontos.length ? [
          { texto: "Cancelar" },
          { texto: "Importar " + prontos.length + (prontos.length === 1 ? " empresa" : " empresas"), classe: "p", aoClicar: async () => {
            const LOTE = 80;
            let importados = 0, falhou = false;
            for (let i = 0; i < prontos.length && !falhou; i += LOTE) {
              const pedaco = prontos.slice(i, i + LOTE);
              const r = await P.gravar(() => window.sb.from("empresas_servicos").insert(pedaco));
              if (r.ok) importados += pedaco.length; else falhou = true;
            }
            if (importados) P.toast(importados + " empresa" + (importados === 1 ? "" : "s") + " importada" + (importados === 1 ? "" : "s") + "!");
            recarregar();
          } }
        ] : [{ texto: "Fechar" }]
      });
    });
    document.body.append(input);
    input.click();
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

      /* ---------- seleção de empresas para a Prospecção (fica salva no banco, coluna "selecionada") ---------- */
      const temEmail = (e) => !!(e.email && String(e.email).trim());
      const resumoBox = h("div");
      function desenharResumo() {
        const marcadas = lista.filter((e) => e.selecionada).length;
        const alvo = filtrada().filter(temEmail);
        const faltam = alvo.filter((e) => !e.selecionada).length;
        P.limpar(resumoBox).append(h("div", { class: "resumo-selecao" + (marcadas ? " ativo" : ""), role: "status" },
          h("b", { text: marcadas === 0 ? "Nenhuma empresa selecionada" : marcadas + (marcadas === 1 ? " empresa selecionada" : " empresas selecionadas") }),
          h("span", { class: "fraco", text: marcadas ? "para o próximo disparo" : "Marque as caixinhas para escolher quem recebe seu e-mail" }),
          h("span", { class: "espaco" }),
          h("button", { type: "button", class: "btn", disabled: !faltam, onclick: () => marcarLote(alvo, true),
            text: "Selecionar as " + alvo.length + " da lista atual (com e-mail)" }),
          h("button", { type: "button", class: "btn", disabled: !marcadas, onclick: () => marcarLote(lista.filter((e) => e.selecionada), false), text: "Limpar seleção" }),
          marcadas ? h("button", { type: "button", class: "btn p", onclick: () => P.ir("prospeccao_smartbrand") }, P.ic("prospeccao"), "Ir para Prospecção") : null));
      }
      async function marcarLote(itens, valor) {
        const alvo = itens.filter((e) => !!e.selecionada !== valor);
        if (!alvo.length) return;
        let feito = 0;
        for (let i = 0; i < alvo.length; i += 100) {
          const ids = alvo.slice(i, i + 100).map((e) => e.id);
          const r = await P.gravar(() => window.sb.from("empresas_servicos").update({ selecionada: valor }).in("id", ids));
          if (!r.ok) break;
          feito += ids.length;
          alvo.slice(i, i + 100).forEach((e) => { e.selecionada = valor; });
        }
        if (feito) P.toast(valor ? feito + " empresas selecionadas" : "Seleção limpa");
        desenharTabela();
      }
      async function marcarUma(e, caixa) {
        const valor = caixa.checked;
        const r = await P.gravar(() => window.sb.from("empresas_servicos").update({ selecionada: valor }).eq("id", e.id));
        if (!r.ok) { caixa.checked = !valor; return; }
        e.selecionada = valor;
        desenharResumo();
      }
      function filtrada() {
        const q = P.semAcento(estado.busca);
        let itens = lista.filter((e) => estado.filtro === "todas" || e.situacao === estado.filtro);
        if (q) itens = itens.filter((e) => P.semAcento([e.nome_empresa, e.contato, e.email, e.cnpj, e.endereco].join(" ")).includes(q));
        const valor = {
          nome_empresa: (e) => e.nome_empresa, cnpj: (e) => e.cnpj || null, contato: (e) => e.contato || null, email: (e) => e.email || null,
          telefone: (e) => e.telefone || null, endereco: (e) => e.endereco || null, situacao: (e) => SITUACOES.findIndex((s) => s[0] === e.situacao),
          interesse: (e) => e.interesse || null, ultimo_contato: (e) => e.ultimo_contato || null
        }[estado.chave];
        return P.ordenar(itens, valor, estado.dir);
      }
      function baixar() {
        const dados = lista.slice().sort((a, b) => P.comparar(a.nome_empresa, b.nome_empresa));
        P.baixarCSV("empresas-servicos.csv", ["Empresa", "CNPJ", "Contato", "E-mail", "Telefone", "Endereço", "Situação", "Interesse", "Observação", "Último contato"],
          dados.map((e) => [e.nome_empresa, e.cnpj, e.contato, e.email, e.telefone, e.endereco, nomeSituacao(e.situacao), e.interesse, e.obs, P.fmtData(e.ultimo_contato)]));
      }

      const tabelaBox = h("div");
      function desenharTabela() {
        P.limpar(tabelaBox);
        desenharResumo();
        const cab = (r, c, cls) => P.cabecalho(r, c, estado, desenharTabela, cls);
        const thead = h("thead", null, h("tr", null,
          h("th", { class: "col-marcar", "aria-label": "Selecionar para disparo" }),
          cab("Empresa", "nome_empresa"), cab("CNPJ", "cnpj"), cab("Contato", "contato"), cab("E-mail", "email"), cab("Telefone", "telefone"), cab("Endereço", "endereco"),
          cab("Situação", "situacao"), cab("Interesse", "interesse"), cab("Último contato", "ultimo_contato")));
        const tbody = h("tbody");
        if (!lista.length) {
          tabelaBox.append(h("p", { class: "aviso-pagina", text: "Sua base de empresas ainda está vazia. A linha abaixo é só um exemplo do formato e some quando você adicionar a primeira." }));
          tbody.append(h("tr", { class: "exemplo" },
            h("td", { class: "col-marcar" }, h("input", { type: "checkbox", disabled: true, "aria-label": "Exemplo" })),
            h("td", null, "Nome da empresa", P.etiquetaExemplo()), h("td", { text: "00.000.000/0000-00" }), h("td", { text: "Fulano de Tal" }),
            h("td", { text: "contato@exemplo.com" }), h("td", { text: "(00) 00000-0000" }), h("td", { text: "Rua Exemplo, 100, Centro" }), h("td", null, pilula("lead")),
            h("td", { text: "Ar-condicionado" }), h("td", { text: P.fmtData(P.hoje()) })));
        } else {
          const itens = filtrada();
          if (!itens.length) tbody.append(h("tr", null, h("td", { colspan: "10", class: "fraco", text: "Nenhuma empresa encontrada com esse filtro ou busca." })));
          itens.forEach((e) => {
            const zap = P.linkWhats(e.telefone);
            const caixa = h("input", { type: "checkbox", checked: !!e.selecionada && temEmail(e), disabled: !temEmail(e),
              title: temEmail(e) ? "Selecionar para o disparo de e-mail" : "Esta empresa não tem e-mail",
              "aria-label": (temEmail(e) ? "Selecionar " : "Sem e-mail, não dá para selecionar ") + e.nome_empresa });
            caixa.addEventListener("change", () => marcarUma(e, caixa));
            const tr = h("tr", { class: "clicavel", tabindex: "0", "aria-label": "Editar " + e.nome_empresa,
              onclick: () => abrirFormulario(e, recarregar),
              onkeydown: (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target === tr) { ev.preventDefault(); abrirFormulario(e, recarregar); } } },
              h("td", { class: "col-marcar", onclick: (ev) => ev.stopPropagation(), onkeydown: (ev) => ev.stopPropagation() }, caixa),
              h("td", { class: "nw" }, h("b", { text: e.nome_empresa, style: "font-weight:500" })),
              h("td", { class: "nw", text: e.cnpj || "" }),
              h("td", { class: "truncar", text: e.contato || "" }),
              h("td", { class: "truncar" }, e.email ? h("a", { href: "mailto:" + e.email, text: e.email, onclick: (ev) => ev.stopPropagation() }) : ""),
              h("td", { class: "nw" }, e.telefone || "", zap ? h("a", { class: "btn-i lig", href: zap, target: "_blank", rel: "noopener noreferrer", title: "Abrir conversa no WhatsApp", "aria-label": "Abrir WhatsApp de " + e.nome_empresa, onclick: (ev) => ev.stopPropagation() }, P.ic("whats")) : ""),
              h("td", { class: "truncar", title: e.endereco || "", text: e.endereco || "" }),
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
            h("button", { type: "button", class: "btn", onclick: () => abrirImportacao(lista, recarregar) }, P.ic("subir"), "Importar planilha"),
            h("button", { type: "button", class: "btn", onclick: baixar, disabled: !lista.length }, P.ic("baixar"), "Baixar CSV"),
            h("button", { type: "button", class: "btn p", onclick: () => abrirFormulario(null, recarregar) }, P.ic("mais"), "Adicionar empresa")),
          resumoBox, tabelaBox);
        desenharTabela();
      }
      desenhar();
    }
  };
})();
