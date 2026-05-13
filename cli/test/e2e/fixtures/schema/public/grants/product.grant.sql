-- Grant permissions for product table
GRANT SELECT ON TABLE public.product TO readonly;
GRANT SELECT, INSERT, UPDATE ON TABLE public.product TO editor;
GRANT ALL ON TABLE public.product TO manager;
