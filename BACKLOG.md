# StudySync — Backlog & Known Limitations

## Known Limitations (MVP)

### Pomodoro: No recovery on backend restart

**Severity:** Medium  
**Component:** `PomodoroService` (asyncio rotation tasks)

When the backend process restarts, all in-memory asyncio tasks die. The Pomodoro state persists in Redis (TTL-protected), but the rotation tasks that advance phases are lost. After a restart:

- Clients that reconnect and call `get_state()` will see the last saved phase, but it won't auto-advance.
- The timer appears "frozen" until someone issues a new `pomodoro.start`.

**Mitigation for production:**
- On startup, scan Redis for `pomodoro:*` keys and re-schedule rotation tasks for any active timers, calculating the remaining delay from `started_at + duration - now`.
- Alternatively, use Redis keyspace notifications (pub/sub on key expiry) to trigger rotation externally.

**Priority:** Post-MVP. Acceptable for academic demo where restarts are rare.

---

## Future Improvements

- [ ] Configurable Pomodoro durations per room
- [ ] Pausable Pomodoro (pause/resume instead of binary start/stop)
- [ ] Cooperative Pomodoro start (any member, not just owner)
- [ ] Pomodoro history/logs persisted in PostgreSQL
- [ ] Recovery on backend restart (see above)
