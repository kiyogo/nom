use std::cell::RefCell;
use std::collections::HashSet;
use std::path::PathBuf;

use eframe::egui::{
    self, Align2, Color32, Context, FontData, FontDefinitions, FontFamily, Key, Pos2, Rect, RichText, Rounding,
    ScrollArea, Stroke, Ui, Vec2,
};
use nom_formula::FormulaContext;
use nom_workbook::{
    CellAddress, CellAlign, CellRange, CellStyle, CellValue, NumFormat, Sheet, Workbook, MAX_COLUMNS, MAX_ROWS,
};

const ROW_HEIGHT: f32 = 22.0;
const COLUMN_WIDTH: f32 = 76.0;
const ROW_HEADER_WIDTH: f32 = 40.0;
const FORMULA_DEPTH_LIMIT: usize = 500;
const RANGE_CELL_LIMIT: u64 = 100_000;
const EXCEL_GREEN: Color32 = Color32::from_rgb(33, 115, 70);
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
    path_is_focused: bool,
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
}

fn setup_sheet_appearance(context: &Context) {
    let mut fonts = FontDefinitions::default();
    for path in [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"] {
        if let Ok(data) = std::fs::read(path) {
            fonts.font_data.insert(
                "nom_sheet_vietnamese".to_owned(),
                std::sync::Arc::new(FontData::from_owned(data)),
            );
            fonts
                .families
                .entry(FontFamily::Proportional)
                .or_default()
                .insert(0, "nom_sheet_vietnamese".to_owned());
            break;
        }
    }
    context.set_fonts(fonts);

    let mut visuals = egui::Visuals::light();
    visuals.override_text_color = Some(Color32::from_rgb(15, 23, 42));
    visuals.widgets.inactive.bg_fill = Color32::WHITE;
    visuals.widgets.inactive.bg_stroke = Stroke::NONE;
    visuals.widgets.inactive.fg_stroke = Stroke::new(1.0_f32, RIBBON_TEXT);
    visuals.widgets.inactive.rounding = Rounding::same(3.0);
    visuals.widgets.hovered.bg_fill = Color32::from_rgb(235, 235, 235);
    visuals.widgets.hovered.bg_stroke = Stroke::new(1.0_f32, RIBBON_BORDER);
    visuals.widgets.hovered.fg_stroke = Stroke::new(1.0_f32, RIBBON_TEXT);
    visuals.widgets.hovered.rounding = Rounding::same(3.0);
    visuals.widgets.active.bg_fill = Color32::from_rgb(226, 239, 228);
    visuals.widgets.active.bg_stroke = Stroke::new(1.0_f32, EXCEL_GREEN);
    visuals.widgets.active.fg_stroke = Stroke::new(1.0_f32, RIBBON_TEXT);
    visuals.widgets.active.rounding = Rounding::same(3.0);
    visuals.panel_fill = Color32::WHITE;
    visuals.window_fill = Color32::WHITE;
    visuals.faint_bg_color = Color32::from_rgb(248, 248, 248);
    visuals.extreme_bg_color = Color32::WHITE;
    context.set_visuals(visuals);

    let mut style = (*context.style()).clone();
    style.spacing.item_spacing = Vec2::new(4.0, 3.0);
    style.spacing.button_padding = Vec2::new(5.0, 3.0);
    context.set_style(style);
}

fn ribbon_group(ui: &mut Ui, title: &str, contents: impl FnOnce(&mut Ui)) {
    ui.vertical(|ui| {
        contents(ui);
        ui.add_space(3.0);
        ui.label(RichText::new(title).size(9.5).color(RIBBON_MUTED));
    });
    ui.add_space(3.0);
    let (separator, _) = ui.allocate_exact_size(Vec2::new(1.0, 44.0), egui::Sense::hover());
    ui.painter().line_segment(
        [separator.center_top(), separator.center_bottom()],
        Stroke::new(1.0_f32, RIBBON_BORDER),
    );
    ui.add_space(2.0);
}

