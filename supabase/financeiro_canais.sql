-- =========================================================================
-- FINANCEIRO: canal de venda de cada nota fiscal (Mercado Livre, Shopee, Amazon, Magalu...)
-- Rode no SQL Editor do projeto "niellypinheiro portfólio". Pode rodar mais de uma vez.
-- =========================================================================

alter table public.fin_notas add column if not exists canal text check (char_length(canal) <= 40);
alter table public.fin_notas add column if not exists canal_origem text check (canal_origem in ('xml', 'relatorio', 'manual'));
create index if not exists fin_notas_canal_idx on public.fin_notas (canal);
