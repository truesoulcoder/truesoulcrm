-- Enable extensions needed for the dump
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create a function to generate the complete schema dump
CREATE OR REPLACE FUNCTION generate_complete_schema_dump() 
RETURNS text AS $$
DECLARE
    dump_text text := '';
    r record := NULL;
    col record := NULL;      -- For column loops
    con record := NULL;      -- For constraint loops
    policy record := NULL;   -- For policy loops
    m record := NULL;        -- For membership loops
    g record := NULL;        -- For grantee loops
    priv text := NULL;       -- For privilege handling
    i record := NULL;        -- For general iteration
    j record := NULL;        -- For nested iteration
BEGIN
    -- 1. EXTENSIONS
    dump_text := dump_text || '-- ========== EXTENSIONS ==========' || E'\n\n';
    FOR r IN 
        SELECT 'CREATE EXTENSION IF NOT EXISTS ' || extname || 
               ' WITH SCHEMA ' || extnamespace::regnamespace || ';' as ext_command
        FROM pg_extension
        WHERE extname != 'plpgsql'  -- Skip plpgsql as it's a default extension
        ORDER BY extname
    LOOP
        dump_text := dump_text || r.ext_command || E'\n';
    END LOOP;
    dump_text := dump_text || E'\n';

    -- 2. SCHEMAS
    dump_text := dump_text || '-- ========== SCHEMAS ==========' || E'\n\n';
    FOR r IN 
        SELECT nspname as schema_name,
               nspowner::regrole::text as owner,
               'CREATE SCHEMA IF NOT EXISTS ' || nspname || 
               CASE 
                   WHEN nspowner::regrole::text != 'postgres' THEN 
                       ' AUTHORIZATION ' || nspowner::regrole::text 
                   ELSE '' 
               END || ';' as schema_command
        FROM pg_namespace
        WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema'
        ORDER BY nspname
    LOOP
        -- Store schema creation command
        dump_text := dump_text || '-- Creating schema: ' || r.schema_name || E'\n';
        dump_text := dump_text || r.schema_command || E'\n';
        
        -- Set comment if exists
        BEGIN
            DECLARE
                schema_comment text;
            BEGIN
                SELECT obj_description(oid, 'pg_namespace')
                INTO schema_comment
                FROM pg_namespace
                WHERE nspname = r.schema_name;
                
                IF schema_comment IS NOT NULL THEN
                    dump_text := dump_text || 'COMMENT ON SCHEMA ' || r.schema_name || ' IS ' || 
                                quote_literal(schema_comment) || ';' || E'\n';
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Ignore errors in comment extraction
                NULL;
            END;
        END;
    END LOOP;
    dump_text := dump_text || E'\n';

    -- 3. DOMAINS
    dump_text := dump_text || '-- ========== DOMAINS ==========' || E'\n\n';
    FOR r IN 
        SELECT pg_get_userbyid(typowner) as owner, 
               n.nspname as schema, 
               t.typname as name,
               pg_catalog.format_type(t.typbasetype, t.typtypmod) as type,
               t.typnotnull as not_null,
               t.typdefault as default_value,
               t.typdefaultbin as default_bin,
               (SELECT c.collname FROM pg_catalog.pg_collation c, pg_catalog.pg_type bt 
                WHERE c.oid = t.typcollation AND bt.oid = t.typbasetype AND t.typcollation <> bt.typcollation) as collation,
               CASE WHEN t.typdefault IS NOT NULL THEN 'DEFAULT ' || t.typdefault ELSE '' END as default_expr,
               pg_catalog.array_to_string(ARRAY(
                   SELECT pg_catalog.pg_get_constraintdef(con.oid, true)
                   FROM pg_catalog.pg_constraint con
                   WHERE con.contypid = t.oid
               ), ' ') as constraints
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'd'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY 1, 2
    LOOP
        dump_text := dump_text || '-- Domain: ' || r.schema || '.' || r.name || E'\n';
        dump_text := dump_text || '-- DROP DOMAIN IF EXISTS ' || r.schema || '.' || r.name || ';' || E'\n';
        dump_text := dump_text || 'CREATE DOMAIN ' || r.schema || '.' || r.name || E'\n';
        dump_text := dump_text || '    AS ' || r.type || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.not_null THEN 'NOT NULL' ELSE 'NULL' END || E'\n';
        IF r.default_value IS NOT NULL THEN
            dump_text := dump_text || '    DEFAULT ' || r.default_value || E'\n';
        END IF;
        IF r.collation IS NOT NULL THEN
            dump_text := dump_text || '    COLLATE ' || r.collation || E'\n';
        END IF;
        IF r.constraints IS NOT NULL THEN
            dump_text := dump_text || '    ' || r.constraints || E'\n';
        END IF;
        dump_text := dump_text || ';' || E'\n\n';
    END LOOP;

    -- 4. SEQUENCES
    dump_text := dump_text || '-- ========== SEQUENCES ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, c.relname as name, 
               pg_get_userbyid(c.relowner) as owner,
               s.seqtypid::regtype as data_type,
               s.seqstart as start_value,
               s.seqmin as min_value,
               s.seqmax as max_value,
               s.seqincrement as increment_by,
               s.seqcycle as cycles,
               s.seqcache as cache,
               s.seqtypid::regtype as data_type
        FROM pg_sequence s
        JOIN pg_class c ON c.oid = s.seqrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY n.nspname, c.relname
    LOOP
        dump_text := dump_text || '-- Sequence: ' || r.schema || '.' || r.name || E'\n';
        dump_text := dump_text || '-- DROP SEQUENCE IF EXISTS ' || r.schema || '.' || r.name || ';' || E'\n';
        dump_text := dump_text || 'CREATE SEQUENCE IF NOT EXISTS ' || r.schema || '.' || r.name || E'\n';
        dump_text := dump_text || '    AS ' || r.data_type || E'\n';
        dump_text := dump_text || '    START WITH ' || r.start_value || E'\n';
        dump_text := dump_text || '    INCREMENT BY ' || r.increment_by || E'\n';
        dump_text := dump_text || '    MINVALUE ' || r.min_value || E'\n';
        dump_text := dump_text || '    MAXVALUE ' || r.max_value || E'\n';
        dump_text := dump_text || '    CACHE ' || r.cache || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.cycles THEN 'CYCLE' ELSE 'NO CYCLE' END || ';' || E'\n\n';
        
        -- Add ownership
        dump_text := dump_text || 'ALTER SEQUENCE ' || r.schema || '.' || r.name || 
                     ' OWNER TO ' || r.owner || ';' || E'\n\n';
    END LOOP;

    -- 5. TABLES
    dump_text := dump_text || '-- ========== TABLES ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, c.relname as name, 
               pg_get_userbyid(c.relowner) as owner,
               obj_description(c.oid, 'pg_class') as description,
               array_agg(DISTINCT t.typname) as types
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_type t ON t.typrelid = c.oid
        WHERE c.relkind = 'r' 
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        GROUP BY n.nspname, c.relname, c.relowner, c.oid
        ORDER BY n.nspname, c.relname
    LOOP
        -- Table comment
        IF r.description IS NOT NULL THEN
            dump_text := dump_text || 'COMMENT ON TABLE ' || r.schema || '.' || r.name || 
                        ' IS ' || quote_literal(r.description) || ';' || E'\n';
        END IF;
        
        -- Table definition
        dump_text := dump_text || '-- Table: ' || r.schema || '.' || r.name || E'\n';
        dump_text := dump_text || '-- DROP TABLE IF EXISTS ' || r.schema || '.' || r.name || ';' || E'\n';
        dump_text := dump_text || 'CREATE TABLE ' || r.schema || '.' || r.name || ' (' || E'\n';
        
        -- Columns
        FOR col IN 
            SELECT a.attname as name,
                   pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
                   (SELECT substring(pg_catalog.pg_get_expr(d.adbin, d.adrelid) for 128)
                    FROM pg_attrdef d
                    WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum AND a.atthasdef) as default_value,
                   a.attnotnull as not_null,
                   a.attnum as attnum
            FROM pg_attribute a
            WHERE a.attrelid = (r.schema || '.' || r.name)::regclass
            AND a.attnum > 0
            AND NOT a.attisdropped
            ORDER BY a.attnum
        LOOP
            dump_text := dump_text || '    ' || col.name || ' ' || col.type;
            
            IF col.default_value IS NOT NULL THEN
                dump_text := dump_text || ' DEFAULT ' || col.default_value;
            END IF;
            
            IF col.not_null THEN
                dump_text := dump_text || ' NOT NULL';
            END IF;
            
            dump_text := dump_text || E'\n';
        END LOOP;
        
        -- Primary key
        FOR con IN 
            SELECT conname, pg_get_constraintdef(oid) as condef
            FROM pg_constraint
            WHERE conrelid = (r.schema || '.' || r.name)::regclass
            AND contype = 'p'
        LOOP
            dump_text := dump_text || '    , CONSTRAINT ' || con.conname || ' ' || con.condef || E'\n';
        END LOOP;
        
        dump_text := dump_text || ');' || E'\n\n';
        
        -- Table ownership
        dump_text := dump_text || 'ALTER TABLE ' || r.schema || '.' || r.name || 
                    ' OWNER TO ' || r.owner || ';' || E'\n\n';
                    
        -- Column comments
        FOR col IN 
            SELECT a.attname as name, d.description
            FROM pg_description d
            JOIN pg_attribute a ON a.attrelid = d.objoid AND a.attnum = d.objsubid
            WHERE d.objoid = (r.schema || '.' || r.name)::regclass
            AND d.objsubid > 0
            AND d.description IS NOT NULL
        LOOP
            dump_text := dump_text || 'COMMENT ON COLUMN ' || r.schema || '.' || r.name || 
                        '.' || col.name || ' IS ' || quote_literal(col.description) || ';' || E'\n';
        END LOOP;
        dump_text := dump_text || E'\n';
    END LOOP;

    -- 6. INDEXES
    dump_text := dump_text || '-- ========== INDEXES ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, c.relname as table_name, 
               i.relname as index_name, 
               pg_get_indexdef(i.oid) as index_def,
               pg_get_userbyid(c.relowner) as owner
        FROM pg_index x
        JOIN pg_class c ON c.oid = x.indrelid
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' 
        AND i.relkind = 'i'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        ORDER BY n.nspname, c.relname, i.relname
    LOOP
        dump_text := dump_text || '-- Index: ' || r.schema || '.' || r.index_name || E'\n';
        dump_text := dump_text || '-- DROP INDEX IF EXISTS ' || r.schema || '.' || r.index_name || ';' || E'\n';
        dump_text := dump_text || r.index_def || ';' || E'\n\n';
    END LOOP;

    -- 7. CONSTRAINTS (FOREIGN KEYS, CHECKS, UNIQUE)
    dump_text := dump_text || '-- ========== CONSTRAINTS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, c.relname as table_name, 
               conname as constraint_name, 
               pg_get_constraintdef(oid) as constraint_def,
               contype as constraint_type
        FROM pg_constraint
        JOIN pg_class c ON c.oid = conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        AND contype IN ('f', 'c', 'u')
        ORDER BY n.nspname, c.relname, conname
    LOOP
        dump_text := dump_text || '-- Constraint: ' || r.constraint_name || ' ON ' || 
                    r.schema || '.' || r.table_name || E'\n';
        dump_text := dump_text || 'ALTER TABLE ' || r.schema || '.' || r.table_name || 
                    ' ADD CONSTRAINT ' || r.constraint_name || ' ' || 
                    r.constraint_def || ';' || E'\n\n';
    END LOOP;

    -- 8. TRIGGERS
    dump_text := dump_text || '-- ========== TRIGGERS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, c.relname as table_name, 
               t.tgname as trigger_name,
               pg_get_triggerdef(t.oid) as trigger_def,
               pg_get_userbyid(c.relowner) as owner
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        ORDER BY n.nspname, c.relname, t.tgname
    LOOP
        dump_text := dump_text || '-- Trigger: ' || r.trigger_name || ' ON ' || 
                    r.schema || '.' || r.table_name || E'\n';
        dump_text := dump_text || '-- DROP TRIGGER IF EXISTS ' || r.trigger_name || 
                    ' ON ' || r.schema || '.' || r.table_name || ';' || E'\n';
        dump_text := dump_text || r.trigger_def || ';' || E'\n\n';
    END LOOP;

 -- 9. FUNCTIONS
    dump_text := dump_text || '-- ========== FUNCTIONS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, 
               p.proname as function_name,
               pg_get_userbyid(p.proowner) as owner,
               pg_get_function_identity_arguments(p.oid) as args,
               pg_get_function_result(p.oid) as return_type,
               pg_get_functiondef(p.oid) as function_def,
               l.lanname as language,
               p.prosecdef as security_definer,
               p.provolatile as volatility,
               p.proleakproof as leakproof,
               p.proisstrict as is_strict,
               p.proretset as returns_set,
               p.procost as cost,
               p.prorows as rows,
               p.proconfig as config,
               obj_description(p.oid, 'pg_proc') as description
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        AND p.prokind = 'f'  -- Only normal functions
        ORDER BY n.nspname, p.proname, p.oid
    LOOP
        dump_text := dump_text || '-- Function: ' || r.schema || '.' || r.function_name || '(' || r.args || ')' || E'\n';
        dump_text := dump_text || '-- DROP FUNCTION IF EXISTS ' || r.schema || '.' || r.function_name || 
                    '(' || r.args || ');' || E'\n';
        dump_text := dump_text || r.function_def || ';' || E'\n\n';
        
        -- Function comment
        IF r.description IS NOT NULL THEN
            dump_text := dump_text || 'COMMENT ON FUNCTION ' || r.schema || '.' || r.function_name || 
                        '(' || r.args || ') IS ' || quote_literal(r.description) || ';' || E'\n\n';
        END IF;
        
        -- Function ownership
        dump_text := dump_text || 'ALTER FUNCTION ' || r.schema || '.' || r.function_name || 
                    '(' || r.args || ') OWNER TO ' || r.owner || ';' || E'\n\n';
    END LOOP;


