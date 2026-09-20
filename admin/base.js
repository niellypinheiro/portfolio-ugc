/* =========================================================================
   base.js  |  Ferramentas usadas por todas as abas do painel
   ========================================================================= */
(function () {
  "use strict";
  const P = window.Painel;
  P.abas = {};

  /* Os nichos do portfólio, na ordem em que aparecem no site */
  P.NICHOS = [
    { id: "casa", nome: "Casa e decoração" },
    { id: "gastronomia", nome: "Gastronomia" },
    { id: "tech", nome: "Tech" },
    { id: "beleza", nome: "Beleza" },
    { id: "moda", nome: "Moda" }
  ];
  P.nomeNicho = (id) => (P.NICHOS.find((n) => n.id === id) || { nome: id || "" }).nome;

  /* ---------- criar elementos na tela sem usar innerHTML ---------- */
  P.h = function (tag, props, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (k === "estilo") { for (const [p, val] of Object.entries(v)) e.style.setProperty(p, val); }
      else if (["value", "checked", "disabled", "selected", "hidden"].includes(k)) e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    filhos.flat(Infinity).forEach((f) => {
      if (f != null && f !== false) e.append(f.nodeType ? f : String(f));
    });
    return e;
  };
  const h = P.h;
  P.limpar = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ---------- ícones de traço ---------- */
  const ICONES = {
    portfolio: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="9" r="1.6"/><path d="M21 16l-5-5-8 9"/>',
    marcas: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    campanhas: '<path d="M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    checklist: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>',
    olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    olhoFechado: '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.1-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    lapis: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
    lixeira: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    baixar: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
    alca: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
    estrela: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    esq: '<path d="M15 5l-7 7 7 7"/>',
    dir: '<path d="M9 5l7 7-7 7"/>',
    baixo: '<path d="M6 9l6 6 6-6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    sair: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    whats: '<path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5z"/><path d="M9 9c.3 2.3 2.7 4.7 6 6l1.2-1.4-2-1-.9.7c-.9-.4-1.8-1.3-2.2-2.2l.7-.9-1-2z"/>',
    insta: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".8" fill="currentColor"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    check: '<path d="M5 12l5 5 9-10"/>'
  };
  P.ic = function (nome, cheio) {
    const t = document.createElement("template");
    t.innerHTML = '<svg class="ic' + (cheio ? " cheio" : "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONES[nome] || "") + "</svg>";
    return t.content.firstChild;
  };
  P.iconeDe = (nome) => nome;

  /* ---------- datas, dinheiro e números ---------- */
  const doisDig = (n) => String(n).padStart(2, "0");
  P.iso = (d) => d.getFullYear() + "-" + doisDig(d.getMonth() + 1) + "-" + doisDig(d.getDate());
  P.hoje = () => P.iso(new Date());
  P.paraData = (s) => { const [a, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(a, m - 1, d); };
  P.diasEntre = (de, ate) => Math.round((P.paraData(ate) - P.paraData(de)) / 86400000);
  P.fmtData = (s) => { if (!s) return ""; const [a, m, d] = String(s).slice(0, 10).split("-"); return d + "/" + m + "/" + a; };
  P.dinheiro = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  P.numero = (n) => Number(n || 0).toLocaleString("pt-BR");
  P.lerValor = (texto) => {
    /* aceita "1.500,50", "1500,5", "1500.50" */
    let s = String(texto == null ? "" : texto).replace(/[^\d.,-]/g, "");
    if (!s) return 0;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");   /* "3.000" e "1.500.000" são milhares */
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  P.semAcento = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  P.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- links de contato ---------- */
  P.linkWhats = (tel) => {
    let d = String(tel || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.length <= 11) d = "55" + d;
    return "https://wa.me/" + d;
  };
  P.linkInsta = (u) => {
    const s = String(u || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
    return s ? "https://www.instagram.com/" + encodeURIComponent(s) + "/" : "";
  };
  P.arroba = (u) => { const s = String(u || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, ""); return s ? "@" + s : ""; };

  /* Texto da biblioteca pode ter <b> e <em>: deixo passar só isso, o resto vira texto puro */
  P.htmlSeguro = (s) => String(s == null ? "" : s)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
    .replace(/&lt;(\/?)(b|em|strong|i)&gt;/gi, "<$1$2>");

  /* ---------- aviso rápido ---------- */
  let relogioToast;
  P.toast = function (msg, erro) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast mostra" + (erro ? " erro" : "");
    clearTimeout(relogioToast);
    relogioToast = setTimeout(() => { t.className = "toast"; }, erro ? 5500 : 2600);
  };

  /* ---------- avisos fixos no alto da aba (tabela faltando, etc.) ---------- */
  P.avisos = [];
  P.limparAvisos = () => { P.avisos = []; P.limpar(document.getElementById("avisos")); };
  P.avisar = function (texto, tipo) {
    if (P.avisos.includes(texto)) return;
    P.avisos.push(texto);
    document.getElementById("avisos").append(h("div", { class: "aviso-pagina" + (tipo === "erro" ? " erro" : ""), role: "alert", text: texto }));
  };

  /* ---------- janela (modal) ---------- */
  let janelasAbertas = 0;
  P.modal = function ({ titulo, corpo, botoes, larga, aoFechar }) {
    const antes = document.activeElement;
    const camada = h("div", { class: "camada" });
    const corpoEl = h("div", { class: "janela-corpo" }, corpo);
    const pe = h("div", { class: "janela-pe" });
    const janela = h("div", { class: "janela" + (larga ? " larga" : ""), role: "dialog", "aria-modal": "true", "aria-label": titulo, tabindex: "-1" },
      h("div", { class: "janela-cab" }, h("h2", { text: titulo }),
        h("button", { type: "button", class: "btn-i", "aria-label": "Fechar", onclick: () => fechar() }, P.ic("x"))),
      corpoEl, (botoes && botoes.length) ? pe : null);
    let fechada = false;
    function fechar() {
      if (fechada) return;
      fechada = true;
      document.removeEventListener("keydown", tecla, true);
      camada.remove();
      janelasAbertas--;
      if (janelasAbertas <= 0) { janelasAbertas = 0; const app = document.getElementById("app"); if (app) app.inert = false; }
      if (antes && document.contains(antes) && antes.focus) antes.focus({ preventScroll: true });
      if (aoFechar) aoFechar();
    }
    function tecla(e) { if (e.key === "Escape") { e.stopPropagation(); fechar(); } }
    (botoes || []).forEach((b) => {
      const btn = h("button", { type: "button", class: "btn" + (b.classe ? " " + b.classe : ""), text: b.texto,
        onclick: async () => {
          if (btn.disabled) return;
          if (!b.aoClicar) { fechar(); return; }
          btn.disabled = true;
          let manter = false;
          try { manter = (await b.aoClicar(fechar)) === false; } catch (e) { manter = true; console.error(e); }
          if (!fechada) btn.disabled = false;
          if (!manter && !fechada && b.fecha !== false) fechar();
        } });
      if (b.esquerda) pe.append(btn, h("span", { class: "espaco" })); else pe.append(btn);
    });
    camada.append(janela);
    camada.addEventListener("mousedown", (e) => { if (e.target === camada) fechar(); });
    document.getElementById("camadaModal").append(camada);
    document.addEventListener("keydown", tecla, true);
    janelasAbertas++;
    document.getElementById("app").inert = true;
    const primeiro = janela.querySelector("input:not([type=hidden]),select,textarea");
    (primeiro || janela).focus && (primeiro || janela).focus({ preventScroll: true });
    return { fechar, janela };
  };
  P.confirmar = (texto, { botao = "Sim", perigo = false, titulo = "Confirmar" } = {}) => new Promise((resolve) => {
    let resposta = false;
    P.modal({ titulo, corpo: h("p", { text: texto }), aoFechar: () => resolve(resposta),
      botoes: [{ texto: "Cancelar" }, { texto: botao, classe: perigo ? "perigo" : "p", aoClicar: () => { resposta = true; } }] });
  });

  /* ---------- campos de formulário ---------- */
  let contadorCampo = 0;
  P.campo = function (rotulo, el, dica) {
    const id = "campo" + (++contadorCampo);
    el.id = id;
    return h("div", { class: "campo" }, h("label", { for: id, text: rotulo }), el, dica ? h("div", { class: "dica", text: dica }) : null);
  };
  P.opcoes = (lista, atual) => lista.map(([v, t]) => h("option", { value: v, text: t, selected: v === atual }));
  P.erroNoCampo = function (el, msg) {
    const pai = el.closest(".campo");
    if (!pai) return;
    const velho = pai.querySelector(".erro"); if (velho) velho.remove();
    if (msg) { pai.append(h("div", { class: "erro", role: "alert", text: msg })); el.setAttribute("aria-invalid", "true"); }
    else el.removeAttribute("aria-invalid");
  };

  /* ---------- falar com o banco sem quebrar quando falta tabela ou campo ---------- */
  P.ehFalta = (e) => !!e && (["42P01", "42703", "PGRST205", "PGRST204", "PGRST200"].includes(e.code) ||
    /does not exist|could not find|schema cache/i.test(e.message || ""));
  P.ehPermissao = (e) => !!e && (e.code === "42501" || /row-level security|permission denied/i.test(e.message || ""));

  /* Lê uma tabela. Se faltar tabela ou campo, avisa em cima da página e devolve lista vazia */
  P.carregar = async function (tabela, montar) {
    try {
      const { data, error } = await montar(window.sb.from(tabela));
      if (error) throw error;
      return { dados: data || [], ok: true };
    } catch (e) {
      if (P.ehFalta(e)) {
        P.avisar('Faltou a tabela "' + tabela + '" (ou um campo dela) no Supabase, então esta parte está vazia. Rode o arquivo banco.sql no SQL Editor e recarregue. O resto do painel continua funcionando.');
      } else if (P.ehPermissao(e)) {
        P.avisar('O banco não deixou ler "' + tabela + '". Confira se você entrou com o seu e-mail e se rodou o banco.sql.', "erro");
      } else {
        P.avisar('Não consegui carregar "' + tabela + '" agora. Confira a internet e recarregue a aba.', "erro");
      }
      return { dados: [], ok: false, falta: P.ehFalta(e) };
    }
  };
  /* Grava algo. Devolve {ok, data}. Em caso de erro mostra um aviso em português simples */
  P.gravar = async function (fazer) {
    try {
      const { data, error } = await fazer();
      if (error) throw error;
      return { ok: true, data };
    } catch (e) {
      P.toast(P.ehFalta(e) ? "Faltou uma tabela ou um campo no Supabase. Rode o banco.sql." :
        P.ehPermissao(e) ? "O banco não deixou salvar (permissão). Confira o seu login e o banco.sql." :
        "Não consegui salvar. Confira a internet e tente de novo.", true);
      return { ok: false, erro: e };
    }
  };

  /* ---------- baixar planilha (CSV que abre certinho no Excel, com acento) ---------- */
  P.baixarCSV = function (arquivo, cabecalhos, linhas) {
    const celula = (v) => {
      let s = v == null ? "" : String(v);
      if (/^[=@\t\r]|^[+-][^\d\s(]/.test(s)) s = "'" + s;
      return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const texto = "﻿" + [cabecalhos].concat(linhas).map((l) => l.map(celula).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    const a = h("a", { href: url, download: arquivo });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  /* ---------- cabeçalho de tabela que ordena ao clicar ---------- */
  P.cabecalho = function (rotulo, chave, estado, aoMudar, classe) {
    const ativa = estado.chave === chave;
    const seta = ativa ? (estado.dir === "asc" ? "▲" : "▼") : "↕";
    return h("th", { class: classe || "", "aria-sort": ativa ? (estado.dir === "asc" ? "ascending" : "descending") : "none" },
      h("button", { type: "button", class: "ordenar", "data-ativa": ativa ? "1" : "0",
        "aria-label": "Ordenar por " + rotulo,
        onclick: () => {
          if (estado.chave === chave) estado.dir = estado.dir === "asc" ? "desc" : "asc";
          else { estado.chave = chave; estado.dir = "asc"; }
          aoMudar();
        } }, rotulo, h("span", { class: "seta", "aria-hidden": "true", text: seta })));
  };
  P.comparar = (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;           /* vazio sempre vai para o fim */
    if (b == null) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base", numeric: true });
  };

  /* Ordena uma lista pelo valor que "valorDe" devolve; os vazios ficam sempre no fim */
  P.ordenar = (lista, valorDe, dir) => lista.slice().sort((x, y) => {
    const a = valorDe(x), b = valorDe(y);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const r = P.comparar(a, b);
    return dir === "asc" ? r : -r;
  });

  /* Bloco "linha de exemplo": aparece só quando a lista está vazia */
  P.etiquetaExemplo = () => h("span", { class: "tag exemplo", text: "exemplo" });
})();
