use crate::manifest::AppInfo;
use std::path::PathBuf;

pub fn get_install_root() -> PathBuf {
    if let Some(proj_dirs) = directories::ProjectDirs::from("org", "NomOffice", "Nom") {
        proj_dirs.data_local_dir().to_path_buf()
    } else {
        PathBuf::from("./installed_apps")
    }
}

pub fn get_app_dir(app_id: &str) -> PathBuf {
    get_install_root().join(app_id)
}

pub fn get_app_executable_path(app: &AppInfo) -> PathBuf {
    let mut exe_name = app.executable_name.clone();
    if cfg!(target_os = "windows") && !exe_name.ends_with(".exe") {
        exe_name.push_str(".exe");
    }
    get_app_dir(&app.id).join(exe_name)
}
