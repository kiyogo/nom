use std::cell::RefCell;
use std::collections::HashSet;
use std::path::PathBuf;

mod appearance;
mod dialogs;
mod grid;
mod icons;
mod ribbon;
use appearance::setup_sheet_appearance;

use eframe::egui::{
    self, Align2, Color32, Context, FontFamily, Key, Pos2, Rect, RichText, Rounding, ScrollArea, Stroke, Ui, Vec2,
};
use nom_formula::FormulaContext;
use nom_workbook::{
    CellAddress, CellAlign, CellRange, CellStyle, CellValue, NumFormat, Sheet, Workbook, MAX_COLUMNS, MAX_ROWS,
};

const FORMULA_DEPTH_LIMIT: usize = 500;
const RANGE_CELL_LIMIT: u64 = 100_000;
const RIBBON_TEXT: Color32 = Color32::from_rgb(32, 31, 30);
const RIBBON_MUTED: Color32 = Color32::from_rgb(96, 94, 92);
const RIBBON_BORDER: Color32 = Color32::from_rgb(218, 220, 224);

#[derive(Clone)]
enum PendingAction {
    NewWorkbook,
    Open(PathBuf),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RibbonTab {
    File,
    Home,
    Insert,
    Draw,
    PageLayout,
    Formulas,
    Data,
    Review,
    View,
    Help,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChartType {
    Column,
    Bar,
    Line,
    Pie,
}

#[derive(Debug, Clone)]
pub struct ChartItem {
    pub title: String,
    pub chart_type: ChartType,
    pub range: CellRange,
}

#[derive(Clone)]
struct UndoItem {
    description: String,
    sheet_idx: usize,
    cells_before: Vec<(CellAddress, CellValue, Option<CellStyle>)>,
    cells_after: Vec<(CellAddress, CellValue, Option<CellStyle>)>,
}

pub struct NomSheetApp {
    workbook: Workbook,
    selected: CellAddress,
    selection_end: Option<CellAddress>,
    edit_buffer: String,
    formula_buffer: String,
    name_box_buffer: String,
    path_buffer: String,
    first_column: u16,
    status: String,
    editing_cell: bool,
    name_box_is_focused: bool,
    search_is_focused: bool,
    pending_action: Option<PendingAction>,
    confirm_format_loss: bool,
    active_ribbon_tab: RibbonTab,
    undo_stack: Vec<UndoItem>,
    redo_stack: Vec<UndoItem>,
    internal_clipboard: String,
    zoom: f32,
    show_gridlines: bool,
    show_find_dialog: bool,
    find_query: String,
    replace_query: String,
    rename_sheet_idx: Option<usize>,
    rename_sheet_buffer: String,
    chart: Option<ChartItem>,
    grid_scroll: Vec2,
    reveal_selection: bool,
    edit_focus_requested: bool,
    show_capabilities: bool,
    formula_is_focused: bool,
}

#[cfg(target_os = "windows")]
fn set_light_native_titlebar() {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};

    static APPLIED: AtomicBool = AtomicBool::new(false);
    if APPLIED.load(Ordering::Relaxed) {
        return;
    }

    struct WindowSearch {
        process_id: u32,
        handle: isize,
    }

    extern "system" fn find_sheet_window(hwnd: isize, data: isize) -> i32 {
        #[link(name = "user32")]
        extern "system" {
            fn GetWindowThreadProcessId(hwnd: isize, process_id: *mut u32) -> u32;
            fn IsWindowVisible(hwnd: isize) -> i32;
            fn GetWindowTextW(hwnd: isize, text: *mut u16, max_count: i32) -> i32;
        }

        let search = unsafe { &mut *(data as *mut WindowSearch) };
        let mut process_id = 0;
        unsafe {
            if GetWindowThreadProcessId(hwnd, &mut process_id) == 0
                || process_id != search.process_id
                || IsWindowVisible(hwnd) == 0
            {
                return 1;
            }
        }

        let mut title = [0_u16; 128];
        let title_len = unsafe { GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32) };
        if String::from_utf16_lossy(&title[..title_len.max(0) as usize]) == "Nom Sheet" {
            search.handle = hwnd;
            0
        } else {
            1
        }
    }

    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(callback: extern "system" fn(isize, isize) -> i32, data: isize) -> i32;
    }
    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(hwnd: isize, attribute: u32, value: *const c_void, value_size: u32) -> i32;
    }

    let mut search = WindowSearch {
        process_id: std::process::id(),
        handle: 0,
    };
    unsafe {
        let _ = EnumWindows(find_sheet_window, &mut search as *mut _ as isize);
    }
    if search.handle == 0 {
        return;
    }

    let light_mode = 0_u32;
    let value = &light_mode as *const _ as *const c_void;
    let size = std::mem::size_of_val(&light_mode) as u32;
    let modern_result = unsafe { DwmSetWindowAttribute(search.handle, 20, value, size) };
    let result = if modern_result >= 0 {
        modern_result
    } else {
        // Older supported Windows builds expose the same option as attribute 19.
        unsafe { DwmSetWindowAttribute(search.handle, 19, value, size) }
    };
    if result >= 0 {
        APPLIED.store(true, Ordering::Relaxed);
    }
}

impl NomSheetApp {
    pub fn new(context: &eframe::CreationContext<'_>, initial_file: Option<PathBuf>) -> Self {
        setup_sheet_appearance(&context.egui_ctx);
        let mut app = Self {
            workbook: Workbook::default(),
            selected: CellAddress { row: 1, column: 1 },
            selection_end: None,
            edit_buffer: String::new(),
            formula_buffer: String::new(),
            name_box_buffer: "A1".into(),
            path_buffer: String::new(),
            first_column: 1,
            status: "Sẵn sàng".into(),
            editing_cell: false,
            name_box_is_focused: false,
            search_is_focused: false,
            pending_action: None,
            confirm_format_loss: false,
            active_ribbon_tab: RibbonTab::File,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            internal_clipboard: String::new(),
            zoom: 1.0,
            show_gridlines: true,
            show_find_dialog: false,
            find_query: String::new(),
            replace_query: String::new(),
            rename_sheet_idx: None,
            rename_sheet_buffer: String::new(),
            chart: None,
            grid_scroll: Vec2::ZERO,
            reveal_selection: true,
            edit_focus_requested: false,
            show_capabilities: false,
            formula_is_focused: false,
        };
        if let Some(path) = initial_file {
            app.path_buffer = path.display().to_string();
            app.open_path_value(path);
        }
        app
    }

