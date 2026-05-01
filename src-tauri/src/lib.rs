use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::menu::{
    AboutMetadataBuilder, CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder,
    PredefinedMenuItem, SubmenuBuilder,
};
use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Emitter, Manager, State, TitleBarStyle, WebviewUrl};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

static DETACH_SEQ: AtomicU32 = AtomicU32::new(0);
static DRAG_SEQ: AtomicU32 = AtomicU32::new(0);

/// Maintained by the Rust process: tabId (= conversationId) -> windowLabel.
/// We persist nothing here; the map is rebuilt as windows are created/closed.
#[derive(Default)]
struct WindowRegistry {
    tab_to_window: Mutex<HashMap<String, String>>,
}

/// Holds references to checkable menu items so the frontend can push state
/// into the macOS menu via the `set_menu_check` IPC. The frontend is the
/// source of truth; Rust just reflects it. See
/// docs/specs/04-window-menu-and-command-palette.md.
#[derive(Default)]
struct CheckableMenuItems {
    items: Mutex<HashMap<String, CheckMenuItem<tauri::Wry>>>,
}

#[derive(Default)]
struct DragSessionStore {
    sessions: Mutex<HashMap<String, DragPayload>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DragPayload {
    id: String,
    #[serde(rename = "type")]
    payload_type: String,
    chat_id: String,
    message_id: Option<String>,
    content: String,
    metadata: Option<Value>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownTreeNode {
    name: String,
    path: String,
    kind: String,
    children: Option<Vec<MarkdownTreeNode>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowLifecycleEvent {
    /// "created" | "focused" | "closed"
    event: String,
    window_id: String,
    tab_id: Option<String>,
    view: String,
}

fn emit_lifecycle(app: &AppHandle, event: &str, window_id: &str, tab_id: Option<&str>, view: &str) {
    let payload = WindowLifecycleEvent {
        event: event.to_string(),
        window_id: window_id.to_string(),
        tab_id: tab_id.map(|s| s.to_string()),
        view: view.to_string(),
    };
    if let Err(e) = app.emit("window-lifecycle", payload) {
        eprintln!("failed to emit window-lifecycle {event}: {e}");
    }
}

fn chrono_like_ts() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn percent_encode_query(value: &str) -> String {
    let mut out = String::new();
    for byte in value.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}


fn canonical_root(root_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path);
    if !root.exists() {
        fs::create_dir_all(&root).map_err(|e| format!("failed to create root: {e}"))?;
    }
    root.canonicalize()
        .map_err(|e| format!("failed to resolve root: {e}"))
}

fn ensure_inside(root_path: &str, target_path: &str) -> Result<PathBuf, String> {
    let root = canonical_root(root_path)?;
    let raw_target = if target_path.trim().is_empty() {
        root.clone()
    } else {
        let path = PathBuf::from(target_path);
        if path.is_absolute() {
            path
        } else {
            root.join(path)
        }
    };
    let target = raw_target;
    let existing = if target.exists() {
        target
            .canonicalize()
            .map_err(|e| format!("failed to resolve target: {e}"))?
    } else {
        let parent = target
            .parent()
            .ok_or_else(|| "target has no parent".to_string())?
            .canonicalize()
            .map_err(|e| format!("failed to resolve target parent: {e}"))?;
        let file_name = target
            .file_name()
            .ok_or_else(|| "target has no file name".to_string())?;
        parent.join(file_name)
    };
    if !existing.starts_with(&root) {
        return Err("path is outside the markdown root".to_string());
    }
    Ok(existing)
}

fn relative_to_root(root_path: &str, target: &Path) -> Result<String, String> {
    let root = canonical_root(root_path)?;
    let resolved = target
        .canonicalize()
        .map_err(|e| format!("failed to resolve target: {e}"))?;
    if !resolved.starts_with(&root) {
        return Err("path is outside the markdown root".to_string());
    }
    resolved
        .strip_prefix(root)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|_| "failed to compute relative path".to_string())
}

fn safe_child_name(name: &str, must_be_markdown: bool) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("name cannot be empty".to_string());
    }
    if trimmed == "." || trimmed == ".." || trimmed.contains('/') || trimmed.contains('\\') {
        return Err("name must not contain path separators".to_string());
    }
    if must_be_markdown && !trimmed.to_lowercase().ends_with(".md") {
        return Ok(format!("{trimmed}.md"));
    }
    Ok(trimmed.to_string())
}

