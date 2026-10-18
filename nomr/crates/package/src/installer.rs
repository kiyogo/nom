use crate::install::{create_app_files_from_source, find_bundled_executable, InstallProgress};
use crate::manifest::AppInfo;
use tokio::sync::mpsc;

#[derive(Debug, Clone)]
pub enum InstallEvent {
    Progress {
        app_id: String,
        progress: f32,
        speed_mbps: f32,
        copied_mb: f32,
        total_mb: f32,
    },
    Verifying {
        app_id: String,
    },
    Finalizing {
        app_id: String,
    },
    Completed {
        app_id: String,
    },
    Failed {
        app_id: String,
        error: String,
    },
}

pub struct LocalInstaller;

impl LocalInstaller {
    /// Installs the executable bundled beside the Hub. Missing bundles fail
    /// clearly; progress reflects bytes copied instead of simulated traffic.
    pub fn start_install(app: AppInfo, tx: mpsc::Sender<InstallEvent>) {
        tokio::spawn(async move {
            let app_id = app.id.clone();
            let Some(source) = find_bundled_executable(&app) else {
                let _ = tx
                    .send(InstallEvent::Failed {
                        app_id,
                        error: format!(
                            "Không tìm thấy {} cạnh Nom Software Hub. Hãy đặt nom-{}.exe cùng thư mục với Hub.",
                            app.executable_name, app.id
                        ),
                    })
                    .await;
                return;
            };

            let worker_tx = tx.clone();
            let worker_app = app.clone();
            let result = tokio::task::spawn_blocking(move || {
                create_app_files_from_source(&worker_app, &source, |stage| {
                    let event = match stage {
                        InstallProgress::Copying {
                            copied,
                            total,
                            elapsed_seconds,
                        } => {
                            let copied_mb = copied as f32 / (1024.0 * 1024.0);
                            let total_mb = total as f32 / (1024.0 * 1024.0);
                            let speed_mbps = if elapsed_seconds > 0.01 {
                                copied_mb / elapsed_seconds
                            } else {
                                0.0
                            };
                            InstallEvent::Progress {
                                app_id: worker_app.id.clone(),
                                progress: if total > 0 { copied as f32 / total as f32 } else { 0.0 },
                                speed_mbps,
                                copied_mb: copied_mb.min(total_mb),
                                total_mb,
                            }
                        }
                        InstallProgress::Verifying => InstallEvent::Verifying {
                            app_id: worker_app.id.clone(),
                        },
                        InstallProgress::Finalizing => InstallEvent::Finalizing {
                            app_id: worker_app.id.clone(),
                        },
                    };
                    let _ = worker_tx.blocking_send(event);
                })
            })
            .await;

            let error = match result {
                Ok(Ok(())) => {
                    let _ = tx.send(InstallEvent::Completed { app_id }).await;
                    return;
                }
                Ok(Err(error)) => error,
                Err(error) => format!("Tác vụ cài đặt bị dừng: {error}"),
            };
            let _ = tx.send(InstallEvent::Failed { app_id, error }).await;
        });
    }
}