    pub fn selection_range(&self) -> CellRange {
        CellRange::new(self.selected, self.selection_end.unwrap_or(self.selected))
    }

    fn open_path_value(&mut self, path: PathBuf) {
        let result = match path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("xlsx") => nom_xlsx::load(&path).map_err(|error| error.to_string()),
            Some("csv") => std::fs::read_to_string(&path)
                .map_err(|error| error.to_string())
                .and_then(|text| nom_workbook::parse_csv(&text).map_err(|error| error.to_string()))
                .map(|sheet| {
                    let mut workbook = Workbook::default();
                    workbook.sheets = vec![sheet];
                    workbook.file_path = Some(path.clone());
                    workbook
                }),
            _ => Err("Chỉ hỗ trợ mở .xlsx và .csv trong phiên bản hiện tại".into()),
        };
        match result {
            Ok(workbook) => {
                self.workbook = workbook;
                self.selected = CellAddress { row: 1, column: 1 };
                self.selection_end = None;
                self.editing_cell = false;
                self.undo_stack.clear();
                self.redo_stack.clear();
                self.refresh_bars();
                self.status = if self.workbook.preservation_warnings.is_empty() {
                    format!("Đã mở {}", path.display())
                } else {
                    format!("Đã mở {}", path.display())
                };
            }
            Err(error) => self.status = format!("Không thể mở tệp: {error}"),
        }
    }

    fn save_path(&mut self) {
        if self.path_buffer.trim().is_empty() {
            self.choose_save_file();
            return;
        }
        let extension = PathBuf::from(self.path_buffer.trim())
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase);
        if (!self.workbook.preservation_warnings.is_empty() && extension.as_deref() == Some("xlsx"))
            || (extension.as_deref() == Some("csv") && self.workbook.sheets.len() > 1)
        {
            self.confirm_format_loss = true;
            return;
        }
        self.write_save();
    }

    fn write_save(&mut self) {
        if self.path_buffer.trim().is_empty() {
            self.status = "Nhập đường dẫn .xlsx hoặc .csv vào ô đường dẫn trước khi lưu".into();
            return;
        }
        let path = PathBuf::from(self.path_buffer.trim());
        let result = match path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("xlsx") => nom_xlsx::save(&path, &self.workbook).map_err(|error| error.to_string()),
            Some("csv") => nom_workbook::write_csv(self.workbook.active())
                .map_err(|error| error.to_string())
                .and_then(|content| std::fs::write(&path, content).map_err(|error| error.to_string())),
            _ => Err("Đường dẫn phải có phần mở rộng .xlsx hoặc .csv".into()),
        };
        match result {
            Ok(()) => {
                self.workbook.file_path = Some(path.clone());
                self.workbook.dirty = false;
                self.workbook.preservation_warnings.clear();
                self.status = format!("Đã lưu thành công vào {}", path.display());
            }
            Err(error) => self.status = format!("Không thể lưu tệp: {error}"),
        }
    }

    fn request_open(&mut self) {
        let path = PathBuf::from(self.path_buffer.trim());
        if self.workbook.dirty {
            self.pending_action = Some(PendingAction::Open(path));
        } else {
            self.open_path_value(path);
        }
    }

    fn request_new(&mut self) {
        if self.workbook.dirty {
            self.pending_action = Some(PendingAction::NewWorkbook);
        } else {
            self.create_workbook();
        }
    }

    fn create_workbook(&mut self) {
        self.workbook = Workbook::default();
        self.selected = CellAddress { row: 1, column: 1 };
        self.selection_end = None;
        self.path_buffer.clear();
        self.undo_stack.clear();
        self.redo_stack.clear();
        self.chart = None;
        self.refresh_bars();
        self.status = "Đã tạo bảng tính mới".into();
    }

    fn complete_pending_action(&mut self) {
        let Some(action) = self.pending_action.take() else {
            return;
        };
        self.workbook.dirty = false;
        match action {
            PendingAction::NewWorkbook => self.create_workbook(),
            PendingAction::Open(path) => {
                self.path_buffer = path.display().to_string();
                self.open_path_value(path);
            }
        }
    }

    fn record_undo(
        &mut self,
        description: impl Into<String>,
        cells_before: Vec<(CellAddress, CellValue, Option<CellStyle>)>,
        cells_after: Vec<(CellAddress, CellValue, Option<CellStyle>)>,
    ) {
        self.undo_stack.push(UndoItem {
            description: description.into(),
            sheet_idx: self.workbook.active_sheet,
            cells_before,
            cells_after,
        });
        self.redo_stack.clear();
        if self.undo_stack.len() > 100 {
            self.undo_stack.remove(0);
        }
    }

    fn undo(&mut self) {
        if let Some(item) = self.undo_stack.pop() {
            if item.sheet_idx < self.workbook.sheets.len() {
                let sheet = &mut self.workbook.sheets[item.sheet_idx];
                for (addr, val, style) in &item.cells_before {
                    sheet.set(*addr, val.clone());
                    if let Some(s) = style {
                        sheet.set_style(*addr, s.clone());
                    } else {
                        sheet.set_style(*addr, CellStyle::default());
                    }
                }
            }
            self.status = format!("Hoàn tác: {}", item.description);
            self.workbook.dirty = true;
            self.refresh_bars();
            self.redo_stack.push(item);
        }
    }

    fn redo(&mut self) {
        if let Some(item) = self.redo_stack.pop() {
            if item.sheet_idx < self.workbook.sheets.len() {
                let sheet = &mut self.workbook.sheets[item.sheet_idx];
                for (addr, val, style) in &item.cells_after {
                    sheet.set(*addr, val.clone());
                    if let Some(s) = style {
                        sheet.set_style(*addr, s.clone());
                    } else {
                        sheet.set_style(*addr, CellStyle::default());
                    }
                }
            }
            self.status = format!("Làm lại: {}", item.description);
            self.workbook.dirty = true;
            self.refresh_bars();
            self.undo_stack.push(item);
        }
    }

    fn commit_edit(&mut self) {
        let old_val = self.workbook.active().get(self.selected).clone();
        let old_style = self.workbook.active().get_style(self.selected).cloned();
        let new_val = CellValue::from_input(&self.edit_buffer);
        self.record_undo(
            "Sửa ô",
            vec![(self.selected, old_val, old_style.clone())],
            vec![(self.selected, new_val.clone(), old_style)],
        );
        self.workbook.active_mut().set(self.selected, new_val);
        self.workbook.dirty = true;
        self.editing_cell = false;
        self.refresh_bars();
    }

    fn refresh_bars(&mut self) {
        self.formula_buffer = match self.workbook.active().get(self.selected) {
            CellValue::Formula(formula) => format!("={formula}"),
            value => value.display_text(),
        };
        self.edit_buffer = self.formula_buffer.clone();
        self.name_box_buffer = match self.selection_end {
            Some(end) if end != self.selected => {
                let r = self.selection_range();
                format!("{}:{}", r.start, r.end)
            }
            _ => self.selected.to_string(),
        };
    }

    fn select_cell(&mut self, address: CellAddress) {
        self.selected = address;
        self.selection_end = None;
        self.editing_cell = false;
        self.reveal_selection = true;
        self.refresh_bars();
    }

    fn copy_to_clipboard(&mut self, context: &Context) {
        let range = self.selection_range();
        if range.cell_count() > RANGE_CELL_LIMIT {
            self.status = "Chọn tối đa 100.000 ô để sao chép".into();
            return;
        }
        let tsv = nom_workbook::export_tsv(self.workbook.active(), range);
        self.internal_clipboard = tsv.clone();
        context.output_mut(|o| o.copied_text = tsv);
        self.status = format!("Đã sao chép vùng {}", self.name_box_buffer);
    }

    fn cut_to_clipboard(&mut self, context: &Context) {
        if self.selection_range().cell_count() > RANGE_CELL_LIMIT {
            self.status = "Chọn tối đa 100.000 ô để cắt".into();
            return;
        }
        self.copy_to_clipboard(context);
        let range = self.selection_range();
        let mut before = Vec::new();
        let mut after = Vec::new();
        for row in range.iter_rows() {
            for col in range.iter_columns() {
                let addr = CellAddress { row, column: col };
                before.push((
                    addr,
                    self.workbook.active().get(addr).clone(),
                    self.workbook.active().get_style(addr).cloned(),
                ));
                after.push((addr, CellValue::Blank, None));
            }
        }
        self.record_undo("Cắt vùng", before, after);
        self.workbook.active_mut().clear_range(range);
        self.workbook.dirty = true;
        self.refresh_bars();
        self.status = format!("Đã cắt vùng {}", self.name_box_buffer);
    }

    fn paste_from_clipboard(&mut self, text: &str) {
        if text.trim().is_empty() {
            return;
        }
        let grid = nom_workbook::import_tsv(text);
        if grid.is_empty() {
            return;
        }
        let base_row = self.selected.row;
        let base_col = self.selected.column;
        let mut before = Vec::new();
        let mut after = Vec::new();

        for (r_off, row) in grid.iter().enumerate() {
            for (c_off, val) in row.iter().enumerate() {
                let row_num = base_row + r_off as u32;
                let col_num = base_col + c_off as u16;
                if row_num <= MAX_ROWS && col_num <= MAX_COLUMNS {
                    let addr = CellAddress {
                        row: row_num,
                        column: col_num,
                    };
                    before.push((
                        addr,
                        self.workbook.active().get(addr).clone(),
                        self.workbook.active().get_style(addr).cloned(),
                    ));
                    after.push((addr, val.clone(), self.workbook.active().get_style(addr).cloned()));
                    self.workbook.active_mut().set(addr, val.clone());
                }
            }
        }
        self.record_undo("Dán dữ liệu", before, after);
        self.workbook.dirty = true;
        self.refresh_bars();
        self.status = "Đã dán dữ liệu thành công".into();
    }

    fn apply_style_to_selection<F>(&mut self, description: &str, mut transform: F)
    where
        F: FnMut(&mut CellStyle),
    {
        let range = self.selection_range();
        if range.cell_count() > RANGE_CELL_LIMIT {
            self.status = "Chọn tối đa 100.000 ô để định dạng cùng lúc".into();
            return;
        }
        let mut before = Vec::new();
        let mut after = Vec::new();

        for row in range.iter_rows() {
            for col in range.iter_columns() {
                let addr = CellAddress { row, column: col };
                let val = self.workbook.active().get(addr).clone();
                let old_style = self.workbook.active().get_style(addr).cloned();
                let mut new_style = old_style.clone().unwrap_or_default();
                transform(&mut new_style);

                before.push((addr, val.clone(), old_style));
                after.push((addr, val, Some(new_style.clone())));
                self.workbook.active_mut().set_style(addr, new_style);
            }
        }

        self.record_undo(description, before, after);
        self.workbook.dirty = true;
        self.status = format!("Đã áp dụng định dạng: {description}");
    }

    fn clear_selection(&mut self) {
        let range = self.selection_range();
        if range.cell_count() > RANGE_CELL_LIMIT {
            self.status = "Chọn tối đa 100.000 ô để xóa cùng lúc".into();
            return;
        }
        let mut before = Vec::new();
        let mut after = Vec::new();
        for row in range.iter_rows() {
            for col in range.iter_columns() {
                let addr = CellAddress { row, column: col };
                before.push((
                    addr,
                    self.workbook.active().get(addr).clone(),
                    self.workbook.active().get_style(addr).cloned(),
                ));
                after.push((addr, CellValue::Blank, None));
            }
        }
        self.record_undo("Xóa vùng", before, after);
        self.workbook.active_mut().clear_range(range);
        self.workbook.dirty = true;
        self.refresh_bars();
        self.status = "Đã xóa nội dung vùng chọn".into();
    }

    fn sort_selection(&mut self, ascending: bool) {
        let range = self.selection_range();
        if range.cell_count() > RANGE_CELL_LIMIT {
            self.status = "Chọn tối đa 100.000 ô để sắp xếp".into();
            return;
        }
        let sort_col = self.selected.column;
        let mut rows_data = Vec::new();

        for row in range.iter_rows() {
            let sort_key_val = self.workbook.active().get(CellAddress { row, column: sort_col });
            let mut row_cells = Vec::new();
            for col in range.iter_columns() {
                let addr = CellAddress { row, column: col };
                let val = self.workbook.active().get(addr).clone();
                let style = self.workbook.active().get_style(addr).cloned();
                row_cells.push((col, val, style));
            }
            rows_data.push((sort_key_val.clone(), row_cells));
        }

        rows_data.sort_by(|(a, _), (b, _)| {
            let ord = match (number_val(a), number_val(b)) {
                (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal),
                _ => a.display_text().to_lowercase().cmp(&b.display_text().to_lowercase()),
            };
            if ascending {
                ord
            } else {
                ord.reverse()
            }
        });

        let mut before = Vec::new();
        let mut after = Vec::new();

        for (idx, row) in range.iter_rows().enumerate() {
            let (_, row_cells) = &rows_data[idx];
            for (col, new_val, new_style) in row_cells {
                let addr = CellAddress { row, column: *col };
                before.push((
                    addr,
                    self.workbook.active().get(addr).clone(),
                    self.workbook.active().get_style(addr).cloned(),
                ));
                after.push((addr, new_val.clone(), new_style.clone()));
                self.workbook.active_mut().set(addr, new_val.clone());
                if let Some(s) = new_style {
                    self.workbook.active_mut().set_style(addr, s.clone());
                } else {
                    self.workbook.active_mut().set_style(addr, CellStyle::default());
                }
            }
        }

        self.record_undo(
            if ascending {
                "Sắp xếp A→Z"
            } else {
                "Sắp xếp Z→A"
            },
            before,
            after,
        );
        self.workbook.dirty = true;
        self.refresh_bars();
        self.status = format!(
            "Đã sắp xếp cột {} {}",
            nom_workbook::column_name(sort_col),
            if ascending { "tăng dần" } else { "giảm dần" }
        );
    }

    fn handle_keyboard(&mut self, context: &Context) {
        if self.editing_cell
            || self.name_box_is_focused
            || self.search_is_focused
            || self.formula_is_focused
            || self.show_find_dialog
            || self.rename_sheet_idx.is_some()
        {
            return;
        }

        let mut clipboard_to_paste = None;
        context.input(|input| {
            for event in &input.raw.events {
                if let egui::Event::Paste(ref text) = event {
                    clipboard_to_paste = Some(text.clone());
                }
            }
        });
        if let Some(text) = clipboard_to_paste {
            self.paste_from_clipboard(&text);
            return;
        }

        let mut next_cell = None;
        let mut expand_selection = false;

        context.input(|input| {
            let shift = input.modifiers.shift;
            let ctrl = input.modifiers.ctrl;

            if ctrl && input.key_pressed(Key::Z) {
                self.undo();
            } else if ctrl && input.key_pressed(Key::Y) {
                self.redo();
            } else if ctrl && input.key_pressed(Key::C) {
                self.copy_to_clipboard(context);
            } else if ctrl && input.key_pressed(Key::X) {
                self.cut_to_clipboard(context);
            } else if ctrl && input.key_pressed(Key::V) {
                let clip = self.internal_clipboard.clone();
                self.paste_from_clipboard(&clip);
            } else if ctrl && input.key_pressed(Key::B) {
                self.apply_style_to_selection("In đậm", |s| s.bold = !s.bold);
            } else if ctrl && input.key_pressed(Key::I) {
                self.apply_style_to_selection("In nghiêng", |s| s.italic = !s.italic);
            } else if ctrl && input.key_pressed(Key::U) {
                self.apply_style_to_selection("Gạch chân", |s| s.underline = !s.underline);
            } else if ctrl && input.key_pressed(Key::F) {
                self.show_find_dialog = true;
            } else if ctrl && input.key_pressed(Key::A) {
                self.selected = CellAddress { row: 1, column: 1 };
                let end = self
                    .workbook
                    .active()
                    .used_range()
                    .map(|r| r.end)
                    .unwrap_or(CellAddress { row: 30, column: 10 });
                self.selection_end = Some(end);
                self.refresh_bars();
            } else if ctrl && input.key_pressed(Key::S) {
                self.save_path();
            } else if ctrl && input.key_pressed(Key::O) {
                self.choose_open_file();
            } else if ctrl && input.key_pressed(Key::N) {
                self.request_new();
            } else if input.key_pressed(Key::Delete) {
                self.clear_selection();
            } else if input.key_pressed(Key::F2) {
                self.editing_cell = true;
                self.edit_focus_requested = true;
            } else if input.key_pressed(Key::Enter) {
                self.editing_cell = true;
                self.edit_focus_requested = true;
            } else if input.key_pressed(Key::Escape) {
                self.editing_cell = false;
                self.refresh_bars();
            } else if input.key_pressed(Key::ArrowUp) {
                expand_selection = shift;
                let target = self.selection_end.unwrap_or(self.selected);
                next_cell = Some((target.row.saturating_sub(1).max(1), target.column));
            } else if input.key_pressed(Key::ArrowDown) {
                expand_selection = shift;
                let target = self.selection_end.unwrap_or(self.selected);
                next_cell = Some((target.row.saturating_add(1).min(MAX_ROWS), target.column));
            } else if input.key_pressed(Key::ArrowLeft) {
                expand_selection = shift;
                let target = self.selection_end.unwrap_or(self.selected);
                next_cell = Some((target.row, target.column.saturating_sub(1).max(1)));
            } else if input.key_pressed(Key::ArrowRight) {
                expand_selection = shift;
                let target = self.selection_end.unwrap_or(self.selected);
                next_cell = Some((target.row, target.column.saturating_add(1).min(MAX_COLUMNS)));
            }
        });

        if next_cell.is_none()
            && !self.editing_cell
            && !context.input(|i| i.modifiers.ctrl || i.modifiers.alt || i.modifiers.command)
            && !context.wants_keyboard_input()
        {
            let text = context.input(|i| {
                i.events
                    .iter()
                    .filter_map(|e| {
                        if let egui::Event::Text(t) = e {
                            Some(t.as_str())
                        } else {
                            None
                        }
                    })
                    .collect::<String>()
            });
            if !text.is_empty() {
                self.edit_buffer.clear();
                self.editing_cell = true;
                self.edit_focus_requested = true;
            }
        }
        if let Some((row, column)) = next_cell {
            let addr = CellAddress { row, column };
            if expand_selection {
                self.selection_end = Some(addr);
                self.refresh_bars();
            } else {
                self.select_cell(addr);
                if column < self.first_column {
                    self.first_column = column;
                }
            }
        }
    }
}

