CREATE TABLE public.category (
    id UUID PRIMARY KEY DEFAULT public.gen_random_uuid(),
    name CHARACTER VARYING(100) NOT NULL,
    description TEXT,
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT category_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);

CREATE INDEX idx_category_name ON public.category(name);
CREATE INDEX idx_category_is_deleted ON public.category(is_deleted);
