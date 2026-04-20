--
-- Name: products_with_category; Type: VIEW; Schema: public
--

CREATE VIEW public.products_with_category WITH (security_invoker='on') AS
SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.sku,
    p.price,
    p.status,
    c.id AS category_id,
    c.name AS category_name,
    p.created_at,
    p.updated_at
FROM public.product p
JOIN public.category c ON c.id = p.category_id
WHERE p.is_deleted = false
  AND c.is_deleted = false;