fn build_markdown_tree(path: &Path, root: &Path) -> Result<MarkdownTreeNode, String> {
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            root.file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Local Markdown".to_string())
        });
    let rel_path = path
        .strip_prefix(root)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    if path.is_dir() {
        let mut children = Vec::new();
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let child = entry.path();
            let file_name = child
                .file_name()
                .map(|s| s.to_string_lossy())
                .unwrap_or_default();
            if file_name.starts_with('.') {
                continue;
            }
            if child.is_dir()
                || child
                    .extension()
                    .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("md"))
                    .unwrap_or(false)
            {
                children.push(build_markdown_tree(&child, root)?);
            }
        }
        children.sort_by(|a, b| {
            let ka = if a.kind == "folder" { 0 } else { 1 };
            let kb = if b.kind == "folder" { 0 } else { 1 };
            ka.cmp(&kb)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(MarkdownTreeNode {
            name,
            path: rel_path,
            kind: "folder".to_string(),
            children: Some(children),
        })
    } else {
        Ok(MarkdownTreeNode {
            name,
            path: rel_path,
            kind: "file".to_string(),
            children: None,
        })
    }
}

#[tauri::command]
fn list_markdown_tree(root_path: String) -> Result<MarkdownTreeNode, String> {
    let root = canonical_root(&root_path)?;
    build_markdown_tree(&root, &root)
}

#[tauri::command]
fn read_markdown_file(root_path: String, path: String) -> Result<String, String> {
    let target = ensure_inside(&root_path, &path)?;
    if !target
        .extension()
        .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("md"))
        .unwrap_or(false)
    {
        return Err("only markdown files can be read".to_string());
    }
    fs::read_to_string(&target).map_err(|e| e.to_string())
}

#[tauri::command]
fn try_read_markdown_file(root_path: String, path: String) -> Result<Option<String>, String> {
    let target = match ensure_inside(&root_path, &path) {
        Ok(target) => target,
        Err(e) if e.contains("failed to resolve target parent") => return Ok(None),
        Err(e) => return Err(e),
    };
    if !target
        .extension()
        .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("md"))
        .unwrap_or(false)
    {
        return Err("only markdown files can be read".to_string());
    }
    match fs::read_to_string(&target) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn write_markdown_file(root_path: String, path: String, content: String) -> Result<(), String> {
    let target = ensure_inside(&root_path, &path)?;
    if !target
        .extension()
        .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("md"))
        .unwrap_or(false)
    {
        return Err("only markdown files can be written".to_string());
    }
    fs::write(&target, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_markdown_file(
    root_path: String,
    parent_path: String,
    file_name: String,
) -> Result<String, String> {
    let parent = ensure_inside(&root_path, &parent_path)?;
    if !parent.is_dir() {
        return Err("parent is not a folder".to_string());
    }
    let safe = safe_child_name(&file_name, true)?;
    let target = parent.join(safe);
    if target.exists() {
        return Err("file already exists".to_string());
    }
    fs::write(&target, "").map_err(|e| e.to_string())?;
    relative_to_root(&root_path, &target)
}

#[tauri::command]
fn create_folder(
    root_path: String,
    parent_path: String,
    folder_name: String,
) -> Result<String, String> {
    let parent = ensure_inside(&root_path, &parent_path)?;
    if !parent.is_dir() {
        return Err("parent is not a folder".to_string());
    }
    let safe = safe_child_name(&folder_name, false)?;
    let target = parent.join(safe);
    if target.exists() {
        return Err("folder already exists".to_string());
    }
    fs::create_dir(&target).map_err(|e| e.to_string())?;
    relative_to_root(&root_path, &target)
}

#[tauri::command]
fn rename_path(root_path: String, path: String, new_name: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("cannot rename the markdown root".to_string());
    }
    let target = ensure_inside(&root_path, &path)?;
    let is_file = target.is_file();
    let safe = safe_child_name(&new_name, is_file)?;
    let parent = target
        .parent()
        .ok_or_else(|| "path has no parent".to_string())?;
    let next = parent.join(safe);
    ensure_inside(&root_path, &next.to_string_lossy())?;
    fs::rename(&target, &next).map_err(|e| e.to_string())?;
    relative_to_root(&root_path, &next)
}

