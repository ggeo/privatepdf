// Import our custom modules
mod ollama;
mod settings;

use tauri::{Manager, Listener, Emitter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Register Tauri plugins
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_process::init())
    .plugin(
      tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Warn) // Only log warnings and errors to reduce log spam
        .targets([
          tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
          tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
        ])
        .build(),
    )
    // Register our custom commands
    .invoke_handler(tauri::generate_handler![
      ollama::check_ollama_status,
      ollama::ping_ollama,
      ollama::start_ollama_service,
      ollama::stop_ollama_service,
      ollama::download_ollama_model,
      ollama::download_ollama_zip,
      ollama::ollama_chat,
      ollama::ollama_embedding,
      ollama::ollama_chat_stream,
      settings::save_settings,
      settings::load_settings,
      settings::reset_settings,
    ])
    .setup(|app| {
      // Get the main window
      let window = app.get_webview_window("main").unwrap();

      // Listen for file open events (when user opens PDF/DOC with app)
      let window_clone = window.clone();
      app.listen("tauri://file-drop", move |event| {
        let path_str = event.payload();
        log::info!("File opened: {}", path_str);
        // Emit event to frontend with the file path
        let _ = window_clone.emit("file-opened", path_str);
      });

      // Listen for window close event
      window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
          log::info!("Window closing, stopping Ollama service...");
          // Stop Ollama service when window closes (blocking to ensure it completes)
          tauri::async_runtime::block_on(async {
            let _ = ollama::stop_ollama_service().await;
          });
        }
      });

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
