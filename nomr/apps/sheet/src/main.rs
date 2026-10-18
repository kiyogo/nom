#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;

use app::NomSheetApp;
use eframe::egui;

fn main() -> eframe::Result<()> {
    let initial_file = std::env::args_os().nth(1).map(std::path::PathBuf::from);
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1180.0, 780.0])
            .with_min_inner_size([760.0, 520.0])
            .with_title("Nom Sheet"),
        ..Default::default()
    };
    eframe::run_native(
        "Nom Sheet",
        options,
        Box::new(move |context| Ok(Box::new(NomSheetApp::new(context, initial_file.clone())))),
    )
}
