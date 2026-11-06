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
