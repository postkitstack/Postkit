CREATE TABLE app.order_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES app.order(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.product(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DOUBLE PRECISION NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_item_order_id ON app.order_item(order_id);
CREATE INDEX idx_order_item_product_id ON app.order_item(product_id);
