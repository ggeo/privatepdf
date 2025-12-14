use serde::{Deserialize, Serialize};
use serde_json::json;
use std::process::Command;
use futures::StreamExt;
use tauri::Emitter;

// Windows-specific imports for process creation flags
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// Windows process creation flags to prevent console windows from appearing
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(target_os = "windows")]
const DETACHED_PROCESS: u32 = 0x00000008;

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaStatus {
    running: bool,
    models_available: bool,
    models: Vec<String>,
}

/// Check if Ollama is running and has models available
#[tauri::command]
pub async fn check_ollama_status() -> Result<OllamaStatus, String> {
    log::info!("Checking Ollama status...");

    let client = reqwest::Client::new();

    // First check if server is up using fast /api/version endpoint
    match client
        .get("http://127.0.0.1:11434/api/version")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                log::info!("Ollama server is running");

                // Now check for models using /api/tags (this is slower but needed for model list)
                match client
                    .get("http://127.0.0.1:11434/api/tags")
                    .timeout(std::time::Duration::from_secs(15))
                    .send()
                    .await
                {
                    Ok(tags_response) => {
                        if tags_response.status().is_success() {
                            match tags_response.json::<serde_json::Value>().await {
                                Ok(data) => {
                                    let models: Vec<String> = data["models"]
                                        .as_array()
                                        .map(|arr| {
                                            arr.iter()
                                                .filter_map(|m| m["name"].as_str().map(String::from))
                                                .collect()
                                        })
                                        .unwrap_or_default();

                                    let has_models = !models.is_empty();

                                    log::info!("Ollama is running, models available: {} (models: {:?})", has_models, models);
                                    Ok(OllamaStatus {
                                        running: true,
                                        models_available: has_models,
                                        models,
                                    })
                                }
                                Err(e) => {
                                    log::warn!("Failed to parse Ollama tags response: {}", e);
                                    Ok(OllamaStatus {
                                        running: true,
                                        models_available: false,
                                        models: vec![],
                                    })
                                }
                            }
                        } else {
                            log::warn!("Ollama tags endpoint returned error: {}", tags_response.status());
                            Ok(OllamaStatus {
                                running: true,
                                models_available: false,
                                models: vec![],
                            })
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to check Ollama tags: {}", e);
                        Ok(OllamaStatus {
                            running: true,
                            models_available: false,
                            models: vec![],
                        })
                    }
                }
            } else {
                log::warn!("Ollama version endpoint returned error: {}", response.status());
                Ok(OllamaStatus {
                    running: false,
                    models_available: false,
                    models: vec![],
                })
            }
        }
        Err(e) => {
            log::info!("Ollama is not running: {}", e);
            Ok(OllamaStatus {
                running: false,
                models_available: false,
                models: vec![],
            })
        }
    }
}

/// Simple ping to check if Ollama is responding (no model check, no popup)
/// Used for Windows WebView2 compatibility where fetch() is blocked
#[tauri::command]
pub async fn ping_ollama() -> Result<bool, String> {
    let client = reqwest::Client::new();

    // Use faster /api/version endpoint (responds almost instantly when server is up)
    match client
        .get("http://127.0.0.1:11434/api/version")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                log::info!("Ollama ping successful - server is ready");
                Ok(true)
            } else {
                log::warn!("Ollama ping returned non-success status: {}", response.status());
                Ok(false)
            }
        },
        Err(e) => {
            log::info!("Ollama ping failed: {}", e);
            Ok(false)
        },
    }
}

