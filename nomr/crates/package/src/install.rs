use crate::manifest::AppInfo;
use crate::paths::{get_app_dir, get_app_executable_path};
use crate::platform::{create_shortcuts, register_control_panel, remove_shortcuts, unregister_control_panel};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use crate::platform::{generate_launcher_script, generate_uninstaller_script};

#[derive(Debug, Clone, Copy)]
pub enum InstallProgress {
    Copying {
        copied: u64,
        total: u64,
        elapsed_seconds: f32,
    },
    Verifying,
    Finalizing,
}

pub fn find_bundled_executable(app: &AppInfo) -> Option<PathBuf> {
    let mut executable_name = app.executable_name.clone();
    if cfg!(target_os = "windows") && !executable_name.to_ascii_lowercase().ends_with(".exe") {
        executable_name.push_str(".exe");
    }
    let mut directories = Vec::new();
    if let Some(current) = std::env::current_exe().ok() {
        let mut directory = current.parent();
        for _ in 0..4 {
            let Some(path) = directory else {
                break;
            };
            directories.push(path.to_path_buf());
            directory = path.parent();
        }
    }
    if let Ok(current_dir) = std::env::current_dir() {
        directories.push(current_dir.join("target").join("release"));
        directories.push(current_dir.join("target").join("debug"));
    }
    directories
        .into_iter()
        .map(|directory| directory.join(&executable_name))
        .find(|candidate| candidate.is_file())
}

pub fn create_app_files(app: &AppInfo) -> Result<(), String> {
    let source = find_bundled_executable(app).ok_or_else(|| {
        format!(
            "Không tìm thấy gói Nom {} cạnh Hub; không cài bằng tệp thực thi giả.",
            app.name
        )
    })?;
    create_app_files_from_source(app, &source, |_| {})
}

pub fn create_app_files_from_source(
    app: &AppInfo,
    source: &Path,
    mut report: impl FnMut(InstallProgress),
) -> Result<(), String> {
    if !source.is_file() {
        return Err(format!("Gói ứng dụng không tồn tại: {}", source.display()));
    }
    let app_dir = get_app_dir(&app.id);
    fs::create_dir_all(&app_dir).map_err(|e| format!("Không thể tạo thư mục {}: {}", app_dir.display(), e))?;

    let exe_path = get_app_executable_path(app);
    let source_size = fs::metadata(source)
        .map_err(|e| format!("Không thể đọc gói {}: {e}", source.display()))?
        .len();
    if source_size == 0 {
        return Err("Gói ứng dụng rỗng".into());
    }

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_path = app_dir.join(format!(".nom-install-{}-{nonce}.tmp", app.id));
    if let Err(error) = copy_and_verify(app, source, &temp_path, source_size, &mut report) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    fs::rename(&temp_path, &exe_path).map_err(|e| format!("Không thể hoàn tất cài đặt {}: {e}", app.name))?;

    #[cfg(target_os = "windows")]
    {
        generate_launcher_script(app, &app_dir)?;
        generate_uninstaller_script(app, &app_dir)?;
    }

    report(InstallProgress::Finalizing);
    if let Err(error) = create_shortcuts(app).and_then(|_| register_control_panel(app)) {
        let _ = remove_shortcuts(app);
        let _ = unregister_control_panel(app);
        let _ = fs::remove_file(&exe_path);
        return Err(error);
    }
    Ok(())
}

fn copy_and_verify(
    app: &AppInfo,
    source: &Path,
    temp_path: &Path,
    source_size: u64,
    report: &mut impl FnMut(InstallProgress),
) -> Result<(), String> {
    let mut input = File::open(source).map_err(|e| format!("Không thể đọc gói: {e}"))?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temp_path)
        .map_err(|e| format!("Không thể tạo tệp cài đặt tạm: {e}"))?;
    let started = Instant::now();
    let mut copied = 0_u64;
    let mut source_hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    report(InstallProgress::Copying {
        copied,
        total: source_size,
        elapsed_seconds: 0.0,
    });
    loop {
        let count = input.read(&mut buffer).map_err(|e| format!("Lỗi đọc gói: {e}"))?;
        if count == 0 {
            break;
        }
        output
            .write_all(&buffer[..count])
            .map_err(|e| format!("Lỗi ghi gói cài đặt: {e}"))?;
        source_hasher.update(&buffer[..count]);
        copied += count as u64;
        report(InstallProgress::Copying {
            copied,
            total: source_size,
            elapsed_seconds: started.elapsed().as_secs_f32(),
        });
    }
    output
        .sync_all()
        .map_err(|e| format!("Không thể đồng bộ tệp cài đặt: {e}"))?;
    if copied != source_size {
        return Err("Kích thước gói thay đổi trong khi cài".into());
    }

    report(InstallProgress::Verifying);
    #[cfg(target_os = "windows")]
    {
        let mut signature = [0_u8; 2];
        File::open(temp_path)
            .and_then(|mut file| file.read_exact(&mut signature))
            .map_err(|_| "Tệp gói không phải executable Windows hợp lệ".to_string())?;
        if signature != *b"MZ" {
            return Err("Tệp gói không có chữ ký executable Windows (MZ)".into());
        }
    }
    let source_hash = format!("{:x}", source_hasher.finalize());
    let actual_hash = hash_file(temp_path)?;
    if actual_hash != source_hash {
        return Err("Checksum bản sao không khớp với gói nguồn".into());
    }
    if !app.sha256.is_empty() && !actual_hash.eq_ignore_ascii_case(&app.sha256) {
        return Err(format!("SHA-256 của gói không khớp manifest: {actual_hash}"));
    }
    Ok(())
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Không thể xác minh tệp cài đặt: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|e| format!("Không thể xác minh tệp cài đặt: {e}"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn uninstall_app(app: &AppInfo) -> Result<(), String> {
    let _ = unregister_control_panel(app);
    let _ = remove_shortcuts(app);
    let app_dir = get_app_dir(&app.id);
    if app_dir.exists() {
        fs::remove_dir_all(&app_dir).map_err(|e| format!("Không thể xóa thư mục {}: {}", app.name, e))?;
    }
    Ok(())
}
