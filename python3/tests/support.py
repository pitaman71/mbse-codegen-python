"""Shared helpers for the test notebooks. Each notebook runs in its own kernel and makes its own stores."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from mbse.Schemas.Framework import Proxies


@contextmanager
def raises(*errors: type[BaseException], match: str | None = None) -> Iterator[None]:
    """Asserts that the block raises one of `errors`, optionally with `match` in the message."""
    try:
        yield
    except errors as error:
        if match is not None and match not in str(error):
            raise AssertionError(f"expected {match!r} in {str(error)!r}") from error
        return
    raise AssertionError(f"expected one of {[e.__name__ for e in errors]}")


def native(name: str, kind: type = str) -> Any:
    """Property Spec for a native-typed property."""
    return lambda p: p.name(name).of(lambda t: t.as_native(kind))


def stocked(*schemas: Any) -> Proxies.OfStore:
    """A store of proxies that registers `schemas`."""
    store = Proxies.OfStore()
    for schema in schemas:
        store.register(schema)
    return store
