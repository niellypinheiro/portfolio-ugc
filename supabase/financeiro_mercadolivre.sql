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
