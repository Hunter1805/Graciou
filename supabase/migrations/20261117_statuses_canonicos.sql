-- GRACIOU — migração incremental dos status canônicos
-- NÃO executar na produção sem autorização explícita.
-- Normaliza valores antigos sem excluir nem substituir outros dados.

update public.pedidos
set status = 'preparando_pedido'
where status in ('encomendar_na_youdraw', 'pedido_na_youdraw');
