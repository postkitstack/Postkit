--
-- Name: get_products_by_category(UUID); Type: FUNCTION; Schema: public
--

CREATE FUNCTION public.get_products_by_category(cat_id UUID) RETURNS TABLE(
    product_id UUID,
    product_name CHARACTER VARYING,
    product_sku CHARACTER VARYING,
    product_price DOUBLE PRECISION,
    product_status VARCHAR
)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.name, p.sku, p.price, p.status
    FROM public.product p
    WHERE p.category_id = cat_id
      AND p.is_deleted = false
    ORDER BY p.name;
END;
$$;
