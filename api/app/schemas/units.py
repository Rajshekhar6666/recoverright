from typing import Literal, Optional

from pydantic import BaseModel


class Unit(BaseModel):
    """The smallest piece of text the models are allowed to point at."""
    unit_id: str
    block_id: str
    kind: Literal["sentence", "cell", "heading"]
    text: str
    section: Optional[str] = None      # nearest heading above this unit
    table_id: Optional[str] = None
    row_index: Optional[int] = None
    col_index: Optional[int] = None
    col_header: Optional[str] = None   # canonical header: name, dose, frequency...
