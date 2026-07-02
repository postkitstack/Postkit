-- RLS policies for product table
ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;

-- Managers can do everything on non-deleted products
CREATE POLICY product_manager_all ON public.product
    FOR ALL TO manager
    USING (is_deleted = false)
    WITH CHECK (is_deleted = false);

-- Editors can see and modify published/draft products
CREATE POLICY product_editor_select ON public.product
    FOR SELECT TO editor
    USING (is_deleted = false);

CREATE POLICY product_editor_insert ON public.product
    FOR INSERT TO editor
    WITH CHECK (is_deleted = false AND status IN ('draft', 'published'));

-- Read-only role can only see published products
CREATE POLICY product_readonly_select ON public.product
    FOR SELECT TO readonly
    USING (is_deleted = false AND status = 'published');
