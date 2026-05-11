CREATE TABLE app.order (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.category(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK ((status)::text = ANY (ARRAY['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])),
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_category_id ON app.order(category_id);
CREATE INDEX idx_order_status ON app.order(status);
CREATE INDEX idx_order_is_deleted ON app.order(is_deleted);
