#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;
use voxtube_lib::{shutdown_server, start_server};

/// Holds the Bun server child process, protected by a mutex so event
/// handlers on different threads can safely access it.
struct ServerState {
    child: Option<std::process::Child>,
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(ServerState { child: None }))
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Register a close handler on the main window so we can
            // tear down the server and quit the app on macOS (where
            // closing the last window does not exit the process).
            let close_handle = app_handle.clone();
            app.get_webview_window("main")
                .expect("main window not found")
                .on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        let state = close_handle.state::<Mutex<ServerState>>();
                        let mut guard = state.lock().unwrap();
                        if let Some(ref mut child) = guard.child {
                            shutdown_server(child);
                        }
                        close_handle.exit(0);
                    }
                });

            // Spawn a thread to start the Bun server so the window
            // renders immediately rather than blocking on startup.
            std::thread::spawn(move || {
                let window = app_handle
                    .get_webview_window("main")
                    .expect("main window not found");

                match start_server(&app_handle) {
                    Ok(child) => {
                        // Store the child process in managed state.
                        let state = app_handle.state::<Mutex<ServerState>>();
                        let mut guard = state.lock().unwrap();
                        guard.child = Some(child);
                        drop(guard);

                        // Navigate the webview to the running server.
                        let _ = window.navigate("http://localhost:3847".parse().unwrap());
                    }
                    Err(error_msg) => {
                        // Inject the error message into the error page.
                        let escaped = error_msg.replace('\'', "\\'");
                        let _ = window.eval(&format!(
                            "document.getElementById('error-message').textContent = '{}';",
                            escaped
                        ));
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build tauri application")
        .run(|app_handle, event| {
            // Safety net: ensure the server process is cleaned up on exit,
            // even if the close handler did not fire (e.g. force quit).
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<Mutex<ServerState>>();
                let mut guard = state.lock().unwrap();
                if let Some(ref mut child) = guard.child {
                    shutdown_server(child);
                }
            }
        });
}
