-- Schema Analysis Script
-- Generates a comprehensive report of tables, columns, and relationships

-- 1. Table and Column Information
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    c.is_identity,
    c.is_updatable
FROM 
    information_schema.tables t
    JOIN information_schema.columns c 
        ON t.table_name = c.table_name 
        AND t.table_schema = c.table_schema
WHERE 
    t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
ORDER BY 
    t.table_name, 
    c.ordinal_position;

-- 2. Foreign Key Relationships (using PostgreSQL system catalogs)
SELECT
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE 
    tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY 
    tc.table_name,
    kcu.ordinal_position;

-- 3. Table Comments and Descriptions
SELECT 
    t.table_name,
    obj_description(('public.' || t.table_name)::regclass, 'pg_class') as table_comment
FROM 
    information_schema.tables t
WHERE 
    t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE';

-- 4. Column Comments
SELECT 
    c.table_name,
    c.column_name,
    col_description((c.table_schema || '.' || c.table_name)::regclass::oid, c.ordinal_position) as column_comment
FROM 
    information_schema.columns c
WHERE 
    c.table_schema = 'public'
ORDER BY 
    c.table_name, 
    c.ordinal_position;