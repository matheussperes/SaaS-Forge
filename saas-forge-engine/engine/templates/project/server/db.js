'use strict';

// Conexão SQLite — gerada pelo SaaS-Forge.
// O schema.sql (gerado pela esteira) usa CREATE TABLE IF NOT EXISTS,
// então pode ser reaplicado a cada boot sem perder dados.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data.sqlite');
const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

module.exports = db;
