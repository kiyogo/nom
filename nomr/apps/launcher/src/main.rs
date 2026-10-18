#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
pub mod dwrite;
mod font;
mod theme;
pub mod typography;
mod views;

use app::LauncherApp;
use eframe::egui;

fn main() -> eframe::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 3 && args[1] == "--uninstall" {
        let app_id = &args[2];
        let catalog = nom_package::get_default_catalog();
        if let Some(app) = catalog.iter().find(|a| a.id == *app_id) {
            let _ = nom_package::uninstall_app(app);
            println!("Đã gỡ cài đặt thành công Nom {}", app.name);
        }
        return Ok(());
    }

    let rt = tokio::runtime::Runtime::new().expect("Không thể khởi tạo Tokio Runtime");
    let _enter = rt.enter();

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([920.0, 680.0])
            .with_min_inner_size([720.0, 500.0])
            .with_title("Nom Software Hub")
            .with_decorations(cfg!(target_os = "windows"))
            .with_resizable(true),
        ..Default::default()
    };

    let result = eframe::run_native(
        "Nom Software Hub",
        options,
        Box::new(|cc| Ok(Box::new(LauncherApp::new(cc)))),
    );

    // Background installs may take minutes; do not make closing the GUI wait
    // for every Tokio task. Let the runtime wind down briefly, then detach the rest.
    drop(_enter);
    rt.shutdown_timeout(std::time::Duration::from_millis(250));
    result
}
