CREATE TABLE app.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK ((status)::text = ANY (ARRAY['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])),
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_category_id ON app.orders(category_id);
CREATE INDEX idx_orders_status ON app.orders(status);
CREATE INDEX idx_orders_is_deleted ON app.orders(is_deleted);
