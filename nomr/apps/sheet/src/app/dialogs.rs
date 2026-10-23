use super::*;

#[cfg(windows)]
fn file_dialog(save: bool, initial: &str) -> Option<PathBuf> {
    use windows_sys::Win32::UI::Controls::Dialogs::*;
    let filter: Vec<u16> = "Bảng tính Excel (*.xlsx)\0*.xlsx\0CSV UTF-8 (*.csv)\0*.csv\0\0"
        .encode_utf16()
        .collect();
    let title: Vec<u16> = if save {
        "Lưu bảng tính\0"
    } else {
        "Mở bảng tính\0"
    }
    .encode_utf16()
    .collect();
    let mut file = vec![0u16; 32768];
    if save {
        for (dst, src) in file.iter_mut().zip(initial.encode_utf16()) {
            *dst = src;
        }
    }
    let mut dialog: OPENFILENAMEW = unsafe { std::mem::zeroed() };
    dialog.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
    dialog.hwndOwner = unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() };
    dialog.lpstrFilter = filter.as_ptr();
    dialog.nFilterIndex = 1;
    dialog.lpstrFile = file.as_mut_ptr();
    dialog.nMaxFile = file.len() as u32;
    dialog.lpstrTitle = title.as_ptr();
    dialog.Flags =
        OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST | if save { OFN_OVERWRITEPROMPT } else { OFN_FILEMUSTEXIST };
    let accepted = unsafe {
        if save {
            GetSaveFileNameW(&mut dialog)
        } else {
            GetOpenFileNameW(&mut dialog)
        }
    };
    if accepted == 0 {
        return None;
    }
    let len = file.iter().position(|c| *c == 0).unwrap_or(file.len());
    let mut path = PathBuf::from(String::from_utf16_lossy(&file[..len]));
    if save && path.extension().is_none() {
        path.set_extension(if dialog.nFilterIndex == 2 { "csv" } else { "xlsx" });
    }
    Some(path)
}
#[cfg(not(windows))]
fn file_dialog(_save: bool, _initial: &str) -> Option<PathBuf> {
    None
}

impl NomSheetApp {
    pub(super) fn choose_open_file(&mut self) {
        if let Some(path) = file_dialog(false, "") {
            self.path_buffer = path.display().to_string();
            self.request_open();
        }
    }
    pub(super) fn choose_save_file(&mut self) {
        let initial = if self.path_buffer.is_empty() {
            "Bảng tính.xlsx"
        } else {
            &self.path_buffer
        };
        if let Some(path) = file_dialog(true, initial) {
            self.path_buffer = path.display().to_string();
            self.save_path();
        }
    }

    pub(super) fn choose_save_csv_file(&mut self) {
        let initial = self
            .workbook
            .file_path
            .as_ref()
            .and_then(|path| path.file_stem())
            .map(|stem| format!("{}.csv", stem.to_string_lossy()))
            .unwrap_or_else(|| "Bảng tính.csv".to_owned());
        if let Some(path) = file_dialog(true, &initial) {
            self.path_buffer = path.display().to_string();
            self.save_path();
        }
    }
    pub(super) fn request_clipboard_paste(&mut self, _ctx: &Context) {
        match arboard::Clipboard::new().and_then(|mut clipboard| clipboard.get_text()) {
            Ok(text) => self.paste_from_clipboard(&text),
            Err(error) => self.status = format!("Không đọc được clipboard: {error}. Thử Ctrl+V."),
        }
    }
}
