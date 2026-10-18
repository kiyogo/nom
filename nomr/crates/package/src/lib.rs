pub mod auth;
pub mod catalog;
pub mod install;
pub mod installer;
pub mod manifest;
pub mod paths;
pub mod platform;
pub mod process;
pub mod sync;

pub use auth::{clear_session, load_session, save_session, UserSession};
pub use catalog::get_default_catalog;
pub use install::{
    create_app_files, create_app_files_from_source, find_bundled_executable, uninstall_app, InstallProgress,
};
pub use installer::{InstallEvent, LocalInstaller};
pub use manifest::{AppInfo, AppStatus};
pub use paths::{get_app_dir, get_app_executable_path, get_install_root};
pub use platform::{create_shortcuts, register_control_panel, remove_shortcuts, unregister_control_panel};
pub use process::launch_app;
pub use sync::{is_app_installed, sync_installed_status};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_catalog() {
        let catalog = get_default_catalog();
        assert_eq!(catalog.len(), 6);
        assert!(catalog.iter().any(|a| a.id == "writer"));
        assert!(catalog.iter().any(|a| a.id == "sheet"));
        assert!(catalog.iter().any(|a| a.id == "pdf"));
    }

    #[test]
    fn install_fails_instead_of_creating_a_placeholder_when_package_is_missing() {
        let app = AppInfo::new(
            "missing_bundle_test_unique",
            "Missing Bundle Test",
            "Office",
            "Test missing local package behavior",
            "1.0.0",
            1.0,
            "nom-no-such-binary-for-this-test",
        );
        let result = create_app_files(&app);
        assert!(result.is_err());
        assert!(!is_app_installed(&app));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_control_panel_registration() {
        let app = AppInfo::new(
            "test_control_panel",
            "Test Suite",
            "Office",
            "Test description",
            "1.0.0",
            12.5,
            "test-app",
        );
        let reg_res = register_control_panel(&app);
        assert!(reg_res.is_ok());

        let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Nom_test_control_panel";
        let output = std::process::Command::new("reg")
            .args(["query", key, "/v", "DisplayName"])
            .output()
            .unwrap();
        assert!(output.status.success());
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(stdout.contains("Nom Test Suite"));

        let unreg_res = unregister_control_panel(&app);
        assert!(unreg_res.is_ok());

        let output_after = std::process::Command::new("reg").args(["query", key]).output().unwrap();
        assert!(!output_after.status.success());
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_full_install_and_uninstall_lifecycle() {
        let app = AppInfo::new(
            "test_writer_lifecycle",
            "Writer Lifecycle",
            "Office",
            "Test full lifecycle",
            "1.0.0",
            25.0,
            "nom-writer",
        );

        let source = std::env::temp_dir().join(format!("{}-nom-test.exe", app.id));
        std::fs::write(&source, b"MZ\x90\x00NomTestExecutable").unwrap();

        // Cài đặt từ executable thật được chỉ định tường minh, không copy launcher/stub.
        let install_res = create_app_files_from_source(&app, &source, |_| {});
        assert!(install_res.is_ok());

        // Kiểm tra xem ứng dụng đã được coi là Installed chưa
        assert!(is_app_installed(&app));

        // Kiểm tra xem registry Control Panel có đủ các trường không
        let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Nom_test_writer_lifecycle";
        let output = std::process::Command::new("reg")
            .args(["query", key, "/v", "DisplayName"])
            .output()
            .unwrap();
        assert!(output.status.success());
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(stdout.contains("Nom Writer Lifecycle"));

        // Kiểm tra Publisher
        let pub_out = std::process::Command::new("reg")
            .args(["query", key, "/v", "Publisher"])
            .output()
            .unwrap();
        assert!(pub_out.status.success());
        assert!(String::from_utf8_lossy(&pub_out.stdout).contains("Nom Office"));

        // Kiểm tra UninstallString
        let un_out = std::process::Command::new("reg")
            .args(["query", key, "/v", "UninstallString"])
            .output()
            .unwrap();
        assert!(un_out.status.success());
        assert!(String::from_utf8_lossy(&un_out.stdout).contains("uninstall.cmd"));

        // Gỡ cài đặt
        let uninst_res = uninstall_app(&app);
        assert!(uninst_res.is_ok());

        // Sau khi gỡ, is_app_installed phải là false
        assert!(!is_app_installed(&app));

        // Registry key cũng phải bị xóa sạch
        let after_out = std::process::Command::new("reg").args(["query", key]).output().unwrap();
        assert!(!after_out.status.success());
        let _ = std::fs::remove_file(source);
    }
}
