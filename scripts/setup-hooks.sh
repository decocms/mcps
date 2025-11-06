#!/bin/sh
# Setup git hooks for the repository

HOOK_DIR=".git/hooks"
HOOK_FILE="$HOOK_DIR/pre-commit"

echo "Setting up git hooks..."

# Create pre-commit hook
cat > "$HOOK_FILE" << 'EOF'
#!/bin/sh
# Pre-commit hook to run fmt and lint

echo "Running pre-commit checks..."

# Run format check
echo "Running oxfmt..."
bun run fmt
if [ $? -ne 0 ]; then
  echo "❌ Format check failed. Please fix formatting issues."
  exit 1
fi

# Run linter
echo "Running oxlint..."
bun run lint
if [ $? -ne 0 ]; then
  echo "❌ Lint check failed. Please fix linting issues."
  exit 1
fi

echo "✅ Pre-commit checks passed!"
exit 0
EOF

# Make hook executable
chmod +x "$HOOK_FILE"

echo "✅ Git hooks installed successfully!"
echo "The pre-commit hook will now run 'bun run fmt' and 'bun run lint' before each commit."