impl eframe::App for NomSheetApp {
    fn update(&mut self, context: &Context, _frame: &mut eframe::Frame) {
        #[cfg(target_os = "windows")]
        set_light_native_titlebar();

        self.handle_keyboard(context);

        self.render_chrome(context);
        self.render_formula_bar(context);
        self.render_bottom(context);
        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(Color32::WHITE))
            .show(context, |ui| {
                if let Some(ref chart) = self.chart {
                    draw_chart_panel(ui, chart, self.workbook.active());
                }
                self.draw_grid(ui);
            });

        // 8. DIALOGS: Rename Sheet Modal
        if let Some(idx) = self.rename_sheet_idx {
            let mut close_modal = false;
            egui::Window::new("Đổi tên Sheet")
                .collapsible(false)
                .resizable(false)
                .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
                .show(context, |ui| {
                    ui.label("Nhập tên mới cho sheet:");
                    ui.text_edit_singleline(&mut self.rename_sheet_buffer);
                    ui.horizontal(|ui| {
                        if ui.button("Lưu tên").clicked() {
                            let _ = self.workbook.rename_sheet(idx, &self.rename_sheet_buffer);
                            close_modal = true;
                        }
                        if ui.button("Hủy").clicked() {
                            close_modal = true;
                        }
                    });
                });
            if close_modal {
                self.rename_sheet_idx = None;
            }
        }

