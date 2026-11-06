-- =====================================================================
--  banco.sql   |   Painel da Nielly Pinheiro
-- =====================================================================
--  ONDE COLAR:
--    1. Entre em https://supabase.com/dashboard e abra o seu projeto.
--    2. No menu da esquerda, clique em "SQL Editor".
--    3. Clique em "New query" (nova consulta).
--    4. Cole este arquivo INTEIRO na caixa grande e clique em "Run".
--    5. Deve aparecer "Success. No rows returned". Pode rodar de novo
--       quando quiser: o arquivo é seguro para repetir, não duplica nada.
--
--  NUNCA cole aqui a chave secreta (service_role). Este arquivo não
--  precisa dela, e ela não deve ficar em lugar nenhum do site.
-- =====================================================================


-- =====================================================================
-- BLOCO 1: quem é a dona do painel
-- Esta função responde "sim" só quando quem está logado é o seu e-mail.
-- Todas as travas abaixo usam ela. Mesmo que alguém crie uma conta no
-- seu projeto, essa pessoa não consegue ver nem mexer em nada seu.
-- =====================================================================
create or replace function public.eh_a_nielly()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'niellypinheirougccreator@gmail.com'
$$;


-- =====================================================================
-- BLOCO 2: as tabelas
-- =====================================================================

-- 2.1 VIDEOS: o que aparece no seu portfólio.
--   nicho:    casa, gastronomia, tech, beleza ou moda
--   formato:  video (vertical 9:16) ou foto (retrato 4:5)
--   destaque: texto curto com o resultado, por exemplo "2,4M views"
--   ordem:    quanto menor, mais para o começo do nicho
--   visivel:  se está desligado, o vídeo some do site (o olhinho do painel)
create table if not exists public.videos (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  link       text not null,
  nicho      text not null,
  formato    text not null default 'video' check (formato in ('video', 'foto')),
  marca      text,
  destaque   text,
  ordem      integer not null default 0,
  visivel    boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- 2.2 MARCAS: a sua base de contatos de empresa.
--   Os contatos que chegam pelo formulário do site entram como "lead".
create table if not exists public.marcas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (char_length(nome) between 1 and 200),
  instagram      text check (char_length(instagram) <= 100),
  email          text check (char_length(email) <= 200),
  telefone       text check (char_length(telefone) <= 40),
  situacao       text not null default 'lead'
                 check (situacao in ('lead', 'conversando', 'cliente', 'parada', 'email_enviado')),
  nicho          text check (nicho is null or nicho in ('casa', 'gastronomia', 'tech', 'cabelo', 'bodycare', 'entretenimento', 'moda')),
  obs            text check (char_length(obs) <= 3000),
  ultimo_contato date,
  criado_em      timestamptz not null default now()
);
-- Se a tabela já existia de antes, isto acrescenta o campo do nicho (não apaga nada)
alter table public.marcas add column if not exists nicho text;

-- Se a tabela já existia de antes com a lista antiga de situação, isto troca a trava
-- pela lista nova, que agora também aceita "email_enviado" (não apaga nenhuma marca)
alter table public.marcas drop constraint if exists marcas_situacao_check;
alter table public.marcas add constraint marcas_situacao_check
  check (situacao in ('lead', 'conversando', 'cliente', 'parada', 'email_enviado'));

-- 2.3 CALENDARIO: o que você precisa gravar, editar ou postar.
create table if not exists public.calendario (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  marca      text,
  tipo       text not null default 'gravar' check (tipo in ('gravar', 'editar', 'postar')),
  data       date not null,
  status     text not null default 'a fazer' check (status in ('a fazer', 'feito')),
  criado_em  timestamptz not null default now()
);

-- 2.4 CAMPANHAS: os trabalhos que você faz para as marcas.
--   qtd:   quantos vídeos a campanha tem
--   valor: quanto você recebe pela campanha inteira, em reais
create table if not exists public.campanhas (
  id         uuid primary key default gen_random_uuid(),
  campanha   text not null,
  cliente    text,
  tipo       text not null default 'Conteúdo' check (tipo in ('Conteúdo', 'Publicidade')),
  status     text not null default 'Briefing'
             check (status in ('Briefing', 'Roteiro', 'Aprovação Roteiro', 'Gravação', 'Edição', 'Aprovado', 'Entregue')),
  qtd        integer not null default 1 check (qtd >= 0),
  valor      numeric(12, 2) not null default 0 check (valor >= 0),
  prazo      date,
  pagamento  text not null default 'pendente' check (pagamento in ('pendente', 'pago')),
  ativa      boolean not null default true,
  favorita   boolean not null default false,
  criado_em  timestamptz not null default now()
);

-- 2.5 MARCADOS: o que você já marcou nos checklists.
--   A "chave" é um texto que identifica o item marcado.
create table if not exists public.marcados (
  chave          text primary key,
  marcado        boolean not null default true,
  atualizado_em  timestamptz not null default now()
);

-- 2.6 VISITAS: uma linha para cada pessoa que abre o portfólio.
--   Não guarda nome, nem IP, nem nada que identifique o visitante.
create table if not exists public.visitas (
  id      uuid primary key default gen_random_uuid(),
  data    timestamptz not null default now(),
  pagina  text not null default '/' check (char_length(pagina) <= 200),
  origem  text not null default 'direto' check (char_length(origem) <= 100)
);
create index if not exists visitas_data_idx on public.visitas (data desc);


