#!/usr/bin/env bash
# Quick local test runner for youtube-search MCP.
# Usage: ./test-local.sh [tool] [args_json]
# Examples:
#   ./test-local.sh search '{"query":"deco cms"}'
#   ./test-local.sh details '{"videoId":"dQw4w9WgXcQ"}'
#   ./test-local.sh captions '{"videoId":"dQw4w9WgXcQ"}'
#   ./test-local.sh transcript '{"videoId":"dQw4w9WgXcQ","format":"srt"}'
#   ./test-local.sh list        (lists all tools)

PORT="${PORT:-8001}"
BASE="http://localhost:${PORT}/mcp"

# Unsigned JWT — runtime uses decodeJwt (jose, no signature verification)
MESH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsb2NhbC10ZXN0LXVzZXIiLCJ1c2VyIjp7ImlkIjoibG9jYWwtdGVzdC11c2VyIn0sInN0YXRlIjp7fSwiY29ubmVjdGlvbklkIjoiY29ubl9sb2NhbF90ZXN0IiwibWVzaFVybCI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMSIsIm9yZ2FuaXphdGlvbklkIjoibG9jYWwtb3JnIiwib3JnYW5pemF0aW9uU2x1ZyI6ImxvY2FsIn0.fakesig"

call() {
  local method="$1"
  local body="$2"
  curl -s -X POST "$BASE" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "x-mesh-token: $MESH_TOKEN" \
    -d "$body" \
    | sed 's/^data: //' \
    | grep -v '^event:' \
    | grep -v '^$' \
    | jq .
}

case "${1:-list}" in
  list)
    call "tools/list" '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
    ;;
  search)
    ARGS="${2:-{\"query\":\"deco cms\"}}"
    call "tools/call" "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"YOUTUBE_SEARCH_VIDEOS\",\"arguments\":${ARGS}}}"
    ;;
  details)
    ARGS="${2:-{\"videoId\":\"dQw4w9WgXcQ\"}}"
    call "tools/call" "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"YOUTUBE_GET_VIDEO_DETAILS\",\"arguments\":${ARGS}}}"
    ;;
  captions)
    ARGS="${2:-{\"videoId\":\"dQw4w9WgXcQ\"}}"
    call "tools/call" "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"YOUTUBE_LIST_CAPTIONS\",\"arguments\":${ARGS}}}"
    ;;
  transcript)
    ARGS="${2:-{\"videoId\":\"dQw4w9WgXcQ\",\"format\":\"text\"}}"
    call "tools/call" "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"YOUTUBE_GET_TRANSCRIPT\",\"arguments\":${ARGS}}}"
    ;;
  download)
    ARGS="${2:-{\"videoId\":\"dQw4w9WgXcQ\"}}"
    call "tools/call" "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"YOUTUBE_DOWNLOAD_VIDEO\",\"arguments\":${ARGS}}}"
    ;;
  *)
    echo "Unknown command: $1"
    echo "Usage: $0 [list|search|details|captions|transcript|download] [args_json]"
    exit 1
    ;;
esac