        // 9. DIALOGS: Find and Replace Modal
        if self.show_find_dialog {
            let mut close_find = false;
            egui::Window::new("Tìm kiếm & Thay thế (Ctrl+F)")
                .collapsible(false)
                .resizable(false)
                .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
                .show(context, |ui| {
                    ui.horizontal(|ui| {
                        ui.label("Tìm:");
                        ui.text_edit_singleline(&mut self.find_query);
                    });
                    ui.horizontal(|ui| {
                        ui.label("Thay thế bằng:");
                        ui.text_edit_singleline(&mut self.replace_query);
                    });
                    ui.horizontal(|ui| {
                        if ui.button("Tìm tiếp theo").clicked() {
                            self.find_next();
                        }
                        if ui.button("Thay thế").clicked() {
                            self.replace_current();
                        }
                        if ui.button("Thay thế tất cả").clicked() {
                            self.replace_all();
                        }
                        if ui.button("Đóng").clicked() {
                            close_find = true;
                        }
                    });
                });
            if close_find {
                self.show_find_dialog = false;
            }
        }

        // 10. DIALOGS: Pending Unsaved Action
        if self.pending_action.is_some() {
            let mut discard = false;
            let mut cancel = false;
            egui::Window::new("Thay đổi chưa lưu")
                .collapsible(false)
                .resizable(false)
                .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
                .show(context, |ui| {
                    ui.label("Tài liệu có thay đổi chưa lưu. Bỏ các thay đổi này?");
                    ui.horizontal(|ui| {
                        if ui.button("Bỏ thay đổi").clicked() {
                            discard = true;
                        }
                        if ui.button("Tiếp tục chỉnh sửa").clicked() {
                            cancel = true;
                        }
                    });
                });
            if discard {
                self.complete_pending_action();
            } else if cancel {
                self.pending_action = None;
            }
        }

