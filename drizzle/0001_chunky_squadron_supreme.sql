CREATE OR REPLACE FUNCTION update_library_size()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE library SET size = size + 1 WHERE id = NEW.library_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE library SET size = size - 1 WHERE id = OLD.library_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER library_size_trigger
AFTER INSERT OR DELETE ON library_items
FOR EACH ROW EXECUTE FUNCTION update_library_size();