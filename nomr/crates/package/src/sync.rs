use crate::install::find_bundled_executable;
use crate::manifest::{AppInfo, AppStatus};
use crate::paths::get_app_executable_path;
use crate::platform::is_registered_in_control_panel;

pub fn is_app_installed(app: &AppInfo) -> bool {
    let exe = get_app_executable_path(app);
    if !exe.exists() {
        return false;
    }
    is_registered_in_control_panel(&app.id)
}

pub fn sync_installed_status(apps: &mut [AppInfo]) {
    for app in apps.iter_mut() {
        // Bỏ qua khi ứng dụng đang trong tiến trình tải/giải nén
        if matches!(
            app.status,
            AppStatus::Installing { .. } | AppStatus::Verifying | AppStatus::Extracting
        ) {
            continue;
        }

        let installed_exe = get_app_executable_path(app);
        let measured_exe = if installed_exe.is_file() {
            Some(installed_exe)
        } else {
            find_bundled_executable(app)
        };
        if let Some(path) = measured_exe {
            if let Ok(metadata) = std::fs::metadata(path) {
                app.size_mb = metadata.len() as f32 / (1024.0 * 1024.0);
            }
        }

        if is_app_installed(app) {
            app.status = AppStatus::Installed {
                version: app.version.clone(),
            };
        } else {
            app.status = AppStatus::NotInstalled;
        }
    }
}