        // 11. DIALOGS: Confirm Format Loss
        if self.confirm_format_loss {
            let mut save_anyway = false;
            let mut cancel = false;
            egui::Window::new("Xác nhận phạm vi lưu")
                .collapsible(false)
                .resizable(false)
                .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
                .show(context, |ui| {
                    ui.label("Lưu lại XLSX hoặc CSV:");
                    if !self.workbook.preservation_warnings.is_empty() {
                        ui.label("Một số thành phần mở rộng chưa hỗ trợ có thể không được bảo toàn.");
                    } else {
                        ui.label("Lưu CSV chỉ xuất sheet đang chọn; các sheet khác sẽ không nằm trong tệp CSV.");
                    }
                    ui.horizontal(|ui| {
                        if ui.button("Lưu tiếp").clicked() {
                            save_anyway = true;
                        }
                        if ui.button("Hủy").clicked() {
                            cancel = true;
                        }
                    });
                });
            if save_anyway {
                self.confirm_format_loss = false;
                self.write_save();
            } else if cancel {
                self.confirm_format_loss = false;
            }
        }
    }
}

impl NomSheetApp {
    fn find_next(&mut self) {
        if self.find_query.is_empty() {
            return;
        }
        let q = self.find_query.to_lowercase();
        let sheet = self.workbook.active();
        let mut matches = Vec::new();
        for (addr, val) in sheet.cells() {
            if val.display_text().to_lowercase().contains(&q) {
                matches.push(addr);
            }
        }
        if let Some(&next) = matches.iter().find(|&&a| a > self.selected).or_else(|| matches.first()) {
            self.select_cell(next);
            self.status = format!("Tìm thấy '{}' tại {}", self.find_query, next);
        } else {
            self.status = format!("Không tìm thấy '{}'", self.find_query);
        }
    }