-- =====================================================================
-- BLOCO 3: carimbos automáticos
-- Quem vem de fora (visitante do site) não pode escolher a data do
-- registro, então o banco carimba sozinho a hora certa.
-- =====================================================================
create or replace function public.carimbar_agora()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'visitas' then
    new.data := now();
  else
    new.criado_em := now();
  end if;
  return new;
end
$$;

drop trigger if exists carimbo_visitas on public.visitas;
create trigger carimbo_visitas before insert on public.visitas
  for each row execute function public.carimbar_agora();

drop trigger if exists carimbo_marcas on public.marcas;
create trigger carimbo_marcas before insert on public.marcas
  for each row execute function public.carimbar_agora();


-- =====================================================================
-- BLOCO 4: A TRANCA (RLS, Row Level Security)
-- Ligada em TODAS as tabelas. Com ela ligada e sem regra escrevendo o
-- contrário, ninguém consegue ler nem escrever nada.
-- =====================================================================
alter table public.videos     enable row level security;
alter table public.marcas     enable row level security;
alter table public.calendario enable row level security;
alter table public.campanhas  enable row level security;
alter table public.marcados   enable row level security;
alter table public.visitas    enable row level security;


-- =====================================================================
-- BLOCO 5: permissão de acesso às tabelas
-- Isto só "abre a porta da rua". Quem decide quem entra de verdade são
-- as regras do bloco 6. Sem regra, a tranca do bloco 4 continua fechada.
-- =====================================================================
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.videos, public.marcas, public.calendario,
  public.campanhas, public.marcados, public.visitas
  to authenticated;

grant select on public.videos to anon;            -- só as linhas visíveis, ver bloco 6
grant insert on public.marcas, public.visitas to anon;


-- =====================================================================
-- BLOCO 6: AS REGRAS (policies)
-- =====================================================================

-- 6.1 REGRA DA DONA: só o seu usuário logado lê e escreve em tudo.
drop policy if exists "so_eu_videos"     on public.videos;
drop policy if exists "so_eu_marcas"     on public.marcas;
drop policy if exists "so_eu_calendario" on public.calendario;
drop policy if exists "so_eu_campanhas"  on public.campanhas;
drop policy if exists "so_eu_marcados"   on public.marcados;
drop policy if exists "so_eu_visitas"    on public.visitas;

create policy "so_eu_videos" on public.videos
  for all to authenticated
  using (public.eh_a_nielly()) with check (public.eh_a_nielly());

create policy "so_eu_marcas" on public.marcas
  for all to authenticated
  using (public.eh_a_nielly()) with check (public.eh_a_nielly());

create policy "so_eu_calendario" on public.calendario
  for all to authenticated
  using (public.eh_a_nielly()) with check (public.eh_a_nielly());

create policy "so_eu_campanhas" on public.campanhas
  for all to authenticated
  using (public.eh_a_nielly()) with check (public.eh_a_nielly());

create policy "so_eu_marcados" on public.marcados
  for all to authenticated
  using (public.eh_a_nielly()) with check (public.eh_a_nielly());

create policy "so_eu_visitas" on public.visitas
  for all to authenticated
  using (public.eh_a_nielly()) with check (public.eh_a_nielly());

-- 6.2 EXCEÇÃO 1: o formulário do site pode CRIAR um contato em "marcas",
--     mas só como "lead". Não dá para ler, editar nem apagar.
drop policy if exists "site_cria_lead" on public.marcas;
create policy "site_cria_lead" on public.marcas
  for insert to anon, authenticated
  with check (situacao = 'lead');

-- 6.3 EXCEÇÃO 2: qualquer visitante pode REGISTRAR uma visita.
--     Não dá para ler as visitas. Só você lê.
drop policy if exists "site_registra_visita" on public.visitas;
create policy "site_registra_visita" on public.visitas
  for insert to anon, authenticated
  with check (true);

-- 6.4 EXCEÇÃO 3 (necessária para o portfólio funcionar): o site precisa
--     LER os vídeos que estão marcados como visíveis. Vídeo escondido
--     (olhinho fechado) continua invisível para o público.
--     Estes dados já são públicos: são os vídeos do seu portfólio.
drop policy if exists "publico_le_videos_visiveis" on public.videos;
create policy "publico_le_videos_visiveis" on public.videos
  for select to anon, authenticated
  using (visivel = true);


-- =====================================================================
-- BLOCO 7: OS 4 VÍDEOS QUE JÁ ESTÃO NO SEU SITE
-- São os vídeos reais da COZA e da AZULIM que já estavam no portfólio.
-- Eles entram no banco para o site continuar mostrando eles depois que
-- passar a ler daqui. Se rodar de novo, não duplica.
-- Para não importar, apague este bloco inteiro antes de rodar.
-- =====================================================================
insert into public.videos (titulo, link, nicho, formato, marca, ordem, visivel)
select v.titulo, v.link, v.nicho, v.formato, v.marca, v.ordem, true
from (values
  ('Vídeo 1', 'https://youtube.com/shorts/ur--DEw5fKM', 'casa', 'video', 'COZA',   10),
  ('Vídeo 1', 'https://youtube.com/shorts/99RwFWFInB4', 'casa', 'video', 'AZULIM', 20),
  ('Vídeo 2', 'https://youtube.com/shorts/I9iv1-c6LiQ', 'casa', 'video', 'AZULIM', 30),
  ('Vídeo 2', 'https://youtube.com/shorts/1wOeEn8UA34', 'casa', 'video', 'COZA',   40)
) as v(titulo, link, nicho, formato, marca, ordem)
where not exists (select 1 from public.videos x where x.link = v.link);