#[tauri::command]
fn delete_path(root_path: String, path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("cannot delete the markdown root".to_string());
    }
    let target = ensure_inside(&root_path, &path)?;
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())
    } else {
        fs::remove_file(target).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn reveal_markdown_path(root_path: String, path: String) -> Result<(), String> {
    let target = ensure_inside(&root_path, &path)?;
    #[cfg(target_os = "macos")]
    {
        let mut command = std::process::Command::new("open");
        if target.is_dir() {
            command.arg(&target);
        } else {
            command.arg("-R").arg(&target);
        }
        command
            .status()
            .map_err(|e| format!("failed to open Finder: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let target_arg = if target.is_dir() {
            target.to_string_lossy().to_string()
        } else {
            format!("/select,{}", target.to_string_lossy())
        };
        std::process::Command::new("explorer")
            .arg(target_arg)
            .status()
            .map_err(|e| format!("failed to open Explorer: {e}"))?;
        return Ok(());
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let folder = if target.is_dir() {
            target
        } else {
            target
                .parent()
                .ok_or_else(|| "target has no parent".to_string())?
                .to_path_buf()
        };
        std::process::Command::new("xdg-open")
            .arg(folder)
            .status()
            .map_err(|e| format!("failed to open file manager: {e}"))?;
        Ok(())
    }
}

#[tauri::command]
fn begin_cross_window_drag(
    store: State<'_, DragSessionStore>,
    mut payload: DragPayload,
) -> Result<String, String> {
    if payload.payload_type != "chat-message" {
        return Err(format!(
            "unsupported drag payload type: {}",
            payload.payload_type
        ));
    }
    let id = if payload.id.trim().is_empty() {
        let seq = DRAG_SEQ.fetch_add(1, Ordering::Relaxed);
        format!("drag-{seq}-{}", chrono_like_ts())
    } else {
        payload.id.clone()
    };
    payload.id = id.clone();
    store
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), payload);
    Ok(id)
}

#[tauri::command]
fn resolve_cross_window_drag(
    store: State<'_, DragSessionStore>,
    drag_session_id: String,
) -> Result<Option<DragPayload>, String> {
    Ok(store
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&drag_session_id))
}

#[tauri::command]
fn cancel_cross_window_drag(
    store: State<'_, DragSessionStore>,
    drag_session_id: String,
) -> Result<(), String> {
    store
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&drag_session_id);
    Ok(())
}