    fn replace_current(&mut self) {
        if self.find_query.is_empty() {
            return;
        }
        let cur_val = self.workbook.active().get(self.selected).display_text();
        if cur_val.to_lowercase().contains(&self.find_query.to_lowercase()) {
            let new_text = cur_val.replace(&self.find_query, &self.replace_query);
            self.edit_buffer = new_text;
            self.commit_edit();
            self.find_next();
        }
    }

    fn replace_all(&mut self) {
        if self.find_query.is_empty() {
            return;
        }
        let q = self.find_query.clone();
        let rep = self.replace_query.clone();
        let mut count = 0;
        let mut before = Vec::new();
        let mut after = Vec::new();

        let cells: Vec<(CellAddress, CellValue, Option<CellStyle>)> = self
            .workbook
            .active()
            .cells()
            .map(|(a, v)| (a, v.clone(), self.workbook.active().get_style(a).cloned()))
            .collect();

        for (addr, val, style) in cells {
            let txt = val.display_text();
            if txt.contains(&q) {
                let replaced = txt.replace(&q, &rep);
                let new_val = CellValue::from_input(&replaced);
                before.push((addr, val, style.clone()));
                after.push((addr, new_val.clone(), style));
                self.workbook.active_mut().set(addr, new_val);
                count += 1;
            }
        }

        if count > 0 {
            self.record_undo(format!("Thay thế tất cả ({count} ô)"), before, after);
            self.workbook.dirty = true;
            self.refresh_bars();
            self.status = format!("Đã thay thế {count} ô");
        } else {
            self.status = format!("Không tìm thấy '{}'", self.find_query);
        }
    }
}

fn calculate_selection_stats(
    sheet: &Sheet,
    range: CellRange,
) -> (usize, Option<f64>, Option<f64>, Option<f64>, Option<f64>) {
    let mut count = 0;
    let mut sum = 0.0;
    let mut num_count = 0;
    let mut min = f64::MAX;
    let mut max = f64::MIN;

    for (address, val) in sheet.cells().filter(|(address, _)| range.contains(*address)) {
        let _ = address;
        count += 1;
        if let Some(n) = number_val(val) {
            sum += n;
            num_count += 1;
            min = min.min(n);
            max = max.max(n);
        }
    }

    if num_count > 0 {
        (count, Some(sum), Some(sum / num_count as f64), Some(min), Some(max))
    } else {
        (count, None, None, None, None)
    }
}

fn number_val(value: &CellValue) -> Option<f64> {
    match value {
        CellValue::Number(n) => Some(*n),
        CellValue::Text(s) => s.trim().parse().ok(),
        _ => None,
    }
}

