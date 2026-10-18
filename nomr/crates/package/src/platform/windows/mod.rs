pub mod registry;
pub mod script;
pub mod shortcut;

pub use registry::{is_registered_in_control_panel, register_control_panel, unregister_control_panel};
pub use script::{generate_launcher_script, generate_uninstaller_script};
pub use shortcut::{create_shortcuts, remove_shortcuts};
