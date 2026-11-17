-- GRACIOU — migração incremental para referência genérica do fornecedor
-- NÃO executar na produção sem autorização explícita.
-- A coluna legada permanece intacta; valores só são copiados quando a nova
-- referência ainda está NULL, preservando qualquer dado genérico existente.

alter table public.pedidos
  add column if not exists referencia_fornecedor text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pedidos'
      AND column_name = 'pedido_youdraw'
  ) THEN
    EXECUTE 'UPDATE public.pedidos
      SET referencia_fornecedor = pedido_youdraw
      WHERE referencia_fornecedor IS NULL AND pedido_youdraw IS NOT NULL';
  END IF;
END
$$;
