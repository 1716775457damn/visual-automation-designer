# Implementation Plan - DPI Scaling Correction & Multi-Monitor Hardening

Optimize the visual automation editor's screen capture, image matching, and mouse execution pipelines to correctly handle multi-monitor setups, mixed-DPI screen scaling factor offsets, and coordinate translations.

---

## 🎯 Goal Description

In desktop automation, mapping coordinates accurately from the canvas to the physical screen is a major challenge due to:
1. **High DPI Scaling**: A logical pixel on the canvas (e.g. 100px) translates to a physical pixel based on display scaling (e.g. 150px at 150% scaling).
2. **Multi-Monitor Layouts**: Coordinates can be positive, negative, or staggered depending on where secondary displays are positioned.

Currently, the Rust platform layer (`screen.rs`) hardcodes `scale_factor` to `1.0` because the `screenshots` crate does not expose scale factors. This causes click coordinate misalignment and incorrect matching coordinates on screens using scaling (like 125%, 150%, 200%).

We propose to query scale factors dynamically from Tauri's `AppHandle` monitor APIs and correctly translate coordinates across logical, physical, and virtual screens during screen capture and click execution.

---

## 👥 User Review Required

> [!IMPORTANT]
> This hardening is focused on the Tauri Rust desktop runtime. We are introducing a new utility `list_monitors_with_tauri` to bridge `screenshots::Screen` info with `tauri::Monitor` info, so screen scaling factors can be resolved dynamically.

---

## ❓ Open Questions

> [!NOTE]
> * **Primary Monitor Detection**: We assume screen coordinate (0, 0) belongs to the primary display. If the user has a secondary monitor set as primary (with negative/positive offset), Tauri handles this gracefully, but we will verify this dynamically by checking `tauri::Monitor` properties.

---

## 🛠️ Proposed Changes

### Rust Screen Platform Component

#### [MODIFY] [screen.rs](file:///f:/projects/visual-automation-designer/src-tauri/src/platform/screen.rs)

1. **Implement dynamic DPI mapping**:
   Add a new static helper or method that queries Tauri's monitor layout:
   ```rust
   pub fn list_monitors_with_tauri(app_handle: &tauri::AppHandle) -> Result<Vec<MonitorInfo>> {
       let screenshots_screens = Screen::all().map_err(|e| {
           AppError::InternalError(format!("Failed to enumerate screenshots screens: {}", e))
       })?;
       
       let tauri_monitors = app_handle.available_monitors().map_err(|e| {
           AppError::InternalError(format!("Failed to enumerate Tauri monitors: {}", e))
       })?;
       
       let mut monitors = Vec::new();
       for (i, s) in screenshots_screens.iter().enumerate() {
           // Match screenshots screen with tauri monitor by their bounding box positions
           let sx = s.display_info.x;
           let sy = s.display_info.y;
           
           // Query scale factor from matching tauri monitor, fallback to 1.0
           let scale_factor = tauri_monitors.iter()
               .find(|tm| {
                   let pos = tm.position();
                   pos.x == sx && pos.y == sy
               })
               .map(|tm| tm.scale_factor() as f32)
               .unwrap_or(1.0);
               
           monitors.push(MonitorInfo {
               index: i,
               x: sx,
               y: sy,
               width: s.display_info.width,
               height: s.display_info.height,
               display_id: s.display_info.id,
               scale_factor,
           });
       }
       
       Ok(monitors)
   }
   ```

2. **Refactor Coordinate Translation**:
   Improve coordinate converters in `MonitorInfo` to ensure clear division and multiplication steps for conversion between logical (CSS pixels) and physical desktop coordinates.

---

### Rust Execution Engine

#### [MODIFY] [executor.rs](file:///f:/projects/visual-automation-designer/src-tauri/src/core/execution/executor.rs)

1. **Enhance Image Matching Capture**:
   Update `find_image_on_screen` to:
   * Query scaling parameters using `ScreenCapture::list_monitors_with_tauri(&self.app_handle)`.
   * Capture from the target monitor using local monitor coordinates, and translate physical match centers back to correct logical coordinates.
   ```rust
   let monitors = ScreenCapture::list_monitors_with_tauri(&self.app_handle)?;
   // Identify correct monitor info, matching target display coordinates and scaling factor
   ```

2. **DPI Adjustment in Mouse Clicks**:
   Ensure mouse-clicks executed via `InputController` receive exact physical coordinates mapped from canvas logical bounds:
   ```rust
   // logical coordinate -> scale_factor transformation -> physical click command
   ```

---

### Rust Unit & Integration Tests

#### [MODIFY] [commands_integration_test.rs](file:///f:/projects/visual-automation-designer/src-tauri/tests/commands_integration_test.rs)

1. Add tests that simulate screen layouts with mock DPI scale factors (e.g. `1.25`, `1.50`, `2.00`).
2. Assert that coordinate conversions translate correctly (e.g. Logical (200, 300) on a 1.5x scaled monitor maps to physical (300, 450) and vice versa).

---

## 🧪 Verification Plan

### Automated Tests
* Run `cargo test` in the `src-tauri` folder to verify that coordinate conversion unit tests in `screen.rs` compile and pass.

### Manual Verification
* Deploy and run the app on a high-DPI scaling Windows setup (e.g., set screen scaling to 150% in display settings).
* Create an automation click step on the canvas and run it. Verify that the simulated click hits the targeted UI button precisely, with zero offset or coordinate misalignment!