/// Detach a tab into a new fully-native macOS window.
///
/// Step 1 of the user-requested flow:
///   1. Frontend detects detach intent (button click for now; drag later).
///   2. Frontend invokes this command with a tab id (= conversationId) and a
///      optional view name ("chat" or "canvas").
///   3. Rust creates a real `NSWindow`-backed Tauri webview window loading
///      `index.html?windowId=...&tabId=...` and registers the tab.
///   4. Rust emits a `window-lifecycle { event: "created" }` so the frontend
///      can update its tab→window map.
#[tauri::command]
async fn detach_tab_to_window(
    app: AppHandle,
    registry: State<'_, WindowRegistry>,
    tab_id: Option<String>,
    view: Option<String>,
    layout_preset: Option<String>,
    markdown_path: Option<String>,
) -> Result<String, String> {
    let layout_preset = layout_preset.unwrap_or_else(|| {
        if view.as_deref() == Some("canvas") {
            "canvasFocused".to_string()
        } else {
            "chatFocused".to_string()
        }
    });
    if layout_preset != "chatFocused" && layout_preset != "canvasFocused" {
        return Err(format!("invalid layoutPreset: {layout_preset}"));
    }
    let panel = if layout_preset == "canvasFocused" {
        "canvas"
    } else {
        "chat"
    };
    let seq = DETACH_SEQ.fetch_add(1, Ordering::Relaxed);
    let window_id = format!("{panel}-{seq}-{}", chrono_like_ts());

    let (w, h) = if panel == "chat" {
        (520, 760)
    } else {
        (1080, 780)
    };
    let title = if markdown_path.is_some() {
        "Memory Canvas - Markdown"
    } else if panel == "chat" {
        "Memory Canvas - Chat"
    } else {
        "Memory Canvas - Canvas"
    };
    let offset = (seq as f64) * 28.0;

    let mut url_path = format!(
        "index.html?windowId={window_id}&windowType=workspace&layoutPreset={layout_preset}"
    );
    if let Some(tid) = tab_id.as_ref() {
        url_path.push_str(&format!("&sourceTabId={tid}&tabId={tid}&chatId={tid}"));
        if panel == "canvas" {
            url_path.push_str(&format!("&canvasId={tid}"));
        }
    }
    if let Some(path) = markdown_path.as_ref() {
        url_path.push_str("&markdownPath=");
        url_path.push_str(&percent_encode_query(path));
    }
    let url = WebviewUrl::App(url_path.into());

    let builder = WebviewWindowBuilder::new(&app, &window_id, url)
        .title(title)
        .inner_size(w as f64, h as f64)
        .min_inner_size(360.0, 480.0)
        .resizable(true)
        .maximizable(true)
        .minimizable(true)
        .closable(true)
        .decorations(true)
        .visible(true)
        .focused(true)
        .position(120.0 + offset, 120.0 + offset)
        .title_bar_style(TitleBarStyle::Visible)
        .disable_drag_drop_handler();

    let window = builder
        .build()
        .map_err(|e| format!("failed to create window: {e}"))?;
    window
        .set_resizable(true)
        .map_err(|e| format!("failed to enable resizing: {e}"))?;

    if let Some(tid) = tab_id.as_ref() {
        if let Ok(mut map) = registry.tab_to_window.lock() {
            map.insert(tid.clone(), window_id.clone());
        }
    }
    emit_lifecycle(&app, "created", &window_id, tab_id.as_deref(), panel);

    // Listen for close + focus events, update registry, emit to frontend.
    {
        let app_for_close = app.clone();
        let window_id_close = window_id.clone();
        let tab_id_close = tab_id.clone();
        let view_close = panel.to_string();
        let registry_close = registry.tab_to_window.lock().unwrap().clone();
        let _ = registry_close; // appease the borrow checker — we re-lock below
        window.on_window_event(move |ev| match ev {
            tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                if let Some(reg) = app_for_close.try_state::<WindowRegistry>() {
                    if let Ok(mut map) = reg.tab_to_window.lock() {
                        if let Some(tid) = tab_id_close.as_deref() {
                            map.remove(tid);
                        }
                    }
                }
                emit_lifecycle(
                    &app_for_close,
                    "closed",
                    &window_id_close,
                    tab_id_close.as_deref(),
                    &view_close,
                );
            }
            tauri::WindowEvent::Focused(true) => {
                emit_lifecycle(
                    &app_for_close,
                    "focused",
                    &window_id_close,
                    tab_id_close.as_deref(),
                    &view_close,
                );
            }
            _ => {}
        });
    }

    Ok(window_id)
}

