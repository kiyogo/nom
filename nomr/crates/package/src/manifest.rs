use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum AppStatus {
    NotInstalled,
    Installing {
        progress: f32, // 0.0 .. 1.0
        speed_mbps: f32,
        copied_mb: f32,
        total_mb: f32,
    },
    Verifying,
    Extracting,
    Installed {
        version: String,
    },
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub version: String,
    pub size_mb: f32,
    pub executable_name: String,
    pub sha256: String,
    pub status: AppStatus,
}

impl AppInfo {
    pub fn new(
        id: &str,
        name: &str,
        category: &str,
        description: &str,
        version: &str,
        size_mb: f32,
        executable_name: &str,
    ) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            category: category.to_string(),
            description: description.to_string(),
            version: version.to_string(),
            size_mb,
            executable_name: executable_name.to_string(),
            // Empty means no pinned release hash has been published for this build.
            sha256: String::new(),
            status: AppStatus::NotInstalled,
        }
    }
}