-- =====================================================================
-- BLOCO 7B: TRANSCRIÇÕES (a aba "Transcrições" do painel)
-- Guarda os vídeos que você gosta (YouTube, Instagram, TikTok...): o link,
-- a transcrição (o roteiro) e as suas observações. Só você lê e escreve.
-- =====================================================================
create table if not exists public.transcricoes (
  id             uuid primary key default gen_random_uuid(),
  titulo         text,
  link           text not null,
  plataforma     text not null default 'outro' check (plataforma in ('youtube', 'instagram', 'tiktok', 'outro')),
  transcricao    text,
  observacoes    text,
  analise        text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
-- Se a tabela já existia de antes, isto acrescenta o campo da análise do vídeo (não apaga nada)
alter table public.transcricoes add column if not exists analise text;
alter table public.transcricoes enable row level security;
grant select, insert, update, delete on public.transcricoes to authenticated;
drop policy if exists "so_eu_transcricoes" on public.transcricoes;
create policy "so_eu_transcricoes" on public.transcricoes
  for all to authenticated
  using (public.eh_a_nielly()) with check (public.eh_a_nielly());

-- =====================================================================
-- BLOCO 7C: CONFIGURAÇÕES (guarda a chave do serviço de transcrição)
-- A aba "Transcrições" usa um serviço externo (Supadata) para transcrever
-- os vídeos dentro do painel. A chave dele fica AQUI, numa tabela que só
-- você lê (nenhuma regra libera para visitantes) e nunca em arquivo do site.
-- =====================================================================
create table if not exists public.configuracoes (
  chave          text primary key,
  valor          text,
  atualizado_em  timestamptz not null default now()
);
alter table public.configuracoes enable row level security;
grant select, insert, update, delete on public.configuracoes to authenticated;
drop policy if exists "so_eu_configuracoes" on public.configuracoes;
create policy "so_eu_configuracoes" on public.configuracoes
  for all to authenticated
  using (public.eh_a_nielly()) with check (public.eh_a_nielly());

-- =====================================================================
-- BLOCO 8: SMARTBRAND TECNOLOGIA (empresas de serviços)
--   Uma aba separada do seu portfólio, para captar empresas interessadas
--   nos produtos e serviços da sua loja física (a SmartBrand Tecnologia).
--   Só você e o e-mail smartbrand1217@gmail.com (seu marido) enxergam
--   esta tabela. O resto do painel (Portfólio, Marcas etc.) continua
--   só seu: esta trava nova não muda nenhuma das outras.
-- =====================================================================
create or replace function public.eh_da_smartbrand()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'niellypinheirougccreator@gmail.com',
    'smartbrand1217@gmail.com'
  )
$$;

create table if not exists public.empresas_servicos (
  id             uuid primary key default gen_random_uuid(),
  nome_empresa   text not null check (char_length(nome_empresa) between 1 and 200),
  cnpj           text check (char_length(cnpj) <= 20),
  contato        text check (char_length(contato) <= 200),
  email          text check (char_length(email) <= 200),
  telefone       text check (char_length(telefone) <= 40),
  situacao       text not null default 'lead'
                 check (situacao in ('lead', 'email_enviado', 'conversando', 'cliente', 'parada')),
  interesse      text check (char_length(interesse) <= 200),
  obs            text check (char_length(obs) <= 3000),
  ultimo_contato date,
  criado_em      timestamptz not null default now()
);

alter table public.empresas_servicos enable row level security;
grant select, insert, update, delete on public.empresas_servicos to authenticated;

drop policy if exists "so_smartbrand_empresas_servicos" on public.empresas_servicos;
create policy "so_smartbrand_empresas_servicos" on public.empresas_servicos
  for all to authenticated
  using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());

-- As mesmas duas colunas que a aba Marcas tem, para marcar quem vai receber
-- o próximo e-mail e guardar quando recebeu o último.
alter table public.empresas_servicos add column if not exists selecionada boolean not null default false;
alter table public.empresas_servicos add column if not exists ultimo_envio timestamptz;

-- EMPRESAS_ENVIOS e EMPRESAS_OPTOUT: o mesmo registro de envios e de quem
-- pediu para sair, só que separado do seu (o da SmartBrand não se mistura
-- com o "email_envios"/"email_optout" da sua Prospecção pessoal).
create table if not exists public.empresas_envios (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references public.empresas_servicos(id) on delete set null,
  email       text not null,
  assunto     text not null,
  status      text not null check (status in ('ok', 'erro')),
  erro        text,
  resend_id   text,
  criado_em   timestamptz not null default now()
);
create index if not exists empresas_envios_email_idx on public.empresas_envios (email);
create index if not exists empresas_envios_assunto_idx on public.empresas_envios (assunto);

create table if not exists public.empresas_optout (
  email      text primary key,
  criado_em  timestamptz not null default now()
);

alter table public.empresas_envios enable row level security;
alter table public.empresas_optout enable row level security;
grant select, insert, update, delete on public.empresas_envios, public.empresas_optout to authenticated;

drop policy if exists "so_smartbrand_empresas_envios" on public.empresas_envios;
create policy "so_smartbrand_empresas_envios" on public.empresas_envios
  for all to authenticated
  using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());

