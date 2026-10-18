use crate::manifest::AppInfo;

pub fn get_default_catalog() -> Vec<AppInfo> {
    vec![
        AppInfo::new(
            "writer",
            "Writer (Docs)",
            "Office",
            "Soạn thảo văn bản chuyên nghiệp, tương thích Word (.docx)",
            "1.0.0",
            28.4,
            "nom-writer",
        ),
        AppInfo::new(
            "sheet",
            "Sheet",
            "Office",
            "Bảng tính và công thức tính toán, tương thích Excel (.xlsx)",
            "1.0.0",
            9.6,
            "nom-sheet",
        ),
        AppInfo::new(
            "slide",
            "Slide",
            "Office",
            "Thiết kế thuyết trình và hiệu ứng trình chiếu (.pptx)",
            "1.0.0",
            22.6,
            "nom-slide",
        ),
        AppInfo::new(
            "pdf",
            "PDF",
            "Office",
            "Đọc, điền biểu mẫu AcroForms và ký số tài liệu PDF",
            "1.0.0",
            18.2,
            "nom-pdf",
        ),
        AppInfo::new(
            "markdown",
            "Markdown",
            "Editor",
            "Soạn thảo văn bản Markdown với bộ xem trước trực quan song song",
            "1.0.0",
            9.5,
            "nom-markdown",
        ),
        AppInfo::new(
            "html",
            "HTML",
            "Editor",
            "Trình biên tập trực quan HTML (WYSIWYG) và thanh tra giao diện",
            "1.0.0",
            11.0,
            "nom-html",
        ),
    ]
}
