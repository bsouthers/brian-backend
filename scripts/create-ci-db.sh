#!/usr/bin/env bash
# Creates role `ci` (password `ci`) and database `ci_db` if they don’t exist.
set -euo pipefail

psql -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}" <<'SQL'
DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ci') THEN
      CREATE ROLE ci LOGIN PASSWORD 'ci';
   END IF;

   IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ci_db') THEN
      CREATE DATABASE ci_db OWNER ci;
   END IF;
END
$$;
SQL