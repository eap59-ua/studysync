# StudySync — Database Schema

## Entity-Relationship Diagram

```mermaid
erDiagram
    users ||--o{ rooms : "owns"
    users ||--o{ room_members : "joins"
    rooms ||--o{ room_members : "has"
    users ||--o{ notes : "creates"
    rooms ||--o{ notes : "contains"
    users ||--o{ note_reviews : "writes"
    notes ||--o{ note_reviews : "receives"

    users {
        uuid id PK
        varchar email UK
        varchar display_name
        varchar hashed_password
        boolean is_active
        timestamp created_at
    }

    rooms {
        uuid id PK
        varchar name
        varchar subject
        uuid owner_id FK
        integer max_members
        boolean is_public
        timestamp created_at
    }

    room_members {
        uuid room_id PK,FK
        uuid user_id PK,FK
        timestamp joined_at
    }

    notes {
        uuid id PK
        uuid owner_id FK
        uuid room_id FK
        varchar subject
        varchar title
        text description
        varchar file_url
        varchar file_type
        timestamp created_at
    }

    note_reviews {
        uuid id PK
        uuid note_id FK
        uuid reviewer_id FK
        integer rating
        varchar comment
        timestamp created_at
    }
```

## Ephemeral State (Redis)

| Key Pattern | Type | TTL | Description |
|-------------|------|-----|-------------|
| `presence:room:{room_id}` | Set | - | Set of connected user IDs |
| `pomodoro:{room_id}` | Hash | duration + 5s | Current Pomodoro state |
| `user:{user_id}:pomodoros_completed` | Integer | - | Lifetime Pomodoro count |
