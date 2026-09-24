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
                 check (situacao in ('lead', 'conversando', 'cliente', 'parada')),
  nicho          text check (nicho is null or nicho in ('casa', 'gastronomia', 'tech', 'cabelo', 'bodycare', 'entretenimento', 'moda')),
  obs            text check (char_length(obs) <= 3000),
  ultimo_contato date,
  criado_em      timestamptz not null default now()
);
-- Se a tabela já existia de antes, isto acrescenta o campo do nicho (não apaga nada)
alter table public.marcas add column if not exists nicho text;

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
-- BLOCO 8 (OPCIONAL): TESTE DA TRANCA
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
--   union all select 'videos escondidos', count(*) from public.videos where visivel = false;
--   rollback;
--
-- RESULTADO CERTO: todas as linhas da resposta com o número 0.
-- (Mesmo que você já tenha marcas e campanhas guardadas: o visitante
--  enxerga zero. Se aparecer número maior que zero, a tranca falhou,
--  me chame antes de usar o painel.)
-- =====================================================================
