"""mbse-codegen-python: schemas as Python source and back.

mbse-schemas' schemas are rendered as Python dataclasses through mbse-programs' Python syntax trees, step by step with
mbse-patterns' transforms, and Python source is read back into schemas (`Types`; see mbse-basis
[CAP-027: Python3 source generated from schemas](../../../../../mbse-basis/docs/capabilities/CAP-027.md)).

For AI agents: read `skill/SKILL.md` next to this file first. It says when to use this package and how.
"""

from . import Types

__all__ = ["Types"]
