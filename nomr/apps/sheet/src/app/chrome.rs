//! Reference geometry in logical pixels at 100% zoom.
//! Docs: title 42, tabs 32, ribbon top gap 6 + 82.
//! Sheets: formula 43, column header 24, row 21, column 101, gutter 44.
use super::chrome_icons::{self, ChromeIcon};
use super::*;

const DOC_BLUE: Color32 = Color32::from_rgb(15, 108, 189);
const SHEET_BLUE: Color32 = Color32::from_rgb(11, 87, 208);
const TEXT: Color32 = Color32::from_rgb(85, 85, 85);

fn area(ui: &Ui, rect: Rect, id: impl std::hash::Hash, tooltip: &str) -> egui::Response {
    ui.interact(rect, ui.id().with(id), egui::Sense::click())
        .on_hover_text(tooltip)
}

impl NomSheetApp {
    pub(super) fn render_window_resize(&self, ctx: &Context) {
        if ctx.input(|input| input.viewport().maximized.unwrap_or(false)) {
            return;
        }
        let screen = ctx.screen_rect();
        let size = screen.size();
        for (index, offset, dimensions, direction, cursor) in [
            (
                0,
                Vec2::ZERO,
                Vec2::splat(6.0),
                egui::ResizeDirection::NorthWest,
                egui::CursorIcon::ResizeNwSe,
            ),
            (
                1,
                Vec2::new(size.x - 6.0, 0.0),
                Vec2::splat(6.0),
                egui::ResizeDirection::NorthEast,
                egui::CursorIcon::ResizeNeSw,
            ),
            (
                2,
                Vec2::new(0.0, size.y - 6.0),
                Vec2::splat(6.0),
                egui::ResizeDirection::SouthWest,
                egui::CursorIcon::ResizeNeSw,
            ),
            (
                3,
                size - Vec2::splat(6.0),
                Vec2::splat(6.0),
                egui::ResizeDirection::SouthEast,
                egui::CursorIcon::ResizeNwSe,
            ),
            (
                4,
                Vec2::new(6.0, 0.0),
                Vec2::new(size.x - 12.0, 3.0),
                egui::ResizeDirection::North,
                egui::CursorIcon::ResizeVertical,
            ),
            (
                5,
                Vec2::new(6.0, size.y - 3.0),
                Vec2::new(size.x - 12.0, 3.0),
                egui::ResizeDirection::South,
                egui::CursorIcon::ResizeVertical,
            ),
            (
                6,
                Vec2::new(0.0, 6.0),
                Vec2::new(3.0, size.y - 12.0),
                egui::ResizeDirection::West,
                egui::CursorIcon::ResizeHorizontal,
            ),
            (
                7,
                Vec2::new(size.x - 3.0, 6.0),
                Vec2::new(3.0, size.y - 12.0),
                egui::ResizeDirection::East,
                egui::CursorIcon::ResizeHorizontal,
            ),
        ] {
            egui::Area::new(egui::Id::new(("window-resize", index)))
                .order(egui::Order::Foreground)
                .fixed_pos(screen.min + offset)
                .movable(false)
                .show(ctx, |ui| {
                    let (_, response) = ui.allocate_exact_size(dimensions, egui::Sense::drag());
                    if response.on_hover_cursor(cursor).drag_started() {
                        ctx.send_viewport_cmd(egui::ViewportCommand::BeginResize(direction));
                    }
                });
        }
    }

