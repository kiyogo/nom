use crate::manifest::AppInfo;
use crate::paths::{get_app_dir, get_app_executable_path};

pub fn create_shortcuts(app: &AppInfo) -> Result<(), String> {
    let exe_path = get_app_executable_path(app);
    if let Some(base_dirs) = directories::BaseDirs::new() {
        let apps_dir = base_dirs.data_dir().join("applications");
        let _ = std::fs::create_dir_all(&apps_dir);
        let desktop_file = apps_dir.join(format!("nom-{}.desktop", app.id));
        let content = format!(
            "[Desktop Entry]\nVersion=1.0\nType=Application\nName=Nom {}\nComment={}\nExec={} %F\nTerminal=false\nCategories=Office;\n",
            app.name, app.description, exe_path.display()
        );
        let _ = std::fs::write(desktop_file, content);
    }
    Ok(())
}

pub fn remove_shortcuts(app: &AppInfo) -> Result<(), String> {
    if let Some(base_dirs) = directories::BaseDirs::new() {
        let desktop_file = base_dirs
            .data_dir()
            .join("applications")
            .join(format!("nom-{}.desktop", app.id));
        if desktop_file.exists() {
            let _ = std::fs::remove_file(desktop_file);
        }
    }
    Ok(())
}

pub fn register_control_panel(_app: &AppInfo) -> Result<(), String> {
    Ok(())
}

pub fn unregister_control_panel(_app: &AppInfo) -> Result<(), String> {
    Ok(())
}

pub fn is_registered_in_control_panel(_app_id: &str) -> bool {
    true
}
