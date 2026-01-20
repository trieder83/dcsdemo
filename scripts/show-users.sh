#!/bin/bash

# Script to show database tables directly from SQLite
# This demonstrates that PII data is stored encrypted

DB_PATH="${DB_PATH:-server/data.db}"

if [ ! -f "$DB_PATH" ]; then
    echo "Database not found at $DB_PATH"
    echo "Run 'npm run seed' first to create the database."
    exit 1
fi

echo "=========================================="
echo "Users Table (Raw Database View)"
echo "=========================================="
echo ""
echo "Note: The name, surname, birthdate, and email fields"
echo "contain encrypted data (base64 encoded ciphertext)."
echo ""

sqlite3 -header -column "$DB_PATH" "SELECT id, username, name, surname, birthdate, email, is_active FROM users;"

echo ""
echo "=========================================="
echo "Key Management Table"
echo "=========================================="
echo ""

sqlite3 -header -column "$DB_PATH" "
SELECT km.id, km.user_id, u.username, r.name as role,
       substr(km.public_key, 1, 30) || '...' as public_key_preview,
       substr(km.wrapped_data_key, 1, 30) || '...' as wrapped_key_preview
FROM key_management km
JOIN users u ON km.user_id = u.id
JOIN roles r ON km.role_id = r.id;
"

echo ""
echo "=========================================="
echo "Members Table (Encrypted PII)"
echo "=========================================="
echo ""
echo "Note: name, surname, birthdate, email, gender are encrypted."
echo ""

sqlite3 -header -column "$DB_PATH" "
SELECT id,
       substr(name, 1, 30) || '...' as name_preview,
       substr(surname, 1, 30) || '...' as surname_preview,
       substr(gender, 1, 30) || '...' as gender_preview,
       deleted,
       created_at
FROM members;
"

echo ""
echo "=========================================="
echo "Weight Measurements (Plaintext)"
echo "=========================================="
echo ""
echo "Note: Weight data is NOT encrypted - only member names are."
echo "Member names are masked when sent to LLM."
echo ""

sqlite3 -header -column "$DB_PATH" "
SELECT d.id, d.member_id, d.weight, d.date, d.deleted, d.created_at
FROM data d
ORDER BY d.date DESC;
"

echo ""
echo "=========================================="
echo "LLM Settings (Encrypted API Keys)"
echo "=========================================="
echo ""
echo "Note: encrypted_api_key contains the API key encrypted"
echo "with the user's data key (base64 encoded ciphertext)."
echo ""

sqlite3 -header -column "$DB_PATH" "
SELECT ls.id, ls.user_id, u.username, ls.provider, ls.endpoint,
       CASE WHEN ls.encrypted_api_key IS NULL THEN 'NULL'
            ELSE substr(ls.encrypted_api_key, 1, 30) || '...'
       END as encrypted_key_preview
FROM llm_settings ls
JOIN users u ON ls.user_id = u.id;
"