drop policy if exists "so_smartbrand_empresas_optout" on public.empresas_optout;
create policy "so_smartbrand_empresas_optout" on public.empresas_optout
  for all to authenticated
  using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());

-- =====================================================================
-- BLOCO 8B: CATÁLOGO DA SMARTBRAND
--   catalogo_produtos: os produtos e serviços que aparecem no catálogo
--     público (sem preço). O visitante só LÊ os que estão visíveis.
--   catalogo_pedidos: os pré-pedidos de orçamento enviados pelo catálogo.
--     O visitante só CRIA um pedido (sempre como "novo"); quem lê e mexe
--     são só os dois e-mails da SmartBrand.
--   Fotos: guardadas no bucket público "catalogo" do Storage.
-- =====================================================================
create table if not exists public.catalogo_produtos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (char_length(nome) between 1 and 200),
  marca      text check (char_length(marca) <= 100),
  categoria  text check (char_length(categoria) <= 100),
  descricao  text check (char_length(descricao) <= 3000),
  imagem     text check (char_length(imagem) <= 500),
  ordem      integer not null default 0,
  visivel    boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.catalogo_pedidos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (char_length(nome) between 1 and 200),
  empresa    text check (char_length(empresa) <= 200),
  email      text check (char_length(email) <= 200),
  telefone   text check (char_length(telefone) <= 40),
  observacao text check (char_length(observacao) <= 3000),
  itens      jsonb not null check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) between 1 and 60),
  status     text not null default 'novo' check (status in ('novo', 'em_orcamento', 'fechado', 'perdido')),
  criado_em  timestamptz not null default now()
);

-- Colunas que vieram depois (catalogo_extra.sql):
--   departamento: o grupo grande (Eletroportáteis, Iluminação...), vira filtro no catálogo sozinho.
--   avisado_em: quando saiu o e-mail de aviso do pedido para a SmartBrand.
alter table public.catalogo_produtos add column if not exists departamento text check (char_length(departamento) <= 100);
alter table public.catalogo_pedidos add column if not exists avisado_em timestamptz;
--   endereco: onde fica a empresa (para visitas presenciais), na aba Empresas de Serviços.
alter table public.empresas_servicos add column if not exists endereco text check (char_length(endereco) <= 300);

drop trigger if exists carimbo_catalogo_pedidos on public.catalogo_pedidos;
create trigger carimbo_catalogo_pedidos before insert on public.catalogo_pedidos
  for each row execute function public.carimbar_agora();

alter table public.catalogo_produtos enable row level security;
alter table public.catalogo_pedidos  enable row level security;

grant select on public.catalogo_produtos to anon;
grant select, insert, update, delete on public.catalogo_produtos to authenticated;
grant insert on public.catalogo_pedidos to anon;
grant select, insert, update, delete on public.catalogo_pedidos to authenticated;

drop policy if exists "publico_le_catalogo" on public.catalogo_produtos;
create policy "publico_le_catalogo" on public.catalogo_produtos
  for select to anon, authenticated
  using (visivel = true);

drop policy if exists "so_smartbrand_catalogo" on public.catalogo_produtos;
create policy "so_smartbrand_catalogo" on public.catalogo_produtos
  for all to authenticated
  using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());

drop policy if exists "site_cria_pedido" on public.catalogo_pedidos;
create policy "site_cria_pedido" on public.catalogo_pedidos
  for insert to anon, authenticated
  with check (status = 'novo');

drop policy if exists "so_smartbrand_pedidos" on public.catalogo_pedidos;
create policy "so_smartbrand_pedidos" on public.catalogo_pedidos
  for all to authenticated
  using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());

-- Cada pré-pedido vira (ou atualiza) uma empresa na aba "Empresas de Serviços",
-- como Lead, para a SmartBrand mandar e-mails depois pela Prospecção.
create or replace function public.pedido_vira_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e text := lower(trim(coalesce(new.email, '')));
  resumo text;
begin
  if e = '' then return new; end if;
  select string_agg((i ->> 'quantidade') || 'x ' || (i ->> 'nome'), ', ') into resumo
    from jsonb_array_elements(new.itens) as i;
  if exists (select 1 from public.empresas_servicos where lower(email) = e) then
    update public.empresas_servicos set ultimo_contato = current_date where lower(email) = e;
  else
    insert into public.empresas_servicos (nome_empresa, contato, email, telefone, situacao, interesse, obs, ultimo_contato)
    values (left(coalesce(nullif(trim(new.empresa), ''), new.nome), 200), left(new.nome, 200), left(trim(new.email), 200),
            left(new.telefone, 40), 'lead', left(resumo, 200), left('Pré-pedido pelo catálogo: ' || resumo, 3000), current_date);
  end if;
  return new;
end
$$;

drop trigger if exists pedido_para_empresas on public.catalogo_pedidos;
create trigger pedido_para_empresas after insert on public.catalogo_pedidos
  for each row execute function public.pedido_vira_empresa();

-- Cada pré-pedido também chama a função "avisar-pedido", que manda um e-mail
-- para smartbrand1217@gmail.com. Se o aviso falhar, o pedido entra igual.
create extension if not exists pg_net;

create or replace function public.pedido_avisa_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url := 'https://pirfpsdiaajbnriqszvd.supabase.co/functions/v1/avisar-pedido',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;
  return new;
end
$$;