-- 10. ROW LEVEL SECURITY POLICIES
    dump_text := dump_text || '-- ========== ROW LEVEL SECURITY POLICIES ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema, 
               c.relname as table_name,
               p.polname as policy_name,
               p.polpermissive as is_permissive,
               p.polroles as roles,
               p.polcmd as command_type,
               p.polqual as using_qual,
               p.polwithcheck as with_check_qual,
               pg_get_userbyid(c.relowner) as owner
        FROM pg_policy p
        JOIN pg_class c ON p.polrelid = c.oid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast'
        ORDER BY n.nspname, c.relname, p.polname
    LOOP
        dump_text := dump_text || '-- Policy: ' || r.policy_name || ' ON ' || r.schema || '.' || r.table_name || E'\n';
        dump_text := dump_text || '-- DROP POLICY IF EXISTS ' || r.policy_name || ' ON ' || r.schema || '.' || r.table_name || ';' || E'\n';
        
        dump_text := dump_text || 'CREATE POLICY ' || r.policy_name || E'\n' ||
                    '    ON ' || r.schema || '.' || r.table_name || E'\n' ||
                    '    AS ' || CASE WHEN r.is_permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END || E'\n' ||
                    '    FOR ' || 
                    CASE r.command_type
                        WHEN 'r' THEN 'SELECT'
                        WHEN 'a' THEN 'INSERT'
                        WHEN 'w' THEN 'UPDATE'
                        WHEN 'd' THEN 'DELETE'
                        WHEN '*' THEN 'ALL'
                    END || E'\n' ||
                    '    TO ' || 
                    CASE 
                        WHEN r.roles = '{0}' THEN 'PUBLIC'
                        ELSE (SELECT string_agg(quote_ident(rolname), ', ') 
                              FROM pg_roles 
                              WHERE oid = ANY(r.roles))
                    END || E'\n';
                    
        IF r.using_qual IS NOT NULL THEN
            dump_text := dump_text || '    USING (' || pg_get_expr(r.using_qual, p.polrelid) || ')' || E'\n';
        END IF;
        
        IF r.with_check_qual IS NOT NULL THEN
            dump_text := dump_text || '    WITH CHECK (' || pg_get_expr(r.with_check_qual, p.polrelid) || ')' || E'\n';
        END IF;
        
        dump_text := dump_text || ';' || E'\n\n';
    END LOOP;

    -- 11. STORAGE BUCKETS AND POLICIES
    dump_text := dump_text || '-- ========== STORAGE BUCKETS ==========' || E'\n\n';
    
    -- Storage buckets
    FOR r IN 
        SELECT * FROM storage.buckets
        ORDER BY name
    LOOP
        dump_text := dump_text || '-- Storage Bucket: ' || r.name || E'\n';
        dump_text := dump_text || '-- DROP BUCKET IF EXISTS ' || r.name || ';' || E'\n';
        dump_text := dump_text || 'INSERT INTO storage.buckets (id, name, owner, public, avif_autodetection, file_size_limit, allowed_mime_types, created_at, updated_at)' || E'\n';
        dump_text := dump_text || 'VALUES (' || 
                    quote_literal(r.id) || ', ' ||
                    quote_literal(r.name) || ', ' ||
                    quote_nullable(r.owner) || ', ' ||
                    r.public || ', ' ||
                    r.avif_autodetection || ', ' ||
                    r.file_size_limit || ', ' ||
                    quote_nullable(r.allowed_mime_types::text) || ', ' ||
                    quote_literal(r.created_at) || ', ' ||
                    quote_literal(r.updated_at) ||
                    ')' || E'\n';
        
        -- Handle conflicts for existing buckets
        dump_text := dump_text || 'ON CONFLICT (name) DO UPDATE SET' || E'\n' ||
                    '    id = EXCLUDED.id,' || E'\n' ||
                    '    owner = EXCLUDED.owner,' || E'\n' ||
                    '    public = EXCLUDED.public,' || E'\n' ||
                    '    avif_autodetection = EXCLUDED.avif_autodetection,' || E'\n' ||
                    '    file_size_limit = EXCLUDED.file_size_limit,' || E'\n' ||
                    '    allowed_mime_types = EXCLUDED.allowed_mime_types,' || E'\n' ||
                    '    updated_at = EXCLUDED.updated_at;' || E'\n\n';
        
        -- Bucket policies
        FOR policy IN 
            SELECT * FROM pg_policies 
            WHERE schemaname = 'storage' 
            AND tablename = 'objects'
            AND policyname LIKE r.name || '%'
            ORDER BY policyname
        LOOP
            dump_text := dump_text || '-- Policy: ' || policy.policyname || E'\n';
            dump_text := dump_text || '-- DROP POLICY IF EXISTS ' || policy.policyname || ' ON storage.objects;' || E'\n';
            dump_text := dump_text || 'CREATE POLICY ' || policy.policyname || E'\n';
            dump_text := dump_text || '    ON storage.objects' || E'\n';
            dump_text := dump_text || '    AS ' || policy.permissive::text || E'\n';
            dump_text := dump_text || '    FOR ' || policy.cmd::text || E'\n';
            dump_text := dump_text || '    TO ' || policy.roles::text || E'\n';
            
            IF policy.qual IS NOT NULL THEN
                dump_text := dump_text || '    USING (' || policy.qual || ')' || E'\n';
            END IF;
            
            IF policy.with_check IS NOT NULL THEN
                dump_text := dump_text || '    WITH CHECK (' || policy.with_check || ')' || E'\n';
            END IF;
            
            dump_text := dump_text || ';' || E'\n\n';
        END LOOP;
    END LOOP;

    -- 12. ROLES AND PRIVILEGES
    dump_text := dump_text || '-- ========== ROLES AND PRIVILEGES ==========' || E'\n\n';
    
    -- Roles
    FOR r IN 
        SELECT * FROM pg_roles 
        WHERE rolname NOT IN ('postgres', 'pg_signal_backend', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin')
        AND rolname NOT LIKE 'pg_%'
        ORDER BY rolname
    LOOP
        dump_text := dump_text || '-- Role: ' || r.rolname || E'\n';
        dump_text := dump_text || '-- DROP ROLE IF EXISTS ' || r.rolname || ';' || E'\n';
        dump_text := dump_text || 'CREATE ROLE ' || r.rolname || ' WITH' || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.rolsuper THEN 'SUPERUSER' ELSE 'NOSUPERUSER' END || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.rolinherit THEN 'INHERIT' ELSE 'NOINHERIT' END || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.rolcreaterole THEN 'CREATEROLE' ELSE 'NOCREATEROLE' END || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.rolcreatedb THEN 'CREATEDB' ELSE 'NOCREATEDB' END || E'\n';
        dump_text := dump_text || '    ' || CASE WHEN r.rolcanlogin THEN 'LOGIN' ELSE 'NOLOGIN' END || E'\n';
        dump_text := dump_text || '    ' || 'REPLICATION' || E'\n';
        dump_text := dump_text || '    ' || 'BYPASSRLS' || E'\n';
        dump_text := dump_text || '    ' || 'CONNECTION LIMIT ' || r.rolconnlimit || E'\n';
        
        IF r.rolpassword IS NOT NULL THEN
            dump_text := dump_text || '    ' || 'PASSWORD ' || quote_literal(r.rolpassword) || E'\n';
        END IF;
        
        dump_text := dump_text || '    ' || 'VALID UNTIL ' || 
                    CASE 
                        WHEN r.rolvaliduntil IS NULL THEN '''infinity''' 
                        ELSE quote_literal(r.rolvaliduntil::text) 
                    END || ';' || E'\n\n';
        
        -- Role memberships
        FOR m IN 
            SELECT roleid::regrole::text as role
            FROM pg_auth_members
            WHERE member = r.oid
        LOOP
            dump_text := dump_text || 'GRANT ' || m.role || ' TO ' || r.rolname || ';' || E'\n';
        END LOOP;
        dump_text := dump_text || E'\n';
    END LOOP;

    -- 13. SCHEMA GRANTS
    dump_text := dump_text || '-- ========== SCHEMA GRANTS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema,
               r.rolname as role,
               array_agg(DISTINCT priv) as privs
        FROM (
            SELECT n.oid as nspid, n.nspname, r.rolname, 
                   CASE 
                       WHEN has_schema_privilege(r.oid, n.oid, 'CREATE') THEN 'CREATE'
                   END as priv
            FROM pg_namespace n
            CROSS JOIN pg_roles r
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_schema_privilege(r.oid, n.oid, 'CREATE')
            
            UNION ALL
            
            SELECT n.oid as nspid, n.nspname, r.rolname, 
                   CASE 
                       WHEN has_schema_privilege(r.oid, n.oid, 'USAGE') THEN 'USAGE'
                   END as priv
            FROM pg_namespace n
            CROSS JOIN pg_roles r
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_schema_privilege(r.oid, n.oid, 'USAGE')
        ) t
        JOIN pg_namespace n ON t.nspid = n.oid
        JOIN pg_roles r ON t.rolname = r.rolname
        WHERE t.priv IS NOT NULL
        GROUP BY n.nspname, r.rolname
        ORDER BY n.nspname, r.rolname
    LOOP
        dump_text := dump_text || 'GRANT ' || array_to_string(r.privs, ', ') || 
                    ' ON SCHEMA ' || r.schema || ' TO ' || r.role || ';' || E'\n';
    END LOOP;
    dump_text := dump_text || E'\n';

    -- 14. TABLE GRANTS
    dump_text := dump_text || '-- ========== TABLE GRANTS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema,
               c.relname as table_name,
               r.rolname as role,
               array_agg(DISTINCT priv) as privs
        FROM (
            SELECT c.oid as relid, n.nspname, c.relname, r.rolname, 
                   CASE 
                       WHEN has_table_privilege(r.oid, c.oid, 'SELECT') THEN 'SELECT'
                   END as priv
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN pg_roles r
            WHERE c.relkind = 'r'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_table_privilege(r.oid, c.oid, 'SELECT')
            
            UNION ALL
            
            -- Add other privileges similarly (INSERT, UPDATE, DELETE, etc.)
            SELECT c.oid as relid, n.nspname, c.relname, r.rolname, 
                   CASE 
                       WHEN has_table_privilege(r.oid, c.oid, 'INSERT') THEN 'INSERT'
                   END as priv
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN pg_roles r
            WHERE c.relkind = 'r'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_table_privilege(r.oid, c.oid, 'INSERT')
            
            -- Add other privileges as needed
        ) t
        JOIN pg_class c ON t.relid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_roles r ON t.rolname = r.rolname
        WHERE t.priv IS NOT NULL
        GROUP BY n.nspname, c.relname, r.rolname
        ORDER BY n.nspname, c.relname, r.rolname
    LOOP
        dump_text := dump_text || 'GRANT ' || array_to_string(r.privs, ', ') || 
                    ' ON ' || r.schema || '.' || r.table_name || ' TO ' || r.role || ';' || E'\n';
    END LOOP;

    -- 15. SEQUENCE GRANTS
    dump_text := dump_text || E'\n-- ========== SEQUENCE GRANTS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema,
               c.relname as sequence_name,
               r.rolname as role,
               array_agg(DISTINCT priv) as privs
        FROM (
            SELECT c.oid as relid, n.nspname, c.relname, r.rolname, 
                   CASE 
                       WHEN has_sequence_privilege(r.oid, c.oid, 'USAGE') THEN 'USAGE'
                   END as priv
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN pg_roles r
            WHERE c.relkind = 'S'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_sequence_privilege(r.oid, c.oid, 'USAGE')
            
            -- Add other sequence privileges as needed
        ) t
        JOIN pg_class c ON t.relid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_roles r ON t.rolname = r.rolname
        WHERE t.priv IS NOT NULL
        GROUP BY n.nspname, c.relname, r.rolname
        ORDER BY n.nspname, c.relname, r.rolname
    LOOP
        dump_text := dump_text || 'GRANT ' || array_to_string(r.privs, ', ') || 
                    ' ON SEQUENCE ' || r.schema || '.' || r.sequence_name || ' TO ' || r.role || ';' || E'\n';
    END LOOP;

    -- 16. FUNCTION GRANTS
    dump_text := dump_text || E'\n-- ========== FUNCTION GRANTS ==========' || E'\n\n';
    FOR r IN 
        SELECT n.nspname as schema,
               p.proname as function_name,
               pg_get_function_identity_arguments(p.oid) as args,
               r.rolname as role,
               array_agg(DISTINCT priv) as privs
        FROM (
            SELECT p.oid as fnid, n.nspname, p.proname, r.rolname, 
                   CASE 
                       WHEN has_function_privilege(r.oid, p.oid, 'EXECUTE') THEN 'EXECUTE'
                   END as priv
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            CROSS JOIN pg_roles r
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            AND r.rolname NOT LIKE 'pg_%'
            AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
        ) t
        JOIN pg_proc p ON t.fnid = p.oid
        JOIN pg_namespace n ON p.pronamespace = n.oid
        JOIN pg_roles r ON t.rolname = r.rolname
        WHERE t.priv IS NOT NULL
        GROUP BY n.nspname, p.proname, p.oid, r.rolname
        ORDER BY n.nspname, p.proname, r.rolname
    LOOP
        dump_text := dump_text || 'GRANT ' || array_to_string(r.privs, ', ') || 
                    ' ON FUNCTION ' || r.schema || '.' || r.function_name || 
                    '(' || r.args || ') TO ' || r.role || ';' || E'\n';
    END LOOP;

    -- 17. DEFAULT PRIVILEGES
    dump_text := dump_text || E'\n-- ========== DEFAULT PRIVILEGES ==========' || E'\n\n';
    FOR i IN 
        SELECT 
            pg_get_userbyid(d.defaclrole) as owner,
            n.nspname as schema,
            CASE d.defaclobjtype
                WHEN 'r' THEN 'TABLES'
                WHEN 'S' THEN 'SEQUENCES'
                WHEN 'f' THEN 'FUNCTIONS'
                WHEN 'T' THEN 'TYPES'
            END as object_type,
            array_agg(DISTINCT priv) as privs,
            array_agg(DISTINCT grantee) as grantees
        FROM (
            SELECT 
                d.defaclrole,
                d.defaclnamespace,
                d.defaclobjtype,
                a.rolname as grantee,
                CASE 
                    WHEN aclcontains(d.defaclacl, 
                        makeaclitem(d.defaclrole, a.oid, 
                            CASE 
                                WHEN d.defaclobjtype = 'r' THEN 'arwdDxt'::text 
                                WHEN d.defaclobjtype = 'S' THEN 'rwU'::text
                                WHEN d.defaclobjtype = 'f' THEN 'X'::text
                                WHEN d.defaclobjtype = 'T' THEN 'U'::text
                                ELSE ''::text
                            END, 
                            false)) 
                    THEN 'ALL'
                    ELSE string_agg(
                        CASE 
                            WHEN aclcontains(d.defaclacl, 
                                makeaclitem(d.defaclrole, a.oid, c.privilege_type, false))
                            THEN c.privilege_type
                            ELSE NULL
                        END, 
                        ', '
                    )
                END as priv
            FROM pg_default_acl d
            CROSS JOIN pg_roles a
            CROSS JOIN (
                SELECT 'SELECT' as privilege_type, 'r' as objtype
                UNION ALL SELECT 'INSERT', 'r'
                UNION ALL SELECT 'UPDATE', 'r'
                UNION ALL SELECT 'DELETE', 'r'
                UNION ALL SELECT 'TRUNCATE', 'r'
                UNION ALL SELECT 'REFERENCES', 'r'
                UNION ALL SELECT 'TRIGGER', 'r'
                UNION ALL SELECT 'USAGE', 'S'
                UNION ALL SELECT 'SELECT', 'S'
                UNION ALL SELECT 'UPDATE', 'S'
                UNION ALL SELECT 'EXECUTE', 'f'
                UNION ALL SELECT 'USAGE', 'T'
            ) c
            WHERE a.rolname NOT LIKE 'pg_%'
            AND (d.defaclobjtype = c.objtype OR (d.defaclobjtype = 'r' AND c.objtype = 'r'))
            GROUP BY d.defaclrole, d.defaclnamespace, d.defaclobjtype, a.oid, a.rolname
        ) t
        JOIN pg_namespace n ON n.oid = t.defaclnamespace
        WHERE t.priv IS NOT NULL
        GROUP BY t.defaclrole, n.nspname, t.defaclobjtype
        ORDER BY t.defaclrole, n.nspname, t.defaclobjtype
    LOOP
        FOR j IN SELECT unnest(i.grantees) as grantee
        LOOP
            dump_text := dump_text || 'ALTER DEFAULT PRIVILEGES ';
            
            IF i.owner != 'postgres' THEN
                dump_text := dump_text || 'FOR ROLE ' || i.owner || ' ';
            END IF;
            
            IF i.schema IS NOT NULL THEN
                dump_text := dump_text || 'IN SCHEMA ' || i.schema || ' ';
            END IF;
            
            dump_text := dump_text || 'GRANT ' || array_to_string(i.privs, ', ') || 
                        ' ON ' || i.object_type || ' TO ' || j.grantee || ';' || E'\n';
        END LOOP;
    END LOOP;

    -- 18. FINAL MESSAGE
    dump_text := dump_text || E'\n-- ========== SCHEMA DUMP COMPLETE ==========' || E'\n';
    dump_text := dump_text || '-- Generated at: ' || now()::timestamp || E'\n';
    
    RETURN dump_text;
EXCEPTION 
    WHEN OTHERS THEN
        DECLARE
            error_context text;
        BEGIN
            -- Try to get some context without assuming any variables exist
            error_context := 'Error occurred in function generate_complete_schema_dump';
            
            -- Try to include the current SQL state and error message
            error_context := error_context || E'\nSQL State: ' || SQLSTATE;
            error_context := error_context || E'\nError Message: ' || SQLERRM;
            
            -- Try to include the current timestamp
            error_context := error_context || E'\nTimestamp: ' || now()::timestamp;
            
            -- Include the full error context
            error_context := error_context || E'\n\nFull Error Context:';
            error_context := error_context || E'\n----------------------------------------';
            
            -- Try to include any available context variables safely
            BEGIN
                IF r IS NOT NULL THEN
                    error_context := error_context || E'\nLast processed record (r): ' || r::text;
                END IF;
                
                IF i IS NOT NULL THEN
                    error_context := error_context || E'\nLast processed default privilege (i): ' || i::text;
                END IF;
                
                IF col IS NOT NULL THEN
                    error_context := error_context || E'\nLast processed column: ' || col::text;
                END IF;
                
                IF con IS NOT NULL THEN
                    error_context := error_context || E'\nLast processed constraint: ' || con::text;
                END IF;
                
                IF policy IS NOT NULL THEN
                    error_context := error_context || E'\nLast processed policy: ' || policy::text;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Ignore errors in error handling
                NULL;
            END;
            
            RETURN error_context;
        END;
END;
$$ LANGUAGE plpgsql;

-- Execute the function to get the complete schema dump
SELECT generate_complete_schema_dump();
