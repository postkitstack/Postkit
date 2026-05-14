-- RLS policies for category table
ALTER TABLE public.category ENABLE ROW LEVEL SECURITY;

-- Managers can see all non-deleted categories
CREATE POLICY category_manager_select ON public.category
    FOR SELECT TO manager
    USING (is_deleted = false);

-- Editors can see and modify non-deleted categories
CREATE POLICY category_editor_select ON public.category
    FOR SELECT TO editor
    USING (is_deleted = false);

CREATE POLICY category_editor_insert ON public.category
    FOR INSERT TO editor
    WITH CHECK (is_deleted = false);

CREATE POLICY category_editor_update ON public.category
    FOR UPDATE TO editor
    USING (is_deleted = false)
    WITH CHECK (is_deleted = false);

-- Read-only role can see non-deleted categories
CREATE POLICY category_readonly_select ON public.category
    FOR SELECT TO readonly
    USING (is_deleted = false);
