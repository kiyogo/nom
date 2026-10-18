use crate::manifest::AppInfo;
use crate::paths::{get_app_dir, get_app_executable_path};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

#[link(name = "advapi32")]
extern "system" {
    fn RegOpenKeyExW(hKey: isize, lpSubKey: *const u16, ulOptions: u32, samDesired: u32, phkResult: *mut isize) -> i32;

    fn RegCreateKeyExW(
        hKey: isize,
        lpSubKey: *const u16,
        Reserved: u32,
        lpClass: *const u16,
        dwOptions: u32,
        samDesired: u32,
        lpSecurityAttributes: *const std::ffi::c_void,
        phkResult: *mut isize,
        lpdwDisposition: *mut u32,
    ) -> i32;

    fn RegSetValueExW(
        hKey: isize,
        lpValueName: *const u16,
        Reserved: u32,
        dwType: u32,
        lpData: *const u8,
        cbData: u32,
    ) -> i32;

    fn RegDeleteKeyW(hKey: isize, lpSubKey: *const u16) -> i32;

    fn RegCloseKey(hKey: isize) -> i32;
}

const HKEY_CURRENT_USER: isize = 0x80000001u32 as isize;
const KEY_READ: u32 = 0x20019;
const KEY_ALL_ACCESS: u32 = 0xF003F;
const REG_SZ: u32 = 1;
const REG_DWORD: u32 = 4;

fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

fn set_str(hkey: isize, name: &str, val: &str) {
    let name_w = to_wide(name);
    let val_w = to_wide(val);
    unsafe {
        RegSetValueExW(
            hkey,
            name_w.as_ptr(),
            0,
            REG_SZ,
            val_w.as_ptr() as *const u8,
            (val_w.len() * 2) as u32,
        );
    }
}

fn set_dword(hkey: isize, name: &str, val: u32) {
    let name_w = to_wide(name);
    unsafe {
        RegSetValueExW(hkey, name_w.as_ptr(), 0, REG_DWORD, &val as *const u32 as *const u8, 4);
    }
}

pub fn register_control_panel(app: &AppInfo) -> Result<(), String> {
    let exe_path = get_app_executable_path(app);
    let app_dir = get_app_dir(&app.id);
    let subkey = format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Nom_{}", app.id);
    let subkey_w = to_wide(&subkey);
    let uninstaller_bat = app_dir.join("uninstall.cmd");
    let uninstall_cmd = format!("cmd.exe /c \"{}\"", uninstaller_bat.display());
    let size_kb = (app.size_mb * 1024.0) as u32;

    let mut hkey: isize = 0;
    let mut disp: u32 = 0;
    let res = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            subkey_w.as_ptr(),
            0,
            std::ptr::null(),
            0,
            KEY_ALL_ACCESS,
            std::ptr::null(),
            &mut hkey,
            &mut disp,
        )
    };

    if res != 0 || hkey == 0 {
        return Err(format!("Không thể tạo registry key: error code {}", res));
    }

    set_str(hkey, "DisplayName", &format!("Nom {}", app.name));
    set_str(hkey, "DisplayVersion", &app.version);
    set_str(hkey, "Publisher", "Nom Office");
    set_str(hkey, "InstallLocation", &app_dir.display().to_string());
    set_str(hkey, "DisplayIcon", &exe_path.display().to_string());
    set_str(hkey, "UninstallString", &uninstall_cmd);
    set_str(hkey, "QuietUninstallString", &uninstall_cmd);
    set_str(hkey, "Comments", &app.description);
    set_dword(hkey, "NoModify", 1);
    set_dword(hkey, "NoRepair", 1);
    set_dword(hkey, "EstimatedSize", size_kb);

    unsafe {
        RegCloseKey(hkey);
    }

    Ok(())
}

pub fn unregister_control_panel(app: &AppInfo) -> Result<(), String> {
    let subkey = format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Nom_{}", app.id);
    let subkey_w = to_wide(&subkey);
    unsafe {
        RegDeleteKeyW(HKEY_CURRENT_USER, subkey_w.as_ptr());
    }
    Ok(())
}

pub fn is_registered_in_control_panel(app_id: &str) -> bool {
    let subkey = format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Nom_{}", app_id);
    let subkey_w = to_wide(&subkey);

    let mut hkey: isize = 0;
    unsafe {
        let res = RegOpenKeyExW(HKEY_CURRENT_USER, subkey_w.as_ptr(), 0, KEY_READ, &mut hkey);
        if res == 0 && hkey != 0 {
            let _ = RegCloseKey(hkey);
            true
        } else {
            false
        }
    }
}
