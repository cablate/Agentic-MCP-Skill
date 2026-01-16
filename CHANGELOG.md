# Changelog

## [0.2.0]

- Refactored to unified npm package (agentic-mcp)
- Replaced HTTP with Socket communication (newline-delimited JSON protocol)
- Merged cli/ and daemon/ into single src/ structure
- Archived Python scripts to archive/python-legacy/
- Updated all commands from `mcp` to `agentic-mcp`
- Updated system architecture diagrams (Socket instead of HTTP)
- Updated Environment Variables (removed MCP_DAEMON_PORT)
- Changed license to Apache-2.0 with acknowledgments
- Updated README.md and README_zhTW.md for current implementation


## [0.1.1]

- Added custom `description` field support in mcp-servers.json for AI context
- Added `description?: string` to MCPServerConfig type definition
- Added `getCachedMetadata()` method to ProgressiveMCPClient for daemon access
- Added GET /metadata?sessionId=xxx endpoint to return actual MCP server metadata
- Fixed Layer 1 metadata retrieval to return name, version, capabilities, and description
- Fixed config file path resolution to read mcp-servers.json from project root
- Added MCP_DAEMON_CONFIG environment variable support for custom config path
- Updated mcp_metadata.py to use new /metadata endpoint instead of tools/list
- Updated daemon_start.py to calculate correct project root path and set MCP_DAEMON_CONFIG
- Updated loadServerConfigs() to prioritize MCP_DAEMON_CONFIG > root config > daemon config
- Updated README.md with description field examples and config file location priority
- Updated README_zhTW.md with description field examples and config file location priority
- Created .claude/context/project.md with comprehensive project documentation
- Created CHANGELOG.md for tracking changes
- Updated mcp-servers.json with English description for playwright server

## [0.1.0]

- Initial proof-of-concept release
- Three-layer progressive disclosure (metadata → tools → schema)
- Daemon architecture with persistent MCP connections
- Support for stdio, http-streamable, and SSE transports
- Global and dynamic session management
- Hot reload configuration support
