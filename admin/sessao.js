/* =========================================================================
   sessao.js  |  A PRIMEIRA coisa que o painel faz: conferir se você está logada.
   Sem sessão, manda para o login. O painel só aparece depois desta conferência.
   ========================================================================= */
(function () {
  "use strict";
  var P = (window.Painel = window.Painel || {});
  var IR_PARA_LOGIN = "../login/";

  function textoDaTela(html) {
    var el = document.getElementById("verificando");
    if (el) el.innerHTML = html;
  }
  function falha(msg) {
    textoDaTela("<div><p>" + msg + "</p><p style=\"margin-top:10px\"><a href=\"./\">Tentar de novo</a> &nbsp;|&nbsp; <a href=\"" + IR_PARA_LOGIN + "\">Ir para o login</a></p></div>");
  }
  function ehADona(sessao) {
    var e = sessao && sessao.user && sessao.user.email ? sessao.user.email.toLowerCase() : "";
    return e === window.BANCO.emailDaDona.toLowerCase();
  }

  /* Sem a biblioteca do Supabase o painel não tem como conferir nada: avisa, nunca fica em branco */
  if (!window.sb) {
    falha("Não consegui carregar o sistema de acesso. Confira a internet e recarregue a página.");
    P.sessaoPronta = new Promise(function () {});
    return;
  }

  /* Se o tempo passar e nada acontecer, avisa em vez de deixar a tela parada */
  var relogio = setTimeout(function () {
    if (document.body.classList.contains("carregando")) falha("A conferência do acesso está demorando. Confira a internet.");
  }, 10000);

  P.sessaoPronta = window.sb.auth.getSession().then(function (r) {
    clearTimeout(relogio);
    var s = r && r.data && r.data.session;
    if (!s) { location.replace(IR_PARA_LOGIN); return new Promise(function () {}); }
    if (!ehADona(s)) {
      return window.sb.auth.signOut().then(function () {
        location.replace(IR_PARA_LOGIN);
        return new Promise(function () {});
      });
    }
    P.sessao = s;
    return s;
  }).catch(function () {
    clearTimeout(relogio);
    falha("Não consegui confirmar o seu acesso. Confira a internet.");
    return new Promise(function () {});
  });

  /* Se a sessão acabar com o painel aberto (saiu em outra aba, por exemplo), volta para o login */
  window.sb.auth.onAuthStateChange(function (evento) {
    if (evento === "SIGNED_OUT") location.replace(IR_PARA_LOGIN);
  });
})();
