-- =====================================================================
--  disparo.sql   |   Aba PROSPECÇÃO (envio de e-mail para as marcas)
-- =====================================================================
--  ONDE COLAR:
--    1. Entre em https://supabase.com/dashboard e abra o seu projeto.
--    2. No menu da esquerda, clique em "SQL Editor".
--    3. Clique em "New query" (nova consulta).
--    4. Cole este arquivo INTEIRO na caixa grande e clique em "Run".
--    5. Deve aparecer "Success. No rows returned". Pode rodar de novo
--       quando quiser: o arquivo é seguro para repetir, não duplica nada.
--
--  NUNCA cole aqui a chave do Resend. Ela vai só no painel de Secrets
--  da Edge Function (Project Settings > Edge Functions > Secrets),
--  nunca em SQL nem em arquivo do site.
-- =====================================================================

-- 1. Duas colunas novas na tabela de marcas (não apaga nada que já existe)
--    selecionada: marca a dedo quem vai receber no próximo disparo.
--    ultimo_envio: quando foi a última vez que essa marca recebeu um e-mail.
alter table public.marcas add column if not exists selecionada boolean not null default false;
alter table public.marcas add column if not exists ultimo_envio timestamptz;

-- 2. EMAIL_ENVIOS: uma linha para cada e-mail que sai, para você saber
--    exatamente quem recebeu, quem deu erro, e nunca mandar em dobro.
create table if not exists public.email_envios (
  id          uuid primary key default gen_random_uuid(),
  marca_id    uuid references public.marcas(id) on delete set null,
  email       text not null,
  assunto     text not null,
  status      text not null check (status in ('ok', 'erro')),
  erro        text,
  resend_id   text,
  criado_em   timestamptz not null default now()
);
create index if not exists email_envios_email_idx on public.email_envios (email);
create index if not exists email_envios_assunto_idx on public.email_envios (assunto);

-- 3. EMAIL_OPTOUT: quem respondeu SAIR. Um e-mail aqui nunca mais recebe.
create table if not exists public.email_optout (
  email      text primary key,
  criado_em  timestamptz not null default now()
);

-- 4. A tranca (RLS): só você, logada, lê e escreve. Igual ao resto do painel.
--    (a função public.eh_a_nielly() já existe, criada pelo banco.sql)
alter table public.email_envios enable row level security;
alter table public.email_optout enable row level security;

grant select, insert, update, delete on public.email_envios, public.email_optout to authenticated;

drop policy if exists "so_eu_email_envios" on public.email_envios;
create policy "so_eu_email_envios" on public.email_envios
  for all to authenticated
  using (public.eh_a_nielly()) with check (public.eh_a_nielly());

drop policy if exists "so_eu_email_optout" on public.email_optout;
create policy "so_eu_email_optout" on public.email_optout
  for all to authenticated
  using (public.eh_a_nielly()) with check (public.eh_a_nielly());
