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
