use super::appearance::BLUE;
use super::icons::{self, Icon};
use super::*;

fn frame() -> egui::Frame {
    egui::Frame::none()
        .fill(Color32::WHITE)
        .inner_margin(egui::Margin::symmetric(8.0, 3.0))
}
fn group(ui: &mut Ui, content: impl FnOnce(&mut Ui)) {
    ui.vertical(|ui| {
        ui.set_min_height(54.0);
        content(ui);
    });
    let (rect, _) = ui.allocate_exact_size(Vec2::new(1.0, 50.0), egui::Sense::hover());
    ui.painter().line_segment(
        [rect.center_top(), rect.center_bottom()],
        Stroke::new(1.0_f32, RIBBON_BORDER),
    );
}

impl NomSheetApp {
    pub(super) fn render_chrome(&mut self, ctx: &Context) {
        egui::TopBottomPanel::top("docs-header").frame(frame()).show(ctx, |ui| {
            ui.horizontal(|ui| {
                let (logo, _) = ui.allocate_exact_size(Vec2::new(48.0, 28.0), egui::Sense::hover());
                ui.painter().rect_filled(
                    logo.shrink2(Vec2::new(0.0, 3.0)),
                    Rounding::same(2.0),
                    Color32::from_rgb(196, 74, 37),
                );
                ui.painter().text(
                    logo.center(),
                    Align2::CENTER_CENTER,
                    "Nôm",
                    egui::FontId::new(13.0, FontFamily::Name("Segoe UI-1".into())),
                    Color32::WHITE,
                );
                if icons::button(ui, Icon::Save, "Lưu · Ctrl+S", None, false) {
                    self.save_path();
                }
                if icons::button(ui, Icon::Undo, "Hoàn tác · Ctrl+Z", None, false) {
                    self.undo();
                }
                if icons::button(ui, Icon::Redo, "Làm lại · Ctrl+Y", None, false) {
                    self.redo();
                }
                let title = self
                    .workbook
                    .file_path
                    .as_ref()
                    .and_then(|p| p.file_name())
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "Bảng tính không có tiêu đề".into());
                ui.add_sized(
                    [ui.available_width().min(400.0).max(160.0), 28.0],
                    egui::Label::new(
                        RichText::new(format!("{title}{}", if self.workbook.dirty { " *" } else { "" })).size(13.0),
                    )
                    .truncate(),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if icons::button(ui, Icon::Search, "Tìm trong bảng tính · Ctrl+F", None, false) {
                        self.show_find_dialog = true;
                    }
                    let search = ui.add_sized(
                        [ui.available_width().min(260.0).max(80.0), 27.0],
                        egui::TextEdit::singleline(&mut self.find_query)
                            .hint_text("Tìm kiếm")
                            .background_color(Color32::WHITE),
                    );
                    self.search_is_focused = search.has_focus();
                    if search.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                        self.find_next();
                    }
                });
            });
        });
        egui::TopBottomPanel::top("docs-tabs").frame(frame()).show(ctx, |ui| {
            ui.horizontal(|ui| {
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
                    let active = self.active_ribbon_tab == tab;
                    let response = ui.add(
                        egui::Button::new(RichText::new(label).size(12.0).color(if active {
                            BLUE
                        } else {
                            RIBBON_MUTED
                        }))
                        .frame(false)
                        .min_size(Vec2::new(0.0, 28.0)),
                    );
                    if active {
                        ui.painter().line_segment(
                            [response.rect.left_bottom(), response.rect.right_bottom()],
                            Stroke::new(2.0_f32, BLUE),
                        );
                    }
                    if response.clicked() {
                        self.active_ribbon_tab = tab;
                    }
                }
            });
        });
        egui::TopBottomPanel::top("docs-ribbon").frame(frame()).show(ctx, |ui| {
            ScrollArea::horizontal()
                .id_salt("ribbon-scroll")
                .auto_shrink([false, true])
                .show(ui, |ui| {
                    ui.horizontal(|ui| match self.active_ribbon_tab {
                        RibbonTab::File => {
                            if icons::button(ui, Icon::New, "Bảng tính mới · Ctrl+N", Some("Mới"), false) {
                                self.request_new();
                            }
                            if icons::button(ui, Icon::Open, "Mở .xlsx / .csv · Ctrl+O", Some("Mở tệp"), false) {
                                self.choose_open_file();
                            }
                            if icons::button(ui, Icon::Save, "Lưu · Ctrl+S", Some("Lưu"), false) {
                                self.save_path();
                            }
                            if icons::button(ui, Icon::Save, "Chọn vị trí và định dạng lưu", Some("Lưu thành"), false)
                            {
                                self.choose_save_file();
                            }
                            ui.vertical(|ui| {
                                ui.label("Đường dẫn tệp");
                                let r = ui.add_sized(
                                    [380.0, 26.0],
                                    egui::TextEdit::singleline(&mut self.path_buffer)
                                        .hint_text("Mở hoặc lưu tệp XLSX / CSV"),
                                );
                                self.path_is_focused = r.has_focus();
                            });
                        }
                        RibbonTab::Home | RibbonTab::Review => {
                            group(ui, |ui| {
                                ui.horizontal(|ui| {
                                    if icons::button(ui, Icon::Paste, "Dán · Ctrl+V", Some("Dán"), false) {
                                        self.request_clipboard_paste(ctx);
                                    }
                                    if icons::button(ui, Icon::Cut, "Cắt · Ctrl+X", Some("Cắt"), false) {
                                        self.cut_to_clipboard(ctx);
                                    }
                                    if icons::button(ui, Icon::Copy, "Sao chép · Ctrl+C", Some("Sao chép"), false) {
                                        self.copy_to_clipboard(ctx);
                                    }
                                });
                            });
                            let style = self
                                .workbook
                                .active()
                                .get_style(self.selected)
                                .cloned()
                                .unwrap_or_default();
                            group(ui, |ui| {
                                ui.horizontal(|ui| {
                                    let mut family = style.font_family.clone();
                                    egui::ComboBox::from_id_salt("cell-font")
                                        .width(110.0)
                                        .selected_text(&family)
                                        .show_ui(ui, |ui| {
                                            for name in ["Arial", "Segoe UI", "Times New Roman", "Calibri"] {
                                                ui.selectable_value(&mut family, name.to_owned(), name);
                                            }
                                        });
                                    if family != style.font_family {
                                        self.apply_style_to_selection("Phông chữ", |s| {
                                            s.font_family = family.clone()
                                        });
                                    }
                                    let mut size = style.font_size;
                                    if ui
                                        .add(egui::DragValue::new(&mut size).range(6..=96).speed(1))
                                        .on_hover_text("Cỡ chữ (pt)")
                                        .changed()
                                    {
                                        self.apply_style_to_selection("Cỡ chữ", |s| s.font_size = size);
                                    }
                                });
                                ui.horizontal(|ui| {
                                    if icons::button(ui, Icon::Bold, "In đậm · Ctrl+B", None, style.bold) {
                                        self.apply_style_to_selection("In đậm", |s| s.bold = !style.bold);
                                    }
                                    if icons::button(ui, Icon::Italic, "In nghiêng · Ctrl+I", None, style.italic) {
                                        self.apply_style_to_selection("In nghiêng", |s| s.italic = !style.italic);
                                    }
                                    if icons::button(ui, Icon::Underline, "Gạch chân · Ctrl+U", None, style.underline)
                                    {
                                        self.apply_style_to_selection("Gạch chân", |s| {
                                            s.underline = !style.underline
                                        });
                                    }
                                    if icons::button(ui, Icon::Strike, "Gạch ngang", None, style.strikethrough) {
                                        self.apply_style_to_selection("Gạch ngang", |s| {
                                            s.strikethrough = !style.strikethrough
                                        });
                                    }
                                });
                            });
                            group(ui, |ui| {
                                ui.horizontal(|ui| {
                                    for (icon, align, title) in [
                                        (Icon::Left, CellAlign::Left, "Căn trái"),
                                        (Icon::Center, CellAlign::Center, "Căn giữa"),
                                        (Icon::Right, CellAlign::Right, "Căn phải"),
                                    ] {
                                        if icons::button(ui, icon, title, Some(title), style.align == align) {
                                            self.apply_style_to_selection(title, |s| s.align = align);
                                        }
                                    }
                                });
                            });
                            group(ui, |ui| {
                                ui.horizontal(|ui| {
                                    for background in [false, true] {
                                        ui.menu_button(if background { "Tô nền" } else { "Màu chữ" }, |ui| {
                                            for (color, name) in [
                                                ([32, 33, 36], "Đen"),
                                                ([26, 115, 232], "Xanh dương"),
                                                ([24, 128, 56], "Xanh lá"),
                                                ([217, 48, 37], "Đỏ"),
                                                ([255, 242, 204], "Vàng nhạt"),
                                                ([255, 255, 255], "Trắng"),
                                            ] {
                                                if ui
                                                    .add(
                                                        egui::Button::new(name)
                                                            .fill(Color32::from_rgb(color[0], color[1], color[2]))
                                                            .min_size(Vec2::new(100.0, 22.0)),
                                                    )
                                                    .clicked()
                                                {
                                                    self.apply_style_to_selection(name, |s| {
                                                        if background {
                                                            s.bg_color = Some(color)
                                                        } else {
                                                            s.text_color = Some(color)
                                                        }
                                                    });
                                                    ui.close_menu();
                                                }
                                            }
                                        });
                                    }
                                });
                                let mut format = style.num_format;
                                egui::ComboBox::from_id_salt("number-format")
                                    .width(130.0)
                                    .selected_text(match format {
                                        NumFormat::General => "Tổng quát",
                                        NumFormat::Number => "Số",
                                        NumFormat::Currency => "Tiền tệ",
                                        NumFormat::Percentage => "Phần trăm",
                                        NumFormat::Date => "Ngày",
                                    })
                                    .show_ui(ui, |ui| {
                                        for (f, n) in [
                                            (NumFormat::General, "Tổng quát"),
                                            (NumFormat::Number, "Số"),
                                            (NumFormat::Currency, "Tiền tệ"),
                                            (NumFormat::Percentage, "Phần trăm"),
                                            (NumFormat::Date, "Ngày"),
                                        ] {
                                            ui.selectable_value(&mut format, f, n);
                                        }
                                    });
                                if format != style.num_format {
                                    self.apply_style_to_selection("Định dạng số", |s| s.num_format = format);
                                }
                            });
                            if icons::button(ui, Icon::Search, "Tìm và thay thế", Some("Tìm kiếm"), false) {
                                self.show_find_dialog = true;
                            }
                        }
                        RibbonTab::Insert => {
                            for (title, kind) in [
                                ("Cột", ChartType::Column),
                                ("Đường", ChartType::Line),
                                ("Thanh", ChartType::Bar),
                                ("Tròn", ChartType::Pie),
                            ] {
                                if icons::button(ui, Icon::Chart, title, Some(title), false) {
                                    self.chart = Some(ChartItem {
                                        title: format!("Biểu đồ {title}"),
                                        chart_type: kind,
                                        range: self.selection_range(),
                                    });
                                }
                            }
                            if self.chart.is_some()
                                && icons::button(ui, Icon::Delete, "Đóng biểu đồ", Some("Đóng"), false)
                            {
                                self.chart = None;
                            }
                            if icons::button(ui, Icon::Add, "Thêm trang tính", Some("Trang tính"), false) {
                                self.add_sheet();
                            }
                        }
                        RibbonTab::Data => {
                            if icons::button(ui, Icon::Sort, "Sắp xếp tăng dần", Some("A - Z"), false) {
                                self.sort_selection(true);
                            }
                            if icons::button(ui, Icon::Sort, "Sắp xếp giảm dần", Some("Z - A"), false) {
                                self.sort_selection(false);
                            }
                            for (title, row, insert) in [
                                ("Chèn hàng", true, true),
                                ("Xóa hàng", true, false),
                                ("Chèn cột", false, true),
                                ("Xóa cột", false, false),
                            ] {
                                if icons::button(
                                    ui,
                                    if insert { Icon::Add } else { Icon::Delete },
                                    title,
                                    Some(title),
                                    false,
                                ) {
                                    let index = if row {
                                        self.selected.row
                                    } else {
                                        self.selected.column as u32
                                    };
                                    let sheet = self.workbook.active_mut();
                                    if row {
                                        if insert {
                                            sheet.insert_row(index);
                                        } else {
                                            sheet.delete_row(index);
                                        }
                                    } else if insert {
                                        sheet.insert_column(index as u16);
                                    } else {
                                        sheet.delete_column(index as u16);
                                    }
                                    self.workbook.dirty = true;
                                    self.refresh_bars();
                                }
                            }
                            if icons::button(ui, Icon::Delete, "Xóa nội dung vùng chọn", Some("Xóa ô"), false) {
                                self.clear_selection();
                            }
                        }
                        RibbonTab::Formulas => {
                            for function in ["SUM", "AVERAGE", "COUNT", "MIN", "MAX", "IF", "VLOOKUP", "ROUND"] {
                                if icons::button(ui, Icon::Formula, function, Some(function), false) {
                                    self.edit_buffer = format!("={function}(");
                                    self.formula_buffer = self.edit_buffer.clone();
                                    self.editing_cell = true;
                                    self.edit_focus_requested = true;
                                }
                            }
                        }
                        RibbonTab::View => {
                            if icons::button(
                                ui,
                                Icon::Grid,
                                "Ẩn / hiện đường lưới",
                                Some("Lưới"),
                                self.show_gridlines,
                            ) {
                                self.show_gridlines = !self.show_gridlines;
                            }
                            if ui.button("100%").clicked() {
                                self.zoom = 1.0;
                                self.reveal_selection = true;
                            }
                            ui.add(egui::Slider::new(&mut self.zoom, 0.5..=2.0).text("Thu phóng"));
                        }
                        _ => {
                            ui.vertical(|ui| {
                                ui.label("Nom Sheet · Native Rust / egui");
                                ui.label("Ctrl+N: mới · Ctrl+O: mở · Ctrl+S: lưu · F2: sửa ô");
                                if ui.button("Các tính năng hiện hỗ trợ").clicked() {
                                    self.show_capabilities = true;
                                }
                            });
                        }
                    });
                });
        });
        if self.show_capabilities {
            egui::Window::new("Tính năng Nom Sheet").open(&mut self.show_capabilities).show(ctx,|ui|{
                ui.label("Đã có: XLSX/CSV, công thức, nhiều trang tính, định dạng chữ/số, biểu đồ, sắp xếp, tìm/thay thế, clipboard và Undo/Redo cho ô.");
                ui.separator();
                ui.label("Chưa có: đồng biên tập trực tuyến, chia sẻ Google Drive, Apps Script, pivot table, bộ lọc, gộp ô, xác thực dữ liệu, định dạng có điều kiện, in/xuất PDF và toàn bộ hàm Google Sheets.");
            });
        }
    }

    pub(super) fn render_formula_bar(&mut self, ctx: &Context) {
        egui::TopBottomPanel::top("formula-bar")
            .frame(frame().stroke(Stroke::new(0.6_f32, RIBBON_BORDER)))
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    let name = ui.add_sized(
                        [88.0, 24.0],
                        egui::TextEdit::singleline(&mut self.name_box_buffer).frame(false),
                    );
                    self.name_box_is_focused = name.has_focus();
                    if name.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                        if let Ok(range) = CellRange::parse(&self.name_box_buffer) {
                            self.select_cell(range.start);
                            if range.start != range.end {
                                self.selection_end = Some(range.end);
                            }
                            self.refresh_bars();
                        }
                    }
                    ui.separator();
                    icons::draw(
                        ui.painter(),
                        Rect::from_min_size(ui.cursor().min, Vec2::splat(22.0)),
                        Icon::Formula,
                        RIBBON_MUTED,
                    );
                    ui.add_space(26.0);
                    let edit = ui.add_sized(
                        [ui.available_width(), 24.0],
                        egui::TextEdit::singleline(&mut self.formula_buffer)
                            .frame(false)
                            .hint_text("Nhập giá trị hoặc công thức"),
                    );
                    self.formula_is_focused = edit.has_focus();
                    if edit.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                        self.edit_buffer = self.formula_buffer.clone();
                        self.commit_edit();
                    }
                });
            });
    }

    pub(super) fn render_bottom(&mut self, ctx: &Context) {
        egui::TopBottomPanel::bottom("sheet-status")
            .frame(frame())
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.add(egui::Label::new(RichText::new(&self.status).size(10.5).color(RIBBON_MUTED)).truncate())
                        .on_hover_text(&self.status);
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.label(format!("{}%", (self.zoom * 100.0).round() as u32));
                        if ui.small_button("+").clicked() {
                            self.zoom = (self.zoom + 0.1).min(2.0);
                        }
                        if ui.small_button("-").clicked() {
                            self.zoom = (self.zoom - 0.1).max(0.5);
                        }
                        let range = self.selection_range();
                        if range.cell_count() > 1 {
                            let (count, sum, avg, _, _) = calculate_selection_stats(self.workbook.active(), range);
                            ui.label(format!("Ô có dữ liệu: {count}"));
                            if let Some(s) = sum {
                                ui.label(format!("Tổng: {s:.2}"));
                            }
                            if let Some(a) = avg {
                                ui.label(format!("TB: {a:.2}"));
                            }
                        }
                    });
                });
            });
        egui::TopBottomPanel::bottom("sheet-tabs")
            .frame(frame().stroke(Stroke::new(0.6_f32, RIBBON_BORDER)))
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    if icons::button(ui, Icon::Add, "Thêm trang tính", None, false) {
                        self.add_sheet();
                    }
                    let mut select = None;
                    for (index, sheet) in self.workbook.sheets.iter().enumerate() {
                        let active = index == self.workbook.active_sheet;
                        let r = ui.add(
                            egui::Button::new(RichText::new(&sheet.name).color(if active {
                                BLUE
                            } else {
                                RIBBON_MUTED
                            }))
                            .frame(false)
                            .min_size(Vec2::new(80.0, 28.0)),
                        );
                        if active {
                            ui.painter().line_segment(
                                [r.rect.left_bottom(), r.rect.right_bottom()],
                                Stroke::new(2.0_f32, BLUE),
                            );
                        }
                        if r.clicked() {
                            select = Some(index);
                        }
                        if r.double_clicked() {
                            self.rename_sheet_idx = Some(index);
                            self.rename_sheet_buffer = sheet.name.clone();
                        }
                    }
                    if let Some(index) = select {
                        self.workbook.active_sheet = index;
                        self.grid_scroll = Vec2::ZERO;
                        self.select_cell(CellAddress { row: 1, column: 1 });
                    }
                });
            });
    }

    fn add_sheet(&mut self) {
        self.workbook.active_sheet = self.workbook.add_sheet("Sheet");
        self.workbook.dirty = true;
        self.grid_scroll = Vec2::ZERO;
        self.select_cell(CellAddress { row: 1, column: 1 });
    }
}
