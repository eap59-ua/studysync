"""Pomodoro session domain entity — server-authoritative timer logic."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4


# ── Constants ─────────────────────────────────────────────────
FOCUS_SECONDS = 25 * 60          # 25 minutes
SHORT_BREAK_SECONDS = 5 * 60     # 5 minutes
LONG_BREAK_SECONDS = 15 * 60     # 15 minutes
PHASES_PER_CYCLE = 8             # 4 focus + 3 short break + 1 long break


def phase_name(index: int) -> str:
    """Deterministic phase name from a flat index 0–7.

    Index 0: focus
    Index 1: short_break
    Index 2: focus
    Index 3: short_break
    Index 4: focus
    Index 5: short_break
    Index 6: focus  (4th focus)
    Index 7: long_break
    """
    if index == 7:
        return "long_break"
    if index % 2 == 0:
        return "focus"
    return "short_break"


def phase_duration(index: int) -> int:
    """Duration in seconds for a given phase index."""
    name = phase_name(index)
    if name == "focus":
        return FOCUS_SECONDS
    if name == "short_break":
        return SHORT_BREAK_SECONDS
    return LONG_BREAK_SECONDS


def next_phase_index(current: int) -> int:
    """Next phase index, wrapping back to 0 after 7."""
    return (current + 1) % PHASES_PER_CYCLE


def is_focus(index: int) -> bool:
    """Whether a phase index is a focus phase."""
    return phase_name(index) == "focus"


@dataclass
class PomodoroState:
    """Server-authoritative Pomodoro state stored in Redis."""

    phase: str
    started_at: datetime
    duration_seconds: int
    phase_index: int
    started_by: UUID

    @property
    def is_focus(self) -> bool:
        return self.phase == "focus"

    def seconds_remaining(self, now: datetime) -> float:
        """Calculate remaining seconds, server-side."""
        elapsed = (now - self.started_at).total_seconds()
        return max(0.0, self.duration_seconds - elapsed)

    def to_dict(self) -> dict:
        """Serialize for Redis storage and WS broadcast."""
        return {
            "phase": self.phase,
            "started_at": self.started_at.isoformat(),
            "duration_seconds": self.duration_seconds,
            "phase_index": self.phase_index,
            "started_by": str(self.started_by),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "PomodoroState":
        """Deserialize from Redis JSON."""
        return cls(
            phase=data["phase"],
            started_at=datetime.fromisoformat(data["started_at"]),
            duration_seconds=int(data["duration_seconds"]),
            phase_index=int(data["phase_index"]),
            started_by=UUID(data["started_by"]),
        )

    @classmethod
    def initial(cls, started_by: UUID, now: datetime) -> "PomodoroState":
        """Create initial focus state (phase_index=0)."""
        return cls(
            phase=phase_name(0),
            started_at=now,
            duration_seconds=phase_duration(0),
            phase_index=0,
            started_by=started_by,
        )
