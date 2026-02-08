// Server lifecycle management: port checking, health polling, logging, process spawn/shutdown.

use std::fs::{self, File, OpenOptions};
use std::net::TcpStream;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use tauri::Manager;

const SERVER_PORT: u16 = 3847;

/// Check whether a TCP port is free to bind on localhost.
///
/// Returns `true` if nothing is listening (connection refused),
/// `false` if something already occupies the port.
fn check_port_available(port: u16) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    let timeout = Duration::from_millis(200);

    match TcpStream::connect_timeout(&addr.parse().unwrap(), timeout) {
        Ok(_) => {
            // Connection succeeded; something is already listening.
            false
        }
        Err(e) => {
            let kind = e.kind();
            if kind == std::io::ErrorKind::ConnectionRefused {
                // Nothing listening; port is free.
                true
            } else {
                eprintln!("[voxtube] Warning: unexpected error probing port {}: {}", port, e);
                false
            }
        }
    }
}

/// Poll the server's health endpoint until it responds with HTTP 200,
/// or until `timeout` has elapsed.
fn wait_for_server(port: u16, timeout: Duration) -> Result<(), String> {
    let url = format!("http://localhost:{}/api/health", port);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let start = Instant::now();
    let poll_interval = Duration::from_millis(200);

    loop {
        if start.elapsed() > timeout {
            return Err(format!(
                "Server did not become healthy within {}s",
                timeout.as_secs()
            ));
        }

        match client.get(&url).send() {
            Ok(resp) if resp.status().is_success() => return Ok(()),
            _ => {}
        }

        std::thread::sleep(poll_interval);
    }
}

/// Create the logs directory and open a log file for server stdout/stderr.
///
/// Returns a pair of file handles (stdout, stderr) that both point to the
/// same `voxtube-server.log` file in append mode.
fn setup_logging(app_data_dir: &Path) -> Result<(File, File), String> {
    let logs_dir = app_data_dir.join("logs");
    fs::create_dir_all(&logs_dir)
        .map_err(|e| format!("Failed to create logs directory at {}: {}", logs_dir.display(), e))?;

    let log_path = logs_dir.join("voxtube-server.log");

    let stdout_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open log file {}: {}", log_path.display(), e))?;

    let stderr_file = stdout_file
        .try_clone()
        .map_err(|e| format!("Failed to clone log file handle: {}", e))?;

    Ok((stdout_file, stderr_file))
}

/// Spawn the bundled Bun server binary and wait for it to become healthy.
///
/// The child process is returned so the caller can hold onto it and
/// shut it down later via `shutdown_server`.
pub fn start_server(app: &tauri::AppHandle) -> Result<Child, String> {
    // Determine the architecture-specific binary name.
    let arch_suffix = match std::env::consts::ARCH {
        "aarch64" => "aarch64",
        "x86_64" => "x86_64",
        other => return Err(format!("Unsupported architecture: {}", other)),
    };
    let binary_name = format!("voxtube-server-{}", arch_suffix);

    // Resolve paths from the app bundle.
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to resolve resource directory: {}", e))?;

    let server_path = resource_dir.join("binaries").join(&binary_name);
    let yt_cli_path = resource_dir.join("binaries").join("yt");

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;

    // Set up log file handles.
    let (stdout_file, stderr_file) = setup_logging(&app_data_dir)?;

    // Ensure the port is free before attempting to spawn.
    if !check_port_available(SERVER_PORT) {
        return Err(format!(
            "Port {} is already in use. Is another instance of VoxTube running?",
            SERVER_PORT
        ));
    }

    // Spawn the server process.
    let cache_dir = app_data_dir.join("cache");
    let mut child = Command::new(&server_path)
        .env("CACHE_DIR", cache_dir.to_string_lossy().as_ref())
        .env("YT_CLI_PATH", yt_cli_path.to_string_lossy().as_ref())
        .env("PORT", SERVER_PORT.to_string())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .spawn()
        .map_err(|e| format!("Failed to spawn server binary {}: {}", server_path.display(), e))?;

    // Wait for the server to respond to health checks.
    if let Err(msg) = wait_for_server(SERVER_PORT, Duration::from_secs(4)) {
        eprintln!("[voxtube] Health check failed, killing server process: {}", msg);
        let _ = child.kill();
        let _ = child.wait();
        return Err(msg);
    }

    Ok(child)
}

/// Gracefully shut down the server process.
///
/// On Unix, sends SIGTERM first and waits up to 2 seconds for a clean exit,
/// falling back to SIGKILL if the process does not terminate.
/// On other platforms, kills the process immediately.
pub fn shutdown_server(child: &mut Child) {
    graceful_shutdown_impl(child);
}

#[cfg(unix)]
fn graceful_shutdown_impl(child: &mut Child) {
    let pid = child.id() as i32;
    // SAFETY: We own the child process and are sending a standard signal.
    unsafe {
        libc::kill(pid, libc::SIGTERM);
    }

    // Wait up to 2 seconds for the process to exit gracefully.
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => {
                if Instant::now() >= deadline {
                    eprintln!("[voxtube] Server did not exit after SIGTERM; sending SIGKILL");
                    let _ = child.kill();
                    let _ = child.wait();
                    return;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                eprintln!("[voxtube] Error checking server process status: {}", e);
                let _ = child.kill();
                let _ = child.wait();
                return;
            }
        }
    }
}

#[cfg(not(unix))]
fn graceful_shutdown_impl(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}
