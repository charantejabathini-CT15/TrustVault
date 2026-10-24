"""Firestore document repository and FastAPI dependency."""

import enum
from typing import Generator, Iterable, Optional, TypeVar

from sqlalchemy.orm import DeclarativeBase
from google.cloud.firestore_v1.base_query import FieldFilter

from app.core.firebase import get_firestore_client

T = TypeVar("T")


class Base(DeclarativeBase):
    """Metadata base retained for model definitions and isolated test adapters."""


def _document_id(model, record) -> str:
    if model.__tablename__ == "audit_events":
        return f"{record.org_id}_{record.sequence_number:020d}"
    if model.__tablename__ == "audit_chain_state":
        return str(record.org_id)
    primary_key = next(iter(model.__table__.primary_key.columns))
    return str(getattr(record, primary_key.name))


class FirestoreStore:
    """Small Firestore repository shared by route and service layers."""

    def __init__(self, client=None):
        self.client = client or get_firestore_client()

    def _collection(self, model):
        return self.client.collection(model.__tablename__)

    @staticmethod
    def _serialize(record) -> dict:
        data = {}
        for column in record.__table__.columns:
            value = getattr(record, column.name, None)
            if value is None and column.default is not None:
                default = column.default.arg
                value = default(None) if callable(default) else default
                setattr(record, column.name, value)
            if isinstance(value, enum.Enum):
                value = value.value
            data[column.name] = value
        return data

    @staticmethod
    def _deserialize(model, snapshot):
        data = snapshot.to_dict() or {}
        for column in model.__table__.columns:
            enum_type = getattr(column.type, "enum_class", None)
            value = data.get(column.name)
            if enum_type and value is not None and not isinstance(value, enum_type):
                data[column.name] = enum_type(value)
        return model(**data)

    def get(self, model, document_id: str):
        snapshot = self._collection(model).document(str(document_id)).get()
        return self._deserialize(model, snapshot) if snapshot.exists else None

    def find(
        self,
        model,
        filters: Optional[dict] = None,
        *,
        predicate=None,
        order_by: Optional[str] = None,
        descending: bool = False,
        offset: int = 0,
        limit: Optional[int] = None,
    ) -> list:
        query = self._collection(model)
        remaining_filters = dict(filters or {})
        if remaining_filters:
            field_name, field_value = remaining_filters.popitem()
            if isinstance(field_value, enum.Enum):
                field_value = field_value.value
            query = query.where(filter=FieldFilter(field_name, "==", field_value))

        records = [self._deserialize(model, snapshot) for snapshot in query.stream()]
        for field_name, expected in remaining_filters.items():
            if isinstance(expected, enum.Enum):
                expected = expected.value
            records = [
                record for record in records
                if getattr(record, field_name) == expected
            ]
        if predicate:
            records = [record for record in records if predicate(record)]
        if order_by:
            records.sort(key=lambda record: getattr(record, order_by) or 0, reverse=descending)
        if offset:
            records = records[offset:]
        if limit is not None:
            records = records[:limit]
        return records

    def first(self, model, filters: Optional[dict] = None, *, predicate=None):
        records = self.find(model, filters, predicate=predicate, limit=1)
        return records[0] if records else None

    def add(self, record):
        self.save(record)
        return record

    def add_all(self, records: Iterable) -> None:
        for record in records:
            self.save(record)

    def save(self, record):
        model = type(record)
        self._collection(model).document(_document_id(model, record)).set(self._serialize(record))
        return record

    def delete(self, record_or_model, document_id: Optional[str] = None) -> None:
        if document_id is None:
            record = record_or_model
            model = type(record)
            document_id = _document_id(model, record)
        else:
            model = record_or_model
        self._collection(model).document(str(document_id)).delete()

    def delete_where(self, model, filters: Optional[dict] = None, *, predicate=None) -> int:
        records = self.find(model, filters, predicate=predicate)
        for record in records:
            self.delete(record)
        return len(records)

    def count(self, model, filters: Optional[dict] = None, *, predicate=None) -> int:
        return len(self.find(model, filters, predicate=predicate))

    def flush(self) -> None:
        return None

    def commit(self) -> None:
        return None


def get_db() -> Generator[FirestoreStore, None, None]:
    yield FirestoreStore()