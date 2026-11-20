#!/bin/sh
# Creates a separate database for automated tests so they never touch development data.
# Scripts in docker-entrypoint-initdb.d only run when the data volume is empty.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE DATABASE app_test OWNER "$POSTGRES_USER";
SQL