drop trigger if exists pedido_avisa_email on public.catalogo_pedidos;
create trigger pedido_avisa_email after insert on public.catalogo_pedidos
  for each row execute function public.pedido_avisa_email();

insert into storage.buckets (id, name, public)
values ('catalogo', 'catalogo', true)
on conflict (id) do nothing;

drop policy if exists "catalogo_smartbrand_fotos" on storage.objects;
create policy "catalogo_smartbrand_fotos" on storage.objects
  for all to authenticated
  using (bucket_id = 'catalogo' and public.eh_da_smartbrand())
  with check (bucket_id = 'catalogo' and public.eh_da_smartbrand());

-- =====================================================================
-- BLOCO 8C: INSTAGRAM (aba "Instagram" do painel)
--   Os dados vêm da API oficial do Instagram, buscados pela função
--   "instagram-sync" (o token fica só como segredo no Supabase).
--   A função grava aqui; só você (Nielly) lê. Ninguém mais enxerga.
-- =====================================================================
create table if not exists public.instagram_posts (
  id                 text primary key,
  legenda            text,
  tipo               text,
  formato            text,
  permalink          text,
  miniatura          text,
  publicado_em       timestamptz,
  curtidas           integer not null default 0,
  comentarios        integer not null default 0,
  alcance            integer,
  visualizacoes      integer,
  salvos             integer,
  compartilhamentos  integer,
  interacoes         integer,
  atualizado_em      timestamptz not null default now()
);
create index if not exists instagram_posts_data_idx on public.instagram_posts (publicado_em desc);

create table if not exists public.instagram_comentarios (
  id            text primary key,
  post_id       text not null references public.instagram_posts(id) on delete cascade,
  usuario       text,
  texto         text,
  curtidas      integer not null default 0,
  publicado_em  timestamptz
);
create index if not exists instagram_comentarios_usuario_idx on public.instagram_comentarios (usuario);
create index if not exists instagram_comentarios_post_idx on public.instagram_comentarios (post_id);

create table if not exists public.instagram_dias (
  dia                   date primary key,
  usuario               text,
  seguidores            integer,
  seguindo              integer,
  midias                integer,
  alcance_30d           integer,
  visitas_perfil_30d    integer,
  contas_engajadas_30d  integer,
  demografia            jsonb,
  criado_em             timestamptz not null default now()
);

alter table public.instagram_posts       enable row level security;
alter table public.instagram_comentarios enable row level security;
alter table public.instagram_dias        enable row level security;
grant select on public.instagram_posts, public.instagram_comentarios, public.instagram_dias to authenticated;

drop policy if exists "so_eu_instagram_posts" on public.instagram_posts;
create policy "so_eu_instagram_posts" on public.instagram_posts
  for all to authenticated using (public.eh_a_nielly()) with check (public.eh_a_nielly());
drop policy if exists "so_eu_instagram_comentarios" on public.instagram_comentarios;
create policy "so_eu_instagram_comentarios" on public.instagram_comentarios
  for all to authenticated using (public.eh_a_nielly()) with check (public.eh_a_nielly());
drop policy if exists "so_eu_instagram_dias" on public.instagram_dias;
create policy "so_eu_instagram_dias" on public.instagram_dias
  for all to authenticated using (public.eh_a_nielly()) with check (public.eh_a_nielly());

-- =====================================================================
-- BLOCO 9 (OPCIONAL): TESTE DA TRANCA
-- Não precisa colar junto com o resto. Depois que tudo estiver rodado,
-- cole SÓ este bloco, tire os dois traços "--" do começo de cada linha
-- e clique em Run. Ele finge ser um visitante qualquer, sem login.
--
--   begin;
--   set local role anon;
--   select 'marcas' as tabela, count(*) as linhas_que_o_visitante_ve from public.marcas
--   union all select 'campanhas', count(*) from public.campanhas
--   union all select 'calendario', count(*) from public.calendario
--   union all select 'marcados', count(*) from public.marcados
--   union all select 'visitas', count(*) from public.visitas
--   union all select 'transcricoes', count(*) from public.transcricoes
--   union all select 'configuracoes', count(*) from public.configuracoes
--   union all select 'empresas_servicos', count(*) from public.empresas_servicos
--   union all select 'videos escondidos', count(*) from public.videos where visivel = false;
--   rollback;
--
-- RESULTADO CERTO: todas as linhas da resposta com o número 0.
-- (Mesmo que você já tenha marcas e campanhas guardadas: o visitante
--  enxerga zero. Se aparecer número maior que zero, a tranca falhou,
--  me chame antes de usar o painel.)
-- =====================================================================


-- =====================================================================
-- BLOCO 10: FINANCEIRO DA SMARTBRAND (notas fiscais, contas, estoque, DRE, caixa)
-- =====================================================================
-- =====================================================================
-- FINANCEIRO DA SMARTBRAND: notas fiscais (XML), contas a pagar e a receber,
-- estoque estimado, DRE, fluxo de caixa, metas.
-- Cole este bloco inteiro no SQL Editor do projeto "niellypinheiro portfólio"
-- e clique em Run. Pode rodar de novo sem problema (não duplica nada).
-- Só você e o e-mail da SmartBrand enxergam estas tabelas
-- (a mesma trava das abas Empresas de Serviços e Catálogo).
-- =====================================================================

