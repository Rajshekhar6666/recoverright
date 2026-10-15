import re
from pathlib import Path
from typing import Iterator, Optional

import pdfplumber
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.schemas.document import Block, SourceDocument
from app.schemas.events import Stage
from app.services.event_bus import bus

RawBlock = tuple[str, str, Optional[int]]  # (type, text, page)


def _clean(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text.replace("\xa0", " ")).strip()


def _iter_docx(path: Path) -> Iterator[RawBlock]:
    doc = Document(str(path))
    for child in doc.element.body.iterchildren():  # keeps paragraphs and tables in order
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, doc)
            text = _clean(p.text)
            if not text:
                continue
            style = (p.style.name if p.style is not None else "") or ""
            ppr = p._p.pPr
            if style.startswith("Heading") or style == "Title":
                yield ("heading", text, None)
            elif "List" in style or (ppr is not None and ppr.numPr is not None):
                yield ("list_item", text, None)
            else:
                yield ("paragraph", text, None)
        elif tag == "tbl":
            table = Table(child, doc)
            for row in table.rows:
                cells: list[str] = []
                for cell in row.cells:
                    t = _clean(cell.text)
                    if t and (not cells or cells[-1] != t):  # merged cells repeat text
                        cells.append(t)
                if cells:
                    yield ("table_row", " | ".join(cells), None)


def _iter_pdf(path: Path) -> Iterator[RawBlock]:
    with pdfplumber.open(str(path)) as pdf:
        for page_no, page in enumerate(pdf.pages, 1):
            for line in (page.extract_text() or "").splitlines():
                line = _clean(line)
                if not line:
                    continue
                if re.match(r"^([-*\u2022]|\d+[.)])\s+", line):
                    yield ("list_item", line, page_no)
                elif line.isupper() and len(line) <= 60:
                    yield ("heading", line, page_no)
                else:
                    yield ("paragraph", line, page_no)


def parse_document(path: str | Path, run_id: Optional[str] = None) -> SourceDocument:
    path = Path(path)

    def emit(type_: str, payload: dict | None = None) -> None:
        if run_id:
            bus.emit(run_id, Stage.PARSE, type_, payload)

    emit("parse.started", {"filename": path.name})
    ext = path.suffix.lower()
    if ext == ".docx":
        raw = list(_iter_docx(path))
    elif ext == ".pdf":
        raw = list(_iter_pdf(path))
    else:
        emit("parse.failed", {"reason": f"unsupported file type {ext}"})
        raise ValueError(f"Unsupported file type: {ext} (use .docx or .pdf)")

    if not raw:
        emit("parse.failed", {"reason": "no text found (scanned PDF? OCR needed)"})
        raise ValueError("No text found. If this is a scanned file, OCR is required.")

    blocks: list[Block] = []
    for i, (btype, text, page) in enumerate(raw, 1):
        block = Block(block_id=f"b{i}", type=btype, page=page, text=text)
        blocks.append(block)
        emit("parse.block", {"block_id": block.block_id, "type": btype, "preview": text[:80]})

    emit("parse.done", {"blocks": len(blocks)})
    return SourceDocument(filename=path.name, blocks=blocks)