/// Attempt to start Ollama service (platform-specific)
#[tauri::command]
pub async fn start_ollama_service() -> Result<String, String> {
    log::info!("Attempting to start Ollama service...");

    #[cfg(target_os = "macos")]
    {
        // On macOS, Ollama installer adds 'ollama' CLI to PATH
        // Method 1: Run "ollama serve" directly (preferred - starts the server)
        log::info!("Attempting to start Ollama server with 'ollama serve'...");
        match Command::new("ollama")
            .arg("serve")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
        {
            Ok(_) => {
                log::info!("Ollama server started via 'ollama serve'");
                return Ok("Ollama starting... Please wait 10-20 seconds for it to initialize.".to_string());
            }
            Err(e) => {
                log::warn!("Failed to run 'ollama serve': {}", e);
            }
        }

        // Method 2: Fallback - Launch the GUI app (it auto-starts the server)
        log::info!("Fallback: Launching Ollama.app with 'open -g -a Ollama'...");
        let _ = Command::new("open")
            .arg("-g")  // Launch in background without stealing focus
            .arg("-a")  // Launch by application name
            .arg("Ollama")
            .spawn();

        log::info!("Ollama app launch attempted");
        Ok("Ollama starting via app... Please wait 10-20 seconds for it to initialize.".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, Ollama has TWO executables:
        // - ollama.exe = THE SERVER (runs "ollama serve" to start API on localhost:11434)
        // - ollama app.exe = GUI settings app (does NOT start the server!)
        // CRITICAL: We need to launch "ollama.exe serve" to start the actual server
        // CRITICAL: Use CREATE_NO_WINDOW | DETACHED_PROCESS to prevent console windows

        log::info!("Attempting to start Ollama server on Windows...");

        // Method 1: Try common installation paths for "ollama.exe" and run with "serve"
        log::info!("Method 1: Checking common installation paths for 'ollama.exe'...");
        let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let userprofile = std::env::var("USERPROFILE").unwrap_or_default();
        let programfiles = std::env::var("PROGRAMFILES").unwrap_or_default();

        log::info!("Environment variables - LOCALAPPDATA: {}, USERPROFILE: {}, PROGRAMFILES: {}", localappdata, userprofile, programfiles);

        let ollama_exe_paths = vec![
            // NEW: PrivatePDF-managed installation (ZIP-based) - Check this first!
            format!(r"{}\PrivatePDF\ollama\ollama.exe", localappdata),
            // Modern Ollama Windows (2025+) - Official installer
            format!(r"{}\Programs\Ollama\ollama.exe", localappdata),
            // System-wide installs
            format!(r"{}\Ollama\ollama.exe", programfiles),
        ];

        log::info!("Will check these paths: {:?}", ollama_exe_paths);

        for (index, path) in ollama_exe_paths.iter().enumerate() {
            log::info!("Checking path {}: {}", index + 1, path);
            if std::path::Path::new(&path).exists() {
                log::info!("✓ Found 'ollama.exe' at: {}", path);
                log::info!("Attempting to launch: {} serve", path);
                // Launch server with "serve" argument, no console window
                match Command::new(&path)
                    .arg("serve")  // CRITICAL: This starts the server!
                    .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
                    .spawn() {
                    Ok(child) => {
                        log::info!("✓ Ollama server spawned successfully! Process ID: {:?}", child.id());
                        return Ok("Ollama server starting. Please wait a few seconds for it to initialize.".to_string());
                    }
                    Err(e) => {
                        log::error!("✗ Failed to spawn ollama server from {}: {} (Error kind: {:?})", path, e, e.kind());
                        continue;
                    }
                }
            } else {
                log::info!("✗ Path does not exist: {}", path);
            }
        }

        // Method 2: Try to find "ollama.exe" in PATH and run with "serve"
        log::info!("Method 2: Searching for 'ollama.exe' in PATH...");
        match Command::new("where")
            .arg("ollama")
            .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
            .output() {
            Ok(output) if output.status.success() => {
                if let Ok(path_str) = String::from_utf8(output.stdout) {
                    let ollama_path = path_str.trim();
                    if !ollama_path.is_empty() && ollama_path.to_lowercase().ends_with("ollama.exe") {
                        log::info!("Found 'ollama.exe' at: {}", ollama_path);
                        // Launch server with "serve" argument
                        match Command::new(ollama_path)
                            .arg("serve")
                            .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
                            .spawn() {
                            Ok(_) => {
                                log::info!("Ollama server started from PATH: {}", ollama_path);
                                return Ok("Ollama server starting. Please wait a few seconds for it to initialize.".to_string());
                            }
                            Err(e) => {
                                log::warn!("Failed to start from PATH: {}", e);
                            }
                        }
                    }
                }
            }
            Err(e) => log::warn!("'where ollama' command failed: {}", e),
            _ => log::warn!("'where ollama' returned no results"),
        }

        // Method 3: Try running "ollama serve" directly (assumes ollama is in PATH)
        log::info!("Method 3: Trying 'ollama serve' command directly...");
        match Command::new("ollama")
            .arg("serve")
            .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
            .spawn() {
            Ok(_) => {
                log::info!("Ollama server started via direct command");
                return Ok("Ollama server starting. Please wait a few seconds for it to initialize.".to_string());
            }
            Err(e) => {
                log::warn!("Failed to run 'ollama serve': {}", e);
            }
        }

        // All methods failed
        log::error!("All methods failed to start Ollama server on Windows");
        Err("Could not find or start Ollama. Please:\n1. Install Ollama from https://ollama.com/download/windows\n2. Or open Command Prompt and run: ollama serve\n3. Then click 'Check Status' in PrivatePDF".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, Ollama runs as a service or background process
        // Strategy: Try multiple methods to find and start Ollama

        // Method 1: Try to find ollama using 'which' command
        log::info!("Method 1: Searching for ollama in PATH...");
        let ollama_binary = match Command::new("which").arg("ollama").output() {
            Ok(output) if output.status.success() => {
                if let Ok(path_str) = String::from_utf8(output.stdout) {
                    let ollama_path = path_str.trim();
                    if !ollama_path.is_empty() {
                        log::info!("Found ollama at: {}", ollama_path);
                        Some(ollama_path.to_string())
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
            _ => {
                log::warn!("'which ollama' command failed or returned no results");
                None
            }
        };

        // Method 2: Check common installation paths if 'which' failed
        let ollama_path = if let Some(path) = ollama_binary {
            path
        } else {
            log::info!("Method 2: Checking common installation paths...");
            let home_path = format!("{}/.local/bin/ollama", std::env::var("HOME").unwrap_or_default());
            let common_paths = vec![
                "/usr/local/bin/ollama",
                "/usr/bin/ollama",
                "/opt/ollama/bin/ollama",
                home_path.as_str(),
            ];

            let mut found_path = None;
            for path in common_paths {
                if std::path::Path::new(path).exists() {
                    log::info!("Found ollama at: {}", path);
                    found_path = Some(path.to_string());
                    break;
                }
            }

            if found_path.is_none() {
                log::error!("Ollama binary not found in PATH or common installation paths");
                return Err("Ollama is not installed or not in PATH. Please install Ollama from https://ollama.com/download/linux".to_string());
            }

            found_path.unwrap()
        };

        // Method 3: Try to start as systemd service first (if available)
        log::info!("Method 3: Checking if Ollama is available as systemd service...");
        match Command::new("systemctl")
            .args(["--user", "status", "ollama"])
            .output()
        {
            Ok(output) => {
                // Check if service exists (exit code 0, 1, or 3 means service exists and is running/stopped)
                // Exit code 4 = Unit not found (skip this!)
                let status_code = output.status.code().unwrap_or(255);
                if status_code <= 3 {
                    log::info!("Ollama systemd service found, attempting to start...");
                    match Command::new("systemctl")
                        .args(["--user", "start", "ollama"])
                        .spawn()
                    {
                        Ok(_) => {
                            log::info!("Ollama started via systemd (user service)");
                            return Ok("Ollama service started via systemd.".to_string());
                        }
                        Err(e) => {
                            log::warn!("Failed to start via systemd user service: {}", e);
                        }
                    }
                } else {
                    log::info!("Ollama systemd service not found (exit code {}), will try direct command", status_code);
                }
            }
            Err(e) => {
                log::warn!("Failed to check systemd status: {}", e);
            }
        }

        // Method 4: Run 'ollama serve' directly in background
        log::info!("Method 4: Starting ollama serve directly...");
        match Command::new(&ollama_path)
            .arg("serve")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
        {
            Ok(_) => {
                log::info!("Ollama started directly from: {}", ollama_path);
                Ok("Ollama service started. Please wait a few seconds for it to initialize.".to_string())
            }
            Err(e) => {
                log::error!("Failed to start Ollama from {}: {}", ollama_path, e);
                Err(format!("Failed to start Ollama. Please start it manually by running 'ollama serve' in a terminal, then click 'Check Status'."))
            }
        }
    }
}

/// Download/pull a model from Ollama with streaming progress
/// Used for Windows where WebView2 blocks fetch to localhost
#[tauri::command]
pub async fn download_ollama_model(
    model_name: String,
    window: tauri::Window,
) -> Result<(), String> {
    log::warn!("Starting download for model: {}", model_name);

    let client = reqwest::Client::new();

    // Call Ollama pull API with streaming enabled
    let response = client
        .post("http://127.0.0.1:11434/api/pull")
        .json(&serde_json::json!({
            "name": model_name,
            "stream": true  // Enable streaming for progress updates
        }))
        .timeout(std::time::Duration::from_secs(1800)) // 30 minute timeout for large models
        .send()
        .await
        .map_err(|e| format!("Failed to start model download: {}", e))?;

    if !response.status().is_success() {
        let error_msg = format!("Failed to download model: HTTP {}", response.status());
        log::error!("{}", error_msg);
        return Err(error_msg);
    }

    // Stream the response and emit progress events
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete JSON lines (newline-delimited JSON)
        while let Some(newline_idx) = buffer.find('\n') {
            let line = buffer[..newline_idx].to_string();
            buffer = buffer[newline_idx + 1..].to_string();

            if line.trim().is_empty() {
                continue;
            }

            // Parse JSON line and emit progress
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&line) {
                let status = data.get("status").and_then(|s| s.as_str()).unwrap_or("");
                let total = data.get("total").and_then(|t| t.as_u64()).unwrap_or(0);
                let completed = data.get("completed").and_then(|c| c.as_u64()).unwrap_or(0);

                // Calculate percentage
                let percent = if total > 0 {
                    (completed as f64 / total as f64) * 100.0
                } else {
                    0.0
                };

                // Emit progress event for frontend
                window.emit("model_download_progress", json!({
                    "model": model_name,
                    "status": status,
                    "total": total,
                    "completed": completed,
                    "percent": percent
                })).ok();

                // Check for error in response
                if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                    log::error!("Ollama pull error: {}", error);
                    return Err(format!("Ollama error: {}", error));
                }
            }
        }
    }

    log::warn!("Successfully downloaded model: {}", model_name);
    Ok(())
}

/// Stop Ollama service when app closes
#[tauri::command]
pub async fn stop_ollama_service() -> Result<String, String> {
    log::info!("Attempting to stop Ollama service...");

    #[cfg(target_os = "macos")]
    {
        match Command::new("pkill").arg("-f").arg("ollama").spawn() {
            Ok(_) => {
                log::info!("Ollama stop command sent (macOS)");
                Ok("Ollama service stopped".to_string())
            }
            Err(e) => {
                log::warn!("Failed to stop Ollama on macOS: {}", e);
                Err(format!("Failed to stop Ollama: {}", e))
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        log::info!("Executing: taskkill /F /IM ollama.exe");
        match Command::new("taskkill")
            .arg("/F")
            .arg("/IM")
            .arg("ollama.exe")
            .output()  // Use .output() instead of .spawn() to wait for completion
        {
            Ok(output) => {
                if output.status.success() {
                    log::info!("✓ Ollama stopped successfully (Windows)");
                    Ok("Ollama service stopped".to_string())
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::warn!("taskkill returned error: {}", stderr);
                    // Return Ok anyway - process might not be running
                    Ok("Ollama stop attempted (may not have been running)".to_string())
                }
            }
            Err(e) => {
                log::error!("Failed to execute taskkill: {}", e);
                Err(format!("Failed to stop Ollama: {}", e))
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Try pkill directly (most reliable)
        match Command::new("pkill").arg("-f").arg("ollama serve").output() {
            Ok(output) => {
                if output.status.success() {
                    log::info!("Ollama stopped via pkill (Linux)");
                    Ok("Ollama service stopped".to_string())
                } else {
                    // pkill returns 1 if no processes matched - this is fine
                    log::info!("Ollama may not be running or already stopped");
                    Ok("Ollama service stopped (or not running)".to_string())
                }
            }
            Err(e) => {
                log::warn!("Failed to stop Ollama on Linux: {}", e);
                // Don't return error - just log it, app should close anyway
                Ok("Ollama stop attempted".to_string())
            }
        }
    }
}


#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub message: ChatMessage,
}

/// Chat with Ollama (non-streaming) - Windows only
#[tauri::command]
pub async fn ollama_chat(
    model: String,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    top_p: Option<f32>,
) -> Result<String, String> {
    log::info!("Ollama chat request: model={}, messages={}", model, messages.len());

    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:11434/api/chat")
        .json(&json!({
            "model": model,
            "messages": messages,
            "stream": false,
            "options": {
                "temperature": temperature.unwrap_or(0.2),
                "num_predict": max_tokens.unwrap_or(4096),
                "top_p": top_p.unwrap_or(0.9),
                "repeat_penalty": 1.1,
                "repeat_last_n": 64,
            }
        }))
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Chat request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Chat failed: HTTP {}", response.status()));
    }

    let data: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    log::info!("Chat response received: {} chars", data.message.content.len());
    Ok(data.message.content)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmbeddingResponse {
    pub embedding: Vec<f64>,
}

/// Generate embedding - Windows only
#[tauri::command]
pub async fn ollama_embedding(model: String, text: String) -> Result<Vec<f64>, String> {
    log::info!("Ollama embedding request: model={}, text_len={}", model, text.len());

    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:11434/api/embeddings")
        .json(&json!({
            "model": model,
            "prompt": text,
        }))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Embedding request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Embedding failed: HTTP {}", response.status()));
    }

    let data: EmbeddingResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    log::info!("Embedding generated: {} dimensions", data.embedding.len());
    Ok(data.embedding)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub content: String,
    pub done: bool,
}

/// Chat with Ollama (streaming) - Windows only
/// Returns chunks as they arrive for better UX
#[tauri::command]
pub async fn ollama_chat_stream(
    model: String,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    top_p: Option<f32>,
    window: tauri::Window,
) -> Result<(), String> {
    log::info!("Ollama streaming chat request: model={}, messages={}", model, messages.len());

    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:11434/api/chat")
        .json(&json!({
            "model": model,
            "messages": messages,
            "stream": true,
            "options": {
                "temperature": temperature.unwrap_or(0.2),
                "num_predict": max_tokens.unwrap_or(4096),
                "num_ctx": 16384,
                "top_p": top_p.unwrap_or(0.9),
                "repeat_penalty": 1.1,
                "repeat_last_n": 64,
            }
        }))
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Chat request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Chat failed: HTTP {}", response.status()));
    }

    log::info!("Streaming response started, processing chunks...");

    // Read response as stream
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete JSON lines
        while let Some(newline_idx) = buffer.find('\n') {
            let line = buffer[..newline_idx].to_string();
            buffer = buffer[newline_idx + 1..].to_string();

            if line.trim().is_empty() {
                continue;
            }

            // Parse JSON line
            match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(data) => {
                    if let Some(content) = data.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                        let done = data.get("done").and_then(|d| d.as_bool()).unwrap_or(false);

                        // Emit chunk to frontend
                        window.emit("ollama_stream_chunk", StreamChunk {
                            content: content.to_string(),
                            done,
                        }).ok();
                    }

                    if data.get("error").is_some() {
                        let error = data.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
                        return Err(format!("Ollama error: {}", error));
                    }
                }
                Err(e) => {
                    log::warn!("Failed to parse JSON line: {}", e);
                }
            }
        }
    }

    log::info!("Streaming completed successfully");
    Ok(())
}

