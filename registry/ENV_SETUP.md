# Environment Variables Setup

## Required Environment Variables

Create a `.env` file in the `registry/` directory with the following variables:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# OpenRouter API (for AI enrichment script)
# Get your key at: https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Optional: Override default model for AI enrichment
# OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct
```

## Quick Setup

```bash
# 1. Copy this template to .env
cd registry
cat > .env << 'EOF'
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
EOF

# 2. Edit .env and fill in your actual keys
nano .env  # or use your favorite editor
```

## Getting the Keys

### Supabase Keys
1. Go to your Supabase project dashboard
2. Settings → API
3. Copy `URL`, `anon/public key`, and `service_role key`

### OpenRouter API Key
1. Go to https://openrouter.ai/keys
2. Create a new API key
3. Copy the key (starts with `sk-or-v1-`)

## Security Notes

⚠️ **NEVER commit the `.env` file to git!**
- The `.env` file is already in `.gitignore`
- Never hardcode API keys in source code
- Revoke any exposed keys immediately

