// instagram-sync
// Busca os dados do Instagram da Nielly pela API oficial (Instagram API com
// login do Instagram) e guarda no banco, para a aba "Instagram" do painel.
// So aceita chamadas da propria Nielly (confere o login pelo token do
// Supabase Auth). O token do Instagram fica so como segredo da funcao
// (INSTAGRAM_TOKEN), nunca em arquivo do site. Se a Meta devolver um token
// renovado, ele e guardado na tabela "configuracoes" (so a Nielly le).

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL");
const CHAVE_ANONIMA = Deno.env.get("SUPABASE_ANON_KEY");
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TOKEN_SEGREDO = Deno.env.get("INSTAGRAM_TOKEN");
const EMAIL_DONA = "niellypinheirougccreator@gmail.com";
const GRAPH = "https://graph.instagram.com/v23.0";

const CABECALHOS_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(corpo, status) {
  return new Response(JSON.stringify(corpo), {
    status: status || 200,
    headers: Object.assign({}, CABECALHOS_CORS, { "Content-Type": "application/json" })
  });
}



async function chamar(url) {
  try {
    const r = await fetch(url);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || (d && d.error)) {
      const e = (d && d.error) || {};
      return { ok: false, status: r.status, codigo: e.code, erro: String(e.message || ("erro " + r.status)) };
    }
    return { ok: true, dados: d };
  } catch (e) {
    return { ok: false, status: 0, erro: String((e && e.message) || e) };
  }
}

