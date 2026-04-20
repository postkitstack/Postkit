CREATE TABLE public.product (
    id UUID PRIMARY KEY DEFAULT public.gen_random_uuid(),
    name CHARACTER VARYING(200) NOT NULL,
    sku CHARACTER VARYING(50) NOT NULL,
    category_id UUID NOT NULL REFERENCES public.category(id) ON DELETE RESTRICT,
    price DOUBLE PRECISION NOT NULL CHECK (price >= 0),
    status VARCHAR(15) NOT NULL DEFAULT 'draft'
        CHECK ((status)::text = ANY (ARRAY['draft', 'published', 'archived'])),
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT product_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);

CREATE INDEX idx_product_sku ON public.product(sku);
CREATE INDEX idx_product_category_id ON public.product(category_id);
CREATE INDEX idx_product_status ON public.product(status);
CREATE INDEX idx_product_is_deleted ON public.product(is_deleted);
