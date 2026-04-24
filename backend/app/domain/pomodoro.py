"""Pomodoro session domain entity."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4


class PomodoroPhase(str, Enum):
    """Phases of a Pomodoro cycle."""

    IDLE = "idle"
    FOCUS = "focus"
    SHORT_BREAK = "short_break"
    LONG_BREAK = "long_break"


# Standard Pomodoro durations (in seconds)
FOCUS_DURATION = 25 * 60        # 25 minutes
SHORT_BREAK_DURATION = 5 * 60   # 5 minutes
LONG_BREAK_DURATION = 15 * 60   # 15 minutes
CYCLES_BEFORE_LONG_BREAK = 4    # After 4 focus sessions → long break


@dataclass
class PomodoroSession:
    """Server-authoritative Pomodoro state for a room."""

    room_id: UUID = field(default_factory=uuid4)
    phase: PomodoroPhase = PomodoroPhase.IDLE
    started_at: datetime | None = None
    duration_seconds: int = FOCUS_DURATION
    cycle_index: int = 0  # 0-based, tracks which focus session we're on

    @property
    def is_active(self) -> bool:
        return self.phase != PomodoroPhase.IDLE

    def next_phase(self) -> "PomodoroSession":
        """Calculate the next phase in the Pomodoro cycle."""
        if self.phase == PomodoroPhase.FOCUS:
            if (self.cycle_index + 1) >= CYCLES_BEFORE_LONG_BREAK:
                return PomodoroSession(
                    room_id=self.room_id,
                    phase=PomodoroPhase.LONG_BREAK,
                    duration_seconds=LONG_BREAK_DURATION,
                    cycle_index=0,
                )
            return PomodoroSession(
                room_id=self.room_id,
                phase=PomodoroPhase.SHORT_BREAK,
                duration_seconds=SHORT_BREAK_DURATION,
                cycle_index=self.cycle_index,
            )
        # After any break → next focus
        return PomodoroSession(
            room_id=self.room_id,
            phase=PomodoroPhase.FOCUS,
            duration_seconds=FOCUS_DURATION,
            cycle_index=self.cycle_index + 1 if self.phase == PomodoroPhase.SHORT_BREAK else 0,
        )
