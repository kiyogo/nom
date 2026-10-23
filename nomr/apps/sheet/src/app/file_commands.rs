//! File ribbon commands backed by real worksheet data.
use super::*;

fn html_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

impl NomSheetApp {
    pub(super) fn render_source_dialog(&mut self, ctx: &Context) {
        if !self.show_sheet_source {
            return;
        }
        let mut open = true;
        egui::Window::new("Dữ liệu nguồn CSV")
            .open(&mut open)
            .default_size([720.0, 480.0])
            .show(ctx, |ui| match nom_workbook::write_csv(self.workbook.active()) {
                Ok(source) => {
                    if ui.button("Sao chép CSV").clicked() {
                        ctx.copy_text(source.clone());
                    }
                    ScrollArea::both().show(ui, |ui| {
                        ui.add(egui::Label::new(RichText::new(source).monospace()).selectable(true));
                    });
                }
                Err(error) => {
                    ui.label(error.to_string());
                }
            });
        self.show_sheet_source = open;
    }

    pub(super) fn open_print_preview(&mut self) {
        let sheet = self.workbook.active();
        let range = sheet.used_range().unwrap_or(CellRange::new(
            CellAddress { row: 1, column: 1 },
            CellAddress { row: 1, column: 1 },
        ));
        if range.cell_count() > RANGE_CELL_LIMIT {
            self.status = "Vùng in vượt 100.000 ô. Hãy chọn vùng nhỏ hơn.".into();
            return;
        }
        let mut html=format!("<!doctype html><meta charset=\"utf-8\"><title>{}</title><style>body{{font:13px Arial;margin:24px}}table{{border-collapse:collapse}}td{{border:1px solid #ddd;min-width:80px;height:21px;padding:2px 5px;white-space:pre-wrap}}button{{margin-bottom:16px}}@media print{{button{{display:none}}}}</style><button onclick=\"window.print()\">In bảng tính</button><table>",html_text(&sheet.name));
        for row in range.start.row..=range.end.row {
            html.push_str("<tr>");
            for column in range.start.column..=range.end.column {
                let address = CellAddress { row, column };
                let style = sheet.get_style(address).cloned().unwrap_or_default();
                let text =
                    evaluate_cell(&self.workbook, self.workbook.active_sheet, address).format_display(style.num_format);
                html.push_str("<td>");
                html.push_str(&html_text(&text));
                html.push_str("</td>");
            }
            html.push_str("</tr>");
        }
        html.push_str("</table>");
        let path = std::env::temp_dir().join(format!("nom-sheet-print-{}.html", std::process::id()));
        let result = std::fs::write(&path, html).map_err(|e| e.to_string()).and_then(|_| {
            #[cfg(windows)]
            let result = std::process::Command::new("rundll32.exe")
                .arg("url.dll,FileProtocolHandler")
                .arg(&path)
                .spawn();
            #[cfg(not(windows))]
            let result = std::process::Command::new("xdg-open").arg(&path).spawn();
            result.map(|_| ()).map_err(|e| e.to_string())
        });
        self.status = match result {
            Ok(()) => "Đã mở bản in trong trình duyệt. Bấm In bảng tính để in hoặc lưu PDF.".into(),
            Err(e) => format!("Không mở được bản in: {e}"),
        };
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn print_values_remain_text_in_html() {
        assert_eq!(
            super::html_text("<script>\"x\" & y</script>"),
            "&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;"
        );
    }
}