async function impressao(texto) {
  const dados = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(dados)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

function valorDaMetrica(m) {
  if (!m) return null;
  if (m.total_value && typeof m.total_value.value === "number") return m.total_value.value;
  if (Array.isArray(m.values) && m.values.length && typeof m.values[0].value === "number") return m.values[0].value;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CABECALHOS_CORS });

  try {
    const autorizacao = req.headers.get("Authorization") || "";
    const tokenLogin = autorizacao.replace(/^Bearer\s+/i, "");
    if (!tokenLogin) return json({ ok: false, erro: "Faltou o login." }, 401);

    const sbUsuario = createClient(URL_SUPABASE, CHAVE_ANONIMA, { global: { headers: { Authorization: "Bearer " + tokenLogin } } });
    const resultadoUsuario = await sbUsuario.auth.getUser(tokenLogin);
    const usuario = resultadoUsuario.data ? resultadoUsuario.data.user : null;
    const email = usuario && usuario.email ? usuario.email.toLowerCase() : "";
    if (resultadoUsuario.error || email !== EMAIL_DONA) return json({ ok: false, erro: "Acesso recusado." }, 403);
    if (!CHAVE_SERVICO) return json({ ok: false, erro: "A funcao nao tem acesso ao banco (SUPABASE_SERVICE_ROLE_KEY)." }, 500);

    const sb = createClient(URL_SUPABASE, CHAVE_SERVICO);
    const corpo = await req.json().catch(() => ({}));
    const limite = Math.max(10, Math.min(200, parseInt(corpo && corpo.limite, 10) || 60));
    const avisos = [];

    // token: o renovado (se existir) tem prioridade sobre o segredo
    const cfg = await sb.from("configuracoes").select("chave,valor,atualizado_em").in("chave", ["instagram_token", "instagram_token_renovado", "instagram_token_origem"]);
    const linhas = cfg.data || [];
    const tokenGuardado = (linhas.find((l) => l.chave === "instagram_token") || {}).valor || "";
    const renovadoEm = (linhas.find((l) => l.chave === "instagram_token_renovado") || {}).valor || "";
    const origemGuardada = (linhas.find((l) => l.chave === "instagram_token_origem") || {}).valor || "";
    const minhaImpressao = TOKEN_SEGREDO ? await impressao(TOKEN_SEGREDO) : "";
    /* o token renovado so vale enquanto o segredo for o mesmo de quando ele foi guardado; se voce colar um token novo no segredo, o novo passa a valer */
    const usarGuardado = !!tokenGuardado && (!minhaImpressao || origemGuardada === minhaImpressao);
    let token = usarGuardado ? tokenGuardado : (TOKEN_SEGREDO || "");
    if (!token) return json({ ok: false, passo: "token", erro: "Falta o segredo INSTAGRAM_TOKEN nas Edge Functions do Supabase." });

    // renova o token (vale 60 dias) a cada ~20 dias
    const idadeDias = usarGuardado && renovadoEm ? (Date.now() - new Date(renovadoEm).getTime()) / 86400000 : 999;
    if (idadeDias > 20) {
      const rn = await chamar("https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=" + encodeURIComponent(token));
      if (rn.ok && rn.dados && rn.dados.access_token) {
        token = rn.dados.access_token;
        const agora = new Date().toISOString();
        await sb.from("configuracoes").upsert([
          { chave: "instagram_token", valor: token, atualizado_em: agora },
          { chave: "instagram_token_renovado", valor: agora, atualizado_em: agora },
          { chave: "instagram_token_origem", valor: minhaImpressao, atualizado_em: agora }
        ], { onConflict: "chave" });
      } else if (!rn.ok) {
        avisos.push("Nao consegui renovar o token agora (" + rn.erro + "). Se o painel parar de atualizar, gere outro token.");
      }
    }
    const t = "access_token=" + encodeURIComponent(token);

    // 1) a conta
    const rc = await chamar(GRAPH + "/me?fields=user_id,username,name,followers_count,follows_count,media_count,account_type&" + t);
    if (!rc.ok) return json({ ok: false, passo: "conta", erro: rc.erro, codigo: rc.codigo });
    const conta = rc.dados;

    // 2) os posts mais recentes
    const midias = [];
    let proxima = GRAPH + "/me/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=50&" + t;
    while (proxima && midias.length < limite) {
      const rm = await chamar(proxima);
      if (!rm.ok) { if (!midias.length) return json({ ok: false, passo: "posts", erro: rm.erro, codigo: rm.codigo }); avisos.push("Nem todos os posts foram lidos: " + rm.erro); break; }
      (rm.dados.data || []).forEach((m) => midias.push(m));
      proxima = rm.dados.paging && rm.dados.paging.next ? rm.dados.paging.next : null;
    }
    const alvo = midias.slice(0, limite);

    // 3) numeros de cada post (alcance, salvos, compartilhamentos, visualizacoes)
    const insights = {};
    let postsComInsight = 0, primeiroErroInsight = "";
    for (let i = 0; i < alvo.length; i += 8) {
      await Promise.all(alvo.slice(i, i + 8).map(async (m) => {
        const metricas = ["reach", "saved", "shares", "views", "total_interactions"];
        let r = await chamar(GRAPH + "/" + m.id + "/insights?metric=" + metricas.join(",") + "&" + t);
        let dados = r.ok ? (r.dados.data || []) : null;
        if (!r.ok) {
          // alguma metrica nao vale para este tipo de post: tenta uma por uma
          dados = [];
          for (const nome of metricas) {
            const um = await chamar(GRAPH + "/" + m.id + "/insights?metric=" + nome + "&" + t);
            if (um.ok) (um.dados.data || []).forEach((x) => dados.push(x));
            else if (!primeiroErroInsight) primeiroErroInsight = um.erro;
          }
        }
        const mapa = {};
        dados.forEach((x) => { mapa[x.name] = valorDaMetrica(x); });
        if (Object.keys(mapa).length) { insights[m.id] = mapa; postsComInsight++; }
      }));
    }
    if (!postsComInsight) avisos.push("Nao consegui ler alcance, salvos e compartilhamentos dos posts" + (primeiroErroInsight ? " (" + primeiroErroInsight + ")" : "") + ". Mostro so curtidas e comentarios.");

    const postsLinhas = alvo.map((m) => {
      const x = insights[m.id] || {};
      return {
        id: m.id,
        legenda: m.caption ? String(m.caption).slice(0, 2200) : null,
        tipo: m.media_type || null,
        formato: m.media_product_type || null,
        permalink: m.permalink || null,
        miniatura: m.thumbnail_url || m.media_url || null,
        publicado_em: m.timestamp || null,
        curtidas: m.like_count || 0,
        comentarios: m.comments_count || 0,
        alcance: x.reach != null ? x.reach : null,
        visualizacoes: x.views != null ? x.views : null,
        salvos: x.saved != null ? x.saved : null,
        compartilhamentos: x.shares != null ? x.shares : null,
        interacoes: x.total_interactions != null ? x.total_interactions : null,
        atualizado_em: new Date().toISOString()
      };
    });
    for (let i = 0; i < postsLinhas.length; i += 100) {
      const g = await sb.from("instagram_posts").upsert(postsLinhas.slice(i, i + 100), { onConflict: "id" });
      if (g.error) return json({ ok: false, passo: "gravar posts", erro: g.error.message + " (rode o banco.sql, bloco 8C)" });
    }

    // 4) comentarios dos posts mais recentes que tem comentario
    let comentariosGravados = 0, comentariosOk = true, comentariosBrutos = 0, erroGravarComentarios = "", amostraComentarios = "";
    const comComentario = alvo.filter((m) => (m.comments_count || 0) > 0).slice(0, 40);
    for (let i = 0; i < comComentario.length && comentariosOk; i += 5) {
      const lote = await Promise.all(comComentario.slice(i, i + 5).map(async (m) => {
        const rr = await chamar(GRAPH + "/" + m.id + "/comments?fields=id,text,username,timestamp,like_count&limit=100&" + t);
        return { post: m.id, r: rr };
      }));
      for (const { post, r } of lote) {
        if (!r.ok) {
          if (comentariosOk) avisos.push("Nao consegui ler os comentarios (" + r.erro + "). Sem eles, o ranking de quem mais comenta fica vazio. Gere o token de novo marcando a permissao de comentarios.");
          comentariosOk = false; break;
        }
        const brutos = r.dados.data || [];
        comentariosBrutos += brutos.length;
        if (!amostraComentarios && !brutos.length) amostraComentarios = JSON.stringify(r.dados).slice(0, 220);
        const itens = brutos.map((c) => ({
          id: c.id, post_id: post, usuario: c.username || null, texto: c.text ? String(c.text).slice(0, 1500) : null,
          curtidas: c.like_count || 0, publicado_em: c.timestamp || null
        }));
        if (itens.length) {
          const g = await sb.from("instagram_comentarios").upsert(itens, { onConflict: "id" });
          if (!g.error) comentariosGravados += itens.length; else if (!erroGravarComentarios) erroGravarComentarios = g.error.message;
        }
      }
    }

    // 5) numeros da conta nos ultimos 30 dias e o publico
    if (comentariosOk && comComentario.length && comentariosGravados === 0) {
      avisos.push("Comentarios: consultei " + comComentario.length + " posts que tem comentarios e a API devolveu " + comentariosBrutos + " comentarios" +
        (erroGravarComentarios ? ". Erro ao gravar: " + erroGravarComentarios : "") + (amostraComentarios ? ". Resposta da API: " + amostraComentarios : "") + ".");
    }

    const fim = Math.floor(Date.now() / 1000), ini = fim - 29 * 86400;
    const conta30 = {};
    for (const nome of ["reach", "profile_views", "accounts_engaged"]) {
      const ri = await chamar(GRAPH + "/me/insights?metric=" + nome + "&metric_type=total_value&period=day&since=" + ini + "&until=" + fim + "&" + t);
      if (ri.ok && ri.dados.data && ri.dados.data[0]) conta30[nome] = valorDaMetrica(ri.dados.data[0]);
    }
    const demografia = {};
    for (const quebra of ["gender", "age", "city"]) {
      const rd = await chamar(GRAPH + "/me/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=" + quebra + "&" + t);
      if (rd.ok && rd.dados.data && rd.dados.data[0] && rd.dados.data[0].total_value && rd.dados.data[0].total_value.breakdowns) {
        const b = rd.dados.data[0].total_value.breakdowns[0];
        demografia[quebra] = (b.results || []).map((x) => ({ nome: (x.dimension_values || []).join(" "), valor: x.value }));
      }
    }

    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const dia = await sb.from("instagram_dias").upsert({
      dia: hoje, usuario: conta.username || null, seguidores: conta.followers_count != null ? conta.followers_count : null,
      seguindo: conta.follows_count != null ? conta.follows_count : null, midias: conta.media_count != null ? conta.media_count : null,
      alcance_30d: conta30.reach != null ? conta30.reach : null, visitas_perfil_30d: conta30.profile_views != null ? conta30.profile_views : null,
      contas_engajadas_30d: conta30.accounts_engaged != null ? conta30.accounts_engaged : null,
      demografia: Object.keys(demografia).length ? demografia : null
    }, { onConflict: "dia" });
    if (dia.error) avisos.push("Nao consegui guardar o resumo do dia: " + dia.error.message);

    return json({
      ok: true,
      conta: { usuario: conta.username, seguidores: conta.followers_count, tipo: conta.account_type },
      posts: postsLinhas.length, postsComNumeros: postsComInsight, comentarios: comentariosGravados, comentariosOk,
      publico: Object.keys(demografia).length > 0, avisos
    });
  } catch (e) {
    return json({ ok: false, erro: "Erro inesperado: " + String((e && e.message) || e) }, 500);
  }
});
