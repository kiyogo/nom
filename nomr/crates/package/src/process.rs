use crate::manifest::AppInfo;
use crate::paths::{get_app_dir, get_app_executable_path};
use std::process::Command;

pub fn launch_app(app: &AppInfo) -> Result<(), String> {
    let app_dir = get_app_dir(&app.id);
    let exe = get_app_executable_path(app);

    if exe.exists() {
        let mut cmd = Command::new(&exe);
        cmd.current_dir(&app_dir);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const DETACHED_PROCESS: u32 = 0x00000008;
            cmd.creation_flags(DETACHED_PROCESS);
        }

        cmd.spawn()
            .map_err(|e| format!("Không thể khởi chạy {}: {}", app.name, e))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let cmd_path = app_dir.join(format!("{}.cmd", app.id));
        if cmd_path.exists() {
            let mut cmd = Command::new("cmd.exe");
            cmd.args(["/c", "start", "", &cmd_path.display().to_string()]);
            cmd.current_dir(&app_dir);
            cmd.spawn().map_err(|e| format!("Lỗi khởi chạy {}: {}", app.name, e))?;
            return Ok(());
        }
    }

    Err(format!("Tệp thực thi không tồn tại: {}", exe.display()))
}
