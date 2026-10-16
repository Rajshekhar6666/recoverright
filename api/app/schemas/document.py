from typing import Literal, Optional

from pydantic import BaseModel


class Block(BaseModel):
    block_id: str
    type: Literal["heading", "paragraph", "table_row", "list_item"]
    page: Optional[int] = None
    text: str
    low_confidence: bool = False  # True for OCR output
    # table structure, only for type == "table_row"
    table_id: Optional[str] = None
    row_index: Optional[int] = None
    cells: Optional[list[str]] = None  # empty cells are kept so columns stay aligned


class SourceDocument(BaseModel):
    filename: str
    blocks: list[Block]

    def by_id(self) -> dict[str, Block]:
        return {b.block_id: b for b in self.blocks}