fn draw_chart_panel(ui: &mut Ui, chart: &ChartItem, sheet: &Sheet) {
    let frame = egui::Frame::none()
        .fill(Color32::from_rgb(248, 250, 252))
        .stroke(Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
        .rounding(Rounding::same(8.0))
        .inner_margin(egui::Margin::symmetric(16.0, 12.0));

    frame.show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.label(RichText::new(&chart.title).strong().size(14.0));
            ui.label(format!("(Vùng {})", chart.range.start));
        });
        ui.add_space(8.0);

        // Extract categories and values from range
        let mut data: Vec<(String, f64)> = Vec::new();
        let range = chart.range;
        for row in range.iter_rows() {
            let cat = sheet
                .get(CellAddress {
                    row,
                    column: range.start.column,
                })
                .display_text();
            let val = match sheet.get(CellAddress {
                row,
                column: range.end.column,
            }) {
                CellValue::Number(n) => *n,
                CellValue::Text(s) => s.parse().unwrap_or(0.0),
                _ => 0.0,
            };
            data.push((cat, val));
        }

        if data.is_empty() {
            ui.label("Vùng chọn không có dữ liệu để vẽ biểu đồ.");
            return;
        }

        let max_val = data.iter().map(|(_, v)| *v).fold(0.0_f64, f64::max).max(1.0);
        let colors = [
            Color32::from_rgb(37, 99, 235),
            Color32::from_rgb(5, 150, 105),
            Color32::from_rgb(234, 88, 12),
            Color32::from_rgb(124, 58, 237),
            Color32::from_rgb(220, 38, 38),
        ];

        let chart_h = 160.0;
        let chart_w = ui.available_width().min(700.0);
        let (rect, _) = ui.allocate_exact_size(Vec2::new(chart_w, chart_h), egui::Sense::hover());
        let painter = ui.painter();

        painter.rect_filled(rect, Rounding::same(6.0), Color32::WHITE);
        painter.rect_stroke(
            rect,
            Rounding::same(6.0),
            Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)),
        );

        match chart.chart_type {
            ChartType::Column => {
                let bar_count = data.len();
                let bar_width = (chart_w / (bar_count as f32 * 1.5 + 1.0)).min(60.0);
                let gap = bar_width * 0.5;
                let start_x = rect.min.x + 40.0;
                let bottom_y = rect.max.y - 28.0;

                for (i, (label, val)) in data.iter().enumerate() {
                    let h = ((*val / max_val) as f32 * (chart_h - 60.0)).max(2.0);
                    let x = start_x + i as f32 * (bar_width + gap);
                    let bar_rect = Rect::from_min_max(Pos2::new(x, bottom_y - h), Pos2::new(x + bar_width, bottom_y));
                    let col = colors[i % colors.len()];
                    painter.rect_filled(
                        bar_rect,
                        Rounding {
                            nw: 4.0,
                            ne: 4.0,
                            sw: 0.0,
                            se: 0.0,
                        },
                        col,
                    );

                    // Value above bar
                    painter.text(
                        Pos2::new(x + bar_width / 2.0, bottom_y - h - 10.0),
                        Align2::CENTER_CENTER,
                        format!("{:.0}", val),
                        egui::FontId::proportional(11.0),
                        Color32::from_rgb(71, 85, 105),
                    );

                    // Label below bar
                    painter.text(
                        Pos2::new(x + bar_width / 2.0, bottom_y + 12.0),
                        Align2::CENTER_CENTER,
                        label,
                        egui::FontId::proportional(11.5),
                        Color32::from_rgb(15, 23, 42),
                    );
                }
            }
            ChartType::Bar => {
                let count = data.len();
                let bar_h = (chart_h / (count as f32 * 1.4 + 1.0)).min(24.0);
                let start_y = rect.min.y + 20.0;
                let start_x = rect.min.x + 80.0;
                let max_w = chart_w - 140.0;

                for (i, (label, val)) in data.iter().enumerate() {
                    let w = ((*val / max_val) as f32 * max_w).max(2.0);
                    let y = start_y + i as f32 * (bar_h * 1.4);
                    let bar_rect = Rect::from_min_max(Pos2::new(start_x, y), Pos2::new(start_x + w, y + bar_h));
                    let col = colors[i % colors.len()];
                    painter.rect_filled(
                        bar_rect,
                        Rounding {
                            nw: 0.0,
                            ne: 4.0,
                            sw: 0.0,
                            se: 4.0,
                        },
                        col,
                    );

                    // Label left of bar
                    painter.text(
                        Pos2::new(start_x - 10.0, y + bar_h / 2.0),
                        Align2::RIGHT_CENTER,
                        label,
                        egui::FontId::proportional(11.5),
                        Color32::from_rgb(15, 23, 42),
                    );

                    // Value right of bar
                    painter.text(
                        Pos2::new(start_x + w + 10.0, y + bar_h / 2.0),
                        Align2::LEFT_CENTER,
                        format!("{:.0}", val),
                        egui::FontId::proportional(11.0),
                        Color32::from_rgb(71, 85, 105),
                    );
                }
            }
            ChartType::Line => {
                let bottom_y = rect.max.y - 30.0;
                let step_x = (chart_w - 80.0) / (data.len().max(2) - 1) as f32;
                let mut points = Vec::new();

                for (i, (label, val)) in data.iter().enumerate() {
                    let h = ((*val / max_val) as f32 * (chart_h - 70.0)).max(2.0);
                    let x = rect.min.x + 40.0 + i as f32 * step_x;
                    let y = bottom_y - h;
                    points.push(Pos2::new(x, y));

                    painter.circle_filled(Pos2::new(x, y), 4.0, Color32::from_rgb(37, 99, 235));
                    painter.text(
                        Pos2::new(x, y - 10.0),
                        Align2::CENTER_CENTER,
                        format!("{:.0}", val),
                        egui::FontId::proportional(11.0),
                        Color32::from_rgb(71, 85, 105),
                    );
                    painter.text(
                        Pos2::new(x, bottom_y + 14.0),
                        Align2::CENTER_CENTER,
                        label,
                        egui::FontId::proportional(11.5),
                        Color32::from_rgb(15, 23, 42),
                    );
                }

                for w in points.windows(2) {
                    painter.line_segment([w[0], w[1]], Stroke::new(2.5_f32, Color32::from_rgb(37, 99, 235)));
                }
            }
            ChartType::Pie => {
                let center = Pos2::new(rect.min.x + 120.0, rect.center().y);
                let radius = 55.0;
                let total: f64 = data.iter().map(|(_, v)| *v).sum();
                let mut current_angle = 0.0_f32;

                if total > 0.0 {
                    for (i, (label, val)) in data.iter().enumerate() {
                        let sweep = (*val / total) as f32 * std::f32::consts::TAU;
                        let col = colors[i % colors.len()];
                        // Draw sector wedge approximation
                        let steps = 12;
                        for s in 0..steps {
                            let a1 = current_angle + (s as f32 / steps as f32) * sweep;
                            let a2 = current_angle + ((s + 1) as f32 / steps as f32) * sweep;
                            let p1 = Pos2::new(center.x + radius * a1.cos(), center.y + radius * a1.sin());
                            let p2 = Pos2::new(center.x + radius * a2.cos(), center.y + radius * a2.sin());
                            painter.add(egui::Shape::convex_polygon(
                                vec![center, p1, p2],
                                col,
                                Stroke::new(0.5_f32, Color32::WHITE),
                            ));
                        }
                        current_angle += sweep;

                        // Legend entry on the right
                        let leg_y = rect.min.y + 20.0 + i as f32 * 22.0;
                        let leg_box = Rect::from_min_size(Pos2::new(rect.min.x + 220.0, leg_y), Vec2::splat(12.0));
                        painter.rect_filled(leg_box, Rounding::same(2.0), col);
                        painter.text(
                            Pos2::new(rect.min.x + 240.0, leg_y + 6.0),
                            Align2::LEFT_CENTER,
                            format!("{}: {:.0} ({:.1}%)", label, val, val / total * 100.0),
                            egui::FontId::proportional(12.0),
                            Color32::from_rgb(15, 23, 42),
                        );
                    }
                }
            }
        }
    });
}

