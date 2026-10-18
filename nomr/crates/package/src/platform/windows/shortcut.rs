use crate::manifest::AppInfo;
use crate::paths::{get_app_dir, get_app_executable_path};
use std::process::Command;

pub fn create_shortcuts(app: &AppInfo) -> Result<(), String> {
    let exe_path = get_app_executable_path(app);
    let app_dir = get_app_dir(&app.id);

    if let Some(user_dirs) = directories::UserDirs::new() {
        if let Some(desktop) = user_dirs.desktop_dir() {
            let shortcut_path = desktop.join(format!("Nom {}.lnk", app.name));
            let vbs_path = std::env::temp_dir().join(format!("create_shortcut_{}.vbs", app.id));
            let clean_desc = app
                .description
                .replace('"', "\"\"")
                .replace('\r', " ")
                .replace('\n', " ");
            let vbs_content = format!(
                "Set ws = CreateObject(\"WScript.Shell\")\r\n\
                 Set sc = ws.CreateShortcut(\"{}\")\r\n\
                 sc.TargetPath = \"{}\"\r\n\
                 sc.WorkingDirectory = \"{}\"\r\n\
                 sc.Description = \"{}\"\r\n\
                 sc.Save\r\n",
                shortcut_path.display(),
                exe_path.display(),
                app_dir.display(),
                clean_desc
            );
            if std::fs::write(&vbs_path, vbs_content).is_ok() {
                let _ = Command::new("cscript.exe")
                    .args(["//B", "//Nologo", "//T:3", vbs_path.to_str().unwrap_or("")])
                    .output();
                let _ = std::fs::remove_file(vbs_path);
            }
        }
    }
    Ok(())
}

pub fn remove_shortcuts(app: &AppInfo) -> Result<(), String> {
    if let Some(user_dirs) = directories::UserDirs::new() {
        if let Some(desktop) = user_dirs.desktop_dir() {
            let shortcut_path = desktop.join(format!("Nom {}.lnk", app.name));
            if shortcut_path.exists() {
                let _ = std::fs::remove_file(shortcut_path);
            }
        }
    }
    Ok(())
}
