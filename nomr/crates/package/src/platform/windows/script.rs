use crate::manifest::AppInfo;
use std::path::Path;

pub fn generate_uninstaller_script(app: &AppInfo, app_dir: &Path) -> Result<(), String> {
    let key_name = format!(
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Nom_{}",
        app.id
    );
    let uninstaller_bat = app_dir.join("uninstall.cmd");

    let script = format!(
        "@echo off\r\n\
         reg delete \"{}\" /f >nul 2>&1\r\n\
         powershell -NoProfile -NonInteractive -Command \"$d=[Environment]::GetFolderPath('Desktop'); $l1=Join-Path $d 'Nom {}.lnk'; if (Test-Path $l1) {{ Remove-Item $l1 -Force }}; $s=[Environment]::GetFolderPath('Programs'); $l2=Join-Path $s 'Nom Office\\Nom {}.lnk'; if (Test-Path $l2) {{ Remove-Item $l2 -Force }}\" >nul 2>&1\r\n\
         cd /d \"%TEMP%\"\r\n\
         timeout /t 1 /nobreak >nul\r\n\
         rmdir /s /q \"{}\" >nul 2>&1\r\n",
        key_name,
        app.name,
        app.name,
        app_dir.display()
    );

    std::fs::write(&uninstaller_bat, script).map_err(|e| format!("Không thể tạo script gỡ cài đặt: {}", e))
}

pub fn generate_launcher_script(app: &AppInfo, app_dir: &Path) -> Result<(), String> {
    let mut exe_name = app.executable_name.clone();
    if !exe_name.to_ascii_lowercase().ends_with(".exe") {
        exe_name.push_str(".exe");
    }

    let cmd_script = format!(
        "@echo off\r\n\
         title Nom {}\r\n\
         echo [Nom Office] Khoi chay Nom {} (Phien ban {})...\r\n\
         if exist \"%~dp0{}\" (\r\n\
             start \"\" \"%~dp0{}\"\r\n\
         ) else (\r\n\
             powershell -NoProfile -Command \"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Nom {} v{} da duoc khoi chay thanh cong!', 'Nom Office', 0, 64)\" >nul 2>&1\r\n\
         )\r\n",
        app.name, app.name, app.version, exe_name, exe_name, app.name, app.version
    );

    std::fs::write(app_dir.join(format!("{}.cmd", app.id)), cmd_script)
        .map_err(|e| format!("Không thể tạo script launcher: {}", e))
}