fn ribbon_button(ui: &mut Ui, label: &str, width: f32, tooltip: &str) -> bool {
    ui.add_sized(
        [width, 25.0],
        egui::Button::new(RichText::new(label).size(11.5).color(RIBBON_TEXT)),
    )
    .on_hover_text(tooltip)
    .clicked()
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
            path_is_focused: false,
            name_box_is_focused: false,
            search_is_focused: false,
            pending_action: None,
            confirm_format_loss: false,
            active_ribbon_tab: RibbonTab::Home,
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
        self.refresh_bars();
    }

    fn copy_to_clipboard(&mut self, context: &Context) {
        let range = self.selection_range();
        let tsv = nom_workbook::export_tsv(self.workbook.active(), range);
        self.internal_clipboard = tsv.clone();
        context.output_mut(|o| o.copied_text = tsv);
        self.status = format!("Đã sao chép vùng {}", self.name_box_buffer);
    }

    fn cut_to_clipboard(&mut self, context: &Context) {
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
        if self.editing_cell || self.path_is_focused || self.name_box_is_focused || self.search_is_focused {
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
                self.request_open();
            } else if ctrl && input.key_pressed(Key::N) {
                self.request_new();
            } else if input.key_pressed(Key::Delete) {
                self.clear_selection();
            } else if input.key_pressed(Key::F2) {
                self.editing_cell = true;
            } else if input.key_pressed(Key::Enter) {
                self.editing_cell = true;
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

        if self.active_ribbon_tab != RibbonTab::File {
            self.path_is_focused = false;
        }
        self.handle_keyboard(context);

        let mut open_requested = false;
        let mut save_requested = false;
        let mut new_requested = false;

        // Excel-style title bar and quick access toolbar.
        let workbook_title = PathBuf::from(self.path_buffer.trim())
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Sổ làm việc1".to_owned());
        egui::TopBottomPanel::top("sheet_title_bar")
            .frame(
                egui::Frame::none()
                    .fill(Color32::WHITE)
                    .inner_margin(egui::Margin::symmetric(12.0, 4.0)),
            )
            .show(context, |ui| {
                ui.horizontal(|ui| {
                    let (icon_rect, _) = ui.allocate_exact_size(Vec2::splat(25.0), egui::Sense::hover());
                    ui.painter().rect_filled(icon_rect, Rounding::same(4.0), EXCEL_GREEN);
                    ui.painter().text(
                        icon_rect.center(),
                        Align2::CENTER_CENTER,
                        "N",
                        egui::FontId::proportional(14.0),
                        Color32::WHITE,
                    );
                    if ui
                        .small_button("Mới")
                        .on_hover_text("Sổ làm việc mới · Ctrl+N")
                        .clicked()
                    {
                        new_requested = true;
                    }
                    if ui.small_button("Hoàn tác").on_hover_text("Hoàn tác · Ctrl+Z").clicked() {
                        self.undo();
                    }
                    if ui.small_button("Làm lại").on_hover_text("Làm lại · Ctrl+Y").clicked() {
                        self.redo();
                    }
                    if ui.small_button("Lưu").on_hover_text("Lưu · Ctrl+S").clicked() {
                        save_requested = true;
                    }
                    ui.separator();
                    ui.label(
                        RichText::new(format!(
                            "{}{}",
                            workbook_title,
                            if self.workbook.dirty { " •" } else { "" }
                        ))
                        .strong()
                        .size(13.0)
                        .color(RIBBON_TEXT),
                    );

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("Tìm").clicked() {
                            self.show_find_dialog = true;
                        }
                        let search = ui.add_sized(
                            [250.0, 26.0],
                            egui::TextEdit::singleline(&mut self.find_query).hint_text("Tìm kiếm trong sheet"),
                        );
                        self.search_is_focused = search.has_focus();
                        if search.lost_focus() && ui.input(|input| input.key_pressed(Key::Enter)) {
                            self.show_find_dialog = true;
                        }
                    });
                });
            });

        if new_requested {
            self.request_new();
        }
        if save_requested {
            self.save_path();
        }

        // Excel-style ribbon tabs.
        egui::TopBottomPanel::top("sheet_ribbon_tabs")
            .frame(
                egui::Frame::none()
                    .fill(Color32::from_rgb(250, 250, 250))
                    .inner_margin(egui::Margin::symmetric(10.0, 0.0)),
            )
            .show(context, |ui| {
                ui.horizontal(|ui| {
                    let tabs = [
                        (RibbonTab::File, "Tệp"),
                        (RibbonTab::Home, "Trang chủ"),
                        (RibbonTab::Insert, "Chèn"),
                        (RibbonTab::Draw, "Vẽ"),
                        (RibbonTab::PageLayout, "Bố trí trang"),
                        (RibbonTab::Formulas, "Công thức"),
                        (RibbonTab::Data, "Dữ liệu"),
                        (RibbonTab::Review, "Xem lại"),
                        (RibbonTab::View, "Xem"),
                        (RibbonTab::Help, "Trợ giúp"),
                    ];
                    for (tab, title) in tabs {
                        let active = self.active_ribbon_tab == tab;
                        let color = if active || tab == RibbonTab::File {
                            EXCEL_GREEN
                        } else {
                            RIBBON_TEXT
                        };
                        let width = match tab {
                            RibbonTab::Home => 76.0,
                            RibbonTab::Formulas | RibbonTab::PageLayout => 82.0,
                            _ => 58.0,
                        };
                        let response = ui.add_sized(
                            [width, 30.0],
                            egui::Button::new(RichText::new(title).size(12.0).color(color))
                                .fill(if active { Color32::WHITE } else { Color32::TRANSPARENT })
                                .stroke(Stroke::NONE)
                                .rounding(Rounding::ZERO),
                        );
                        if active {
                            let underline = Rect::from_min_max(
                                Pos2::new(response.rect.left() + 5.0, response.rect.bottom() - 2.0),
                                Pos2::new(response.rect.right() - 5.0, response.rect.bottom()),
                            );
                            ui.painter().rect_filled(underline, Rounding::ZERO, EXCEL_GREEN);
                        }
                        if response.clicked() {
                            self.active_ribbon_tab = tab;
                        }
                    }
                });
            });

        // Ribbon groups: compact, responsive, and no overlay scrollbar.
        egui::TopBottomPanel::top("sheet_ribbon_toolbar")
            .frame(
                egui::Frame::none()
                    .fill(Color32::from_rgb(247, 247, 247))
                    .stroke(Stroke::new(1.0_f32, RIBBON_BORDER))
                    .inner_margin(egui::Margin::symmetric(10.0, 5.0)),
            )
            .show(context, |ui| {
                ui.horizontal_wrapped(|ui| match self.active_ribbon_tab {
                    RibbonTab::File => {
                        ribbon_group(ui, "Sổ làm việc", |ui| {
                            ui.horizontal(|ui| {
                                if ribbon_button(ui, "Mới", 44.0, "Tạo sổ làm việc mới") {
                                    new_requested = true;
                                }
                                if ribbon_button(ui, "Mở", 44.0, "Mở tệp theo đường dẫn bên cạnh") {
                                    open_requested = true;
                                }
                                if ribbon_button(ui, "Lưu", 44.0, "Lưu sổ làm việc") {
                                    save_requested = true;
                                }
                            });
                        });
                        ribbon_group(ui, "Đường dẫn tệp", |ui| {
                            ui.horizontal(|ui| {
                                let response = ui.add_sized(
                                    [360.0, 25.0],
                                    egui::TextEdit::singleline(&mut self.path_buffer)
                                        .hint_text("Đường dẫn .xlsx hoặc .csv"),
                                );
                                self.path_is_focused = response.has_focus();
                                if response.lost_focus() && ui.input(|input| input.key_pressed(Key::Enter)) {
                                    open_requested = true;
                                }
                                if ribbon_button(ui, "Đi tới", 48.0, "Mở tệp theo đường dẫn") {
                                    open_requested = true;
                                }
                            });
                        });
                    }
                    RibbonTab::Home => {
                        ribbon_group(ui, "Bảng tạm", |ui| {
                            ui.horizontal(|ui| {
                                if ribbon_button(ui, "Dán", 42.0, "Dán · Ctrl+V") {
                                    let clip = self.internal_clipboard.clone();
                                    self.paste_from_clipboard(&clip);
                                }
                                if ribbon_button(ui, "Cắt", 42.0, "Cắt · Ctrl+X") {
                                    self.cut_to_clipboard(context);
                                }
                                if ribbon_button(ui, "Chép", 46.0, "Sao chép · Ctrl+C") {
                                    self.copy_to_clipboard(context);
                                }
                            });
                        });
                        ribbon_group(ui, "Hoàn tác", |ui| {
                            ui.horizontal(|ui| {
                                if ribbon_button(ui, "Hoàn tác", 62.0, "Hoàn tác · Ctrl+Z") {
                                    self.undo();
                                }
                                if ribbon_button(ui, "Làm lại", 58.0, "Làm lại · Ctrl+Y") {
                                    self.redo();
                                }
                            });
                        });
                        ribbon_group(ui, "Phông chữ", |ui| {
                            ui.horizontal(|ui| {
                                if ribbon_button(ui, "B", 30.0, "In đậm · Ctrl+B") {
                                    self.apply_style_to_selection("In đậm", |style| style.bold = !style.bold);
                                }
                                if ribbon_button(ui, "I", 30.0, "In nghiêng · Ctrl+I") {
                                    self.apply_style_to_selection("In nghiêng", |style| style.italic = !style.italic);
                                }
                                ui.menu_button(RichText::new("Màu chữ").color(RIBBON_TEXT), |ui| {
                                    for (rgb, name) in [
                                        ([31, 31, 31], "Đen"),
                                        ([192, 0, 0], "Đỏ"),
                                        ([0, 112, 192], "Xanh dương"),
                                        ([0, 128, 96], "Xanh lá"),
                                        ([112, 48, 160], "Tím"),
                                    ] {
                                        if ui
                                            .button(
                                                RichText::new("A")
                                                    .strong()
                                                    .color(Color32::from_rgb(rgb[0], rgb[1], rgb[2])),
                                            )
                                            .on_hover_text(name)
                                            .clicked()
                                        {
                                            self.apply_style_to_selection(name, |style| style.text_color = Some(rgb));
                                            ui.close_menu();
                                        }
                                    }
                                });
                                ui.menu_button(RichText::new("Tô nền").color(RIBBON_TEXT), |ui| {
                                    for (rgb, name) in [
                                        ([255, 242, 204], "Vàng nhạt"),
                                        ([221, 235, 247], "Xanh dương nhạt"),
                                        ([226, 240, 217], "Xanh lá nhạt"),
                                        ([252, 228, 214], "Cam nhạt"),
                                        ([255, 255, 255], "Trắng"),
                                    ] {
                                        if ui
                                            .button(RichText::new("■").color(Color32::from_rgb(rgb[0], rgb[1], rgb[2])))
                                            .on_hover_text(name)
                                            .clicked()
                                        {
                                            self.apply_style_to_selection(name, |style| style.bg_color = Some(rgb));
                                            ui.close_menu();
                                        }
                                    }
                                });
                            });
                        });
                        ribbon_group(ui, "Căn chỉnh", |ui| {
                            ui.horizontal(|ui| {
                                for (label, align, hint) in [
                                    ("Trái", CellAlign::Left, "Căn trái"),
                                    ("Giữa", CellAlign::Center, "Căn giữa"),
                                    ("Phải", CellAlign::Right, "Căn phải"),
                                ] {
                                    if ribbon_button(ui, label, 36.0, hint) {
                                        self.apply_style_to_selection(hint, |style| style.align = align);
                                    }
                                }
                            });
                        });
                        ribbon_group(ui, "Định dạng số", |ui| {
                            ui.horizontal(|ui| {
                                for (label, format, hint, width) in [
                                    ("Tổng quát", NumFormat::General, "Định dạng tổng quát", 64.0),
                                    ("123", NumFormat::Number, "Định dạng số", 38.0),
                                    ("$", NumFormat::Currency, "Định dạng tiền tệ", 30.0),
                                    ("%", NumFormat::Percentage, "Định dạng phần trăm", 30.0),
                                    ("Ngày", NumFormat::Date, "Định dạng ngày", 42.0),
                                ] {
                                    if ribbon_button(ui, label, width, hint) {
                                        self.apply_style_to_selection(hint, |style| style.num_format = format);
                                    }
                                }
                            });
                        });
                        ribbon_group(ui, "Ô", |ui| {
                            ui.horizontal_wrapped(|ui| {
                                if ribbon_button(ui, "+ Hàng", 48.0, "Chèn hàng") {
                                    let row = self.selected.row;
                                    self.workbook.active_mut().insert_row(row);
                                    self.workbook.dirty = true;
                                    self.refresh_bars();
                                }
                                if ribbon_button(ui, "− Hàng", 48.0, "Xóa hàng") {
                                    let row = self.selected.row;
                                    self.workbook.active_mut().delete_row(row);
                                    self.workbook.dirty = true;
                                    self.refresh_bars();
                                }
                                if ribbon_button(ui, "+ Cột", 44.0, "Chèn cột") {
                                    let column = self.selected.column;
                                    self.workbook.active_mut().insert_column(column);
                                    self.workbook.dirty = true;
                                    self.refresh_bars();
                                }
                                if ribbon_button(ui, "− Cột", 44.0, "Xóa cột") {
                                    let column = self.selected.column;
                                    self.workbook.active_mut().delete_column(column);
                                    self.workbook.dirty = true;
                                    self.refresh_bars();
                                }
                                if ribbon_button(ui, "Xóa", 38.0, "Xóa nội dung vùng chọn") {
                                    self.clear_selection();
                                }
                            });
                        });
                        ribbon_group(ui, "Chỉnh sửa", |ui| {
                            ui.horizontal(|ui| {
                                if ribbon_button(ui, "A-Z", 40.0, "Sắp xếp tăng dần") {
                                    self.sort_selection(true);
                                }
                                if ribbon_button(ui, "Z-A", 40.0, "Sắp xếp giảm dần") {
                                    self.sort_selection(false);
                                }
                                if ribbon_button(ui, "Tìm", 40.0, "Tìm và thay thế · Ctrl+F") {
                                    self.show_find_dialog = true;
                                }
                            });
                        });
                    }
                    RibbonTab::Insert => {
                        ribbon_group(ui, "Biểu đồ", |ui| {
                            ui.horizontal(|ui| {
                                for (label, title, chart_type) in [
                                    ("Cột", "Biểu đồ Cột", ChartType::Column),
                                    ("Đường", "Biểu đồ Đường", ChartType::Line),
                                    ("Thanh", "Biểu đồ Thanh", ChartType::Bar),
                                    ("Tròn", "Biểu đồ Tròn", ChartType::Pie),
                                ] {
                                    if ribbon_button(ui, label, 52.0, title) {
                                        self.chart = Some(ChartItem {
                                            title: title.into(),
                                            chart_type,
                                            range: self.selection_range(),
                                        });
                                        self.status = format!("Đã tạo {title} từ vùng chọn");
                                    }
                                }
                                if self.chart.is_some() && ribbon_button(ui, "Đóng", 44.0, "Đóng biểu đồ") {
                                    self.chart = None;
                                }
                            });
                        });
                        ribbon_group(ui, "Trang tính", |ui| {
                            if ribbon_button(ui, "+ Sheet", 58.0, "Thêm trang tính") {
                                self.workbook.active_sheet = self.workbook.add_sheet("Sheet");
                                self.workbook.dirty = true;
                                self.selected = CellAddress { row: 1, column: 1 };
                                self.selection_end = None;
                                self.refresh_bars();
                            }
                        });
                    }
                    RibbonTab::Draw => {
                        ribbon_group(ui, "Bút vẽ", |ui| {
                            ui.horizontal(|ui| {
                                for label in ["Bút", "Bút chì", "Tẩy", "Tô sáng"] {
                                    ui.add_enabled(false, egui::Button::new(RichText::new(label).size(11.5)));
                                }
                            });
                        });
                        ribbon_group(ui, "Thao tác", |ui| {
                            ui.label(RichText::new("Vẽ trên ô tính chưa khả dụng").size(11.0));
                        });
                    }
                    RibbonTab::PageLayout => {
                        ribbon_group(ui, "Thiết lập trang", |ui| {
                            ui.horizontal(|ui| {
                                for label in ["Lề", "Hướng", "Khổ giấy", "Khu vực in"] {
                                    ui.add_enabled(false, egui::Button::new(RichText::new(label).size(11.5)));
                                }
                            });
                        });
                        ribbon_group(ui, "Tùy chọn trang tính", |ui| {
                            let mut grid_toggle = self.show_gridlines;
                            if ui.checkbox(&mut grid_toggle, "Đường lưới").changed() {
                                self.show_gridlines = grid_toggle;
                            }
                        });
                    }
                    RibbonTab::Formulas => {
                        ribbon_group(ui, "Thư viện hàm", |ui| {
                            ui.horizontal_wrapped(|ui| {
                                for function in ["SUM", "AVERAGE", "COUNT", "MAX", "MIN", "IF", "VLOOKUP", "ROUND"] {
                                    if ribbon_button(ui, function, 62.0, &format!("Chèn hàm {function}")) {
                                        self.formula_buffer = format!("={function}(");
                                        self.edit_buffer = self.formula_buffer.clone();
                                        self.editing_cell = true;
                                    }
                                }
                            });
                        });
                        ribbon_group(ui, "Tính toán", |ui| {
                            if ribbon_button(ui, "Tính lại", 64.0, "Tính lại công thức") {
                                self.status = "Đã tính lại công thức bảng tính".into();
                            }
                        });
                    }
                    RibbonTab::Data => {
                        ribbon_group(ui, "Sắp xếp", |ui| {
                            ui.horizontal(|ui| {
                                if ribbon_button(ui, "A-Z", 48.0, "Sắp xếp tăng dần") {
                                    self.sort_selection(true);
                                }
                                if ribbon_button(ui, "Z-A", 48.0, "Sắp xếp giảm dần") {
                                    self.sort_selection(false);
                                }
                            });
                        });
                        ribbon_group(ui, "Xuất dữ liệu", |ui| {
                            if ribbon_button(ui, "Sao chép TSV", 92.0, "Sao chép sheet dưới dạng TSV") {
                                let range = self.workbook.active().used_range().unwrap_or(self.selection_range());
                                context.output_mut(|output| {
                                    output.copied_text = nom_workbook::export_tsv(self.workbook.active(), range)
                                });
                                self.status = "Đã sao chép nội dung sheet dưới dạng CSV/TSV".into();
                            }
                        });
                    }
                    RibbonTab::Review => {
                        ribbon_group(ui, "Kiểm lỗi", |ui| {
                            if ribbon_button(ui, "Tìm & thay thế", 104.0, "Tìm và thay thế · Ctrl+F") {
                                self.show_find_dialog = true;
                            }
                        });
                        ribbon_group(ui, "Nhận xét và bảo vệ", |ui| {
                            ui.horizontal(|ui| {
                                for label in ["Nhận xét", "Bảo vệ sheet", "Bảo vệ sổ"] {
                                    ui.add_enabled(false, egui::Button::new(RichText::new(label).size(11.5)));
                                }
                            });
                        });
                    }
                    RibbonTab::View => {
                        ribbon_group(ui, "Thu phóng", |ui| {
                            ui.horizontal(|ui| {
                                for (label, zoom) in [("Thu nhỏ", 0.75), ("100%", 1.0), ("Phóng to", 1.25)] {
                                    if ribbon_button(ui, label, 44.0, &format!("Thu phóng {}%", (zoom * 100.0) as u32))
                                    {
                                        self.zoom = zoom;
                                    }
                                }
                            });
                        });
                        ribbon_group(ui, "Hiển thị", |ui| {
                            let mut grid_toggle = self.show_gridlines;
                            if ui.checkbox(&mut grid_toggle, "Đường lưới").changed() {
                                self.show_gridlines = grid_toggle;
                            }
                        });
                    }
                    RibbonTab::Help => {
                        ribbon_group(ui, "Trợ giúp", |ui| {
                            ui.label(RichText::new("Nom Sheet · Bảng tính tương thích XLSX/CSV").size(11.5));
                        });
                        ribbon_group(ui, "Phím tắt", |ui| {
                            ui.label(RichText::new("Ctrl+N mới · Ctrl+O mở · Ctrl+S lưu · F2 sửa ô").size(11.0));
                        });
                    }
                });
            });

        if new_requested {
            self.request_new();
        }
        if open_requested {
            self.request_open();
        }
        if save_requested {
            self.save_path();
        }

        // Formula bar modeled after Excel's name box, cancel/commit controls, and fx input.
        egui::TopBottomPanel::top("formula_bar")
            .frame(
                egui::Frame::none()
                    .fill(Color32::from_rgb(250, 250, 250))
                    .stroke(Stroke::new(1.0_f32, RIBBON_BORDER))
                    .inner_margin(egui::Margin::symmetric(10.0, 4.0)),
            )
            .show(context, |ui| {
                ui.horizontal(|ui| {
                    let name_resp = ui.add_sized(
                        [88.0, 26.0],
                        egui::TextEdit::singleline(&mut self.name_box_buffer)
                            .margin(Vec2::new(5.0, 2.0))
                            .horizontal_align(egui::Align::Center),
                    );
                    self.name_box_is_focused = name_resp.has_focus();
                    if name_resp.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                        if let Ok(addr) = CellAddress::parse(&self.name_box_buffer) {
                            self.select_cell(addr);
                        }
                    }

                    if ui.small_button("×").on_hover_text("Hủy sửa ô").clicked() {
                        self.editing_cell = false;
                        self.refresh_bars();
                    }
                    if ui.small_button("✓").on_hover_text("Xác nhận sửa ô").clicked() {
                        self.edit_buffer = self.formula_buffer.clone();
                        self.commit_edit();
                    }
                    ui.separator();
                    ui.label(RichText::new("fx").italics().size(14.0).color(RIBBON_MUTED));

                    let response = ui.add_sized(
                        [ui.available_width().max(160.0), 26.0],
                        egui::TextEdit::singleline(&mut self.formula_buffer).hint_text("Nhập giá trị hoặc công thức"),
                    );
                    if response.lost_focus() && ui.input(|input| input.key_pressed(Key::Enter)) {
                        self.edit_buffer = self.formula_buffer.clone();
                        self.commit_edit();
                    }
                });
            });

        // 5. BOTTOM STATUS BAR
        egui::TopBottomPanel::bottom("sheet_status")
            .frame(
                egui::Frame::none()
                    .fill(Color32::from_rgb(243, 243, 243))
                    .stroke(Stroke::new(1.0_f32, RIBBON_BORDER))
                    .inner_margin(egui::Margin::symmetric(9.0, 3.0)),
            )
            .show(context, |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new(&self.status).color(RIBBON_MUTED));
                    if self.workbook.dirty {
                        ui.separator();
                        ui.label(RichText::new("Chưa lưu").color(Color32::from_rgb(180, 45, 45)));
                    }

                    let range = self.selection_range();
                    if range.cell_count() > 1 {
                        ui.separator();
                        let (count, sum, avg, _, _) = calculate_selection_stats(self.workbook.active(), range);
                        ui.label(format!("Số lượng: {count}"));
                        if let Some(sum_val) = sum {
                            ui.label(format!("Tổng: {:.2}", sum_val));
                        }
                        if let Some(avg_val) = avg {
                            ui.label(format!("TB: {:.2}", avg_val));
                        }
                    }

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.label(format!("{}%", (self.zoom * 100.0).round() as u32));
                        if ui.small_button("+").clicked() {
                            self.zoom = (self.zoom + 0.1).min(2.0);
                        }
                        ui.add_sized(
                            [95.0, 14.0],
                            egui::Slider::new(&mut self.zoom, 0.5..=2.0).show_value(false),
                        );
                        if ui.small_button("−").clicked() {
                            self.zoom = (self.zoom - 0.1).max(0.5);
                        }
                    });
                });
            });

        // 6. BOTTOM SHEET TABS BAR
        egui::TopBottomPanel::bottom("sheet_tabs")
            .frame(
                egui::Frame::none()
                    .fill(Color32::from_rgb(243, 243, 243))
                    .stroke(Stroke::new(1.0_f32, RIBBON_BORDER))
                    .inner_margin(egui::Margin::symmetric(9.0, 2.0)),
            )
            .show(context, |ui| {
                ui.horizontal(|ui| {
                    let mut selected_tab = None;
                    let mut delete_tab = None;

                    for (index, sheet) in self.workbook.sheets.iter().enumerate() {
                        let is_active = index == self.workbook.active_sheet;
                        let response = ui.add_sized(
                            [88.0, 27.0],
                            egui::Button::new(RichText::new(&sheet.name).size(11.5).color(if is_active {
                                RIBBON_TEXT
                            } else {
                                RIBBON_MUTED
                            }))
                            .fill(if is_active {
                                Color32::WHITE
                            } else {
                                Color32::TRANSPARENT
                            })
                            .stroke(Stroke::NONE)
                            .rounding(Rounding::same(2.0)),
                        );
                        if is_active {
                            let underline = Rect::from_min_max(
                                Pos2::new(response.rect.left() + 5.0, response.rect.bottom() - 2.0),
                                Pos2::new(response.rect.right() - 5.0, response.rect.bottom()),
                            );
                            ui.painter().rect_filled(underline, Rounding::ZERO, EXCEL_GREEN);
                        }

                        if response.clicked() {
                            selected_tab = Some(index);
                        }
                        if response.double_clicked() {
                            self.rename_sheet_idx = Some(index);
                            self.rename_sheet_buffer = sheet.name.clone();
                        }
                        if is_active && self.workbook.sheets.len() > 1 {
                            if ui.small_button("✕").clicked() {
                                delete_tab = Some(index);
                            }
                        }
                    }

                    if let Some(index) = selected_tab {
                        self.workbook.active_sheet = index;
                        self.selected = CellAddress { row: 1, column: 1 };
                        self.selection_end = None;
                        self.refresh_bars();
                    }
                    if let Some(index) = delete_tab {
                        let _ = self.workbook.delete_sheet(index);
                        self.refresh_bars();
                    }

                    if ui.small_button("+").on_hover_text("Thêm trang tính").clicked() {
                        self.workbook.active_sheet = self.workbook.add_sheet("Sheet");
                        self.workbook.dirty = true;
                        self.selected = CellAddress { row: 1, column: 1 };
                        self.selection_end = None;
                        self.refresh_bars();
                    }

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.add_sized(
                            [150.0, 14.0],
                            egui::Slider::new(&mut self.first_column, 1..=MAX_COLUMNS).show_value(false),
                        )
                        .on_hover_text("Cuộn ngang qua các cột");
                        ui.label(RichText::new("Cuộn ngang").size(10.5).color(RIBBON_MUTED));
                    });
                });
            });

        // 7. CENTRAL PANEL: Grid & Chart
        egui::CentralPanel::default()
            .frame(
                egui::Frame::none()
                    .fill(Color32::WHITE)
                    .inner_margin(egui::Margin::same(0.0)),
            )
            .show(context, |ui| {
                // Render Chart above or below grid if active
                if let Some(ref chart_item) = self.chart {
                    draw_chart_panel(ui, chart_item, self.workbook.active());
                    ui.add_space(8.0);
                }

                ui.scope(|ui| {
                    // Spreadsheet cells must touch edge-to-edge; global widget spacing
                    // otherwise turns every cell into a separate floating card.
                    ui.spacing_mut().item_spacing = Vec2::ZERO;
                    self.draw_grid(ui);
                });
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

    fn draw_grid(&mut self, ui: &mut Ui) {
        let col_w = (COLUMN_WIDTH * self.zoom).max(40.0);
        let row_h = (ROW_HEIGHT * self.zoom).max(20.0);
        let header_w = ROW_HEADER_WIDTH;

        let available_width = ui.available_width();
        let visible_columns = (((available_width - header_w) / col_w).floor() as u16).clamp(3, 40);
        let end_column = self.first_column.saturating_add(visible_columns - 1).min(MAX_COLUMNS);
        let first_column = self.first_column;

        let selection_range = self.selection_range();
        let selected = self.selected;
        let active_sheet = self.workbook.active_sheet;
        let zoom = self.zoom;
        let show_gridlines = self.show_gridlines;
        let editing_cell = self.editing_cell;
        let workbook = &self.workbook;
        let edit_buffer = &mut self.edit_buffer;

        let mut corner_clicked = false;
        let mut header_col_clicked = None;
        let mut header_row_clicked = None;
        let mut clicked = None;
        let mut shift_clicked = None;
        let mut drag_hovered = None;
        let mut start_edit = false;
        let mut edit_finished = false;
        let mut edit_cancelled = false;

        // Top Column Headers row
        ui.horizontal(|ui| {
            // Corner Button (Select All)
            let (corner_rect, corner_resp) = ui.allocate_exact_size(Vec2::new(header_w, row_h), egui::Sense::click());
            ui.painter()
                .rect_filled(corner_rect, Rounding::ZERO, Color32::from_rgb(243, 243, 243));
            ui.painter()
                .rect_stroke(corner_rect, Rounding::ZERO, Stroke::new(0.5_f32, RIBBON_BORDER));
            if corner_resp.clicked() {
                corner_clicked = true;
            }

            for column in first_column..=end_column {
                let is_col_selected = column >= selection_range.start.column && column <= selection_range.end.column;
                let (h_rect, h_resp) = ui.allocate_exact_size(Vec2::new(col_w, row_h), egui::Sense::click());
                ui.painter().rect_filled(
                    h_rect,
                    Rounding::ZERO,
                    if is_col_selected {
                        Color32::from_rgb(226, 240, 217)
                    } else {
                        Color32::from_rgb(243, 243, 243)
                    },
                );
                ui.painter()
                    .rect_stroke(h_rect, Rounding::ZERO, Stroke::new(0.5_f32, RIBBON_BORDER));
                ui.painter().text(
                    h_rect.center(),
                    Align2::CENTER_CENTER,
                    nom_workbook::column_name(column),
                    egui::FontId::proportional(12.0 * zoom),
                    RIBBON_TEXT,
                );
                if h_resp.clicked() {
                    header_col_clicked = Some(column);
                }
            }
        });

        // Virtualized Vertical Row Scrolling
        ScrollArea::vertical()
            .id_salt("sheet_rows")
            .auto_shrink([false, false])
            .show_rows(ui, row_h, MAX_ROWS as usize, |ui, rows| {
                for row_index in rows {
                    let row = row_index as u32 + 1;
                    let is_row_selected = row >= selection_range.start.row && row <= selection_range.end.row;

                    ui.horizontal(|ui| {
                        // Row Header
                        let (r_rect, r_resp) = ui.allocate_exact_size(Vec2::new(header_w, row_h), egui::Sense::click());
                        ui.painter().rect_filled(
                            r_rect,
                            Rounding::ZERO,
                            if is_row_selected {
                                Color32::from_rgb(226, 240, 217)
                            } else {
                                Color32::from_rgb(243, 243, 243)
                            },
                        );
                        ui.painter()
                            .rect_stroke(r_rect, Rounding::ZERO, Stroke::new(0.5_f32, RIBBON_BORDER));
                        ui.painter().text(
                            r_rect.center(),
                            Align2::CENTER_CENTER,
                            row.to_string(),
                            egui::FontId::proportional(11.5 * zoom),
                            RIBBON_TEXT,
                        );
                        if r_resp.clicked() {
                            header_row_clicked = Some(row);
                        }

                        // Cells
                        let current_sheet = &workbook.sheets[active_sheet];
                        for column in first_column..=end_column {
                            let address = CellAddress { row, column };
                            let is_active_cell = address == selected;
                            let in_selection = selection_range.contains(address);

                            if is_active_cell && editing_cell {
                                let response = ui.add_sized(
                                    [col_w, row_h],
                                    egui::TextEdit::singleline(edit_buffer).margin(Vec2::new(4.0, 3.0)),
                                );
                                response.request_focus();
                                if response.lost_focus() {
                                    if ui.input(|input| input.key_pressed(Key::Escape)) {
                                        edit_cancelled = true;
                                    } else {
                                        edit_finished = true;
                                    }
                                }
                            } else {
                                let style = current_sheet.get_style(address);
                                let value = evaluate_cell(workbook, active_sheet, address);
                                let num_fmt = style.map(|s| s.num_format).unwrap_or(NumFormat::General);
                                let text = value.format_display(num_fmt);

                                let (cell_rect, response) =
                                    ui.allocate_exact_size(Vec2::new(col_w, row_h), egui::Sense::click_and_drag());

                                // Cell background color
                                let bg = if let Some(s) = style {
                                    if let Some([r, g, b]) = s.bg_color {
                                        Color32::from_rgb(r, g, b)
                                    } else if in_selection && !is_active_cell {
                                        Color32::from_rgb(239, 247, 237)
                                    } else {
                                        Color32::WHITE
                                    }
                                } else if in_selection && !is_active_cell {
                                    Color32::from_rgb(239, 247, 237)
                                } else {
                                    Color32::WHITE
                                };

                                ui.painter().rect_filled(cell_rect, Rounding::ZERO, bg);

                                // Gridline
                                if show_gridlines {
                                    ui.painter().rect_stroke(
                                        cell_rect,
                                        Rounding::ZERO,
                                        Stroke::new(0.5_f32, Color32::from_rgb(217, 217, 217)),
                                    );
                                }

                                // Active cell border
                                if is_active_cell {
                                    ui.painter().rect_stroke(
                                        cell_rect,
                                        Rounding::ZERO,
                                        Stroke::new(2.0_f32, EXCEL_GREEN),
                                    );
                                    // Corner fill handle
                                    let handle_rect = Rect::from_center_size(
                                        Pos2::new(cell_rect.max.x, cell_rect.max.y),
                                        Vec2::splat(5.0),
                                    );
                                    ui.painter().rect_filled(handle_rect, Rounding::ZERO, EXCEL_GREEN);
                                }

                                // Text alignment and color
                                let text_color = if let Some(s) = style {
                                    if let Some([r, g, b]) = s.text_color {
                                        Color32::from_rgb(r, g, b)
                                    } else {
                                        Color32::from_rgb(15, 23, 42)
                                    }
                                } else {
                                    Color32::from_rgb(15, 23, 42)
                                };

                                let align = style.map(|s| s.align).unwrap_or(CellAlign::General);
                                let (align2, text_pos) = match align {
                                    CellAlign::Center => (Align2::CENTER_CENTER, cell_rect.center()),
                                    CellAlign::Right => (
                                        Align2::RIGHT_CENTER,
                                        Pos2::new(cell_rect.max.x - 6.0, cell_rect.center().y),
                                    ),
                                    _ => (
                                        Align2::LEFT_CENTER,
                                        Pos2::new(cell_rect.min.x + 6.0, cell_rect.center().y),
                                    ),
                                };

                                let font = if style.map(|s| s.bold).unwrap_or(false) {
                                    egui::FontId::proportional(13.0 * zoom)
                                } else {
                                    egui::FontId::proportional(12.5 * zoom)
                                };

                                ui.painter().text(text_pos, align2, text, font, text_color);

                                if response.clicked() {
                                    if ui.input(|i| i.modifiers.shift) {
                                        shift_clicked = Some(address);
                                    } else {
                                        clicked = Some(address);
                                    }
                                }
                                if response.double_clicked() {
                                    clicked = Some(address);
                                    start_edit = true;
                                }
                                if response.dragged() {
                                    drag_hovered = Some(address);
                                }
                            }
                        }
                    });
                }
            });

        if corner_clicked {
            self.selected = CellAddress { row: 1, column: 1 };
            self.selection_end = Some(CellAddress { row: 50, column: 20 });
            self.refresh_bars();
        }
        if let Some(col) = header_col_clicked {
            self.selected = CellAddress { row: 1, column: col };
            self.selection_end = Some(CellAddress { row: 100, column: col });
            self.refresh_bars();
        }
        if let Some(row) = header_row_clicked {
            self.selected = CellAddress { row, column: 1 };
            self.selection_end = Some(CellAddress { row, column: 30 });
            self.refresh_bars();
        }
        if let Some(address) = shift_clicked {
            self.selection_end = Some(address);
            self.refresh_bars();
        }
        if edit_finished {
            self.commit_edit();
        } else if edit_cancelled {
            self.editing_cell = false;
            self.refresh_bars();
        }
        if let Some(address) = clicked {
            self.select_cell(address);
        }
        if let Some(address) = drag_hovered {
            self.selection_end = Some(address);
            self.refresh_bars();
        }
        if start_edit {
            self.editing_cell = true;
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

    for row in range.iter_rows() {
        for col in range.iter_columns() {
            count += 1;
            let val = sheet.get(CellAddress { row, column: col });
            if let Some(n) = number_val(val) {
                sum += n;
                num_count += 1;
                min = min.min(n);
                max = max.max(n);
            }
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