-- Notas fiscais importadas dos XML (uma linha por nota)
create table if not exists public.fin_notas (
  id                 uuid primary key default gen_random_uuid(),
  chave              text not null unique check (char_length(chave) between 10 and 60),
  tipo               text not null check (tipo in ('entrada', 'saida')),
  modelo             text,
  numero             text,
  serie              text,
  data_emissao       date not null,
  natureza           text,
  devolucao          boolean not null default false,
  emitente_nome      text,
  emitente_doc       text,
  destinatario_nome  text,
  destinatario_doc   text,
  valor_produtos     numeric(14,2) not null default 0,
  valor_frete        numeric(14,2) not null default 0,
  valor_desconto     numeric(14,2) not null default 0,
  valor_outros       numeric(14,2) not null default 0,
  valor_total        numeric(14,2) not null default 0,
  valor_icms         numeric(14,2) not null default 0,
  valor_pis          numeric(14,2) not null default 0,
  valor_cofins       numeric(14,2) not null default 0,
  valor_ipi          numeric(14,2) not null default 0,
  valor_tributos     numeric(14,2) not null default 0,
  forma_pagamento    text,
  status             text not null default 'autorizada' check (status in ('autorizada', 'cancelada', 'denegada', 'rejeitada')),
  conferida          boolean not null default false,
  obs                text check (char_length(obs) <= 1000),
  criado_em          timestamptz not null default now()
);
-- De qual das suas empresas é a nota (a loja ou a outra empresa que emite as vendas)
alter table public.fin_notas add column if not exists empresa_doc text;
create index if not exists fin_notas_data_idx on public.fin_notas (data_emissao desc);

-- Itens de cada nota (produtos), usados no estoque e nas margens
create table if not exists public.fin_nota_itens (
  id              uuid primary key default gen_random_uuid(),
  nota_id         uuid not null references public.fin_notas(id) on delete cascade,
  tipo            text not null check (tipo in ('entrada', 'saida')),
  devolucao       boolean not null default false,
  data_emissao    date not null,
  codigo          text,
  ean             text,
  descricao       text not null,
  ncm             text,
  cfop            text,
  unidade         text,
  quantidade      numeric(14,4) not null default 0,
  valor_unitario  numeric(14,4) not null default 0,
  valor_total     numeric(14,2) not null default 0,
  desconto        numeric(14,2) not null default 0
);
create index if not exists fin_nota_itens_nota_idx on public.fin_nota_itens (nota_id);

-- Contas a pagar e a receber (e despesas lançadas à mão)
create table if not exists public.fin_lancamentos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('pagar', 'receber')),
  descricao   text not null check (char_length(descricao) between 1 and 200),
  pessoa      text check (char_length(pessoa) <= 200),
  categoria   text check (char_length(categoria) <= 80),
  valor       numeric(14,2) not null check (valor >= 0),
  vencimento  date not null,
  pagamento   date,
  forma       text check (char_length(forma) <= 40),
  conta       text check (char_length(conta) <= 80),
  obs         text check (char_length(obs) <= 1000),
  criado_em   timestamptz not null default now()
);
create index if not exists fin_lancamentos_venc_idx on public.fin_lancamentos (vencimento);

-- Configurações do financeiro (CNPJ da empresa, saldo inicial, regime, metas)
create table if not exists public.fin_config (
  chave  text primary key check (char_length(chave) <= 60),
  valor  text check (char_length(valor) <= 4000)
);

alter table public.fin_notas       enable row level security;
alter table public.fin_nota_itens  enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_config      enable row level security;
grant select, insert, update, delete on public.fin_notas, public.fin_nota_itens, public.fin_lancamentos, public.fin_config to authenticated;

drop policy if exists "so_smartbrand_fin_notas" on public.fin_notas;
create policy "so_smartbrand_fin_notas" on public.fin_notas
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());
drop policy if exists "so_smartbrand_fin_nota_itens" on public.fin_nota_itens;
create policy "so_smartbrand_fin_nota_itens" on public.fin_nota_itens
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());
drop policy if exists "so_smartbrand_fin_lancamentos" on public.fin_lancamentos;
create policy "so_smartbrand_fin_lancamentos" on public.fin_lancamentos
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());
drop policy if exists "so_smartbrand_fin_config" on public.fin_config;
create policy "so_smartbrand_fin_config" on public.fin_config
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());


-- =====================================================================
-- BLOCO 11: AUTOMACAO DO INSTAGRAM (palavra-chave no comentario, link na DM)
-- =====================================================================
-- =====================================================================
-- AUTOMAÇÃO DO INSTAGRAM: comentou a palavra-chave, recebe o link na DM
-- Cole este bloco inteiro no SQL Editor do projeto "niellypinheiro portfólio"
-- e clique em Run. Pode rodar de novo sem problema (não duplica nada).
-- =====================================================================

-- As automações que você cadastra no painel (uma por palavra-chave)
create table if not exists public.instagram_automacoes (
  id                        uuid primary key default gen_random_uuid(),
  palavra                   text not null check (char_length(palavra) between 1 and 60),
  link                      text not null check (char_length(link) between 1 and 600),
  mensagem                  text check (char_length(mensagem) <= 800),
  resposta_comentario       text check (char_length(resposta_comentario) <= 300),
  responder_no_comentario   boolean not null default true,
  link_no_comentario_se_dm_falhar boolean not null default false,
  ativo                     boolean not null default true,
  criado_em                 timestamptz not null default now()
);

