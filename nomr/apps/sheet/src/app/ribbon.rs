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
        self.render_document_header(ctx);
        self.render_document_tabs(ctx);
        if self.active_ribbon_tab == RibbonTab::File {
            self.render_reference_file(ctx);
        } else {
            egui::TopBottomPanel::top("docs-ribbon").frame(frame()).show(ctx, |ui| {
                ScrollArea::horizontal()
                    .id_salt("ribbon-scroll")
                    .auto_shrink([false, true])
                    .show(ui, |ui| {
                        ui.horizontal(|ui| match self.active_ribbon_tab {
                            RibbonTab::File => {}
                            RibbonTab::Home | RibbonTab::Review => {
                                group(ui, |ui| {
                                    ui.horizontal(|ui| {
                                        if icons::button(ui, Icon::Paste, "Dán · Ctrl+V", Some("Dán"), false) {
                                            self.request_clipboard_paste(ctx);
                                        }
                                        if icons::button(ui, Icon::Cut, "Cắt · Ctrl+X", Some("Cắt"), false) {
                                            self.cut_to_clipboard(ctx);
                                        }
                                        if icons::button(ui, Icon::Copy, "Sao chép · Ctrl+C", Some("Sao chép"), false)
                                        {
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
                                        if icons::button(ui, Icon::Italic, "In nghiêng · Ctrl+I", None, style.italic)
                                        {
                                            self.apply_style_to_selection("In nghiêng", |s| s.italic = !style.italic);
                                        }
                                        if icons::button(
                                            ui,
                                            Icon::Underline,
                                            "Gạch chân · Ctrl+U",
                                            None,
                                            style.underline,
                                        ) {
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
                                if icons::button(ui, Icon::Delete, "Xóa nội dung vùng chọn", Some("Xóa ô"), false)
                                {
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
                                    ui.label("Nom Sheet · Trợ giúp");
                                    ui.label("Ctrl+N: mới · Ctrl+O: mở · Ctrl+S: lưu · F2: sửa ô");
                                    if ui.button("Các tính năng hiện hỗ trợ").clicked() {
                                        self.show_capabilities = true;
                                    }
                                });
                            }
                        });
                    });
            });
        }
        if self.show_capabilities {
            egui::Window::new("Tính năng Nom Sheet").open(&mut self.show_capabilities).show(ctx,|ui|{
                ui.label("Đã có: XLSX/CSV, công thức, nhiều trang tính, định dạng chữ/số, biểu đồ, sắp xếp, tìm/thay thế, clipboard, Undo/Redo cho ô và bản in qua trình duyệt.");
                ui.separator();
                ui.label("Chưa có: đồng biên tập trực tuyến, chia sẻ Google Drive, Apps Script, pivot table, bộ lọc, gộp ô, xác thực dữ liệu, định dạng có điều kiện, phân trang/in PDF tích hợp và toàn bộ hàm Google Sheets.");
            });
        }
    }

    pub(super) fn render_formula_bar(&mut self, ctx: &Context) {
        self.render_reference_formula(ctx);
    }

    pub(super) fn render_bottom(&mut self, ctx: &Context) {
        self.render_reference_footer(ctx);
    }

    pub(super) fn add_sheet(&mut self) {
        let mut number = 1;
        while self
            .workbook
            .sheets
            .iter()
            .any(|sheet| sheet.name == format!("Trang tính{number}"))
        {
            number += 1;
        }
        self.workbook.active_sheet = self.workbook.add_sheet(&format!("Trang tính{number}"));
        self.workbook.dirty = true;
        self.grid_scroll = Vec2::ZERO;
        self.grid_columns = 26;
        self.grid_rows = 1000;
        self.select_cell(CellAddress { row: 1, column: 1 });
    }
}