/// Download and install Ollama from ZIP (Windows only)
/// Automatically detects AMD GPU and downloads appropriate version
#[tauri::command]
pub async fn download_ollama_zip(
    is_amd_gpu: bool,
    #[allow(unused_variables)] window: tauri::Window,
) -> Result<String, String> {
    log::info!("Starting Ollama ZIP installation (AMD GPU: {})", is_amd_gpu);

    // Only support Windows for now
    #[cfg(not(target_os = "windows"))]
    {
        return Err("ZIP installation only supported on Windows".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        use std::path::Path;

        // 1. Determine download URL based on GPU
        let url = if is_amd_gpu {
            "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64-rocm.zip"
        } else {
            "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip"
        };

        log::info!("Downloading from: {}", url);
        window.emit("ollama_download_status", json!({"status": "downloading", "message": "Starting download..."})).ok();

        // 2. Get installation path
        let localappdata = std::env::var("LOCALAPPDATA")
            .map_err(|e| format!("Failed to get LOCALAPPDATA: {}", e))?;
        let install_path = Path::new(&localappdata).join("PrivatePDF").join("ollama");
        let temp_zip_path = Path::new(&localappdata).join("PrivatePDF").join("ollama_temp.zip");

        log::info!("Will install to: {}", install_path.display());
        log::info!("Temp ZIP path: {}", temp_zip_path.display());

        // 3. Create parent directory if needed
        if let Some(parent) = temp_zip_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create temp directory: {}", e))?;
        }

        // 4. Download with progress events
        let client = reqwest::Client::new();
        let response = client
            .get(url)
            .timeout(std::time::Duration::from_secs(600)) // 10 minutes for large download
            .send()
            .await
            .map_err(|e| format!("Download request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Download failed: HTTP {}", response.status()));
        }

        let total_size = response.content_length().unwrap_or(0);
        log::info!("Download size: {} bytes ({:.2} MB)", total_size, total_size as f64 / 1_048_576.0);

        // Stream download with progress
        let mut downloaded = 0u64;
        let mut file = std::fs::File::create(&temp_zip_path)
            .map_err(|e| format!("Failed to create temp file: {}", e))?;

        let mut stream = response.bytes_stream();
        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| format!("Download stream error: {}", e))?;

            file.write_all(&chunk)
                .map_err(|e| format!("Failed to write to temp file: {}", e))?;

            downloaded += chunk.len() as u64;

            // Emit progress event every 1MB
            if downloaded % 1_048_576 < chunk.len() as u64 || downloaded == total_size {
                let percent = if total_size > 0 {
                    (downloaded as f64 / total_size as f64) * 100.0
                } else {
                    0.0
                };

                window.emit("ollama_download_progress", json!({
                    "downloaded": downloaded,
                    "total": total_size,
                    "percent": percent
                })).ok();

                log::info!("Download progress: {:.1}% ({} / {} bytes)", percent, downloaded, total_size);
            }
        }

        log::info!("Download completed: {} bytes", downloaded);
        window.emit("ollama_download_status", json!({"status": "extracting", "message": "Extracting files..."})).ok();

        // 5. Extract ZIP
        let zip_file = std::fs::File::open(&temp_zip_path)
            .map_err(|e| format!("Failed to open ZIP file: {}", e))?;

        let mut archive = zip::ZipArchive::new(zip_file)
            .map_err(|e| format!("Failed to read ZIP archive: {}", e))?;

        // Create installation directory
        std::fs::create_dir_all(&install_path)
            .map_err(|e| format!("Failed to create installation directory: {}", e))?;

        let total_files = archive.len();
        log::info!("Extracting {} files...", total_files);

        for i in 0..total_files {
            let mut file = archive.by_index(i)
                .map_err(|e| format!("Failed to access ZIP entry: {}", e))?;

            let outpath = match file.enclosed_name() {
                Some(path) => install_path.join(path),
                None => continue,
            };

            if file.name().ends_with('/') {
                // Directory
                std::fs::create_dir_all(&outpath)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            } else {
                // File
                if let Some(p) = outpath.parent() {
                    std::fs::create_dir_all(p)
                        .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                }
                let mut outfile = std::fs::File::create(&outpath)
                    .map_err(|e| format!("Failed to create output file: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to extract file: {}", e))?;
            }

            // Emit extraction progress
            if i % 10 == 0 || i == total_files - 1 {
                let percent = ((i + 1) as f64 / total_files as f64) * 100.0;
                window.emit("ollama_extraction_progress", json!({
                    "current": i + 1,
                    "total": total_files,
                    "percent": percent
                })).ok();
            }
        }

        log::info!("Extraction completed");

        // 6. Clean up temp ZIP file
        std::fs::remove_file(&temp_zip_path).ok();

        // 7. Verify ollama.exe exists
        let ollama_exe = install_path.join("ollama.exe");
        if !ollama_exe.exists() {
            return Err("Extraction failed: ollama.exe not found".to_string());
        }

        log::info!("Ollama successfully installed to: {}", install_path.display());
        window.emit("ollama_download_status", json!({"status": "completed", "message": "Installation complete!"})).ok();

        Ok(format!("Installed to: {}", install_path.display()))
    }
}
