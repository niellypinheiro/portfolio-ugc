/* =========================================================================
   banco.js  |  Ligação com o Supabase
   Estes dois dados ficam escritos AQUI, uma vez só, e todas as páginas
   (portfólio, login e admin) usam este arquivo.

   A chave abaixo é a chave PÚBLICA (publishable). Ela pode ficar no site.
   A chave SECRETA (service_role) nunca entra em arquivo nenhum.
   Quem protege os dados de verdade é o RLS, que o banco.sql liga.
   ========================================================================= */
(function () {
  "use strict";

  var URL_DO_PROJETO = "https://pirfpsdiaajbnriqszvd.supabase.co";
  var CHAVE_PUBLICA = "sb_publishable_svsxFhrpfZ8E9zUkdSMx6w_ybcuMakz";

  window.BANCO = {
    url: URL_DO_PROJETO,
    chave: CHAVE_PUBLICA,
    emailDaDona: "niellypinheirougccreator@gmail.com",
    /* endereço da pasta do site (funciona no GitHub Pages e no computador) */
    raiz: "https://niellypinheiro.com.br/"
  };
  /* Endereço do editor de SQL do seu projeto no Supabase (o painel usa nos avisos de "falta rodar o banco.sql") */
  window.BANCO.editorSql = "https://supabase.com/dashboard/project/" + URL_DO_PROJETO.replace("https://", "").split(".")[0] + "/sql/new";

  /* Cliente completo (login, painel). Só existe nas páginas que carregam
     a biblioteca do Supabase antes deste arquivo. */
  window.sb = null;
  if (window.supabase && typeof window.supabase.createClient === "function") {
    window.sb = window.supabase.createClient(URL_DO_PROJETO, CHAVE_PUBLICA, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  /* Acesso simples ao banco para o site público (sem biblioteca, mais leve).
     Serve só para o que o visitante pode fazer: ler vídeos visíveis e
     enviar um contato ou uma visita. Devolve uma promessa. */
  window.BANCO.rest = function (caminho, opcoes) {
    var o = opcoes || {};
    var cab = { apikey: CHAVE_PUBLICA };
    if (o.corpo !== undefined) cab["Content-Type"] = "application/json";
    if (o.metodo && o.metodo !== "GET") cab.Prefer = "return=minimal";
    return fetch(URL_DO_PROJETO + "/rest/v1/" + caminho, {
      method: o.metodo || "GET",
      headers: cab,
      body: o.corpo !== undefined ? JSON.stringify(o.corpo) : undefined,
      keepalive: !!o.keepalive
    }).then(function (r) {
      if (!r.ok) throw new Error("banco " + r.status);
      return r.status === 204 || o.metodo === "POST" ? null : r.json();
    });
  };
})();