    pub(super) fn render_document_header(&mut self, ctx: &Context) {
        egui::TopBottomPanel::top("reference-title")
            .exact_height(42.0)
            .show_separator_line(false)
            .frame(egui::Frame::none().fill(Color32::WHITE))
            .show(ctx, |ui| {
                let r = ui.max_rect();
                let p = r.min;
                ui.painter().hline(
                    r.x_range(),
                    p.y + 0.5,
                    Stroke::new(1.0_f32, Color32::from_rgb(68, 71, 70)),
                );
                let rect = |x: f32, y: f32, w: f32, h: f32| Rect::from_min_size(p + Vec2::new(x, y), Vec2::new(w, h));
                let controls = r.width() - 132.0;
                let drag = ui.interact(
                    rect(184.0, 0.0, (controls - 184.0).max(0.0), 42.0),
                    ui.id().with("title-drag"),
                    egui::Sense::click_and_drag(),
                );
                if drag.drag_started() {
                    ctx.send_viewport_cmd(egui::ViewportCommand::StartDrag);
                }
                if drag.double_clicked() {
                    let maximized = ctx.input(|i| i.viewport().maximized.unwrap_or(false));
                    ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(!maximized));
                }
                ui.painter().rect_filled(
                    rect(11.0, 11.0, 48.0, 22.0),
                    Rounding::same(3.0),
                    Color32::from_rgb(201, 79, 42),
                );
                ui.painter().text(
                    p + Vec2::new(35.0, 22.0),
                    Align2::CENTER_CENTER,
                    "Nôm",
                    egui::FontId::new(12.0, FontFamily::Name("Segoe UI-1".into())),
                    Color32::WHITE,
                );
                for (index, icon, tip) in [
                    (0, ChromeIcon::Save, "Lưu · Ctrl+S"),
                    (1, ChromeIcon::Undo, "Hoàn tác · Ctrl+Z"),
                    (2, ChromeIcon::Redo, "Làm lại · Ctrl+Y"),
                ] {
                    let button = rect(68.0 + index as f32 * 32.0, 6.0, 32.0, 32.0);
                    chrome_icons::paint(
                        ui,
                        Rect::from_center_size(button.center(), Vec2::splat(16.0)),
                        icon,
                        Color32::from_gray(68),
                    );
                    if area(ui, button, ("quick", index), tip).clicked() {
                        match index {
                            0 => self.save_path(),
                            1 => self.undo(),
                            _ => self.redo(),
                        }
                    }
                }
                ui.painter().line_segment(
                    [p + Vec2::new(170.0, 21.0), p + Vec2::new(172.0, 23.0)],
                    Stroke::new(0.7_f32, TEXT),
                );
                ui.painter().line_segment(
                    [p + Vec2::new(172.0, 23.0), p + Vec2::new(174.0, 21.0)],
                    Stroke::new(0.7_f32, TEXT),
                );
                let title = self
                    .workbook
                    .file_path
                    .as_ref()
                    .and_then(|path| path.file_stem())
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "Bảng tính không có tiêu đề".to_owned());
                let title_clip = Rect::from_min_max(
                    p + Vec2::new(195.0, 0.0),
                    p + Vec2::new((controls - 10.0).min(744.0).max(195.0), 42.0),
                );
                ui.painter().with_clip_rect(title_clip).text(
                    p + Vec2::new(195.0, 22.0),
                    Align2::LEFT_CENTER,
                    format!("{title}{}", if self.workbook.dirty { " *" } else { "" }),
                    egui::FontId::new(12.0, FontFamily::Name("Segoe UI-Semibold".into())),
                    Color32::from_gray(31),
                );
                let search_x = 766.0_f32.min((controls - 220.0).max(400.0));
                let search_rect = rect(search_x, 7.0, (controls - search_x - 10.0).clamp(0.0, 360.0), 30.0);
                if search_rect.width() > 80.0 {
                    ui.painter().rect_stroke(
                        search_rect,
                        Rounding::same(6.0),
                        Stroke::new(0.5_f32, Color32::from_gray(242)),
                    );
                    chrome_icons::paint(
                        ui,
                        Rect::from_min_size(search_rect.min + Vec2::new(12.0, 8.0), Vec2::splat(14.0)),
                        ChromeIcon::Search,
                        Color32::from_gray(119),
                    );
                    let edit = ui.put(
                        search_rect.shrink2(Vec2::new(34.0, 6.0)),
                        egui::TextEdit::singleline(&mut self.find_query)
                            .font(egui::FontId::proportional(12.5))
                            .margin(Vec2::ZERO)
                            .frame(false)
                            .hint_text(RichText::new("Tìm kiếm").color(Color32::from_gray(153))),
                    );
                    self.search_is_focused = edit.has_focus();
                    if edit.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                        self.find_next();
                    }
                }
                for (index, label, tip) in [(0, "−", "Thu nhỏ"), (1, "□", "Phóng to / Khôi phục"), (2, "×", "Đóng")]
                {
                    let button = rect(controls + index as f32 * 44.0, 0.0, 44.0, 42.0);
                    ui.painter().text(
                        button.center(),
                        Align2::CENTER_CENTER,
                        label,
                        egui::FontId::proportional(if index == 2 { 20.0 } else { 16.0 }),
                        Color32::from_gray(31),
                    );
                    if area(ui, button, ("window", index), tip).clicked() {
                        match index {
                            0 => ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(true)),
                            1 => {
                                let m = ctx.input(|i| i.viewport().maximized.unwrap_or(false));
                                ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(!m));
                            }
                            _ => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
                        }
                    }
                }
            });
    }

    pub(super) fn render_document_tabs(&mut self, ctx: &Context) {
        egui::TopBottomPanel::top("reference-tabs")
            .exact_height(32.0)
            .show_separator_line(false)
            .frame(egui::Frame::none().fill(Color32::WHITE))
            .show(ctx, |ui| {
                let mut x = ui.max_rect().left() + 7.0;
                let y = ui.max_rect().top();
                ui.painter().hline(
                    ui.max_rect().x_range(),
                    y + 31.5,
                    Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)),
                );
                for (tab, label) in [
                    (RibbonTab::File, "Tệp"),
                    (RibbonTab::Home, "Trang chủ"),
                    (RibbonTab::Insert, "Chèn"),
                    (RibbonTab::Review, "Định dạng"),
                    (RibbonTab::Data, "Dữ liệu"),
                    (RibbonTab::Formulas, "Công thức"),
                    (RibbonTab::View, "Xem"),
                    (RibbonTab::Help, "Trợ giúp"),
                ] {
                    let font = egui::FontId::proportional(13.0);
                    let galley = ui.painter().layout_no_wrap(label.into(), font, TEXT);
                    let text_width = galley.size().x;
                    let r = Rect::from_min_size(Pos2::new(x, y), Vec2::new(text_width + 24.0, 32.0));
                    let active = self.active_ribbon_tab == tab;
                    ui.painter().text(
                        Pos2::new(x + 12.0, y + 18.0),
                        Align2::LEFT_CENTER,
                        label,
                        egui::FontId::proportional(13.0),
                        if active { DOC_BLUE } else { TEXT },
                    );
                    if active {
                        ui.painter().rect_filled(
                            Rect::from_min_max(Pos2::new(x + 8.0, y + 31.0), Pos2::new(r.right() - 8.0, y + 33.0)),
                            Rounding::ZERO,
                            DOC_BLUE,
                        );
                    }
                    if area(ui, r, ("tab", label), label).clicked() {
                        self.active_ribbon_tab = tab;
                    }
                    x = r.right();
                }
            });
    }

    pub(super) fn render_reference_file(&mut self, ctx: &Context) {
        egui::TopBottomPanel::top("reference-file")
            .exact_height(89.0)
            .frame(egui::Frame::none().fill(Color32::from_rgb(243, 245, 247)))
            .show(ctx, |ui| {
                let origin = ui.max_rect().min;
                ui.painter().rect_filled(
                    Rect::from_min_size(origin + Vec2::new(15.0, 0.0), Vec2::new(29.0, 1.0)),
                    Rounding::ZERO,
                    DOC_BLUE,
                );
                let ribbon = Rect::from_min_max(origin + Vec2::new(7.0, 6.0), ui.max_rect().max - Vec2::new(7.0, 0.0));
                ui.painter().rect_filled(ribbon, Rounding::ZERO, Color32::WHITE);
                let commands = [
                    (50.0, 24.0, ChromeIcon::Save, "Lưu"),
                    (112.0, 24.0, ChromeIcon::Download, "Tải .xlsx"),
                    (174.0, 24.0, ChromeIcon::Open, "Mở"),
                    (236.0, 24.0, ChromeIcon::Print, "In"),
                    (307.0, 20.0, ChromeIcon::Export, "Xuất CSV"),
                    (369.0, 20.0, ChromeIcon::Source, "Mã nguồn"),
                    (431.0, 20.0, ChromeIcon::Keyboard, "Phím tắt"),
                    (502.0, 20.0, ChromeIcon::New, "Mới"),
                ];
                for (index, (center, size, icon, label)) in commands.into_iter().enumerate() {
                    let center = origin + Vec2::new(center, 39.0);
                    chrome_icons::paint(
                        ui,
                        Rect::from_center_size(center, Vec2::splat(size)),
                        icon,
                        if index == 1 {
                            Color32::from_rgb(16, 185, 129)
                        } else if index == 5 || index == 6 {
                            TEXT
                        } else {
                            DOC_BLUE
                        },
                    );
                    ui.painter().text(
                        Pos2::new(center.x, origin.y + 63.0),
                        Align2::CENTER_CENTER,
                        label,
                        egui::FontId::proportional(10.0),
                        Color32::from_gray(51),
                    );
                    let r = Rect::from_center_size(Pos2::new(center.x, origin.y + 47.0), Vec2::new(54.0, 54.0));
                    if area(ui, r, ("file-command", index), label).clicked() {
                        match index {
                            0 => self.save_path(),
                            1 => self.choose_save_xlsx_file(),
                            2 => self.choose_open_file(),
                            3 => self.open_print_preview(),
                            4 => self.choose_save_csv_file(),
                            5 => self.show_sheet_source = true,
                            6 => self.show_capabilities = true,
                            _ => self.request_new(),
                        }
                    }
                }
                for x in [271.0, 466.0] {
                    ui.painter().rect_filled(
                        Rect::from_min_size(origin + Vec2::new(x, 22.0), Vec2::new(1.0, 52.0)),
                        Rounding::ZERO,
                        Color32::from_gray(229),
                    );
                }
            });
    }

    pub(super) fn render_reference_formula(&mut self, ctx: &Context) {
        egui::TopBottomPanel::top("reference-formula")
            .exact_height(43.0)
            .show_separator_line(false)
            .frame(egui::Frame::none().fill(Color32::WHITE))
            .show(ctx, |ui| {
                let p = ui.max_rect().min;
                ui.painter().rect_filled(
                    Rect::from_min_size(p, Vec2::new(ui.max_rect().width(), 15.0)),
                    Rounding::ZERO,
                    Color32::from_rgb(248, 250, 253),
                );
                let name = Rect::from_min_size(p + Vec2::new(5.0, 18.0), Vec2::new(94.0, 24.0));
                ui.painter()
                    .rect_filled(name, Rounding::same(3.0), Color32::from_rgb(239, 239, 239));
                let field = ui.put(
                    Rect::from_min_size(name.min + Vec2::new(8.0, 3.0), Vec2::new(67.0, 18.0)),
                    egui::TextEdit::singleline(&mut self.name_box_buffer)
                        .font(egui::FontId::new(12.0, FontFamily::Name("Arial-0".into())))
                        .margin(Vec2::ZERO)
                        .frame(false),
                );
                self.name_box_is_focused = field.has_focus();
                if field.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                    if let Ok(range) = CellRange::parse(&self.name_box_buffer) {
                        self.select_cell(range.start);
                        if range.start != range.end {
                            self.selection_end = Some(range.end);
                        }
                        self.refresh_bars();
                    }
                }
                ui.painter().add(egui::Shape::convex_polygon(
                    vec![
                        p + Vec2::new(85.0, 28.0),
                        p + Vec2::new(93.0, 28.0),
                        p + Vec2::new(89.0, 32.0),
                    ],
                    Color32::from_gray(80),
                    Stroke::NONE,
                ));
                ui.painter().text(
                    p + Vec2::new(124.0, 30.0),
                    Align2::CENTER_CENTER,
                    "fx",
                    egui::FontId::new(14.0, FontFamily::Name("Arial-3".into())),
                    Color32::from_gray(153),
                );
                let edit = ui.put(
                    Rect::from_min_max(p + Vec2::new(145.0, 18.0), ui.max_rect().max - Vec2::new(4.0, 1.0)),
                    egui::TextEdit::singleline(&mut self.formula_buffer)
                        .font(egui::FontId::new(12.0, FontFamily::Name("Arial-0".into())))
                        .margin(Vec2::new(3.0, 3.0))
                        .frame(false),
                );
                self.formula_is_focused = edit.has_focus();
                if edit.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                    self.edit_buffer = self.formula_buffer.clone();
                    self.commit_edit();
                }
            });
    }

    pub(super) fn render_reference_footer(&mut self, ctx: &Context) {
        egui::TopBottomPanel::bottom("reference-footer")
            .exact_height(39.0)
            .show_separator_line(false)
            .frame(egui::Frame::none().fill(Color32::from_rgb(248, 250, 253)))
            .show(ctx, |ui| {
                let r = ui.max_rect();
                let p = r.min;
                let add = Rect::from_min_size(p + Vec2::new(42.0, 0.0), Vec2::new(38.0, 38.0));
                ui.painter().text(
                    add.center(),
                    Align2::CENTER_CENTER,
                    "+",
                    egui::FontId::proportional(20.0),
                    Color32::from_gray(95),
                );
                if area(ui, add, "sheet-add", "Thêm trang tính").clicked() {
                    self.add_sheet();
                }
                let list = Rect::from_min_size(p + Vec2::new(82.0, 0.0), Vec2::new(38.0, 38.0));
                for y in [-3.0, 0.0, 3.0] {
                    ui.painter().line_segment(
                        [list.center() + Vec2::new(-6.0, y), list.center() + Vec2::new(6.0, y)],
                        Stroke::new(1.5_f32, Color32::from_gray(95)),
                    );
                }
                let mut select = None;
                let list_response = area(ui, list, "sheet-list", "Danh sách trang tính");
                let popup_id = ui.id().with("sheet-list-popup");
                if list_response.clicked() {
                    ui.memory_mut(|memory| memory.toggle_popup(popup_id));
                }
                egui::popup_above_or_below_widget(
                    ui,
                    popup_id,
                    &list_response,
                    egui::AboveOrBelow::Above,
                    egui::PopupCloseBehavior::CloseOnClickOutside,
                    |ui| {
                        for (index, sheet) in self.workbook.sheets.iter().enumerate() {
                            if ui.button(&sheet.name).clicked() {
                                select = Some(index);
                                ui.close_menu();
                                break;
                            }
                        }
                    },
                );
                let mut x = p.x + 132.0;
                for (index, sheet) in self.workbook.sheets.iter().enumerate() {
                    let active = index == self.workbook.active_sheet;
                    let width = ui
                        .painter()
                        .layout_no_wrap(sheet.name.clone(), egui::FontId::proportional(14.0), TEXT)
                        .size()
                        .x
                        + 44.0;
                    let tab = Rect::from_min_size(Pos2::new(x, p.y + 1.0), Vec2::new(width.max(122.0), 37.0));
                    if active {
                        ui.painter()
                            .rect_filled(tab, Rounding::ZERO, Color32::from_rgb(221, 227, 234));
                    }
                    ui.painter().text(
                        tab.left_center() + Vec2::new(12.0, 0.0),
                        Align2::LEFT_CENTER,
                        &sheet.name,
                        egui::FontId::new(
                            14.0,
                            FontFamily::Name(if active { "Arial-1" } else { "Arial-0" }.into()),
                        ),
                        if active { SHEET_BLUE } else { TEXT },
                    );
                    let c = tab.right_center() - Vec2::new(15.0, 0.0);
                    ui.painter().add(egui::Shape::convex_polygon(
                        vec![
                            c + Vec2::new(-4.0, -2.0),
                            c + Vec2::new(4.0, -2.0),
                            c + Vec2::new(0.0, 2.0),
                        ],
                        if active { SHEET_BLUE } else { TEXT },
                        Stroke::NONE,
                    ));
                    let response = area(ui, tab, ("sheet-tab", index), "Nhấp đúp để đổi tên");
                    if response.clicked() {
                        select = Some(index);
                    }
                    if response.double_clicked() {
                        self.rename_sheet_idx = Some(index);
                        self.rename_sheet_buffer = sheet.name.clone();
                    }
                    x = tab.right();
                }
                if let Some(index) = select {
                    self.workbook.active_sheet = index;
                    let end = self
                        .workbook
                        .active()
                        .used_range()
                        .map(|range| range.end)
                        .unwrap_or(CellAddress { row: 1, column: 1 });
                    self.grid_columns = end.column.max(26);
                    self.grid_rows = end.row.max(1000);
                    self.grid_scroll = Vec2::ZERO;
                    self.select_cell(CellAddress { row: 1, column: 1 });
                }
                if x + 170.0 < r.right() && (self.status != "Sẵn sàng" || self.selection_range().cell_count() > 1) {
                    let range = self.selection_range();
                    let message = if range.cell_count() > 1 {
                        let (count, sum, _, _, _) = calculate_selection_stats(self.workbook.active(), range);
                        format!("{count} ô · Tổng: {}", sum.unwrap_or_default())
                    } else {
                        self.status.clone()
                    };
                    ui.painter()
                        .with_clip_rect(Rect::from_min_max(
                            Pos2::new(x + 16.0, p.y),
                            r.max - Vec2::new(85.0, 0.0),
                        ))
                        .text(
                            Pos2::new(x + 16.0, p.y + 19.0),
                            Align2::LEFT_CENTER,
                            message,
                            egui::FontId::proportional(11.0),
                            Color32::from_gray(128),
                        );
                }
                ui.allocate_new_ui(
                    egui::UiBuilder::new().max_rect(Rect::from_min_size(
                        Pos2::new(r.right() - 72.0, p.y + 5.0),
                        Vec2::new(64.0, 28.0),
                    )),
                    |ui| {
                        egui::ComboBox::from_id_salt("footer-zoom")
                            .selected_text(format!("{}%", (self.zoom * 100.0).round() as u32))
                            .show_ui(ui, |ui| {
                                for zoom in [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] {
                                    if ui
                                        .selectable_value(&mut self.zoom, zoom, format!("{}%", (zoom * 100.0) as u32))
                                        .changed()
                                    {
                                        self.reveal_selection = true;
                                    }
                                }
                            });
                    },
                );
            });
    }
}