fn evaluate_cell(workbook: &Workbook, active_sheet: usize, address: CellAddress) -> CellValue {
    WorkbookContext {
        workbook,
        active_sheet,
        visiting: RefCell::new(HashSet::new()),
        depth: 0,
    }
    .cell(&address.to_string())
}

struct WorkbookContext<'a> {
    workbook: &'a Workbook,
    active_sheet: usize,
    visiting: RefCell<HashSet<(usize, CellAddress)>>,
    depth: usize,
}

impl WorkbookContext<'_> {
    fn cell_in_sheet(&self, sheet_idx: usize, address: CellAddress) -> CellValue {
        if self.depth >= FORMULA_DEPTH_LIMIT {
            return CellValue::Error("#NUM!".into());
        }
        if sheet_idx >= self.workbook.sheets.len() {
            return CellValue::Error("#REF!".into());
        }
        if !self.visiting.borrow_mut().insert((sheet_idx, address)) {
            return CellValue::Error("#REF!".into());
        }
        let sheet = &self.workbook.sheets[sheet_idx];
        let result = match sheet.get(address) {
            CellValue::Formula(formula) => {
                let shared = WorkbookContext {
                    workbook: self.workbook,
                    active_sheet: sheet_idx,
                    visiting: RefCell::new(self.visiting.borrow().clone()),
                    depth: self.depth + 1,
                };
                nom_formula::evaluate(formula, &shared)
            }
            value => value.clone(),
        };
        self.visiting.borrow_mut().remove(&(sheet_idx, address));
        result
    }
}

impl FormulaContext for WorkbookContext<'_> {
    fn cell(&self, reference: &str) -> CellValue {
        let (sheet_name, cell_part) = nom_formula::split_sheet_ref(reference);
        let sheet_idx = match sheet_name {
            Some(name) => match self.workbook.find_sheet(&name) {
                Some(idx) => idx,
                None => return CellValue::Error("#REF!".into()),
            },
            None => self.active_sheet,
        };
        let address = match CellAddress::parse(&cell_part) {
            Ok(address) => address,
            Err(_) => return CellValue::Error("#REF!".into()),
        };
        self.cell_in_sheet(sheet_idx, address)
    }

    fn range(&self, first: &str, last: &str) -> Vec<CellValue> {
        let (sheet1, cell1) = nom_formula::split_sheet_ref(first);
        let (sheet2, cell2) = nom_formula::split_sheet_ref(last);
        let sheet_idx = match sheet1.or(sheet2) {
            Some(name) => match self.workbook.find_sheet(&name) {
                Some(idx) => idx,
                None => return vec![CellValue::Error("#REF!".into())],
            },
            None => self.active_sheet,
        };
        let (Ok(first_addr), Ok(last_addr)) = (CellAddress::parse(&cell1), CellAddress::parse(&cell2)) else {
            return vec![CellValue::Error("#REF!".into())];
        };
        let range = CellRange::new(first_addr, last_addr);
        if range.cell_count() > RANGE_CELL_LIMIT {
            return vec![CellValue::Error("#NUM!".into())];
        }
        let mut results = Vec::new();
        for row in range.iter_rows() {
            for col in range.iter_columns() {
                let addr = CellAddress { row, column: col };
                results.push(self.cell_in_sheet(sheet_idx, addr));
            }
        }
        results
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sheet_appearance_forces_light_theme() {
        let context = Context::default();
        setup_sheet_appearance(&context);
        assert!(!context.style().visuals.dark_mode);
    }

    #[test]
    fn multi_sheet_formula_context_calculates_cross_sheet_and_prevents_cycles() {
        let mut workbook = Workbook::default();
        let s1 = 0;
        let s2 = workbook.add_sheet("Sheet2");

        workbook.sheets[s1].set(CellAddress::parse("A1").unwrap(), CellValue::Number(100.0));
        workbook.sheets[s1].set(CellAddress::parse("A2").unwrap(), CellValue::Number(200.0));

        // In Sheet2: reference Sheet1!A1
        workbook.sheets[s2].set(
            CellAddress::parse("B1").unwrap(),
            CellValue::Formula("Sheet1!A1*2".into()),
        );

        // Circular reference across sheets
        workbook.sheets[s1].set(
            CellAddress::parse("C1").unwrap(),
            CellValue::Formula("Sheet2!C1".into()),
        );
        workbook.sheets[s2].set(
            CellAddress::parse("C1").unwrap(),
            CellValue::Formula("Sheet1!C1".into()),
        );

        assert_eq!(
            evaluate_cell(&workbook, s2, CellAddress::parse("B1").unwrap()),
            CellValue::Number(200.0)
        );
        assert_eq!(
            evaluate_cell(&workbook, s1, CellAddress::parse("C1").unwrap()),
            CellValue::Error("#REF!".into())
        );
    }

    #[test]
    fn selection_statistics_computes_sum_avg_min_max() {
        let mut sheet = Sheet::new("Data");
        sheet.set(CellAddress::parse("A1").unwrap(), CellValue::Number(10.0));
        sheet.set(CellAddress::parse("A2").unwrap(), CellValue::Number(20.0));
        sheet.set(CellAddress::parse("A3").unwrap(), CellValue::Number(30.0));
        sheet.set(CellAddress::parse("A4").unwrap(), CellValue::Text("Label".into()));

        let range = CellRange::parse("A1:A4").unwrap();
        let (count, sum, avg, min, max) = calculate_selection_stats(&sheet, range);

        assert_eq!(count, 4);
        assert_eq!(sum, Some(60.0));
        assert_eq!(avg, Some(20.0));
        assert_eq!(min, Some(10.0));
        assert_eq!(max, Some(30.0));
    }
}
