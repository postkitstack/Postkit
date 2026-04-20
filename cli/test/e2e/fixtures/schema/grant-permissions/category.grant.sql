-- Grant permissions for category table
GRANT SELECT ON TABLE public.category TO readonly;
GRANT SELECT, INSERT, UPDATE ON TABLE public.category TO editor;
GRANT ALL ON TABLE public.category TO manager;
