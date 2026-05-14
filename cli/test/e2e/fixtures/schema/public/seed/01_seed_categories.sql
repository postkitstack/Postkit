-- Seed default categories (idempotent)
INSERT INTO public.category (id, name, description)
SELECT t.id, t.name, t.description
FROM (VALUES
    ('a0000000-0000-0000-0000-000000000001'::UUID, 'Electronics', 'Electronic devices and components'),
    ('a0000000-0000-0000-0000-000000000002'::UUID, 'Furniture', 'Office and home furniture'),
    ('a0000000-0000-0000-0000-000000000003'::UUID, 'Stationery', 'Office supplies and stationery')
) AS t(id, name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM public.category c WHERE c.id = t.id
);
