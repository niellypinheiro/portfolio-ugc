/* =========================================================================
   Financeiro: contas a pagar, contas a receber, impostos e fluxo de caixa.
   Usa as ferramentas que o financeiro.js deixa em P.fin.
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel, h = P.h, F = (P.fin = P.fin || {});
  F.telas = F.telas || {};
  const soma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);

  const FORMAS = ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Boleto", "Transferência", "Outro"];
  function lerValor(t) {
    let s = String(t || "").replace(/[R$\s]/g, "");
    if (!s) return NaN;
    if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    const v = parseFloat(s);
    return isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  }
  F.lerValor = lerValor;

  /* ---------- formulário de uma conta ---------- */
  function abrirFormulario(ctx, tipo, lanc, padrao) {
    const novo = !lanc, pagar = tipo === "pagar";
    const l = lanc || Object.assign({ descricao: "", pessoa: "", categoria: pagar ? F.CATS_PAGAR[0] : F.CATS_RECEBER[0], valor: "", vencimento: F.hoje(), pagamento: "", forma: "", conta: "", obs: "" }, padrao || {});
    const descricao = h("input", { type: "text", value: l.descricao, maxlength: "200", autocomplete: "off", placeholder: pagar ? "Ex.: Aluguel da loja" : "Ex.: Venda parcelada de um notebook" });
    const pessoa = h("input", { type: "text", value: l.pessoa || "", maxlength: "200", autocomplete: "off", placeholder: pagar ? "Fornecedor ou quem recebe" : "Cliente ou quem paga" });
    const categorias = pagar ? F.CATS_PAGAR : F.CATS_RECEBER;
    const categoria = h("select", null, categorias.concat(l.categoria && !categorias.includes(l.categoria) ? [l.categoria] : []).map((c) => h("option", { value: c, text: c, selected: c === l.categoria })));
    const valor = h("input", { type: "text", inputmode: "decimal", value: l.valor === "" ? "" : String(l.valor).replace(".", ","), placeholder: "0,00" });
    const venc = h("input", { type: "date", value: l.vencimento });
    const pago = h("input", { type: "date", value: l.pagamento || "" });
    const forma = h("select", null, h("option", { value: "", text: "Não informar", selected: !l.forma }), FORMAS.map((f) => h("option", { value: f, text: f, selected: f === l.forma })));
    const conta = h("input", { type: "text", value: l.conta || "", maxlength: "80", placeholder: "Banco ou caixa (opcional)" });
    const repetir = h("input", { type: "number", min: "1", max: "60", value: "1" });
    const obs = h("textarea", { maxlength: "1000", placeholder: "Anotações (opcional)" }); obs.value = l.obs || "";
    const corpo = h("div", null,
      P.campo("Descrição", descricao),
      h("div", { class: "grade2" }, P.campo(pagar ? "Fornecedor" : "Cliente", pessoa), P.campo("Categoria", categoria)),
      h("div", { class: "grade2" }, P.campo("Valor (R$)", valor), P.campo("Vencimento", venc)),
      h("div", { class: "grade2" }, P.campo(pagar ? "Data do pagamento" : "Data do recebimento", pago, "Deixe em branco se ainda não " + (pagar ? "pagou." : "recebeu.")), P.campo("Forma", forma)),
      P.campo("Conta bancária", conta),
      novo ? P.campo("Repetir todo mês por quantos meses?", repetir, "1 = só esta conta. Para um aluguel fixo, coloque 12, por exemplo. Cada mês vira uma conta separada.") : null,
      P.campo("Observação", obs));
    const botoes = [{ texto: "Cancelar" }, { texto: "Salvar", classe: "p", aoClicar: async () => {
      P.erroNoCampo(descricao, ""); P.erroNoCampo(valor, ""); P.erroNoCampo(venc, "");
      let ok = true;
      const v = lerValor(valor.value);
      if (!descricao.value.trim()) { P.erroNoCampo(descricao, "Escreva uma descrição."); ok = false; }
      if (isNaN(v) || v < 0) { P.erroNoCampo(valor, "Escreva o valor, por exemplo 1500,00."); ok = false; }
      if (!venc.value) { P.erroNoCampo(venc, "Escolha a data de vencimento."); ok = false; }
      if (!ok) return false;
      const base = { tipo, descricao: descricao.value.trim(), pessoa: pessoa.value.trim() || null, categoria: categoria.value, valor: v, vencimento: venc.value,
        pagamento: pago.value || null, forma: forma.value || null, conta: conta.value.trim() || null, obs: obs.value.trim() || null };
      let r;
      if (novo) {
        const n = Math.max(1, Math.min(60, parseInt(repetir.value, 10) || 1));
        const linhas = Array.from({ length: n }, (_, i) => Object.assign({}, base, { vencimento: F.somarMesesData(base.vencimento, i), pagamento: i === 0 ? base.pagamento : null,
          descricao: n > 1 ? base.descricao + " (" + (i + 1) + "/" + n + ")" : base.descricao }));
        r = await P.gravar(() => window.sb.from("fin_lancamentos").insert(linhas));
      } else r = await P.gravar(() => window.sb.from("fin_lancamentos").update(base).eq("id", lanc.id));
      if (!r.ok) return false;
      P.toast(novo ? "Conta adicionada" : "Conta salva"); ctx.recarregar();
    } }];
    if (!novo) botoes.unshift({ texto: "Apagar", classe: "perigo", esquerda: true, aoClicar: async () => {
      if (!(await P.confirmar('Apagar "' + lanc.descricao + '"? Isso não dá para desfazer.', { botao: "Apagar", perigo: true, titulo: "Apagar conta" }))) return false;
      const r = await P.gravar(() => window.sb.from("fin_lancamentos").delete().eq("id", lanc.id));
      if (!r.ok) return false;
      P.toast("Conta apagada"); ctx.recarregar();
    } });
    P.modal({ titulo: (novo ? "Nova conta " : "Editar conta ") + (pagar ? "a pagar" : "a receber"), corpo, botoes });
  }
  F.abrirFormularioConta = abrirFormulario;

  function marcarPaga(ctx, tipo, l) {
    const data = h("input", { type: "date", value: F.hoje() });
    P.modal({ titulo: tipo === "pagar" ? "Marcar como paga" : "Marcar como recebida", corpo: h("div", null, h("p", { text: l.descricao + ", " + F.dinheiro(l.valor) }), P.campo(tipo === "pagar" ? "Data do pagamento" : "Data do recebimento", data)),
      botoes: [{ texto: "Cancelar" }, { texto: "Confirmar", classe: "p", aoClicar: async () => {
        if (!data.value) { P.erroNoCampo(data, "Escolha a data."); return false; }
        const r = await P.gravar(() => window.sb.from("fin_lancamentos").update({ pagamento: data.value }).eq("id", l.id));
        if (!r.ok) return false;
        P.toast(tipo === "pagar" ? "Conta paga" : "Recebimento registrado"); ctx.recarregar();
      } }] });
  }

  const ROTULO_SIT = { pago: ["Pago", "ok"], atrasado: ["Atrasado", "ruim"], hoje: ["Vence hoje", "aviso"], pendente: ["Pendente", "info"] };

  function contas(ctx, tipo) {
    const pagar = tipo === "pagar", fx = ctx.faixa;
    ctx.estadoContas = ctx.estadoContas || {};
    const e = ctx.estadoContas[tipo] || (ctx.estadoContas[tipo] = { filtro: "aberto", busca: "" });
    const todas = ctx.lancs.filter((l) => l.tipo === tipo);
    const r = F.resumoContas(todas);
    const noPeriodo = todas.filter((l) => l.vencimento >= fx.ini && l.vencimento <= fx.fim);
    const pagoPer = soma(todas.filter((l) => l.pagamento && l.pagamento >= fx.ini && l.pagamento <= fx.fim), (l) => l.valor);
    const raiz = h("div");
    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile(r.atrasado ? "t-vermelho" : "t-verde", "Atrasado", F.dinheiro(r.atrasado), r.qtdAtrasado + (r.qtdAtrasado === 1 ? " conta" : " contas")),
      F.tile("t-ouro", "Vence hoje", F.dinheiro(r.hoje)),
      F.tile("t-azul", "Próximos 7 dias", F.dinheiro(r.sete), "8 a 30 dias: " + F.dinheiro(r.trinta)),
      F.tile(pagar ? "t-vinho" : "t-rosa", pagar ? "Pago no período" : "Recebido no período", F.dinheiro(pagoPer), "total em aberto: " + F.dinheiro(r.total))));

    const busca = h("input", { type: "search", placeholder: "Buscar por descrição, " + (pagar ? "fornecedor" : "cliente") + " ou categoria", value: e.busca, "aria-label": "Buscar" });
    const tabelaBox = h("div");
    function desenharTabela() {
      P.limpar(tabelaBox);
      const q = P.semAcento(e.busca);
      let l = todas.filter((x) => e.filtro === "todas" || (e.filtro === "aberto" && !x.pagamento) || (e.filtro === "atrasadas" && F.atrasado(x)) ||
        (e.filtro === "pagas" && x.pagamento && x.pagamento >= fx.ini && x.pagamento <= fx.fim) || (e.filtro === "periodo" && noPeriodo.includes(x)));
      if (q) l = l.filter((x) => P.semAcento([x.descricao, x.pessoa, x.categoria].join(" ")).includes(q));
      l = l.slice().sort((a, b) => (e.filtro === "pagas" ? (a.pagamento < b.pagamento ? 1 : -1) : a.vencimento < b.vencimento ? -1 : 1));
      F.anexar(tabelaBox, F.tabela(["Vencimento", "Descrição", pagar ? "Fornecedor" : "Cliente", "Categoria", { t: "Valor", num: true }, "Situação", " "],
        l.slice(0, 400).map((x) => {
          const sit = F.situacaoLanc(x), rot = ROTULO_SIT[sit];
          return h("tr", { class: "clicavel", onclick: () => abrirFormulario(ctx, tipo, x) },
            h("td", { class: "nw", text: P.fmtData(x.vencimento) }), h("td", { text: x.descricao }), h("td", { class: "truncar", text: x.pessoa || "" }), h("td", { class: "truncar", text: x.categoria || "" }),
            h("td", { class: "num", text: F.dinheiro(x.valor) }), h("td", { class: "nw" }, F.pilulaStatus(rot[0] + (x.pagamento ? " em " + P.fmtData(x.pagamento) : ""), rot[1])),
            h("td", { class: "acoes", onclick: (ev) => ev.stopPropagation() }, x.pagamento ? null :
              h("button", { type: "button", class: "btn-i lig", title: pagar ? "Marcar como paga" : "Marcar como recebida", "aria-label": (pagar ? "Marcar como paga: " : "Marcar como recebida: ") + x.descricao, onclick: () => marcarPaga(ctx, tipo, x) }, P.ic("checklist"))));
        }), todas.length ? "Nenhuma conta com esse filtro." : "Você ainda não lançou nenhuma conta " + (pagar ? "a pagar" : "a receber") + ". Clique em Nova conta."),
        l.length > 400 ? h("p", { class: "fraco", text: "Mostrando 400 de " + l.length + ". Use a busca." }) : null);
    }
    busca.addEventListener("input", P.debounce(() => { e.busca = busca.value; desenharTabela(); }, 150));
    const chip = (v, t) => h("button", { type: "button", "aria-pressed": String(e.filtro === v), text: t, onclick: () => { e.filtro = v; ctx.desenhar(); } });
    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" },
      h("div", { class: "busca" }, P.ic("busca"), busca),
      h("div", { class: "filtros", role: "group", "aria-label": "Filtrar" }, chip("aberto", "Em aberto"), chip("atrasadas", "Atrasadas"), chip("pagas", pagar ? "Pagas no período" : "Recebidas no período"), chip("periodo", "Vencem no período"), chip("todas", "Todas")),
      h("span", { class: "espaco" }),
      h("button", { type: "button", class: "btn", onclick: () => F.abrirImportacaoPlanilha(ctx, tipo) }, P.ic("subir"), "Importar planilha"),
      h("button", { type: "button", class: "btn p", onclick: () => abrirFormulario(ctx, tipo, null) }, P.ic("mais"), "Nova conta")), tabelaBox);
    desenharTabela();
    raiz.append(F.aviso(pagar ? "Lance aqui tudo o que a empresa precisa pagar: fornecedores, aluguel, energia, salários, impostos, taxas e o que mais tiver. As despesas entram na DRE pelo mês do vencimento."
      : "Lance aqui as vendas a prazo, os recebíveis de cartão e marketplace e os serviços de assistência técnica. Venda no cartão não é dinheiro na hora: use a data em que o dinheiro realmente cai."));
    return raiz;
  }
  F.telas.pagar = (ctx) => contas(ctx, "pagar");
  F.telas.receber = (ctx) => contas(ctx, "receber");

  /* ---------- IMPOSTOS E OBRIGAÇÕES ---------- */
  const REGIMES = [["", "Escolha"], ["mei", "MEI"], ["simples", "Simples Nacional"], ["presumido", "Lucro Presumido"], ["real", "Lucro Real"], ["nao_sei", "Ainda não sei"]];
  const LIMITES = { mei: 81000, simples: 4800000 };
  F.telas.impostos = function (ctx) {
    const fx = ctx.faixa, hoje = F.hoje(), ano = hoje.slice(0, 4), raiz = h("div");
    const m = F.metricas(ctx, fx.ini, fx.fim);
    const imp = ctx.lancs.filter((l) => l.tipo === "pagar" && l.categoria === F.CAT_IMPOSTOS);
    const doAno = F.metricas(ctx, ano + "-01-01", ano + "-12-31");
    const doze = F.metricas(ctx, F.somarMesesData(hoje, -12), hoje);
    const abertos = imp.filter(F.aberto), pagosAno = imp.filter((l) => l.pagamento && l.pagamento.slice(0, 4) === ano);
    const periodoNotas = ctx.notas.filter((n) => n.status === "autorizada" && !n.devolucao && n.tipo === "saida" && n.data_emissao >= fx.ini && n.data_emissao <= fx.fim);
    const destacados = soma(periodoNotas, (n) => n.valor_icms + n.valor_pis + n.valor_cofins + n.valor_ipi), aprox = soma(periodoNotas, (n) => n.valor_tributos);
    const carga = m.receitaBruta > 0 ? (soma(imp.filter((l) => l.vencimento >= fx.ini && l.vencimento <= fx.fim), (l) => l.valor) / m.receitaBruta) * 100 : 0;
    const regime = ctx.cfg.regime || "";

    const seletor = h("select", { "aria-label": "Regime tributário", onchange: async (e) => { await ctx.salvarCfg("regime", e.target.value); ctx.desenhar(); } },
      REGIMES.map(([v, t]) => h("option", { value: v, text: t, selected: v === regime })));
    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile("t-rosa", "Faturamento do período", F.dinheiro(m.receitaBruta), fx.rotulo.toLowerCase()),
      F.tile("t-azul", "Faturamento do ano", F.dinheiro(doAno.receitaBruta), "acumulado em " + ano),
      F.tile("t-ouro", "Guias pagas no ano", F.dinheiro(soma(pagosAno, (l) => l.valor)), pagosAno.length + " guia(s)"),
      F.tile(abertos.length ? "t-vermelho" : "t-verde", "Impostos em aberto", F.dinheiro(soma(abertos, (l) => l.valor)), abertos.length + " guia(s) a pagar")));

    const limite = LIMITES[regime];
    raiz.append(h("div", { class: "fin-duas" },
      F.cartao("Regime e carga tributária", h("div", null,
        P.campo("Regime tributário da empresa", seletor, "Só para o seu controle. Quem define o regime e as guias é o seu contador."),
        h("ul", { class: "fin-saude" },
          h("li", null, h("span", { text: "Carga tributária efetiva (guias lançadas ÷ faturamento do período)" }), h("b", { text: F.pct(carga, 1) })),
          h("li", null, h("span", { text: "Tributos destacados nas notas de venda do período (ICMS, PIS, COFINS, IPI)" }), h("b", { text: F.dinheiro(destacados) })),
          h("li", null, h("span", { text: "Carga tributária aproximada informada nas notas (Lei da Transparência)" }), h("b", { text: F.dinheiro(aprox) })),
          h("li", null, h("span", { text: "Faturamento dos últimos 12 meses" }), h("b", { text: F.dinheiro(doze.receitaBruta) }))),
        limite ? h("div", { style: "margin-top:10px" }, h("p", { class: "fraco", style: "margin-bottom:4px", text: "Limite anual de faturamento do regime (confira o valor atual com o contador): " + F.dinheiro(limite) }),
          F.progresso((doze.receitaBruta / limite) * 100, doze.receitaBruta / limite > 0.8 ? "#d4504f" : "var(--couro)"),
          h("p", { class: "fraco", style: "margin-top:4px", text: F.pct((doze.receitaBruta / limite) * 100, 0) + " do limite nos últimos 12 meses." })) : null)),
      F.cartao("Para o seu contador", h("ul", { class: "fin-lista" },
        h("li", { text: "Faturamento mensal e acumulado: veja nesta tela e na DRE." }),
        h("li", { text: "Notas de entrada e de saída: use o botão Importar notas e mande o mesmo pacote de XML." }),
        h("li", { text: "Guias (DAS, ICMS, ISS, PIS, COFINS, IRPJ, CSLL, INSS e outras): lance abaixo, com o vencimento, para o painel avisar quando estiver perto." }),
        h("li", { text: "Nem todos os tributos se aplicam a todas as empresas. Apuração e enquadramento são com o contador." })))));

    raiz.append(h("div", { class: "ferramentas", style: "margin-top:14px" }, h("h3", { class: "fin-cartao-tit", style: "flex:1;margin:0", text: "Guias e impostos lançados" }),
      h("button", { type: "button", class: "btn p", onclick: () => abrirFormulario(ctx, "pagar", null, { categoria: F.CAT_IMPOSTOS, descricao: "Imposto (guia)" }) }, P.ic("mais"), "Nova guia")));
    raiz.append(F.tabela(["Vencimento", "Guia", "Observação", { t: "Valor", num: true }, "Situação"],
      imp.slice().sort((a, b) => (a.vencimento < b.vencimento ? 1 : -1)).slice(0, 60).map((l) => {
        const sit = F.situacaoLanc(l), rot = ROTULO_SIT[sit];
        return h("tr", { class: "clicavel", onclick: () => abrirFormulario(ctx, "pagar", l) }, h("td", { class: "nw", text: P.fmtData(l.vencimento) }), h("td", { text: l.descricao }), h("td", { class: "truncar", text: l.obs || "" }),
          h("td", { class: "num", text: F.dinheiro(l.valor) }), h("td", { class: "nw" }, F.pilulaStatus(rot[0] + (l.pagamento ? " em " + P.fmtData(l.pagamento) : ""), rot[1])));
      }), "Nenhuma guia lançada ainda. Clique em Nova guia."));
    return raiz;
  };

  /* ---------- FLUXO DE CAIXA ---------- */
  F.telas.caixa = function (ctx) {
    const hoje = F.hoje(), raiz = h("div");
    const saldo = F.saldoAtual(ctx);
    const abertosR = F.receber(ctx).filter(F.aberto), abertosP = F.pagar(ctx).filter(F.aberto);
    const ate = (lista, dias) => soma(lista.filter((l) => l.vencimento <= F.somarDias(hoje, dias)), (l) => l.valor);
    const projecao = (dias) => (saldo == null ? null : saldo + ate(abertosR, dias) - ate(abertosP, dias));

    const valorIni = h("input", { type: "text", inputmode: "decimal", value: ctx.cfg.saldo_inicial != null && ctx.cfg.saldo_inicial !== "" ? String(ctx.cfg.saldo_inicial).replace(".", ",") : "", placeholder: "0,00" });
    const dataIni = h("input", { type: "date", value: ctx.cfg.saldo_data || hoje });
    const salvarSaldo = async () => {
      const v = lerValor(valorIni.value);
      if (isNaN(v) || !dataIni.value) { P.toast("Escreva o saldo (por exemplo 12500,00) e a data.", true); return; }
      const a = await ctx.salvarCfg("saldo_inicial", v), b = await ctx.salvarCfg("saldo_data", dataIni.value);
      if (a && b) { P.toast("Saldo inicial salvo"); ctx.desenhar(); }
    };
    raiz.append(h("div", { class: "fin-tiles quatro" },
      F.tile("t-azul", "Saldo atual", saldo == null ? "Defina abaixo" : F.dinheiro(saldo), "saldo inicial + recebido − pago"),
      F.tile("t-verde", "A entrar em 30 dias", F.dinheiro(ate(abertosR, 30))),
      F.tile("t-coral", "A sair em 30 dias", F.dinheiro(ate(abertosP, 30))),
      F.tile(projecao(30) != null && projecao(30) < 0 ? "t-vermelho" : "t-rosa", "Saldo projetado (30 dias)", projecao(30) == null ? "Defina o saldo" : F.dinheiro(projecao(30)))));

    raiz.append(F.cartao("Saldo inicial", h("div", null,
      h("p", { class: "fraco", text: "Informe quanto tinha em conta (bancos e caixa) numa data de partida. A partir dela o painel soma o que você marcar como recebido e subtrai o que marcar como pago." }),
      h("div", { class: "grade2" }, P.campo("Saldo (R$)", valorIni), P.campo("Na data", dataIni)),
      h("button", { type: "button", class: "btn p", onclick: salvarSaldo }, "Salvar saldo inicial"))));

    const horizontes = [7, 15, 30, 60, 90];
    raiz.append(F.cartao("Projeção do caixa", F.tabela(["Daqui a", { t: "Entradas previstas", num: true }, { t: "Saídas previstas", num: true }, { t: "Saldo projetado", num: true }, "Risco"],
      horizontes.map((d) => { const p = projecao(d); return h("tr", null, h("td", { text: d + " dias" }), h("td", { class: "num", text: F.dinheiro(ate(abertosR, d)) }), h("td", { class: "num", text: F.dinheiro(ate(abertosP, d)) }),
        h("td", { class: "num", text: p == null ? "defina o saldo" : F.dinheiro(p) }), h("td", null, p == null ? null : F.pilulaStatus(p < 0 ? "Saldo negativo" : "Ok", p < 0 ? "ruim" : "ok"))); }),
      "")));

    const passados = F.mesesAtras(6), futuros = Array.from({ length: 6 }, (_, i) => F.somarMesesData(hoje, i).slice(0, 7));
    const realizado = (ym, tipo) => { const l = F.limitesDoMes(ym); return soma(ctx.lancs.filter((x) => x.tipo === tipo && x.pagamento && x.pagamento >= l.ini && x.pagamento <= l.fim), (x) => x.valor); };
    const previsto = (ym, tipo) => { const l = F.limitesDoMes(ym); return soma(ctx.lancs.filter((x) => x.tipo === tipo && !x.pagamento && x.vencimento >= l.ini && x.vencimento <= l.fim), (x) => x.valor)
      + (ym === hoje.slice(0, 7) ? soma(ctx.lancs.filter((x) => x.tipo === tipo && !x.pagamento && x.vencimento < l.ini), (x) => x.valor) : 0); };
    const legenda = h("div", { class: "fin-legenda" }, h("span", null, h("i", { style: "background:#7aa874" }), "Entradas"), h("span", null, h("i", { style: "background:#e8606f" }), "Saídas"));
    raiz.append(h("div", { class: "fin-duas igual" },
      F.cartao("Realizado nos últimos 6 meses", h("div", null, F.barras(passados.map(F.mesNome), [{ nome: "Entradas", cor: "#7aa874", valores: passados.map((ym) => realizado(ym, "receber")) },
        { nome: "Saídas", cor: "#e8606f", valores: passados.map((ym) => realizado(ym, "pagar")) }]), legenda.cloneNode(true))),
      F.cartao("Previsto para os próximos 6 meses", h("div", null, F.barras(futuros.map(F.mesNome), [{ nome: "Entradas previstas", cor: "#9fc99a", valores: futuros.map((ym) => previsto(ym, "receber")) },
        { nome: "Saídas previstas", cor: "#f0a0a8", valores: futuros.map((ym) => previsto(ym, "pagar")) }]), legenda.cloneNode(true)))));
    raiz.append(F.aviso("A DRE mostra se a operação deu lucro. O fluxo de caixa mostra se tem dinheiro para pagar as contas. Uma empresa pode ter lucro e faltar caixa (vende parcelado, compra estoque à vista). Separe sempre o dinheiro da empresa do dinheiro pessoal e registre o pró-labore em Contas a pagar."));
    return raiz;
  };
})();
