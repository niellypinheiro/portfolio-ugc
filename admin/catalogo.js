/* =========================================================================
   Abas CATÁLOGO e PRÉ-PEDIDOS (SmartBrand Tecnologia)
   - Catálogo: os produtos e serviços que aparecem, sem preço, no catálogo
     público (smartbrandtecnologia.com.br).
   - Pré-pedidos: os pedidos de orçamento que os clientes enviam pelo catálogo.
   As fotos ficam no bucket "catalogo" do Supabase Storage. Só os dois e-mails
   da SmartBrand mexem nisso (o banco.sql cuida da trava).
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h;
  const BUCKET = "catalogo";

  const dataHora = (iso) => { try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
  const unicos = (lista) => Array.from(new Set(lista.map((x) => String(x || "").trim()).filter(Boolean))).sort((a, b) => P.comparar(a, b));

  /* ---------- foto: reduz antes de subir (fica leve e rápida no catálogo) ---------- */
  function reduzirImagem(arquivo, max) {
    return new Promise((ok, erro) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * escala)); c.height = Math.max(1, Math.round(img.height * escala));
        const x = c.getContext("2d");
        x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? ok(b) : erro(new Error("sem imagem"))), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("não abriu a imagem")); };
      img.src = url;
    });
  }
  async function subirFoto(arquivo) {
    const blob = await reduzirImagem(arquivo, 1100);
    const caminho = "produtos/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
    const r = await window.sb.storage.from(BUCKET).upload(caminho, blob, { contentType: "image/jpeg", upsert: false });
    if (r.error) throw r.error;
    return window.sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  }
  function caminhoDaFoto(url) {
    const m = String(url || "").match(/\/object\/public\/catalogo\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : "";
  }
  async function apagarFoto(url) {
    const c = caminhoDaFoto(url);
    if (c) { try { await window.sb.storage.from(BUCKET).remove([c]); } catch (e) { /* se não apagar, a foto só fica sobrando no armazenamento */ } }
  }

  /* ---------- formulário de produto ---------- */
  function abrirProduto(produto, todos, aoSalvar) {
    const novo = !produto;
    const p = produto || { nome: "", marca: "", categoria: "", descricao: "", imagem: "", ordem: 0, visivel: true };
    const nome = h("input", { type: "text", value: p.nome, maxlength: "200", autocomplete: "off", placeholder: "Ex.: Filtro de água" });
    const marca = h("input", { type: "text", value: p.marca || "", maxlength: "100", list: "lista-marcas-cat", autocomplete: "off", placeholder: "Ex.: Eugin" });
    const categoria = h("input", { type: "text", value: p.categoria || "", maxlength: "100", list: "lista-cats-cat", autocomplete: "off", placeholder: "Ex.: Filtros" });
    const descricao = h("textarea", { maxlength: "3000", placeholder: "Para que serve, características, o que acompanha..." });
    descricao.value = p.descricao || "";
    const ordem = h("input", { type: "number", value: String(p.ordem || 0), step: "1" });
    const visivel = h("input", { type: "checkbox", checked: p.visivel !== false });
    let imagem = p.imagem || "";
    let arquivoNovo = null, removeu = false;
    const previa = h("div", { class: "cat-previa" });
    const arquivo = h("input", { type: "file", accept: "image/*" });
    function desenharPrevia() {
      P.limpar(previa);
      const src = arquivoNovo ? URL.createObjectURL(arquivoNovo) : (removeu ? "" : imagem);
      previa.append(src ? h("img", { src, alt: "Foto do produto" }) : h("span", { class: "fraco", text: "Sem foto" }));
    }
    arquivo.addEventListener("change", () => { arquivoNovo = arquivo.files[0] || null; removeu = false; desenharPrevia(); });
    const tirar = h("button", { type: "button", class: "btn", onclick: () => { arquivoNovo = null; arquivo.value = ""; removeu = true; desenharPrevia(); } }, "Tirar a foto");
    desenharPrevia();

    const corpo = h("div", null,
      h("datalist", { id: "lista-marcas-cat" }, unicos(todos.map((x) => x.marca)).map((m) => h("option", { value: m }))),
      h("datalist", { id: "lista-cats-cat" }, unicos(todos.map((x) => x.categoria)).map((m) => h("option", { value: m }))),
      P.campo("Nome do produto ou serviço", nome),
      h("div", { class: "grade2" }, P.campo("Marca parceira", marca, "Ex.: Eugin, Unbox"), P.campo("Categoria", categoria, "Ex.: Filtros, Ar-condicionado, Serviços")),
      P.campo("Descrição", descricao),
      P.campo("Foto", h("div", null, previa, arquivo, h("div", { style: "margin-top:8px" }, tirar)), "A foto é reduzida sozinha antes de subir. Use uma imagem nítida do produto, com fundo limpo."),
      h("div", { class: "grade2" }, P.campo("Ordem", ordem, "Número menor aparece primeiro."),
        P.campo("Aparece no catálogo?", h("label", { class: "marcar" }, visivel, "Sim, mostrar este item"))));

    const botoes = [{ texto: "Cancelar" }, { texto: "Salvar", classe: "p", aoClicar: async () => {
      P.erroNoCampo(nome, "");
      if (!nome.value.trim()) { P.erroNoCampo(nome, "Escreva o nome."); return false; }
      let url = removeu ? "" : imagem;
      if (arquivoNovo) {
        try { url = await subirFoto(arquivoNovo); }
        catch (e) { P.toast("Não consegui subir a foto. Confira a internet e se o passo do banco.sql foi feito.", true); return false; }
      }
      const dados = { nome: nome.value.trim(), marca: marca.value.trim() || null, categoria: categoria.value.trim() || null,
        descricao: descricao.value.trim() || null, imagem: url || null, ordem: parseInt(ordem.value, 10) || 0, visivel: visivel.checked };
      const r = await P.gravar(() => novo ? window.sb.from("catalogo_produtos").insert(dados) : window.sb.from("catalogo_produtos").update(dados).eq("id", produto.id));
      if (!r.ok) return false;
      if (!novo && imagem && imagem !== url) await apagarFoto(imagem);
      P.toast(novo ? "Produto adicionado" : "Produto salvo");
      aoSalvar();
    } }];
    if (!novo) botoes.unshift({ texto: "Apagar", classe: "perigo", esquerda: true, aoClicar: async () => {
      if (!(await P.confirmar('Apagar "' + produto.nome + '" do catálogo? Isso não dá para desfazer.', { botao: "Apagar", perigo: true, titulo: "Apagar produto" }))) return false;
      const r = await P.gravar(() => window.sb.from("catalogo_produtos").delete().eq("id", produto.id));
      if (!r.ok) return false;
      await apagarFoto(produto.imagem);
      P.toast("Produto apagado");
      aoSalvar();
    } });
    P.modal({ titulo: novo ? "Adicionar ao catálogo" : "Editar item do catálogo", corpo, botoes, larga: true });
  }

  /* ---------- aba CATÁLOGO ---------- */
  P.abas.catalogo = {
    async renderizar(raiz) {
      let lista = (await P.carregar("catalogo_produtos", (t) => t.select("*").order("ordem").order("nome"))).dados;
      const estado = { busca: "", categoria: "todas", chave: "ordem", dir: "asc" };
      async function recarregar() {
        const r = await P.carregar("catalogo_produtos", (t) => t.select("*").order("ordem").order("nome"));
        if (r.ok) lista = r.dados;
        desenhar();
      }
      function filtrada() {
        const q = P.semAcento(estado.busca);
        let itens = lista.filter((x) => estado.categoria === "todas" || (x.categoria || "") === estado.categoria);
        if (q) itens = itens.filter((x) => P.semAcento([x.nome, x.marca, x.categoria, x.descricao].join(" ")).includes(q));
        const valor = {
          nome: (x) => x.nome, marca: (x) => x.marca || null, categoria: (x) => x.categoria || null,
          visivel: (x) => (x.visivel ? 0 : 1), ordem: (x) => x.ordem || 0
        }[estado.chave];
        return P.ordenar(itens, valor, estado.dir);
      }
      const tabelaBox = h("div");
      function desenharTabela() {
        P.limpar(tabelaBox);
        const cab = (r, c, cls) => P.cabecalho(r, c, estado, desenharTabela, cls);
        const thead = h("thead", null, h("tr", null, h("th", { text: "Foto" }), cab("Produto", "nome"), cab("Parceira", "marca"), cab("Categoria", "categoria"), cab("No catálogo", "visivel"), cab("Ordem", "ordem")));
        const tbody = h("tbody");
        if (!lista.length) {
          tabelaBox.append(h("p", { class: "aviso-pagina", text: "O catálogo ainda está vazio. Clique em \"Adicionar item\" para cadastrar o primeiro produto ou serviço. A linha abaixo é só um exemplo e some quando você adicionar." }));
          tbody.append(h("tr", { class: "exemplo" }, h("td", { text: "" }), h("td", null, "Filtro de água", P.etiquetaExemplo()), h("td", { text: "Eugin" }), h("td", { text: "Filtros" }), h("td", { text: "Sim" }), h("td", { text: "0" })));
        } else {
          const itens = filtrada();
          if (!itens.length) tbody.append(h("tr", null, h("td", { colspan: "6", class: "fraco", text: "Nada encontrado com essa busca ou filtro." })));
          itens.forEach((x) => {
            const tr = h("tr", { class: "clicavel", tabindex: "0", "aria-label": "Editar " + x.nome,
              onclick: () => abrirProduto(x, lista, recarregar),
              onkeydown: (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target === tr) { ev.preventDefault(); abrirProduto(x, lista, recarregar); } } },
              h("td", { class: "nw" }, x.imagem ? h("img", { src: x.imagem, alt: "", class: "cat-mini" }) : ""),
              h("td", null, h("b", { text: x.nome, style: "font-weight:500" })),
              h("td", { class: "nw", text: x.marca || "" }),
              h("td", { class: "nw", text: x.categoria || "" }),
              h("td", null, h("button", { type: "button", class: "btn", title: "Clique para mostrar ou esconder no catálogo", onclick: async (ev) => {
                ev.stopPropagation();
                const r = await P.gravar(() => window.sb.from("catalogo_produtos").update({ visivel: !x.visivel }).eq("id", x.id));
                if (r.ok) { x.visivel = !x.visivel; desenharTabela(); }
              } }, x.visivel ? "Visível" : "Oculto")),
              h("td", { class: "nw", text: String(x.ordem || 0) }));
            tbody.append(tr);
          });
        }
        tabelaBox.append(h("div", { class: "rolagem" }, h("table", { class: "tabela" }, thead, tbody)));
      }
      function desenhar() {
        const cats = unicos(lista.map((x) => x.categoria));
        const filtros = h("div", { class: "filtros", role: "group", "aria-label": "Filtrar por categoria" },
          [["todas", "Todas (" + lista.length + ")"]].concat(cats.map((c) => [c, c + " (" + lista.filter((x) => (x.categoria || "") === c).length + ")"])).map(([v, t]) =>
            h("button", { type: "button", "aria-pressed": String(estado.categoria === v), text: t, onclick: () => { estado.categoria = v; desenhar(); } })));
        const busca = h("input", { type: "search", placeholder: "Buscar produto, marca ou categoria", value: estado.busca, "aria-label": "Buscar no catálogo" });
        busca.addEventListener("input", P.debounce(() => { estado.busca = busca.value; desenharTabela(); }, 150));
        P.limpar(raiz).append(
          h("p", { class: "dica", style: "margin-bottom:12px", text: "Os itens marcados como \"Visível\" aparecem no catálogo público, sem preço. O cliente escolhe o que quer e envia um pré-pedido de orçamento (veja na aba Pré-pedidos)." }),
          h("div", { class: "ferramentas" },
            h("div", { class: "busca" }, P.ic("busca"), busca), filtros, h("span", { class: "espaco" }),
            h("button", { type: "button", class: "btn p", onclick: () => abrirProduto(null, lista, recarregar) }, P.ic("mais"), "Adicionar item")),
          tabelaBox);
        desenharTabela();
      }
      desenhar();
    }
  };

  /* ---------- aba PRÉ-PEDIDOS ---------- */
  const STATUS = [["novo", "Novo"], ["em_orcamento", "Em orçamento"], ["fechado", "Fechado"], ["perdido", "Perdido"]];
  const nomeStatus = (s) => (STATUS.find((x) => x[0] === s) || [s, s])[1];
  const classeStatus = (s) => ({ novo: "p-lead", em_orcamento: "p-conversando", fechado: "p-cliente", perdido: "p-parada" }[s] || "p-lead");
  const itensDoPedido = (ped) => (Array.isArray(ped.itens) ? ped.itens : []);
  const resumoItens = (ped) => itensDoPedido(ped).map((i) => i.quantidade + "x " + i.nome).join(", ");

  function abrirPedido(ped, aoSalvar) {
    const status = h("select", null, P.opcoes(STATUS, ped.status));
    const zap = P.linkWhats(ped.telefone);
    const msg = "Olá, " + String(ped.nome).split(/\s+/)[0] + "! Aqui é da SmartBrand Tecnologia. Recebemos o seu pedido de orçamento:\n" +
      itensDoPedido(ped).map((i) => "- " + i.quantidade + "x " + i.nome).join("\n") + "\n\nVamos combinar os valores?";
    const linhas = itensDoPedido(ped).map((i) => h("tr", null, h("td", { text: i.nome }), h("td", { class: "nw", text: String(i.quantidade) })));
    const corpo = h("div", null,
      h("div", { class: "grade2" },
        h("div", null, h("p", { class: "fraco", text: "Cliente" }), h("p", null, h("b", { text: ped.nome }))),
        h("div", null, h("p", { class: "fraco", text: "Empresa" }), h("p", { text: ped.empresa || "Não informada" }))),
      h("div", { class: "grade2", style: "margin-top:10px" },
        h("div", null, h("p", { class: "fraco", text: "WhatsApp / telefone" }), h("p", { text: ped.telefone || "Não informado" })),
        h("div", null, h("p", { class: "fraco", text: "E-mail" }), h("p", null, ped.email ? h("a", { href: "mailto:" + ped.email, text: ped.email }) : "Não informado"))),
      h("p", { class: "fraco", style: "margin-top:12px", text: "Itens pedidos (enviado em " + dataHora(ped.criado_em) + ")" }),
      h("div", { class: "rolagem" }, h("table", { class: "tabela" }, h("thead", null, h("tr", null, h("th", { text: "Produto" }), h("th", { text: "Qtd." }))), h("tbody", null, linhas))),
      ped.observacao ? h("div", { style: "margin-top:12px" }, h("p", { class: "fraco", text: "Observação do cliente" }), h("p", { text: ped.observacao })) : null,
      P.campo("Situação do pedido", status),
      zap ? h("a", { class: "btn p", href: zap + "?text=" + encodeURIComponent(msg), target: "_blank", rel: "noopener noreferrer" }, P.ic("whats"), "Responder pelo WhatsApp") : null);
    P.modal({ titulo: "Pré-pedido", corpo, larga: true, botoes: [
      { texto: "Apagar", classe: "perigo", esquerda: true, aoClicar: async () => {
        if (!(await P.confirmar("Apagar este pré-pedido de " + ped.nome + "? Isso não dá para desfazer.", { botao: "Apagar", perigo: true, titulo: "Apagar pré-pedido" }))) return false;
        const r = await P.gravar(() => window.sb.from("catalogo_pedidos").delete().eq("id", ped.id));
        if (!r.ok) return false;
        P.toast("Pré-pedido apagado"); aoSalvar();
      } },
      { texto: "Fechar" },
      { texto: "Salvar situação", classe: "p", aoClicar: async () => {
        const r = await P.gravar(() => window.sb.from("catalogo_pedidos").update({ status: status.value }).eq("id", ped.id));
        if (!r.ok) return false;
        P.toast("Situação salva"); aoSalvar();
      } }
    ] });
  }

  P.abas.pre_pedidos = {
    async renderizar(raiz) {
      let lista = (await P.carregar("catalogo_pedidos", (t) => t.select("*").order("criado_em", { ascending: false }))).dados;
      const estado = { filtro: "todos" };
      async function recarregar() {
        const r = await P.carregar("catalogo_pedidos", (t) => t.select("*").order("criado_em", { ascending: false }));
        if (r.ok) lista = r.dados;
        desenhar();
      }
      function desenhar() {
        const contagem = (s) => lista.filter((x) => x.status === s).length;
        const filtros = h("div", { class: "filtros", role: "group", "aria-label": "Filtrar por situação" },
          [["todos", "Todos (" + lista.length + ")"]].concat(STATUS.map(([v, t]) => [v, t + " (" + contagem(v) + ")"])).map(([v, t]) =>
            h("button", { type: "button", "aria-pressed": String(estado.filtro === v), text: t, onclick: () => { estado.filtro = v; desenhar(); } })));
        const itens = lista.filter((x) => estado.filtro === "todos" || x.status === estado.filtro);
        const tbody = h("tbody");
        if (!lista.length) tbody.append(h("tr", null, h("td", { colspan: "6", class: "fraco", text: "Nenhum pré-pedido ainda. Quando um cliente enviar pelo catálogo, ele aparece aqui." })));
        else if (!itens.length) tbody.append(h("tr", null, h("td", { colspan: "6", class: "fraco", text: "Nenhum pré-pedido nesta situação." })));
        itens.forEach((x) => {
          const tr = h("tr", { class: "clicavel", tabindex: "0", "aria-label": "Abrir pré-pedido de " + x.nome,
            onclick: () => abrirPedido(x, recarregar),
            onkeydown: (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target === tr) { ev.preventDefault(); abrirPedido(x, recarregar); } } },
            h("td", { class: "nw", text: dataHora(x.criado_em) }),
            h("td", null, h("b", { text: x.nome, style: "font-weight:500" })),
            h("td", { class: "truncar", text: x.empresa || "" }),
            h("td", { class: "nw", text: x.telefone || "" }),
            h("td", { class: "truncar", title: resumoItens(x), text: resumoItens(x) }),
            h("td", null, h("span", { class: "pilula " + classeStatus(x.status), text: nomeStatus(x.status) })));
          tbody.append(tr);
        });
        P.limpar(raiz).append(
          h("p", { class: "dica", style: "margin-bottom:12px", text: "Pedidos de orçamento enviados pelo catálogo. Clique em um para ver os itens, mudar a situação e chamar o cliente no WhatsApp." }),
          h("div", { class: "ferramentas" }, filtros, h("span", { class: "espaco" })),
          h("div", { class: "rolagem" }, h("table", { class: "tabela" },
            h("thead", null, h("tr", null, ["Quando", "Cliente", "Empresa", "WhatsApp", "Itens", "Situação"].map((t) => h("th", { text: t })))), tbody)));
      }
      desenhar();
    }
  };
})();