-- O registro de cada resposta automática (quem comentou, o que foi enviado, se deu erro)
create table if not exists public.instagram_automacoes_log (
  id             uuid primary key default gen_random_uuid(),
  comentario_id  text not null,
  post_id        text,
  autor_id       text,
  usuario        text,
  automacao_id   uuid references public.instagram_automacoes(id) on delete set null,
  palavra        text,
  dm_status      text,
  comentario_status text,
  erro           text,
  criado_em      timestamptz not null default now()
);

-- Trava: o mesmo comentário nunca é respondido duas vezes (a Meta às vezes avisa de novo),
-- e a mesma pessoa não recebe a mesma automação duas vezes no mesmo post.
create unique index if not exists instagram_automacoes_log_comentario_idx on public.instagram_automacoes_log (comentario_id);
create unique index if not exists instagram_automacoes_log_pessoa_idx
  on public.instagram_automacoes_log (post_id, autor_id, automacao_id) where autor_id is not null and automacao_id is not null;
create index if not exists instagram_automacoes_log_data_idx on public.instagram_automacoes_log (criado_em desc);

alter table public.instagram_automacoes     enable row level security;
alter table public.instagram_automacoes_log enable row level security;
grant select, insert, update, delete on public.instagram_automacoes to authenticated;
grant select, delete on public.instagram_automacoes_log to authenticated;

drop policy if exists "so_eu_instagram_automacoes" on public.instagram_automacoes;
create policy "so_eu_instagram_automacoes" on public.instagram_automacoes
  for all to authenticated using (public.eh_a_nielly()) with check (public.eh_a_nielly());
drop policy if exists "so_eu_instagram_automacoes_log" on public.instagram_automacoes_log;
create policy "so_eu_instagram_automacoes_log" on public.instagram_automacoes_log
  for all to authenticated using (public.eh_a_nielly()) with check (public.eh_a_nielly());



-- =====================================================================
-- BLOCO 12: FINANCEIRO, VENDAS DO MERCADO LIVRE
-- =====================================================================
-- =========================================================================
-- FINANCEIRO: vendas do Mercado Livre (importadas da planilha de vendas)
-- Rode no SQL Editor do projeto "niellypinheiro portfólio". Pode rodar mais de uma vez.
-- Depende de public.eh_da_smartbrand() (criada no banco.sql).
-- =========================================================================

create table if not exists public.fin_vendas_ml (
  id                uuid primary key default gen_random_uuid(),
  chave             text not null unique check (char_length(chave) <= 240),
  numero_venda      text not null check (char_length(numero_venda) <= 80),
  data_venda        date,
  status            text check (char_length(status) <= 160),
  status_desc       text check (char_length(status_desc) <= 300),
  unidades          integer,
  receita_produtos  numeric(14,2) not null default 0,
  receita_envio     numeric(14,2) not null default 0,
  tarifa_venda      numeric(14,2) not null default 0,
  tarifa_envio      numeric(14,2) not null default 0,
  cancelamentos     numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  sku               text check (char_length(sku) <= 120),
  anuncio           text check (char_length(anuncio) <= 80),
  titulo            text check (char_length(titulo) <= 300),
  preco_unitario    numeric(14,2),
  tipo_anuncio      text check (char_length(tipo_anuncio) <= 80),
  comprador         text check (char_length(comprador) <= 200),
  cidade            text check (char_length(cidade) <= 120),
  uf                text check (char_length(uf) <= 60),
  forma_entrega     text check (char_length(forma_entrega) <= 160),
  dados             jsonb,
  criado_em         timestamptz not null default now()
);
create index if not exists fin_vendas_ml_data_idx on public.fin_vendas_ml (data_venda);

alter table public.fin_vendas_ml enable row level security;
grant select, insert, update, delete on public.fin_vendas_ml to authenticated;
drop policy if exists "so_smartbrand_fin_vendas_ml" on public.fin_vendas_ml;
create policy "so_smartbrand_fin_vendas_ml" on public.fin_vendas_ml
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());


-- =====================================================================
-- BLOCO 13: FINANCEIRO, RELATORIO DE VENDAS DA LOJA
-- =====================================================================
-- =========================================================================
-- FINANCEIRO: relatório de vendas da loja (por produto, de um período)
-- Rode no SQL Editor do projeto "niellypinheiro portfólio". Pode rodar mais de uma vez.
-- Depende de public.eh_da_smartbrand() (criada no banco.sql).
-- =========================================================================

create table if not exists public.fin_vendas_loja (
  id           uuid primary key default gen_random_uuid(),
  chave        text not null unique check (char_length(chave) <= 400),
  periodo_ini  date not null,
  periodo_fim  date not null,
  produto      text not null check (char_length(produto) between 1 and 300),
  sku          text check (char_length(sku) <= 120),
  quantidade   numeric(14,3) not null default 0,
  valor        numeric(14,2) not null default 0,
  frete        numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  arquivo      text check (char_length(arquivo) <= 200),
  criado_em    timestamptz not null default now(),
  check (periodo_fim >= periodo_ini)
);
create index if not exists fin_vendas_loja_periodo_idx on public.fin_vendas_loja (periodo_ini, periodo_fim);

alter table public.fin_vendas_loja enable row level security;
grant select, insert, update, delete on public.fin_vendas_loja to authenticated;
drop policy if exists "so_smartbrand_fin_vendas_loja" on public.fin_vendas_loja;
create policy "so_smartbrand_fin_vendas_loja" on public.fin_vendas_loja
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());


