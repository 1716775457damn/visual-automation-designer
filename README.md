# Visual Automation Designer

A visual programming tool for creating screen automation workflows using a drag-and-drop interface.

## Downloads

Download desktop builds from the GitHub Releases page:

- Releases: `https://github.com/1716775457damn/visual-automation-designer/releases`

Recommended assets by platform:

- Windows: `.exe`, `.msi`, or `.nsis.zip`
- macOS: `.dmg`
- Linux: `.AppImage` or `.deb`

Notes:

- Release assets appear after the GitHub Actions release workflow finishes for each platform.
- Some operating systems may warn about unsigned applications.
- If a release page opens but assets are missing, check the Actions page for the build status.

## Features

- Drag-and-drop flow editor built with React Flow
- Tauri desktop shell with Rust execution backend
- Flow save/load/delete support
- Execution controls for run, pause, resume, stop, and step
- Execution log panel and keyboard shortcuts
- Undo/redo history integration for core editing operations

## Tech Stack

- **Application Framework**: Tauri 2.0
- **Frontend**: React + TypeScript + react-flow
- **Backend**: Rust

## Prerequisites

- Node.js 18+
- Rust 1.70+
- Platform-specific dependencies for Tauri

## Getting Started

### Install dependencies

```bash
# Install frontend dependencies
npm install

# Install Rust dependencies (handled by Cargo)
```

### Development

```bash
# Start development server
npm run tauri dev
```

### Build

```bash
# Build for production
npm run tauri build
```

## Project Structure

```
visual-automation-designer/
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── hooks/              # Custom React hooks
│   ├── types/              # TypeScript type definitions
│   └── tauri/              # Tauri command wrappers
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri command handlers
│   │   ├── core/           # Core business logic
│   │   ├── platform/       # Platform abstraction layer
│   │   ├── matching/       # Image matching module
│   │   └── models/         # Data models
│   └── Cargo.toml          # Rust dependencies
├── package.json            # Frontend dependencies
└── vite.config.ts          # Vite configuration
```

## License

MIT
