# Runtime Risks

Use this file when working on actual product behavior instead of generic cleanup.

## Known Risk Classes

1. Tauri payload naming mismatch
2. Browser mock behavior diverging from desktop behavior
3. Canvas connection semantics diverging from executor semantics
4. Unsaved editor state diverging from executed flow state
5. Missing or unstable `entryBlock`

## Investigation Checklist

For any runtime bug, inspect these in order:

1. UI component that edits or triggers the behavior
2. hook that stores editor state
3. `src/tauri/*.ts` wrapper used for command invocation
4. Rust command handler in `src-tauri/src/commands/`
5. Rust model in `src-tauri/src/models/`
6. executor logic in `src-tauri/src/core/execution/`

## Important Current Semantics

1. Condition branches should match visible `sourceHandle` edges
2. Loop children should match current outgoing edges
3. Execution should use freshly saved canonical state
4. Entry block should be stable and visible

## Testing Guidance

When fixing runtime bugs, prefer tests that model real user behavior:

1. configure a block in the UI layer or hook layer
2. save or execute through the normal path
3. assert the canonical serialized flow or invoked Tauri payload
