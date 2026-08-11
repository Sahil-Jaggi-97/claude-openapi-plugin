from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

app = FastAPI(title="FastAPI sample")

api_key_header = APIKeyHeader(name="X-API-Key")


def require_api_key(api_key: str = Depends(api_key_header)):
    if api_key != "expected-secret-key":
        raise HTTPException(status_code=401, detail="Invalid API key")
    return api_key


class Item(BaseModel):
    name: str
    price: float


items: list[dict] = []


@app.get("/items")
def list_items():
    return items


@app.post("/items")
def create_item(item: Item):
    record = item.dict()
    record["id"] = len(items) + 1
    items.append(record)
    return record


@app.get("/items/{item_id}")
def get_item(item_id: int, api_key: str = Depends(require_api_key)):
    for item in items:
        if item["id"] == item_id:
            return item
    raise HTTPException(status_code=404, detail="Not found")


@app.post("/items/{item_id}/image")
def upload_item_image(
    item_id: int, file: UploadFile = File(...), api_key: str = Depends(require_api_key)
):
    return {"item_id": item_id, "filename": file.filename}