/// Focus an existing window (or no-op if it has been closed).
#[tauri::command]
fn focus_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(&label) {
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Read the current tabId -> windowId map. Useful at startup or when the
/// frontend wants to reconcile its own mirror.
#[tauri::command]
fn list_detached_windows(
    registry: State<'_, WindowRegistry>,
) -> Result<HashMap<String, String>, String> {
    registry
        .tab_to_window
        .lock()
        .map(|m| m.clone())
        .map_err(|e| e.to_string())
}

/// Set the check state of a registered menu item. Frontend calls this when a
/// store value relevant to the macOS menu changes (Show Chat, Show Canvas,
/// Show Sidebar, Auto-Hide Chat Tabs). Unknown ids are silently ignored so
/// front-end and back-end can ship slightly out of sync.
#[tauri::command]
fn set_menu_check(
    state: State<'_, CheckableMenuItems>,
    id: String,
    checked: bool,
) -> Result<(), String> {
    let map = state.items.lock().map_err(|e| e.to_string())?;
    if let Some(item) = map.get(&id) {
        item.set_checked(checked).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WindowRegistry::default())
        .manage(DragSessionStore::default())
        .manage(CheckableMenuItems::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            begin_cross_window_drag,
            resolve_cross_window_drag,
            cancel_cross_window_drag,
            list_markdown_tree,
            read_markdown_file,
            try_read_markdown_file,
            write_markdown_file,
            create_markdown_file,
            create_folder,
            rename_path,
            delete_path,
            reveal_markdown_path,
            detach_tab_to_window,
            focus_window,
            list_detached_windows,
            set_menu_check
        ])
        .setup(|app| {
            let handle = app.handle();

            let about_meta = AboutMetadataBuilder::new()
                .name(Some("Hypratia"))
                .version(Some(env!("CARGO_PKG_VERSION").to_string()))
                .build();

            // App menu (macOS shows app name as the menu title)
            let prefs = MenuItemBuilder::new("Preferences…")
                .id("app:preferences")
                .accelerator("CmdOrCtrl+,")
                .build(handle)?;
            let app_menu = SubmenuBuilder::new(handle, "Hypratia")
                .item(&PredefinedMenuItem::about(
                    handle,
                    Some("About Hypratia"),
                    Some(about_meta),
                )?)
                .separator()
                .item(&prefs)
                .separator()
                .item(&PredefinedMenuItem::services(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(handle, None)?)
                .item(&PredefinedMenuItem::hide_others(handle, None)?)
                .item(&PredefinedMenuItem::show_all(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(handle, None)?)
                .build()?;

            // File menu
            let new_chat = MenuItemBuilder::new("New Chat")
                .id("file:new-chat")
                .accelerator("CmdOrCtrl+N")
                .build(handle)?;
            let new_project = MenuItemBuilder::new("New Project")
                .id("file:new-project")
                .accelerator("CmdOrCtrl+Shift+N")
                .build(handle)?;
            let open_folder = MenuItemBuilder::new("Open Folder…")
                .id("file:open-folder")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(handle)?;
            let detach_chat = MenuItemBuilder::new("Open Chat in New Window")
                .id("file:detach-chat")
                .build(handle)?;
            let detach_canvas = MenuItemBuilder::new("Open Canvas in New Window")
                .id("file:detach-canvas")
                .build(handle)?;
            let file_menu = SubmenuBuilder::new(handle, "File")
                .item(&new_chat)
                .item(&new_project)
                .separator()
                .item(&open_folder)
                .separator()
                .item(&detach_chat)
                .item(&detach_canvas)
                .separator()
                .item(&PredefinedMenuItem::close_window(handle, None)?)
                .build()?;

            // Edit menu (uses native predefined items)
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .item(&PredefinedMenuItem::undo(handle, None)?)
                .item(&PredefinedMenuItem::redo(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(handle, None)?)
                .item(&PredefinedMenuItem::copy(handle, None)?)
                .item(&PredefinedMenuItem::paste(handle, None)?)
                .item(&PredefinedMenuItem::select_all(handle, None)?)
                .build()?;

            // Chat menu
            let new_chat_window = MenuItemBuilder::new("New Chat Window")
                .id("chat:new-window")
                .accelerator("CmdOrCtrl+Shift+T")
                .build(handle)?;
            let chat_menu = SubmenuBuilder::new(handle, "Chat")
                .item(&new_chat_window)
                .build()?;

            // Canvas menu
            let new_canvas_window = MenuItemBuilder::new("New Canvas Window")
                .id("canvas:new-window")
                .accelerator("CmdOrCtrl+Alt+T")
                .build(handle)?;
            let canvas_menu = SubmenuBuilder::new(handle, "Canvas")
                .item(&new_canvas_window)
                .build()?;

            // View menu
            let view_current = MenuItemBuilder::new("Current Map")
                .id("view:mode-current")
                .accelerator("CmdOrCtrl+1")
                .build(handle)?;
            let view_global = MenuItemBuilder::new("Global Map")
                .id("view:mode-global")
                .accelerator("CmdOrCtrl+2")
                .build(handle)?;
            let view_menu = SubmenuBuilder::new(handle, "View")
                .item(&view_current)
                .item(&view_global)
                .separator()
                .item(&PredefinedMenuItem::fullscreen(handle, None)?)
                .build()?;

            // Window menu — Chat / Canvas / Sidebar branches with check states.
            // The frontend pushes the latest check state via `set_menu_check`.
            let show_chat = CheckMenuItemBuilder::new("Show Chat")
                .id("view:show-chat")
                .checked(true)
                .build(handle)?;
            let hide_chat = MenuItemBuilder::new("Hide Chat")
                .id("view:hide-chat")
                .build(handle)?;
            let new_chat_window_w = MenuItemBuilder::new("Open New Chat Window")
                .id("chat:new-window")
                .build(handle)?;
            let auto_hide_chat_tabs = CheckMenuItemBuilder::new("Auto-Hide Chat Tabs")
                .id("view:toggle-tabs-autohide")
                .checked(false)
                .build(handle)?;
            let chat_branch = SubmenuBuilder::new(handle, "Chat")
                .item(&show_chat)
                .item(&hide_chat)
                .separator()
                .item(&new_chat_window_w)
                .separator()
                .item(&auto_hide_chat_tabs)
                .build()?;

            let show_canvas = CheckMenuItemBuilder::new("Show Canvas")
                .id("view:show-canvas")
                .checked(true)
                .build(handle)?;
            let hide_canvas = MenuItemBuilder::new("Hide Canvas")
                .id("view:hide-canvas")
                .build(handle)?;
            let new_canvas_window_w = MenuItemBuilder::new("Open New Canvas Window")
                .id("canvas:new-window")
                .build(handle)?;
            let canvas_branch = SubmenuBuilder::new(handle, "Canvas")
                .item(&show_canvas)
                .item(&hide_canvas)
                .separator()
                .item(&new_canvas_window_w)
                .build()?;

            let show_sidebar = CheckMenuItemBuilder::new("Show Sidebar")
                .id("view:show-sidebar")
                .checked(true)
                .build(handle)?;
            let hide_sidebar = MenuItemBuilder::new("Hide Sidebar")
                .id("view:hide-sidebar")
                .build(handle)?;
            let sidebar_branch = SubmenuBuilder::new(handle, "Sidebar")
                .item(&show_sidebar)
                .item(&hide_sidebar)
                .build()?;

            let show_all = MenuItemBuilder::new("Show All Panels")
                .id("view:show-all-panels")
                .build(handle)?;

            let window_menu = SubmenuBuilder::new(handle, "Window")
                .item(&PredefinedMenuItem::minimize(handle, None)?)
                .item(&PredefinedMenuItem::maximize(handle, None)?)
                .separator()
                .item(&chat_branch)
                .item(&canvas_branch)
                .item(&sidebar_branch)
                .separator()
                .item(&show_all)
                .build()?;

            // Register checkables so the frontend can push state via IPC.
            let checkables: tauri::State<'_, CheckableMenuItems> = handle.state();
            match checkables.items.lock() {
                Ok(mut map) => {
                    map.insert("view:show-chat".to_string(), show_chat);
                    map.insert("view:show-canvas".to_string(), show_canvas);
                    map.insert("view:show-sidebar".to_string(), show_sidebar);
                    map.insert("view:toggle-tabs-autohide".to_string(), auto_hide_chat_tabs);
                }
                Err(e) => eprintln!("CheckableMenuItems mutex poisoned: {e}"),
            }

            // Help menu
            let shortcuts = MenuItemBuilder::new("Keyboard Shortcuts…")
                .id("help:shortcuts")
                .accelerator("CmdOrCtrl+/")
                .build(handle)?;
            let help_menu = SubmenuBuilder::new(handle, "Help")
                .item(&shortcuts)
                .build()?;

            let menu = MenuBuilder::new(handle)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&chat_menu)
                .item(&canvas_menu)
                .item(&view_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;

            // Forward menu events to all windows as a JS event.
            app.on_menu_event(|app_handle, event| {
                let id = event.id().0.clone();
                if let Err(e) = app_handle.emit("menu", id.clone()) {
                    eprintln!("failed to emit menu event {id}: {e}");
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
