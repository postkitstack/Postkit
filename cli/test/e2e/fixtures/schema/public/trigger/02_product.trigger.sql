--
-- Name: product update_product_timestamp; Type: TRIGGER; Schema: public
--

CREATE TRIGGER update_product_timestamp
    BEFORE UPDATE ON public.product
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();
