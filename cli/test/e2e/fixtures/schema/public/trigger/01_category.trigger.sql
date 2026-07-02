--
-- Name: category update_category_timestamp; Type: TRIGGER; Schema: public
--

CREATE TRIGGER update_category_timestamp
    BEFORE UPDATE ON public.category
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();
