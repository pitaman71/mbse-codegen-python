"""mbse-codegen-python: schemas as Python source and back.

mbse-schemas' schemas are rendered as Python dataclasses through mbse-programs' Python syntax trees, step by step with
mbse-patterns' transforms, and Python source is read back into schemas (`Types`; see docs/CODEGEN.md at
https://github.com/pitaman71/mbse-codegen-python).

For AI agents: read `skill/SKILL.md` next to this file first. It says when to use this package and how.
"""

from . import Types

__all__ = ["Types"]
