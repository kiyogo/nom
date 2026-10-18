use crate::paths::get_install_root;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub is_logged_in: bool,
    pub name: String,
    pub email: String,
    pub plan: String,
    pub avatar_initials: String,
}

impl Default for UserSession {
    fn default() -> Self {
        Self {
            is_logged_in: false,
            name: String::new(),
            email: String::new(),
            plan: String::new(),
            avatar_initials: String::new(),
        }
    }
}

impl UserSession {
    pub fn new_demo() -> Self {
        Self {
            is_logged_in: true,
            name: "Sơn Nguyễn".to_string(),
            email: "sonnguyen@nomoffice.org".to_string(),
            plan: "Nom Pro".to_string(),
            avatar_initials: "SN".to_string(),
        }
    }

    pub fn from_credentials(email: &str, name: Option<&str>) -> Self {
        let display_name = if let Some(n) = name {
            if !n.trim().is_empty() {
                n.trim().to_string()
            } else {
                extract_name_from_email(email)
            }
        } else {
            extract_name_from_email(email)
        };

        let initials = compute_initials(&display_name);

        Self {
            is_logged_in: true,
            name: display_name,
            email: email.trim().to_string(),
            plan: "Nom Pro".to_string(),
            avatar_initials: initials,
        }
    }
}

fn extract_name_from_email(email: &str) -> String {
    let clean = email.trim();
    if let Some((user, _)) = clean.split_once('@') {
        let formatted = user.replace(['.', '_', '-'], " ");
        let words: Vec<String> = formatted
            .split_whitespace()
            .map(|w| {
                let mut c = w.chars();
                match c.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                }
            })
            .collect();
        if !words.is_empty() {
            return words.join(" ");
        }
    }
    if !clean.is_empty() {
        clean.to_string()
    } else {
        "Người dùng".to_string()
    }
}

fn compute_initials(name: &str) -> String {
    let words: Vec<&str> = name.split_whitespace().collect();
    if words.len() >= 2 {
        let first = words[0].chars().next().unwrap_or('U').to_ascii_uppercase();
        let last = words[words.len() - 1]
            .chars()
            .next()
            .unwrap_or('D')
            .to_ascii_uppercase();
        format!("{}{}", first, last)
    } else if let Some(first_word) = words.first() {
        let chars: Vec<char> = first_word.chars().take(2).map(|c| c.to_ascii_uppercase()).collect();
        if chars.len() == 2 {
            format!("{}{}", chars[0], chars[1])
        } else if let Some(c) = chars.first() {
            c.to_string()
        } else {
            "U".to_string()
        }
    } else {
        "U".to_string()
    }
}

pub fn get_session_file_path() -> PathBuf {
    get_install_root().join("session.json")
}

pub fn load_session() -> UserSession {
    let path = get_session_file_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(session) = serde_json::from_str::<UserSession>(&content) {
                return session;
            }
        }
    }
    UserSession::default()
}

pub fn save_session(session: &UserSession) -> Result<(), String> {
    let path = get_session_file_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let data = serde_json::to_string_pretty(session).map_err(|e| format!("Lỗi mã hóa session: {}", e))?;
    std::fs::write(&path, data).map_err(|e| format!("Lỗi lưu session: {}", e))?;
    Ok(())
}

pub fn clear_session() -> Result<(), String> {
    let path = get_session_file_path();
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initials_computation() {
        assert_eq!(compute_initials("Sơn Nguyễn"), "SN");
        assert_eq!(compute_initials("Nguyen Van A"), "NA");
        assert_eq!(compute_initials("Nom"), "NO");
    }

    #[test]
    fn test_session_lifecycle() {
        let demo = UserSession::new_demo();
        assert!(demo.is_logged_in);
        assert_eq!(demo.name, "Sơn Nguyễn");
        assert_eq!(demo.avatar_initials, "SN");

        let res = save_session(&demo);
        assert!(res.is_ok());

        let loaded = load_session();
        assert!(loaded.is_logged_in);
        assert_eq!(loaded.email, "sonnguyen@nomoffice.org");

        let _ = clear_session();
        let empty = load_session();
        assert!(!empty.is_logged_in);
    }
}
