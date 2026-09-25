// enviar-emails
// Funcao que manda e-mails de prospeccao pelo Resend, chamada pela aba
// Prospeccao do painel. So aceita chamadas da propria Nielly (confere o
// login pelo token do Supabase Auth). A chave do Resend fica so aqui,
// como segredo da funcao (RESEND_API_KEY), nunca em arquivo do site.

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL");
const CHAVE_ANONIMA = Deno.env.get("SUPABASE_ANON_KEY");
const CHAVE_RESEND = Deno.env.get("RESEND_API_KEY");
const REMETENTE = Deno.env.get("RESEND_FROM") || "Nielly Pinheiro <onboarding@resend.dev>";
const EMAIL_DONA = "niellypinheirougccreator@gmail.com";
const EMAIL_CONTATO = "niellypinheirougccreator@gmail.com";

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

function trocarVariaveis(texto, nome, marca) {
  return String(texto || "").split("{{nome}}").join(nome).split("{{marca}}").join(marca);
}

function primeiroNome(nomeCompleto) {
  const s = String(nomeCompleto || "").trim();
  return s ? s.split(/\s+/)[0] : "";
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CABECALHOS_CORS });

  try {
    const autorizacao = req.headers.get("Authorization") || "";
    const token = autorizacao.replace(/^Bearer\s+/i, "");
    if (!token) return json({ erro: "Faltou o login." }, 401);

    const sb = createClient(URL_SUPABASE, CHAVE_ANONIMA, {
      global: { headers: { Authorization: "Bearer " + token } }
    });

    const resultadoUsuario = await sb.auth.getUser(token);
    const usuario = resultadoUsuario.data ? resultadoUsuario.data.user : null;
    const email = usuario && usuario.email ? usuario.email.toLowerCase() : "";
    if (resultadoUsuario.error || email !== EMAIL_DONA) {
      return json({ erro: "Acesso recusado." }, 403);
    }

    if (!CHAVE_RESEND) {
      return json({ erro: "Falta configurar a chave do Resend (RESEND_API_KEY) nos segredos da funcao." }, 500);
    }

    const corpo = await req.json().catch(() => null);
    if (!corpo) return json({ erro: "Nao entendi os dados enviados." }, 400);

    const destinatarios = Array.isArray(corpo.destinatarios) ? corpo.destinatarios : [];
    const assunto = String(corpo.assunto || "").trim();
    const htmlBase = String(corpo.html || "");
    const pularJaEnviados = corpo.pularJaEnviados !== false;

    if (!assunto) return json({ erro: "Falta o assunto." }, 400);
    if (!htmlBase) return json({ erro: "Falta o texto do e-mail." }, 400);
    if (!destinatarios.length) return json({ erro: "Nenhum destinatario." }, 400);
    if (destinatarios.length > 250) return json({ erro: "No maximo 250 destinatarios por chamada." }, 400);

    const respostaOptout = await sb.from("email_optout").select("email");
    const listaOptout = new Set((respostaOptout.data || []).map((o) => String(o.email).toLowerCase()));

    // Quem ja recebeu (email + assunto final), so olhando os e-mails desta chamada
    const jaEnviados = new Set();
    if (pularJaEnviados) {
      const todosEmails = destinatarios.map((d) => String((d && d.email) || "").trim().toLowerCase()).filter((e) => e);
      for (let i = 0; i < todosEmails.length; i += 100) {
        const respostaAnteriores = await sb.from("email_envios").select("email,assunto").eq("status", "ok").in("email", todosEmails.slice(i, i + 100));
        (respostaAnteriores.data || []).forEach((e) => jaEnviados.add(String(e.email).toLowerCase() + "|" + e.assunto));
      }
    }

    let enviados = 0, falhas = 0, pulados = 0, cotaEsgotada = false;
    const faltando = [];

    for (let i = 0; i < destinatarios.length; i++) {
      const d = destinatarios[i];
      const emailDestino = String((d && d.email) || "").trim().toLowerCase();
      if (!emailDestino) { pulados++; continue; }

      // saudacao: como a pessoa quer ser chamada no {{nome}} (se nao vier, uso o primeiro nome)
      const nome = String((d && d.saudacao) || primeiroNome(d && d.nome));
      const marca = String((d && (d.marca || d.nome)) || "");
      const htmlFinal = trocarVariaveis(htmlBase, nome, marca);
      const assuntoFinal = trocarVariaveis(assunto, nome, marca);

      if (listaOptout.has(emailDestino) || jaEnviados.has(emailDestino + "|" + assuntoFinal)) { pulados++; continue; }

      if (cotaEsgotada) { faltando.push(d); continue; }

      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: "Bearer " + CHAVE_RESEND, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: REMETENTE,
            to: [emailDestino],
            subject: assuntoFinal,
            html: htmlFinal,
            reply_to: EMAIL_CONTATO
          })
        });
        const dadosResposta = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          const codigoErro = String((dadosResposta && (dadosResposta.name || dadosResposta.error)) || "");
          if (codigoErro.indexOf("daily_quota_exceeded") !== -1 || resp.status === 429) {
            cotaEsgotada = true;
            faltando.push(d);
            await sb.from("email_envios").insert({ marca_id: (d && d.id) || null, email: emailDestino, assunto: assuntoFinal, status: "erro", erro: "Cota diaria do Resend esgotada" });
            continue;
          }
          falhas++;
          await sb.from("email_envios").insert({ marca_id: (d && d.id) || null, email: emailDestino, assunto: assuntoFinal, status: "erro", erro: (dadosResposta && dadosResposta.message) || "Erro ao enviar" });
        } else {
          enviados++;
          await sb.from("email_envios").insert({ marca_id: (d && d.id) || null, email: emailDestino, assunto: assuntoFinal, status: "ok", resend_id: (dadosResposta && dadosResposta.id) || null });
          if (d && d.id) await sb.from("marcas").update({ ultimo_envio: new Date().toISOString() }).eq("id", d.id);
        }
      } catch (e) {
        falhas++;
        await sb.from("email_envios").insert({ marca_id: (d && d.id) || null, email: emailDestino, assunto: assuntoFinal, status: "erro", erro: String((e && e.message) || e) });
      }

      if (i < destinatarios.length - 1 && !cotaEsgotada) await espera(200);
    }

    return json({ enviados, falhas, pulados, cotaEsgotada, faltando });
  } catch (e) {
    return json({ erro: "Erro inesperado: " + String((e && e.message) || e) }, 500);
  }
});
