# Xquik X Data

Agent Skill for using Xquik's public OpenAPI and remote MCP manifest.

## What It Does

- Finds current Xquik REST endpoint details from the OpenAPI document
- Configures remote MCP access from the public MCP manifest
- Guides authenticated X data workflows with `x-api-key` or OAuth bearer auth
- Keeps API keys, tokens, and user data out of logs and files

## Source Truth

- Docs: https://docs.xquik.com
- OpenAPI: https://xquik.com/openapi.json
- MCP guide: https://docs.xquik.com/mcp/overview
- MCP manifest: https://xquik.com/.well-known/mcp.json
- Remote MCP URL: https://xquik.com/mcp

## Required Environment

- `XQUIK_API_KEY` for REST or a client's secure MCP API-key fallback, or
- `XQUIK_OAUTH_TOKEN` when a workflow already has an OAuth access token

Do not print or persist either value.

Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.