-- =====================================================================
-- BLOCO 14: FINANCEIRO, FRETES (CT-e)
-- =====================================================================
-- =========================================================================
-- FINANCEIRO: fretes (CT-e, conhecimento de transporte eletrônico)
-- Rode no SQL Editor do projeto "niellypinheiro portfólio". Pode rodar mais de uma vez.
-- Depende de public.eh_da_smartbrand() (criada no banco.sql).
-- =========================================================================

create table if not exists public.fin_cte (
  id              uuid primary key default gen_random_uuid(),
  chave           text not null unique check (char_length(chave) = 44),
  numero          text check (char_length(numero) <= 20),
  serie           text check (char_length(serie) <= 10),
  data_emissao    date not null,
  status          text not null default 'autorizado' check (status in ('autorizado', 'cancelado', 'rejeitado')),
  emitente_nome   text check (char_length(emitente_nome) <= 200),
  emitente_doc    text check (char_length(emitente_doc) <= 20),
  tomador_nome    text check (char_length(tomador_nome) <= 200),
  tomador_doc     text check (char_length(tomador_doc) <= 20),
  remetente_nome  text check (char_length(remetente_nome) <= 200),
  remetente_doc   text check (char_length(remetente_doc) <= 20),
  destino         text check (char_length(destino) <= 120),
  valor           numeric(14,2) not null default 0,
  valor_icms      numeric(14,2) not null default 0,
  nfe_chave       text check (char_length(nfe_chave) <= 44),
  nfe_numero      text check (char_length(nfe_numero) <= 20),
  tipo_operacao   text check (char_length(tipo_operacao) <= 60),
  origem          text not null default 'xml' check (origem in ('xml', 'planilha')),
  empresa_doc     text check (char_length(empresa_doc) <= 20),
  arquivo         text check (char_length(arquivo) <= 200),
  criado_em       timestamptz not null default now()
);
create index if not exists fin_cte_data_idx on public.fin_cte (data_emissao);
create index if not exists fin_cte_nfe_idx on public.fin_cte (nfe_chave);

alter table public.fin_cte enable row level security;
grant select, insert, update, delete on public.fin_cte to authenticated;
drop policy if exists "so_smartbrand_fin_cte" on public.fin_cte;
create policy "so_smartbrand_fin_cte" on public.fin_cte
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());


-- =====================================================================
-- BLOCO 15: FINANCEIRO, CANAL DE VENDA DAS NOTAS
-- =====================================================================
-- =========================================================================
-- FINANCEIRO: canal de venda de cada nota fiscal (Mercado Livre, Shopee, Amazon, Magalu...)
-- Rode no SQL Editor do projeto "niellypinheiro portfólio". Pode rodar mais de uma vez.
-- =========================================================================

alter table public.fin_notas add column if not exists canal text check (char_length(canal) <= 40);
alter table public.fin_notas add column if not exists canal_origem text check (canal_origem in ('xml', 'relatorio', 'manual'));
create index if not exists fin_notas_canal_idx on public.fin_notas (canal);


-- =====================================================================
-- BLOCO 16: FINANCEIRO, TRANSACOES DA AMAZON
-- =====================================================================
-- =========================================================================
-- FINANCEIRO: transações da Amazon (relatório "Todas as transações", pedidos, tarifas, reembolsos e repasses)
-- Rode no SQL Editor do projeto "niellypinheiro portfólio". Pode rodar mais de uma vez.
-- Depende de public.eh_da_smartbrand() (criada no banco.sql).
-- =========================================================================

create table if not exists public.fin_vendas_amazon (
  id                uuid primary key default gen_random_uuid(),
  chave             text not null unique check (char_length(chave) <= 400),
  data              date not null,
  liberacao         date,
  liquidacao        text check (char_length(liquidacao) <= 40),
  tipo              text check (char_length(tipo) <= 80),
  categoria         text not null default 'outro' check (categoria in ('pedido', 'reembolso', 'repasse', 'taxa', 'outro')),
  pedido            text check (char_length(pedido) <= 40),
  sku               text check (char_length(sku) <= 120),
  descricao         text check (char_length(descricao) <= 300),
  quantidade        integer,
  atendimento       text check (char_length(atendimento) <= 60),
  cidade            text check (char_length(cidade) <= 120),
  uf                text check (char_length(uf) <= 20),
  vendas_produto    numeric(14,2) not null default 0,
  creditos_remessa  numeric(14,2) not null default 0,
  creditos_presente numeric(14,2) not null default 0,
  descontos         numeric(14,2) not null default 0,
  imposto_coletado  numeric(14,2) not null default 0,
  tarifas_venda     numeric(14,2) not null default 0,
  tarifas_fba       numeric(14,2) not null default 0,
  outras_taxas      numeric(14,2) not null default 0,
  outro             numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  status            text check (char_length(status) <= 40),
  arquivo           text check (char_length(arquivo) <= 200),
  criado_em         timestamptz not null default now()
);
create index if not exists fin_vendas_amazon_data_idx on public.fin_vendas_amazon (data);
create index if not exists fin_vendas_amazon_pedido_idx on public.fin_vendas_amazon (pedido);

alter table public.fin_vendas_amazon enable row level security;
grant select, insert, update, delete on public.fin_vendas_amazon to authenticated;
drop policy if exists "so_smartbrand_fin_vendas_amazon" on public.fin_vendas_amazon;
create policy "so_smartbrand_fin_vendas_amazon" on public.fin_vendas_amazon
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());
